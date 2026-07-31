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

EVENT_SRC=/opt/palchatrelay/PalEventRelay
if [[ -d "${EVENT_SRC}" ]]; then
    echo "[palchatrelay-overlay] staging PalEventRelay into ${MODS_DIR}"
    rm -rf "${MODS_DIR}/PalEventRelay"
    cp -a "${EVENT_SRC}" "${MODS_DIR}/PalEventRelay"
    if [[ -d "${MODS_DIR}/PalEventRelay/scripts" ]] && [[ ! -d "${MODS_DIR}/PalEventRelay/Scripts" ]]; then
        mv "${MODS_DIR}/PalEventRelay/scripts" "${MODS_DIR}/PalEventRelay/Scripts"
    fi
    if grep -qiE '^[[:space:]]*PalEventRelay[[:space:]]*:' "${MODS_TXT}"; then
        sed -i -E 's|^[[:space:]]*PalEventRelay[[:space:]]*:.*|PalEventRelay : 1|I' "${MODS_TXT}"
    else
        echo "PalEventRelay : 1" >> "${MODS_TXT}"
    fi
fi

FORGE_SRC=/opt/palchatrelay/PalForge
if [[ -d "${FORGE_SRC}" ]]; then
    echo "[palchatrelay-overlay] staging PalForge into ${MODS_DIR}"
    rm -rf "${MODS_DIR}/PalForge"
    cp -a "${FORGE_SRC}" "${MODS_DIR}/PalForge"
    rm -rf "${MODS_DIR}/PalForge/test"
    if [[ -d "${MODS_DIR}/PalForge/scripts" ]] && [[ ! -d "${MODS_DIR}/PalForge/Scripts" ]]; then
        mv "${MODS_DIR}/PalForge/scripts" "${MODS_DIR}/PalForge/Scripts"
    fi
    if grep -qiE '^[[:space:]]*PalForge[[:space:]]*:' "${MODS_TXT}"; then
        sed -i -E 's|^[[:space:]]*PalForge[[:space:]]*:.*|PalForge : 1|I' "${MODS_TXT}"
    else
        echo "PalForge : 1" >> "${MODS_TXT}"
    fi
fi

# PalSchema (Okaetsu) — C++ dll framework fetched (pinned+sha256) into
# /opt/palchatrelay/PalSchema by the Dockerfile. Stage the whole mod folder
# (dlls/main.dll + enabled.txt + mods/) into ue4ss/Mods, then layer our KBVE
# JSON overlay (mods/PalSchema/mods/*) on top of the framework's mods/ dir.
SCHEMA_SRC=/opt/palchatrelay/PalSchema
if [[ -d "${SCHEMA_SRC}" ]]; then
    echo "[palchatrelay-overlay] staging PalSchema into ${MODS_DIR}"
    rm -rf "${MODS_DIR}/PalSchema"
    cp -a "${SCHEMA_SRC}" "${MODS_DIR}/PalSchema"
    mkdir -p "${MODS_DIR}/PalSchema/mods"

    SCHEMA_OVERLAY=/opt/palchatrelay/PalSchema-overlay/mods
    if [[ -d "${SCHEMA_OVERLAY}" ]]; then
        shopt -s nullglob dotglob
        overlay_files=("${SCHEMA_OVERLAY}"/*)
        if (( ${#overlay_files[@]} )); then
            echo "[palchatrelay-overlay] layering KBVE PalSchema JSON overlay"
            cp -a "${SCHEMA_OVERLAY}"/. "${MODS_DIR}/PalSchema/mods/"
        fi
        shopt -u nullglob dotglob
    fi

    if grep -qiE '^[[:space:]]*PalSchema[[:space:]]*:' "${MODS_TXT}"; then
        sed -i -E 's|^[[:space:]]*PalSchema[[:space:]]*:.*|PalSchema : 1|I' "${MODS_TXT}"
    else
        echo "PalSchema : 1" >> "${MODS_TXT}"
    fi
else
    echo "[palchatrelay-overlay] WARN: PalSchema not found at ${SCHEMA_SRC} (Dockerfile fetch failed?)"
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
