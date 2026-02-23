#!/bin/bash

#==============================================================================
# KBVE Development Environment Management Script
#==============================================================================
# Description: Comprehensive toolchain manager for KBVE monorepo development
# Version: 2.0.0
# Author: KBVE Team
# Repository: https://github.com/KBVE/kbve
# Last Updated: 2025-09-05
# Docs: https://kbve.com/docs/
#
# This script provides automated installation, configuration, and management
# utilities for the KBVE development environment including:
# - Language runtimes (Rust, Node.js, Python, .NET)
# - Package managers (pnpm, Poetry, Cargo)
# - Development tools (tmux session management, git workflows)
# - Build systems (Nx monorepo tooling)
# - Container preparation and deployment utilities
#
# Usage Examples:
#   ./kbve.sh -install          # Install monorepo dependencies
#   ./kbve.sh -atomic "feature" # Create atomic worktree from dev
#   ./kbve.sh -nx build app     # Run Nx build command
#   ./kbve.sh -studio           # Launch development studio
#
# For full command reference, see the case statement at the bottom of this file
#==============================================================================

# Script Configuration


# Install a brew package if the command is not already available
brew_install() {
    local cmd="$1"
    local pkg="${2:-$1}"  # package name defaults to command name
    if command -v "$cmd" >/dev/null 2>&1; then
        echo "$cmd is already installed. ($(command -v "$cmd"))"
    else
        echo "Installing $pkg via Homebrew..."
        brew install "$pkg"
    fi
}

# Full toolchain install via Homebrew
install_brew_toolchain() {
    brew_check

    echo "=== Installing KBVE development toolchain ==="

    brew_install rustc rust
    brew_install node node
    brew_install pnpm pnpm
    brew_install python3 python@3.12
    brew_install poetry poetry
    brew_install dotnet dotnet
    brew_install protoc protobuf
    brew_install tmux tmux

    echo ""
    echo "=== Toolchain install complete ==="
    echo "Rust:     $(rustc --version 2>/dev/null || echo 'not found')"
    echo "Node:     $(node --version 2>/dev/null || echo 'not found')"
    echo "pnpm:     $(pnpm --version 2>/dev/null || echo 'not found')"
    echo "Python:   $(python3 --version 2>/dev/null || echo 'not found')"
    echo "Poetry:   $(poetry --version 2>/dev/null || echo 'not found')"
    echo ".NET:     $(dotnet --version 2>/dev/null || echo 'not found')"
    echo "Protobuf: $(protoc --version 2>/dev/null || echo 'not found')"
}

# Function to install and prepare Rust
install_rust() {
    brew_check
    brew_install rustc rust
}

# Function to install and prepare NodeJS + pnpm
install_node_pnpm() {
    brew_check
    brew_install node node
    brew_install pnpm pnpm
}

# Function to install and prepare DotNet
install_dotnet() {
    brew_check
    brew_install dotnet dotnet
}

# Function to install and prepare Python + Poetry
install_python_and_poetry() {
    brew_check
    brew_install python3 python@3.12
    brew_install poetry poetry
}

# Function to run 'pnpm install' for the monorepo
install_monorepo() {
    echo "Running pnpm install..."
    pnpm install
}

# Function to add optional submodule
addOptionalSubmodule() {
    local SUBMODULE_PATH=$1
    local SUBMODULE_URL=$2

    # Check if the necessary arguments are provided
    if [ -z "$SUBMODULE_PATH" ] || [ -z "$SUBMODULE_URL" ]; then
        echo "Error: Missing required arguments. You must provide both a submodule path and a submodule URL."
        exit 1
    fi

    # Check if the submodule directory already exists
    if [ ! -d "$SUBMODULE_PATH" ]; then
        echo "Adding optional submodule..."
        git submodule add $SUBMODULE_URL $SUBMODULE_PATH
        echo "$SUBMODULE_PATH" >> .gitignore
    else
        echo "Submodule already exists."
    fi

    # Deduplicate .gitignore entries
    awk '!seen[$0]++' .gitignore > temp && mv temp .gitignore
}


# Portable sed -i (macOS requires '' argument, Linux does not)
sed_i() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "$@"
    else
        sed -i "$@"
    fi
}

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

# Function to check if Homebrew is installed
brew_check() {
    if ! command -v brew >/dev/null 2>&1; then
        echo "Error: Homebrew is not installed. Please install Homebrew first:"
        echo "Visit: https://brew.sh/"
        echo "Or run: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        exit 1
    fi
    echo "Homebrew is installed."
}

# Create an atomic worktree for small, self-contained changes.
atomic_function() {
    set -e

    local description="$1"

    # Determine the main repo root
    local main_repo
    main_repo=$(git rev-parse --show-toplevel)

    # Fetch latest
    echo "Fetching latest from origin..."
    git fetch origin dev

    # Generate timestamp
    local git_date
    git_date=$(date +'%m%d%H%M')  # Format: MMDDHHMM (e.g., 12151430)

    # Build branch name with description
    local branch_name
    local clean_name
    if [ -z "$description" ]; then
        branch_name="atom-${git_date}"
        clean_name="atom-${git_date}"
    else
        # Clean the description: lowercase, spaces to hyphens, remove special chars
        clean_name=$(echo "$description" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | sed 's/[^a-z0-9-]//g' | sed 's/-\+/-/g' | sed 's/^-\|-$//g')
        branch_name="atom-${git_date}-${clean_name}"
        clean_name="atom-${clean_name}"
    fi

    # Validate branch name matches CI workflow requirements
    if [[ ! "$branch_name" =~ ^atom-[a-zA-Z0-9-]+$ ]]; then
        echo "Generated branch name '$branch_name' is invalid!"
        return 1
    fi

    # Length check (same as CI workflow)
    if [[ ${#branch_name} -gt 50 ]]; then
        echo "Branch name too long: ${#branch_name} characters (max 50)"
        echo "Try a shorter description"
        return 1
    fi

    # Check if branch already exists remotely
    if git ls-remote --exit-code --heads origin "$branch_name" > /dev/null 2>&1; then
        echo "Branch '$branch_name' already exists remotely!"
        return 1
    fi

    local worktree_dir="${main_repo}-${clean_name}"

    # Check if worktree dir already exists
    if [ -d "$worktree_dir" ]; then
        echo "Worktree directory already exists: $worktree_dir"
        echo "Remove it first with: $0 -worktree-rm ${clean_name}"
        return 1
    fi

    # Create worktree
    echo "Creating atomic worktree at: $worktree_dir"
    echo "Branch: $branch_name (based on dev)"
    git worktree add "$worktree_dir" -b "$branch_name" "origin/dev"

    # Copy .env if it exists in the main repo
    if [ -f "$main_repo/.env" ]; then
        echo "Copying .env from main repo..."
        cp "$main_repo/.env" "$worktree_dir/.env"
    fi

    # Generate .env.local with Nx workspace isolation
    echo "Generating .env.local for Nx..."
    local worktree_basename
    worktree_basename=$(basename "$worktree_dir")
    cat > "$worktree_dir/.env.local" <<ENVEOF
NX_WORKSPACE_ROOT=$worktree_dir
NX_WORKSPACE_ROOT_PATH=$worktree_dir
NX_WORKSPACE_DATA_DIRECTORY=.nx/workspace-data-${worktree_basename}
NX_CACHE_DIRECTORY=.nx/cache
NX_DAEMON=false
ENVEOF

    # Install dependencies and reset Nx cache
    echo "Installing pnpm dependencies in worktree..."
    (cd "$worktree_dir" && pnpm install)
    echo "Resetting Nx cache in worktree..."
    (cd "$worktree_dir" && export NX_WORKSPACE_ROOT_PATH="$worktree_dir" && pnpm nx reset)

    echo ""
    echo "=== Atomic worktree ready ==="
    echo "  Path:   $worktree_dir"
    echo "  Branch: $branch_name"
    echo ""
    echo "Run the following to enter the worktree:"
    echo "  cd $worktree_dir && export NX_WORKSPACE_ROOT_PATH=\$PWD"
    echo ""
    echo "Or use ./kbve.sh -nx from within the worktree (auto-sources .env.local)."
    echo ""
    echo "When done, push and ci-atom.yml will auto-create a PR to dev:"
    echo "  git push -u origin $branch_name"
    echo ""
    echo "Cleanup: $0 -worktree-rm ${clean_name}"
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

# Create a git worktree with proper env setup for Nx
create_worktree() {
    local description="$1"
    local base_branch="${2:-dev}"

    if [ -z "$description" ]; then
        echo "Usage: $0 -worktree <description> [base_branch]"
        echo "  description: short name for the worktree (e.g., 'fix-auth')"
        echo "  base_branch: branch to base off of (default: dev)"
        return 1
    fi

    # Determine the main repo root (where .git dir lives)
    local main_repo
    main_repo=$(git rev-parse --show-toplevel)

    # Clean description for branch/dir name
    local clean_name
    clean_name=$(echo "$description" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | sed 's/[^a-z0-9-]//g')
    local date_suffix
    date_suffix=$(date +'%m-%d-%Y')
    local branch_name="trunk/${clean_name}-${date_suffix}"
    local worktree_dir="${main_repo}-${clean_name}"

    # Check if worktree dir already exists
    if [ -d "$worktree_dir" ]; then
        echo "Worktree directory already exists: $worktree_dir"
        echo "Remove it first with: git worktree remove $worktree_dir"
        return 1
    fi

    # Fetch latest
    echo "Fetching latest from origin..."
    git fetch origin "$base_branch"

    # Create worktree
    echo "Creating worktree at: $worktree_dir"
    echo "Branch: $branch_name (based on $base_branch)"
    git worktree add "$worktree_dir" -b "$branch_name" "origin/$base_branch"

    # Copy .env if it exists in the main repo (gitignored, won't be in worktree)
    if [ -f "$main_repo/.env" ]; then
        echo "Copying .env from main repo..."
        cp "$main_repo/.env" "$worktree_dir/.env"
    fi

    # Generate .env.local with Nx workspace root pointing to the worktree
    # NX_WORKSPACE_DATA_DIRECTORY prevents cross-worktree daemon/cache crosstalk
    echo "Generating .env.local for Nx..."
    local worktree_basename
    worktree_basename=$(basename "$worktree_dir")
    cat > "$worktree_dir/.env.local" <<ENVEOF
NX_WORKSPACE_ROOT=$worktree_dir
NX_WORKSPACE_ROOT_PATH=$worktree_dir
NX_WORKSPACE_DATA_DIRECTORY=.nx/workspace-data-${worktree_basename}
NX_CACHE_DIRECTORY=.nx/cache
NX_DAEMON=false
ENVEOF

    # Install dependencies and reset Nx cache
    echo "Installing pnpm dependencies in worktree..."
    (cd "$worktree_dir" && pnpm install)
    echo "Resetting Nx cache in worktree..."
    (cd "$worktree_dir" && export NX_WORKSPACE_ROOT_PATH="$worktree_dir" && pnpm nx reset)

    echo ""
    echo "=== Worktree ready ==="
    echo "  Path:   $worktree_dir"
    echo "  Branch: $branch_name"
    echo ""
    echo "Run the following to enter the worktree:"
    echo "  cd $worktree_dir && export NX_WORKSPACE_ROOT_PATH=\$PWD"
    echo ""
    echo "Or use ./kbve.sh -nx from within the worktree (auto-sources .env.local)."
}

# Remove a git worktree by name
remove_worktree() {
    local description="$1"

    if [ -z "$description" ]; then
        echo "Usage: $0 -worktree-rm <description>"
        echo ""
        echo "Active worktrees:"
        git worktree list
        return 1
    fi

    local main_repo
    main_repo=$(git rev-parse --show-toplevel)

    # Guard: abort if we cannot resolve the repo root.
    if [ -z "$main_repo" ] || [ ! -d "$main_repo/.git" ]; then
        echo "ERROR: Could not resolve git repository root."
        return 1
    fi

    local clean_name
    clean_name=$(echo "$description" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | sed 's/[^a-z0-9-]//g')

    # Guard: abort if the sanitized name is empty.
    if [ -z "$clean_name" ]; then
        echo "ERROR: Description sanitized to empty string."
        return 1
    fi

    local worktree_dir="${main_repo}-${clean_name}"

    # If the directory is already gone, prune stale git metadata and clean
    # any orphaned submodule worktree back-references, then exit.
    if [ ! -d "$worktree_dir" ]; then
        echo "Worktree directory not found: $worktree_dir"
        echo "Pruning any stale metadata..."
        git worktree prune
        _cleanup_submodule_worktree_refs "$main_repo" "$worktree_dir"
        echo ""
        echo "Active worktrees:"
        git worktree list
        return 1
    fi

    # Guard: verify this is actually a git worktree (contains a .git file
    # that points back to the main repo) and not an unrelated directory.
    if [ ! -f "$worktree_dir/.git" ]; then
        echo "ERROR: $worktree_dir does not appear to be a git worktree."
        echo "  Missing .git file. Refusing to remove."
        return 1
    fi

    # Guard: prevent removing the worktree you are currently inside of.
    local current_dir
    current_dir=$(pwd -P)
    local resolved_wt
    resolved_wt=$(cd "$worktree_dir" && pwd -P)
    if [ "${current_dir##"$resolved_wt"}" != "$current_dir" ]; then
        echo "ERROR: Your current directory is inside this worktree."
        echo "  cd out of $worktree_dir first, then retry."
        return 1
    fi

    # Warn about uncommitted changes so the user doesn't lose work.
    if [ -n "$(git -C "$worktree_dir" status --porcelain 2>/dev/null)" ]; then
        echo "WARNING: Worktree has uncommitted changes:"
        git -C "$worktree_dir" status --short
        echo ""
        echo "Proceeding with removal in 3 seconds... (Ctrl+C to abort)"
        sleep 3
    fi

    # Detect the branch checked out in this worktree for the cleanup hint.
    local wt_branch
    wt_branch=$(git -C "$worktree_dir" rev-parse --abbrev-ref HEAD 2>/dev/null)

    echo "Removing worktree: $worktree_dir"

    # --- Step 1: Deinit submodules ---
    # Worktree submodules share the main repo's .git/modules/ directory.
    # Removing the worktree without deinit leaves stale gitdir references
    # inside .git/modules/<submodule>/worktrees/ which can crash editors
    # (e.g. VS Code) and break future worktree or submodule operations.
    if [ -f "$worktree_dir/.gitmodules" ]; then
        echo "Deinitializing submodules in worktree..."
        git -C "$worktree_dir" submodule deinit --all -f 2>/dev/null || true

        # If deinit failed to fully clean submodule dirs (e.g. corrupt .git
        # file refs), remove them manually so git worktree remove won't choke.
        local sm_path
        while IFS= read -r sm_path; do
            [ -z "$sm_path" ] && continue
            local sm_dir="$worktree_dir/$sm_path"
            if [ -d "$sm_dir" ] && [ -f "$sm_dir/.git" ]; then
                echo "  Cleaning leftover submodule dir: $sm_path"
                rm -rf "$sm_dir"
            fi
        done < <(git config -f "$worktree_dir/.gitmodules" \
            --get-regexp '^submodule\..*\.path$' 2>/dev/null | awk '{print $2}')
    fi

    # --- Step 2: Unlock if locked ---
    # A locked worktree cannot be removed; unlock it first.
    git worktree unlock "$worktree_dir" 2>/dev/null || true

    # --- Step 3: Remove the worktree ---
    # Try clean removal, then force, then manual fallback.
    if git worktree remove "$worktree_dir" 2>/dev/null; then
        echo "Worktree removed cleanly."
    elif git worktree remove --force "$worktree_dir" 2>/dev/null; then
        echo "Worktree force-removed."
    else
        echo "Git worktree remove failed, removing directory manually..."
        rm -rf "$worktree_dir"
    fi

    # --- Step 4: Prune stale worktree metadata from .git/worktrees ---
    git worktree prune

    # --- Step 5: Clean submodule worktree back-references ---
    # git worktree prune only cleans .git/worktrees/. Submodules maintain
    # their own worktree refs in .git/modules/<submodule>/worktrees/<id>/
    # which persist after removal and cause editors to crash on stale paths.
    _cleanup_submodule_worktree_refs "$main_repo" "$worktree_dir"

    # --- Step 6: Verify removal ---
    if [ -d "$worktree_dir" ]; then
        echo ""
        echo "WARNING: Directory still exists: $worktree_dir"
        echo "  It may be held open by another process (e.g. VS Code, IDE)."
        echo "  Close any editors using this path, then run:"
        echo "    rm -rf $worktree_dir && git worktree prune"
        return 1
    fi

    echo ""
    if [ -n "$wt_branch" ] && [ "$wt_branch" != "HEAD" ]; then
        echo "Worktree removed. If the branch is no longer needed, delete it with:"
        echo "  git branch -d $wt_branch"
    else
        echo "Worktree removed."
    fi
    echo ""
    echo "Done."
}

# Clean stale submodule worktree back-references from .git/modules/.
# Git does NOT clean these with 'git worktree prune'; they are the primary
# cause of editor crashes after worktree removal in repos with submodules.
_cleanup_submodule_worktree_refs() {
    local main_repo="$1"
    local worktree_dir="$2"
    local modules_dir="$main_repo/.git/modules"

    [ -d "$modules_dir" ] || return 0

    local gitdir_file
    while IFS= read -r gitdir_file; do
        # Each gitdir file contains the absolute path to a worktree's .git.
        # If it points into the removed worktree, its parent dir is stale.
        local target
        target=$(cat "$gitdir_file" 2>/dev/null)
        if [ -n "$target" ] && [[ "$target" == "$worktree_dir"* ]]; then
            local stale_dir
            stale_dir=$(dirname "$gitdir_file")
            echo "  Cleaning stale submodule ref: $stale_dir"
            rm -rf "$stale_dir"
        fi
    done < <(find "$modules_dir" -path "*/worktrees/*/gitdir" -type f 2>/dev/null)
}

# Function to manage a tmux session
manage_tmux_session() {
    # Assign the first argument to session_name
    local session_name="$1"
    # Assign the second argument to command
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
            sed_i "s/version = \"$current_version\"/version = \"$new_version\"/" Cargo.toml
            echo "Version bumped in $package_dir/Cargo.toml to $new_version"
        else
            echo "Cargo.toml not found in $package_dir"
        fi
    else
        echo "Package directory $package_dir does not exist"
    fi
}

# Function to bump the Python package version
bump_python_package_version() {
    local package_dir="$1"

    # Ensure the package directory is provided and exists
    if [ -z "$package_dir" ] || [ ! -d "$package_dir" ]; then
        echo "Error: Package directory is missing or does not exist."
        return 1
    fi

    local pyproject_file="$package_dir/pyproject.toml"

    # Ensure the pyproject.toml file exists
    if [ ! -f "$pyproject_file" ]; then
        echo "Error: pyproject.toml not found in $package_dir"
        return 1
    fi

    # Read the current version from the file
    local current_version_line=$(grep '^version = "[0-9]*\.[0-9]*\.[0-9]*"' "$pyproject_file")
    if [ -z "$current_version_line" ]; then
        echo "Error: Version line not found in pyproject.toml"
        return 1
    fi

    local current_version=$(echo "$current_version_line" | grep -oP 'version = "\K[0-9]+\.[0-9]+\.[0-9]+')

    # Increment the patch version number
    local base_version=${current_version%.*}
    local patch_version=${current_version##*.}
    local new_patch_version=$((patch_version + 1))
    local new_version="$base_version.$new_patch_version"

    # Replace the old version with the new version in pyproject.toml
    sed_i "s/version = \"$current_version\"/version = \"$new_version\"/" "$pyproject_file"
    echo "Version bumped in $pyproject_file to $new_version"
}

# Function to activate python environment.
python_venv_activate_and_run_vscode() {
    local directory_name="$1"
    local venv_path=""

    # Check the first potential path for the virtual environment
    if [ -f "packages/$directory_name/.venv/bin/activate" ]; then
        venv_path="packages/$directory_name/.venv/bin/activate"
    # Check the second potential path for the virtual environment
    elif [ -f "apps/$directory_name/.venv/bin/activate" ]; then
        venv_path="apps/$directory_name/.venv/bin/activate"
    else
        echo "Error: Virtual environment 'activate' script not found."
        return 1
    fi

    # Activate the virtual environment
    echo "Activating virtual environment from: $venv_path"
    # Use `source` to activate the virtual environment
    source "$venv_path"
    
    # Open Visual Studio Code in the current directory
    echo "Opening Visual Studio Code..."
    code .
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
    sed_i "s/\$kbve_date/$current_date/" "$markdown_filename"

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


# Source .env.local if present so NX_WORKSPACE_ROOT_PATH is set for worktrees.
# Nx resolves the workspace root at module-load time (before dotenv),
# so NX_WORKSPACE_ROOT_PATH must be a real shell env var.
_load_env_local() {
    if [ -f ".env.local" ]; then
        set -a
        . .env.local
        set +a
    fi
}

# Function to run pnpm nx with additional arguments under the cloud.
run_pnpm_nxc() {
    _load_env_local
    echo "Running pnpm nx with arguments: $@"
    pnpm nx run "$@"
}

# Function to run pnpm nx with additional arguments without the cloud.
run_pnpm_nx() {
    # Note: "$@" passes all arguments received by the function as-is
    _load_env_local
    echo "Running pnpm nx with arguments: $@"
    pnpm nx run "$@" --no-cloud
}

# Function to build pnpm nx with an argument
build_pnpm_nx() {
    _load_env_local
    local argument="$1"
    pnpm nx build "$argument"
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
    -brew)
        install_brew_toolchain
        ;;
    -installrust)
        install_rust
        ;;
    -installnode)
        install_node_pnpm
        ;;
    -installnet)
        install_dotnet
        ;;
    -installpy)
        install_python_and_poetry
        ;;
    -install)
        install_monorepo
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
        shift
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
    -pythonbump)
        [ -z "$2" ] && { echo "No package directory specified. Usage: $0 -pythonbump [package_directory]"; exit 1; }
        package_dir="$2"
        bump_python_package_version "$package_dir"
        ;;
    -py)
        [ -z "$2" ] && { echo "No project directory specified. Usage: $0 -py [project_directory]"; exit 1; }
        directory_name="$2"
        python_venv_activate_and_run_vscode "$directory_name"
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
        shift  # This discards "-nx", shifting all other arguments left.
        if [ $# -eq 0 ]; then  # Check if there are any arguments left.
            echo "No command specified. Usage: $0 -nx [command] [args...]"
            exit 1
        fi
        run_pnpm_nx "$@"  # Pass all remaining arguments to the function.
        ;;
    -nxc)
        shift  # This discards "-nxc", shifting all other arguments left.
        if [ $# -eq 0 ]; then  # Check if there are any arguments left.
            echo "No command specified. Usage: $0 -nx [command] [args...]"
            exit 1
        fi
        run_pnpm_nxc "$@"  # Pass all remaining arguments to the function.
        ;;    

    -build)
         [ -z "$2" ] && { echo "No argument specified. Usage: $0 -nx [argument]"; exit 1; }
        build_pnpm_nx "$2"
        ;;
    -worktree)
        shift
        create_worktree "$@"
        ;;
    -worktree-rm)
        shift
        remove_worktree "$@"
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
            sed_i '/diesel(/d' ../erust/src/state/dbmodels.rs
            echo "Clearing out Diesel from DBModels"

            # Patching includes
            sed_i 's/(Queryable, Debug)/(serde::Deserialize, serde::Serialize, Default, Debug, Clone, PartialEq)/g' ../erust/src/state/dbmodels.rs
            echo "Patching Part 1 of the DBModels"

            grep -q 'use serde_json::' "../erust/src/state/dbmodels.rs" || sed_i '5 a use serde_json::{Value as Json};' "../erust/src/state/dbmodels.rs"
            echo "Patching Part 2 of the DBModels"

            # Execute diesel_ext and redirect output
            diesel_ext --model -t > src/models.rs
            #diesel_ext > src/models.rs
            echo "diesel_ext executed and output redirected to src/models.rs"

            # Patching the models.rs inside of src.
            { head -n 4 src/models.rs; echo 'use diesel::prelude::*;'; echo 'use serde_json::{ Value as Json};'; echo 'use serde::{ Serialize, Deserialize};'; tail -n +5 src/models.rs; } > src/temp_models.rs && mv src/temp_models.rs src/models.rs
            sed_i 's/#\[derive(Queryable,/#\[derive(Queryable, Serialize, Deserialize,/' src/models.rs
            echo "Patching models.rs"

            # Patching the Identifiable
            sed_i 's/, Identifiable//' src/models.rs
            echo "Patched Identifiable from models.rs"
            
            # Protobuf — generate to centralized packages/data/proto/kbve/
            diesel_ext --proto > ../data/proto/kbve/kbveproto.proto
            echo "Created Protos"

            # Patching Binary Protobuf
            sed_i 's/\/\* TODO: unknown type Binary \*\//bytes/g' ../data/proto/kbve/kbveproto.proto
            echo "Patching Binary from Protos"

            # Patching Integer Protobuf
            sed_i 's/\/\* TODO: unknown type Integer \*\//int64/g' ../data/proto/kbve/kbveproto.proto
            echo "Patching Integer from Protos"

            # Patching Unsign Bigint Protobuf
            sed_i 's/\/\* TODO: unknown type Unsigned<Bigint> \*\//uint64/g' ../data/proto/kbve/kbveproto.proto
            echo "Patching Unsign BigInt from Protos"

            # Patching Decimal Protobuf
            sed_i 's/\/\* TODO: unknown type Decimal \*\//string/g' ../data/proto/kbve/kbveproto.proto
            echo "Patching Decimal as string for Protos"

            # Return to the original directory
            cd "$original_dir"

            # Running pnpm grpc_tools (source from packages/data/proto/kbve/)
            pnpm grpc_tools_node_protoc \
                --js_out=import_style=commonjs,binary:./packages/khashvault/src/lib \
                --grpc_out=./packages/khashvault/src/lib \
                --plugin=protoc-gen-grpc=./node_modules/.bin/grpc_tools_node_protoc_plugin \
                --proto_path=./packages/data/proto/kbve \
                --ts_out=./packages/khashvault/src/lib \
                ./packages/data/proto/kbve/kbveproto.proto

            
        else
            echo "diesel_ext is not installed."
        fi
        ;;
    *)
        echo "Usage: $0 [command]"
        echo ""
        echo "Setup:"
        echo "  -brew              Install full dev toolchain via Homebrew"
        echo "  -install           Run pnpm install for monorepo"
        echo "  -installrust       Install Rust via Homebrew"
        echo "  -installnode       Install Node.js + pnpm via Homebrew"
        echo "  -installnet        Install .NET via Homebrew"
        echo "  -installpy         Install Python + Poetry via Homebrew"
        echo ""
        echo "Development:"
        echo "  -nx [cmd]          Run pnpm nx (no cloud)"
        echo "  -nxc [cmd]         Run pnpm nx (with cloud)"
        echo "  -build [project]   Build with pnpm nx"
        echo "  -studio            Launch API studio (tmux)"
        echo "  -graph             Launch Nx graph (tmux)"
        echo "  -report            Run Nx report (tmux)"
        echo "  -reset             Reinstall deps + reset Nx cache"
        echo ""
        echo "Git:"
        echo "  -atomic [desc]     Create atomic worktree from dev"
        echo "  -zeta [desc]       Create zeta patch branch"
        echo "  -worktree <name> [base]  Create worktree with env + deps"
        echo "  -worktree-rm <name>      Remove a worktree"
        echo ""
        echo "Version:"
        echo "  -cargobump [pkg]   Bump Cargo.toml patch version"
        echo "  -pythonbump [dir]  Bump pyproject.toml patch version"
        echo ""
        echo "Utilities:"
        echo "  -check [cmds...]   Check if commands are installed"
        echo "  -ping [domain]     Check connectivity to domain"
        echo "  -root              Check if running as root"
        echo "  -db                Generate diesel schema + protobuf"
        ;;
esac