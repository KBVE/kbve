#!/bin/bash

# Make sure DISPLAY is set
export DISPLAY=:1

xauth generate $DISPLAY . trusted 2>/dev/null

# Verify the DISPLAY setting before running the Python script
echo "Running on DISPLAY: $DISPLAY"

exec poetry run uvicorn main:app --host 0.0.0.0 --port 8086 --ws-ping-interval 25 --ws-ping-timeout 5
