# VidNote 字幕リレー + Cloudflare Tunnel 起動スクリプト
# 使い方: powershell -File scripts/start-relay-tunnel.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $ProjectRoot

if (-not $env:TRANSCRIPT_RELAY_SECRET) {
  $env:TRANSCRIPT_RELAY_SECRET = "vidnote-relay-2026"
}

$Cloudflared = "C:\Users\toraz\AppData\Local\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe"
if (-not (Test-Path $Cloudflared)) {
  Write-Error "cloudflared が見つかりません。winget install Cloudflare.cloudflared を実行してください。"
}

Write-Host "1/2 字幕リレーを起動中 (port 8787)..."
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "cd '$ProjectRoot'; `$env:TRANSCRIPT_RELAY_SECRET='$($env:TRANSCRIPT_RELAY_SECRET)'; npm run relay"
) -WindowStyle Normal

Start-Sleep -Seconds 2

Write-Host "2/2 Cloudflare Tunnel を起動中..."
Write-Host "表示された https://xxxx.trycloudflare.com を Vercel の TRANSCRIPT_RELAY_URL に設定してください。"
Write-Host ""

& $Cloudflared tunnel --url http://127.0.0.1:8787
