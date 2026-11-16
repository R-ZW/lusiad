package com.lusiad.backend.service.project;

import java.util.HashMap;
import java.util.Map;

/** Run-local leases for jobs that outlive HTTP. Disk/SQL writers keep their existing locks. */
public final class ProjectActivity {
    private static final class State { int readers; boolean administrator; }
    private static final Map<Integer, State> STATES = new HashMap<>();
    private ProjectActivity() {}
    public static synchronized Lease enter(int project) { return acquire(project, false); }
    public static synchronized Lease administer(int project) { return acquire(project, true); }
    private static Lease acquire(int project, boolean administrator) {
        State state = STATES.computeIfAbsent(project, ignored -> new State());
        if (state.administrator || administrator && state.readers != 0)
            throw new ProjectManagementService.Failure("project_busy");
        if (administrator) state.administrator = true; else state.readers++;
        return new Lease(project, administrator);
    }
    public static final class Lease implements AutoCloseable {
        private final int project; private final boolean administrator; private boolean closed;
        private Lease(int project, boolean administrator) { this.project = project; this.administrator = administrator; }
        public void close() {
            synchronized (ProjectActivity.class) {
                if (closed) return;
                closed = true; State state = STATES.get(project);
                if (administrator) state.administrator = false; else state.readers--;
                if (!state.administrator && state.readers == 0) STATES.remove(project);
            }
        }
    }
}
