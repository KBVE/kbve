# Use Ubuntu 22.04 LTS as the base image
FROM ubuntu:22.04

# Set non-interactive shell to avoid stuck builds on dialogs
ENV DEBIAN_FRONTEND=noninteractive

# Install necessary packages for the environment
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    software-properties-common \
    gnupg2 \
    x11vnc \
    xvfb \
    xauth \
    gnome-session \
    gnome-terminal \
    tightvncserver

# Add the deadsnakes PPA for newer Python versions
RUN add-apt-repository ppa:deadsnakes/ppa && \
    apt-get update && \
    apt-get install -y python3.12 python3.12-venv python3.12-distutils python3-pip

# Install noVNC
RUN apt-get install -y novnc websockify

# Start Xvfb, wait a bit and then run xauth to add permissions
RUN Xvfb :1 -screen 0 1280x800x16 & \
    sleep 5 && \
    xauth add :1 . $(mcookie)

# Set up the VNC server password
RUN mkdir /root/.vnc && \
    echo "your_vnc_password_here" | vncpasswd -f > /root/.vnc/passwd && \
    chmod 600 /root/.vnc/passwd

# Install Poetry
RUN curl -sSL https://install.python-poetry.org | python3.12 -

# Ensure the Poetry bin directory is in the PATH
ENV PATH="/root/.local/bin:${PATH}"

# Set the working directory to /app
WORKDIR /app

# Copy the application source code to the container
COPY . /app

# Install Python dependencies using Poetry
RUN poetry install

# Expose the ports for VNC and noVNC
EXPOSE 5900 6080

# Expose the application port
EXPOSE 8000

# Environment variable for the display
ENV DISPLAY=:1

# Reset the non-interactive frontend
ENV DEBIAN_FRONTEND=

# Command to run the VNC server, noVNC, and start the application
CMD ["sh", "-c", "\
    Xvfb :1 -screen 0 1280x800x16 & \
    sleep 5 && \
    xauth add :1 . $(mcookie) && \
    sleep 5 && \
    x11vnc -display :1 -auth /root/.Xauthority -forever -rfbport 5900 -rfbauth /root/.vnc/passwd & \
    websockify -D --web=/usr/share/novnc/ 6080 localhost:5900 & \
    sleep 5 && \
    poetry run uvicorn main:app --host 0.0.0.0 --port 8000"]
