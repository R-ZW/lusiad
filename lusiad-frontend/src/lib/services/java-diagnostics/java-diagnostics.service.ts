import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { postBackendJson } from '../backend-client'
import { backendUrl } from '../../config/backend'
import { requireJavaContext, requireJavaResult, type JavaSettings } from './java-contract'
import type { SyntaxOperation } from '../syntax-diagnostics/syntax-contract'
import { findProjectById } from '@/lib/repositories/track-control/track-control.repository'
import { relativeContained } from '../contained-paths'
import { BackendApiError } from '../backend-response'

const ok = (body: Record<string, unknown>, context: string) => {
  if (body.status !== 'ok' || 'error' in body) throw new BackendApiError(context, 'Invalid Java response', 'invalid_response', 200)
  return true
}
export async function javaContext(projectId: number, settings?: JavaSettings, configurationRevision?: string) {
  return postBackendJson(backendUrl('/java/context'), { projectId, channel: 'context', settings, configurationRevision }, 'Java configuration', requireJavaContext)
}
export async function analyzeJavaProject(projectId: number, requestId: string) {
  return postBackendJson(backendUrl('/java/analyze'), { projectId, channel: 'saved', requestId }, 'Java analysis',
    (body, context) => requireJavaResult(body, context, requestId))
}
export async function analyzeJavaOperation(projectId: number, path: string, sourceContent: string, expectedHash: string, operation: SyntaxOperation, requestId: string = randomUUID()) {
  const project = await findProjectById(projectId)
  if (!project) throw new Error('Project not found')
  const file = relativeContained(project.path, path)
  const result = await postBackendJson(backendUrl('/java/analyze-edit'), {
    projectId, path: file, sourceContent, expectedHash, componentPlacement: true, channel: 'proposal', requestId, ...operation,
  }, 'Java proposal analysis', (body, context) => requireJavaResult(body, context, requestId))
  if (result.file !== file || result.baseRevision !== expectedHash || typeof result.proposedContent !== 'string'
      || createHash('sha256').update(result.proposedContent).digest('hex') !== result.revision)
    throw new BackendApiError('Java', 'Compiler proposal revision differs from the model', 'invalid_response', 200)
  return result
}
export async function checkJavaContext(projectId: number, contextRevision: string) {
  return postBackendJson(backendUrl('/java/check'), { projectId, channel: 'check', contextRevision }, 'Java context changed', ok)
}
export async function cancelJavaAnalysis(projectId: number, channel: 'saved' | 'proposal', requestId: string) {
  return postBackendJson(backendUrl('/java/cancel'), { projectId, channel, requestId }, 'Cancel Java analysis', ok)
}
