'use server'

import { readFile } from 'node:fs/promises'
import { findProjectById } from '@/lib/repositories/track-control/track-control.repository'
import { assertSeparateRoots, containedPath, normalizeHistoricalPaths, relativeContained } from '@/lib/services/contained-paths'
import { previewRoot, readReadyPreview } from '@/lib/services/restore/preview-snapshot'
import { readSnapshotTree } from '@/lib/services/restore/snapshot-reader'
import { normalizePsiSource } from '@/lib/services/model-comparison/psi-source'
import { loadChangeDiffSnapshotFeature } from '@/lib/services/change-diff/change-diff.service'
import { resolveChangeFocus } from '@/lib/services/change-diff/change-focus.service'
import { requireUmlResult, type UmlRequest, type UmlResult } from '@/lib/models/change-diff/change-uml.model'
import { postBackendJson } from '@/lib/services/backend-client'
import { backendUrl } from '@/lib/config/backend'
import { backendErrorMessage } from '@/lib/services/backend-action'
import { BackendApiError } from '@/lib/services/backend-response'
import { getServerI18n } from '@/lib/i18n/server'
import type { FileNode } from '@/lib/types'

/** Only ready snapshots owned by this project/change are read. No live project or client-supplied paths. */
export async function renderChangeUmlController(request: UmlRequest): Promise<{ result: UmlResult } | { error: string }> {
  const { locale, t } = await getServerI18n()
  try {
    if (!Number.isSafeInteger(request.projectId) || request.projectId < 1 || !/^[1-9]\d*$/.test(request.changeId)
      || !['focus', 'project'].includes(request.view)) throw new Error('Invalid UML request')
    const project = await findProjectById(request.projectId)
    if (!project?.tempPath) throw new Error('Missing project')
    assertSeparateRoots(project.path, project.tempPath)
    const identity = await readReadyPreview(project.tempPath, request.snapshotId, request.projectId, Number(request.changeId))
    const root = previewRoot(project.tempPath, request.snapshotId)
    const reqBody = normalizeHistoricalPaths(project.path, identity.reqBody)
    const snapshot = await loadChangeDiffSnapshotFeature({ projectId: request.projectId, projectTempPath: root,
      changeId: request.changeId, changeType: identity.changeType, reqBody })
    const focus = resolveChangeFocus({ operation: snapshot.operation, beforeModel: snapshot.beforeModel, afterModel: snapshot.afterModel, reqBody })
    const beforePath = relativeContained(containedPath(root, 'working-copy-prev'), snapshot.beforePath)
    const afterPath = relativeContained(containedPath(root, 'working-copy'), snapshot.afterPath)
    async function sources(folder: string, selectedPath: string) {
      const folderRoot = containedPath(root, folder)
      const paths: string[] = []
      if (request.view === 'focus') paths.push(selectedPath)
      else {
        const collect = (nodes: FileNode[]) => nodes.forEach(node => {
          if (node.type === 'folder') collect(node.children ?? [])
          else if (node.path?.endsWith('.java')) paths.push(relativeContained(folderRoot, node.path))
        })
        collect(await readSnapshotTree(root, folder))
      }
      if (paths.length > 500) throw new Error('UML source limit')
      const result: { path: string; content: string }[] = []
      let length = 0
      for (const path of paths.sort()) {
        const content = normalizePsiSource(await readFile(containedPath(folderRoot, path), 'utf8'))
        length += content.length
        if (length > 1500000) throw new Error('UML source limit')
        result.push({ path, content })
      }
      return result
    }
    const [beforeFiles, afterFiles] = await Promise.all([sources('working-copy-prev', beforePath), sources('working-copy', afterPath)])
    const result = await postBackendJson(backendUrl('/uml/render'), {
      projectId: request.projectId, beforeFiles, afterFiles, operation: snapshot.operation, locale,
      beforeFocus: focus.before.range ? { path: beforePath, ...focus.before.range } : null,
      afterFocus: focus.after.range ? { path: afterPath, ...focus.after.range } : null,
    }, 'UML', requireUmlResult)
    return { result }
  } catch (error) {
    return { error: error instanceof BackendApiError ? await backendErrorMessage(error) : t('diff.umlError') }
  }
}
