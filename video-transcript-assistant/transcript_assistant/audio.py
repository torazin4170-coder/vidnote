from __future__ import annotations

import shutil
import subprocess
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMP_DIR = ROOT / "temp"


def _ffmpeg_bin() -> str:
    return shutil.which("ffmpeg") or "ffmpeg"


def extract_audio(video_path: str | Path, out_dir: Path | None = None) -> Path:
    """Extract mono 16kHz WAV for Whisper (local FFmpeg only)."""
    video_path = Path(video_path)
    if not video_path.exists():
        raise RuntimeError(f"動画が見つかりません: {video_path}")

    out_dir = out_dir or TEMP_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{video_path.stem}_{uuid.uuid4().hex[:8]}.wav"

    cmd = [
        _ffmpeg_bin(),
        "-y",
        "-i",
        str(video_path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        str(out_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0 or not out_path.exists() or out_path.stat().st_size == 0:
        err = (proc.stderr or "")[-800:]
        raise RuntimeError("音声の取り出しに失敗しました（FFmpeg）。\n" + err)
    return out_path
