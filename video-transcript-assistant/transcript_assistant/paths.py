from __future__ import annotations

import shutil
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMP_DIR = ROOT / "temp"


def safe_work_copy(src: str | Path, suffix: str | None = None) -> Path:
    """
    Copy input to an ASCII-only temp path.
    Avoids Japanese filename / Gradio temp permission issues on Windows.
    """
    src = Path(src)
    if not src.exists():
        raise RuntimeError(f"入力ファイルが見つかりません: {src}")

    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    ext = suffix if suffix is not None else src.suffix
    if not ext.startswith("."):
        ext = f".{ext}" if ext else ""
    dest = TEMP_DIR / f"input_{uuid.uuid4().hex[:10]}{ext or '.bin'}"
    shutil.copy2(src, dest)
    return dest
