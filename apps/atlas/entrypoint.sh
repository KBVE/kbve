#!/bin/bash

# Make sure DISPLAY is set
# export DISPLAY=:1


# Ensure the X11 and VNC related files are cleaned up properly
#rm -f /tmp/.X1-lock /tmp/.X11-unix/X1 $XAUTHORITY
rm -f /tmp/.X20-lock /tmp/.X11-unix/X20 $XAUTHORITY
touch $XAUTHORITY
xauth generate $DISPLAY . trusted 2>/dev/null

# Enable Wayland
sed -i 's/^#WaylandEnable=false/WaylandEnable=false/' /etc/gdm3/custom.conf

# Set XDG_SESSION_TYPE to x11
# export XDG_SESSION_TYPE=x11

# Start Virtual Frame Buffer in the background
# Added `-ac` to disable access control, i.e., allow connections from any host
# You might need to be careful with security implications of -ac in a production environment
Xvfb $DISPLAY -screen 0 1280x800x24 -ac &

# Wait a bit to make sure Xvfb starts
sleep 5

# Set up a password for VNC connection
mkdir -p ~/.vnc
x11vnc -storepasswd 12345 ~/.vnc/passwd

# Update the xstartup script to run RuneLite
cat <<EOF > ~/.vnc/xstartup
#!/bin/sh
# Start GNOME session
gnome-session &
EOF


# Ensure the xstartup script has executable permissions
chmod +x ~/.vnc/xstartup

# Start the VNC server
# Added `-noxdamage` to avoid issues with compositing window managers that might cause the black screen
# Added `-verbose` for more detailed logs which might help in diagnosing issues
x11vnc -display $DISPLAY -auth $XAUTHORITY -forever -usepw -create -noxdamage -nocursorshape -verbose &

# Start the noVNC server
websockify -D --web=/usr/share/novnc/ 0.0.0.0:6080 localhost:5900 &

# Create the target directory if it doesn't already exist
mkdir -p /app/templates/novnc

# Copy all files from /usr/share/novnc to /app/templates/novnc
cp -r /usr/share/novnc/* /app/templates/novnc/

# Copy vnc.html to index.html
cp /app/templates/novnc/vnc.html /app/templates/novnc/index.html

# Verify the DISPLAY setting before running the Python script
echo "Running on DISPLAY: $DISPLAY"

# Execute the command passed to the docker run
# exec "$@"
#ENV DISPLAY=:20
#exec /bin/bash & export DISPLAY=:20 && poetry run uvicorn main:app --host 0.0.0.0 --port 8086 --ws-ping-interval 25 --ws-ping-timeout 5
