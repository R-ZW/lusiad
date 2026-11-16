package com.lusiad.backend;

import com.intellij.testFramework.fixtures.BasePlatformTestCase;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;

public class HttpServerLifecycleTest extends BasePlatformTestCase {
    private java.nio.file.Path configRoot;
    private String previousConfig;

    @Override protected void setUp() throws Exception {
        super.setUp();
        previousConfig = System.getProperty("lusiad.config.file");
        configRoot = java.nio.file.Files.createTempDirectory("lusiad-lifecycle-config-");
        System.setProperty("lusiad.config.file", configRoot.resolve("config.json").toString());
    }

    @Override protected void tearDown() throws Exception {
        try {
            if (previousConfig == null) System.clearProperty("lusiad.config.file"); else System.setProperty("lusiad.config.file", previousConfig);
            try (var paths = java.nio.file.Files.walk(configRoot)) {
                for (var path : paths.sorted(java.util.Comparator.reverseOrder()).toList()) java.nio.file.Files.delete(path);
            }
        } finally { super.tearDown(); }
    }

    public void testStartingTwiceKeepsOneServerAndStoppingTwiceIsSafe() throws Exception {
        HttpServer server = new HttpServer(getProject(), 0);
        try {
            assertFalse(server.isRunning());
            server.start();
            assertTrue(server.isRunning());
            server.start();
            assertTrue(server.isRunning());
        } finally {
            server.stop();
            server.stop();
        }
        assertFalse(server.isRunning());
    }

    public void testOccupiedPortDoesNotProduceRunningStatusAndCanBeRetried() throws Exception {
        HttpServer server;
        try (ServerSocket occupied = new ServerSocket()) {
            occupied.bind(new InetSocketAddress("127.0.0.1", 0));
            server = new HttpServer(getProject(), occupied.getLocalPort());
            try {
                server.start();
                fail("An occupied port must fail");
            } catch (IOException expected) {
                assertFalse(server.isRunning());
            }
        }
        try {
            server.start();
            assertTrue(server.isRunning());
        } finally {
            server.stop();
        }
    }
}
