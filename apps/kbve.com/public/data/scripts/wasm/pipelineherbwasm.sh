#!/bin/bash

# Custom error codes
ERR_NO_FILES=2
ERR_CLEANUP_FAIL=39
ERR_MOVE_FAIL=30
ERR_SRI_EXTRACTION_FAIL=60


# Function to check for files in /apps/rust_wasm_embed/dist/
check_files() {
    if [ "$(ls -A ./apps/rust_wasm_embed/dist/)" ]; then
        return 0 # Files are present
    else
        echo "Error: No files found in ./apps/rust_wasm_embed/dist/"
        return $ERR_NO_FILES # Directory is empty
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
    
    wasm_integrity=$(sed -n '/\.wasm /{s/.*integrity=\([^ ]*\).*/\1/p; q;}' "$index_file")
    wasm_file=$(sed -n '/\.wasm /{s/.*href=\([^ ]*\).*/\1/p; q;}' "$index_file")

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


# Main script
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

echo "Operation completed successfully."
exit 0
