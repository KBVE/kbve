<#
.SYNOPSIS
    Restore an encrypted debug-symbol archive into a game build (Windows).

.DESCRIPTION
    utils-unreal-build.yml strips debug files (PDB, Binaries\*.map, Manifest_*.txt on
    Win64; .dSYM bundles + Manifest_*.txt on Mac) out of the shipped payload and
    uploads them as a SEPARATE, PASSWORD-ENCRYPTED artifact - this repo is public,
    so a plaintext symbol artifact would be world-readable.

    This script reverses that: decrypt -> unzip -> put every file back at the exact
    relative path it had before the strip.

    Needs no OpenSSL install: it reproduces the OpenSSL "Salted__" container
    (AES-256-CBC, PBKDF2-HMAC-SHA256, 100000 iterations) with .NET.

.EXAMPLE
    .\extract-debug.ps1
    .\extract-debug.ps1 -Archive chuck-windows-symbols.zip.enc -GameDir .\Windows
#>
[CmdletBinding()]
param(
    [string]$Archive,
    [string]$GameDir
)

$ErrorActionPreference = 'Stop'

function Fail($msg) { Write-Host "error: $msg" -ForegroundColor Red; exit 1 }

if ([string]::IsNullOrWhiteSpace($Archive)) {
    $Archive = Read-Host "Path to symbol archive (.zip.enc or .zip)"
}
$Archive = $Archive.Trim().Trim('"')
if (-not (Test-Path -LiteralPath $Archive -PathType Leaf)) { Fail "archive not found: $Archive" }
$Archive = (Resolve-Path -LiteralPath $Archive).Path

if ([string]::IsNullOrWhiteSpace($GameDir)) {
    $GameDir = Read-Host "Path to the game folder to restore into (the one with the .exe)"
}
$GameDir = $GameDir.Trim().Trim('"')
if (-not (Test-Path -LiteralPath $GameDir -PathType Container)) { Fail "game folder not found: $GameDir" }
$GameDir = (Resolve-Path -LiteralPath $GameDir).Path

$work = Join-Path ([System.IO.Path]::GetTempPath()) ("extract-debug-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $work | Out-Null
$zip = Join-Path $work 'symbols.zip'

try {
    if ($Archive.ToLower().EndsWith('.enc')) {
        $pass = $env:SYMBOL_ARCHIVE_PASSWORD
        if ([string]::IsNullOrEmpty($pass)) {
            $secure = Read-Host "Archive password" -AsSecureString
            $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
            $pass = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }

        $inStream = [System.IO.File]::OpenRead($Archive)
        try {
            $magic = New-Object byte[] 8
            $salt  = New-Object byte[] 8
            if ($inStream.Read($magic, 0, 8) -ne 8 -or $inStream.Read($salt, 0, 8) -ne 8) {
                Fail "archive is too small to be an openssl 'Salted__' container"
            }
            if ([System.Text.Encoding]::ASCII.GetString($magic) -ne 'Salted__') {
                Fail "not an openssl 'Salted__' container: $Archive"
            }

            $kdf = New-Object System.Security.Cryptography.Rfc2898DeriveBytes(
                $pass, $salt, 100000, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
            $keyIv = $kdf.GetBytes(48)
            $aes = [System.Security.Cryptography.Aes]::Create()
            $aes.KeySize = 256
            $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
            $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
            $aes.Key = [byte[]]$keyIv[0..31]
            $aes.IV  = [byte[]]$keyIv[32..47]

            $outStream = [System.IO.File]::Create($zip)
            try {
                $cs = New-Object System.Security.Cryptography.CryptoStream(
                    $inStream, $aes.CreateDecryptor(), [System.Security.Cryptography.CryptoStreamMode]::Read)
                $cs.CopyTo($outStream)
                $cs.Dispose()
            } catch {
                Fail "decrypt failed - wrong password, or the archive is corrupt"
            } finally {
                $outStream.Dispose()
            }
            $aes.Dispose()
        } finally {
            $inStream.Dispose()
        }
    }
    elseif ($Archive.ToLower().EndsWith('.zip')) {
        Copy-Item -LiteralPath $Archive -Destination $zip
    }
    else {
        Fail "expected a .zip.enc or .zip archive, got: $Archive"
    }

    $extract = Join-Path $work 'extract'
    New-Item -ItemType Directory -Force -Path $extract | Out-Null
    try {
        Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force
    } catch {
        Fail "unzip failed - the archive is corrupt or the password was wrong"
    }

    # The Mac job zips the container dir itself, the Win64 job zips its contents.
    # Normalise: a lone top-level *symbols* dir is the container, step into it.
    $root = $extract
    $entries = @(Get-ChildItem -LiteralPath $extract -Force)
    if ($entries.Count -eq 1 -and $entries[0].PSIsContainer -and $entries[0].Name -like '*symbols*') {
        $root = $entries[0].FullName
    }

    $files = @(Get-ChildItem -LiteralPath $root -Recurse -File -Force)
    if ($files.Count -eq 0) { Fail "archive is empty - nothing to restore" }

    Write-Host "Restoring $($files.Count) debug file(s) into $GameDir"
    foreach ($f in $files) {
        $rel  = $f.FullName.Substring($root.Length).TrimStart('\')
        $dest = Join-Path $GameDir $rel
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
        Copy-Item -LiteralPath $f.FullName -Destination $dest -Force
        Write-Host "  $rel"
    }
    Write-Host "Done."
}
finally {
    Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
