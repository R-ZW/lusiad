package com.lusiad.backend.service.restore;

import static org.junit.Assert.*;

import com.google.gson.JsonParser;
import com.lusiad.backend.config.OperationalSettings;
import com.lusiad.backend.repository.restore.RestoreRepository;
import com.lusiad.backend.repository.sql.*;
import java.nio.file.*;
import java.util.*;
import org.junit.*;

/** Optional, supplied only by the existing owned Git/MySQL regression runner. No author DB. */
public class RestoreSqlIntegrationTest {
  @Test
  public void committedInputIsReadConsistentlyAndReplayedOnlyInsideOwnedCopy() throws Exception {
    String option = System.getProperty("lusiad.replay.fixture");
    Assume.assumeTrue("Owned disposable SQL fixture required", option != null);
    Path context = Path.of(option).toRealPath(), lab = context.getParent();
    var fixture = JsonParser.parseString(Files.readString(context)).getAsJsonObject();
    assertEquals("p07-p08-disposable", fixture.get("owner").getAsString());
    int port = fixture.get("port").getAsInt();
    assertNotEquals(3306, port);
    assertNotEquals(3307, port);
    var settings =
        OperationalSettings.read(
            Map.of(
                "LUSIAD_CONFIG_FILE",
                lab.resolve("no-user-config.json").toString(),
                "LUSIAD_DB_HOST",
                "127.0.0.1",
                "LUSIAD_DB_PORT",
                "" + port,
                "LUSIAD_DB_NAME",
                "lusiad_git_test",
                "LUSIAD_DB_USER",
                "root",
                "LUSIAD_DB_PASSWORD",
                ""),
            new Properties(),
            lab,
            lab);
    var factory = new SqlConnectionFactory(SqlConnectionConfig.from(settings));
    try (var connection = factory.openConnection();
        var statement = connection.createStatement();
        var rs = statement.executeQuery("SELECT @@datadir")) {
      assertTrue(rs.next());
      assertEquals(lab.resolve("data").toRealPath(), Path.of(rs.getString(1)).toRealPath());
    }
    int target = fixture.get("target").getAsInt();
    var input = new RestoreRepository(factory).loadReplay(target);
    assertEquals(100, input.projectId());
    assertEquals(target, input.rows().getLast().id);
    Path root = Path.of(input.root()).toRealPath(), temp = Path.of(input.temp()).toRealPath();
    assertTrue(root.startsWith(lab));
    assertTrue(temp.startsWith(lab));
    byte[] live = Files.readAllBytes(root.resolve("First.java"));
    HistoricalReplay.run(
        temp.toString(),
        root.toString(),
        input.rows(),
        target,
        input.bundles(),
        (row, body) -> {
          throw new AssertionError("v2 must not use IDE");
        });
    assertEquals("", Files.readString(temp.resolve("working-copy-prev/First.java")));
    assertTrue(Files.readString(temp.resolve("working-copy/First.java")).contains("class First"));
    assertArrayEquals(live, Files.readAllBytes(root.resolve("First.java")));
    try {
      new RestoreRepository(factory).loadReplay(Integer.MAX_VALUE);
      fail();
    } catch (IllegalArgumentException expected) {
      assertNotNull(expected.getMessage());
    }
    Files.writeString(
        lab.resolve("replay-result.json"), "{\"passed\":true,\"kind\":\"service-regression\"}");
  }
}
