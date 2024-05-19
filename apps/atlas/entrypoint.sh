#!/bin/bash

# Make sure DISPLAY is set
export DISPLAY=:1

rm -f /tmp/.X1-lock /tmp/.X11-unix/X1 $XAUTHORITY

touch $XAUTHORITY
xauth generate $DISPLAY . trusted 2>/dev/null

# Disable Wayland
# sed -i 's/^#WaylandEnable=false/WaylandEnable=false/' /etc/gdm3/custom.conf

# Set XDG_SESSION_TYPE to x11
export XDG_SESSION_TYPE=x11


# Start Virtual Frame Buffer in the background
# Added `-ac` to disable access control, i.e., allow connections from any host
# You might need to be careful with security implications of -ac in a production environment
# Xvfb $DISPLAY -screen 0 1280x800x24 -ac &

# Wait a bit to make sure Xvfb starts
sleep 5

# Turning off the poetry , to gather more information within the xterm.
# poetry run uvicorn main:app --host 0.0.0.0 --port 8086 --ws-ping-interval 25 --ws-ping-timeout 5 &

# Verify the DISPLAY setting before running the Python script
echo "Running on DISPLAY: $DISPLAY"

# exec 