#!/bin/bash
set -euo pipefail

BIN_DIR="$(dirname "${GAME_BIN:-/palworld/Pal/Binaries/Win64/PalServer-Win64-Shipping-Cmd.exe}")"
UE4SS_DIR="${BIN_DIR}/ue4ss"
MODS_DIR="${UE4SS_DIR}/Mods"
SRC=/opt/palchatrelay/PalChatRelay

echo "[palchatrelay-overlay] staging PalChatRelay into ${MODS_DIR}"

if [[ ! -d "${UE4SS_DIR}" ]]; then
    echo "[palchatrelay-overlay] ERROR: UE4SS not installed at ${UE4SS_DIR} (INSTALL_UE4SS_EXPERIMENTAL=true?)" >&2
    exit 1
fi

mkdir -p "${MODS_DIR}"
rm -rf "${MODS_DIR}/PalChatRelay"
cp -a "${SRC}" "${MODS_DIR}/PalChatRelay"

# Windows UE4SS expects capital 'Scripts/'; normalize on the case-sensitive
# Linux target (bundled mods use Scripts/, our source ships scripts/).
if [[ -d "${MODS_DIR}/PalChatRelay/scripts" ]] && [[ ! -d "${MODS_DIR}/PalChatRelay/Scripts" ]]; then
    mv "${MODS_DIR}/PalChatRelay/scripts" "${MODS_DIR}/PalChatRelay/Scripts"
fi

MODS_TXT="${MODS_DIR}/mods.txt"
touch "${MODS_TXT}"
if grep -qiE '^[[:space:]]*PalChatRelay[[:space:]]*:' "${MODS_TXT}"; then
    sed -i -E 's|^[[:space:]]*PalChatRelay[[:space:]]*:.*|PalChatRelay : 1|I' "${MODS_TXT}"
else
    echo "PalChatRelay : 1" >> "${MODS_TXT}"
fi

# Headless server has no GPU: force the UE4SS GUI/OpenGL console off (it hangs
# or crashes the game under Xvfb). Keep the text console on for logging.
SETTINGS="${UE4SS_DIR}/UE4SS-settings.ini"
if [[ -f "${SETTINGS}" ]]; then
    sed -i -E 's/^([[:space:]]*GuiConsoleEnabled[[:space:]]*=).*/\1 0/I' "${SETTINGS}"
    sed -i -E 's/^([[:space:]]*GuiConsoleVisible[[:space:]]*=).*/\1 0/I' "${SETTINGS}"
    sed -i -E 's/^([[:space:]]*ConsoleEnabled[[:space:]]*=).*/\1 1/I' "${SETTINGS}"
    echo "[palchatrelay-overlay] patched UE4SS-settings.ini (GuiConsole off):"
    grep -iE 'ConsoleEnabled|GuiConsole' "${SETTINGS}" | sed 's/^/  /'
else
    echo "[palchatrelay-overlay] WARN: UE4SS-settings.ini not found at ${SETTINGS}"
fi

CHAT_DIR="${PALWORLD_CHAT_LOG_DIR:-/shared/chat}"
mkdir -p "${CHAT_DIR}" 2>/dev/null || true

echo "[palchatrelay-overlay] done. mods.txt:"
cat "${MODS_TXT}"
