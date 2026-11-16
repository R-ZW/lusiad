'use server'

import { createHash } from 'node:crypto'
import { findProjectById } from '@/lib/repositories/track-control/track-control.repository'
import { assertSeparateRoots, relativeContained } from '@/lib/services/contained-paths'
import { catalogSyntaxSources, readSyntaxSource } from '@/lib/services/syntax-diagnostics/project-sources'
import { requireCurrentUmlResult, type CurrentUmlResult } from '@/lib/models/current-uml.model'
import { postBackendJson } from '@/lib/services/backend-client'
import { backendUrl } from '@/lib/config/backend'
import { backendErrorMessage } from '@/lib/services/backend-action'
import { BackendApiError } from '@/lib/services/backend-response'
import { getServerI18n } from '@/lib/i18n/server'

export async function renderCurrentUmlController(request: { projectId: number; view: 'file' | 'project'; file?: string }):
  Promise<{ result: CurrentUmlResult } | { error: string }> {
  const { locale, t } = await getServerI18n()
  try {
    if (!Number.isSafeInteger(request.projectId) || request.projectId < 1
      || !['file', 'project'].includes(request.view)) throw new Error('Invalid current UML request')
    const project = await findProjectById(request.projectId)
    if (!project?.tempPath) throw new Error('Project not found')
    assertSeparateRoots(project.path, project.tempPath)
    let files: { path: string; content: string }[]
    let revision: string
    if (request.view === 'file') {
      if (!request.file) throw new Error('No Java file selected')
      const path = relativeContained(project.path, request.file)
      const content = await readSyntaxSource(project.path, path)
      files = [{ path, content }]
      revision = createHash('sha256').update(content).digest('hex')
    } else {
      const catalog = await catalogSyntaxSources(project.path, project.tempPath)
      if (catalog.failures.length) throw new Error('Project Java sources could not all be read')
      if (catalog.files.length > 500) throw new Error('UML source limit')
      files = []
      let length = 0
      for (const source of catalog.files) {
        const content = await readSyntaxSource(project.path, source.file)
        length += content.length
        if (length > 1500000) throw new Error('UML source limit')
        files.push({ path: source.file, content })
      }
      revision = catalog.revision
    }
    const rendered = await postBackendJson(backendUrl('/uml/current'), {
      projectId: request.projectId, locale, files,
    }, 'Current UML', requireCurrentUmlResult)
    // The diagram must describe the saved tree that still exists after rendering.
    if (request.view === 'file') {
      const current = await readSyntaxSource(project.path, files[0].path)
      if (createHash('sha256').update(current).digest('hex') !== revision) throw new Error('Saved Java file changed during UML generation')
    } else {
      const current = await catalogSyntaxSources(project.path, project.tempPath)
      if (current.failures.length || current.revision !== revision) throw new Error('Project changed during UML generation')
    }
    return { result: { ...rendered, revision } }
  } catch (error) {
    return { error: error instanceof BackendApiError
      ? error.code === 'uml_invalid_request' ? t('currentUml.limit')
        : error.code === 'uml_generation_failed' ? t('currentUml.error') : await backendErrorMessage(error)
      : error instanceof Error && error.message === 'UML source limit' ? t('currentUml.limit') : t('currentUml.error') }
  }
}
