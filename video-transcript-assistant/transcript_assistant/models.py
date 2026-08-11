from __future__ import annotations

import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODELS_DIR = ROOT / "models"

# Hugging Face 直下が不通な環境向けにミラーを優先
MODEL_URLS = {
    "tiny": "https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
    "base": "https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
    "small": "https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
    "medium": "https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin",
    "large-v3": "https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin",
}

FALLBACK_URLS = {
    "tiny": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
    "base": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
    "small": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
    "medium": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin",
    "large-v3": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin",
}


def model_path(model_size: str) -> Path:
    return MODELS_DIR / f"ggml-{model_size}.bin"


def ensure_model(model_size: str, progress=None) -> Path:
    """Download ggml model into models/ if missing (local cache thereafter)."""
    if model_size not in MODEL_URLS:
        raise RuntimeError(f"未対応のモデルです: {model_size}")

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    path = model_path(model_size)
    if path.exists() and path.stat().st_size > 1_000_000:
        return path

    urls = [MODEL_URLS[model_size], FALLBACK_URLS[model_size]]
    last_err: Exception | None = None
    for url in urls:
        try:
            if progress:
                progress(0.02, f"モデル取得中: {model_size} …")
            tmp = path.with_suffix(".part")
            urllib.request.urlretrieve(url, tmp)
            tmp.replace(path)
            if path.stat().st_size < 1_000_000:
                path.unlink(missing_ok=True)
                raise RuntimeError("モデルファイルが小さすぎます（ダウンロード失敗の可能性）")
            return path
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            path.unlink(missing_ok=True)
            path.with_suffix(".part").unlink(missing_ok=True)
    raise RuntimeError(f"モデルの取得に失敗しました: {model_size}\n{last_err}")
