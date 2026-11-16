'use server'

import { backendAction } from '@/lib/services/backend-action'
import { findProjectById } from '@/lib/repositories/track-control/track-control.repository'
import { catalogSyntaxSources, readSyntaxSource, syntaxRevision } from '@/lib/services/syntax-diagnostics/project-sources'
import { analyzeJavaSyntax } from '@/lib/services/syntax-diagnostics/syntax-diagnostics.service'
import { BackendApiError } from '@/lib/services/backend-response'
import { assertSeparateRoots, relativeContained } from '@/lib/services/contained-paths'

async function projectSource(projectId: number) {
  const project = await findProjectById(projectId)
  if (!project || !project.tempPath) throw new BackendApiError('Syntax', 'Project source unavailable', 'syntax_analysis_unavailable', 503)
  assertSeparateRoots(project.path, project.tempPath)
  return project
}

export async function listProblemSourcesController(projectId: number) {
  return backendAction(async () => {
    const project = await projectSource(projectId)
    return catalogSyntaxSources(project.path, project.tempPath!)
  })
}

export async function inspectProblemFileController(projectId: number, path: string, expectedRevision?: string) {
  return backendAction(async () => {
    const project = await projectSource(projectId), file = relativeContained(project.path, path)
    const read = async () => {
      try { return await readSyntaxSource(project.path, file) }
      catch (error) {
        if (error instanceof BackendApiError) throw error
        throw new BackendApiError('Syntax', 'Could not read Java source', 'syntax_analysis_unavailable', 503)
      }
    }
    const content = await read(), revision = syntaxRevision(content)
    const conflict = () => { throw new BackendApiError('Syntax', 'Source changed during analysis', 'revision_conflict', 409) }
    if (expectedRevision && revision !== expectedRevision) conflict()
    const result = await analyzeJavaSyntax(projectId, file, content)
    if (syntaxRevision(await read()) !== revision) conflict()
    return result
  })
}
