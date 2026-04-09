[CmdletBinding()]
param(
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$frontendDir = Join-Path $repoRoot 'apps\frontend'
$backendDir = Join-Path $repoRoot 'apps\backend'
$aiChatDir = Join-Path $repoRoot 'modules\ai-chat'
$dataDir = Join-Path $repoRoot 'data'
$dbPath = Join-Path $dataDir 'crm.db'
$dbGzipPath = Join-Path $dataDir 'crm.db.gz'
$rootNodeModules = Join-Path $repoRoot 'node_modules'

function Expand-GzipFile($sourcePath, $targetPath) {
  $sourceStream = [System.IO.File]::OpenRead($sourcePath)
  try {
    $targetStream = [System.IO.File]::Create($targetPath)
    try {
      $gzipStream = New-Object System.IO.Compression.GzipStream($sourceStream, [System.IO.Compression.CompressionMode]::Decompress)
      try {
        $gzipStream.CopyTo($targetStream)
      } finally {
        $gzipStream.Dispose()
      }
    } finally {
      $targetStream.Dispose()
    }
  } finally {
    $sourceStream.Dispose()
  }
}

if (-not (Test-Path $frontendDir)) {
  throw 'Missing apps/frontend. Cannot start localhost.'
}

if (-not (Test-Path $backendDir)) {
  throw 'Missing apps/backend. Cannot start localhost.'
}

if (-not (Test-Path $dbPath)) {
  if (-not (Test-Path $dbGzipPath)) {
    throw 'Missing both data/crm.db and data/crm.db.gz.'
  }

  Write-Host '[local-stack] Seeding data/crm.db from data/crm.db.gz'
  New-Item -ItemType Directory -Force $dataDir | Out-Null
  Expand-GzipFile -sourcePath $dbGzipPath -targetPath $dbPath
}

if (-not $SkipInstall -and -not (Test-Path $rootNodeModules)) {
  Write-Host '[local-stack] Installing workspace dependencies'
  Push-Location $repoRoot
  try {
    npm install
  } finally {
    Pop-Location
  }
}

Write-Host '[local-stack] Starting frontend and backend from repo root'
Push-Location $repoRoot
try {
  npm run dev
} finally {
  Pop-Location
}
