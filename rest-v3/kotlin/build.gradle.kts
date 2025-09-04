plugins {
    kotlin("jvm") version "1.9.22"
    application
}

group = "foxbit"
version = "1.0.0"

repositories { mavenCentral() }

dependencies {
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin:2.17.0")
}

application { mainClass.set("MainKt") }
