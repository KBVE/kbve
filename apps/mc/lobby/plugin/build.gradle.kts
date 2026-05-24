plugins {
    kotlin("jvm") version "2.0.21"
    id("com.gradleup.shadow") version "8.3.5"
}

group = "com.kbve"
version = "1.2.0"

repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/")
}

dependencies {
    compileOnly("io.papermc.paper:paper-api:1.21.11-R0.1-SNAPSHOT")
    // Paper ships Gson; declared compileOnly so we can parse the inbound exec
    // payloads without bundling it into the shadow jar.
    compileOnly("com.google.code.gson:gson:2.11.0")
}

kotlin {
    jvmToolchain(21)
}

tasks {
    shadowJar {
        archiveBaseName.set("kbve-mc-uplink")
        archiveClassifier.set("")
        archiveVersion.set(project.version.toString())
    }
    build {
        dependsOn(shadowJar)
    }
}
