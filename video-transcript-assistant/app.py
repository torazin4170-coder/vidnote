from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import gradio as gr

from transcript_assistant.audio import extract_audio
from transcript_assistant.job import TranscriptionCancelled, request_cancel
from transcript_assistant.paths import safe_work_copy
from transcript_assistant.save import save_results
from transcript_assistant.transcribe import transcribe_audio

ROOT = Path(__file__).resolve().parent


def _video_path(video: Any) -> str | None:
    if video is None:
        return None
    if isinstance(video, dict):
        return video.get("path") or video.get("name")
    if isinstance(video, (str, Path)):
        return str(video)
    return getattr(video, "name", None) or str(video)


def run_transcribe(
    video,
    model_size,
    progress=gr.Progress(track_tqdm=False),
):
    path = _video_path(video)
    if not path:
        raise gr.Error("動画（または音声ファイル）をドロップしてください")

    def cb(p: float, msg: str) -> None:
        progress(p, desc=msg)

    try:
        progress(0.0, desc="入力を安全な一時ファイルへコピー中…")
        safe_video = safe_work_copy(path)

        progress(0.02, desc="音声を取り出しています…")
        audio = extract_audio(safe_video)

        result = transcribe_audio(
            str(audio),
            model_size=model_size,
            language="ja",
            progress=cb,
        )
    except TranscriptionCancelled:
        return (
            gr.update(),
            gr.update(),
            "文字起こしを中断しました。必要ならもう一度「文字起こしする」を押してください。",
        )

    text = result["text"]
    state = {
        "source": path,
        "segments": result["segments"],
        "duration": result["duration"],
        "language": result["language"],
        "engine": result.get("engine"),
        "model_size": result.get("model_size"),
    }
    elapsed = result.get("elapsed_sec")
    elapsed_txt = f" / 処理 {elapsed/60:.1f} 分" if elapsed else ""
    info = (
        f"完了: Whisper / モデル {result.get('model_size')} / "
        f"長さ 約 {result['duration']:.0f} 秒 / 区間 {len(result['segments'])}{elapsed_txt}\n"
        "下の欄で自由に直せます。要約は外部AIへコピーして使ってください。"
    )
    return text, json.dumps(state, ensure_ascii=False), info


def run_cancel():
    killed = request_cancel()
    if killed:
        return "中断を受け付けました。まもなく止まります…"
    return "いま動いている文字起こしはありません。"


def run_save(video, transcript, state_json):
    path = _video_path(video)
    if state_json:
        try:
            path = path or json.loads(state_json).get("source")
        except json.JSONDecodeError:
            pass
    name = Path(path).name if path else "transcript"
    if not (transcript or "").strip():
        raise gr.Error("保存する文字起こしが空です")
    out = save_results(name, transcript or "")
    return str(out), f"保存しました: {out}"


def build_ui() -> gr.Blocks:
    with gr.Blocks(title="ローカル文字起こし助手") as demo:
        gr.Markdown(
            """# ローカル文字起こし助手
素材動画 → **Whisper文字起こし** → 編集・保存

- 文字起こしは自分のPC内（Whisper）
- 要約はこのツールでは行いません（外部のAIサービスへ）
- 既定モデルは `small`。`large-v3` はCPUでは非常に遅いので非推奨
"""
        )
        with gr.Row():
            video = gr.Video(label="素材動画 / 音声", sources=["upload"])
            with gr.Column():
                model_size = gr.Dropdown(
                    choices=["small", "medium", "base", "tiny", "large-v3"],
                    value="small",
                    label="Whisperモデル",
                )
                with gr.Row():
                    t_btn = gr.Button("文字起こしする", variant="primary")
                    cancel_btn = gr.Button("中断する", variant="stop")
                save_btn = gr.Button("保存する")
                status = gr.Textbox(label="状態", lines=4)
                out_file = gr.File(label="保存ファイル")

        transcript = gr.Textbox(
            label="文字起こし（自由編集可・要約は外部AIへ）",
            lines=22,
            max_lines=50,
        )
        state = gr.State("")

        t_btn.click(
            run_transcribe,
            inputs=[video, model_size],
            outputs=[transcript, state, status],
        )
        cancel_btn.click(
            run_cancel,
            inputs=[],
            outputs=[status],
        )
        save_btn.click(
            run_save,
            inputs=[video, transcript, state],
            outputs=[out_file, status],
        )
    return demo


if __name__ == "__main__":
    ui = build_ui()
    ui.launch(
        server_name="127.0.0.1",
        server_port=7861,
        inbrowser=True,
        show_error=True,
        footer_links=[],
        pwa=False,
    )
