<#
Layer 3 of the kill-switch defense. The integrity watchdog (Layer 2) detects tampering with
desktop/ and responds within seconds - this script actually prevents it in the first place,
for any process running as your normal (non-elevated) user, by denying write/delete access
to the folder at the Windows ACL level. That's enforced by the OS kernel, not by any code
Jarvis runs, so a shell command Jarvis executes (a capability it's meant to have) genuinely
cannot get through this the way it can get past a Node-level check.

Honest limit: this only holds for non-elevated (non-admin) processes. Nothing in userland -
this script included - can stop a command that runs with admin/elevated privileges. If you
ever grant Jarvis a way to run elevated commands, this entire layer (and the integrity
watchdog) stops being a real guarantee.

Run this once after building the app, from an elevated PowerShell prompt:
    powershell -ExecutionPolicy Bypass -File desktop\scripts\lockdown.ps1

Run unlock.ps1 (also elevated) before you intend to edit anything under desktop/ yourself,
then re-run this script afterward.
#>

$ErrorActionPreference = 'Stop'
$desktopDir = Join-Path $PSScriptRoot '..'
$desktopDir = (Resolve-Path $desktopDir).Path
$user = "$env:USERDOMAIN\$env:USERNAME"

Write-Host "Locking down: $desktopDir"
Write-Host "Denying write/delete for: $user"

# (OI)(CI) = applies to sub-folders and files too. Denying W (write) and DE (delete) while
# leaving read/execute alone means the running app can still be launched and read, just not
# modified or removed, by the same account that's running Jarvis's backend.
icacls $desktopDir /deny "${user}:(OI)(CI)(W,DE)"

Write-Host ""
Write-Host "Done. desktop/ is now read-only for $user."
Write-Host "Run unlock.ps1 (elevated) before editing anything here yourself."
