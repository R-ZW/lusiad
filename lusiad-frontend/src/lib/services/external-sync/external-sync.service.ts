import "server-only"
import { randomUUID } from "node:crypto"
import { resolve } from "node:path"
import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise"
import { getPool } from "@/lib/repositories/database"
import { findProjectById } from "@/lib/repositories/track-control/track-control.repository"
import { assertTestPath } from "@/lib/config/runtime-config"
import { assertTestGitRepository, createConfiguredGitClient, testGitEnvironment } from "@/lib/config/test-git"
import { withGitRecordingLock } from "../commit-menu/git-recording.service"
import { GitOperation } from "../commit-menu/git-operation"
import { recoverPsiEdits } from "../model-editor/psi-recovery.service"
import { relativeContained } from "../contained-paths"
import { changedEntries, EXTERNAL_SYNC_IGNORED_NAMES, type ChangeKind, type EntryKind, type ExternalSyncChange, type SnapshotEntry } from "./external-sync.model"
import { entry, hash, same, syncFailure, reviewedSnapshot, planEntries, encodePlan, decodePlan, ownSnapshot, type StructuralMutation, type SyncPlan } from "./sync-plan"
import { snapshotProject, applyDiskPlan, compensateDiskPlan, cleanupDiskPlan } from "./sync-disk"
import { bundleMetadata } from "@/lib/models/change-history/change-metadata"
import { readResourceStates, resourceBytes, withinResource } from '../undo/resource-image'

export type { ExternalSyncChange } from "./external-sync.model"
export interface ExternalSyncSnapshot {
  initialized: boolean; needsInitialCommit: boolean; commitRequired: boolean; bundleChangeId: number | null; changes: ExternalSyncChange[]
}
export interface ExternalSyncSelection { path: string; revision: string; keep: boolean }
export interface PendingExternalContent { path: string; type: ChangeKind; entryKind: EntryKind; beforeContent: Buffer | null; afterContent: Buffer | null }
interface State extends RowDataPacket { pending_bundle_change_id: number | null; valid_bundle?: number | null }
interface BundleFileRow extends RowDataPacket { path: string; kind: ChangeKind; before_kind: EntryKind | null; after_kind: EntryKind | null; before_content: Buffer | null; after_content: Buffer | null }
interface Receipt extends RowDataPacket { project_id: number; state: "prepared" | "applied" | "aborted"; payload: unknown }

async function projectRoot(projectId: number): Promise<string> {
  const project = await findProjectById(projectId)
  if (!project) syncFailure("invalid_request")
  assertTestPath(project.path, "projects", false)
  return resolve(project.path)
}
async function loadState(projectId: number, db: PoolConnection): Promise<State | null> {
  const [rows] = await db.query<State[]>(`SELECT sp.pending_bundle_change_id,c.id AS valid_bundle FROM external_sync_projects sp
    LEFT JOIN changes c ON c.id=sp.pending_bundle_change_id AND c.project_id=sp.project_id AND c.commit_id IS NULL AND c.change_type='external_bundle'
    WHERE sp.project_id=?`, [projectId])
  const state = rows[0] ?? null
  if (state?.pending_bundle_change_id != null && state.valid_bundle == null) syncFailure("sync_recovery_conflict")
  return state
}
async function loadBaseline(projectId: number, db: PoolConnection): Promise<Map<string, SnapshotEntry>> {
  const [rows] = await db.query<Array<RowDataPacket & SnapshotEntry>>("SELECT path,kind,content,sha256 FROM external_sync_files WHERE project_id=?", [projectId])
  return new Map(rows.map(row => [row.path, { path: row.path, kind: row.kind, content: row.content, sha256: row.sha256 }]))
}
async function storeEntry(projectId: number, path: string, value: SnapshotEntry | null, db: PoolConnection): Promise<void> {
  if (!value) { await db.execute("DELETE FROM external_sync_files WHERE project_id=? AND path=?", [projectId, path]); return }
  await db.execute(`INSERT INTO external_sync_files(project_id,path,kind,content,sha256) VALUES(?,?,?,?,?)
    ON DUPLICATE KEY UPDATE kind=VALUES(kind),content=VALUES(content),sha256=VALUES(sha256)`, [projectId, path, value.kind, value.content, value.sha256])
}

/** Bootstrap from recorded content, never silently adopt the first arbitrary disk scan. */
async function recordedBaseline(projectId: number, root: string, sha: string, db: PoolConnection): Promise<Map<string, SnapshotEntry>> {
  const git = new GitOperation(root, testGitEnvironment())
  const disk = await snapshotProject(root)
  let baseline = new Map<string, SnapshotEntry>()
  for (const line of (await git.git(["ls-tree", "-r", "-t", "-z", sha])).split("\0").filter(Boolean)) {
    const match = /^(040000|100644|100755) (?:tree|blob) [a-f0-9]+\t(.+)$/.exec(line)
    if (!match) syncFailure("sync_baseline_unavailable")
    const path = relativeContained(root, match[2])
    if (path.split("/").some(part => part.startsWith(".") || (EXTERNAL_SYNC_IGNORED_NAMES as readonly string[]).includes(part))) continue
    const recorded = entry(path, match[1] === "040000" ? "directory" : "file", match[1] === "040000" ? null : await git.bytes(["cat-file", "--filters", `${sha}:${path}`]))
    const actual = disk.get(path)
    // A commit does not rewrite working-tree LF/CRLF. Adopt those exact bytes only
    // after proving their Git object is the recorded one, never merely because they exist.
    const object = line.slice(0, line.indexOf("\t")).split(" ").at(-1)
    baseline.set(path, actual?.kind === "file" && recorded.kind === "file" && await git.contentObject(path, actual.content!) === object ? actual : recorded)
  }
  const [events] = await db.query<Array<RowDataPacket & { id: number; change_type: string; req_body: unknown }>>("SELECT id,change_type,req_body FROM changes WHERE project_id=? AND commit_id IS NULL ORDER BY id", [projectId])
  for (const event of events) {
    const body = typeof event.req_body === "string" ? JSON.parse(event.req_body) : event.req_body
    const b = body as Record<string, unknown>
    const images = readResourceStates(b)
    if (images) {
      for (const parent of images.after.roots) for (const path of [...baseline.keys()]) if (withinResource(path, parent)) baseline.delete(path)
      for (const [path, item] of Object.entries(images.after.entries)) {
        if (path.split('/').some(part => part.startsWith('.') || (EXTERNAL_SYNC_IGNORED_NAMES as readonly string[]).includes(part))) continue
        baseline.set(path, entry(path, item.kind, item.kind === 'file' ? resourceBytes(item) : null))
      }
    } else if (b?.recordVersion === 2 && typeof b.path === "string" && typeof b.afterText === "string") {
      if (b.afterHash !== hash(Buffer.from(b.afterText))) syncFailure("sync_baseline_unavailable")
      const path = relativeContained(root, b.path); baseline.set(path, entry(path, "file", Buffer.from(b.afterText)))
    } else if (/^(?:file|dir)_(?:create|delete|rename|move)$/.test(event.change_type)) {
      const [kind, action] = event.change_type.split("_")
      const { join, dirname, basename } = await import("node:path")
      const path = relativeContained(root, String(b.path ?? b.sourcePath ?? ""), action === "create")
      const name = typeof (b.newName ?? b.name) === "string" ? String(b.newName ?? b.name) : ""
      const destination = action === "create" ? relativeContained(root, join(path, name)) : action === "rename" ? relativeContained(root, join(dirname(path), name))
        : action === "move" ? relativeContained(root, join(String(b.destPath ?? ""), basename(path))) : undefined
      baseline = ownSnapshot(baseline, { kind: kind === "file" ? "file" : "directory", source: action === "create" ? undefined : path, destination, content: typeof b.content === "string" ? b.content : "" })
    } else if (event.change_type === "external_bundle") {
      // Old installations can already have a pending bundle when the baseline
      // is first initialized. Its recorded bytes, not today's disk, are authoritative.
      const [files] = await db.query<BundleFileRow[]>(`SELECT bf.* FROM external_sync_bundle_files bf JOIN changes c ON c.id=bf.change_id
        WHERE c.project_id=? AND c.id=? AND c.commit_id IS NULL AND c.change_type='external_bundle' ORDER BY bf.path`, [projectId, event.id])
      for (const file of files) {
        const path = relativeContained(root, file.path)
        if (file.after_kind) baseline.set(path, entry(path, file.after_kind, file.after_content))
        else baseline.delete(path)
      }
    } else syncFailure("sync_baseline_unavailable")
  }
  return baseline
}
async function scanLocked(projectId: number, db: PoolConnection, initialize: boolean): Promise<ExternalSyncSnapshot> {
  const root = await projectRoot(projectId)
  let state = await loadState(projectId, db)
  if (!state) {
    await assertTestGitRepository(root)
    const git = createConfiguredGitClient(root)
    const hasHead = await git.revparse(["--verify", "HEAD"]).then(value => value.trim()).catch(() => null)
    if (!hasHead) return { initialized: false, needsInitialCommit: true, commitRequired: false, bundleChangeId: null, changes: [] }
    if (!initialize) return { initialized: false, needsInitialCommit: false, commitRequired: false, bundleChangeId: null, changes: [] }
    const [recorded] = await db.query<Array<RowDataPacket & { git_id: string }>>(`SELECT c.git_id FROM commits c JOIN branches b ON b.id=c.branch_id
      WHERE b.project_id=? AND b.selected='1' ORDER BY c.id DESC LIMIT 1`, [projectId])
    if (!recorded[0]?.git_id) syncFailure("sync_baseline_unavailable")
    const baseline = await recordedBaseline(projectId, root, recorded[0].git_id, db)
    const [bundles] = await db.query<Array<RowDataPacket & { id: number }>>("SELECT id FROM changes WHERE project_id=? AND commit_id IS NULL AND change_type='external_bundle'", [projectId])
    if (bundles.length > 1) syncFailure("sync_recovery_conflict")
    const pendingBundle = bundles[0]?.id ?? null
    await db.beginTransaction()
    try {
      await db.execute("INSERT INTO external_sync_projects(project_id,initialized_at,pending_bundle_change_id) VALUES(?,NOW(),?)", [projectId, pendingBundle])
      for (const [path, value] of baseline) await storeEntry(projectId, path, value, db)
      await db.commit()
    } catch (error) { await db.rollback(); throw error }
    state = { pending_bundle_change_id: pendingBundle } as State
  }
  return {
    initialized: true,
    needsInitialCommit: false,
    commitRequired: state.pending_bundle_change_id !== null,
    bundleChangeId: state.pending_bundle_change_id,
    changes: changedEntries(await loadBaseline(projectId, db), await snapshotProject(root))
  }
}

async function receipt(id: string, db: PoolConnection): Promise<Receipt | null> {
  const [rows] = await db.query<Receipt[]>("SELECT project_id,state,payload FROM lusiad_sync_operations WHERE operation_id=?", [id])
  return rows[0] ?? null
}
async function finishPlan(plan: SyncPlan, db: PoolConnection): Promise<void> {
  await applyDiskPlan(plan)
  await db.beginTransaction()
  try {
    const saved = await receipt(plan.id, db)
    if (saved?.state === "applied") { await db.commit(); return }
    if (saved?.state !== "prepared") syncFailure("sync_recovery_conflict")
    const state = await loadState(plan.projectId, db), baseline = await loadBaseline(plan.projectId, db)
    if (!state || state.pending_bundle_change_id !== plan.bundleId || plan.entries.some(e => !same(baseline.get(e.path), e.baseline))) syncFailure("sync_recovery_conflict")
    const accepted = plan.entries.filter(e => !same(e.baseline, e.after))
    let bundleId = plan.bundleId
    if (plan.kind === "discard") {
      await db.execute("UPDATE external_sync_projects SET pending_bundle_change_id=NULL WHERE project_id=?", [plan.projectId])
      await db.execute("DELETE FROM changes WHERE id=? AND project_id=? AND commit_id IS NULL", [bundleId, plan.projectId])
      bundleId = null
    } else if (accepted.length) {
      if (bundleId === null) {
        const [branches] = await db.query<Array<RowDataPacket & { id: number }>>("SELECT id FROM branches WHERE project_id=? AND selected='1'", [plan.projectId])
        if (branches.length !== 1) syncFailure("sync_recovery_conflict")
        const [result] = await db.execute<ResultSetHeader>(`INSERT INTO changes(commit_id,project_id,branch_id,summary,description,date_time,change_type,scope,req_body)
          VALUES(NULL,?,?,'External changes','',NOW(),'external_bundle','project',JSON_OBJECT('paths',JSON_ARRAY()))`, [plan.projectId, branches[0].id])
        bundleId = result.insertId
      }
      for (const value of accepted) {
        await db.execute(`INSERT INTO external_sync_bundle_files(change_id,path,kind,before_kind,after_kind,before_content,after_content) VALUES(?,?,?,?,?,?,?)
          ON DUPLICATE KEY UPDATE after_kind=VALUES(after_kind),after_content=VALUES(after_content),
          kind=CASE WHEN before_kind IS NULL THEN 'added' WHEN VALUES(after_kind) IS NULL THEN 'deleted' ELSE 'modified' END`,
          [bundleId, value.path, !value.baseline ? "added" : !value.after ? "deleted" : "modified", value.baseline?.kind ?? null, value.after?.kind ?? null, value.baseline?.content ?? null, value.after?.content ?? null])
      }
      await db.execute("DELETE FROM external_sync_bundle_files WHERE change_id=? AND (before_kind <=> after_kind) AND (before_content <=> after_content)", [bundleId])
      const [files] = await db.query<BundleFileRow[]>("SELECT path,kind,before_kind,after_kind FROM external_sync_bundle_files WHERE change_id=? ORDER BY path", [bundleId])
      if (files.length) await db.execute("UPDATE changes SET req_body=? WHERE id=? AND project_id=? AND commit_id IS NULL", [JSON.stringify({ source: "external", paths: files.map(f => f.path),
        changeMetadata: bundleMetadata(files.map(f => ({ path: f.path, kind: f.kind, beforeKind: f.before_kind, afterKind: f.after_kind }))) }), bundleId, plan.projectId])
      else { await db.execute("DELETE FROM changes WHERE id=? AND project_id=? AND commit_id IS NULL", [bundleId, plan.projectId]); bundleId = null }
    }
    for (const value of accepted) await storeEntry(plan.projectId, value.path, value.after, db)
    await db.execute("UPDATE external_sync_projects SET pending_bundle_change_id=? WHERE project_id=?", [bundleId, plan.projectId])
    await db.execute("UPDATE lusiad_sync_operations SET state='applied' WHERE operation_id=?", [plan.id])
    await db.commit()
  } catch (error) { await db.rollback().catch(() => { }); throw error }
  // A cleanup failure cannot undo a confirmed SQL transaction. Backups remain private.
  await cleanupDiskPlan(plan).catch(() => { })
}
async function runPlan(plan: SyncPlan, db: PoolConnection): Promise<void> {
  try { await finishPlan(plan, db) }
  catch (error) {
    // A lost COMMIT acknowledgement is not proof of rollback. Never compensate blindly.
    const saved = await receipt(plan.id, db).catch(() => syncFailure("sync_operation_pending"))
    if (saved?.state === "applied") return
    try {
      await compensateDiskPlan(plan)
      await db.execute("UPDATE lusiad_sync_operations SET state='aborted' WHERE operation_id=? AND state='prepared'", [plan.id])
      await cleanupDiskPlan(plan).catch(() => { })
    } catch { syncFailure("sync_operation_pending") }
    throw error
  }
}
async function recoverPlans(projectId: number, root: string, db: PoolConnection): Promise<void> {
  const [rows] = await db.query<Array<RowDataPacket & { operation_id: string; payload: unknown }>>("SELECT operation_id,payload FROM lusiad_sync_operations WHERE project_id=? AND state='prepared' ORDER BY created_at,operation_id", [projectId])
  for (const row of rows) {
    const plan = decodePlan(row.payload, projectId, root)
    if (plan.id !== row.operation_id) syncFailure("sync_recovery_conflict")
    await runPlan(plan, db)
  }
}
export async function withExternalSyncLock<T>(projectId: number, operation: (db: PoolConnection) => Promise<T>, holdEditLock = true): Promise<T> {
  const db = await getPool().getConnection(), lock = `lusiad:external-sync:${projectId}`
  try {
    const [rows] = await db.query<Array<RowDataPacket & { acquired: number }>>("SELECT GET_LOCK(?,10) AS acquired", [lock])
    if (Number(rows[0]?.acquired) !== 1) syncFailure("operation_busy")
    // Java takes the edit lock itself. Do not hold it across this HTTP call.
    await recoverPsiEdits(projectId)
    const root = await projectRoot(projectId)
    if (holdEditLock) return await withGitRecordingLock(db, projectId, root, async () => { await recoverPlans(projectId, root, db); return operation(db) })
    await withGitRecordingLock(db, projectId, root, () => recoverPlans(projectId, root, db))
    return await operation(db)
  } finally { try { await db.query("SELECT RELEASE_LOCK(?)", [lock]).catch(() => { }) } finally { db.release() } }
}
export async function scanExternalChanges(projectId: number): Promise<ExternalSyncSnapshot> {
  return withExternalSyncLock(projectId, db => scanLocked(projectId, db, true))
}
async function existingOperation(id: string, projectId: number, kind: SyncPlan["kind"], requestHash: string, db: PoolConnection): Promise<boolean> {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id)) syncFailure("invalid_request")
  const saved = await receipt(id, db)
  if (!saved) return false
  if (saved.project_id !== projectId || saved.state !== "applied") syncFailure("sync_revision_conflict")
  const previous = decodePlan(saved.payload, projectId, await projectRoot(projectId))
  if (previous.kind !== kind || previous.requestHash !== requestHash) syncFailure("sync_revision_conflict")
  return true
}
async function prepareAndRun(plan: SyncPlan, db: PoolConnection): Promise<void> {
  await db.execute("INSERT INTO lusiad_sync_operations(operation_id,project_id,state,payload) VALUES(?,?,'prepared',?)", [plan.id, plan.projectId, encodePlan(plan)])
  await runPlan(plan, db)
}
export async function reviewExternalChanges(projectId: number, selections: ExternalSyncSelection[], operationId: string = randomUUID()): Promise<ExternalSyncSnapshot> {
  return withExternalSyncLock(projectId, async db => {
    const requestHash = hash(Buffer.from(JSON.stringify([...selections].sort((a, b) => a.path.localeCompare(b.path)).map(s => [s.path, s.revision, s.keep]))))
    if (await existingOperation(operationId, projectId, "review", requestHash, db)) return scanLocked(projectId, db, false)
    const root = await projectRoot(projectId), state = await loadState(projectId, db)
    if (!state) syncFailure("sync_baseline_unavailable")
    const baseline = await loadBaseline(projectId, db), current = await snapshotProject(root)
    const desired = reviewedSnapshot(baseline, current, selections)
    await prepareAndRun({ version: 1, id: operationId, projectId, root, kind: "review", requestHash, undoBoundary: selections.some(selection => selection.keep), bundleId: state.pending_bundle_change_id, entries: planEntries(baseline, current, desired) }, db)
    return scanLocked(projectId, db, false)
  })
}
export async function discardAcceptedBundle(projectId: number, operationId: string = randomUUID(), expectedBundleId?: number): Promise<ExternalSyncSnapshot> {
  return withExternalSyncLock(projectId, async db => {
    const requestHash = hash(Buffer.from(JSON.stringify(expectedBundleId ?? null)))
    if (await existingOperation(operationId, projectId, "discard", requestHash, db)) return scanLocked(projectId, db, false)
    const root = await projectRoot(projectId), state = await loadState(projectId, db), bundleId = state?.pending_bundle_change_id
    if (expectedBundleId !== undefined && expectedBundleId !== bundleId) syncFailure("sync_revision_conflict")
    if (bundleId == null) return scanLocked(projectId, db, false)
    const [files] = await db.query<BundleFileRow[]>("SELECT path,kind,before_kind,after_kind,before_content,after_content FROM external_sync_bundle_files WHERE change_id=?", [bundleId])
    const baseline = await loadBaseline(projectId, db), current = await snapshotProject(root), desired = new Map(current)
    // Validate the exact snapshot used by cancellation. An earlier scan would
    // leave a gap in which a newly arrived file could be silently acknowledged.
    if (changedEntries(baseline, current, true).length) syncFailure("sync_revision_conflict")
    for (const file of files) {
      if (!file.before_kind) desired.delete(file.path)
      else desired.set(file.path, entry(file.path, file.before_kind, file.before_content))
    }
    await prepareAndRun({ version: 1, id: operationId, projectId, root, kind: "discard", requestHash, bundleId, entries: planEntries(baseline, current, desired) }, db)
    return scanLocked(projectId, db, false)
  })
}
export async function withLusiadMutation<T>(projectId: number, paths: string[], action: () => Promise<T>, structural?: StructuralMutation): Promise<T> {
  return withExternalSyncLock(projectId, async db => {
    const scanned = await scanLocked(projectId, db, true)
    if (scanned.commitRequired || scanned.changes.length) syncFailure("sync_review_required")
    const root = await projectRoot(projectId)
    paths.forEach(path => relativeContained(root, path))
    const baseline = scanned.initialized ? await loadBaseline(projectId, db) : new Map<string, SnapshotEntry>()
    const expected = structural ? ownSnapshot(baseline, { ...structural, source: structural.source ? relativeContained(root, structural.source) : undefined, destination: structural.destination ? relativeContained(root, structural.destination) : undefined }) : null
    const response = await action(), result = response as { status?: string; error?: string; noOp?: boolean; recordVersion?: number }
    // PSI acknowledgements already update the baseline atomically with their event in Java.
    if (!expected || !scanned.initialized || result.recordVersion === 3 || result.noOp || result.error || (result.status && result.status !== "ok")) return response
    await db.beginTransaction()
    try {
      for (const path of new Set([...baseline.keys(), ...expected.keys()])) if (!same(baseline.get(path), expected.get(path))) await storeEntry(projectId, path, expected.get(path) ?? null, db)
      await db.commit()
    } catch { await db.rollback().catch(() => { }); syncFailure("sync_operation_pending") }
    return response
  }, false)
}
export async function loadPendingExternalContent(projectId: number, path: string, revision: string): Promise<PendingExternalContent> {
  return withExternalSyncLock(projectId, async db => {
    const root = await projectRoot(projectId), baseline = await loadBaseline(projectId, db), current = await snapshotProject(root)
    const change = changedEntries(baseline, current).find(item => item.path === path && item.revision === revision)
    if (!change) syncFailure("sync_revision_conflict")
    return { path, type: change.type, entryKind: change.entryKind, beforeContent: baseline.get(path)?.content ?? null, afterContent: current.get(path)?.content ?? null }
  })
}
export async function assertExternalBundleReady(projectId: number, db: PoolConnection): Promise<number | null> {
  const scanned = await scanLocked(projectId, db, false)
  if (scanned.changes.length) syncFailure("sync_review_required")
  return scanned.bundleChangeId
}
export async function markExternalBundleCommitted(projectId: number, db: PoolConnection): Promise<void> {
  await db.execute("UPDATE external_sync_projects SET pending_bundle_change_id=NULL WHERE project_id=?", [projectId])
}
export async function loadExternalBundleFiles(projectId: number, changeId: number): Promise<BundleFileRow[]> {
  const [rows] = await getPool().query<BundleFileRow[]>(`SELECT bf.path,bf.kind,bf.before_kind,bf.after_kind,bf.before_content,bf.after_content FROM external_sync_bundle_files bf
    JOIN changes ch ON ch.id=bf.change_id WHERE ch.id=? AND ch.project_id=? AND ch.change_type='external_bundle' ORDER BY bf.path`, [changeId, projectId])
  return rows
}
