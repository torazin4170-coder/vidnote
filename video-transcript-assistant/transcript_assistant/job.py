from __future__ import annotations

import subprocess
import threading
from typing import Any

_lock = threading.Lock()
_proc: subprocess.Popen[Any] | None = None
_cancel_requested = False


class TranscriptionCancelled(Exception):
    """Raised when the user cancels an in-progress transcription."""


def begin_job() -> None:
    global _cancel_requested
    with _lock:
        _cancel_requested = False


def register_process(proc: subprocess.Popen[Any]) -> None:
    global _proc
    with _lock:
        _proc = proc


def clear_process(proc: subprocess.Popen[Any] | None = None) -> None:
    global _proc
    with _lock:
        if proc is None or _proc is proc:
            _proc = None


def is_cancel_requested() -> bool:
    with _lock:
        return _cancel_requested


def request_cancel() -> bool:
    """Request cancel and kill the running whisper process. Returns True if a process was signaled."""
    global _cancel_requested, _proc
    with _lock:
        _cancel_requested = True
        proc = _proc
    if proc is None or proc.poll() is not None:
        return False
    try:
        proc.terminate()
    except Exception:
        pass
    try:
        proc.wait(timeout=3)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass
    return True
