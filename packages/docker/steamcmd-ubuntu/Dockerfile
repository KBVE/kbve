FROM --platform=linux/amd64 ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN dpkg --add-architecture i386 && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        software-properties-common \
        ca-certificates \
        locales && \
    add-apt-repository multiverse && \
    echo steam steam/question select "I AGREE" | debconf-set-selections && \
    echo steam steam/license note '' | debconf-set-selections && \
    apt-get update && \
    apt-get install -y --no-install-recommends steamcmd && \
    locale-gen en_US.UTF-8 && \
    rm -rf /var/lib/apt/lists/*

ENV LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8

RUN /usr/games/steamcmd +quit || true

RUN ln -s /usr/games/steamcmd /usr/local/bin/steamcmd

WORKDIR /export

ENTRYPOINT []
CMD ["steamcmd", "+quit"]
