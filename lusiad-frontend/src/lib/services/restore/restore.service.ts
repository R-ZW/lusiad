import "server-only"
import { findRestoreContextByChangeId, findPendingRestoreContext } from "@/lib/repositories/restore/restore.repository"
import { backendUrl } from "@/lib/config/backend"
import { prepareChangeArchive, preparePendingArchive } from "./change-archive.service"
import { postBackendJson } from "../backend-client"
import { requireRestoreResult } from "../backend-response"
import { assertSeparateRoots } from "../contained-paths"
import { createPreview, markPreviewReady } from "./preview-snapshot"
import { readSnapshotTree } from "./snapshot-reader"

export async function applyRestoreChangeService({ projectId, changeId }: { projectId: number; changeId: number }) {
  const committed = await findRestoreContextByChangeId(changeId)
  const pending = committed ? null : await findPendingRestoreContext(projectId, changeId)
  const context = committed ?? pending
  if (!context || context.projectId !== projectId) throw new Error("Mudança não encontrada neste projeto ou não está mais pendente")
  assertSeparateRoots(context.projectPath, context.tempPath)
  return createPreview(context.tempPath, async (snapshotId, root) => {
    if (pending) await preparePendingArchive(pending, `comparisons/${snapshotId}/archive`)
    else await prepareChangeArchive(context, `comparisons/${snapshotId}/archive`)
    await postBackendJson(backendUrl(pending ? "/restore/pending" : "/restore/apply"),
      pending ? { projectId, changeId, snapshotId, branchId: pending.branchId, gitId: pending.currentGitId, pendingRevision: pending.pendingRevision }
        : { changeId, snapshotId }, "Falha ao reconstruir mudança",
      (body, label) => requireRestoreResult(body, label, changeId, {
        snapshotId, projectId: context.projectId, commitId: context.commitId, gitId: context.currentGitId,
        ...(pending ? { branchId: pending.branchId, pendingRevision: pending.pendingRevision } : {}),
      }))
    const current = pending ? await findPendingRestoreContext(projectId, changeId) : await findRestoreContextByChangeId(changeId)
    if (!current || current.projectPath !== context.projectPath || current.tempPath !== context.tempPath || current.commitId !== context.commitId || current.currentGitId !== context.currentGitId
      || JSON.stringify(current.reqBody) !== JSON.stringify(context.reqBody)
      || (pending && (!('branchId' in current) || current.branchId !== pending.branchId || current.pendingRevision !== pending.pendingRevision)))
      throw new Error("A mudança foi alterada durante a reconstrução; abra a prévia novamente")
    const [beforeTree, afterTree] = await Promise.all([readSnapshotTree(root, "working-copy-prev"), readSnapshotTree(root, "working-copy")])
    const reqBody = typeof context.reqBody === "string" ? JSON.parse(context.reqBody) : context.reqBody
    await markPreviewReady(context.tempPath, { snapshotId, changeId, projectId: context.projectId, commitId: context.commitId, changeType: context.changeType, reqBody,
      ...(pending ? { pending: { branchId: pending.branchId, gitId: pending.currentGitId, revision: pending.pendingRevision } } : {}) })
    return { snapshotId, beforeTree, afterTree, changeType: context.changeType, reqBody }
  })
}
