plugins {
    kotlin("jvm") version "2.0.21"
    kotlin("kapt") version "2.0.21"
    id("com.gradleup.shadow") version "8.3.5"
}

group = "com.kbve"
version = "1.1.0"

repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/")
}

dependencies {
    compileOnly("com.velocitypowered:velocity-api:3.4.0-SNAPSHOT")
    kapt("com.velocitypowered:velocity-api:3.4.0-SNAPSHOT")

    // JDA for Discord bot (inbound message events + webhook self-provision).
    // Exclude opus-java + tink — voice + crypto we never use, keeps the fat jar lean.
    implementation("net.dv8tion:JDA:5.2.1") {
        exclude(module = "opus-java")
        exclude(group = "com.google.crypto.tink", module = "tink")
    }
}

kotlin {
    jvmToolchain(21)
}

tasks {
    shadowJar {
        archiveBaseName.set("kbve-velocity-commands")
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
