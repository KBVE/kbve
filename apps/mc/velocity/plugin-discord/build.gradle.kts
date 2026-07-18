plugins {
    kotlin("jvm") version "2.0.21"
    kotlin("kapt") version "2.0.21"
    id("com.gradleup.shadow") version "8.3.5"
}

group = "com.kbve"
version = "1.2.0"

repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/")
}

dependencies {
    compileOnly("com.velocitypowered:velocity-api:3.4.0-SNAPSHOT")
    kapt("com.velocitypowered:velocity-api:3.4.0-SNAPSHOT")

    // JDA for Discord bot (inbound message events + webhook self-provision +
    // idle voice-channel presence). Voice needs JDA's audio stack: tink for the
    // UDP encryption handshake and opus-java for the send system, so both are
    // kept (previously excluded when the relay was text-only).
    implementation("net.dv8tion:JDA:5.2.1")
}

kotlin {
    jvmToolchain(21)
}

tasks {
    shadowJar {
        archiveBaseName.set("kbve-discord-relay")
        archiveClassifier.set("")
        archiveVersion.set(project.version.toString())

        // Drop deps Velocity already provides on its runtime classpath, to
        // avoid duplicate-class warnings + shave megabytes from the fat jar.
        dependencies {
            exclude(dependency("org.slf4j:.*"))
            exclude(dependency("com.google.code.gson:.*"))
        }
    }
    build {
        dependsOn(shadowJar)
    }
}
