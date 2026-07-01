# Copy session.target.json from Downloads to diagram-workspace (if present)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$TargetDir = Join-Path $ProjectRoot "diagram-workspace"
$TargetFile = Join-Path $TargetDir "session.target.json"
$Downloads = [Environment]::GetFolderPath("Downloads")
$SourceFile = Join-Path $Downloads "session.target.json"

if (-not (Test-Path $SourceFile)) {
  Write-Host "Downloads\session.target.json not found."
  Write-Host "Use VidNote: Cursor ni copy, then save the downloaded file."
  exit 1
}

Copy-Item -Path $SourceFile -Destination $TargetFile -Force
Write-Host "Copied to: $TargetFile"
