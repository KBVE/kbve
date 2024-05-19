# Use Ubuntu 22.04 LTS as the base image
FROM ubuntu:22.04

# Set non-interactive shell to avoid stuck builds on dialogs
ENV DEBIAN_FRONTEND=noninteractive


# Install necessary packages for the environment, including Chrome dependencies
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
    python3-xdg \
    python3-dev \
    gnupg2 \
    gnome-terminal \
    gnome-session \
    gnome-screenshot \
    openbox \
    openjdk-11-jdk \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libxss1 \
    xdg-utils \
    --no-install-recommends

# Add a non-root user to run Chrome
RUN groupadd -r chrome && useradd -r -g chrome -G audio,video chrome && \
    mkdir -p /home/chrome && chown -R chrome:chrome /home/chrome && \
    mkdir -p /data && chown -R chrome:chrome /data

# Install Google Chrome for x86_64 or ARM architecture
RUN ARCHITECTURE=$(dpkg --print-architecture) && \
    if [ "$ARCHITECTURE" = "amd64" ]; then \
        wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - && \
        sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list' && \
        apt-get update && \
        apt-get install -y google-chrome-stable && \
        rm -rf /var/lib/apt/lists/*; \
    elif [ "$ARCHITECTURE" = "arm64" ]; then \
        wget https://dl.google.com/linux/direct/google-chrome-stable_current_arm64.deb && \
        apt-get update && \
        apt-get install -y ./google-chrome-stable_current_arm64.deb && \
        rm -rf /var/lib/apt/lists/*; \
    else \
        echo "Unsupported architecture: $ARCHITECTURE" && exit 1; \
    fi


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


# Copy application source
WORKDIR /app
COPY . /app
COPY entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/entrypoint.sh


# Install dependencies with Poetry
RUN poetry install

# Expose necessary ports
EXPOSE 6080 8086

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]


# RUN apt-get update && apt-get -y install cron
# RUN echo "@reboot export DISPLAY=:20 && poetry run uvicorn main:app --host 0.0.0.0 --port 8086 --ws-ping-interval 25 --ws-ping-timeout 5" > /etc/cron.d/cronjob
# RUN chmod 0644 /etc/cron.d/cronjob
# RUN crontab /etc/cron.d/cronjob

# ENV DISPLAY=:20


#CMD ["cron", "-f"]
# CMD ["cron", "-l", "2", "-f"]

#CMD ["poetry", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8086", "--ws-ping-interval", "25", "--ws-ping-timeout", "5"]





