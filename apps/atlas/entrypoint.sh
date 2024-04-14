#!/bin/bash

# Ensure the X11 and VNC related files are cleaned up properly
rm -f /tmp/.X1-lock /tmp/.X11-unix/X1 $XAUTHORITY
touch $XAUTHORITY
xauth generate $DISPLAY . trusted 2>/dev/null

# Start Virtual Frame Buffer in the background
Xvfb $DISPLAY -screen 0 1280x800x16 -ac &

# Wait a bit to make sure Xvfb starts
sleep 5

# Set up a password for VNC connection
mkdir -p ~/.vnc
x11vnc -storepasswd 12345 ~/.vnc/passwd

# Start the VNC server
x11vnc -display $DISPLAY -auth $XAUTHORITY -forever -usepw -create &

# Start the noVNC server
websockify -D --web=/usr/share/novnc/ 6080 localhost:5900 &

# Execute the command passed to the docker run
exec "$@"
