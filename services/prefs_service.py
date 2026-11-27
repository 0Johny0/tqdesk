# -*- coding: utf-8 -*-
"""用户偏好持久化：JSON 文件读写（自选、模板、设置等）"""
import json
import threading
from pathlib import Path

_PREFS_FILE = Path(__file__).parent.parent / "data" / "user_prefs.json"
_lock = threading.Lock()


def load_prefs() -> dict:
    with _lock:
        try:
            return json.loads(_PREFS_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}


def save_prefs(prefs: dict):
    with _lock:
        _PREFS_FILE.parent.mkdir(parents=True, exist_ok=True)
        _PREFS_FILE.write_text(
            json.dumps(prefs, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )