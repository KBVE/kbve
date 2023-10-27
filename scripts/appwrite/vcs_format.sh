#!/bin/bash

if [ -z "$1" ]; then
    echo "Usage: $0 <path to private key file>"
    exit 1
fi

awk '{printf "%s\\n", $0} END {print "\n"}' $1 | head -n 1 | sed 's/^/_APP_VCS_GITHUB_PRIVATE_KEY="/g' | sed 's/$/"/g'