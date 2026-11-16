from fastapi import APIRouter, Query

from services.spot_service import fetch_spot

router = APIRouter()


@router.get("/api/spot")
def spot(name: str = Query(None), product: str = Query(None), date: str = Query(None)):
    return fetch_spot(name=name, product=product, date=date)