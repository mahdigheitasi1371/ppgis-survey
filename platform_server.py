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
from fastapi import HTTPException
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, Response

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
    html = html.replace("builder.js?v=1", "builder.js?v=21")
    return HTMLResponse(html, headers={"Cache-Control": "no-store, max-age=0"})


def map_config_script() -> str:
    """Optional map settings for the survey page, read from /etc/ppgis-survey.env.

    ESRI_API_KEY: ArcGIS Location Platform key for sharp worldwide satellite images
    (Esri World Imagery). Restrict the key to this site's address in the ArcGIS dashboard.
    """
    config = {"esriKey": os.environ.get("ESRI_API_KEY", "").strip()}
    return "<script>window.PPGIS_CONFIG=" + json.dumps(config).replace("</", "<\\/") + ";</script>"


def survey_html() -> HTMLResponse:
    html = (BASE_DIR / "survey.html").read_text(encoding="utf-8")
    html = inject_before(html, "</head>", map_config_script())
    html = html.replace("survey.js?v=1", "survey.js?v=6")
    html = inject_before(html, "</head>", '<link rel="stylesheet" href="modern-ui.css?v=13">')
    html = inject_before(html, "</head>", '<link rel="stylesheet" href="languages.css?v=1">')
    html = inject_before(html, "</head>", '<link rel="stylesheet" href="survey-mobile-v2.css?v=13">')
    html = inject_before(html, "</body>", '<script src="survey-map3d.js?v=10"></script>')
    html = inject_before(html, "</body>", '<script src="survey-voice.js?v=2"></script>')
    html = inject_before(html, "</body>", '<script src="survey-experience.js?v=20"></script>')
    html = inject_before(html, "</body>", '<script src="survey-languages.js?v=7"></script>')
    html = inject_before(html, "</body>", '<script src="survey-runtime-fixes.js?v=2"></script>')
    html = inject_before(html, "</body>", '<script src="survey-mobile-v2.js?v=3"></script>')
    return HTMLResponse(html, headers={"Cache-Control": "no-store"})


def styled_html(name: str) -> HTMLResponse:
    html = (BASE_DIR / name).read_text(encoding="utf-8")
    html = inject_before(html, "</head>", '<link rel="stylesheet" href="modern-ui.css?v=13">')
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


# --- Aerial photo tiles for the 3D map ---------------------------------------
# Free official aerial photos, fetched by this server and served as normal web-map tiles:
#   * North Rhine-Westphalia: Geobasis NRW DOP, 10 cm (Datenlizenz Deutschland Zero 2.0), WMS
#   * Spain: PNOA maxima actualidad, Instituto Geografico Nacional (CC BY 4.0), WMTS
# Same-origin tiles work in WebGL maps, participants' browsers never contact a third party,
# and tiles are cached on disk (tile_cache/, safe to delete). Tiles are 256 px; the 3D map asks
# for one zoom level more on high-resolution screens, so photos stay sharp there too.
import math
import threading
import time

TILE_CACHE_DIR = BASE_DIR / "tile_cache" / "aerial256"
_tile_lock = threading.Lock()
MISS_RETRY_SECONDS = 7 * 24 * 3600   # try again after a week where no photo was found
BLANK_TILE_BYTES = 2500             # a uniform (empty) 256 px JPEG is smaller than this


def _tile_bbox_3857(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    size = 2 * math.pi * 6378137.0
    span = size / (2 ** z)
    minx = -size / 2 + x * span
    maxy = size / 2 - y * span
    return minx, maxy - span, minx + span, maxy


def _tile_center_lnglat(z: int, x: int, y: int) -> tuple[float, float]:
    n = 2 ** z
    lng = (x + 0.5) / n * 360.0 - 180.0
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 0.5) / n))))
    return lng, lat


def _nrw_url(z: int, x: int, y: int) -> str:
    minx, miny, maxx, maxy = _tile_bbox_3857(z, x, y)
    return "https://www.wms.nrw.de/geobasis/wms_nw_dop?" + urlencode({
        "SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetMap", "LAYERS": "nw_dop_rgb", "STYLES": "",
        "CRS": "EPSG:3857", "BBOX": f"{minx},{miny},{maxx},{maxy}", "WIDTH": "256", "HEIGHT": "256",
        "FORMAT": "image/jpeg",
    })


def _pnoa_url(z: int, x: int, y: int) -> str:
    return "https://www.ign.es/wmts/pnoa-ma?" + urlencode({
        "request": "getTile", "layer": "OI.OrthoimageCoverage", "TileMatrixSet": "GoogleMapsCompatible",
        "TileMatrix": str(z), "TileCol": str(x), "TileRow": str(y), "format": "image/jpeg",
    })


# (name, [lon_min, lat_min, lon_max, lat_max] boxes, max zoom, url builder) - most specific first
AERIAL_SOURCES = [
    ("NRW", [(5.85, 50.32, 9.47, 52.54)], 20, _nrw_url),
    ("PNOA", [(-9.6, 35.8, 4.5, 43.95), (-18.3, 27.5, -13.3, 29.5)], 20, _pnoa_url),
]


def _fetch_image(url: str) -> bytes | None:
    try:
        with urlopen(Request(url, headers={"User-Agent": "ppgis-survey/1.0"}), timeout=15) as response:
            data = response.read()
            if not response.headers.get("Content-Type", "").startswith("image/"):
                return None
            return data if len(data) >= BLANK_TILE_BYTES else None
    except Exception as exc:  # noqa: BLE001
        print(f"aerial source error {url[:80]}: {exc}", flush=True)  # visible in: journalctl -u ppgis-survey
        return None


@app.get("/api/tiles/aerial/{z}/{x}/{y}.jpg", include_in_schema=False)
def aerial_tile(z: int, x: int, y: int):
    if not (8 <= z <= 20) or not (0 <= x < 2 ** z) or not (0 <= y < 2 ** z):
        raise HTTPException(status_code=404, detail="Tile out of range")
    folder = TILE_CACHE_DIR / str(z) / str(x)
    path, miss = folder / f"{y}.jpg", folder / f"{y}.none"
    headers = {"Cache-Control": "public, max-age=2592000"}
    if path.is_file():
        return FileResponse(path, media_type="image/jpeg", headers=headers)
    if miss.is_file() and time.time() - miss.stat().st_mtime < MISS_RETRY_SECONDS:
        raise HTTPException(status_code=404, detail="No aerial photo here")
    lng, lat = _tile_center_lnglat(z, x, y)
    candidates = [src for src in AERIAL_SOURCES
                  if z <= src[2] and any(a <= lng <= c and b <= lat <= d for a, b, c, d in src[1])]
    if not candidates:
        raise HTTPException(status_code=404, detail="No aerial photo here")
    data = None
    for _name, _boxes, _maxz, build in candidates:
        data = _fetch_image(build(z, x, y))
        if data:
            break
    with _tile_lock:
        folder.mkdir(parents=True, exist_ok=True)
        if not data:
            miss.touch()
            raise HTTPException(status_code=404, detail="No aerial photo here")
        tmp = path.with_suffix(".tmp")
        tmp.write_bytes(data)
        tmp.replace(path)
        miss.unlink(missing_ok=True)
    return Response(content=data, media_type="image/jpeg", headers=headers)


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
    "survey-mobile-v2.css": "text/css",
    "survey-experience.js": "application/javascript",
    "survey-map3d.js": "application/javascript",
    "survey-voice.js": "application/javascript",
    "survey-languages.js": "application/javascript",
    "survey-runtime-fixes.js": "application/javascript",
    "survey-mobile-v2.js": "application/javascript",
    "admin.js": "application/javascript",
    "admin-charts.js": "application/javascript",
    "admin-charts.css": "text/css",
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
