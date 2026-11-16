import traceback

from fastapi import APIRouter, HTTPException, Query, Response

from api.schemas import LoginIn, WatchIn
from core.tq_service import TqService

# 过渡性状态（被作废/尚未登录/断线重连中）返回 200 + cancelled，由前端静默处理
QUIET_MARKS = ("已被更新", "尚未登录", "连接中断", "自动重连")


def create_tq_router(svc: TqService) -> APIRouter:
    router = APIRouter()

    def _run(label, fn):
        try:
            return fn()
        except Exception as e:
            msg = str(e)
            if any(m in msg for m in QUIET_MARKS):
                return {"cancelled": True, "message": msg}
            print(f"[tq-routes] {label} 失败: {msg}", flush=True)
            traceback.print_exc()
            raise HTTPException(500, detail=msg)

    @router.get("/api/status")
    def status(response: Response):
        response.headers["Cache-Control"] = "no-store"
        return {"logged_in": svc.is_logged_in, "error": svc.error}

    @router.post("/api/login")
    def login(body: LoginIn):
        try:
            svc.call("login", body.user.strip(), body.pwd, timeout=60)
            return {"ok": True}
        except Exception as e:
            raise HTTPException(400, detail=str(e))

    @router.post("/api/logout")
    def logout():
        try:
            svc.call("logout")
        except Exception:
            pass
        return {"ok": True}

    @router.get("/api/products")
    def products(response: Response):
        response.headers["Cache-Control"] = "no-store"
        return _run("products", lambda: {"products": svc.call("products", timeout=40)})

    @router.get("/api/quote")
    def quote(response: Response, symbol: str = Query(...)):
        response.headers["Cache-Control"] = "no-store"
        return _run("quote", lambda: svc.call("quote", symbol))

    @router.get("/api/kline")
    def kline(response: Response, symbol: str = Query(...),
              duration: int = Query(300), limit: int = Query(240)):
        response.headers["Cache-Control"] = "no-store"
        if duration not in (60, 300, 900, 1800, 3600, 86400):
            raise HTTPException(400, detail="非法周期")
        limit = max(50, min(int(limit), 1000))
        return _run("kline", lambda: {"rows": svc.call("kline", symbol, duration, limit)})

    @router.get("/api/watch")
    def watch(response: Response):
        """自选行情快照：零等待直读热订阅对象，供高频轮询"""
        response.headers["Cache-Control"] = "no-store"
        return {"quotes": svc.watch_snapshot()}

    @router.post("/api/watch/sync")
    def watch_sync(body: WatchIn):
        """同步自选订阅表（新增/移除自选后调用）"""
        try:
            svc.call("watch", tuple(body.symbols))
        except Exception:
            pass
        return {"ok": True}

    print("[tq-routes] loaded: quiet-200 + watch mode", flush=True)
    return router