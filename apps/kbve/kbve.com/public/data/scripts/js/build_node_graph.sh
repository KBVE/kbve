#!/bin/bash


# Define the source file path
SOURCE_FILE="apps/kbve.com/src/engine/nodegraph/Graph.jsx"

# Check if the source file exists
if [ -f "$SOURCE_FILE" ]; then
    # Run the esbuild command
    pnpm esbuild $SOURCE_FILE --bundle --minify --platform=browser \
        --outfile=apps/kbve.com/public/scripts/internal/nodegraph/graph.js \
        --jsx-factory=React.createElement --jsx-fragment=React.Fragment \
        --format=esm
else
    # Output an error message if the file does not exist
    echo "Error: Source file does not exist: $SOURCE_FILE"
    exit 1
fi