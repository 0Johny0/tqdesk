# -*- coding: utf-8 -*-
"""天勤行情工作台 · 入口（装配 + 启动）
运行: python app.py  →  http://127.0.0.1:8848
也可: uvicorn app:app --port 8848  （Docker 内如此，自动登录同样生效）
"""
import os
import threading

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from api.page_routes import WEB_DIR, router as page_router
from api.spot_routes import router as spot_router
from api.tq_routes import create_tq_router
from core.tq_service import TqService
from services.spot_service import warm_spot_table


def create_app() -> FastAPI:
    svc = TqService()
    app = FastAPI(title="天勤行情工作台")
    app.include_router(create_tq_router(svc))
    app.include_router(spot_router)
    app.include_router(page_router)
    app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")
    app.state.tq = svc
    warm_spot_table()               # 后台预热现货表，消除当天首查延迟

    # 启动自动登录（环境变量 TQ_USER / TQ_PASS）
    # 注意：必须放在这里而非 __main__ ——Docker 用 `uvicorn app:app` 启动时
    # 本模块以 import 方式加载，__main__ 分支不会执行
    u, p = os.environ.get("TQ_USER"), os.environ.get("TQ_PASS")
    if u and p:
        threading.Thread(
            target=lambda: svc.call("login", u, p, timeout=60), daemon=True
        ).start()
    return app


app = create_app()

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8848)