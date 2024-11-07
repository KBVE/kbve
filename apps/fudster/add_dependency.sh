#!/bin/bash

# File path to the main runelite-client pom.xml
POM_FILE="/root/microbot/runelite-client/pom.xml"

# Dependency to add (Java-WebSocket in this example)
DEPENDENCY_XML="<dependency>
    <groupId>org.java-websocket</groupId>
    <artifactId>Java-WebSocket</artifactId>
    <version>1.5.7</version>
</dependency>"

# Check if the dependency already exists in the pom.xml
if grep -q "<groupId>org.java-websocket</groupId>" "$POM_FILE"; then
    echo "Java-WebSocket dependency already exists in the pom.xml"
else
    # Use awk to add the dependency before the closing </dependencies> tag
    awk -v dep="$DEPENDENCY_XML" '/<\/dependencies>/ { print dep; print; next }1' "$POM_FILE" > temp && mv temp "$POM_FILE"

    echo "Java-WebSocket dependency added to the pom.xml"
fi
