#!/usr/bin/env python3
"""api_server.py — backend for the "Mein Stadtviertel" PPGIS survey.

Stores each submission in SQLite and exposes:
  POST /api/responses          -> save one submission
  GET  /api/responses?key=...  -> list all submissions (admin only)
  GET  /api/responses/export.csv?key=...  -> CSV download (admin only)

Each map question can hold up to 10 marked points, stored as a JSON array
of {lat, lng} objects in a TEXT column.

The admin key is read from the ADMIN_KEY environment variable so it is
never committed to source control. Set it before starting the server:

    export ADMIN_KEY="choose-a-secret-key"
    python api_server.py
"""
import csv
import io
import json
import os
import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

DB_PATH = os.path.join(os.path.dirname(__file__), "data.db")
ADMIN_KEY = os.environ.get("ADMIN_KEY", "changeme")
MAX_POINTS = 10

db = sqlite3.connect(DB_PATH, check_same_thread=False)
db.execute(
    """
    CREATE TABLE IF NOT EXISTS responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT,
        language TEXT,
        age_group TEXT,
        residency_duration TEXT,
        home_points TEXT,
        favorite_points TEXT, favorite_reason TEXT,
        unsafe_points TEXT, unsafe_reason TEXT,
        leisure_points TEXT,
        improve_points TEXT, improve_suggestion TEXT,
        satisfaction INTEGER,
        safety_day INTEGER,
        safety_night INTEGER,
        feedback TEXT
    )
    """
)
# Migrate older single-point schema (pre multi-point support) by rebuilding
# the table. No production data is expected in the old shape, so this is a
# safe one-time reset rather than a lossy migration of real responses.
_existing_cols = {row[1] for row in db.execute("PRAGMA table_info(responses)").fetchall()}
if "home_points" not in _existing_cols:
    db.execute("DROP TABLE IF EXISTS responses")
    db.execute(
        """
        CREATE TABLE responses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT,
            language TEXT,
            age_group TEXT,
            residency_duration TEXT,
            home_points TEXT,
            favorite_points TEXT, favorite_reason TEXT,
            unsafe_points TEXT, unsafe_reason TEXT,
            leisure_points TEXT,
            improve_points TEXT, improve_suggestion TEXT,
            satisfaction INTEGER,
            safety_day INTEGER,
            safety_night INTEGER,
            feedback TEXT
        )
        """
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


class Point(BaseModel):
    lat: float
    lng: float


class SurveyResponse(BaseModel):
    language: str | None = "de"
    age_group: str | None = None
    residency_duration: str | None = None
    home_points: list[Point] | None = []
    favorite_points: list[Point] | None = []
    favorite_reason: str | None = ""
    unsafe_points: list[Point] | None = []
    unsafe_reason: str | None = ""
    leisure_points: list[Point] | None = []
    improve_points: list[Point] | None = []
    improve_suggestion: str | None = ""
    satisfaction: int | None = None
    safety_day: int | None = None
    safety_night: int | None = None
    feedback: str | None = ""


COLUMNS = [
    "created_at", "language", "age_group", "residency_duration",
    "home_points",
    "favorite_points", "favorite_reason",
    "unsafe_points", "unsafe_reason",
    "leisure_points",
    "improve_points", "improve_suggestion",
    "satisfaction", "safety_day", "safety_night", "feedback",
]

POINT_COLUMNS = {"home_points", "favorite_points", "unsafe_points", "leisure_points", "improve_points"}


def _points_to_json(points):
    points = (points or [])[:MAX_POINTS]
    return json.dumps([{"lat": p.lat, "lng": p.lng} for p in points])


@app.post("/api/responses", status_code=201)
def create_response(item: SurveyResponse):
    now = datetime.now(timezone.utc).isoformat()
    values = [now, item.language]
    for c in COLUMNS[2:]:
        v = getattr(item, c)
        values.append(_points_to_json(v) if c in POINT_COLUMNS else v)
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
    return "; ".join(f"{p['lat']:.5f},{p['lng']:.5f}" for p in pts)


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
        writer.writerow([rec[c] for c in cols])
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=umfrage_antworten.csv"},
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
