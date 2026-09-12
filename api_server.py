#!/usr/bin/env python3
"""api_server.py — backend for the "Mein Stadtviertel" PPGIS survey.

Stores each submission in SQLite and exposes:
  POST /api/responses          -> save one submission
  GET  /api/responses?key=...  -> list all submissions (admin only)
  GET  /api/responses/export.csv?key=...  -> CSV download (admin only)

The admin key is read from the ADMIN_KEY environment variable so it is
never committed to source control. Set it before starting the server:

    export ADMIN_KEY="choose-a-secret-key"
    python api_server.py
"""
import csv
import io
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

db = sqlite3.connect(DB_PATH, check_same_thread=False)
db.execute(
    """
    CREATE TABLE IF NOT EXISTS responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT,
        age_group TEXT,
        residency_duration TEXT,
        home_lat REAL, home_lng REAL,
        favorite_lat REAL, favorite_lng REAL, favorite_reason TEXT,
        unsafe_lat REAL, unsafe_lng REAL, unsafe_reason TEXT,
        leisure_lat REAL, leisure_lng REAL,
        improve_lat REAL, improve_lng REAL, improve_suggestion TEXT,
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


class SurveyResponse(BaseModel):
    age_group: str | None = None
    residency_duration: str | None = None
    home_lat: float | None = None
    home_lng: float | None = None
    favorite_lat: float | None = None
    favorite_lng: float | None = None
    favorite_reason: str | None = ""
    unsafe_lat: float | None = None
    unsafe_lng: float | None = None
    unsafe_reason: str | None = ""
    leisure_lat: float | None = None
    leisure_lng: float | None = None
    improve_lat: float | None = None
    improve_lng: float | None = None
    improve_suggestion: str | None = ""
    satisfaction: int | None = None
    safety_day: int | None = None
    safety_night: int | None = None
    feedback: str | None = ""


COLUMNS = [
    "created_at", "age_group", "residency_duration",
    "home_lat", "home_lng",
    "favorite_lat", "favorite_lng", "favorite_reason",
    "unsafe_lat", "unsafe_lng", "unsafe_reason",
    "leisure_lat", "leisure_lng",
    "improve_lat", "improve_lng", "improve_suggestion",
    "satisfaction", "safety_day", "safety_night", "feedback",
]


@app.post("/api/responses", status_code=201)
def create_response(item: SurveyResponse):
    now = datetime.now(timezone.utc).isoformat()
    values = [now] + [getattr(item, c) for c in COLUMNS[1:]]
    placeholders = ", ".join("?" for _ in COLUMNS)
    cur = db.execute(
        f"INSERT INTO responses ({', '.join(COLUMNS)}) VALUES ({placeholders})", values
    )
    db.commit()
    return {"id": cur.lastrowid}


def _check_key(key: str | None):
    if key != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Invalid admin key")


@app.get("/api/responses")
def list_responses(key: str | None = Query(default=None)):
    _check_key(key)
    rows = db.execute(
        f"SELECT id, {', '.join(COLUMNS)} FROM responses ORDER BY id DESC"
    ).fetchall()
    cols = ["id"] + COLUMNS
    return [dict(zip(cols, row)) for row in rows]


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
    writer.writerows(rows)
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
