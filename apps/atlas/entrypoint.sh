#!/bin/bash

# Ensure the X11 lock files and MIT-MAGIC-COOKIE file are not present
rm /tmp/.X1-lock /tmp/.X11-unix/X1 $XAUTHORITY || true
touch $XAUTHORITY
xauth generate $DISPLAY . trusted

# Start Virtual Frame Buffer
Xvfb $DISPLAY -screen 0 1280x800x16 -ac &

# Wait for Xvfb to start
sleep 5

# Start the VNC server with password
x11vnc -display $DISPLAY -auth $XAUTHORITY -forever -usepw -create &

# Start the noVNC server
websockify -D --web=/usr/share/novnc/ 6080 localhost:5900 &

# Start the application
exec "$@"