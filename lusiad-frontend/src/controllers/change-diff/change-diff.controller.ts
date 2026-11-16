'use server'

import { readReadyPreview, previewRoot } from '@/lib/services/restore/preview-snapshot'
import { findProjectById } from '@/lib/repositories/track-control/track-control.repository'
import { assertSeparateRoots, normalizeHistoricalPaths } from '@/lib/services/contained-paths'
import { loadChangeDiffFeature } from '@/features/change-diff/change-diff.feature'
import type { ChangeDiffSnapshot } from '@/lib/services/change-diff/change-diff.service'
import { BackendApiError } from '@/lib/services/backend-response'
import { backendErrorMessage } from '@/lib/services/backend-action'

function requireText(value: string, message: string): string {
  const trimmed = value.trim()

  if (!trimmed) {
    throw new Error(message)
  }

  return trimmed
}

export async function loadChangeDiffController(params: {
  snapshotId: string
  projectId: number
  changeId: string
}): Promise<{ status: 'ok'; snapshot: ChangeDiffSnapshot } | { status: 'error'; code: 'incomplete' | 'load'; message?: string }> {
  try {
    const project = await findProjectById(params.projectId)
    if (!project?.tempPath) throw new Error('Projeto ou diretório temporário não encontrado')
    const projectTempPath = requireText(project.tempPath, 'Informe o diretório temporário do projeto')
    assertSeparateRoots(project.path, projectTempPath)
    const changeId = requireText(params.changeId, 'Informe o identificador da mudança')
    if (!/^[1-9]\d*$/.test(changeId)) throw new Error('Invalid change id')
    const identity = await readReadyPreview(projectTempPath, params.snapshotId, params.projectId, Number(changeId))
    const snapshot = await loadChangeDiffFeature({
      projectId: params.projectId,
      projectTempPath: previewRoot(projectTempPath, params.snapshotId),
      changeId,
      changeType: identity.changeType,
      reqBody: normalizeHistoricalPaths(project.path, identity.reqBody),
    })
    return { status: 'ok', snapshot }
  } catch (error) {
    if (error instanceof BackendApiError) return { status: 'error', code: 'load', message: await backendErrorMessage(error) }
    return { status: 'error', code: error instanceof Error && error.message === 'CHANGE_SNAPSHOT_INCOMPLETE' ? 'incomplete' : 'load' }
  }
}
