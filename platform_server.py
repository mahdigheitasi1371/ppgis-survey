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
from pathlib import Path

from fastapi.responses import FileResponse, RedirectResponse

from api_server import app
from survey_platform import router as survey_platform_router

BASE_DIR = Path(__file__).resolve().parent
app.include_router(survey_platform_router)


def local_file(name: str) -> FileResponse:
    return FileResponse(BASE_DIR / name)


@app.get("/", include_in_schema=False)
def platform_home():
    return local_file("builder.html")


@app.get("/builder", include_in_schema=False)
def builder_page():
    return local_file("builder.html")


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
    "builder.html": "text/html",
    "admin.html": "text/html",
    "survey.html": "text/html",
    "platform.css": "text/css",
    "builder.js": "application/javascript",
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
