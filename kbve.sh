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

# Function to bump the version number
bump_cargo_version() {
    local package_dir="$1"

    if [ -d "$package_dir" ]; then
        # Change to the package directory
        cd "$package_dir" || { echo "Unable to cd into $package_dir"; exit 1; }

        # Check if Cargo.toml exists
        if [ -f "Cargo.toml" ]; then
            # Extract the first occurrence of version number
            local current_version_line=$(grep -m 1 '^version = "[0-9]*\.[0-9]*\.[0-9]*"' Cargo.toml)
            local current_version=$(echo "$current_version_line" | grep -oP 'version = "\K[0-9]+\.[0-9]+\.[0-9]+')

            # Increment the last digit of the version number
            local last_digit=$(echo "$current_version" | grep -oP '\.[0-9]+$' | cut -d. -f2)
            local new_last_digit=$((last_digit + 1))
            local new_version=$(echo "$current_version" | sed "s/\.[0-9]\+$/.$new_last_digit/")

            # Replace the old version with the new version in Cargo.toml
            sed -i "s/version = \"$current_version\"/version = \"$new_version\"/" Cargo.toml
            echo "Version bumped in $package_dir/Cargo.toml to $new_version"
        else
            echo "Cargo.toml not found in $package_dir"
        fi
    else
        echo "Package directory $package_dir does not exist"
    fi
}

# Function Markdown -> From create_markdown.sh
create_markdown() {
    local template_name="$1"
    local markdown_filename="$2"
    local template_path="./apps/kbve.com/public/data/mdx/_${template_name}.mdx"  # Path to the template

    # Get the current date in the format YYYY-MM-DD
    local current_date=$(date +"%Y-%m-%d")

    # Check if the template file exists
    if [ ! -f "$template_path" ]; then
        echo "Error: Template file not found at $template_path"
        exit 1
    fi

    # Copy the template to the new markdown file
    cp "$template_path" "$markdown_filename"

    # Replace $kbve_date with the current date in the new markdown file
    sed -i "s/\$kbve_date/$current_date/" "$markdown_filename"

    echo "Markdown file created at $markdown_filename using template from $template_path with date replaced"
}

execmdx_function() {
    local mdx_file="$1"
    local command_to_run="$2"

    # Check if the MDX file exists
    if [ ! -f "$mdx_file" ]; then
        echo "Error: MDX file not found at $mdx_file"
        exit 1
    fi

    # Execute the command and process its output
    echo "Executing command: $command_to_run"
    local cmd_output
    cmd_output=$($command_to_run 2>&1) # Capture the command output

    # Basic parsing for table-like structure
    # This is a simplistic approach and may need adjustments based on actual output format
    local parsed_output
    parsed_output=$(echo "$cmd_output" | sed 's/  \+/\t/g' | column -t | sed 's/\t/ | /g')

    # Append a newline (Unix line break) to the MDX file before the output
    echo "" >> "$mdx_file"  # Unix line break

    # Append to the MDX file
    echo "\`\`\`" >> "$mdx_file"
    echo "$parsed_output" >> "$mdx_file"
    echo "\`\`\`" >> "$mdx_file"
    echo "Output of '$command_to_run' appended to $mdx_file"
}


# Function to run pnpm nx with an argument
run_pnpm_nx() {
    local argument="$1"
    pnpm nx run "$argument"
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
    -graph)
        manage_tmux_session "graph" "pnpm nx graph"
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
    -cargobump)
        [ -z "$2" ] && { echo "No package name specified. Usage: $0 -cargobump [package_name]"; exit 1; }
        package_name="$2"
        package_dir="packages/$package_name"
        bump_cargo_version "$package_dir"
        ;;
    -createmarkdown)
        [ -z "$2" ] || [ -z "$3" ] && { echo "Usage: $0 -createmarkdown [template_name] [output_file_path]"; exit 1; }
        create_markdown "$2" "$3"
        ;;
    -execmdx)
        [ -z "$2" ] || [ -z "$3" ] && { echo "Usage: $0 -execmdx [mdx_file_path] [command_to_run]"; exit 1; }
        execmdx_function "$2" "$3"
        ;;
    -outpostgraph)
        # Call create_markdown to create the report markdown file
        create_markdown "report" "./apps/kbve.com/public/data/outpost/nx/report.mdx"

        # Execute the command and append its output to the MDX file
        execmdx_function "./apps/kbve.com/public/data/outpost/nx/report.mdx" "pnpm nx report"

        # Add additional Timestamp in Unix
        timestamp=$(date +%s)
        execmdx_function "./apps/kbve.com/public/data/outpost/nx/report.mdx" "echo 'Report Timestamp: $timestamp'"

        ;;
    -nx)
        [ -z "$2" ] && { echo "No argument specified. Usage: $0 -nx [argument]"; exit 1; }
        run_pnpm_nx "$2"
        ;;
    -db)
        if is_installed "diesel_ext"; then
           # Save the current directory
            original_dir=$(pwd)

            # Change to the target directory
            cd packages/kbve/ || { echo "Directory packages/kbve/ not found."; exit 1; }

            # Execute diesel schema
            diesel print-schema > src/schema.rs

            # Execute diesel_ext models for eRust

            diesel_ext --model > ../erust/src/state/dbmodels.rs
            echo "diesel_ext executed and output redirect to erust db models"

            # Remove Diesel
            sed -i '/diesel(/d' ../erust/src/state/dbmodels.rs
            echo "Clearing out Diesel from DBModels"

            # Patching includes
            sed -i 's/(Queryable, Debug, Identifiable)/(serde::Deserialize, serde::Serialize, Default, Debug, Clone, PartialEq)/g' ../erust/src/state/dbmodels.rs
            echo "Patching the DBModels"

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

            # Patching Binary Protobuf
            sed -i 's/\/\* TODO: unknown type Binary \*\//bytes/g' src/kbveproto.proto
            echo "Patching Binary from Protos"

            # Patching Integer Protobuf
            sed -i 's/\/\* TODO: unknown type Integer \*\//int64/g' src/kbveproto.proto
            echo "Patching Integer from Protos"

            # Patching Unsign Bigint Protobuf
            sed -i 's/\/\* TODO: unknown type Unsigned<Bigint> \*\//uint64/g' src/kbveproto.proto
            echo "Patching Unsign BigInt from Protos"

            # Copy KBVEProto to JS Library
            cp -f src/kbveproto.proto ../khashvault/src/lib/kbveproto.proto
            
            # Generate the Protobuf for JS Library
            #protoc --proto_path=../khashvault/src/lib --js_out=import_style=commonjs,binary:../khashvault/src/lib ../khashvault/src/lib/kbveproto.proto

            # Return to the original directory
            cd "$original_dir"
            
            # Running pnpm grpc_tools 
            pnpm grpc_tools_node_protoc \
                --js_out=import_style=commonjs,binary:./packages/khashvault/src/lib \
                --grpc_out=./packages/khashvault/src/lib \
                --plugin=protoc-gen-grpc=./node_modules/.bin/grpc_tools_node_protoc_plugin \
                --proto_path=./packages/khashvault/src/lib \
                --ts_out=./packages/khashvault/src/lib \
                ./packages/khashvault/src/lib/kbveproto.proto

            
        else
            echo "diesel_ext is not installed."
        fi
        ;;
    *)
        echo "Invalid usage. Options: '-check', '-ping', '-root', '-reset', '-studio'."
        ;;
esac