<#
Reverses lockdown.ps1. Run this yourself (elevated) before intentionally editing anything
under desktop/ - Jarvis has no command that calls this, and shouldn't ever be given one;
that would defeat the entire point of Layer 3. After you're done editing, rebuild and
re-run lockdown.ps1, then `npm run reseal` (in desktop/) to re-baseline the integrity
watchdog against your new files.

    powershell -ExecutionPolicy Bypass -File desktop\scripts\unlock.ps1
#>

$ErrorActionPreference = 'Stop'
$desktopDir = Join-Path $PSScriptRoot '..'
$desktopDir = (Resolve-Path $desktopDir).Path
$user = "$env:USERDOMAIN\$env:USERNAME"

Write-Host "Unlocking: $desktopDir"
icacls $desktopDir /remove:d "${user}"

Write-Host ""
Write-Host "Done. desktop/ is writable again for $user."
Write-Host "Remember to run lockdown.ps1 again once you're finished editing."
