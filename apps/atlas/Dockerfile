# Use Ubuntu 22.04 LTS as the base image
FROM ubuntu:22.04

# Set non-interactive shell to avoid stuck builds on dialogs
ENV DEBIAN_FRONTEND=noninteractive

# Install necessary packages for the environment
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    software-properties-common \
    x11vnc \
    xvfb \
    xauth \
    tightvncserver \
    novnc \
    net-tools \
    gnupg2 \
    gnome-terminal \
    gnome-session

# Add the deadsnakes PPA and install Python 3.12
RUN add-apt-repository ppa:deadsnakes/ppa && \
    apt-get update && \
    apt-get install -y python3.12 python3.12-venv python3.12-distutils python3-pip

# Install Poetry
RUN curl -sSL https://install.python-poetry.org | python3.12 -

# Ensure the Poetry bin directory is in the PATH
ENV PATH="/root/.local/bin:${PATH}"

# Setup environment variables
ENV HOME=/root \
    DISPLAY=:1 \
    XAUTHORITY=/root/.Xauthority

# Prepare directory for app and copy the entrypoint script
WORKDIR /app
COPY . /app
COPY ./entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Install application dependencies
# RUN poetry config virtualenvs.create false && \
#     poetry install --no-dev

RUN poetry install

# Expose VNC and noVNC ports
EXPOSE 5900 6080 8000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["poetry", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]