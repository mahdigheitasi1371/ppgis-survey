"""Generic survey-builder API layered alongside the original LiFRES survey.

The existing project keeps its legacy ``responses`` table. This module adds
new generic survey tables so survey definitions and answers can evolve without
schema migrations for every new question.
"""
from __future__ import annotations

import csv
import io
import json
import os
import re
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, Header, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "data.db"
UPLOAD_DIR = BASE_DIR / "survey_uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
ADMIN_KEY = os.environ.get("ADMIN_KEY", "changeme")
MAX_MEDIA_BYTES = 25 * 1024 * 1024
ALLOWED_MEDIA_PREFIXES = ("image/", "audio/", "video/")
ALLOWED_MEDIA_TYPES = {"application/pdf"}
SLUG_RE = re.compile(r"[^a-z0-9-]+")

router = APIRouter()
db = sqlite3.connect(DB_PATH, check_same_thread=False)
db.row_factory = sqlite3.Row

db.executescript(
    """
    CREATE TABLE IF NOT EXISTS surveys (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft',
        definition_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        published_at TEXT
    );

    CREATE TABLE IF NOT EXISTS survey_responses (
        id TEXT PRIMARY KEY,
        survey_id TEXT NOT NULL,
        submitted_at TEXT NOT NULL,
        answers_json TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (survey_id) REFERENCES surveys(id)
    );

    CREATE TABLE IF NOT EXISTS survey_media (
        token TEXT PRIMARY KEY,
        survey_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        response_id TEXT,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (survey_id) REFERENCES surveys(id)
    );

    CREATE INDEX IF NOT EXISTS idx_survey_responses_survey
        ON survey_responses(survey_id, submitted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_survey_media_survey
        ON survey_media(survey_id, created_at DESC);
    """
)
db.commit()


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def admin_guard(x_admin_key: str | None) -> None:
    if not x_admin_key or x_admin_key != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Invalid admin key")


def normalize_slug(value: str) -> str:
    value = value.strip().lower().replace("_", "-")
    value = SLUG_RE.sub("-", value).strip("-")
    return value[:64] or f"survey-{uuid.uuid4().hex[:8]}"


def unique_slug(preferred: str, exclude_id: str | None = None) -> str:
    base = normalize_slug(preferred)
    slug = base
    i = 2
    while True:
        row = db.execute("SELECT id FROM surveys WHERE slug = ?", (slug,)).fetchone()
        if not row or row["id"] == exclude_id:
            return slug
        slug = f"{base[:56]}-{i}"
        i += 1


def safe_json_loads(value: str | None, fallback: Any) -> Any:
    try:
        return json.loads(value) if value else fallback
    except (TypeError, ValueError):
        return fallback


def parse_definition(row: sqlite3.Row) -> dict[str, Any]:
    definition = safe_json_loads(row["definition_json"], {})
    definition.setdefault("id", row["id"])
    definition.setdefault("slug", row["slug"])
    definition.setdefault("title", row["title"])
    definition.setdefault("description", row["description"])
    definition.setdefault("status", row["status"])
    definition.setdefault("questions", [])
    definition.setdefault("settings", {})
    return definition


def response_record(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "survey_id": row["survey_id"],
        "submitted_at": row["submitted_at"],
        "answers": safe_json_loads(row["answers_json"], {}),
        "metadata": safe_json_loads(row["metadata_json"], {}),
    }


def survey_summary(row: sqlite3.Row) -> dict[str, Any]:
    count = db.execute(
        "SELECT COUNT(*) AS n FROM survey_responses WHERE survey_id = ?", (row["id"],)
    ).fetchone()["n"]
    definition = parse_definition(row)
    settings = definition.get("settings") or {}
    return {
        "id": row["id"],
        "slug": row["slug"],
        "title": row["title"],
        "description": row["description"],
        "status": row["status"],
        "question_count": len(definition.get("questions", [])),
        "response_count": count,
        "custom_domain": settings.get("customDomain", ""),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "published_at": row["published_at"],
    }


class SurveyPayload(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    slug: str | None = Field(default=None, max_length=100)
    questions: list[dict[str, Any]] = Field(default_factory=list)
    settings: dict[str, Any] = Field(default_factory=dict)


class ResponsePayload(BaseModel):
    answers: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


def is_missing(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, (list, dict)):
        return len(value) == 0
    return False


def condition_matches(condition: dict[str, Any] | None, answers: dict[str, Any]) -> bool:
    if not condition:
        return True
    source = condition.get("questionId")
    if not source:
        return True
    value = answers.get(source)
    op = condition.get("operator", "equals")
    expected = condition.get("value")
    if op == "answered":
        return not is_missing(value)
    if op == "not_answered":
        return is_missing(value)
    if op == "not_equals":
        return value != expected
    if op == "contains":
        return expected in value if isinstance(value, (list, str)) else False
    return value == expected


def validate_required(definition: dict[str, Any], answers: dict[str, Any]) -> None:
    for question in definition.get("questions", []):
        qid = question.get("id")
        qtype = question.get("type")
        if qtype in {"info", "section"}:
            continue
        if not condition_matches(question.get("logic"), answers):
            continue
        if question.get("required") and is_missing(answers.get(qid)):
            raise HTTPException(
                status_code=422,
                detail={"message": "Required question missing", "question_id": qid},
            )


@router.get("/api/builder/surveys")
def list_surveys(x_admin_key: str | None = Header(default=None, alias="X-Admin-Key")):
    admin_guard(x_admin_key)
    rows = db.execute("SELECT * FROM surveys ORDER BY updated_at DESC").fetchall()
    return [survey_summary(row) for row in rows]


@router.post("/api/builder/surveys", status_code=201)
def create_survey(
    payload: SurveyPayload,
    x_admin_key: str | None = Header(default=None, alias="X-Admin-Key"),
):
    admin_guard(x_admin_key)
    survey_id = uuid.uuid4().hex
    slug = unique_slug(payload.slug or payload.title)
    now = utcnow()
    definition = payload.model_dump()
    definition.update({"id": survey_id, "slug": slug, "status": "draft"})
    db.execute(
        """INSERT INTO surveys
           (id, slug, title, description, status, definition_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)""",
        (survey_id, slug, payload.title.strip(), payload.description, json.dumps(definition), now, now),
    )
    db.commit()
    return parse_definition(db.execute("SELECT * FROM surveys WHERE id = ?", (survey_id,)).fetchone())


@router.get("/api/builder/surveys/{survey_id}")
def get_builder_survey(
    survey_id: str,
    x_admin_key: str | None = Header(default=None, alias="X-Admin-Key"),
):
    admin_guard(x_admin_key)
    row = db.execute("SELECT * FROM surveys WHERE id = ?", (survey_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Survey not found")
    result = parse_definition(row)
    result["created_at"] = row["created_at"]
    result["updated_at"] = row["updated_at"]
    result["published_at"] = row["published_at"]
    return result


@router.put("/api/builder/surveys/{survey_id}")
def update_survey(
    survey_id: str,
    payload: SurveyPayload,
    x_admin_key: str | None = Header(default=None, alias="X-Admin-Key"),
):
    admin_guard(x_admin_key)
    row = db.execute("SELECT * FROM surveys WHERE id = ?", (survey_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Survey not found")
    slug = unique_slug(payload.slug or row["slug"], exclude_id=survey_id)
    definition = payload.model_dump()
    definition.update({"id": survey_id, "slug": slug, "status": row["status"]})
    now = utcnow()
    db.execute(
        """UPDATE surveys SET slug = ?, title = ?, description = ?, definition_json = ?, updated_at = ?
           WHERE id = ?""",
        (slug, payload.title.strip(), payload.description, json.dumps(definition), now, survey_id),
    )
    db.commit()
    return parse_definition(db.execute("SELECT * FROM surveys WHERE id = ?", (survey_id,)).fetchone())


@router.post("/api/builder/surveys/{survey_id}/publish")
def publish_survey(
    survey_id: str,
    x_admin_key: str | None = Header(default=None, alias="X-Admin-Key"),
):
    admin_guard(x_admin_key)
    row = db.execute("SELECT * FROM surveys WHERE id = ?", (survey_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Survey not found")
    definition = parse_definition(row)
    definition["status"] = "published"
    now = utcnow()
    db.execute(
        """UPDATE surveys SET status = 'published', definition_json = ?, updated_at = ?,
           published_at = COALESCE(published_at, ?) WHERE id = ?""",
        (json.dumps(definition), now, now, survey_id),
    )
    db.commit()
    return {"status": "published", "slug": row["slug"]}


@router.post("/api/builder/surveys/{survey_id}/close")
def close_survey(
    survey_id: str,
    x_admin_key: str | None = Header(default=None, alias="X-Admin-Key"),
):
    admin_guard(x_admin_key)
    row = db.execute("SELECT * FROM surveys WHERE id = ?", (survey_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Survey not found")
    definition = parse_definition(row)
    definition["status"] = "closed"
    db.execute(
        "UPDATE surveys SET status = 'closed', definition_json = ?, updated_at = ? WHERE id = ?",
        (json.dumps(definition), utcnow(), survey_id),
    )
    db.commit()
    return {"status": "closed"}


@router.delete("/api/builder/surveys/{survey_id}")
def delete_survey(
    survey_id: str,
    x_admin_key: str | None = Header(default=None, alias="X-Admin-Key"),
):
    admin_guard(x_admin_key)
    row = db.execute("SELECT id FROM surveys WHERE id = ?", (survey_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Survey not found")
    db.execute("DELETE FROM survey_media WHERE survey_id = ?", (survey_id,))
    db.execute("DELETE FROM survey_responses WHERE survey_id = ?", (survey_id,))
    db.execute("DELETE FROM surveys WHERE id = ?", (survey_id,))
    db.commit()
    survey_dir = UPLOAD_DIR / survey_id
    if survey_dir.exists():
        for child in survey_dir.iterdir():
            try:
                child.unlink()
            except OSError:
                pass
        try:
            survey_dir.rmdir()
        except OSError:
            pass
    return {"deleted": True}


@router.get("/api/surveys/{slug}")
def get_public_survey(slug: str, preview_key: str | None = Query(default=None)):
    row = db.execute("SELECT * FROM surveys WHERE slug = ?", (slug,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Survey not found")
    if row["status"] != "published" and preview_key != ADMIN_KEY:
        raise HTTPException(status_code=404, detail="Survey not available")
    definition = parse_definition(row)
    return definition


@router.post("/api/surveys/{slug}/responses", status_code=201)
def submit_public_response(slug: str, payload: ResponsePayload):
    row = db.execute("SELECT * FROM surveys WHERE slug = ?", (slug,)).fetchone()
    if not row or row["status"] != "published":
        raise HTTPException(status_code=404, detail="Survey not available")
    definition = parse_definition(row)
    validate_required(definition, payload.answers)
    response_id = uuid.uuid4().hex
    now = utcnow()
    db.execute(
        """INSERT INTO survey_responses (id, survey_id, submitted_at, answers_json, metadata_json)
           VALUES (?, ?, ?, ?, ?)""",
        (response_id, row["id"], now, json.dumps(payload.answers), json.dumps(payload.metadata)),
    )
    tokens: set[str] = set()

    def walk(value: Any) -> None:
        if isinstance(value, dict):
            if isinstance(value.get("token"), str):
                tokens.add(value["token"])
            for nested in value.values():
                walk(nested)
        elif isinstance(value, list):
            for nested in value:
                walk(nested)

    walk(payload.answers)
    if tokens:
        placeholders = ",".join("?" for _ in tokens)
        db.execute(
            f"UPDATE survey_media SET response_id = ? WHERE survey_id = ? AND token IN ({placeholders})",
            [response_id, row["id"], *tokens],
        )
    db.commit()
    return {"id": response_id, "submitted_at": now}


@router.post("/api/surveys/{slug}/media", status_code=201)
async def upload_public_media(
    slug: str,
    question_id: str = Query(..., min_length=1, max_length=100),
    file: UploadFile = File(...),
):
    survey = db.execute("SELECT id, status FROM surveys WHERE slug = ?", (slug,)).fetchone()
    if not survey or survey["status"] != "published":
        raise HTTPException(status_code=404, detail="Survey not available")
    content_type = (file.content_type or "application/octet-stream").lower()
    if not (content_type.startswith(ALLOWED_MEDIA_PREFIXES) or content_type in ALLOWED_MEDIA_TYPES):
        raise HTTPException(status_code=415, detail="Unsupported media type")
    data = await file.read(MAX_MEDIA_BYTES + 1)
    if len(data) > MAX_MEDIA_BYTES:
        raise HTTPException(status_code=413, detail="File too large")
    token = uuid.uuid4().hex
    original_name = Path(file.filename or "upload.bin").name[:180]
    ext = Path(original_name).suffix.lower()
    if not re.fullmatch(r"\.[a-z0-9]{1,8}", ext):
        ext = ""
    filename = f"{token}{ext}"
    survey_dir = UPLOAD_DIR / survey["id"]
    survey_dir.mkdir(exist_ok=True)
    (survey_dir / filename).write_bytes(data)
    db.execute(
        """INSERT INTO survey_media
           (token, survey_id, question_id, filename, original_name, content_type, size_bytes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (token, survey["id"], question_id, filename, original_name, content_type, len(data), utcnow()),
    )
    db.commit()
    return {"token": token, "name": original_name, "content_type": content_type, "size": len(data)}


@router.get("/api/builder/surveys/{survey_id}/responses")
def list_builder_responses(
    survey_id: str,
    x_admin_key: str | None = Header(default=None, alias="X-Admin-Key"),
):
    admin_guard(x_admin_key)
    if not db.execute("SELECT 1 FROM surveys WHERE id = ?", (survey_id,)).fetchone():
        raise HTTPException(status_code=404, detail="Survey not found")
    rows = db.execute(
        "SELECT * FROM survey_responses WHERE survey_id = ? ORDER BY submitted_at DESC", (survey_id,)
    ).fetchall()
    return [response_record(row) for row in rows]


@router.get("/api/builder/surveys/{survey_id}/responses/export.csv")
def export_builder_responses(
    survey_id: str,
    x_admin_key: str | None = Header(default=None, alias="X-Admin-Key"),
):
    admin_guard(x_admin_key)
    survey = db.execute("SELECT * FROM surveys WHERE id = ?", (survey_id,)).fetchone()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    definition = parse_definition(survey)
    questions = [q for q in definition.get("questions", []) if q.get("type") not in {"info", "section"}]
    rows = db.execute(
        "SELECT * FROM survey_responses WHERE survey_id = ? ORDER BY submitted_at", (survey_id,)
    ).fetchall()
    buf = io.StringIO()
    writer = csv.writer(buf)
    header = ["response_id", "submitted_at"] + [
        f"{q.get('title') or q.get('label') or q.get('id')} [{q.get('id')}]" for q in questions
    ]
    writer.writerow(header)
    for row in rows:
        answers = safe_json_loads(row["answers_json"], {})
        values = []
        for q in questions:
            value = answers.get(q.get("id"), "")
            if isinstance(value, (dict, list)):
                value = json.dumps(value, ensure_ascii=False)
            values.append(value)
        writer.writerow([row["id"], row["submitted_at"], *values])
    buf.seek(0)
    safe_slug = normalize_slug(survey["slug"])
    return StreamingResponse(
        buf,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{safe_slug}-responses.csv"'},
    )


@router.get("/api/builder/media/{token}")
def get_builder_media(
    token: str,
    x_admin_key: str | None = Header(default=None, alias="X-Admin-Key"),
):
    admin_guard(x_admin_key)
    row = db.execute("SELECT * FROM survey_media WHERE token = ?", (token,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Media not found")
    path = UPLOAD_DIR / row["survey_id"] / row["filename"]
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Media file missing")
    return FileResponse(path, media_type=row["content_type"], filename=row["original_name"])
