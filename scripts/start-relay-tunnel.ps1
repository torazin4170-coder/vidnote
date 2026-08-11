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

function Wait-ForTunnelUrl {
  param(
    [string]$LogPath,
    [int]$TimeoutSec = 90
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path $LogPath) {
      $content = Get-Content $LogPath -Raw -ErrorAction SilentlyContinue
      # Prefer the URL printed after registration; fall back to any trycloudflare URL.
      if ($content -match "Registered tunnel connection") {
        if ($content -match "(https://[a-z0-9-]+\.trycloudflare\.com)") {
          return $Matches[1]
        }
      }
      if ($content -match "(https://[a-z0-9-]+\.trycloudflare\.com)") {
        $url = $Matches[1]
        # URL can appear before the connection is fully registered.
        if ($content -match "Registered tunnel connection") {
          return $url
        }
      }
    }
    Start-Sleep -Seconds 1
  }

  if (Test-Path $LogPath) {
    $content = Get-Content $LogPath -Raw -ErrorAction SilentlyContinue
    if ($content -match "(https://[a-z0-9-]+\.trycloudflare\.com)") {
      return $Matches[1]
    }
  }
  return $null
}

function Wait-ForTunnelRelay {
  param(
    [string]$TunnelUrl,
    [int]$TimeoutSec = 120
  )

  # Quick tunnel hostnames can take a few seconds to appear in public DNS.
  Start-Sleep -Seconds 5

  # Use Node + public DNS (1.1.1.1). Windows system DNS often cannot resolve
  # *.trycloudflare.com even when the tunnel is healthy and Vercel can reach it.
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $prevErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
      & node (Join-Path $ProjectRoot "scripts\check-relay-tunnel.mjs") $TunnelUrl 2>&1 | Out-Null
      if ($LASTEXITCODE -eq 0) { return $true }
    } catch {
      # retry
    } finally {
      $ErrorActionPreference = $prevErrorAction
    }
    Start-Sleep -Seconds 2
  }
  return $false
}

function Save-TunnelUrlFile {
  param([string]$Url)
  $path = Join-Path $ProjectRoot ".relay-tunnel-url"
  Set-Content -Path $path -Value $Url -Encoding UTF8
}

function Register-RelayUrlToVidNote {
  param([string]$Url)

  if (-not $env:VIDNOTE_APP_URL) {
    $env:VIDNOTE_APP_URL = "https://vidnote-alpha.vercel.app"
  }

  Write-Host "  Registering relay URL with VidNote..."
  Push-Location $ProjectRoot
  $prevErrorAction = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & node (Join-Path $ProjectRoot "scripts\register-relay-url.mjs") $Url
    if ($LASTEXITCODE -ne 0) {
      Write-Host "  Auto-register failed." -ForegroundColor Red
      return $false
    }
    Write-Host "  Registered with VidNote." -ForegroundColor Green
    return $true
  } finally {
    $ErrorActionPreference = $prevErrorAction
    Pop-Location
  }
}

function Ensure-RelayUrlRegistered {
  param(
    [string]$Url,
    [int]$MaxAttempts = 3
  )

  for ($i = 1; $i -le $MaxAttempts; $i++) {
    if (Register-RelayUrlToVidNote -Url $Url) {
      return $true
    }
    if ($i -lt $MaxAttempts) {
      Write-Host "  Retrying registration ($i/$MaxAttempts)..." -ForegroundColor Yellow
      Start-Sleep -Seconds ($i * 3)
    }
  }
  return $false
}

function Update-VercelRelayUrl {
  param([string]$Url)

  $Url = $Url.Trim().TrimStart('?','#',' ')
  if ($Url -notmatch '^https?://') {
    throw "Invalid tunnel URL: $Url"
  }

  $vercelProject = Join-Path $ProjectRoot ".vercel\project.json"
  if (-not (Test-Path $vercelProject)) {
    Write-Host "  (skip Vercel update: .vercel not linked)"
    return $false
  }

  Write-Host "  Updating Vercel TRANSCRIPT_RELAY_URL..."
  Push-Location $ProjectRoot
  $prevErrorAction = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $valueFile = Join-Path $env:TEMP "vidnote-relay-url-value.txt"
  try {
    [System.IO.File]::WriteAllText($valueFile, $Url, [System.Text.UTF8Encoding]::new($false))
    & npx vercel env rm TRANSCRIPT_RELAY_URL production --yes 2>&1 | Out-Null
    & npx vercel env add TRANSCRIPT_RELAY_URL production --value $Url --yes --force --no-sensitive 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "vercel env add failed (exit $LASTEXITCODE)"
    }

    Write-Host "  Vercel updated. Redeploying production..."
    & npx vercel deploy --prod --yes 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Host "  Redeploy failed (exit $LASTEXITCODE). Run: npx vercel deploy --prod" -ForegroundColor Yellow
      return $false
    }
    Write-Host "  Redeploy complete." -ForegroundColor Green
    return $true
  } catch {
    Write-Host "  Vercel update failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Set manually: TRANSCRIPT_RELAY_URL=$Url"
    return $false
  } finally {
    $ErrorActionPreference = $prevErrorAction
    Remove-Item $valueFile -Force -ErrorAction SilentlyContinue
    Pop-Location
  }
}

function Stop-StaleCloudflared {
  # Quick tunnels left from a previous failed launch can hold broken state.
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -match 'cloudflared' -and
      $_.CommandLine -match 'trycloudflare|tunnel --url'
    } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
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
  Write-Host "  (protocol=http2, edge-ip-version=4 — QUIC/IPv6 failures are common on some networks)"
  Stop-StaleCloudflared
  Remove-Item $LogPath -Force -ErrorAction SilentlyContinue

  # Default QUIC over IPv6 often fails with "control stream encountered a failure".
  # Force HTTP/2 + IPv4 for reliable quick tunnels on Windows home networks.
  $tunnelProc = Start-Process -FilePath $Cloudflared -ArgumentList @(
    "tunnel",
    "--url", "http://127.0.0.1:8787",
    "--protocol", "http2",
    "--edge-ip-version", "4",
    "--no-autoupdate"
  ) -RedirectStandardError $LogPath -PassThru -WindowStyle Hidden

  if (-not $tunnelProc) {
    throw "Failed to start cloudflared"
  }

  $tunnelUrl = Wait-ForTunnelUrl -LogPath $LogPath

  Write-Host ""
  if (-not $tunnelUrl) {
    Write-Host "Could not read tunnel URL. Log file:" -ForegroundColor Red
    Write-Host "  $LogPath"
    if (Test-Path $LogPath) {
      Write-Host ""
      Write-Host "--- log tail ---"
      Get-Content $LogPath -Tail 20
    }
    Pause-BeforeExit 1
  }

  Write-Host "Tunnel URL:" -ForegroundColor Green
  Write-Host "  $tunnelUrl"
  Write-Host ""
  Write-Host "  Verifying tunnel reaches local relay..."
  if (-not (Wait-ForTunnelRelay -TunnelUrl $tunnelUrl)) {
    Write-Host "  Tunnel URL was found but /health did not respond." -ForegroundColor Red
    Write-Host "  Check cloudflared log:" -ForegroundColor Yellow
    Write-Host "    $LogPath"
    if (Test-Path $LogPath) {
      Write-Host ""
      Write-Host "--- log tail ---"
      Get-Content $LogPath -Tail 20
    }
    Pause-BeforeExit 1
  }

  Write-Host "  Tunnel OK." -ForegroundColor Green
  Save-TunnelUrlFile -Url $tunnelUrl

  if (-not (Ensure-RelayUrlRegistered -Url $tunnelUrl)) {
    throw @"
VidNote への URL 登録に失敗しました。
VidNote は古いトンネル URL を参照し続けるため字幕取得が失敗します。
ネットワークを確認してからこのウィンドウを閉じ、VidNote Relay を再起動してください。
トンネル URL: $tunnelUrl
"@
  }

  Write-Host ""
  Write-Host "Keep THIS window open (minimize OK) while using VidNote." -ForegroundColor Yellow
  Write-Host "Relay URL is registered automatically — Vercel redeploy is NOT required." -ForegroundColor Yellow
  Write-Host "For a permanent fixed URL, run scripts/setup-named-tunnel.ps1 once." -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Press Ctrl+C or close this window to stop."
  Write-Host ""

  $lastRegister = Get-Date
  $registerIntervalSec = 120
  while (-not $tunnelProc.HasExited) {
    Start-Sleep -Seconds 10
    if (((Get-Date) - $lastRegister).TotalSeconds -ge $registerIntervalSec) {
      if (Register-RelayUrlToVidNote -Url $tunnelUrl) {
        $lastRegister = Get-Date
      } else {
        Write-Host "  Re-register failed (will retry in ${registerIntervalSec}s)..." -ForegroundColor Yellow
      }
    }
  }
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
