#!/bin/bash

# Custom error codes
ERR_NO_FILES=2
ERR_CLEANUP_FAIL=39
ERR_MOVE_FAIL=30


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

echo "Operation completed successfully."
exit 0
