package com.lusiad.backend.service.change;

import com.google.gson.Gson;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.intellij.openapi.diagnostic.Logger;
import com.lusiad.backend.repository.change.ChangeRepository;
import com.lusiad.backend.repository.sql.SqlConnectionConfig;
import com.lusiad.backend.repository.sql.SqlConnectionFactory;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.Set;

public final class ChangeLogService {
    public static final class RecordFailure extends RuntimeException {
        RecordFailure(Throwable cause) {
            super("Filesystem operation applied, but its history record was not confirmed. Inspect synchronization before continuing; do not repeat the operation.", cause);
        }
    }
    private static final Logger LOG = Logger.getInstance(ChangeLogService.class);
    private static final Gson GSON = new com.google.gson.GsonBuilder().serializeNulls().create();
    private static final DateTimeFormatter DB_DATETIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final SqlConnectionConfig DATABASE_CONFIG = SqlConnectionConfig.load();
    private static final ChangeRepository CHANGE_REPOSITORY = new ChangeRepository(new SqlConnectionFactory(DATABASE_CONFIG));
    private ChangeLogService() {}

    /** The configuration actually used to record changes, without reloading a different .env. */
    public static SqlConnectionConfig databaseConfiguration() { return DATABASE_CONFIG; }

    /** The caller captures actual paths inside its filesystem operation; SQL remains outside IDE locks. */
    public static void recordFilesystem(int projectId, String action, Map<String, String> req, JsonObject metadata) {
        JsonObject body = new JsonObject();
        for (var entry : req.entrySet()) {
            if (Set.of("projectId", "changeDescription", "changeMetadata").contains(entry.getKey())) continue;
            if (entry.getValue() == null) body.add(entry.getKey(), JsonNull.INSTANCE);
            else body.addProperty(entry.getKey(), entry.getValue());
        }
        body.add("changeMetadata", metadata);
        body.addProperty("recordVersion", 1);
        body.addProperty("operationId", java.util.UUID.randomUUID().toString());
        try {
            var app = com.intellij.openapi.application.ApplicationManager.getApplication();
            if (app != null && (app.isWriteAccessAllowed() || app.isDispatchThread()))
                throw new IllegalStateException("SQL recording must run outside the IDE write action/EDT");
            String scope = action.startsWith("dir_") ? "project" : "dir";
            CHANGE_REPOSITORY.insertChange(projectId, action, scope, ChangeMetadata.summary(metadata),
                    req.getOrDefault("changeDescription", ""), LocalDateTime.now().format(DB_DATETIME), GSON.toJson(body));
        } catch (Exception failure) {
            LOG.warn("Failed to persist " + action + " change log", failure);
            throw new RecordFailure(failure);
        }
    }
    public static void testConnectionOrThrow() throws Exception { CHANGE_REPOSITORY.testConnection(); }
}
