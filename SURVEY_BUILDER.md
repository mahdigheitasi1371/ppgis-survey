# Survey Builder Platform — v1

This branch turns the project into a reusable survey platform while leaving the original LiFRES survey intact.

## Run

```bash
pip install -r requirements.txt
ADMIN_KEY=choose-a-strong-secret python platform_server.py
```

Open:

- `http://localhost:8000/` or `/builder` — create and publish surveys
- `http://localhost:8000/admin` — survey list, analytics, responses, media, CSV export
- `http://localhost:8000/survey?slug=<survey-slug>` — public respondent view
- `http://localhost:8000/lifres` — original LiFRES questionnaire

The builder asks for the same `ADMIN_KEY` that protects the admin API. The key is kept in browser local storage for the current admin browser. Use a strong deployment secret and HTTPS.

## Question types in v1

Traditional: short text, long/open text, number, email, phone, date, time, date+time, yes/no, single choice, multiple choice, dropdown, rating scale, slider, matrix/Likert, and consent checkbox.

Maps/spatial: point, multiple points, line/route, polygon/area, configurable center/zoom, point/vertex limits, and optional popup follow-up per mapped point using open text, single choice, or rating.

Media: single photo, multiple photos, general file upload, live audio recording/upload, live video recording/upload, and drawn signature.

Ranking/prioritization: rank order, rating, matrix/Likert, and resource/budget allocation.

Structure/logic: information blocks, section headings, required/optional questions, simple branching based on earlier answers, and local respondent draft/resume.

## Survey configuration

- Title and introduction
- Public slug
- Logo upload
- Primary brand color
- Default-language metadata
- Thank-you message
- Progress indicator
- Custom-domain configuration value

Custom-domain configuration is stored with the survey. A real custom domain still requires DNS, TLS, and deployment/proxy configuration outside the browser application.

## Admin dashboard

For each survey the dashboard includes status/public link, response count, question count, mapped-feature count, media count, per-question summaries, response table/detail, protected media retrieval, and CSV export.

## Generic storage model

The old LiFRES `responses` table is untouched. The platform adds:

- `surveys` — survey definition JSON and publication status
- `survey_responses` — one generic answer JSON object per submitted response
- `survey_media` — uploaded respondent media linked by random token

This avoids a database schema migration for every new question.

## Product ideas benchmarked from Maptionnaire and Survey123

The v1 includes the highest-value patterns for this project: map points/lines/areas, map follow-up questions, matrix/slider/number questions, branching, media responses, ranking, resource allocation, draft/resume, signature, and configurable maps.

Strong next additions are repeat groups, barcode/QR scanning, calculated/read-only fields, image choices, select-from-map-feature questions, GeoJSON/WMS/WMTS/vector-tile layers, uploaded/georeferenced image maps, response-area masks, a translation editor, survey/page templates, real user accounts and organizations, webhooks/integrations, GIS exports/heatmaps, and advanced prioritization such as pairwise/MaxDiff.

## Production security notes

- Set a strong `ADMIN_KEY`; do not use `changeme`.
- Use HTTPS before enabling microphone/camera collection.
- Restrict CORS to actual deployment domains.
- Add rate limiting/abuse controls to public response and media endpoints.
- Back up respondent data outside Git.
- For multiple researchers, replace the shared admin key with user authentication and survey ownership before production use.
