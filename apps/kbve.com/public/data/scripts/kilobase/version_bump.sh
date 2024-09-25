#!/bin/bash

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

    # Use sed to replace the tags in the project.json
    sed -i.bak "s/\"tags\": \[\".*\", \"15.1\"\]/\"tags\": [\"$new_version\", \"15.1\"]/" "$project_json_path"

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
    sed -i.bak "/db:/,/image:/s/tag: '.*'/tag: '$new_version'/" "$values_yaml_path"

    if [ $? -eq 0 ]; then
        echo "Version updated to $new_version in $values_yaml_path"
    else
        echo "Failed to update the version in values.yaml"
        exit 1
    fi
}

# Main function to call other functions
update_versions() {
    local new_version=$1

    # Define the paths to the files you want to update
    local cargo_toml_path="/apps/kilobase/Cargo.toml"
    local project_json_path="/apps/kilobase/project.json"
    local values_yaml_path="/migrations/kube/charts/kilobase/supabase/values.yaml"

    # Update version in Cargo.toml
    update_version_in_cargo_toml "$new_version" "$cargo_toml_path"

    # Update version in project.json
    update_version_in_project_json "$new_version" "$project_json_path"

    # Update version in values.yaml
    update_version_in_values_yaml "$new_version" "$values_yaml_path"
}

# Entry point of the script
if [ $# -ne 1 ]; then
    echo "Usage: $0 <new_version>"
    exit 1
fi

new_version=$1

# Call the main function to update all versions
update_versions "$new_version"
