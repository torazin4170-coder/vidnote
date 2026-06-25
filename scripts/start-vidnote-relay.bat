@echo off
chcp 65001 >nul
title VidNote Transcript Relay
cd /d "%~dp0.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-relay-tunnel.ps1"
if errorlevel 1 pause
