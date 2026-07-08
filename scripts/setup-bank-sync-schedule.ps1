<#
.SYNOPSIS
  Registers a Windows Scheduled Task that calls /api/cron/bank-sync every 6 hours.

.DESCRIPTION
  This app's bank sync goes through a local Python sidecar (see scripts/fints/README.md),
  so it can only run on this machine while the Next.js server is up and listening — there is
  no cloud cron here. This script just automates the "hit the endpoint on a schedule" part;
  the Next.js server (npm run dev / npm run start) still needs to be running for it to do
  anything on a given run.

  Safe to re-run: it replaces any existing task of the same name (e.g. to change the interval
  or port).

.PARAMETER IntervalHours
  Hours between syncs. Default: 6.

.PARAMETER Port
  Local port the Next.js server listens on. Default: 3000.
#>
param(
  [int]$IntervalHours = 6,
  [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile  = Join-Path $repoRoot '.env.local'
if (-not (Test-Path $envFile)) {
  throw "Could not find .env.local at $envFile"
}

$secretLine = Get-Content $envFile | Where-Object { $_ -match '^CRON_SECRET=' } | Select-Object -First 1
if (-not $secretLine) {
  throw "CRON_SECRET is not set in .env.local"
}
$secret = ($secretLine -split '=', 2)[1].Trim()

$taskName = 'AthenaFinance-BankSync'
$logFile  = Join-Path $env:TEMP 'athena-bank-sync.log'
$url      = "http://localhost:$Port/api/cron/bank-sync"

# curl --max-time slightly exceeds the route's own 300s budget so we don't cut it off early.
$curlArgs = "-s -m 320 -H `"Authorization: Bearer $secret`" `"$url`" -o `"$logFile`" -w `"%{time_total}s HTTP %{http_code} - `""

$action  = New-ScheduledTaskAction -Execute 'curl.exe' -Argument $curlArgs
# Task Scheduler's XML schema rejects [TimeSpan]::MaxValue (out of range) — 10 years is
# effectively "indefinitely" for a task nobody expects to outlive this machine.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Hours $IntervalHours) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 6)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
  -Description "Athena-Finance: FinTS-Bankabgleich alle $IntervalHours Stunden (POST via curl an $url). Ergebnis in $logFile." `
  -Force | Out-Null

Write-Host "Scheduled task '$taskName' registered: every $IntervalHours h -> $url"
Write-Host "Log file: $logFile"
Write-Host ""
Write-Host "Note: this only fires successfully while the Next.js server is running on port $Port"
Write-Host "(npm run dev / npm run start). It does not start the server itself."
