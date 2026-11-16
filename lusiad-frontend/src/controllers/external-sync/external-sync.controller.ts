"use server"

import {
  discardAcceptedBundle,
  loadExternalBundleFiles,
  loadPendingExternalContent,
  reviewExternalChanges,
  scanExternalChanges,
  type ExternalSyncSelection,
} from "@/lib/services/external-sync/external-sync.service"
import { buildExternalLineDiff, type ExternalDiffLine } from "@/lib/services/external-sync/external-line-diff"
import { backendAction } from "@/lib/services/backend-action"
import { BackendApiError } from "@/lib/services/backend-response"

function synchronizationAction<T>(operation: () => Promise<T>) {
  return backendAction(async () => {
    try { return await operation() }
    catch (error) {
      if (error instanceof BackendApiError) throw error
      // SQL/filesystem errors may contain connection details or absolute paths.
      // Deliberate sync conflicts retain their own codes; unknown failures stay safe.
      console.error("[external-sync] Operation failed", error instanceof Error ? error.name : "unknown")
      throw new BackendApiError("Synchronization", "Synchronization failed", "sync_failed", 503)
    }
  })
}

function requireProjectId(projectId: number): number {
  if (!Number.isSafeInteger(projectId) || projectId <= 0) throw new BackendApiError("Synchronization", "Invalid project", "invalid_request", 400)
  return projectId
}

export async function scanExternalChangesController(projectId: number) {
  return synchronizationAction(() => scanExternalChanges(requireProjectId(projectId)))
}

export async function reviewExternalChangesController(projectId: number, selections: ExternalSyncSelection[], operationId?: string) {
  return synchronizationAction(() => {
    if (!Array.isArray(selections) || selections.some(s => !s || typeof s.path !== "string" || !s.path || typeof s.revision !== "string" || typeof s.keep !== "boolean"))
      throw new BackendApiError("Synchronization", "Invalid selection", "invalid_request", 400)
    return reviewExternalChanges(requireProjectId(projectId), selections, operationId)
  })
}

export async function discardAcceptedBundleController(projectId: number, operationId?: string, bundleId?: number) {
  return synchronizationAction(() => discardAcceptedBundle(requireProjectId(projectId), operationId, bundleId))
}

export interface ExternalBundleDiffFile {
  path: string
  kind: "added" | "modified" | "deleted"
  entryKind: "file" | "directory"
  javaDiff: ExternalDiffLine[] | null
}

export interface PendingExternalTextDiff {
  path: string
  kind: "added" | "modified" | "deleted"
  entryKind: "file" | "directory"
  lines: ExternalDiffLine[] | null
  unavailableReason: "directory" | "binary" | "too_large" | "not_java" | null
}

const MAX_TEXT_PREVIEW_BYTES = 1_000_000

function decodePreviewContent(content: Buffer | null): string | null {
  if (!content) return ""
  if (content.includes(0)) return null
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content)
  } catch {
    return null
  }
}

export async function loadPendingExternalTextDiffController(
  projectId: number,
  path: string,
  revision: string
) {
  return synchronizationAction(async (): Promise<PendingExternalTextDiff> => {
    requireProjectId(projectId)
    if (typeof path !== "string" || !path || typeof revision !== "string" || !revision) throw new BackendApiError("Synchronization", "Invalid change", "invalid_request", 400)
    const content = await loadPendingExternalContent(projectId, path, revision)
    const common = { path: content.path, kind: content.type, entryKind: content.entryKind }
    if (content.entryKind === "directory") {
      return { ...common, lines: null, unavailableReason: "directory" }
    }
    if (!content.path.toLowerCase().endsWith(".java")) return { ...common, lines: null, unavailableReason: "not_java" }
    if ((content.beforeContent?.length ?? 0) > MAX_TEXT_PREVIEW_BYTES ||
      (content.afterContent?.length ?? 0) > MAX_TEXT_PREVIEW_BYTES) {
      return { ...common, lines: null, unavailableReason: "too_large" }
    }
    const before = decodePreviewContent(content.beforeContent)
    const after = decodePreviewContent(content.afterContent)
    if (before === null || after === null) {
      return { ...common, lines: null, unavailableReason: "binary" }
    }
    return { ...common, lines: buildExternalLineDiff(before, after), unavailableReason: null }
  })
}

export async function loadExternalBundleDiffController(projectId: number, changeId: number) {
  return synchronizationAction(async (): Promise<ExternalBundleDiffFile[]> => {
    requireProjectId(projectId)
    if (!Number.isSafeInteger(changeId) || changeId <= 0) throw new Error("Mudança inválida")
    const files = await loadExternalBundleFiles(projectId, changeId)
    return files.map((file) => ({
      path: file.path,
      kind: file.kind,
      entryKind: file.after_kind ?? file.before_kind ?? "file",
      javaDiff: (file.after_kind ?? file.before_kind) === "file" && file.path.toLowerCase().endsWith(".java")
        && (file.before_content?.length ?? 0) <= MAX_TEXT_PREVIEW_BYTES && (file.after_content?.length ?? 0) <= MAX_TEXT_PREVIEW_BYTES
        && decodePreviewContent(file.before_content) !== null && decodePreviewContent(file.after_content) !== null
        ? buildExternalLineDiff(decodePreviewContent(file.before_content)!, decodePreviewContent(file.after_content)!)
        : null,
    }))
  })
}
