############
##  [Stage] - 1
############
FROM eclipse-temurin:11-jdk AS jardeps

RUN apt-get update && apt-get install -y git maven

RUN git clone https://github.com/chsami/microbot.git /root/microbot

RUN mkdir /root/.m2

COPY add_dependency.sh /root/add_dependency.sh

RUN chmod +x /root/add_dependency.sh

RUN /root/add_dependency.sh

WORKDIR /root/microbot

RUN mvn -f /root/microbot/pom.xml dependency:go-offline dependency:resolve dependency:resolve-plugins clean package -DskipTests -B
RUN mvn -f /root/microbot/runelite-api/pom.xml dependency:go-offline dependency:resolve dependency:resolve-plugins clean package -DskipTests -B
RUN mvn -f /root/microbot/runelite-jshell/pom.xml dependency:go-offline dependency:resolve dependency:resolve-plugins clean package -DskipTests -B
RUN mvn -f /root/microbot/runelite-client/pom.xml dependency:go-offline dependency:resolve dependency:resolve-plugins -DskipTests -B
RUN mvn -f /root/microbot/runelite-maven-plugin/pom.xml dependency:go-offline dependency:resolve dependency:resolve-plugins clean package -DskipTests -B


############
##  [STAGE] - 1D
############
FROM eclipse-temurin:11-jdk AS jar

RUN apt-get update && apt-get install -y git maven

RUN apt-get update && apt-get install -y wget unzip

# Download and install `mvnd` based on architecture
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
        wget https://github.com/apache/maven-mvnd/releases/download/1.0.2/maven-mvnd-1.0.2-linux-amd64.zip -O mvnd.zip; \
    elif [ "$ARCH" = "aarch64" ]; then \
        wget https://github.com/apache/maven-mvnd/releases/download/1.0.2/maven-mvnd-1.0.2-linux-aarch64.zip -O mvnd.zip; \
    else \
        echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    unzip mvnd.zip -d /opt && \
    ln -s /opt/maven-mvnd-1.0.2/bin/mvnd /usr/local/bin/mvnd && \
    rm mvnd.zip

COPY --from=jardeps /root/microbot /root/microbot
COPY --from=jardeps /root/.m2 /root/.m2

WORKDIR /root/microbot

RUN mkdir -p /root/microbot/runelite-client/src/main/java/net/runelite/client/plugins/microbot/kbve
COPY ./plugin /root/microbot/runelite-client/src/main/java/net/runelite/client/plugins/microbot/kbve

RUN mvnd verify

ENV MAVEN_OPTS="-XX:+TieredCompilation -XX:TieredStopAtLevel=1"
RUN mvn clean package -T 1C -DskipTests -Dmaven.test.skip=true


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