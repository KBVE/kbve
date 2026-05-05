plugins {
    // Allows Gradle to auto-provision JDK 21 if the host doesn't have one.
    // Inside the Dockerfile (FROM gradle:jdk21) JDK 21 is already present, so
    // this is a no-op there; useful for local builds without a JDK installed.
    id("org.gradle.toolchains.foojay-resolver-convention") version "0.9.0"
}

rootProject.name = "kbve-velocity-commands"
