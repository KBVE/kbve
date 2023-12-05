#!/bin/bash
PORTAINER_URL=$PORTAINER_URL
PORTAINER_API_KEY=$PORTAINER_API_KEY


# Check if the Portainer URL is set
if [ -z "$PORTAINER_URL" ]; then
    echo "Portainer URL is not set. Please set the PORTAINER_URL environment variable."
    exit 1
fi


# Check if the API key is available
if [ -z "$PORTAINER_API_KEY" ]; then
    echo "Portainer API key is not set. Please set the PORTAINER_API_KEY environment variable."
    exit 1
fi

# Function to list stacks
list_stacks() {
    curl -s -X GET "$PORTAINER_URL/api/stacks" \
    -H "X-API-Key: $PORTAINER_API_KEY"
}

# Function to list endpoints

list_endpoints() {
    curl -s -X GET "$PORTAINER_URL/api/endpoints" \
    -H "X-API-Key: $PORTAINER_API_KEY"
}

# Argument parsing
case $1 in
    -list)
        list_stacks
        list_endpoints
        ;;
    *)
        echo "Usage: $0 -list"
        exit 1
        ;;
esac
