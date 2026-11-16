from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

WEB_DIR = Path(__file__).resolve().parent.parent / "web"
router = APIRouter()


@router.get("/", include_in_schema=False)
def index():
    return FileResponse(WEB_DIR / "index.html")