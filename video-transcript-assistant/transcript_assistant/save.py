from __future__ import annotations

from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output"


def save_results(source_name: str, transcript: str) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    stem = Path(source_name).stem or "transcript"
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = OUTPUT_DIR / f"{stem}_{stamp}.md"

    body = f"""# 文字起こし結果: {stem}

保存日時: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
※文字起こしは自分のPC内で作成されています

---

## 文字起こし

{transcript.strip() or "（空）"}
"""
    out_path.write_text(body, encoding="utf-8")
    return out_path
