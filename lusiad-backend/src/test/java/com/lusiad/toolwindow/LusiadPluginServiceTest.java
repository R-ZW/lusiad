package com.lusiad.toolwindow;

import com.intellij.testFramework.fixtures.BasePlatformTestCase;

import java.net.InetSocketAddress;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;

public class LusiadPluginServiceTest extends BasePlatformTestCase {
    public void testFrontendChecksUseHeadAndDistinguishHttpFailures() throws Exception {
        AtomicReference<String> method = new AtomicReference<>();
        var frontend = com.sun.net.httpserver.HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        frontend.createContext("/", exchange -> {
            method.set(exchange.getRequestMethod());
            exchange.sendResponseHeaders(exchange.getRequestURI().getPath().equals("/ready") ? 204 : 503, -1);
            exchange.close();
        });
        frontend.start();
        LusiadPluginService service = new LusiadPluginService(getProject(), 0);
        String base = "http://127.0.0.1:" + frontend.getAddress().getPort();
        try {
            service.checkFrontend(base + "/ready");
            await(() -> service.frontend().state() == LusiadPluginService.CheckState.OK);
            assertEquals("HEAD", method.get());
            assertNotNull(service.frontend().checkedAt());
            service.checkFrontend(base + "/failed");
            await(() -> service.frontend().state() == LusiadPluginService.CheckState.ERROR);
            assertEquals("toolwindow.frontend.error.http", service.frontend().errorKey());
            assertEquals("HTTP 503", service.frontend().detail());
        } finally {
            service.dispose();
            frontend.stop(0);
        }
    }

    public void testResponseForPreviousUrlCannotReplaceTheNewUrlStatus() throws Exception {
        CountDownLatch requested = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        var slow = com.sun.net.httpserver.HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        slow.createContext("/", exchange -> {
            requested.countDown();
            try { release.await(3, TimeUnit.SECONDS); }
            catch (InterruptedException failure) { Thread.currentThread().interrupt(); }
            exchange.sendResponseHeaders(503, -1);
            exchange.close();
        });
        var ready = com.sun.net.httpserver.HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        ready.createContext("/", exchange -> {
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
        });
        slow.start();
        ready.start();
        LusiadPluginService service = new LusiadPluginService(getProject(), 0);
        String latest = "http://127.0.0.1:" + ready.getAddress().getPort();
        try {
            var previousCheck = service.checkFrontend("http://127.0.0.1:" + slow.getAddress().getPort());
            assertTrue(requested.await(3, TimeUnit.SECONDS));
            service.checkFrontend(latest);
            await(() -> service.frontend().state() == LusiadPluginService.CheckState.OK);
            release.countDown();
            previousCheck.get(5, TimeUnit.SECONDS);
            assertEquals(latest, service.frontend().endpoint());
            assertEquals(LusiadPluginService.CheckState.OK, service.frontend().state());
        } finally {
            release.countDown();
            service.dispose();
            slow.stop(0);
            ready.stop(0);
        }
    }

    public void testDisposedProjectServiceStopsItsApiAndCannotRestartIt() throws Exception {
        LusiadPluginService service = new LusiadPluginService(getProject(), 0);
        try {
            service.startApi();
            await(() -> service.apiState() == LusiadPluginService.ApiState.RUNNING);
            service.dispose();
            assertEquals(LusiadPluginService.ApiState.STOPPED, service.apiState());
            service.startApi();
            assertEquals(LusiadPluginService.ApiState.STOPPED, service.apiState());
        } finally {
            service.dispose();
        }
    }

    private static void await(BooleanSupplier condition) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (!condition.getAsBoolean() && System.nanoTime() < deadline) Thread.sleep(10);
        assertTrue("Diagnostic did not finish in time", condition.getAsBoolean());
    }
}
