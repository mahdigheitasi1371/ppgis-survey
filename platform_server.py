"""Combined server for the original LiFRES survey and the survey-builder platform.

Run:
    ADMIN_KEY=choose-a-secret python platform_server.py

Surfaces:
    /          builder
    /admin     admin dashboard
    /survey    generic public survey runner
    /lifres    original LiFRES survey
"""
import json
import os
import re
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import Query
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse

from api_server import app
from survey_platform import router as survey_platform_router

BASE_DIR = Path(__file__).resolve().parent
app.include_router(survey_platform_router)


def local_file(name: str) -> FileResponse:
    return FileResponse(BASE_DIR / name)


def inject_before(html: str, marker: str, fragment: str) -> str:
    return html if fragment in html else html.replace(marker, f"{fragment}\n{marker}")


def builder_html() -> HTMLResponse:
    """Serve the rebuilt builder exactly as committed, without runtime rewriting."""
    html = (BASE_DIR / "builder.html").read_text(encoding="utf-8")
    html = html.replace("builder.js?v=1", "builder.js?v=9")
    return HTMLResponse(html, headers={"Cache-Control": "no-store, max-age=0"})


def survey_html() -> HTMLResponse:
    html = (BASE_DIR / "survey.html").read_text(encoding="utf-8")
    html = html.replace("survey.js?v=1", "survey.js?v=4")
    html = inject_before(html, "</head>", '<link rel="stylesheet" href="modern-ui.css?v=5">')
    html = inject_before(html, "</head>", '<link rel="stylesheet" href="languages.css?v=1">')
    html = inject_before(html, "</head>", '<link rel="stylesheet" href="survey-mobile-v2.css?v=1">')
    html = inject_before(html, "</body>", '<script src="survey-experience.js?v=6"></script>')
    html = inject_before(html, "</body>", '<script src="survey-languages.js?v=3"></script>')
    html = inject_before(html, "</body>", '<script src="survey-runtime-fixes.js?v=2"></script>')
    html = inject_before(html, "</body>", '<script src="survey-mobile-v2.js?v=1"></script>')
    return HTMLResponse(html, headers={"Cache-Control": "no-store"})


def styled_html(name: str) -> HTMLResponse:
    html = (BASE_DIR / name).read_text(encoding="utf-8")
    html = inject_before(html, "</head>", '<link rel="stylesheet" href="modern-ui.css?v=5">')
    return HTMLResponse(html, headers={"Cache-Control": "no-store"})


def _remote_json(url: str) -> dict:
    req = Request(
        url,
        headers={
            "User-Agent": "ppgis-survey-builder-preview/1.0",
            "Accept": "application/json",
        },
    )
    with urlopen(req, timeout=8) as response:
        return json.loads(response.read().decode("utf-8"))


@app.get("/api/geocode", include_in_schema=False)
def geocode_place(
    q: str = Query(min_length=2, max_length=120),
    lang: str = Query(default="en", min_length=2, max_length=8),
):
    """Small same-origin geocoding proxy for interactive respondent place search."""
    query = q.strip()
    language = re.sub(r"[^A-Za-z-]", "", lang)[:8] or "en"
    results = []
    try:
        photon_url = "https://photon.komoot.io/api/?" + urlencode(
            {"q": query, "limit": 6, "lang": language.split("-")[0]}
        )
        data = _remote_json(photon_url)
        for feature in data.get("features", []):
            coords = (feature.get("geometry") or {}).get("coordinates") or []
            props = feature.get("properties") or {}
            if len(coords) < 2:
                continue
            parts = []
            for value in [props.get("name"), props.get("city"), props.get("state"), props.get("country")]:
                if value and value not in parts:
                    parts.append(str(value))
            results.append(
                {
                    "label": ", ".join(parts) or query,
                    "lat": float(coords[1]),
                    "lng": float(coords[0]),
                }
            )
    except Exception:
        try:
            nominatim_url = "https://nominatim.openstreetmap.org/search?" + urlencode(
                {
                    "q": query,
                    "format": "jsonv2",
                    "limit": 5,
                    "accept-language": language,
                }
            )
            data = _remote_json(nominatim_url)
            for item in data:
                results.append(
                    {
                        "label": item.get("display_name") or query,
                        "lat": float(item["lat"]),
                        "lng": float(item["lon"]),
                    }
                )
        except Exception:
            results = []
    return {"query": query, "results": results[:6]}


@app.get("/", include_in_schema=False)
def platform_home():
    return builder_html()


@app.get("/builder", include_in_schema=False)
def builder_page():
    return builder_html()


@app.get("/builder.html", include_in_schema=False)
def builder_html_page():
    return builder_html()


@app.get("/builder.js", include_in_schema=False)
def builder_script():
    return FileResponse(
        BASE_DIR / "builder.js",
        media_type="application/javascript",
        headers={"Cache-Control": "no-store, max-age=0"},
    )


@app.get("/admin", include_in_schema=False)
def admin_page():
    return styled_html("admin.html")


@app.get("/admin.html", include_in_schema=False)
def admin_html_page():
    return styled_html("admin.html")


@app.get("/survey", include_in_schema=False)
def survey_page():
    return survey_html()


@app.get("/survey.html", include_in_schema=False)
def survey_html_page():
    return survey_html()


@app.get("/lifres", include_in_schema=False)
def lifres_page():
    return styled_html("index.html")


for filename, media_type in {
    "platform.css": "text/css",
    "modern-ui.css": "text/css",
    "languages.css": "text/css",
    "builder-mobile.css": "text/css",
    "survey-mobile-v2.css": "text/css",
    "map-question-override.js": "application/javascript",
    "builder-experience.js": "application/javascript",
    "builder-languages.js": "application/javascript",
    "builder-mobile.js": "application/javascript",
    "survey-experience.js": "application/javascript",
    "survey-languages.js": "application/javascript",
    "survey-runtime-fixes.js": "application/javascript",
    "survey-mobile-v2.js": "application/javascript",
    "admin.js": "application/javascript",
    "survey.js": "application/javascript",
    "style.css": "text/css",
    "app.js": "application/javascript",
    "tu-dortmund-logo.svg": "image/svg+xml",
}.items():
    def make_handler(file_name=filename, file_type=media_type):
        def handler():
            return FileResponse(BASE_DIR / file_name, media_type=file_type)
        return handler
    app.add_api_route(f"/{filename}", make_handler(), methods=["GET"], include_in_schema=False)


@app.get("/builder.html/", include_in_schema=False)
def builder_trailing_slash():
    return RedirectResponse("/builder.html")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
