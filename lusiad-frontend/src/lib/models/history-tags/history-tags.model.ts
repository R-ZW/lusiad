export type HistoryTagTargetKind = "commit" | "change"
export interface HistoryTagTarget { kind: HistoryTagTargetKind; id: number }
export interface HistoryTag {
  id: number
  name: string
  targetKind: HistoryTagTargetKind
  targetId: number
  commitId: number | null
  targetTitle: string
  branchName: string | null
  timestamp: string
  changeType: string | null
}
export interface HistoryTagsSnapshot { available: boolean; tags: HistoryTag[] }
export type HistoryTagErrorCode = "invalidName" | "invalidTarget" | "duplicate" | "notFound" | "migrationRequired" | "unavailable"
export type HistoryTagMutationResult = { ok: true } | { ok: false; code: HistoryTagErrorCode }

export class HistoryTagError extends Error {
  code: HistoryTagErrorCode
  constructor(code: HistoryTagErrorCode) { super(code); this.code = code }
}

export function positiveHistoryId(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new HistoryTagError("invalidTarget")
  return value
}

export function normalizeHistoryTagTarget(target: HistoryTagTarget): HistoryTagTarget {
  if (!target || !["commit", "change"].includes(target.kind)) throw new HistoryTagError("invalidTarget")
  return { kind: target.kind, id: positiveHistoryId(target.id) }
}

/** Display text is preserved; the uniqueness key ignores case, accents and extra spaces. */
export function normalizeHistoryTagName(value: unknown): { name: string; key: string } {
  if (typeof value !== "string") throw new HistoryTagError("invalidName")
  const name = value.normalize("NFC").trim().replace(/ +/g, " ")
  if (!name || [...name].length > 80 || !/^[\p{L}\p{N}][\p{L}\p{N}\p{M} ._/-]*$/u.test(name)) {
    throw new HistoryTagError("invalidName")
  }
  return { name, key: name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase() }
}

export function historyTagReference(tag: Pick<HistoryTag, "id">): string {
  return `version:${positiveHistoryId(tag.id)}`
}

export function historyTagTargetReference(tag: HistoryTag): string {
  if (tag.commitId === null) throw new HistoryTagError("invalidTarget")
  return `${tag.targetKind}:${tag.targetId}`
}

export function tagsForTarget(tags: HistoryTag[], target: HistoryTagTarget): HistoryTag[] {
  return tags.filter((tag) => tag.targetKind === target.kind && tag.targetId === target.id)
}

export function isHistoryTagsTableMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const value = error as { code?: string; sqlMessage?: string; message?: string }
  return value.code === "ER_NO_SUCH_TABLE" && /\blusiad_history_tags\b/.test(value.sqlMessage ?? value.message ?? "")
}
