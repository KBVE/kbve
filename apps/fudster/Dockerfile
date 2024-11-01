############
##  [Stage] - 1
############
FROM eclipse-temurin:11-jdk AS jar

RUN apt-get update && apt-get install -y git maven

RUN git clone https://github.com/chsami/microbot.git /root/microbot

COPY add_dependency.sh /root/add_dependency.sh

RUN chmod +x /root/add_dependency.sh

RUN /root/add_dependency.sh

WORKDIR /root/microbot

RUN mvn dependency:resolve

RUN mkdir -p /root/microbot/runelite-client/src/main/java/net/runelite/client/plugins/microbot/kbve

COPY ./plugin /root/microbot/runelite-client/src/main/java/net/runelite/client/plugins/microbot/kbve

RUN mvn clean package

############
##  [Stage] - 2
############
FROM ubuntu:22.04 AS build

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv python3-dev build-essential curl git && \
    rm -rf /var/lib/apt/lists/*

RUN curl -sSL https://install.python-poetry.org | python3 -

ENV PATH="/root/.local/bin:$PATH"

##  [2:C] -> Copy Python project files to the container.
WORKDIR /app
COPY pyproject.toml poetry.lock ./
RUN poetry install --no-root

##  [2:D] -> Copy the remaining Python application files.
COPY . .
RUN python3 -m compileall -b .

############
##  [Stage] - 3
############
FROM ghcr.io/linuxserver/baseimage-kasmvnc:ubuntujammy

RUN \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    openjdk-11-jre \
    python3-minimal \
    apt-get autoclean && \
    rm -rf /config/.cache /var/lib/apt/lists/* /var/tmp/* /tmp/*

## ENV

ENV TITLE="kbveATLASv1.42"
ENV NO_FULL=true


COPY /root /

COPY --from=jar /root/microbot/runelite-client/target/*.jar /usr/local/bin/runelite.jar
COPY --from=build /app /usr/local/bin/app

VOLUME /config
RUN chown -R abc:abc /config

EXPOSE 3000 8086