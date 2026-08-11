from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from typing import Any

OLLAMA_URL = "http://127.0.0.1:11434/api/chat"
DEFAULT_MODEL = "qwen2.5:3b"

_TS_LINE = re.compile(r"^\[\d{1,2}:\d{2}(?::\d{2})?\]\s*")

SYSTEM_PROMPT = """あなたは日本語の編集者です。
与えられた文字起こしを読み、内容を理解したうえで要約してください。
原文の文をそのまま抜き出して並べるだけの作業は禁止です。
重要な論点・固有名詞・数字・因果・結論を落とさず、構造的かつ簡潔にまとめてください。
出力は日本語のみ。前置きや言い訳は書かないでください。"""

USER_TEMPLATE = """次の文字起こしを要約してください。

要件:
- 原文コピーの羅列や、単純な省略だけにしない
- 重要なポイントを網羅する（短くても抜け漏れを避ける）
- 冗長な言い直しやフィラーは整理してよい
- 次の見出し構成で出力する（該当がなければその見出しは短くてよい）

## 概要
（全体を2〜4文で）

## 重要ポイント
（箇条書き。必要な数だけ。無理に減らさない）

## 補足・詳細
（背景・具体例・条件など）

## 結論
（まとめ・示唆。なければ「特になし」）

---
文字起こし:
{text}
"""

MERGE_TEMPLATE = """以下は同一動画の文字起こしを分割して作った部分要約です。
重複を整理し、一本の最終要約に統合してください。
原文コピーの羅列は禁止。重要点の抜け漏れがないようにしてください。

出力形式:
## 概要
## 重要ポイント
## 補足・詳細
## 結論

---
部分要約:
{text}
"""


def _strip_timestamps(text: str) -> str:
    lines = []
    for line in (text or "").splitlines():
        line = _TS_LINE.sub("", line).strip()
        if line:
            lines.append(line)
    return "\n".join(lines).strip()


def _chunk_text(text: str, max_chars: int = 3500) -> list[str]:
    text = text.strip()
    if len(text) <= max_chars:
        return [text]
    # prefer split on sentence end
    parts: list[str] = []
    buf = ""
    for piece in re.split(r"(?<=[。！？\n])", text):
        if not piece:
            continue
        if len(buf) + len(piece) > max_chars and buf:
            parts.append(buf.strip())
            buf = piece
        else:
            buf += piece
    if buf.strip():
        parts.append(buf.strip())
    return parts or [text]


def _ollama_chat(prompt: str, model: str = DEFAULT_MODEL, num_ctx: int = 8192) -> str:
    payload = {
        "model": model,
        "stream": False,
        "options": {
            "temperature": 0.2,
            "num_ctx": num_ctx,
        },
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
    }
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        OLLAMA_URL,
        data=data,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        raise RuntimeError(
            "ローカル要約エンジン（Ollama）に接続できません。\n"
            "Ollama を起動し、モデル qwen2.5:3b を入れてください。\n"
            "例: ollama serve\n"
            "例: ollama pull qwen2.5:3b\n"
            f"詳細: {exc}"
        ) from exc
    msg = (body.get("message") or {}).get("content") or ""
    if not msg.strip():
        raise RuntimeError("要約結果が空でした。モデルや入力を確認してください。")
    return msg.strip()


def structured_summary(
    text: str,
    segments: list[dict[str, Any]] | None = None,  # kept for API compat; unused
    model: str = DEFAULT_MODEL,
) -> str:
    """
    Abstractive structured summary via local Ollama (no cloud).
    Not extractive sentence picking.
    """
    del segments  # unused
    cleaned = _strip_timestamps(text)
    if not cleaned:
        return "（文字起こしが空です。先に文字起こしするか、テキストを入力してください）"

    chunks = _chunk_text(cleaned, max_chars=3500)
    if len(chunks) == 1:
        return _ollama_chat(USER_TEMPLATE.format(text=chunks[0]), model=model)

    partials: list[str] = []
    for i, chunk in enumerate(chunks, start=1):
        partial = _ollama_chat(
            USER_TEMPLATE.format(text=f"（分割 {i}/{len(chunks)}）\n{chunk}"),
            model=model,
        )
        partials.append(f"### 部分{i}\n{partial}")

    merged = _ollama_chat(MERGE_TEMPLATE.format(text="\n\n".join(partials)), model=model)
    return merged


# backward-compatible name used by older imports
def extractive_summary(*args, **kwargs):
    return structured_summary(*args, **kwargs)
