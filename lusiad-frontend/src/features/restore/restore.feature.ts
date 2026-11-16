import { applyRestoreChangeService } from "@/lib/services/restore/restore.service"

export interface ApplyRestoreChangeFeatureParams {
  projectId: number
  changeId: number
}

export async function applyRestoreChangeFeature(
  params: ApplyRestoreChangeFeatureParams
) {
  return applyRestoreChangeService({ projectId: params.projectId, changeId: params.changeId })
}
