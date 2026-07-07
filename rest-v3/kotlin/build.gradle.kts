plugins {
    kotlin("jvm") version "2.2.21"
    application
}

group = "br.com.foxbit"
version = "1.0.0"

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.json:json:20250517")
}

kotlin {
    jvmToolchain(21)
}

application {
    mainClass.set("MainKt")
}
