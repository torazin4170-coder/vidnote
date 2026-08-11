from __future__ import annotations

import json
import os
import re
import subprocess
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Callable

from .job import (
    TranscriptionCancelled,
    begin_job,
    clear_process,
    is_cancel_requested,
    register_process,
)
from .models import ensure_model

ROOT = Path(__file__).resolve().parents[1]

_CLI_CANDIDATES = [
    ROOT / "vendor" / "whisper" / "Release" / "whisper-cli.exe",
    ROOT / "vendor" / "whisper-blas" / "Release" / "whisper-cli.exe",
    ROOT / "vendor" / "whisper-cuda" / "Release" / "whisper-cli.exe",
]

ProgressCb = Callable[[float, str], None]
_PROGRESS_RE = re.compile(r"progress\s*=\s*(\d+)\s*%", re.I)


@dataclass
class Segment:
    start: float
    end: float
    text: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _noop(_p: float, _m: str) -> None:
    return


def _find_cli() -> Path:
    for path in _CLI_CANDIDATES:
        if path.exists():
            return path
    raise RuntimeError(
        "whisper-cli.exe が見つかりません。run.bat で vendor/whisper を用意してください。"
    )


def segments_to_text(segments: list[Segment]) -> str:
    lines: list[str] = []
    for seg in segments:
        text = seg.text.strip()
        if text:
            lines.append(text)
    return "\n".join(lines)


_TS = re.compile(r"(\d{2}):(\d{2}):(\d{2})[,.](\d{3})")


def _parse_ts(value: str) -> float:
    m = _TS.fullmatch(value.strip())
    if not m:
        return 0.0
    h, mi, s, ms = map(int, m.groups())
    return h * 3600 + mi * 60 + s + ms / 1000.0


def transcribe_audio(
    audio_path: str,
    model_size: str = "small",
    language: str = "ja",
    progress: ProgressCb | None = None,
) -> dict[str, Any]:
    """Local transcription via whisper.cpp (plain text, cancellable)."""
    progress = progress or _noop
    cli = _find_cli()
    begin_job()

    if model_size.startswith("large"):
        progress(
            0.01,
            "注意: large 系はこのPCでは非常に遅くなります。small / medium を推奨…",
        )

    progress(0.03, f"モデル準備中（{model_size}）…")
    if is_cancel_requested():
        raise TranscriptionCancelled("文字起こしを中断しました")
    model = ensure_model(model_size, progress=progress)

    audio_path = Path(audio_path)
    out_base = audio_path.parent / f"{audio_path.stem}_whisper"
    threads = max(2, min(8, os.cpu_count() or 4))

    progress(0.08, f"文字起こし開始（{model_size} / スレッド{threads}）…")
    cmd = [
        str(cli),
        "-m",
        str(model),
        "-f",
        str(audio_path),
        "-l",
        language if language != "auto" else "auto",
        "-oj",
        "-of",
        str(out_base),
        "-pp",
        "-nt",  # no timestamps in console; we still parse JSON offsets if present
        "-t",
        str(threads),
        "-bs",
        "1",
        "-bo",
        "1",
    ]

    t0 = time.time()
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )
    register_process(proc)

    try:
        assert proc.stdout is not None
        for line in proc.stdout:
            if is_cancel_requested():
                try:
                    proc.terminate()
                except Exception:
                    pass
                raise TranscriptionCancelled("文字起こしを中断しました")
            m = _PROGRESS_RE.search(line)
            if m:
                pct = int(m.group(1))
                ui = 0.08 + 0.87 * (pct / 100.0)
                elapsed = time.time() - t0
                eta = ""
                if pct >= 5:
                    total_est = elapsed / (pct / 100.0)
                    remain = max(0.0, total_est - elapsed)
                    eta = f" / 残り roughly {remain/60:.1f} 分"
                progress(ui, f"文字起こし中… {pct}%（モデル {model_size}）{eta}")

        code = proc.wait()
        if is_cancel_requested():
            raise TranscriptionCancelled("文字起こしを中断しました")

        json_path = Path(str(out_base) + ".json")
        if code != 0 or not json_path.exists():
            raise RuntimeError(
                f"文字起こしに失敗しました（exit={code}）。モデル={model_size}\n"
                "small で再試行するか、動画を短く区切ってください。"
            )

        data = json.loads(json_path.read_text(encoding="utf-8"))
        segments: list[Segment] = []
        for item in data.get("transcription") or []:
            offsets = item.get("offsets") or {}
            start = float(offsets.get("from", 0)) / 1000.0
            end = float(offsets.get("to", 0)) / 1000.0
            if "timestamps" in item and start == 0 and end == 0:
                ts = item["timestamps"]
                start = _parse_ts(str(ts.get("from", "00:00:00,000")))
                end = _parse_ts(str(ts.get("to", "00:00:00,000")))
            text = str(item.get("text", "")).strip()
            if text:
                segments.append(Segment(start=start, end=end, text=text))

        elapsed = time.time() - t0
        progress(1.0, f"文字起こし完了（{elapsed/60:.1f} 分）")
        plain = segments_to_text(segments)
        duration = float(segments[-1].end) if segments else 0.0
        lang = ((data.get("result") or {}).get("language")) or language
        return {
            "language": lang,
            "duration": duration,
            "segments": [s.to_dict() for s in segments],
            "text": plain,
            "elapsed_sec": elapsed,
            "model_size": model_size,
            "engine": "whisper.cpp",
        }
    finally:
        clear_process(proc)
