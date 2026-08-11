from __future__ import annotations

import json
import wave
from pathlib import Path
from typing import Any, Callable

from vosk import KaldiRecognizer, Model

ROOT = Path(__file__).resolve().parents[1]
VOSK_MODEL = ROOT / "models" / "vosk-model-small-ja-0.22"

ProgressCb = Callable[[float, str], None]
_model: Model | None = None


def _noop(_p: float, _m: str) -> None:
    return


def _get_model() -> Model:
    global _model
    if _model is None:
        if not VOSK_MODEL.exists():
            raise RuntimeError(
                f"Voskモデルがありません: {VOSK_MODEL}\n"
                "models/vosk-model-small-ja-0.22 を配置してください。"
            )
        _model = Model(str(VOSK_MODEL))
    return _model


def transcribe_vosk(
    audio_path: str,
    progress: ProgressCb | None = None,
) -> dict[str, Any]:
    """Fast local Japanese ASR (usually much quicker than Whisper on CPU)."""
    progress = progress or _noop
    progress(0.05, "高速エンジン（Vosk）を準備中…")
    model = _get_model()

    path = Path(audio_path)
    with wave.open(str(path), "rb") as wf:
        if wf.getnchannels() != 1 or wf.getsampwidth() != 2 or wf.getcomptype() != "NONE":
            raise RuntimeError("Vosk には 16-bit mono PCM WAV が必要です")
        rate = wf.getframerate()
        total_frames = max(1, wf.getnframes())
        rec = KaldiRecognizer(model, rate)
        rec.SetWords(True)

        texts: list[str] = []
        segments: list[dict[str, Any]] = []
        read = 0
        chunk = 8000
        progress(0.1, "高速文字起こし中…")
        while True:
            data = wf.readframes(chunk)
            if not data:
                break
            read += len(data) // (wf.getnchannels() * wf.getsampwidth())
            if rec.AcceptWaveform(data):
                _consume_result(json.loads(rec.Result()), texts, segments)
            progress(min(0.95, 0.1 + 0.85 * (read / total_frames)), "高速文字起こし中…")

        _consume_result(json.loads(rec.FinalResult()), texts, segments)

    # Japanese: drop inter-word spaces from Vosk
    plain = "".join(texts)
    stamped_lines = []
    for seg in segments:
        stamped_lines.append(f"[{_fmt(seg['start'])}] {seg['text']}")
    stamped = "\n".join(stamped_lines) if stamped_lines else plain
    duration = float(segments[-1]["end"]) if segments else total_frames / float(rate)
    progress(1.0, "高速文字起こし完了")
    return {
        "language": "ja",
        "duration": duration,
        "segments": segments,
        "text": plain,
        "text_with_timestamps": stamped,
        "model_size": "vosk-small-ja",
        "engine": "vosk",
    }


def _consume_result(result: dict[str, Any], texts: list[str], segments: list[dict[str, Any]]) -> None:
    words = result.get("result") or []
    text = (result.get("text") or "").replace(" ", "").strip()
    if text:
        texts.append(text)
    if words:
        start = float(words[0].get("start", 0))
        end = float(words[-1].get("end", start))
        piece = "".join(str(w.get("word", "")) for w in words).strip()
        if piece:
            segments.append({"start": start, "end": end, "text": piece})
    elif text:
        segments.append({"start": 0.0, "end": 0.0, "text": text})


def _fmt(seconds: float) -> str:
    seconds = max(0.0, float(seconds))
    m = int(seconds // 60)
    s = int(seconds % 60)
    return f"{m:02d}:{s:02d}"
