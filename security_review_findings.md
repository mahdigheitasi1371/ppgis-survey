# Pre-Publish Security Review — ppgis-survey

Project: /home/user/workspace/ppgis-survey
Context: Bilingual (DE/EN) PPGIS neighborhood survey (FastAPI + SQLite backend, vanilla JS/Leaflet frontend), public/anonymous, no login, admin endpoints gated by an `ADMIN_KEY` query parameter, moderate municipal traffic.

## Security Review Results

### BLOCK (must fix before publishing)
- None found.

### WARN (inform user, let them decide)
- **`ADMIN_KEY` falls back to the hardcoded default `"changeme"` if the environment variable isn't set** — `api_server.py:38` (`ADMIN_KEY = os.environ.get("ADMIN_KEY", "changeme")`). If the deployed environment doesn't have `ADMIN_KEY` set, admin endpoints (`/api/responses`, `/api/responses/export.csv`, `/api/audio/{filename}`) are protected by a publicly-known default key. **Fix:** confirm `ADMIN_KEY` is actually set in the live deployment's environment (not just documented in the README), or fail startup if it's unset/still `"changeme"`.
- **The SQLite database (`data.db`) was committed to git history in two earlier commits** (`84c39d6`, `e79220e`) before being gitignored in a later commit (`6e5f065`). Both historical copies contained 0 rows, so no actual response data was exposed — but the file remains retrievable from the public GitHub repo's history (`git show 84c39d6:data.db`) even though it's no longer tracked going forward. **Fix:** if this repo is/will be public, consider that the database file (and any future accidental commits of it) is permanently recoverable from history; a `git filter-repo`/history rewrite would be needed to fully purge it. Going forward the `.gitignore` entry prevents new leaks, which is good.
- **Open CORS (`allow_origins=["*"]`, `allow_methods=["*"]`) combined with unauthenticated mutation endpoints** — `api_server.py:93-95`. `POST /api/responses` (submit survey) and `POST /api/upload-audio` (upload voice recording) accept writes from any origin with no auth. This is very likely **intentional** for a public, no-login survey meant to be filled out by any resident, so it is not a defect — but it does mean:
  - Anyone (any origin, any script) can programmatically submit unlimited fake survey responses or upload arbitrary audio-like files, since there's no CAPTCHA, rate limiting, or per-IP throttling visible in `api_server.py`.
  - `MAX_AUDIO_BYTES` (8MB) bounds individual upload size, but there's no cap on the *number* of uploads/responses, so disk space (`audio_uploads/`) or the `responses` table could be exhausted by automated spam given "moderate traffic" expectations and no auth wall.
  - **Suggested fix (optional, since it's WARN not BLOCK):** add basic rate limiting (e.g. `slowapi`) per IP on `/api/responses` and `/api/upload-audio`, and/or a lightweight bot check (honeypot field, simple proof-of-work, or Turnstile/CAPTCHA) if spam becomes a real concern for the research data's validity.

### PASS
- **Dependency audit** — `pip-audit` on `requirements.txt` (fastapi 0.141.1, uvicorn 0.52.4, pydantic 2.13.5, python-multipart 0.0.32, and transitive deps) found no known vulnerabilities.
- **Hardcoded secrets** — no API keys, tokens, private keys, or hardcoded passwords found via pattern search across `.py`/`.js`/`.json`/`.env`/etc. No `.env` file present in the project.
- **SQL injection** — all `INSERT`/`SELECT` queries use parameterized `?` placeholders for values (`api_server.py:157-159, 188-190, 211-213`); the only f-string interpolation is a fixed, hardcoded column-name list (`COLUMNS`), never user input.
- **Command injection / eval / exec** — no `eval(`, `exec(`, `os.system(`, or `subprocess(..., shell=True)` found in `api_server.py`.
- **Path traversal on file access** — `/api/audio/{filename}` (`api_server.py:252-260`) rejects filenames containing `/` or `..` and is admin-key gated; uploaded filenames are server-generated UUIDs with a regex-validated extension (`_SAFE_EXT`), not attacker-controlled paths.
- **XSS via `innerHTML`** — numerous `innerHTML` assignments in `app.js`, but all interpolated values are static translation strings or the survey-taker's own client-side state rendered back into their own browser before submission (a self-XSS surface at most, not stored/reflected for other users). Free-text fields (`q7_description`, `q8_measures`) are only ever placed into a `<textarea>.value` (safe) and are never re-rendered as HTML anywhere, including on the admin side (admin views are plain JSON/CSV, not an HTML template).
- **Third-party script integrity** — the Leaflet CDN `<script>` in `index.html` uses a Subresource Integrity (`integrity`) hash and `crossorigin` attribute, which is good practice.
- **PII/design** — matches the stated design goal of collecting no names or directly identifying information; only age group, general demographics, map points, rankings, and optional free text/audio are stored.

## Actions taken
No BLOCK-level findings were present, so no automatic fixes were required or applied. The two WARN items above (`ADMIN_KEY` default value, and historical `data.db` commits) are informational for the user to decide on before/at publish time.
