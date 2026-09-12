# Pre-Publish Security Review — ppgis-survey (update review)

Project: /home/user/workspace/ppgis-survey
Context: Bilingual (DE/EN) PPGIS neighborhood flood-risk and ecosystem-services survey (LiFRES), FastAPI + SQLite backend, vanilla JS/Leaflet frontend, public/anonymous with no login, admin endpoints gated by an `ADMIN_KEY` query/header parameter, moderate municipal/academic research traffic. This review covers the update since the prior `security_review_findings.md`: added location-selection step (Dortmund/Bochum/Essen), a river-overlay drawing feature, a new `location` DB column, and removal of three demographic form fields.

## Security Review Results

### BLOCK (must fix before publishing)
- None found.

### WARN (inform user, let them decide)
- **`ADMIN_KEY` still falls back to the hardcoded default `"changeme"` if the environment variable isn't set** — `api_server.py:38` (`ADMIN_KEY = os.environ.get("ADMIN_KEY", "changeme")`). Unchanged from the prior review. **Fix:** confirm `ADMIN_KEY` is actually set in the live deployment's environment (not just documented in the README), or fail startup if it's unset/still `"changeme"`.
- **Open CORS (`allow_origins=["*"]`, `allow_methods=["*"]`) combined with unauthenticated mutation endpoints** — `api_server.py:92`. `POST /api/responses` and `POST /api/upload-audio` still accept writes from any origin with no auth, and there is still no rate limiting or per-IP throttling. Unchanged from the prior review; carried forward as informational since it is very likely intentional for a public, no-login survey.
- **Historical `data.db` commits remain in git history** (unchanged from prior review — two earlier commits contain empty copies of the database, now gitignored going forward but still retrievable via `git show <commit>:data.db` from repo history if the GitHub repo is public).

### PASS
- **Dependency audit** — `pip-audit` on `requirements.txt` (fastapi 0.141.1, uvicorn 0.52.4, pydantic 2.13.5, python-multipart 0.0.32, and transitive deps) found no known vulnerabilities.
- **Hardcoded secrets** — no API keys, tokens, private keys, or hardcoded passwords found via pattern search across `.py`/`.js`/`.json`/etc. No `.env` file present in the project.
- **New `emscher_final.json` file** — confirmed to contain only static lat/lng coordinate arrays (35 line-string segments, no scripts, no URLs, no PII). It is a source/authoring artifact only — the app does not `fetch()` it at runtime; the coordinates are inlined directly as a hardcoded `EMSCHER_SEGMENTS` array in `app.js`, so it introduces no new runtime attack surface (no new file-serving endpoint, no new fetch target).
- **New `location` field** — constrained client-side to one of three button-driven enum values (`dortmund`/`bochum`/`essen`), inserted into SQLite via the existing parameterized `?` placeholder path (`api_server.py:154`) alongside all other columns, not via string interpolation. No SQL injection risk.
- **SQL injection** — all `INSERT`/`SELECT` queries still use parameterized `?` placeholders for values; the only f-string interpolation is the fixed, hardcoded `COLUMNS` list (now including `location`), never user input.
- **Command injection / eval / exec** — no `eval(`, `exec(`, `os.system(`, or `subprocess(..., shell=True)` found in `api_server.py`.
- **XSS via `innerHTML`** — the new review-screen row for `location` (`app.js:701-705`) renders a label plus one of three fixed translated strings (`locationLabels` dict keyed by enum), not free text — same safe pattern as the rest of the review screen (self-XSS-at-most surface reviewed and passed previously). No new free-text field was added; the update actually *removed* fields (`q9_household_size`, `q9_household_composition`, `q10_housing_type`) rather than adding any.
- **Path traversal on file access** — `/api/audio/{filename}` unchanged and still rejects `/`/`..`, still admin-key gated.
- **Schema migration safety** — the new `location` column triggers the existing "rebuild table if schema doesn't match" guard (`api_server.py:76`), which only drops/rebuilds the table when the new columns aren't present yet; this is the same pre-existing migration pattern already reviewed, not a new risk, though as before it would discard any accumulated response data if triggered against a live table with real data (worth confirming this deploy is happening before any real responses are collected under the current schema).
- **Removed demographic fields** — `q9_household_size`, `q9_household_composition`, `q10_housing_type` were cleanly removed from the Pydantic model, DB schema list, and frontend form/state with no stray references left behind that could indicate leftover data-handling code.
- **PII/design** — matches the stated design goal of collecting no names or directly identifying information; the update reduces the demographic footprint further (three fewer fields) while adding only a coarse city-selection enum.

## Actions taken
No BLOCK-level findings were present, so no automatic fixes were required or applied. The three WARN items above (`ADMIN_KEY` default value, open CORS on mutation endpoints, and historical `data.db` commits) are all carried forward unchanged from the prior review and remain informational for the user to decide on before/at publish time. No new WARN or BLOCK items were introduced by this update.
