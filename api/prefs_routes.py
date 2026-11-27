from typing import Any, Dict

from fastapi import APIRouter, Body, Response

from services.prefs_service import load_prefs, save_prefs

router = APIRouter()


@router.get("/api/prefs")
def get_prefs(response: Response):
    response.headers["Cache-Control"] = "no-store"
    return load_prefs()


@router.post("/api/prefs")
def post_prefs(prefs: Dict[str, Any] = Body(...)):
    save_prefs(prefs)
    return {"ok": True}