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