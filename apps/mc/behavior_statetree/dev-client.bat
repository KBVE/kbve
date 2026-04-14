@echo off
REM Launch a Fabric development client with the behavior_statetree mod.
REM
REM Prerequisites:
REM   1. Docker dev server running: npx nx run mc:dev
REM   2. Java 21+ installed
REM
REM Usage:
REM   cd apps\mc\behavior_statetree
REM   dev-client.bat

echo === KBVE MC Dev Client ===
echo.

REM Check for Rust native lib (optional)
if exist "..\target\release\behavior_statetree.dll" (
    echo [OK] Rust native lib found
) else (
    echo [WARN] Rust native lib not found — AI features won't work
    echo        Ships + client rendering still work fine
    echo        Build with: cargo build -p behavior_statetree --release
    echo.
)

echo Building mod + launching Minecraft client...
echo Connect to: localhost:25565
echo.

cd java
call gradle runClient --no-daemon
