"use server"

import { findProjectById } from "@/lib/repositories/track-control/track-control.repository"
import { assertSeparateRoots } from "@/lib/services/contained-paths"
import { releasePreview, readReadyPreview } from "@/lib/services/restore/preview-snapshot"
import type { FileNode } from "@/lib/types"
import { applyRestoreChangeFeature } from "@/features/restore/restore.feature"
import { BackendApiError } from "@/lib/services/backend-response"
import { backendErrorMessage } from "@/lib/services/backend-action"

export interface ApplyRestoreChangeControllerParams {
  projectId: number
  changeId: number | string
}

function requireChangeId(changeId: number | string): number {
  const resolvedChangeId = typeof changeId === "number" ? changeId : Number(String(changeId).trim())

  if (!Number.isSafeInteger(resolvedChangeId) || resolvedChangeId <= 0) {
    throw new Error("Identificador da mudança inválido")
  }

  return resolvedChangeId
}

export async function applyRestoreChangeController(
  params: ApplyRestoreChangeControllerParams
): Promise<{ status: "ok"; preview: { snapshotId: string; beforeTree: FileNode[]; afterTree: FileNode[]; changeType: string; reqBody: unknown } } | { status: "error"; code: "baseline" | "incomplete" | "restore"; message?: string }> {
  try {
    const resolvedChangeId = requireChangeId(params.changeId)
    const preview = await applyRestoreChangeFeature({ projectId: params.projectId, changeId: resolvedChangeId })
    return { status: "ok", preview }
  } catch (error) {
    if (error instanceof BackendApiError) {
      return { status: "error", code: error.code === "incomplete_restore" ? "incomplete" : "restore", message: await backendErrorMessage(error) }
    }
    console.error("Change reconstruction failed", error)
    const message = error instanceof Error ? error.message : ""
    const code = message.includes("não possui commit anterior") ? "baseline"
      : message.includes("Falha ao reconstruir a mudança") ? "incomplete" : "restore"
    return { status: "error", code }
  }
}

export async function releaseHistoryPreviewController(projectId: number, snapshotId: string): Promise<void> {
  const project = await findProjectById(projectId)
  if (!project?.tempPath) throw new Error("Project not found")
  assertSeparateRoots(project.path, project.tempPath)
  await releasePreview(project.tempPath, snapshotId, projectId)
}

export async function isPendingHistoryPreviewCurrentController(projectId: number, snapshotId: string, changeId: number): Promise<boolean> {
  const project = await findProjectById(projectId)
  if (!project?.tempPath) return false
  try {
    assertSeparateRoots(project.path, project.tempPath)
    const identity = await readReadyPreview(project.tempPath, snapshotId, projectId, changeId)
    return Boolean(identity.pending)
  } catch { return false }
}
