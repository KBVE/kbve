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

# Function for atomic patching. 
atomic_function() {
    set -e

    git switch dev

    git pull

    GIT_DATE=$(date +'%m-%d-%Y-%s')

    if [ "$#" -eq "0" ]; then
        PATCH_NAME="patch-atomic-${GIT_DATE}"
    else
        UNFORMAT_PATCH=$(echo "$@" | tr ' ' '-')
        NEW_PATCH="${UNFORMAT_PATCH//[^[:alnum:]-]/-}"
        NEW_PATCH=$(echo "$NEW_PATCH" | tr '[:upper:]' '[:lower:]')
        PATCH_NAME="patch-atomic-${NEW_PATCH}-${GIT_DATE}"
    fi

    git switch -c "${PATCH_NAME}"
}

# Function for the zeta script
zeta_function() {
    set -e

    GIT_DATE=$(date +'%m-%d-%Y-%s')

    if [ "$#" -eq "0" ]; then
        PATCH_NAME="patch-zeta-${GIT_DATE}"
    else
        UNFORMAT_PATCH=$(echo "$@" | tr ' ' '-')
        NEW_PATCH="${UNFORMAT_PATCH//[^[:alnum:]-]/-}"
        NEW_PATCH=$(echo "$NEW_PATCH" | tr '[:upper:]' '[:lower:]')  # lowercase conversion
        PATCH_NAME="patch-zeta-${NEW_PATCH}-${GIT_DATE}"
    fi

    git switch -c "${PATCH_NAME}"
}


# Function to manage a tmux session
manage_tmux_session() {
    # Assign the first argument to session_name
    local session_name="$1"
    # Ass the 2nd argue.
    local command="$2"

    if ! tmux has-session -t "$session_name" 2>/dev/null; then
        echo "Creating a new tmux session named '$session_name'."
        tmux new-session -s "$session_name" -d
        tmux send-keys -t "$session_name" "$command" C-m
    else
        echo "Tmux session '$session_name' already exists."
    fi

    tmux attach-session -t "$session_name"
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
        manage_tmux_session "studio" "pnpm nx run api:studio"
        ;;
    -report)
        manage_tmux_session "report" "pnpm nx report"
        ;;
    -reset)
        manage_tmux_session "reset" "pnpm install --no-frozen-lockfile && pnpm nx reset"
        ;;
    -atomic)
        shift  # Remove the first argument '-atomic'
        atomic_args="$@"
        # Use the script itself with a special flag to invoke the atomic function
        manage_tmux_session "git" "$0 -exec_atomic $atomic_args"
        ;;
    -exec_atomic)
        shift  # Remove the '-exec_atomic'
        atomic_function "$@"
        ;;
    -zeta)
        shift  # Remove the first argument '-zeta'
        zeta_args="$@"
        # Call manage_tmux_session with a session and zeta_function
        manage_tmux_session "zeta_session" "$0 -exec_zeta $zeta_args"
        ;;
    -exec_zeta)
        shift  # Remove the '-exec_zeta'
        zeta_function "$@"
        ;;
    -db)
        if is_installed "diesel_ext"; then
           # Save the current directory
            original_dir=$(pwd)

            # Change to the target directory
            cd packages/kbve/ || { echo "Directory packages/kbve/ not found."; exit 1; }

            # Execute diesel schema
            diesel print-schema > src/schema.rs

            # Execute diesel_ext and redirect output
            diesel_ext --model -t > src/models.rs
            #diesel_ext > src/models.rs
            echo "diesel_ext executed and output redirected to src/models.rs"

            # Patching the models.rs inside of src.
            { head -n 4 src/models.rs; echo 'use diesel::prelude::*;'; echo 'use serde::{ Serialize, Deserialize};'; tail -n +5 src/models.rs; } > src/temp_models.rs && mv src/temp_models.rs src/models.rs
            sed -i 's/#\[derive(Queryable,/#\[derive(Queryable, Serialize, Deserialize,/' src/models.rs
            echo "Patching models.rs"

            # Patching the Identifiable
            sed -i -e 's/, Identifiable//' src/models.rs
            echo "Patched Identifiable from models.rs"
            
            # Protobuf
            diesel_ext --proto > src/kbveproto.proto
            echo "Created Protos"



            # Return to the original directory
            cd "$original_dir"
        else
            echo "diesel_ext is not installed."
        fi
        ;;
    *)
        echo "Invalid usage. Options: '-check', '-ping', '-root', '-reset', '-studio'."
        ;;
esac