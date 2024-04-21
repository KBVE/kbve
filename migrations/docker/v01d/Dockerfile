### Use Ubuntu 22.04 LTS as the base image
FROM ubuntu:22.04

### Interactive Shell must be disabled.
ENV DEBIAN_FRONTEND=noninteractive

### Install necessary packages for handling repositories and packages
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    gnupg2 \
    software-properties-common \
    apt-utils

### Install other necessary software
RUN apt-get install -y \
    x11vnc \
    dbus-x11 \
    xvfb \
    xauth \
    tightvncserver \
    novnc \
    net-tools \
    python3-tk \
    python3-dev \
    gnome-terminal \
    gnome-session

# Install Python and Poetry using deadsnakes PPA
RUN add-apt-repository ppa:deadsnakes/ppa && \
    apt-get update && \
    apt-get install -y python3.12 python3.12-venv python3.12-distutils python3-pip && \
    curl -sSL https://install.python-poetry.org | python3.12 -


# Updating NodeJS to v21.
RUN curl -fsSL https://deb.nodesource.com/setup_21.x | bash - && \
    apt-get install -y nodejs

# Environment variables to configure
ENV HOME=/root \
    DISPLAY=:1 \
    XAUTHORITY=$HOME/.Xauthority \
    PATH="/root/.local/bin:${PATH}"

# Ensure the Poetry bin directory is in the PATH
ENV PATH="/root/.local/bin:${PATH}"
