#!/bin/sh
set -eu

RCON_HOST="${FACTORIO_RCON_BIND:-127.0.0.1}"
RCON_PORT="${FACTORIO_RCON_PORT:-27015}"
RCON_PASS="${FACTORIO_RCON_PASSWORD:-}"
CONSOLE_LOG="${FACTORIO_CONSOLE_LOG:-/shared/log/console.log}"
PRESTOP_WARN_SECS="${PRESTOP_WARN_SECS:-60}"
PRESTOP_SAVE_TIMEOUT="${PRESTOP_SAVE_TIMEOUT:-30}"

if [ -z "$RCON_PASS" ]; then
    echo "[prestop] FACTORIO_RCON_PASSWORD unset — skipping graceful save"
    exit 0
fi

rcon() {
    PYTHONUNBUFFERED=1 python3 - "$RCON_HOST" "$RCON_PORT" "$RCON_PASS" "$1" <<'PY' || true
import socket, struct, sys
host, port, pw, cmd = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
def pkt(rid, t, body):
    p = struct.pack('<ii', rid, t) + body.encode() + b'\x00\x00'
    return struct.pack('<i', len(p)) + p
def recv_n(s, n):
    buf = b''
    while len(buf) < n:
        c = s.recv(n - len(buf))
        if not c: raise EOFError
        buf += c
    return buf
def recv_pkt(s):
    sz = struct.unpack('<i', recv_n(s, 4))[0]
    return recv_n(s, sz)
s = socket.create_connection((host, port), timeout=5)
s.send(pkt(1, 3, pw))
recv_pkt(s)
s.send(pkt(2, 2, cmd))
print(recv_pkt(s)[8:-2].decode(errors='replace'))
s.close()
PY
}

now_epoch() { date +%s; }

countdown() {
    total="$1"
    elapsed=0
    while [ "$elapsed" -lt "$total" ]; do
        remaining=$((total - elapsed))
        if [ "$remaining" -gt 30 ]; then step=15
        elif [ "$remaining" -gt 10 ]; then step=10
        else step=5
        fi
        rcon "/silent-command game.print('[KBVE] Server restarting in ${remaining}s for an update — your progress will be saved.')" >/dev/null
        if [ "$step" -ge "$remaining" ]; then
            sleep "$remaining"
            elapsed=$total
        else
            sleep "$step"
            elapsed=$((elapsed + step))
        fi
    done
}

wait_for_save() {
    timeout_at=$(( $(now_epoch) + PRESTOP_SAVE_TIMEOUT ))
    [ -f "$CONSOLE_LOG" ] || return 0
    start_size=$(wc -c < "$CONSOLE_LOG" 2>/dev/null || echo 0)
    while [ "$(now_epoch)" -lt "$timeout_at" ]; do
        if [ "$start_size" -gt 0 ]; then
            tail -c +$((start_size + 1)) "$CONSOLE_LOG" 2>/dev/null | grep -q 'Saving finished' && return 0
        else
            grep -q 'Saving finished' "$CONSOLE_LOG" 2>/dev/null && return 0
        fi
        sleep 1
    done
    return 1
}

echo "[prestop] starting graceful rotation"
countdown "$PRESTOP_WARN_SECS"
rcon "/silent-command game.print('[KBVE] Saving map now…')" >/dev/null
rcon "/server-save" >/dev/null
if wait_for_save; then
    echo "[prestop] save confirmed in console log"
else
    echo "[prestop] save confirmation timed out after ${PRESTOP_SAVE_TIMEOUT}s — proceeding to SIGTERM anyway"
fi
rcon "/silent-command game.print('[KBVE] Restart now. See you in a minute.')" >/dev/null
echo "[prestop] done"
exit 0
