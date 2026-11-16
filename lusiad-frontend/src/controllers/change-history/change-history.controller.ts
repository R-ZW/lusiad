"use server"

import type { ChangeHistorySnapshot } from "@/lib/models/change-history/change-history.model"
import { loadChangeHistoryFeature } from "@/features/change-history/change-history.feature"

export interface LoadChangeHistoryControllerParams {
  projectId: number
  limit?: number
  commitIds?: Array<string | number>
  pendingBeforeId?: number
  pendingRevision?: string
  includeUncommittedDetails?: boolean
  includeUncommittedCount?: boolean
}

export type ChangeHistoryControllerResult = ChangeHistorySnapshot

export async function loadChangeHistoryController(
  params: LoadChangeHistoryControllerParams
): Promise<ChangeHistoryControllerResult> {
  try {
    return await loadChangeHistoryFeature({
      projectId: params.projectId,
      limit: params.limit,
      commitIds: params.commitIds,
      pendingBeforeId: params.pendingBeforeId,
    pendingRevision: params.pendingRevision,
    includeUncommittedDetails: params.includeUncommittedDetails,
      includeUncommittedCount: params.includeUncommittedCount,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido"
    throw new Error(`Falha ao carregar mudancas do banco: ${message}`)
  }
}
