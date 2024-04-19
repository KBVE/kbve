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

### Download and setup the CUDA repository pin
RUN wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-ubuntu2204.pin && \
    mv cuda-ubuntu2204.pin /etc/apt/preferences.d/cuda-repository-pin-600

### Download and install the CUDA local repository package
RUN wget https://developer.download.nvidia.com/compute/cuda/12.4.1/local_installers/cuda-repo-ubuntu2204-12-4-local_12.4.1-550.54.15-1_amd64.deb && \
    dpkg -i cuda-repo-ubuntu2204-12-4-local_12.4.1-550.54.15-1_amd64.deb

### Copy the keyring file to the appropriate directory
RUN cp /var/cuda-repo-ubuntu2204-12-4-local/cuda-*-keyring.gpg /usr/share/keyrings/

### Update package lists and install CUDA toolkit
RUN apt-get update && \
    apt-get -y install cuda-toolkit-12-4

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

### Set CUDA-related environment variables
ENV CUDA_HOME=/usr/local/cuda-12.4 \
    LD_LIBRARY_PATH=${CUDA_HOME}/lib64:${LD_LIBRARY_PATH} \
    PATH=${CUDA_HOME}/bin:${PATH}

# Possible CUDA Issue
#ENV CUDA_HOME=/usr/local/cuda-12.4 \
#    LD_LIBRARY_PATH=${CUDA_HOME}/lib64:${LD_LIBRARY_PATH} \
#    PATH="/root/.local/bin:/usr/local/cuda-12.4/bin:${PATH}"


# Entry Point for Later
#COPY entrypoint.sh /usr/local/bin/entrypoint.sh
#RUN chmod +x /usr/local/bin/entrypoint.sh
#ENTRYPOINT ["entrypoint.sh"]


### Base User.
#RUN useradd -m -s /bin/bash kbve
#USER kbve
#WORKDIR /home/kbve

### HealthCheck
### Remember localhost:port in some cases.
#HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
#  CMD curl -f http://localhost/ || exit 1


#