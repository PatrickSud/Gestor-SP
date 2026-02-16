# bump-version.ps1
# Script para incrementar a versão patch do projeto Gestor SP e enviar ao GitHub.
# Uso:
#   .\bump-version.ps1              -> incrementa patch (ex: 2.2.5 -> 2.2.6)
#   .\bump-version.ps1 -Part minor  -> incrementa minor (ex: 2.2.5 -> 2.3.0)
#   .\bump-version.ps1 -Part major  -> incrementa major (ex: 2.2.5 -> 3.0.0)
#   .\bump-version.ps1 -Message "minha msg de commit"

param(
    [ValidateSet("patch", "minor", "major")]
    [string]$Part = "patch",
    [string]$Message = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# --- 1. Detectar versão atual a partir do sw.js ---
$swFile = Join-Path $projectRoot "sw.js"
$swContent = Get-Content $swFile -Raw

if ($swContent -match "gestor-sp-v(\d+)\.(\d+)\.(\d+)") {
    $major = [int]$Matches[1]
    $minor = [int]$Matches[2]
    $patch = [int]$Matches[3]
} else {
    Write-Error "Nao foi possivel detectar a versao atual em sw.js"
    exit 1
}

$currentVersion = "$major.$minor.$patch"

# --- 2. Calcular nova versão ---
switch ($Part) {
    "major" { $major++; $minor = 0; $patch = 0 }
    "minor" { $minor++; $patch = 0 }
    "patch" { $patch++ }
}

$newVersion = "$major.$minor.$patch"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Gestor SP - Version Bump" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Atual:  v$currentVersion" -ForegroundColor Yellow
Write-Host "  Nova:   v$newVersion" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- 3. Arquivos e padrões para substituir ---
$replacements = @(
    @{ File = "sw.js";        Old = "gestor-sp-v$currentVersion";             New = "gestor-sp-v$newVersion" },
    @{ File = "sw.js";        Old = "cache v$currentVersion";                 New = "cache v$newVersion" },
    @{ File = "js\store.js";  Old = "version: '$currentVersion'";             New = "version: '$newVersion'" },
    @{ File = "index.html";   Old = "Gestor SP - v$currentVersion";           New = "Gestor SP - v$newVersion" },
    @{ File = "index.html";   Old = ">v$currentVersion<";                     New = ">v$newVersion<" }
)

foreach ($r in $replacements) {
    $filePath = Join-Path $projectRoot $r.File
    $content = Get-Content $filePath -Raw -Encoding UTF8

    if ($content.Contains($r.Old)) {
        $content = $content.Replace($r.Old, $r.New)
        [System.IO.File]::WriteAllText($filePath, $content, [System.Text.UTF8Encoding]::new($false))
        Write-Host "  [OK] $($r.File) -> '$($r.Old)' => '$($r.New)'" -ForegroundColor Green
    } else {
        Write-Host "  [!!] $($r.File) -> padrao nao encontrado: '$($r.Old)'" -ForegroundColor Red
    }
}

Write-Host ""

# --- 4. Git: commit e push ---
if ([string]::IsNullOrWhiteSpace($Message)) {
    $Message = "release: v$newVersion"
}

Write-Host "Commitando e enviando ao GitHub..." -ForegroundColor Cyan

Push-Location $projectRoot
try {
    git add -A
    git commit -m $Message
    git tag "v$newVersion"
    git push
    git push --tags
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  v$newVersion publicada com sucesso!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
