### Use Ubuntu 22.04 LTS as the base image
FROM ubuntu:22.04
### Interactive Shell must be disabled.
ENV DEBIAN_FRONTEND=noninteractive
### Apt-Get Install
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    software-properties-common \
    x11vnc \
    dbus-x11 \
    xvfb \
    xauth \
    tightvncserver \
    novnc \
    net-tools \
    python3-tk \
    python3-dev \
    gnupg2 \
    gnome-terminal \
    gnome-session

# Install Python and Poetry using deadsnakes PPA
RUN add-apt-repository ppa:deadsnakes/ppa && \
    apt-get update && \
    apt-get install -y python3.12 python3.12-venv python3.12-distutils python3-pip && \
    curl -sSL https://install.python-poetry.org | python3.12 -

# Environment variables to configure
ENV HOME=/root \
    DISPLAY=:1 \
    XAUTHORITY=$HOME/.Xauthority

# Ensure the Poetry bin directory is in the PATH
ENV PATH="/root/.local/bin:${PATH}"

# Updating NodeJS to v21.
RUN curl -fsSL https://deb.nodesource.com/setup_21.x | sudo -E bash - && \
    sudo apt-get install -y nodejs