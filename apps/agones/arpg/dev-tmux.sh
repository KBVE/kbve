#!/usr/bin/env bash
# arpg dev command center — one tmux session, the whole stack live.
#
# WHY: native dev is two long-lived processes (the Rust server on :7979 via
# server/dev.sh, the vite client on :5402) plus a scratch shell for git / nx /
# logs. Juggling three terminals is friction; this lays them out in one window
# and tears them all down together on detach-kill.
#
# WHAT (layout):
#   ┌────────────────┬────────────────┐
#   │ server (cargo- │ web (vite       │
#   │ watch, :7979)  │ :5402)          │
#   ├────────────────┴────────────────┤
#   │ scratch shell (git / nx / logs) │
#   └─────────────────────────────────┘
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

if [[ "${1:-}" == "kill" || "${1:-}" == "down" ]]; then
    tmux kill-session -t "$SESSION" 2>/dev/null && echo "killed '$SESSION'." || echo "no '$SESSION' session."
    exit 0
fi

# Already up? just attach.
if tmux has-session -t "$SESSION" 2>/dev/null; then
    exec tmux attach -t "$SESSION"
fi

cd "$ROOT"

# Window 0: server (top-left). cargo-watch native, frees :7979 from docker.
tmux new-session -d -s "$SESSION" -n stack -c "$ROOT"
tmux send-keys -t "$SESSION:stack" "./apps/agones/arpg/server/dev.sh" C-m

# Top-right: web client (vite :5402).
tmux split-window -h -t "$SESSION:stack" -c "$ROOT/apps/agones/arpg/web"
tmux send-keys -t "$SESSION:stack" "npm run dev" C-m

# Bottom: scratch shell across the full width (git / nx / logs).
tmux select-pane -t "$SESSION:stack.0"
tmux split-window -v -t "$SESSION:stack.0" -c "$ROOT"
tmux resize-pane -t "$SESSION:stack" -y 8
tmux send-keys -t "$SESSION:stack" "git -C \"$ROOT\" status -sb" C-m

tmux select-pane -t "$SESSION:stack.0"
exec tmux attach -t "$SESSION"
