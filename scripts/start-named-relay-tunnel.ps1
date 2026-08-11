# VidNote 固定 URL トンネル + ローカル relay 起動
# 初回: scripts/setup-named-tunnel.ps1 を実行済みであること

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $ProjectRoot

$configPath = Join-Path $ProjectRoot "cloudflared\config.yml"
if (-not (Test-Path $configPath)) {
  Write-Host "cloudflared/config.yml がありません。" -ForegroundColor Red
  Write-Host "先に scripts/setup-named-tunnel.ps1 を実行してください。"
  Read-Host "Press Enter to close" | Out-Null
  exit 1
}

if (-not $env:TRANSCRIPT_RELAY_SECRET) {
  $env:TRANSCRIPT_RELAY_SECRET = "vidnote-relay-2026"
}

function Get-CloudflaredPath {
  $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $wingetPath = Join-Path $env:LOCALAPPDATA `
    "Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe"
  if (Test-Path $wingetPath) { return $wingetPath }
  throw "cloudflared not found"
}

function Wait-ForLocalRelay {
  param([int]$TimeoutSec = 20)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $resp = Invoke-RestMethod -Uri "http://127.0.0.1:8787/health" -Method GET -TimeoutSec 5
      if ($resp.ok -eq $true) { return $true }
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  return $false
}

Write-Host ""
Write-Host "=== VidNote 固定 URL Relay ===" -ForegroundColor Cyan
Write-Host ""

$existingRelay = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
if ($existingRelay) {
  Write-Host "Relay already on port 8787"
} else {
  Write-Host "[1/2] Starting relay..."
  $relayCmd = @"
cd '$ProjectRoot'
`$env:TRANSCRIPT_RELAY_SECRET='$($env:TRANSCRIPT_RELAY_SECRET)'
npm run relay
"@
  Start-Process powershell -ArgumentList @("-NoExit", "-Command", $relayCmd) -WindowStyle Minimized
  Start-Sleep -Seconds 2
  if (-not (Wait-ForLocalRelay)) {
    Write-Host "Relay failed to start on port 8787" -ForegroundColor Red
    exit 1
  }
  Write-Host "  Relay OK"
}

Write-Host "[2/2] Starting named tunnel (fixed URL)..."
Write-Host "  Keep this window open while using VidNote." -ForegroundColor Yellow
Write-Host ""

$Cloudflared = Get-CloudflaredPath
& $Cloudflared tunnel --config $configPath run
