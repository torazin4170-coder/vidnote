# VidNote diagram workflow — VidNote + Cursor + auto-import watch



$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path $PSScriptRoot -Parent

$Workspace = Join-Path $ProjectRoot "diagram-workspace"



function Get-VidNoteUrl {

  if ($env:VIDNOTE_URL) {

    return $env:VIDNOTE_URL.Trim()

  }



  $envLocal = Join-Path $ProjectRoot ".env.local"

  if (Test-Path $envLocal) {

    $match = Select-String -Path $envLocal -Pattern '^\s*VIDNOTE_URL\s*=\s*(.+)\s*$' |

      Select-Object -First 1

    if ($match) {

      return $match.Matches[0].Groups[1].Value.Trim().Trim('"').Trim("'")

    }

  }



  return "https://vidnote-alpha.vercel.app"

}



function Get-CursorCommand {

  $cmd = Get-Command cursor -ErrorAction SilentlyContinue

  if ($cmd) { return @{ File = $cmd.Source } }



  $cursorExe = Join-Path $env:LOCALAPPDATA "Programs\cursor\Cursor.exe"

  if (Test-Path $cursorExe) {

    return @{ File = $cursorExe }

  }



  return $null

}



$vidNoteUrl = Get-VidNoteUrl



Write-Host ""

Write-Host "=== VidNote Diagram Workflow ===" -ForegroundColor Cyan

Write-Host ""

Write-Host "1. Opening VidNote: $vidNoteUrl"

Start-Process $vidNoteUrl



Start-Sleep -Milliseconds 800



$cursor = Get-CursorCommand

if ($cursor) {

  Write-Host "2. Opening Cursor diagram workspace:"

  Write-Host "   $Workspace"

  Start-Process -FilePath $cursor.File -ArgumentList $Workspace

} else {

  Write-Host "2. Cursor not found. Open manually:" -ForegroundColor Yellow

  Write-Host "   $Workspace"

}



Write-Host "3. Starting diagram import watcher (diagram:watch)..."

$watchCmd = @"

Set-Location '$ProjectRoot'

Write-Host 'VidNote diagram watch — save output/diagram.html to auto-import' -ForegroundColor Cyan

npm run diagram:watch

"@

Start-Process powershell -ArgumentList @("-NoExit", "-Command", $watchCmd) -WindowStyle Minimized



Write-Host ""

Write-Host "Next steps:" -ForegroundColor Yellow

Write-Host "  - VidNote: Cursor ni copy (import target saved to DB)"

Write-Host "  - Cursor: paste to Composer, save HTML to output/diagram.html"

Write-Host ""

