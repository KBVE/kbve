#!/bin/bash

# Get the directory of the currently running script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../" && pwd)"  # Root of the project

# Function to read the current version from Cargo.toml
read_current_version_from_cargo() {
    cargo_toml_path=$1
    current_version=$(grep -E '^version = "[0-9]+\.[0-9]+\.[0-9]+"' "$cargo_toml_path" | sed 's/version = "\(.*\)"/\1/')
    echo "$current_version"
}

# Function to increment the version (bump the patch number)
increment_version() {
    version=$1
    major=$(echo "$version" | cut -d '.' -f 1)
    minor=$(echo "$version" | cut -d '.' -f 2)
    patch=$(echo "$version" | cut -d '.' -f 3)

    # Increment patch number
    new_patch=$((patch + 1))

    # Return the new version
    echo "$major.$minor.$new_patch"
}

# Function to update the version in Cargo.toml
update_version_in_cargo_toml() {
    local new_version=$1
    local cargo_toml_path=$2

    sed -i.bak "s/^version = \".*\"/version = \"$new_version\"/" "$cargo_toml_path"

    if [ $? -eq 0 ]; then
        echo "Version updated to $new_version in $cargo_toml_path"
    else
        echo "Failed to update the version in Cargo.toml"
        exit 1
    fi
}

# Function to update the version in project.json
update_version_in_project_json() {
    local new_version=$1
    local project_json_path=$2

    # Use sed to replace the version tags, regardless of what the current version is
    sed -i.bak "s/\"tags\": \[\"[0-9.]*\", \"[0-9.]*\"\]/\"tags\": [\"$new_version\", \"15.1\"]/" "$project_json_path"

    if [ $? -eq 0 ]; then
        echo "Version updated to $new_version in $project_json_path"
    else
        echo "Failed to update the version in project.json"
        exit 1
    fi
}

# Function to update the version in values.yaml (only under db.image)
update_version_in_values_yaml() {
    local new_version=$1
    local values_yaml_path=$2

    # Use sed to replace the tag under the db.image section only
    sed -i.bak -e '/db:/,/tag:/s/tag: .*/tag: '"'$new_version'"'/' "$values_yaml_path"

    if [ $? -eq 0 ]; then
        echo "Version updated to $new_version in $values_yaml_path"
    else
        echo "Failed to update the version in values.yaml"
        exit 1
    fi
}


# Function to clean up backup files after successful version update
cleanup_backups() {
    local paths=("$@")

    for path in "${paths[@]}"; do
        if [ -f "${path}.bak" ]; then
            rm -f "${path}.bak"
            echo "Removed backup: ${path}.bak"
        fi
    done
}

# Main function to call other functions
update_versions() {
    local new_version=$1

    # Define the paths to the files you want to update
    local cargo_toml_path="$PROJECT_ROOT/apps/kilobase/Cargo.toml"
    local project_json_path="$PROJECT_ROOT/apps/kilobase/project.json"
    local values_yaml_path="$PROJECT_ROOT/migrations/kube/charts/kilobase/supabase/values.yaml"

    # Update version in Cargo.toml
    update_version_in_cargo_toml "$new_version" "$cargo_toml_path"

    # Update version in project.json
    update_version_in_project_json "$new_version" "$project_json_path"

    # Update version in values.yaml
    update_version_in_values_yaml "$new_version" "$values_yaml_path"

    # Clean up backup files
    cleanup_backups "$cargo_toml_path" "$project_json_path" "$values_yaml_path"
}

# Entry point of the script
if [ $# -eq 0 ]; then
    echo "No version argument provided. Reading current version from Cargo.toml."

    # Path to the Cargo.toml file
    cargo_toml_path="$PROJECT_ROOT/apps/kilobase/Cargo.toml"

    # Read current version and increment it
    current_version=$(read_current_version_from_cargo "$cargo_toml_path")
    new_version=$(increment_version "$current_version")

    echo "Current version: $current_version. Bumping to: $new_version."
else
    new_version=$1
    echo "Using provided version: $new_version."
fi

# Call the main function to update all versions
update_versions "$new_version"