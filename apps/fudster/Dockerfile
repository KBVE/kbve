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
FROM ghcr.io/linuxserver/baseimage-kasmvnc:ubuntujammy

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    openjdk-11-jre \
    python3 python3-pip python3-venv python3-xdg python3-dev python3-distutils build-essential curl git && \
    apt-get autoclean && \
    rm -rf /var/lib/apt/lists/* /var/tmp/* /tmp/*

COPY /root /

COPY --from=jar /root/microbot/runelite-client/target/*.jar /usr/local/bin/runelite.jar

RUN ln -s /usr/bin/python3 /usr/bin/python

RUN curl -sSL https://install.python-poetry.org | python -
ENV PATH="$HOME/.local/bin:$HOME/.poetry/bin:${PATH}"

WORKDIR $HOME
COPY pyproject.toml poetry.lock poetry.toml $HOME
RUN poetry install --no-root
COPY . $HOME

ENV PATH="$HOME/.venv/bin:$PATH"
ENV TITLE="Fudster v1.03"
ENV NO_FULL=true

RUN chown -R abc:abc /config

EXPOSE 3000 8086