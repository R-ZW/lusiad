# `Lusiad` – Notable implementation elements

**🇺🇸 English** · [🇧🇷 Português (Brasil)](../pt-BR/elementos-notaveis-da-implementacao.md)

### On this page

> [1. Move a method](#-1-move-a-method)<br>
> [2. Record a version](#-2-record-a-version)<br>
> [3. Open before and after](#-3-open-before-and-after)<br>
> [4. Scope](#-4-scope)<br>
> [Documentation index](#documentation-index)

---

<a name="move-a-method"></a>

## ↕️ 1. Move a method

Consider a class where `encerrar()` appears after `iniciar()`. The user selects `encerrar()` in the model and moves it before `iniciar()`. The plugin API receives the operation, locates Java elements through PSI, and updates the source file. The source on disk now reflects the new order.

The persisted event contains a `change_type` such as `move`, scope, project and branch references, and a `req_body`. In the recent source revision, `req_body.changeMetadata` describes the action, element type, and `before` and `after` sides. Each side may identify a path, range, kind, name, and structural context. These are display facts. The operation body and resource images support recovery. [`ChangeMetadata.java`](../../lusiad-backend/src/main/java/com/lusiad/backend/service/change/ChangeMetadata.java) explicitly describes presentation facts independent of replay. [`ChangeLogService.java`](../../lusiad-backend/src/main/java/com/lusiad/backend/service/change/ChangeLogService.java) creates the entry, and [`ChangeRepository.java`](../../lusiad-backend/src/main/java/com/lusiad/backend/repository/change/ChangeRepository.java) persists it in MySQL.

The exact fields depend on the record version.

<a name="record-a-version"></a>

## 💾 2. Record a version

The user creates a commit through the interface. The frontend coordinates the project's Git repository and pending MySQL events. [`git-recording.service.ts`](../../lusiad-frontend/src/lib/services/commit-menu/git-recording.service.ts) freezes the intent, checks events, and associates the Git commit with their records. A commit consolidates a project state, while events describe individual operations within that version.

<a name="open-before-and-after"></a>

## 🔍 3. Open before and after

To inspect a selected event, reconstruction starts from a reference commit and replays changes up to that event. [`HistoricalReplay.java`](../../lusiad-backend/src/main/java/com/lusiad/backend/service/restore/HistoricalReplay.java) handles replay. The interface can show PSI, Java code, a Git diff, or UML when available. The before and after states are tied to the selected operation, version, and branch.

<a name="scope"></a>

## 🎯 4. Scope

The data model can identify a change in a Java element apart from a line-based textual difference. Dragging is one way to interact with it. Other editing controls could use the same records. Selective editing of an already committed history event remains a research direction, not a feature shown here.

---

<table width="100%">
<tr>
<td align="left"><a href="architecture.md">⬅️ Previous page</a> | Architecture</td>
<td align="center"><a href="index.md">1️⃣1️⃣ Notable implementation elements</a></td>
<td align="right">Next page ➡️</td>
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

**[💻 Implementation](implementation.md)**

- [🏗️ Architecture](architecture.md)
- [🔍 Notable implementation elements](notable-implementation-elements.md) 👈
