"""Small persistent cache for stable ATS inputs."""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from pathlib import Path
from threading import Lock
from typing import Any

_CACHE_PATH = Path(__file__).resolve().parent / ".cache" / "scoring_inputs.json"
_CACHE_LOCK = Lock()


def _cache_key(kind: str, text: str) -> str:
    return hashlib.sha256(f"{kind}\0{text}".encode("utf-8")).hexdigest()


def _read_cache() -> dict[str, Any]:
    try:
        with _CACHE_PATH.open("r", encoding="utf-8") as cache_file:
            data = json.load(cache_file)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def get_cached(kind: str, text: str) -> Any | None:
    with _CACHE_LOCK:
        return _read_cache().get(_cache_key(kind, text))


def set_cached(kind: str, text: str, value: Any) -> None:
    with _CACHE_LOCK:
        try:
            cache = _read_cache()
            cache[_cache_key(kind, text)] = value
            _CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
            fd, temp_name = tempfile.mkstemp(dir=_CACHE_PATH.parent, suffix=".tmp")
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as cache_file:
                    json.dump(cache, cache_file, ensure_ascii=True, separators=(",", ":"))
                os.replace(temp_name, _CACHE_PATH)
            finally:
                if os.path.exists(temp_name):
                    try:
                        os.unlink(temp_name)
                    except OSError:
                        pass
        except Exception:
            pass
