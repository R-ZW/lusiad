# `Lusiad` – Architecture

**🇺🇸 English** · [🇧🇷 Português (Brasil)](../pt-BR/arquitetura.md)

### On this page

> [1. Components](#-1-components)<br>
> [2. Change flow](#-2-change-flow)<br>
> [3. Code map](#-3-code-map)<br>
> [Documentation index](#documentation-index)

---

<a name="components"></a>

## 🧩 1. Components

The `lusiad-backend` plugin runs inside IntelliJ. It uses platform PSI to read and modify Java programs, operates on files, and exposes an authenticated local HTTP API. The `lusiad-frontend` Next.js application presents editing, inspection, and history panels. Its server coordinates Git operations, calls to the plugin, and MySQL queries. Database credentials stay on the server side.

MySQL stores projects, branches, commits, change events, and operation receipts. Each project's Git repository stores versioned states. Both parts need to refer to the same project to reconstruct history. Configuration examples live in each component's `.env.example`.

<a name="change-flow"></a>

## 🔀 2. Change flow

1. The user selects or moves an element in the frontend's model view.
2. The frontend submits the operation to the plugin API, which applies the Java edit through PSI.
3. The service records the operation and affected element in MySQL. The interface can group pending changes into a Git commit.
4. The history view loads the record and requests reconstructed states for a before and after view.

See [Implementation](implementation.md) for the boundary between display facts and replay data.

<a name="code-map"></a>

## 📂 3. Code map

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

<table width="100%">
<tr>
<td align="left"><a href="implementation-index.md">⬅️ Previous page · Implementation</a></td>
<td align="center"><a href="index.md">🔟 Architecture</a></td>
<td align="right"><a href="implementation.md">Next page ➡️ Notable implementation elements</a></td>
</tr>
</table>

### Documentation index

**[📖 Overview](../../README.md)**

- [🖥️ User guide](manual.md)
- [🎬 Demo](demo.md)

**[⚙️ Installation](setup.md)**

- [🔧 Installation guide](installation.md)
- [🚀 First steps](first-steps.md)

**[📐 Project](project.md)**

- [📋 Requirements](requirements.md)
- [✏️ Prototyping](prototyping.md)

**[💻 Implementation](implementation-index.md)**

- [🏗️ Architecture](architecture.md) 👈
- [🔍 Notable implementation elements](implementation.md)
