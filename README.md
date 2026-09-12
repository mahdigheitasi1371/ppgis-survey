# Mein Stadtviertel – PPGIS Umfrage

**Live survey:** https://mein-stadtviertel.pplx.app

A custom-built, map-based public participation GIS (PPGIS) survey for collecting
resident feedback about a neighborhood in Bochum. Ten questions in German, five of
which ask respondents to mark points on an interactive map (home, favorite place,
place that feels unsafe, leisure spot, and a place that needs improvement), plus
satisfaction/safety rating scales and open feedback.

## What's in this folder

- `index.html`, `style.css`, `app.js` — the frontend. Plain HTML/CSS/JavaScript, no
  build step required. Uses [Leaflet](https://leafletjs.com/) with OpenStreetMap
  tiles for the map, and Fontshare for the Chillax/General Sans fonts.
- `api_server.py` — a small FastAPI + SQLite backend that stores submitted
  responses and offers an admin CSV export.
- `.gitignore` — keeps the local database file and logs out of version control.

## Running it locally

```bash
pip install fastapi uvicorn
ADMIN_KEY=choose-a-secret python3 api_server.py
```

Then open `index.html` in a browser (or serve it with any static file server).
The frontend expects the API at `http://localhost:8000` when running locally.

Admin endpoints (replace `choose-a-secret` with your own `ADMIN_KEY`):

- `GET /api/responses?key=choose-a-secret` — view all submitted responses as JSON
- `GET /api/responses/export.csv?key=choose-a-secret` — download all responses as CSV

## Publishing to GitHub

You already have a GitHub account, so pushing this project is straightforward:

1. Create a new empty repository on [github.com](https://github.com/new) (no
   README/license needed — this folder already has files).
2. From this folder, connect it to your new repository and push:
   ```bash
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git branch -M main
   git push -u origin main
   ```
3. That's it — your code and history are now on GitHub.

### Important: GitHub Pages is static-only

If you want to also *host* the survey on GitHub Pages (Settings → Pages), keep in
mind GitHub Pages only serves static files — it cannot run the Python/FastAPI
backend (`api_server.py`). That means map questions, scales, and the whole
frontend would display fine, but the "submit" button would have nowhere to send
data to, since there is no server behind GitHub Pages.

Two ways to handle this:

- **Keep using the version deployed for you here** (the live preview link already
  shared in this conversation) — its backend is already running and working, so
  submissions are captured right now with no extra setup.
- **Swap the backend for a static-friendly form service** if you want the whole
  thing to live on GitHub Pages long-term. Good free options: [Formspree](https://formspree.io/),
  [Google Apps Script](https://developers.google.com/apps-script) writing to a
  Google Sheet, or [Airtable](https://www.airtable.com/) via its API. This mainly
  means changing the `fetch()` call at the bottom of `app.js` to point at the new
  endpoint instead of `api_server.py`. Ask if you'd like help making that swap —
  it's a small, well-contained change.

## Data collected

Each submission stores: age group, residency duration, five map points
(latitude/longitude) with two optional free-text reasons, an overall satisfaction
score, day/night safety scores, and an optional open feedback comment. No names or
other identifying information are collected.
