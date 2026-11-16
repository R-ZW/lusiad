import { BackendApiError } from "./backend-response.ts"
import { mkdir, mkdtemp, rename, rm, lstat } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { join, parse, resolve } from "node:path"
import { assertContainedTree, containedPath, relativeContained } from "./contained-paths.ts"

const id = "[a-f0-9-]{36}"
const snapshot = "(?:archive|working-copy|working-copy-prev)"
const allowed = new RegExp(`^(?:${snapshot}|comparisons/compare-${id}(?:/${snapshot})?|\\.lusiad-(?:stage|backup)-${id}|lusiad-line-counts-[a-zA-Z0-9_-]+)$`)

/** Callers supply the configured root (or SQL-pinned project temp), never a browser path. */
export function temporaryEntry(root: string, value: string): string {
  const base = resolve(root)
  if (parse(base).root === base) throw new Error("Temporary root cannot be a filesystem root")
  const name = relativeContained(root, value)
  if (!allowed.test(name)) throw new Error("Not an authorized temporary entry")
  return containedPath(root, name)
}

export async function removeTemporaryEntry(root: string, value: string): Promise<void> {
  const target = temporaryEntry(root, value)
  assertContainedTree(target)
  await rm(target, { recursive: true, force: true })
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error }
}

/** Stage all Git/tar I/O before replacing the old snapshot. No destructive reset on preparation failure. */
async function replaceTemporaryDirectoryUnchecked(root: string, value: string, prepare: (directory: string) => Promise<void>,
  move: typeof rename = rename): Promise<void> {
  const relative = relativeContained(root, value)
  if (!new RegExp(`^(?:comparisons/compare-${id}/)?${snapshot}$`).test(relative)) throw new Error("Invalid snapshot destination")
  const destination = temporaryEntry(root, relative)
  assertContainedTree(destination)
  await mkdir(root, { recursive: true })
  const workspace = temporaryEntry(root, `.lusiad-stage-${randomUUID()}`)
  const backup = temporaryEntry(root, `.lusiad-backup-${randomUUID()}`)
  const stage = join(workspace, "tree")
  try {
    await mkdir(stage, { recursive: true })
    await prepare(stage)
    assertContainedTree(workspace)
    temporaryEntry(root, relative) // Recheck after async Git/tar I/O.
    await mkdir(join(destination, ".."), { recursive: true })
    const saved = await exists(destination)
    if (saved) await move(destination, backup)
    try { await move(stage, destination) }
    catch (error) {
      if (saved) {
        try { await move(backup, destination) }
        catch (recovery) { throw new Error(`Snapshot publication failed; previous snapshot retained at ${backup}`, { cause: recovery }) }
      }
      throw error
    }
    if (saved) await removeTemporaryEntry(root, backup)
  } finally {
    // A failed rollback deliberately retains the backup, with its path in the error.
    await removeTemporaryEntry(root, workspace)
  }
}

export async function replaceTemporaryDirectory(root: string, value: string, prepare: (directory: string) => Promise<void>,
  move: typeof rename = rename): Promise<void> {
  try { await replaceTemporaryDirectoryUnchecked(root, value, prepare, move) }
  catch (error) {
    if (error instanceof BackendApiError) throw error
    throw new BackendApiError("Snapshot", error instanceof Error ? error.message : "Snapshot operation failed", "operation_failed", 422)
  }
}

export async function createLineDiffWorkspace(root: string): Promise<string> {
  await mkdir(root, { recursive: true })
  return temporaryEntry(root, await mkdtemp(join(root, "lusiad-line-counts-")))
}
