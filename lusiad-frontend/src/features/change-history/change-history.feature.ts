import type { ChangeHistorySnapshot } from "@/lib/models/change-history/change-history.model"
import { fetchChangeHistoryService } from "@/lib/services/change-history/change-history.service"

const DEFAULT_LIMIT = 250
const MAX_LIMIT = 2000

export interface LoadChangeHistoryFeatureParams {
  projectId: number
  limit?: number
  commitIds?: Array<string | number>
  pendingBeforeId?: number
  pendingRevision?: string
  includeUncommittedDetails?: boolean
  includeUncommittedCount?: boolean
}

function normalizeLimit(limit?: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_LIMIT
  }

  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit)))
}

export async function loadChangeHistoryFeature(
  params: LoadChangeHistoryFeatureParams
): Promise<ChangeHistorySnapshot> {
  if (!Number.isSafeInteger(params.projectId) || params.projectId < 1) throw new Error("Invalid project")
  const resolvedLimit = normalizeLimit(params.limit)
  return fetchChangeHistoryService({
    projectId: params.projectId,
    limit: resolvedLimit,
    commitIds: params.commitIds,
    pendingBeforeId: params.pendingBeforeId,
    pendingRevision: params.pendingRevision,
    includeUncommittedDetails: params.includeUncommittedDetails,
    includeUncommittedCount: params.includeUncommittedCount,
  })
}
