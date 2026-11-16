'use server'

import { backendAction } from '@/lib/services/backend-action'
import { analyzeJavaSyntax, analyzeModelOperation } from '@/lib/services/syntax-diagnostics/syntax-diagnostics.service'
import type { SyntaxOperation } from '@/lib/services/syntax-diagnostics/syntax-contract'
import { findProjectById } from '@/lib/repositories/track-control/track-control.repository'
import { relativeContained } from '@/lib/services/contained-paths'

export async function inspectModelOperationController(projectId: number, path: string, content: string, revision: string, operation: SyntaxOperation) {
  return backendAction(() => analyzeModelOperation(projectId, path, content, revision, operation))
}

export async function inspectSavedSyntaxController(projectId: number, path: string, content: string) {
  return backendAction(async () => {
    const project = await findProjectById(projectId)
    if (!project) throw new Error('Project not found')
    return analyzeJavaSyntax(projectId, relativeContained(project.path, path), content)
  })
}
