# Jarvis-V1 — one-click personal start (no Docker)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host "Jarvis-V1 start" -ForegroundColor Cyan

if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host "Created .env from .env.example"
}

Write-Host "Installing deps (if needed)..."
npm install --no-fund --no-audit
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Doctor..."
npm run doctor
if ($LASTEXITCODE -ne 0) {
  Write-Host "Doctor reported FAIL — fix Mongo first, then re-run start.ps1" -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host "Migrate..."
npm run migrate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "API starting on http://localhost:8080" -ForegroundColor Green
Write-Host "Dashboard:     http://localhost:8080/dashboard/"
Write-Host "After boot:    npm run smoke   (in another terminal)"
Write-Host ""

npm run dev
