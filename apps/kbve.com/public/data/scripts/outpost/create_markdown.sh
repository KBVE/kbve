#!/bin/bash

# Function to create a markdown file
# create_markdown() {
#     local markdown_path="$1"

#     # Check if the directory exists, create it if it doesn't
#     local dir_path=$(dirname "$markdown_path")
#     [ ! -d "$dir_path" ] && mkdir -p "$dir_path"

#     # Create an empty markdown file
#     touch "$markdown_path"
#     echo "Markdown file created at $markdown_path"
# }


create_markdown() {
    local template_name="$1"
    local markdown_path="$2"
    local template_path="/apps/kbve.com/public/data/mdx/_${template_name}.mdx"  # Construct the path to the template

    # Check if the directory for the new markdown file exists, create it if it doesn't
    local dir_path=$(dirname "$markdown_path")
    [ ! -d "$dir_path" ] && mkdir -p "$dir_path"

    # Check if the template file exists
    if [ ! -f "$template_path" ]; then
        echo "Error: Template file not found at $template_path"
        exit 1
    fi

    # Copy the template to the new markdown file
    cp "$template_path" "$markdown_path"
    echo "Markdown file created at $markdown_path using template from $template_path"
}