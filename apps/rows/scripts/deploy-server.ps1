# OWS Dedicated Server — Build & Deploy to PVC (Windows)
# Usage: .\deploy-server.ps1 [-Version 0.2.0] [-SkipBuild] [-SkipDeploy]
#
# Builds HubWorldMMO Linux dedicated server using the local UE5 install
# (cross-compile via Linux toolchain), then uploads to the ows-server-build
# PVC in arc-runners namespace.
#
# Requirements:
#   - UE5 installed with Linux cross-compile toolchain
#   - kubectl configured with cluster access

param(
    [string]$Version = "dev-$(Get-Date -Format 'yyyyMMdd-HHmmss')",
    [string]$ChuckDir = "",
    [string]$EngineDir = "",
    [switch]$SkipBuild,
    [switch]$SkipDeploy
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path "$ScriptDir\..\..\..").Path

if (-not $ChuckDir) {
    $ChuckDir = (Resolve-Path "$RepoRoot\..\chuck" -ErrorAction SilentlyContinue).Path
    if (-not $ChuckDir) {
        Write-Error "Chuck repo not found. Set -ChuckDir parameter."
        exit 1
    }
}

# Auto-detect UE5 install
if (-not $EngineDir) {
    $SearchPaths = @(
        "C:\Program Files\Epic Games\UE_5.7",
        "C:\Program Files (x86)\Epic Games\UE_5.7",
        "D:\Epic Games\UE_5.7",
        "$env:USERPROFILE\UnrealEngine"
    )
    foreach ($path in $SearchPaths) {
        if (Test-Path "$path\Engine\Build\BatchFiles\RunUAT.bat") {
            $EngineDir = $path
            break
        }
    }
    if (-not $EngineDir) {
        Write-Error "UE5 not found. Set -EngineDir to your Unreal Engine install path."
        exit 1
    }
}

$RunUAT = "$EngineDir\Engine\Build\BatchFiles\RunUAT.bat"
$OutputDir = "$env:TEMP\ows-server-output"
$PvcNamespace = "arc-runners"
$PvcPod = "ows-server-sync"

Write-Host "=== OWS Dedicated Server Deploy ===" -ForegroundColor Cyan
Write-Host "  Version:  $Version"
Write-Host "  Chuck:    $ChuckDir"
Write-Host "  Engine:   $EngineDir"
Write-Host "  Output:   $OutputDir"
Write-Host ""

# ── Validate ──────────────────────────────────────────────
if (-not (Test-Path "$ChuckDir\HubWorldMMO")) {
    Write-Error "HubWorldMMO not found at $ChuckDir\HubWorldMMO"
    exit 1
}

if (-not (Test-Path $RunUAT)) {
    Write-Error "RunUAT.bat not found at $RunUAT"
    exit 1
}

# ── Build ─────────────────────────────────────────────────
if (-not $SkipBuild) {
    Write-Host ">>> Building Linux dedicated server (cross-compile)..." -ForegroundColor Green

    if (Test-Path $OutputDir) { Remove-Item -Recurse -Force $OutputDir }
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

    $ProjectPath = "$ChuckDir\HubWorldMMO\OWSHubWorldMMO.uproject"

    & $RunUAT BuildCookRun `
        "-project=$ProjectPath" `
        -targetplatform=Linux `
        -target=OWSHubWorldMMOServer `
        -server `
        -serverconfig=Development `
        -cook `
        -allmaps `
        -build `
        -stage `
        -pak `
        -archive `
        "-archivedirectory=$OutputDir" `
        -unattended `
        -utf8output `
        -NoP4

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }

    if (-not (Test-Path "$OutputDir\LinuxServer")) {
        Write-Error "Build succeeded but LinuxServer output not found."
        Get-ChildItem $OutputDir -Directory -Recurse -Depth 2
        exit 1
    }

    $Size = (Get-ChildItem "$OutputDir\LinuxServer" -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
    Write-Host ">>> Build complete: $([math]::Round($Size))MB" -ForegroundColor Green
} else {
    Write-Host ">>> Skipping build (-SkipBuild)"
    if (-not (Test-Path "$OutputDir\LinuxServer")) {
        Write-Error "No existing build at $OutputDir\LinuxServer"
        exit 1
    }
}

# ── Deploy to PVC ─────────────────────────────────────────
if (-not $SkipDeploy) {
    Write-Host ">>> Deploying to PVC ($PvcNamespace/ows-server-build) as version $Version..." -ForegroundColor Green

    @"
apiVersion: v1
kind: Pod
metadata:
  name: $PvcPod
  namespace: $PvcNamespace
spec:
  containers:
    - name: sync
      image: busybox:1.37
      command: ["sleep", "600"]
      volumeMounts:
        - name: server-build
          mountPath: /mnt/ows-server
  volumes:
    - name: server-build
      persistentVolumeClaim:
        claimName: ows-server-build
  restartPolicy: Never
"@ | kubectl apply -f -

    kubectl wait --for=condition=Ready "pod/$PvcPod" -n $PvcNamespace --timeout=120s
    kubectl exec $PvcPod -n $PvcNamespace -- mkdir -p "/mnt/ows-server/$Version"

    Write-Host ">>> Uploading server files (this may take a minute)..."
    Push-Location $OutputDir
    tar cf - LinuxServer | kubectl exec -i $PvcPod -n $PvcNamespace -- tar xf - -C "/mnt/ows-server/$Version/"
    Pop-Location

    kubectl exec $PvcPod -n $PvcNamespace -- ln -sfn "/mnt/ows-server/$Version" /mnt/ows-server/latest

    Write-Host ""
    kubectl exec $PvcPod -n $PvcNamespace -- sh -c "echo '=== PVC Contents ===' && ls -la /mnt/ows-server/ && echo '' && du -sh /mnt/ows-server/$Version/"

    kubectl delete pod $PvcPod -n $PvcNamespace --grace-period=0

    Write-Host ""
    Write-Host ">>> Server v$Version deployed. OWSInstanceLauncher will use /mnt/ows-server/latest/" -ForegroundColor Green
} else {
    Write-Host ">>> Skipping deploy (-SkipDeploy)"
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan
