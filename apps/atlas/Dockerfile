FROM lscr.io/linuxserver/chromium:latest

RUN apt-get update && \
    apt-get install -y \
    wget \
    python3 \
    python3-pip \
    python3-tk \
    python3-xdg \
    python3-dev \
    python3-venv \
    python3-distutils \
    pulseaudio

RUN ln -s /usr/bin/python3 /usr/bin/python

# Create a symlink for python3 to be called as python
# RUN ln -s /usr/bin/python3 /usr/bin/python
# Download RuneLite
RUN wget -O /usr/local/bin/runelite.jar https://github.com/runelite/launcher/releases/download/2.7.1/RuneLite.jar

# Poetry
RUN curl -sSL https://install.python-poetry.org | python -

# Ensure the Poetry bin directory is in the PATH
ENV PATH="$HOME/.local/bin:$HOME/.poetry/bin:${PATH}"

# Verify Poetry installation and print version
RUN poetry --version

# Copy application source
WORKDIR /app
COPY . /app
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Setup PulseAudio
RUN mkdir -p /var/run/pulse && \
    pulseaudio --daemonize && \
    pulseaudio --start

# Install dependencies with Poetry
RUN poetry install

ENV PATH="/app/.venv/bin:$PATH"
#RUN poetry run uvicorn main:app --host 0.0.0.0 --port 8086 --ws-ping-interval 25 --ws-ping-timeout 5

ENV DISPLAY=:1

EXPOSE 3000 8086
#ENTRYPOINT ["/app/entrypoint.sh"]
#CMD ["pulseaudio", "--start", "--log-target=syslog", "--exit-idle-time=-1"]
CMD ["poetry", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8086", "--ws-ping-interval", "25", "--ws-ping-timeout", "5"]
