# Create desktop shortcut for VidNote diagram workflow (VidNote + Cursor)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$LauncherBat = Join-Path $PSScriptRoot "start-vidnote-diagram.bat"
$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "VidNote Diagram.lnk"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $LauncherBat
$Shortcut.WorkingDirectory = $ProjectRoot
$Shortcut.Description = "Open VidNote and Cursor diagram workspace"
$Shortcut.WindowStyle = 1
$Shortcut.Save()

Write-Host "Shortcut created: $ShortcutPath"
