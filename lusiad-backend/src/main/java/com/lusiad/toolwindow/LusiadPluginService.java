package com.lusiad.toolwindow;

import com.intellij.openapi.Disposable;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.components.Service;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.diagnostic.Logger;
import com.lusiad.backend.HttpServer;
import com.lusiad.backend.repository.sql.SqlConnectionConfig;
import com.lusiad.backend.repository.sql.SqlConnectionFactory;
import com.lusiad.backend.service.change.ChangeLogService;

import java.net.BindException;
import java.net.HttpURLConnection;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.Instant;
import java.util.concurrent.Future;
import java.util.concurrent.CompletableFuture;

/** Owns the project's API and performs read-only diagnostics off the IDE event thread. */
@Service(Service.Level.PROJECT)
public final class LusiadPluginService implements Disposable {
    private static final Logger LOG = Logger.getInstance(LusiadPluginService.class);
    public static String apiUrl() { return com.lusiad.backend.config.RuntimeEnvironment.apiUrl(); }
    public enum ApiState { STOPPED, STARTING, RUNNING, STOPPING, ERROR }
    public enum CheckState { UNKNOWN, CHECKING, OK, ERROR }

    public record Check(CheckState state, Instant checkedAt, String errorKey, String detail, String endpoint) {
        static Check unknown(String endpoint) {
            return new Check(CheckState.UNKNOWN, null, null, "", endpoint);
        }
    }

    private final Project project;
    private final int apiPort;
    private final HttpServer server;
    private final Object serverLock = new Object();
    private volatile boolean disposed;
    private volatile ApiState apiState = ApiState.STOPPED;
    private volatile String apiErrorKey;
    private volatile Check database = Check.unknown("");
    private volatile Check frontend = Check.unknown("");
    private Future<?> apiTask;
    private Future<?> databaseTask;
    private Future<?> frontendTask;
    private long frontendGeneration;
    private Future<?> projectsTask;
    public record RegisteredProject(int id,String name,String path) {}
    /** Fresh database read off the EDT; selection never calls IntelliJ's project-opening APIs. */
    public synchronized void listRegisteredProjects(java.util.function.Consumer<java.util.List<RegisteredProject>> success,Runnable failure) {
        if(disposed)return;
        if(projectsTask!=null)projectsTask.cancel(true);
        projectsTask=ApplicationManager.getApplication().executeOnPooledThread(()->{
            java.util.List<RegisteredProject> items=new java.util.ArrayList<>();
            try(var c=new SqlConnectionFactory(databaseConfiguration()).openConnection(3000,3000);
                var s=c.prepareStatement("SELECT id,name,path FROM projects ORDER BY name,id");var rows=s.executeQuery()) {
                while(rows.next())items.add(new RegisteredProject(rows.getInt(1),java.util.Objects.toString(rows.getString(2),""),rows.getString(3)));
                ApplicationManager.getApplication().invokeLater(()->{if(!disposed && !project.isDisposed())success.accept(java.util.List.copyOf(items));});
            }catch(Exception error){ApplicationManager.getApplication().invokeLater(()->{if(!disposed && !project.isDisposed())failure.run();});}
        });
    }

    public LusiadPluginService(Project project) {
        this(project, com.lusiad.backend.config.RuntimeEnvironment.apiPort());
    }

    LusiadPluginService(Project project, int apiPort) {
        this.project = project;
        this.apiPort = apiPort;
        server = new HttpServer(project, apiPort);
    }

    public ApiState apiState() { return apiState; }
    public String apiEndpoint() { return "http://127.0.0.1:" + apiPort; }
    public String apiErrorKey() { return apiErrorKey; }
    public Check database() { return database; }
    public Check frontend() { return frontend; }
    public SqlConnectionConfig databaseConfiguration() { return ChangeLogService.databaseConfiguration(); }

    public String databaseEndpoint() {
        try {
            var config = databaseConfiguration();
            return config.host + ":" + config.port + " / " + config.database;
        } catch (RuntimeException | LinkageError failure) {
            databaseConfigurationFailed();
            return "";
        }
    }

    private void databaseConfigurationFailed() {
        database = new Check(CheckState.ERROR, Instant.now(), "toolwindow.database.error.configuration", "", "");
    }

    public synchronized void startApi() {
        if (disposed || project.isDisposed() || apiState == ApiState.RUNNING
                || apiState == ApiState.STARTING || apiState == ApiState.STOPPING) return;
        apiState = ApiState.STARTING;
        apiErrorKey = null;
        apiTask = ApplicationManager.getApplication().executeOnPooledThread(() -> {
            synchronized (serverLock) {
                if (disposed) return;
                try {
                    server.start();
                    apiState = ApiState.RUNNING;
                } catch (Exception failure) {
                    LOG.warn("Could not start Lusiad local API", failure);
                    apiErrorKey = failure instanceof BindException
                            ? "toolwindow.server.error.port" : "toolwindow.server.error.generic";
                    apiState = ApiState.ERROR;
                }
            }
        });
    }

    public synchronized void stopApi() {
        if (disposed || apiState != ApiState.RUNNING) return;
        apiState = ApiState.STOPPING;
        apiTask = ApplicationManager.getApplication().executeOnPooledThread(() -> {
            synchronized (serverLock) {
                server.stop();
                apiState = ApiState.STOPPED;
            }
        });
    }

    public synchronized void checkDatabase() {
        if (disposed || database.state() == CheckState.CHECKING) return;
        SqlConnectionConfig config;
        try { config = databaseConfiguration(); }
        catch (RuntimeException | LinkageError failure) { databaseConfigurationFailed(); return; }
        String endpoint = config.host + ":" + config.port + " / " + config.database;
        database = new Check(CheckState.CHECKING, database.checkedAt(), null, "", endpoint);
        databaseTask = ApplicationManager.getApplication().executeOnPooledThread(() -> {
            Check result;
            try (Connection connection = new SqlConnectionFactory(config).openConnection(3000, 3000)) {
                if (!connection.isValid(2)) throw new SQLException("Connection is not valid", "08006");
                result = new Check(CheckState.OK, Instant.now(), null, "", endpoint);
            } catch (Exception failure) {
                String detail = failure instanceof SQLException sql
                        ? "SQLState: " + (sql.getSQLState() == null ? "—" : sql.getSQLState())
                        + " · " + sql.getErrorCode() : failure.getClass().getSimpleName();
                // Do not expose driver exception messages: they can contain connection credentials.
                result = new Check(CheckState.ERROR, Instant.now(),
                        FrontendSettings.databaseFailureKey(failure), detail, endpoint);
            }
            if (!disposed) database = result;
        });
    }

    public synchronized Future<?> checkFrontend(String url) {
        if (disposed) return CompletableFuture.completedFuture(null);
        if (frontend.state() == CheckState.CHECKING && frontend.endpoint().equals(url)) return frontendTask;
        long generation = ++frontendGeneration;
        frontend = new Check(CheckState.CHECKING, null, null, "", url);
        frontendTask = ApplicationManager.getApplication().executeOnPooledThread(() -> {
            HttpURLConnection connection = null;
            Check result;
            try {
                connection = (HttpURLConnection) FrontendSettings.parseUrl(url).toURL().openConnection();
                connection.setRequestMethod("HEAD");
                connection.setConnectTimeout(2000);
                connection.setReadTimeout(2000);
                connection.setInstanceFollowRedirects(false);
                int status = connection.getResponseCode();
                result = new Check(status >= 200 && status < 400 ? CheckState.OK : CheckState.ERROR,
                        Instant.now(), status >= 200 && status < 400 ? null : "toolwindow.frontend.error.http",
                        "HTTP " + status, url);
            } catch (Exception failure) {
                result = new Check(CheckState.ERROR, Instant.now(),
                        failure instanceof IllegalArgumentException ? "toolwindow.frontend.error.url"
                                : "toolwindow.frontend.error.unreachable", "", url);
            } finally {
                if (connection != null) connection.disconnect();
            }
            synchronized (this) {
                // A response for an old URL cannot overwrite a newer configuration's status.
                if (!disposed && generation == frontendGeneration) frontend = result;
            }
        });
        return frontendTask;
    }

    @Override
    public void dispose() {
        synchronized (this) {
            disposed = true;
            if (apiTask != null) apiTask.cancel(true);
            if (databaseTask != null) databaseTask.cancel(true);
            if (frontendTask != null) frontendTask.cancel(true);
            if (projectsTask != null) projectsTask.cancel(true);
        }
        synchronized (serverLock) {
            server.stop();
            apiState = ApiState.STOPPED;
        }
    }
}
