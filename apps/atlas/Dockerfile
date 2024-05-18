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
    dbus-x11 \
    xvfb \
    xauth \
    tigervnc-scraping-server \
    tigervnc-standalone-server \
    tigervnc-common \
    novnc \
    net-tools \
    python3-tk \
    python3-dev \
    gnupg2 \
    gnome-terminal \
    gnome-session \
    gnome-screenshot \
    openbox \
    openjdk-11-jdk

    # Install Python and Poetry using deadsnakes PPA
RUN add-apt-repository ppa:deadsnakes/ppa && \
    apt-get update && \
    apt-get install -y python3.12 python3.12-venv python3.12-distutils python3-pip && \
    curl -sSL https://install.python-poetry.org | python3.12 -

# Download RuneLite
RUN wget -O /usr/local/bin/runelite.jar https://github.com/runelite/launcher/releases/download/2.7.1/RuneLite.jar

# Environment variables to configure
ENV HOME=/root \
    DISPLAY=:1 \
    XAUTHORITY=$HOME/.Xauthority \
    XDG_SESSION_TYPE=x11

# Ensure the Poetry bin directory is in the PATH
ENV PATH="/root/.local/bin:${PATH}"


# Additional Python TK/DEV Libraries
RUN apt-get update && apt-get install -y \
    python3-tk \
    python3-dev \
    python3-xdg

# Copy application source
WORKDIR /app
COPY . /app
COPY entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/entrypoint.sh

# Install dependencies with Poetry
RUN poetry install

# Expose necessary ports
#EXPOSE 5900 6080 8000
EXPOSE 6080 8086
#EXPOSE 8086


# RUN apt-get update && apt-get -y install cron
# RUN echo "@reboot export DISPLAY=:20 && poetry run uvicorn main:app --host 0.0.0.0 --port 8086 --ws-ping-interval 25 --ws-ping-timeout 5" > /etc/cron.d/cronjob
# RUN chmod 0644 /etc/cron.d/cronjob
# RUN crontab /etc/cron.d/cronjob

# ENV DISPLAY=:20
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]


#CMD ["cron", "-f"]
# CMD ["cron", "-l", "2", "-f"]

#CMD ["poetry", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8086", "--ws-ping-interval", "25", "--ws-ping-timeout", "5"]





