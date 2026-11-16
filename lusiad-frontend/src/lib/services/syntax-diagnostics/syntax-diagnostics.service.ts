import 'server-only'
import { createHash } from 'node:crypto'
import { backendUrl } from '../../config/backend'
import { postBackendJson } from '../backend-client'
import { requireSyntaxResult, syntaxSource, type SyntaxEdit } from './syntax-contract'
import type { SyntaxOperation } from './syntax-contract'
import { findProjectById } from '@/lib/repositories/track-control/track-control.repository'
import { relativeContained } from '../contained-paths'
import { BackendApiError } from '../backend-response'

/** Read-only client. Path is relative to the registered Lusiad project. */
export async function analyzeJavaSyntax(projectId: number, path: string, content: string, edit?: SyntaxEdit) {
  const file = path.replace(/\\/g, '/')
  if (!Number.isSafeInteger(projectId) || projectId <= 0 || file.startsWith('/') || /^[A-Za-z]:/.test(file)
      || file.split('/').some(part => !part || part === '.' || part === '..') || !file.toLowerCase().endsWith('.java'))
    throw new Error('A project and relative Java path are required')
  const proposed = syntaxSource(content, edit)
  const hash = (source: string) => createHash('sha256').update(source, 'utf8').digest('hex')
  const expected = { file, source: proposed, baseRevision: hash(content), revision: hash(proposed) }
  return postBackendJson(backendUrl('/psi/diagnose'), { projectId, path: file, content, ...edit },
    'Falha ao analisar sintaxe Java', (body, context) => requireSyntaxResult(body, context, expected))
}

/** The backend composes the proposal using the same placement rules as the real mutation. */
export async function analyzeModelOperation(projectId: number, path: string, content: string, expectedHash: string, operation: SyntaxOperation) {
  const project = await findProjectById(projectId)
  if (!project) throw new Error('Project not found')
  const file = relativeContained(project.path, path)
  const hash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')
  if (hash(syntaxSource(content)) !== expectedHash) throw new BackendApiError('Syntax', 'Source revision differs from the model', 'revision_conflict', 409)
  return postBackendJson(backendUrl('/psi/diagnose-edit'), {
    projectId, path: file, sourceContent: content, expectedHash, componentPlacement: true, ...operation,
  }, 'Falha ao analisar a proposta Java', (body, context) => {
    if (typeof body.proposedContent !== 'string' || body.operation !== operation.operation)
      throw new BackendApiError(context, 'Invalid proposed operation', 'invalid_response', 200)
    const proposed = syntaxSource(body.proposedContent)
    return requireSyntaxResult(body, context, { file, baseRevision: expectedHash, source: proposed, revision: hash(proposed) })
  })
}
