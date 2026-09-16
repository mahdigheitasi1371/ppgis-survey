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
    html = (BASE_DIR / "builder.html").read_text(encoding="utf-8")
    html = html.replace("builder.js?v=1", "builder.js?v=6")
    html = inject_before(html, "</head>", '<link rel="stylesheet" href="modern-ui.css?v=3">')
    html = inject_before(html, "</body>", '<script src="map-question-override.js?v=3"></script>')
    html = inject_before(html, "</body>", '<script src="builder-experience.js?v=3"></script>')
    return HTMLResponse(html, headers={"Cache-Control": "no-store"})


def survey_html() -> HTMLResponse:
    html = (BASE_DIR / "survey.html").read_text(encoding="utf-8")
    html = html.replace("survey.js?v=1", "survey.js?v=4")
    html = inject_before(html, "</head>", '<link rel="stylesheet" href="modern-ui.css?v=3">')
    html = inject_before(html, "</body>", '<script src="survey-experience.js?v=3"></script>')
    return HTMLResponse(html, headers={"Cache-Control": "no-store"})


def styled_html(name: str) -> HTMLResponse:
    html = (BASE_DIR / name).read_text(encoding="utf-8")
    html = inject_before(html, "</head>", '<link rel="stylesheet" href="modern-ui.css?v=3">')
    return HTMLResponse(html, headers={"Cache-Control": "no-store"})


def builder_javascript() -> str:
    """Serve the builder with point, line, and polygon map questions."""
    js = (BASE_DIR / "builder.js").read_text(encoding="utf-8")
    js = js.replace(
        "Maps:[['map_point','Map point'],['map_multi','Multi-point map'],['map_line','Map line / route'],['map_polygon','Map area']]",
        "Maps:[['map_multi','Point map'],['map_line','Line map'],['map_polygon','Polygon map']]",
    )
    js = js.replace(
        "if(type.startsWith('map_'))Object.assign(q.config,{lat:51.5136,lng:7.4653,zoom:12,maxPoints:type==='map_point'?1:10,maxVertices:50,popup:{enabled:type==='map_multi',type:'single_choice',question:'Tell us more about this place',options:['Positive','Neutral','Negative']}});",
        "if(['map_multi','map_line','map_polygon'].includes(type))Object.assign(q.config,{lat:51.5136,lng:7.4653,zoom:12,maxPoints:type==='map_multi'?1:10,maxVertices:type==='map_polygon'?30:30,allowGeo:true,allowCitySearch:true,mapPage:true,popup:{enabled:false,type:'single_choice',question:type==='map_multi'?'Tell us more about this place':'Tell us more about this vertex',options:['Positive','Neutral','Negative']}});",
    )
    unified_map_config = r'''function mapConfig(q){let c=q.config,p=c.popup||{};let point=q.type==='map_multi',polygon=q.type==='map_polygon',key=point?'maxPoints':'maxVertices',min=point?1:(polygon?3:2),max=point?50:100;c[key]=Math.min(max,Math.max(min,Number(c[key])||(point?1:30)));if(c.allowGeo===undefined)c.allowGeo=true;if(c.allowCitySearch===undefined)c.allowCitySearch=true;c.mapPage=true;return `<div class="inspector-section"><div class="panel-title">Map experience</div>${f(point?'Maximum points':'Maximum vertices',`<input id="${key}" type="number" min="${min}" max="${max}" step="1" value="${c[key]}">`,point?'Choose from 1 to 50 locations.':`${polygon?'Polygons need at least 3 vertices.':'Lines need at least 2 vertices.'} Choose up to 100 vertices.`)}<label class="check-row"><input id="allowGeo" type="checkbox" ${c.allowGeo!==false?'checked':''}> Offer “Use my location”</label><label class="check-row"><input id="allowCitySearch" type="checkbox" ${c.allowCitySearch!==false?'checked':''}> Offer city/place search</label></div><div class="inspector-section"><div class="panel-title">Starting map view</div><div class="row">${f('Latitude',`<input id="lat" type="number" step=".0001" value="${c.lat??51.5136}">`)}${f('Longitude',`<input id="lng" type="number" step=".0001" value="${c.lng??7.4653}">`)}</div>${f('Zoom',`<input id="zoom" type="number" min="3" max="19" value="${c.zoom||12}">`)}</div><div class="inspector-section"><div class="panel-title">${point?'Point':'Vertex'} follow-up</div><label class="check-row"><input id="popOn" type="checkbox" ${p.enabled?'checked':''}> Ask after each mapped ${point?'point':'vertex'}</label>${f('Follow-up question',inp(p.question||'','popQ'))}${f('Follow-up type','<select id="popType"><option value="short_text">Open text</option><option value="single_choice">Single choice</option><option value="rating">1–5 rating</option></select>')}${listEditor('popOptions','Follow-up choices',p.options||[])}</div>`}'''
    js = re.sub(r"function mapConfig\(q\)\{.*?\}(?=\nfunction logic\(q\))", unified_map_config, js, flags=re.S)
    js = js.replace(
        "function bind(id,fn,event='input'){let e=$('#'+id);if(e)e.addEventListener(event,x=>{fn(x.target.type==='number'?(x.target.value===''?'':Number(x.target.value)):x.target.value);renderCanvas()})}",
        "function bind(id,fn,event='input'){let e=$('#'+id);if(e)e.addEventListener(event,x=>{let v=x.target.type==='number'?(x.target.value===''?'':Number(x.target.value)):x.target.value;if(id==='maxPoints'&&v!=='')v=Math.min(50,Math.max(1,Number(v)||1));if(id==='maxVertices'&&v!=='')v=Math.min(100,Math.max(2,Number(v)||2));fn(v);renderCanvas()})}",
    )
    return js


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
    return Response(builder_javascript(), media_type="application/javascript", headers={"Cache-Control": "no-store"})


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
    "map-question-override.js": "application/javascript",
    "builder-experience.js": "application/javascript",
    "survey-experience.js": "application/javascript",
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
