package com.lusiad.toolwindow;

import com.lusiad.backend.repository.sql.SqlConnectionConfig;
import com.lusiad.backend.repository.sql.SqlConnectionFactory;
import junit.framework.TestCase;

import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class DatabaseDiagnosticTimeoutTest extends TestCase {
    public void testUnresponsivePeerDoesNotLeaveDiagnosticWaitingIndefinitely() throws Exception {
        Map<String, String> previous = new HashMap<>();
        CountDownLatch accepted = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try (ServerSocket peer = new ServerSocket(); var executor = Executors.newSingleThreadExecutor()) {
            peer.bind(new InetSocketAddress("127.0.0.1", 0));
            executor.submit(() -> {
                try (var socket = peer.accept()) {
                    accepted.countDown();
                    release.await(5, TimeUnit.SECONDS);
                } catch (Exception ignored) {
                    // The disposable peer deliberately never sends a MySQL handshake.
                }
            });
            Map<String, String> fixture = Map.of(
                    "lusiad.db.host", "127.0.0.1", "lusiad.db.port", String.valueOf(peer.getLocalPort()),
                    "lusiad.db.name", "lusiad_diagnostic_fixture", "lusiad.db.user", "fixture", "lusiad.db.password", "fixture");
            fixture.forEach((key, value) -> {
                previous.put(key, System.getProperty(key));
                System.setProperty(key, value);
            });
            try {
                long started = System.nanoTime();
                try (var unexpected = new SqlConnectionFactory(SqlConnectionConfig.load()).openConnection(250, 250)) {
                    fail("An unresponsive peer cannot report success");
                } catch (SQLException expected) {
                    assertEquals("toolwindow.database.error.unreachable", FrontendSettings.databaseFailureKey(expected));
                    assertTrue(accepted.await(1, TimeUnit.SECONDS));
                    assertTrue("The read must have a bounded timeout", System.nanoTime() - started < TimeUnit.SECONDS.toNanos(5));
                }
            } finally {
                release.countDown();
                previous.forEach((key, value) -> {
                    if (value == null) System.clearProperty(key);
                    else System.setProperty(key, value);
                });
            }
        }
    }
}
