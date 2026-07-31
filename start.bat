@echo off
REM Jarvis-V1 one-click start (no Docker)
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0start.ps1"
