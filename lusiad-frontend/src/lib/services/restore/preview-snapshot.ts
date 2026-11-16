import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { containedPath } from "../contained-paths.ts"
import { removeTemporaryEntry } from "../temporary-files.ts"
import { findPendingRestoreContext } from "@/lib/repositories/restore/restore.repository"
import { GitOperation } from "../commit-menu/git-operation"
import { testGitEnvironment } from "@/lib/config/test-git"

export interface PreviewIdentity {
  snapshotId: string
  projectId: number
  changeId: number
  commitId: number
  changeType: string
  reqBody: unknown
  pending?: { branchId: number; gitId: string; revision: string }
}

export function previewRoot(temp: string, id: string): string {
  if (!/^compare-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id)) throw new Error("Invalid preview id")
  return containedPath(temp, `comparisons/${id}`)
}

export async function createPreview<T>(temp: string, action: (id: string, root: string) => Promise<T>): Promise<T> {
  const id = `compare-${randomUUID()}`
  const root = previewRoot(temp, id)
  await mkdir(containedPath(temp, "comparisons"), { recursive: true })
  await mkdir(root) // This request alone owns this directory, even before it is ready.
  try {
    return await action(id, root)
  } catch (error) {
    await removeTemporaryEntry(temp, root).catch(() => {})
    throw error
  }
}

export async function markPreviewReady(temp: string, identity: PreviewIdentity): Promise<void> {
  const root = previewRoot(temp, identity.snapshotId)
  await writeFile(containedPath(root, ".lusiad-preview.json"), JSON.stringify(identity), { flag: "wx" })
}

export async function readReadyPreview(temp: string, id: string, projectId: number, changeId?: number, checkCurrent = true): Promise<PreviewIdentity> {
  const value = JSON.parse(await readFile(containedPath(previewRoot(temp, id), ".lusiad-preview.json"), "utf8"))
  if (value?.snapshotId !== id || value.projectId !== projectId || !Number.isSafeInteger(value.changeId) || !Number.isSafeInteger(value.commitId)
    || (changeId !== undefined && value.changeId !== changeId) || typeof value.changeType !== "string") throw new Error("Preview identity mismatch")
  if (checkCurrent && value.pending) {
    const current = await findPendingRestoreContext(projectId, value.changeId)
    const currentBody = current && typeof current.reqBody === "string" ? JSON.parse(current.reqBody) : current?.reqBody
    if (!current || current.tempPath !== temp || current.branchId !== value.pending.branchId
      || current.currentGitId !== value.pending.gitId || current.pendingRevision !== value.pending.revision
      || JSON.stringify(currentBody) !== JSON.stringify(value.reqBody)) throw new Error("Prévia pendente desatualizada; abra a mudança novamente")
    const git = new GitOperation(current.projectPath, testGitEnvironment())
    const [branch, head] = await Promise.all([
      git.git(["symbolic-ref", "--quiet", "--short", "HEAD"]),
      git.git(["rev-parse", "--verify", "HEAD"]),
    ])
    if (branch.trim() !== current.branchName || head.trim() !== current.currentGitId)
      throw new Error("Prévia pendente desatualizada; abra a mudança novamente")
  }
  return value
}

export async function releasePreview(temp: string, id: string, projectId: number): Promise<void> {
  await readReadyPreview(temp, id, projectId, undefined, false)
  await removeTemporaryEntry(temp, previewRoot(temp, id))
}
