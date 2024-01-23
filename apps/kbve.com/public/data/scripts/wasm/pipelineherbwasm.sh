#!/bin/bash

# Function to check for files in /apps/rust_wasm_embed/dist/
check_files() {
    if [ "$(ls -A /apps/rust_wasm_embed/dist/)" ]; then
        return 0 # Files are present
    else
        return 1 # Directory is empty
    fi
}

# Function to clean up /apps/herbmail.com/public/embed/rust except .gitkeep
cleanup_directory() {
    echo "Cleaning up /apps/herbmail.com/public/embed/rust, keeping .gitkeep"
    find /apps/herbmail.com/public/embed/rust -type f ! -name '.gitkeep' -delete
}

# Main script
if check_files; then
    echo "Files found in /apps/rust_wasm_embed/dist/, proceeding with cleanup and move."

    # Cleanup /apps/herbmail.com/public/embed/rust except .gitkeep
    find /apps/herbmail.com/public/embed/rust -type f ! -name '.gitkeep' -delete

    # Move files from /apps/rust_wasm_embed/dist/ to /apps/herbmail.com/public/embed/rust
    mv /apps/rust_wasm_embed/dist/* /apps/herbmail.com/public/embed/rust/

    echo "Operation completed."
else
    echo "No files found in /apps/rust_wasm_embed/dist/, exiting script."
fi
