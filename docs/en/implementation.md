# Change-tracking implementation

## On this page

- [Move a method](#move-a-method)
- [Record a version](#record-a-version)
- [Open before and after](#open-before-and-after)
- [Scope](#scope)

## Move a method

Consider a class where `encerrar()` appears after `iniciar()`. The user selects `encerrar()` in the model and moves it before `iniciar()`. The plugin API receives the operation, locates Java elements through PSI, and updates the source file. The source on disk now reflects the new order.

The persisted event contains a `change_type` such as `move`, scope, project and branch references, and a `req_body`. In the recent source revision, `req_body.changeMetadata` describes the action, element type, and `before` and `after` sides. Each side may identify a path, range, kind, name, and structural context. These are display facts. The operation body and resource images support recovery. [`ChangeMetadata.java`](../../lusiad-backend/src/main/java/com/lusiad/backend/service/change/ChangeMetadata.java) explicitly describes presentation facts independent of replay. [`ChangeLogService.java`](../../lusiad-backend/src/main/java/com/lusiad/backend/service/change/ChangeLogService.java) creates the entry, and [`ChangeRepository.java`](../../lusiad-backend/src/main/java/com/lusiad/backend/repository/change/ChangeRepository.java) persists it in MySQL.

The exact fields depend on the record version. The [evaluation scenario](../../evaluation/scenario/README.md) includes a prepared method move.

## Record a version

The user creates a commit through the interface. The frontend coordinates the project's Git repository and pending MySQL events. [`git-recording.service.ts`](../../lusiad-frontend/src/lib/services/commit-menu/git-recording.service.ts) freezes the intent, checks events, and associates the Git commit with their records. A commit consolidates a project state, while events describe individual operations within that version.

## Open before and after

To inspect a selected event, reconstruction starts from a reference commit and replays changes up to that event. [`HistoricalReplay.java`](../../lusiad-backend/src/main/java/com/lusiad/backend/service/restore/HistoricalReplay.java) handles replay. The interface can show PSI, Java code, a Git diff, or UML when available. The before and after states are tied to the selected operation, version, and branch.

## Scope

The data model can identify a change in a Java element apart from a line-based textual difference. Dragging is one way to interact with it. Other editing controls could use the same records. Selective editing of an already committed history event remains a research direction, not a feature shown here.

---

[← Architecture](architecture.md) · [Index](index.md) · [Prototyping →](prototyping.md) · [Português](../pt-BR/implementacao.md)
