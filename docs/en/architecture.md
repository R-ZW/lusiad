# Architecture and directories

## On this page

- [Components](#components)
- [Change flow](#change-flow)
- [Code map](#code-map)

## Components

The `lusiad-backend` plugin runs inside IntelliJ. It uses platform PSI to read and modify Java programs, operates on files, and exposes an authenticated local HTTP API. The `lusiad-frontend` Next.js application presents editing, inspection, and history panels. Its server coordinates Git operations, calls to the plugin, and MySQL queries. Database credentials stay on the server side.

MySQL stores projects, branches, commits, change events, and operation receipts. Each project's Git repository stores versioned states. Both parts need to refer to the same project to reconstruct history. Configuration examples live in each component's `.env.example`.

## Change flow

1. The user selects or moves an element in the frontend's model view.
2. The frontend submits the operation to the plugin API, which applies the Java edit through PSI.
3. The service records the operation and affected element in MySQL. The interface can group pending changes into a Git commit.
4. The history view loads the record and requests reconstructed states for a before and after view.

See [Implementation](implementation.md) for the boundary between display facts and replay data.

## Code map

| Directory | Main role |
| --- | --- |
| `lusiad-backend/src/main/java/com/lusiad/backend/service/psi/` | Java model edits and diagnostics. |
| `lusiad-backend/src/main/java/com/lusiad/backend/service/change/` | Change records and structural descriptions. |
| `lusiad-backend/src/main/java/com/lusiad/backend/service/restore/` | Reconstruction and restoration. |
| `lusiad-backend/src/main/java/com/lusiad/toolwindow/` | Native plugin panel. |
| `lusiad-backend/db/migrations/` | Additive schema changes. |
| `lusiad-frontend/src/features/` | Interface features. |
| `lusiad-frontend/src/lib/services/` | Git, backend, and history coordination. |
| `lusiad-frontend/src/lib/models/` | Interface models and validation. |

---

[← Manual](manual.md) · [Index](index.md) · [Implementation →](implementation.md) · [Português](../pt-BR/arquitetura.md)
