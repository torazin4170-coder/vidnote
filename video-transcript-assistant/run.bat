@echo off
setlocal
cd /d "%~dp0"

set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not exist "%PY%" set "PY=python"

if not exist "vendor\whisper\Release\whisper-cli.exe" (
  echo [文字起こし助手] whisper.cpp を取得します…
  mkdir vendor 2>nul
  curl.exe -L -o vendor\whisper-bin-x64.zip https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.1/whisper-bin-x64.zip
  powershell -Command "Expand-Archive -Path 'vendor\whisper-bin-x64.zip' -DestinationPath 'vendor\whisper' -Force"
)

if not exist ".venv\Scripts\python.exe" (
  echo [文字起こし助手] 初回セットアップ中…
  "%PY%" -m venv .venv
  if errorlevel 1 (
    echo Python が見つかりません。Python 3.12 をインストールしてください。
    pause
    exit /b 1
  )
  .venv\Scripts\python.exe -m pip install --upgrade pip
  .venv\Scripts\pip.exe install -r requirements.txt
)

echo [文字起こし助手] 起動します（ http://127.0.0.1:7861 ）
.venv\Scripts\python.exe app.py
pause
