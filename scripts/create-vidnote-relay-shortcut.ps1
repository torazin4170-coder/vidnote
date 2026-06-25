# Create desktop shortcut for VidNote relay launcher

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$LauncherBat = Join-Path $PSScriptRoot "start-vidnote-relay.bat"
$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "VidNote Relay.lnk"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $LauncherBat
$Shortcut.WorkingDirectory = $ProjectRoot
$Shortcut.Description = "Start VidNote transcript relay and Cloudflare tunnel"
$Shortcut.WindowStyle = 1
$Shortcut.Save()

Write-Host "Shortcut created: $ShortcutPath"
