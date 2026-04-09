[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$frontendDir = Join-Path $repoRoot 'apps\frontend'
$backendDir = Join-Path $repoRoot 'apps\backend'
$aiChatDir = Join-Path $repoRoot 'modules\ai-chat'
$dataDir = Join-Path $repoRoot 'data'
$dbPath = Join-Path $dataDir 'crm.db'
$dbGzipPath = Join-Path $dataDir 'crm.db.gz'
$rootNodeModules = Join-Path $repoRoot 'node_modules'

function Test-Command($name) {
  $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

$checks = @(
  @{ Label = 'apps/frontend/package.json'; Passed = (Test-Path (Join-Path $frontendDir 'package.json')) },
  @{ Label = 'apps/backend/package.json'; Passed = (Test-Path (Join-Path $backendDir 'package.json')) },
  @{ Label = 'modules/ai-chat/package.json'; Passed = (Test-Path (Join-Path $aiChatDir 'package.json')) },
  @{ Label = 'apps/backend/src/index.js'; Passed = (Test-Path (Join-Path $backendDir 'src\index.js')) },
  @{ Label = 'data directory'; Passed = (Test-Path $dataDir) },
  @{ Label = 'crm.db or crm.db.gz'; Passed = ((Test-Path $dbPath) -or (Test-Path $dbGzipPath)) },
  @{ Label = 'node command'; Passed = (Test-Command 'node') },
  @{ Label = 'npm command'; Passed = (Test-Command 'npm') },
  @{ Label = 'workspace deps'; Passed = (Test-Path $rootNodeModules) }
)

foreach ($check in $checks) {
  $status = if ($check.Passed) { 'OK' } else { 'MISSING' }
  Write-Host ("[{0}] {1}" -f $status, $check.Label)
}

if (-not (Test-Path $dbPath) -and (Test-Path $dbGzipPath)) {
  Write-Host '[INFO] data/crm.db is missing but data/crm.db.gz is available for local seeding.'
}

if (-not (Test-Path $rootNodeModules)) {
  Write-Host '[INFO] Workspace dependencies are missing. The start script can install them for you.'
}
