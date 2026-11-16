import { createHash } from "node:crypto"
import { changedEntries, type SnapshotEntry } from "./external-sync.model.ts"
import { BackendApiError } from "../backend-response.ts"

export function syncFailure(code: string): never { throw new BackendApiError("Synchronization", code, code, 409) }
export const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")
export function same(a?: SnapshotEntry | null, b?: SnapshotEntry | null): boolean {
  return (a?.kind ?? null) === (b?.kind ?? null) && (a?.sha256 ?? null) === (b?.sha256 ?? null)
}
export function entry(path: string, kind: "file" | "directory", content: Buffer | null): SnapshotEntry {
  return { path, kind, content: kind === "file" ? content ?? Buffer.alloc(0) : null, sha256: hash(content ?? Buffer.alloc(0)) }
}
export interface Choice { path: string; revision: string; keep: boolean }
export interface PlanEntry { path: string; baseline: SnapshotEntry | null; before: SnapshotEntry | null; after: SnapshotEntry | null }
export interface SyncPlan {
  version: 1; id: string; projectId: number; root: string; kind: "review" | "discard"; bundleId: number | null
  entries: PlanEntry[]
  undoBoundary?: boolean
  requestHash?: string
}

/** Choices operate on a complete revision, including empty directories and type changes. */
export function reviewedSnapshot(baseline: Map<string, SnapshotEntry>, current: Map<string, SnapshotEntry>, choices: Choice[]): Map<string, SnapshotEntry> {
  const visible = changedEntries(baseline, current)
  const decisions = new Map(choices.map(choice => [choice.path, choice]))
  if (decisions.size !== choices.length || decisions.size !== visible.length || visible.some(change => {
    const choice = decisions.get(change.path)
    return choice?.revision !== change.revision || typeof choice.keep !== "boolean"
  })) syncFailure("sync_revision_conflict")
  const desired = new Map(baseline)
  for (const change of visible) {
    if (!decisions.get(change.path)!.keep) continue
    const after = current.get(change.path)
    if (after) desired.set(change.path, after); else desired.delete(change.path)
  }
  // Implicit parent decisions follow retained children, rather than checkbox order.
  for (const [path, old] of baseline) {
    if (old.kind === "directory" && !decisions.has(path) && current.get(path)?.kind !== "directory"
      && ![...desired.keys()].some(child => child.startsWith(path + "/"))) desired.delete(path)
  }
  for (const path of [...desired.keys()]) {
    let parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ""
    while (parent) {
      if (desired.get(parent)?.kind !== "directory") {
        const directory = current.get(parent) ?? baseline.get(parent)
        if (decisions.has(parent) || directory?.kind !== "directory") syncFailure("sync_selection_conflict")
        desired.set(parent, directory)
      }
      parent = parent.includes("/") ? parent.slice(0, parent.lastIndexOf("/")) : ""
    }
  }
  if (process.platform === "win32" && new Set([...desired.keys()].map(path => path.toLowerCase())).size !== desired.size)
    syncFailure("sync_selection_conflict")
  return desired
}

export function planEntries(baseline: Map<string, SnapshotEntry>, before: Map<string, SnapshotEntry>, after: Map<string, SnapshotEntry>): PlanEntry[] {
  return [...new Set([...baseline.keys(), ...before.keys(), ...after.keys()])].filter(path =>
    !same(baseline.get(path), after.get(path)) || !same(before.get(path), after.get(path)))
    .sort().map(path => ({ path, baseline: baseline.get(path) ?? null, before: before.get(path) ?? null, after: after.get(path) ?? null }))
}
export function encodePlan(plan: SyncPlan): string {
  return JSON.stringify(plan, (_key, value) => value?.type === "Buffer" ? { bytes: Buffer.from(value.data).toString("base64") } : value)
}
export function decodePlan(value: unknown, projectId: number, root: string): SyncPlan {
  const plan = JSON.parse(typeof value === "string" ? value : JSON.stringify(value), (_key, item) =>
    item && typeof item.bytes === "string" ? Buffer.from(item.bytes, "base64") : item) as SyncPlan
  if (plan.version !== 1 || plan.projectId !== projectId || plan.root !== root || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(plan.id)
    || (plan.bundleId !== null && (!Number.isSafeInteger(plan.bundleId) || plan.bundleId <= 0))
    || !["review", "discard"].includes(plan.kind) || !Array.isArray(plan.entries)) syncFailure("sync_recovery_conflict")
  const paths = new Set<string>()
  for (const record of plan.entries) {
    if (!record.path || paths.has(record.path) || record.path.split("/").some(part => !part || part.startsWith(".") || part === "..")) syncFailure("sync_recovery_conflict")
    paths.add(record.path)
    for (const side of [record.baseline, record.before, record.after]) if (side &&
      (side.path !== record.path || !["file", "directory"].includes(side.kind) || (side.kind === "file" && !Buffer.isBuffer(side.content)) || (side.kind === "directory" && side.content !== null)
        || side.sha256 !== hash(side.content ?? Buffer.alloc(0)))) syncFailure("sync_recovery_conflict")
  }
  return plan
}

export interface StructuralMutation { kind: "file" | "directory"; source?: string; destination?: string; content?: string }
/** Acknowledge the intended own result, never a later re-read that may contain external bytes. */
export function ownSnapshot(before: Map<string, SnapshotEntry>, mutation: StructuralMutation): Map<string, SnapshotEntry> {
  const result = new Map(before)
  if (mutation.source === mutation.destination) return result
  if (mutation.source) for (const [path, item] of before) {
    if (path !== mutation.source && !path.startsWith(mutation.source + "/")) continue
    result.delete(path)
    if (mutation.destination) {
      const target = mutation.destination + path.slice(mutation.source.length)
      result.set(target, { ...item, path: target })
    }
  }
  else if (mutation.destination) result.set(mutation.destination, entry(mutation.destination, mutation.kind, mutation.kind === "file" ? Buffer.from(mutation.content ?? "") : null))
  return result
}
