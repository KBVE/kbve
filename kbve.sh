#!/bin/bash

# Function to check if a command is installed
is_installed() {
    command -v "$1" >/dev/null 2>&1
}

# Function to ping a domain and check connectivity
ping_domain() {
    ping -c 1 "$1" &> /dev/null && echo "true" || echo "false"
}

# Function to check if the current user is root
check_root() {
    [ "$(id -u)" -eq 0 ] && echo "true" || echo "false"
}

# Function to manage a tmux session named 'studio'
manage_tmux_session() {
    if ! tmux has-session -t studio 2>/dev/null; then
        echo "Creating a new tmux session named 'studio'."
        tmux new-session -s studio -d
        tmux send-keys -t studio "pnpm nx run api:studio" C-m
    else
        echo "Tmux session 'studio' already exists."
    fi
    tmux attach-session -t studio
}

# Main execution
case "$1" in
    -check)
        all_installed=true
        for cmd in "${@:2}"; do
            is_installed "$cmd" || { echo "$cmd is not installed."; all_installed=false; }
        done
        $all_installed && echo "true" || echo "false"
        ;;
    -ping)
        [ -z "$2" ] && { echo "No domain specified. Usage: $0 -ping [domain]"; exit 1; }
        ping_domain "$2"
        ;;
    -root)
        check_root
        ;;
    -studio)
        manage_tmux_session
        ;;
    *)
        echo "Invalid usage. Options: '-check', '-ping', '-root', '-studio'."
        ;;
esac