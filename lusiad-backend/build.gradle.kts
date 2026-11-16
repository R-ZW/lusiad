import org.jetbrains.intellij.platform.gradle.tasks.RunIdeTask


val googleJavaFormatExports = listOf(
    "--add-exports=jdk.compiler/com.sun.tools.javac.api=ALL-UNNAMED",
    "--add-exports=jdk.compiler/com.sun.tools.javac.code=ALL-UNNAMED",
    "--add-exports=jdk.compiler/com.sun.tools.javac.file=ALL-UNNAMED",
    "--add-exports=jdk.compiler/com.sun.tools.javac.parser=ALL-UNNAMED",
    "--add-exports=jdk.compiler/com.sun.tools.javac.tree=ALL-UNNAMED",
    "--add-exports=jdk.compiler/com.sun.tools.javac.util=ALL-UNNAMED"
)

tasks.withType<RunIdeTask>().configureEach {
    jvmArgs(googleJavaFormatExports)
}

plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "2.1.20"
    id("org.jetbrains.intellij.platform") version "2.10.2"
}

group = "com"
version = "1.0-SNAPSHOT"

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

// Read more: https://plugins.jetbrains.com/docs/intellij/tools-intellij-platform-gradle-plugin.html
dependencies {
    implementation("com.google.googlejavaformat:google-java-format:1.17.0")
    implementation("com.mysql:mysql-connector-j:8.4.0")
    implementation("net.sourceforge.plantuml:plantuml-mit:1.2026.8")
    testImplementation("junit:junit:4.13.2")
    intellijPlatform {
        intellijIdea("2025.2.4")
        testFramework(org.jetbrains.intellij.platform.gradle.TestFrameworkType.Platform)


        // Add plugin dependencies for compilation here, example:
        bundledPlugin("com.intellij.java")
    }
}

tasks.test {
    providers.gradleProperty("lusiadReplayFixture").orNull?.let { systemProperty("lusiad.replay.fixture", it) }
    useJUnit()
    jvmArgs(googleJavaFormatExports)
    providers.gradleProperty("lusiadIntegrationConfig").orNull?.let {
        systemProperty("lusiad.integration.config", it)
    }
    providers.gradleProperty("lusiadEditIntegrationConfig").orNull?.let {
        systemProperty("lusiad.edit.integration.config", it)
    }
}

intellijPlatform {
    // The test launcher supplies a disposable directory; normal runIde keeps its default.
    providers.environmentVariable("LUSIAD_IDE_SANDBOX").orNull?.let {
        sandboxContainer = file(it)
    }
    pluginConfiguration {
        ideaVersion {
            sinceBuild = "252.25557"
        }

        changeNotes = """
            Initial version
        """.trimIndent()
    }
}

tasks {
    // Set the JVM compatibility versions
    withType<JavaCompile> {
        sourceCompatibility = "21"
        targetCompatibility = "21"
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21)
    }
}
