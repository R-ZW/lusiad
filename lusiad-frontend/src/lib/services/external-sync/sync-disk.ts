import { readdir, readFile, lstat, mkdir, rmdir, writeFile, rename, link, unlink } from "node:fs/promises"
import { join } from "node:path"
import { containedPath, relativeContained } from "../contained-paths.ts"
import { EXTERNAL_SYNC_IGNORED_NAMES, type SnapshotEntry } from "./external-sync.model.ts"
import { entry, same, syncFailure, type SyncPlan, type PlanEntry } from "./sync-plan.ts"

export async function readEntry(root: string, path: string, enumerated = false): Promise<SnapshotEntry | null> {
  const target = containedPath(/* turbopackIgnore: true */ root, path)
  // Windows resolves A.java to a.java. Snapshots retain the real spelling so a
  // case-only rename is two distinct logical entries rather than two live files.
  if (process.platform === "win32" && !enumerated) {
    let parent = root
    for (const part of relativeContained(root, target).split("/")) {
      let names: string[]
      try { names = await readdir(/* turbopackIgnore: true */ parent) }
      catch (error) { if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return null; throw error }
      if (!names.includes(part)) return null
      parent = join(/* turbopackIgnore: true */ parent, part)
    }
  }
  let stat
  try { stat = await lstat(/* turbopackIgnore: true */ target) } catch (error) { if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return null; throw error }
  if (stat.isSymbolicLink()) syncFailure("path_not_authorized")
  if (stat.isDirectory()) return entry(path, "directory", null)
  if (stat.isFile()) return entry(path, "file", await readFile(/* turbopackIgnore: true */ target))
  syncFailure("path_not_authorized")
}
export async function snapshotProject(root: string): Promise<Map<string, SnapshotEntry>> {
  const snapshot = new Map<string, SnapshotEntry>()
  async function walk(directory: string): Promise<void> {
    for (const item of await readdir(/* turbopackIgnore: true */ directory, { withFileTypes: true })) {
      if (item.name.startsWith(".") || (EXTERNAL_SYNC_IGNORED_NAMES as readonly string[]).includes(item.name)) continue
      if (item.isSymbolicLink()) syncFailure("path_not_authorized")
      const path = relativeContained(root, join(/* turbopackIgnore: true */ directory, item.name))
      if (path.length > 512) syncFailure("path_not_authorized")
      const value = await readEntry(root, path, true)
      if (!value) syncFailure("sync_revision_conflict")
      snapshot.set(path, value)
      if (value.kind === "directory") await walk(containedPath(/* turbopackIgnore: true */ root, path))
    }
  }
  await walk(root)
  return snapshot
}
function stagingRoot(plan: SyncPlan): string { return containedPath(/* turbopackIgnore: true */ plan.root, `.lusiad-sync-${plan.id}`) }
function backupPath(plan: SyncPlan, index: number): string { return containedPath(/* turbopackIgnore: true */ plan.root, join(/* turbopackIgnore: true */ stagingRoot(plan), `${index}.before`)) }
async function backupExists(plan: SyncPlan, index: number, expected: SnapshotEntry): Promise<boolean> {
  const backup = await readEntry(plan.root, relativeContained(plan.root, backupPath(plan, index)))
  if (backup && !same(backup, expected)) syncFailure("sync_recovery_conflict")
  return !!backup
}
async function saveOriginal(plan: SyncPlan, record: PlanEntry, index: number): Promise<void> {
  if (await backupExists(plan, index, record.before!)) syncFailure("sync_revision_conflict")
  await rename(containedPath(/* turbopackIgnore: true */ plan.root, record.path), backupPath(plan, index))
  // Moving to a private backup captures even a concurrent write. Never discard it.
  if (!await backupExists(plan, index, record.before!)) syncFailure("sync_recovery_conflict")
}
/** Exclusive publication never replaces a file that appeared after its original was reserved. */
export async function applyDiskPlan(plan: SyncPlan): Promise<void> {
  await mkdir(stagingRoot(plan), { recursive: true })
  const ordered = plan.entries.map((value, index) => ({ value, index })).sort((a, b) => b.value.path.split("/").length - a.value.path.split("/").length)
  for (const { value, index } of ordered) {
    if (same(value.before, value.after) || value.before?.kind === value.after?.kind) continue
    const actual = await readEntry(plan.root, value.path)
    if (same(actual, value.after) || !actual) continue
    if (!same(actual, value.before)) syncFailure("sync_revision_conflict")
    if (actual!.kind === "file") await saveOriginal(plan, value, index)
    else await rmdir(containedPath(/* turbopackIgnore: true */ plan.root, value.path)) // Never recurse into unreviewed/ignored children.
  }
  for (const { value } of [...ordered].reverse()) if (value.after?.kind === "directory") {
    const actual = await readEntry(plan.root, value.path)
    if (same(actual, value.after)) continue
    if (actual) syncFailure("sync_revision_conflict")
    await mkdir(containedPath(/* turbopackIgnore: true */ plan.root, value.path))
  }
  for (const { value, index } of ordered) if (value.after?.kind === "file") {
    let actual = await readEntry(plan.root, value.path)
    if (same(actual, value.after)) continue
    if (same(value.before, value.after)) syncFailure("sync_revision_conflict") // Kept bytes changed while reviewing.
    if (actual) {
      if (!same(actual, value.before) || actual.kind !== "file") syncFailure("sync_revision_conflict")
      await saveOriginal(plan, value, index); actual = null
    }
    if (value.before?.kind === "file" && !await backupExists(plan, index, value.before)) syncFailure("sync_recovery_conflict")
    const stage = containedPath(/* turbopackIgnore: true */ plan.root, join(/* turbopackIgnore: true */ stagingRoot(plan), `${index}.after`))
    try { await writeFile(stage, value.after.content!, { flag: "wx" }) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST" || !same(await readEntry(plan.root, relativeContained(plan.root, stage)), value.after)) throw error }
    await link(stage, containedPath(/* turbopackIgnore: true */ plan.root, value.path))
  }
  for (const value of plan.entries) if (!same(await readEntry(plan.root, value.path), value.after)) syncFailure("sync_revision_conflict")
}
/** Undo only known postimages. A third state belongs to the external editor and is preserved. */
export async function compensateDiskPlan(plan: SyncPlan): Promise<void> {
  const reverse: SyncPlan = { ...plan, id: plan.id + "", entries: [] }
  for (const [index, value] of plan.entries.entries()) {
    const actual = await readEntry(plan.root, value.path)
    // Failure between reserving the original and publishing its replacement.
    // Even a backup changed by an editor's open handle must remain recoverable.
    if (!actual && value.before?.kind === "file") {
      const backup = backupPath(plan, index)
      const captured = await readEntry(plan.root, relativeContained(plan.root, backup))
      if (captured) {
        reverse.entries.push({ path: value.path, baseline: value.baseline, before: null, after: { ...captured, path: value.path } })
        continue
      }
    }
    if (!actual && value.before?.kind === "directory") {
      reverse.entries.push({ path: value.path, baseline: value.baseline, before: null, after: value.before })
      continue
    }
    if (same(value.before, value.after) || !same(actual, value.after)) continue
    reverse.entries.push({ path: value.path, baseline: value.baseline, before: value.after, after: value.before })
  }
  // Different staging ID: backups of the forward operation must remain intact.
  reverse.id = plan.id.slice(0, -1) + (plan.id.endsWith("0") ? "1" : "0")
  await applyDiskPlan(reverse)
  await cleanupDiskPlan(reverse)
}
export async function cleanupDiskPlan(plan: SyncPlan): Promise<void> {
  const root = stagingRoot(plan)
  for (let index = 0; index < plan.entries.length; index++) for (const side of ["before", "after"]) {
    const path = containedPath(/* turbopackIgnore: true */ plan.root, join(/* turbopackIgnore: true */ root, `${index}.${side}`))
    const actual = await readEntry(plan.root, relativeContained(plan.root, path))
    const expected = plan.entries[index][side as "before" | "after"]
    if (actual && !same(actual, expected)) syncFailure("sync_recovery_conflict")
    try { await unlink(path) } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
  }
  try { await rmdir(root) } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
}
