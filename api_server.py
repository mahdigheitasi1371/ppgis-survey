#!/usr/bin/env python3
"""api_server.py — backend for the flood-risk / ecosystem-services PPGIS survey.

Stores each submission in SQLite and exposes:
  POST /api/responses              -> save one submission
  GET  /api/responses?key=...      -> list all submissions (admin only)
  GET  /api/responses/export.csv?key=...  -> CSV download (admin only)
  POST /api/upload-audio           -> store a recorded voice note, returns a filename
  GET  /api/audio/{filename}?key=...      -> stream back a stored voice note (admin only)

Each mapping question (Q1-Q4) can hold up to 10 marked points, stored as a
JSON array of point objects in a TEXT column. Q1 points carry a `severity`
field, Q3 points carry a `helps` field.

The admin key is read from the ADMIN_KEY environment variable so it is
never committed to source control. Set it before starting the server:

    export ADMIN_KEY="choose-a-secret-key"
    python api_server.py
"""
import csv
import io
import json
import os
import re
import sqlite3
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

DB_PATH = os.path.join(os.path.dirname(__file__), "data.db")
AUDIO_DIR = os.path.join(os.path.dirname(__file__), "audio_uploads")
ADMIN_KEY = os.environ.get("ADMIN_KEY", "changeme")
MAX_POINTS = 10
MAX_AUDIO_BYTES = 8 * 1024 * 1024  # keep well under the 10MB request-body limit

os.makedirs(AUDIO_DIR, exist_ok=True)

db = sqlite3.connect(DB_PATH, check_same_thread=False)

SCHEMA_COLUMNS = [
    "created_at TEXT",
    "language TEXT",
    "location TEXT",
    "q1_flood_points TEXT",
    "q2_green_points TEXT",
    "q3_service_points TEXT",
    "q4_safe_points TEXT",
    "q5_concern INTEGER",
    "q6_ranking TEXT",
    "q7_exposed TEXT",
    "q7_description TEXT",
    "q7_audio_filename TEXT",
    "q8_measures TEXT",
    "q9_age_group TEXT",
    "q9_gender TEXT",
    "q9_education TEXT",
    "q10_postal_code TEXT",
    "q10_years_at_address TEXT",
    "q10_distance_green TEXT",
    "q10_distance_water TEXT",
]

db.execute(
    f"CREATE TABLE IF NOT EXISTS responses (id INTEGER PRIMARY KEY AUTOINCREMENT, {', '.join(SCHEMA_COLUMNS)})"
)
# This is a full replacement of the previous neighborhood-satisfaction survey
# schema. No production data exists under the old shape, so rebuild the table
# once if it doesn't already match the new flood/ecosystem-services schema.
_existing_cols = {row[1] for row in db.execute("PRAGMA table_info(responses)").fetchall()}
if "q1_flood_points" not in _existing_cols or "location" not in _existing_cols:
    db.execute("DROP TABLE IF EXISTS responses")
    db.execute(
        f"CREATE TABLE responses (id INTEGER PRIMARY KEY AUTOINCREMENT, {', '.join(SCHEMA_COLUMNS)})"
    )
db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    db.close()


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


class FloodPoint(BaseModel):
    lat: float
    lng: float
    severity: int | None = None  # 1 (very low) .. 5 (very high)


class PlainPoint(BaseModel):
    lat: float
    lng: float


class ServicePoint(BaseModel):
    lat: float
    lng: float
    helps: str | None = None  # "yes" | "no" | "unsure"
    source: str | None = None  # "q2" | "new"


class SurveyResponse(BaseModel):
    language: str | None = "en"
    location: str | None = None  # "dortmund" | "bochum" | "essen"
    q1_flood_points: list[FloodPoint] | None = []
    q2_green_points: list[PlainPoint] | None = []
    q3_service_points: list[ServicePoint] | None = []
    q4_safe_points: list[PlainPoint] | None = []
    q5_concern: int | None = None
    q6_ranking: list[str] | None = []
    q7_exposed: str | None = None
    q7_description: str | None = ""
    q7_audio_filename: str | None = None
    q8_measures: str | None = ""
    q9_age_group: str | None = None
    q9_gender: str | None = None
    q9_education: str | None = None
    q10_postal_code: str | None = ""
    q10_years_at_address: str | None = None
    q10_distance_green: str | None = None
    q10_distance_water: str | None = None


COLUMNS = [c.split()[0] for c in SCHEMA_COLUMNS]
POINT_COLUMNS = {"q1_flood_points", "q2_green_points", "q3_service_points", "q4_safe_points"}


def _points_to_json(points):
    points = (points or [])[:MAX_POINTS]
    return json.dumps([p.dict() for p in points])


@app.post("/api/responses", status_code=201)
def create_response(item: SurveyResponse):
    now = datetime.now(timezone.utc).isoformat()
    values = [now, item.language]
    for c in COLUMNS[2:]:
        v = getattr(item, c)
        values.append(_points_to_json(v) if c in POINT_COLUMNS else (json.dumps(v) if c == "q6_ranking" else v))
    placeholders = ", ".join("?" for _ in COLUMNS)
    cur = db.execute(
        f"INSERT INTO responses ({', '.join(COLUMNS)}) VALUES ({placeholders})", values
    )
    db.commit()
    return {"id": cur.lastrowid}


def _check_key(key: str | None):
    if key != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Invalid admin key")


def _points_to_readable(json_str):
    try:
        pts = json.loads(json_str) if json_str else []
    except (TypeError, ValueError):
        return json_str
    parts = []
    for p in pts:
        extra = ""
        if p.get("severity") is not None:
            extra = f" [severity {p['severity']}]"
        elif p.get("helps"):
            extra = f" [helps: {p['helps']}]"
        parts.append(f"{p['lat']:.5f},{p['lng']:.5f}{extra}")
    return "; ".join(parts)


@app.get("/api/responses")
def list_responses(key: str | None = Query(default=None)):
    _check_key(key)
    rows = db.execute(
        f"SELECT id, {', '.join(COLUMNS)} FROM responses ORDER BY id DESC"
    ).fetchall()
    cols = ["id"] + COLUMNS
    result = []
    for row in rows:
        rec = dict(zip(cols, row))
        for c in POINT_COLUMNS:
            try:
                rec[c] = json.loads(rec[c]) if rec[c] else []
            except (TypeError, ValueError):
                rec[c] = []
        try:
            rec["q6_ranking"] = json.loads(rec["q6_ranking"]) if rec["q6_ranking"] else []
        except (TypeError, ValueError):
            rec["q6_ranking"] = []
        result.append(rec)
    return result


@app.get("/api/responses/export.csv")
def export_csv(key: str | None = Query(default=None)):
    _check_key(key)
    rows = db.execute(
        f"SELECT id, {', '.join(COLUMNS)} FROM responses ORDER BY id"
    ).fetchall()
    cols = ["id"] + COLUMNS
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(cols)
    for row in rows:
        rec = dict(zip(cols, row))
        for c in POINT_COLUMNS:
            rec[c] = _points_to_readable(rec[c])
        try:
            rec["q6_ranking"] = " > ".join(json.loads(rec["q6_ranking"])) if rec["q6_ranking"] else ""
        except (TypeError, ValueError):
            pass
        writer.writerow([rec[c] for c in cols])
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=umfrage_antworten.csv"},
    )


_SAFE_EXT = re.compile(r"^[a-zA-Z0-9]{1,10}$")


@app.post("/api/upload-audio")
async def upload_audio(file: UploadFile = File(...)):
    data = await file.read()
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio recording too large")
    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "webm"
    if not _SAFE_EXT.match(ext):
        ext = "webm"
    filename = f"{uuid.uuid4().hex}.{ext}"
    with open(os.path.join(AUDIO_DIR, filename), "wb") as f:
        f.write(data)
    return {"filename": filename}


@app.get("/api/audio/{filename}")
def get_audio(filename: str, key: str | None = Query(default=None)):
    _check_key(key)
    if "/" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    path = os.path.join(AUDIO_DIR, filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(path)


@app.get("/api/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
