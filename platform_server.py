"""Combined server for the original LiFRES survey and the survey-builder platform.

Run:
    ADMIN_KEY=choose-a-secret python platform_server.py

Surfaces:
    /          builder
    /admin     admin dashboard
    /survey    generic public survey runner
    /lifres    original LiFRES survey
"""
import os
import re
from pathlib import Path

from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, Response

from api_server import app
from survey_platform import router as survey_platform_router

BASE_DIR = Path(__file__).resolve().parent
app.include_router(survey_platform_router)


def local_file(name: str) -> FileResponse:
    return FileResponse(BASE_DIR / name)


def builder_html() -> HTMLResponse:
    html = (BASE_DIR / "builder.html").read_text(encoding="utf-8")
    html = html.replace("builder.js?v=1", "builder.js?v=3")
    return HTMLResponse(html, headers={"Cache-Control": "no-store"})


def builder_javascript() -> str:
    """Serve the builder with one unified point-map question.

    The underlying runner already supports map_multi with maxPoints, so we keep
    that storage type and simplify only the builder surface. This also avoids
    breaking surveys created with the earlier preview builds.
    """
    js = (BASE_DIR / "builder.js").read_text(encoding="utf-8")

    js = js.replace(
        "Maps:[['map_point','Map point'],['map_multi','Multi-point map'],['map_line','Map line / route'],['map_polygon','Map area']]",
        "Maps:[['map_multi','Map question']]",
    )

    js = js.replace(
        "if(type.startsWith('map_'))Object.assign(q.config,{lat:51.5136,lng:7.4653,zoom:12,maxPoints:type==='map_point'?1:10,maxVertices:50,popup:{enabled:type==='map_multi',type:'single_choice',question:'Tell us more about this place',options:['Positive','Neutral','Negative']}});",
        "if(type==='map_multi')Object.assign(q.config,{lat:51.5136,lng:7.4653,zoom:12,maxPoints:1,popup:{enabled:false,type:'single_choice',question:'Tell us more about this place',options:['Positive','Neutral','Negative']}});",
    )

    unified_map_config = r'''function mapConfig(q){let c=q.config,p=c.popup||{};c.maxPoints=Math.min(50,Math.max(1,Number(c.maxPoints)||1));return `<div class="inspector-section"><div class="panel-title">Map configuration</div><div class="row">${f('Latitude',`<input id="lat" type="number" step=".0001" value="${c.lat??51.5136}">`)}${f('Longitude',`<input id="lng" type="number" step=".0001" value="${c.lng??7.4653}">`)}</div>${f('Zoom',`<input id="zoom" type="number" min="3" max="19" value="${c.zoom||12}">`)}${f('Maximum points',`<input id="maxPoints" type="number" min="1" max="50" step="1" value="${c.maxPoints}">`,'Choose any value from 1 to 50. Use 1 for a single-point map.')}</div><div class="inspector-section"><div class="panel-title">Popup follow-up</div><label class="check-row"><input id="popOn" type="checkbox" ${p.enabled?'checked':''}> Ask after each mapped point</label>${f('Popup question',inp(p.question||'','popQ'))}${f('Popup type','<select id="popType"><option value="short_text">Open text</option><option value="single_choice">Single choice</option><option value="rating">1–5 rating</option></select>')}${listEditor('popOptions','Popup choices',p.options||[])}</div>`}'''
    js = re.sub(
        r"function mapConfig\(q\)\{.*?\}(?=\nfunction logic\(q\))",
        unified_map_config,
        js,
        flags=re.S,
    )

    js = js.replace(
        "function bind(id,fn,event='input'){let e=$('#'+id);if(e)e.addEventListener(event,x=>{fn(x.target.type==='number'?(x.target.value===''?'':Number(x.target.value)):x.target.value);renderCanvas()})}",
        "function bind(id,fn,event='input'){let e=$('#'+id);if(e)e.addEventListener(event,x=>{let v=x.target.type==='number'?(x.target.value===''?'':Number(x.target.value)):x.target.value;if(id==='maxPoints'&&v!=='')v=Math.min(50,Math.max(1,Number(v)||1));fn(v);renderCanvas()})}",
    )

    return js


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
    return Response(
        builder_javascript(),
        media_type="application/javascript",
        headers={"Cache-Control": "no-store"},
    )


@app.get("/admin", include_in_schema=False)
def admin_page():
    return local_file("admin.html")


@app.get("/survey", include_in_schema=False)
def survey_page():
    return local_file("survey.html")


@app.get("/lifres", include_in_schema=False)
def lifres_page():
    return local_file("index.html")


for filename, media_type in {
    "admin.html": "text/html",
    "survey.html": "text/html",
    "platform.css": "text/css",
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
