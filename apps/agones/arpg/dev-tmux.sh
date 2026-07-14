#!/usr/bin/env bash
# arpg dev command center — one tmux session, the whole stack live.
#
# WHY: native dev is two long-lived processes (the Rust server on :7979 via
# server/dev.sh, the vite client on :5402) plus a scratch shell for git / nx /
# logs. Juggling three terminals is friction; this lays them out in one window
# and tears them all down together on detach-kill.
#
# WHAT (2x2 layout):
#   ┌────────────────┬────────────────┐
#   │ server (cargo- │ web (vite       │
#   │ watch, :7979)  │ :5402)          │
#   ├────────────────┼────────────────┤
#   │ scratch shell  │ typecheck       │
#   │ (git / nx)     │ (tsc --watch)   │
#   └────────────────┴────────────────┘
#
#   ./apps/agones/arpg/dev-tmux.sh          # attach (creates if missing)
#   ./apps/agones/arpg/dev-tmux.sh kill      # tear the session down
#   tmux kill-session -t arpg                # same
set -euo pipefail

SESSION="arpg"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

if ! command -v tmux >/dev/null 2>&1; then
    echo "tmux not found. Install: brew install tmux" >&2
    exit 1
fi

free_port() {
    local port="$1"
    local pids
    pids="$(lsof -ti "tcp:$port" 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
        echo "  freeing :$port ($pids)"
        kill $pids 2>/dev/null || true
        sleep 1
        pids="$(lsof -ti "tcp:$port" 2>/dev/null || true)"
        [[ -n "$pids" ]] && kill -9 $pids 2>/dev/null || true
    fi
}

if [[ "${1:-}" == "kill" || "${1:-}" == "down" ]]; then
    if tmux has-session -t "$SESSION" 2>/dev/null; then
        echo "stopping '$SESSION' panes..."
        # Interrupt each watcher (cargo-watch, vite, tsc) so they clean up + free ports.
        while read -r pane; do
            [[ -n "$pane" ]] && tmux send-keys -t "$pane" C-c 2>/dev/null || true
        done < <(tmux list-panes -s -t "$SESSION" -F '#{pane_id}' 2>/dev/null)
        sleep 2
        tmux kill-session -t "$SESSION" 2>/dev/null && echo "killed '$SESSION'." || echo "no '$SESSION' session."
    else
        echo "no '$SESSION' session."
    fi
    # Reap stragglers still holding the dev ports.
    free_port 7979
    free_port 5402
    exit 0
fi

# Already up? just attach.
if tmux has-session -t "$SESSION" 2>/dev/null; then
    exec tmux attach -t "$SESSION"
fi

cd "$ROOT"
WEB="$ROOT/apps/agones/arpg/web"

# Build a 2x2 grid by pane-id (robust to tmux's pane renumbering): top row splits
# server|web, bottom row splits scratch|typecheck.
tmux new-session -d -s "$SESSION" -n stack -c "$ROOT"
TOP="$(tmux display-message -p -t "$SESSION:stack" '#{pane_id}')"
BOT="$(tmux split-window -v -P -F '#{pane_id}' -t "$TOP" -c "$ROOT")"
WEBP="$(tmux split-window -h -P -F '#{pane_id}' -t "$TOP" -c "$WEB")"
TCP="$(tmux split-window -h -P -F '#{pane_id}' -t "$BOT" -c "$WEB")"

# Top-left: server (cargo-watch native, frees :7979 from docker).
tmux send-keys -t "$TOP" "./apps/agones/arpg/server/dev.sh" C-m
# Top-right: web client (vite :5402).
tmux send-keys -t "$WEBP" "npm run dev" C-m
# Bottom-left: scratch shell (git / nx / logs).
tmux send-keys -t "$BOT" "git -C \"$ROOT\" status -sb" C-m
# Bottom-right: live typecheck (mirrors the arpg-web:typecheck target, --watch).
tmux send-keys -t "$TCP" "npx tsc --noEmit --watch" C-m

# Keep the bottom row compact; land on the server pane.
tmux resize-pane -t "$BOT" -y 12
tmux select-pane -t "$TOP"
exec tmux attach -t "$SESSION"
