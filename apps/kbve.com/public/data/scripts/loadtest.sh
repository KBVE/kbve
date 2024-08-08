#!/bin/bash

# Function to check if cURL is installed
requires_curl() {
    if ! command -v curl &> /dev/null; then
        echo "Error: cURL is not installed. Please install cURL and try again! Help can be provided via https://kbve.com/application/git"
        exit 1
    fi
}

# Usage Function
usage() {
    echo "Usage: $0 -u <URL> -n <number_of_requests> [-d <delay_between_requests>]"
    echo "  -u  URL to be tested"
    echo "  -n  Number of requests to be sent"
    echo "  -d  Delay between requests in seconds (optional)"
    exit 1
}


# Initialization function
init() {
    requires_curl
}


# Function to parse command line arguments
parse_args() {
    while getopts "u:n:d:" opt; do
        case $opt in
            u) URL=$OPTARG ;;
            n) NUM_REQUESTS=$OPTARG ;;
            d) DELAY=$OPTARG ;;
            *) usage ;;
        esac
    done

    # Check if mandatory arguments are provided
    if [ -z "$URL" ] || [ -z "$NUM_REQUESTS" ]; then
        usage
    fi

    # Default delay to 0 if not specified
    if [ -z "$DELAY" ]; then
        DELAY=0
    fi
}

# Function to run the load test
run_load_test() {
    for ((i=1; i<=NUM_REQUESTS; i++))
    do
        echo "Sending request $i to $URL"
        (
            curl -s -o /dev/null -w "%{http_code}\n" "$URL"
            if [ "$DELAY" -gt 0 ]; then
                sleep $DELAY
            fi
        ) &
    done

    # Wait for all background jobs to complete
    wait

    echo "Load test completed. Sent $NUM_REQUESTS requests to $URL."
}

# [MAIN] # Script Execution.
init
parse_args "$@"
run_load_test