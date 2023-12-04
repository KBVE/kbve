#!/bin/bash

PORTAINER_API_KEY=$PORTAINER_API_KEY
# Check if the API key is available
if [ -z "$PORTAINER_API_KEY" ]; then
    echo "Portainer API key is not set. Please set the PORTAINER_API_KEY environment variable."
    exit 1
fi

# Function to list stacks
list_stacks() {
    curl -s -X GET "$PORTAINER_URL/api/stacks" \
    -H "X-API-Key: $PORTAINER_API_KEY"
    # Add error handling and formatting if required
}

# Argument parsing
case $1 in
    -list)
        list_stacks
        ;;
    *)
        echo "Usage: $0 -list"
        exit 1
        ;;
esac
