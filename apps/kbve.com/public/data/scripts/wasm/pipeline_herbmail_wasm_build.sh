#!/bin/bash

# Custom error codes
ERR_NO_FILES=2
ERR_CLEANUP_FAIL=39
ERR_MOVE_FAIL=30
ERR_SRI_EXTRACTION_FAIL=60
ERR_SED_NOT_FOUND=70



# Function to check for files in /apps/rust_wasm_embed/dist/
check_files() {
    if [ "$(ls -A ./apps/rust_wasm_embed/dist/)" ]; then
        return 0 # Files are present
    else
        echo "Error: No files found in ./apps/rust_wasm_embed/dist/"
        return $ERR_NO_FILES # Directory is empty
    fi
}


# Function to check if sed is installed
check_sed_installed() {
    if ! command -v sed &> /dev/null; then
        echo "Error: sed is not installed. Please install sed to run this script."
        return $ERR_SED_NOT_FOUND
    fi
}


# Function to clean up /apps/herbmail.com/public/embed/rust except .gitkeep
cleanup_directory() {
    echo "Cleaning up ./apps/herbmail.com/public/embed/rust, keeping .gitkeep"
    find ./apps/herbmail.com/public/embed/rust -type f ! -name '.gitkeep' -delete || return $ERR_CLEANUP_FAIL
}

# Function to move files from /apps/rust_wasm_embed/dist/ to /apps/herbmail.com/public/embed/rust
move_files() {
    echo "Moving files from ./apps/rust_wasm_embed/dist/ to ./apps/herbmail.com/public/embed/rust"
    mv ./apps/rust_wasm_embed/dist/* ./apps/herbmail.com/public/embed/rust/ || return $ERR_MOVE_FAIL
}

# Function to extract SRI hashes and WASM file names from index.html
extract_sri_and_wasm() {
    local index_file="./apps/herbmail.com/public/embed/rust/index.html"
    if [ ! -f "$index_file" ]; then
        echo "Error: index.html not found at $index_file"
        return $ERR_SRI_EXTRACTION_FAIL
    fi

    echo "Extracting SRI hashes and file names from $index_file"

    # Use sed to extract the integrity hash and file name for the JS and WASM files
    # Adjusted for scenarios without double quotes around href and integrity values
    js_integrity=$(sed -n '/\.js /{s/.*integrity=\([^ ]*\).*/\1/p; q;}' "$index_file")
    js_file=$(sed -n '/\.js /{s/.*href=\([^ ]*\).*/\1/p; q;}' "$index_file")
    
    #wasm_integrity=$(sed -n '/\.wasm /{s/.*integrity=\([^ ]*\).*/\1/p; q;}' "$index_file")
    #wasm_file=$(sed -n '/\.wasm /{s/.*href=\([^ ]*\).*/\1/p; q;}' "$index_file")
    #wasm_integrity=$(sed -n '/\.wasm/{s/.*integrity=\([^ ]*\).*/\1/p; q;}' "$index_file")
    #wasm_file=$(sed -n '/\.wasm/{s/.*href=\([^ ]*\).*/\1/p; q;}' "$index_file")

    # Adjusted sed commands in the extract_sri_and_wasm function

    #wasm_integrity=$(sed -n '/type=application\/wasm/{s/.*integrity=\([^ ]*\).*/\1/p; q;}' "$index_file")
    #wasm_file=$(sed -n '/type=application\/wasm/{s/.*href=\([^ ]*\).*/\1/p; q;}' "$index_file")

    # Extract WASM integrity and file name
    wasm_info=$(sed -n 's/.*<link as=fetch crossorigin href=\([^ ]*\) integrity=\([^ ]*\) rel=preload type=application\/wasm>.*/\1 \2/p' "$index_file")
    wasm_file=$(echo "$wasm_info" | cut -d ' ' -f1)
    wasm_integrity=$(echo "$wasm_info" | cut -d ' ' -f2)


    if [ -z "$js_integrity" ] || [ -z "$wasm_integrity" ]; then
        echo "Error: Unable to extract SRI hashes"
        return $ERR_SRI_EXTRACTION_FAIL
    fi

    echo "JS Integrity: $js_integrity"
    echo "JS File: $js_file"
    echo "WASM Integrity: $wasm_integrity"
    echo "WASM File: $wasm_file"
}


# Function to save the extracted SRI hashes and file names
save_sri_details() {
    local output_file="./apps/herbmail.com/public/embed/rust/herbwasm_sri_hashes.txt"
    echo "Saving SRI hashes and file names to $output_file"

    echo "JS File: $js_file, JS Integrity: $js_integrity" > "$output_file"
    echo "WASM File: $wasm_file, WASM Integrity: $wasm_integrity" >> "$output_file"
}

# Function to save the extracted SRI hashes and file names in a Markdown format
save_sri_details_markdown() {
    local output_file="./apps/herbmail.com/public/embed/rust/herbwasm_sri_details.md"
    echo "Saving SRI hashes and file names to $output_file in Markdown format"

    {
        echo "---"
        echo "js_integrity: $js_integrity"
        echo "js_file: $js_file"
        echo "wasm_integrity: $wasm_integrity"
        echo "wasm_file: $wasm_file"
        echo "---"
    } > "$output_file"
}


# Function to create an MDX file from the generated Markdown file
create_mdx_from_md() {
    local md_file="./apps/herbmail.com/public/embed/rust/herbwasm_sri_details.md"
    local mdx_file="./apps/herbmail.com/src/content/tools/wasm.mdx"

    if [ ! -f "$md_file" ]; then
        echo "Error: Markdown file $md_file not found"
        return 1
    fi

    echo "Creating MDX file from $md_file"

    # Simple transformation: Copying the content to a new MDX file
    # cp -f "$md_file" "$mdx_file"

    # Create or overwrite the MDX file with the contents of the Markdown file
    cat "$md_file" > "$mdx_file"


    # If you need to add additional MDX specific content, you can do it here
    # For example, adding JSX tags or importing components
    # echo 'import MyComponent from "./MyComponent"' >> "$mdx_file"
    # echo "<MyComponent>" >> "$mdx_file"
    # cat "$md_file" >> "$mdx_file"
    # echo "</MyComponent>" >> "$mdx_file"
}

# Function to add MDX fields
add_mdx_fields() {
    local field=$1
    local data=$2
    local mdx_file="./apps/herbmail.com/src/content/tools/wasm.mdx"

    if [ ! -f "$mdx_file" ]; then
        echo "Error: MDX file $mdx_file not found"
        return 1
    fi

    # Temporary file
    local temp_file=$(mktemp)

    # Initialize a flag to track if we are within the --- delimited section
    local in_section=0

    # Process the file
    while IFS= read -r line; do
        if [[ $line == "---" ]]; then
            if (( in_section == 0 )); then
                in_section=1
                echo "$line" >> "$temp_file"
                continue
            else
                # Exiting the section, add the field if it wasn't found
                if ! grep -q "^$field:" "$temp_file"; then
                    echo "$field: $data" >> "$temp_file"
                fi
                in_section=0
            fi
        fi
        if (( in_section == 1 )) && [[ $line == "$field:"* ]]; then
            # Field exists, update it
            echo "$field: $data" >> "$temp_file"
            continue
        fi
        # Copy other lines as-is
        echo "$line" >> "$temp_file"
    done < "$mdx_file"

    # Move the temporary file to the original file
    mv "$temp_file" "$mdx_file"
}



# Main script

check_sed_installed || exit $ERR_SED_NOT_FOUND

if ! check_files; then
    exit $ERR_NO_FILES
fi

if ! cleanup_directory; then
    echo "Error during cleanup of ./apps/herbmail.com/public/embed/rust"
    exit $ERR_CLEANUP_FAIL
fi

if ! move_files; then
    echo "Error moving files to ./apps/herbmail.com/public/embed/rust"
    exit $ERR_MOVE_FAIL
fi

if ! extract_sri_and_wasm; then
    echo "Error extracting SRI hashes and WASM file names"
    exit $ERR_SRI_EXTRACTION_FAIL
fi

# Function to save the details to a txt file [DEBUG]
save_sri_details

# Function to save the details in Markdown format
save_sri_details_markdown

# Function to create the markdown
create_mdx_from_md

# F -> Title Test Case
add_mdx_fields "title" "The WASM Embed"

# F -> Description Test Case
add_mdx_fields "description" "The WASM Embed Test Case"

# F -> Slug Test Case
add_mdx_fields "slug" "wasm"


echo "Operation completed successfully."
exit 0
