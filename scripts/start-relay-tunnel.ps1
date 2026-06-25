# VidNote transcript relay + Cloudflare Tunnel launcher
# Double-click desktop shortcut "VidNote Relay" to run.

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $ProjectRoot

if (-not $env:TRANSCRIPT_RELAY_SECRET) {
  $env:TRANSCRIPT_RELAY_SECRET = "vidnote-relay-2026"
}

function Pause-BeforeExit {
  param([int]$Code = 0)
  Write-Host ""
  Write-Host "Press Enter to close this window..."
  Read-Host | Out-Null
  exit $Code
}

function Get-CloudflaredPath {
  $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $wingetPath = Join-Path $env:LOCALAPPDATA `
    "Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe"
  if (Test-Path $wingetPath) { return $wingetPath }

  throw "cloudflared not found. Run: winget install Cloudflare.cloudflared"
}

function Update-VercelRelayUrl {
  param([string]$Url)

  $vercelProject = Join-Path $ProjectRoot ".vercel\project.json"
  if (-not (Test-Path $vercelProject)) {
    Write-Host "  (skip Vercel update: .vercel not linked)"
    return $false
  }

  Write-Host "  Updating Vercel TRANSCRIPT_RELAY_URL..."
  Push-Location $ProjectRoot
  $prevErrorAction = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & npx vercel env rm TRANSCRIPT_RELAY_URL production --yes 2>&1 | Out-Null
    & npx vercel env add TRANSCRIPT_RELAY_URL production --value $Url --yes --force --no-sensitive 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "vercel env add failed (exit $LASTEXITCODE)"
    }
    Write-Host "  Vercel updated. Redeploying production..."
    & npx vercel deploy --prod --yes 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Host "  Redeploy failed (exit $LASTEXITCODE). Run: npx vercel deploy --prod"
    } else {
      Write-Host "  Redeploy complete."
    }
    return $true
  } catch {
    Write-Host "  Vercel update failed: $($_.Exception.Message)"
    Write-Host "  Set manually: TRANSCRIPT_RELAY_URL=$Url"
    return $false
  } finally {
    $ErrorActionPreference = $prevErrorAction
    Pop-Location
  }
}

function Wait-ForLocalRelay {
  param([int]$TimeoutSec = 20)

  $body = '{"videoId":"dQw4w9WgXcQ"}'
  $headers = @{
    Authorization = "Bearer $($env:TRANSCRIPT_RELAY_SECRET)"
    "Content-Type" = "application/json"
  }
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $null = Invoke-RestMethod -Uri "http://127.0.0.1:8787/transcript" `
        -Method POST -Headers $headers -Body $body -TimeoutSec 8
      return $true
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  return $false
}

function Wait-ForTunnelUrl {
  param(
    [string]$LogPath,
    [int]$TimeoutSec = 60
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path $LogPath) {
      $content = Get-Content $LogPath -Raw -ErrorAction SilentlyContinue
      if ($content -match "(https://[a-z0-9-]+\.trycloudflare\.com)") {
        return $Matches[1]
      }
    }
    Start-Sleep -Seconds 1
  }
  return $null
}

try {
  $Cloudflared = Get-CloudflaredPath
  $LogPath = Join-Path $env:TEMP "vidnote-cloudflared.log"

  Write-Host ""
  Write-Host "=== VidNote Transcript Relay ===" -ForegroundColor Cyan
  Write-Host ""

  $existingRelay = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
  if ($existingRelay) {
    Write-Host "Port 8787 already in use (relay may be running)." -ForegroundColor Yellow
    if (-not (Wait-ForLocalRelay)) {
      throw "Port 8787 is in use but relay did not respond. Close old relay windows and retry."
    }
    Write-Host "  Relay OK on http://127.0.0.1:8787"
  } else {
    Write-Host "[1/2] Starting relay on port 8787..."
    $relayCmd = @"
cd '$ProjectRoot'
`$env:TRANSCRIPT_RELAY_SECRET='$($env:TRANSCRIPT_RELAY_SECRET)'
Write-Host 'VidNote relay running. Close this window to stop relay.' -ForegroundColor Cyan
npm run relay
"@
    Start-Process powershell -ArgumentList @("-NoExit", "-Command", $relayCmd) -WindowStyle Minimized
    Start-Sleep -Seconds 2
    if (-not (Wait-ForLocalRelay)) {
      throw "Relay on port 8787 did not respond. Check the minimized relay window."
    }
    Write-Host "  Relay OK on http://127.0.0.1:8787"
  }

  Write-Host "[2/2] Starting Cloudflare Tunnel..."
  Remove-Item $LogPath -Force -ErrorAction SilentlyContinue

  $tunnelProc = Start-Process -FilePath $Cloudflared -ArgumentList @(
    "tunnel", "--url", "http://127.0.0.1:8787"
  ) -RedirectStandardError $LogPath -PassThru -WindowStyle Hidden

  if (-not $tunnelProc) {
    throw "Failed to start cloudflared"
  }

  $tunnelUrl = Wait-ForTunnelUrl -LogPath $LogPath

  Write-Host ""
  if ($tunnelUrl) {
    Write-Host "Tunnel URL:" -ForegroundColor Green
    Write-Host "  $tunnelUrl"
    Write-Host ""
    Update-VercelRelayUrl -Url $tunnelUrl | Out-Null
    Write-Host ""
    Write-Host "Keep THIS window open (minimize OK) while using VidNote." -ForegroundColor Yellow
    Write-Host "Closing it stops subtitle relay for production." -ForegroundColor Yellow
  } else {
    Write-Host "Could not read tunnel URL. Log file:" -ForegroundColor Red
    Write-Host "  $LogPath"
    if (Test-Path $LogPath) {
      Write-Host ""
      Write-Host "--- log tail ---"
      Get-Content $LogPath -Tail 15
    }
    Pause-BeforeExit 1
  }

  Write-Host ""
  Write-Host "Press Ctrl+C or close this window to stop."
  Write-Host ""

  Wait-Process -Id $tunnelProc.Id
} catch {
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host ""
  Pause-BeforeExit 1
} finally {
  if ($tunnelProc -and -not $tunnelProc.HasExited) {
    Stop-Process -Id $tunnelProc.Id -Force -ErrorAction SilentlyContinue
  }
}
