FROM ghcr.io/linuxserver/baseimage-kasmvnc:ubuntujammy

RUN \
    add-apt-repository ppa:saiarcot895/chromium-beta && \
    apt-get update

RUN \
    echo "**** add icon ****" && \
    curl -o \
    /kclient/public/icon.png \
    https://raw.githubusercontent.com/linuxserver/docker-templates/master/linuxserver.io/img/chromium-logo.png && \
    echo "**** install packages ****" && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    wget \
    nano \
    python3 \
    python3-pip \
    python3-tk \
    python3-xdg \
    python3-dev \
    python3-venv \
    python3-distutils \
    gnome-screenshot \
    openjdk-11-jdk \
    chromium-browser \ 
    chromium-chromedriver && \
    echo "**** cleanup ****" && \
    apt-get autoclean && \
    rm -rf \
    /config/.cache \
    /var/lib/apt/lists/* \
    /var/tmp/* \
    /tmp/*


RUN ln -s /usr/bin/python3 /usr/bin/python

COPY /root /

RUN wget -O /usr/local/bin/runelite.jar https://github.com/runelite/launcher/releases/download/2.7.1/RuneLite.jar

# Poetry
RUN curl -sSL https://install.python-poetry.org | python -

ENV PATH="$HOME/.local/bin:$HOME/.poetry/bin:${PATH}"

RUN poetry --version

WORKDIR $HOME
COPY . $HOME

RUN poetry install

ENV PATH="$HOME/.venv/bin:$PATH"

ENV TITLE="kbveATLASv1.42"

EXPOSE 3000 8086

VOLUME /config

RUN \
    chown -R abc:abc /config && \
    chown -R abc:abc /usr/lib/chromium-browser/chromedriver && \
    chown -R abc:abc /usr/bin/chromium-browser && \
    chown -R abc:abc /usr/bin/wrapped-chromium && \
    chmod +x /usr/lib/chromium-browser/chromedriver && \
    chmod +x /usr/bin/chromium-browser && \
    chmod +x /usr/bin/wrapped-chromium

RUN echo "root:password@" | chpasswd