# vm-windows-bootstrap.ps1 — One-shot setup for Windows Server UE5 build VM
# Run as Administrator in PowerShell:
#   irm https://raw.githubusercontent.com/KBVE/kbve/main/scripts/vm-windows-bootstrap.ps1 | iex
#
# Or locally:
#   .\scripts\vm-windows-bootstrap.ps1
#
# What it installs:
#   - Git, Python 3, .NET SDK 8.0, DirectX Runtime
#   - Visual Studio 2022 Build Tools (MSVC C++ workload)
#   - GitHub Actions Runner (prompts for token)
#   - Enables RDP + firewall rules
#   - Sets TLS 1.2, DNS to 1.1.1.1/8.8.8.8

#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"

$installDir = "C:\bootstrap"
New-Item -ItemType Directory -Force -Path $installDir | Out-Null

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Install-FromUrl($name, $url, $outFile, $args) {
    Write-Step "Installing $name"
    $path = Join-Path $installDir $outFile
    if (!(Test-Path $path)) {
        Write-Host "Downloading $name..."
        Invoke-WebRequest -Uri $url -OutFile $path -UseBasicParsing
    }
    Write-Host "Running installer..."
    Start-Process $path -ArgumentList $args -Wait -NoNewWindow
    Write-Host "$name installed."
}

# --- Prerequisites ---
Write-Step "Configuring system"

# TLS 1.2
Set-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\.NETFramework\v4.0.30319' -Name 'SchUseStrongCrypto' -Value 1 -Type DWord -Force
Set-ItemProperty -Path 'HKLM:\SOFTWARE\Wow6432Node\Microsoft\.NETFramework\v4.0.30319' -Name 'SchUseStrongCrypto' -Value 1 -Type DWord -Force
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# DNS
$adapter = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1
if ($adapter) {
    Set-DnsClientServerAddress -InterfaceAlias $adapter.Name -ServerAddresses ("1.1.1.1","8.8.8.8")
    Write-Host "DNS set to 1.1.1.1, 8.8.8.8 on $($adapter.Name)"
}

# Enable RDP
Set-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -Name "fDenyTSConnections" -Value 0
Enable-NetFirewallRule -DisplayGroup "Remote Desktop"
Write-Host "RDP enabled."

# --- Git ---
Install-FromUrl "Git" `
    "https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.2/Git-2.47.1.2-64-bit.exe" `
    "git-install.exe" `
    '/VERYSILENT /NORESTART'

# Add git to PATH for this session
$env:Path += ";C:\Program Files\Git\bin"

# --- Python 3 ---
Install-FromUrl "Python 3" `
    "https://www.python.org/ftp/python/3.12.4/python-3.12.4-amd64.exe" `
    "python-install.exe" `
    '/quiet InstallAllUsers=1 PrependPath=1'

# --- .NET SDK 8.0 ---
Write-Step "Installing .NET SDK 8.0"
$dotnetScript = Join-Path $installDir "dotnet-install.ps1"
if (!(Test-Path $dotnetScript)) {
    Invoke-WebRequest -Uri "https://dot.net/v1/dotnet-install.ps1" -OutFile $dotnetScript -UseBasicParsing
}
& $dotnetScript -Channel 8.0
Write-Host ".NET SDK 8.0 installed."

# --- Visual Studio Build Tools ---
Write-Step "Installing Visual Studio 2022 Build Tools (this takes 10-15 minutes)"
$vsPath = Join-Path $installDir "vs_buildtools.exe"
if (!(Test-Path $vsPath)) {
    Invoke-WebRequest -Uri "https://aka.ms/vs/17/release/vs_buildtools.exe" -OutFile $vsPath -UseBasicParsing
}
$vsArgs = @(
    '--add', 'Microsoft.VisualStudio.Workload.VCTools',
    '--add', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
    '--add', 'Microsoft.VisualStudio.Component.Windows11SDK.26100',
    '--add', 'Microsoft.Component.MSBuild',
    '--includeRecommended',
    '--quiet', '--wait', '--norestart'
)
Start-Process $vsPath -ArgumentList $vsArgs -Wait -NoNewWindow
Write-Host "Visual Studio Build Tools installed."

# --- DirectX Runtime ---
Install-FromUrl "DirectX Runtime" `
    "https://download.microsoft.com/download/1/7/1/1718CCC4-6315-4D8E-9543-8E28A4E18C4C/dxwebsetup.exe" `
    "dxsetup.exe" `
    '/Q'

# --- GitHub Actions Runner ---
Write-Step "Installing GitHub Actions Runner"
$runnerDir = "C:\actions-runner"
if (!(Test-Path $runnerDir)) {
    New-Item -ItemType Directory -Force -Path $runnerDir | Out-Null
    $runnerZip = Join-Path $installDir "actions-runner.zip"
    if (!(Test-Path $runnerZip)) {
        Invoke-WebRequest -Uri "https://github.com/actions/runner/releases/download/v2.333.0/actions-runner-win-x64-2.333.0.zip" -OutFile $runnerZip -UseBasicParsing
    }
    Expand-Archive -Path $runnerZip -DestinationPath $runnerDir
    Write-Host "Runner extracted to $runnerDir"
}

Write-Host ""
Write-Host "=== Bootstrap Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Configure the GitHub Actions runner:"
Write-Host "     cd C:\actions-runner"
Write-Host "     .\config.cmd --url https://github.com/KBVE/UnrealEngine-Angelscript --token <TOKEN> --name ue-win-builder --labels ue-win-builder --runasservice"
Write-Host ""
Write-Host "  2. Get a runner token from:"
Write-Host "     https://github.com/KBVE/UnrealEngine-Angelscript/settings/actions/runners/new"
Write-Host ""
