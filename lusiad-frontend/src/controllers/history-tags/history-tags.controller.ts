"use server"

import { mutateHistoryTag } from "@/lib/repositories/history-tags/history-tags.repository"
import { HistoryTagError, normalizeHistoryTagName, normalizeHistoryTagTarget, positiveHistoryId,
  type HistoryTagMutationResult, type HistoryTagTarget } from "@/lib/models/history-tags/history-tags.model"

async function mutation(work: () => Promise<void>): Promise<HistoryTagMutationResult> {
  try { await work(); return { ok: true } } catch (error) {
    if (error instanceof HistoryTagError) return { ok: false, code: error.code }
    console.error("History tag operation failed", error)
    return { ok: false, code: "unavailable" }
  }
}

export async function createHistoryTagController(projectId: number, target: HistoryTagTarget, value: string) {
  return mutation(async () => {
    const { name, key } = normalizeHistoryTagName(value)
    await mutateHistoryTag(positiveHistoryId(projectId), { kind: "create", name, key, target: normalizeHistoryTagTarget(target) })
  })
}

export async function renameHistoryTagController(projectId: number, id: number, value: string) {
  return mutation(async () => {
    const { name, key } = normalizeHistoryTagName(value)
    await mutateHistoryTag(positiveHistoryId(projectId), { kind: "rename", id: positiveHistoryId(id), name, key })
  })
}

export async function deleteHistoryTagController(projectId: number, id: number) {
  return mutation(() => mutateHistoryTag(positiveHistoryId(projectId), { kind: "delete", id: positiveHistoryId(id) }))
}
