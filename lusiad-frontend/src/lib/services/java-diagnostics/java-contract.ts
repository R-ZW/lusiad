import { BackendApiError } from '../backend-response.ts'
import type { SyntaxRange } from '../syntax-diagnostics/syntax-contract.ts'

export interface JavaSettings {
  jdkHome: string; release: number; sourceRoots: string[]; testRoots: string[]; classpath: string[]; modulePath: string[]
}
export interface JavaContext {
  status: 'ok'; version: 1; settings: JavaSettings; configurationRevision: string
  runtimeHome: string; runtimeVersion: string; available: boolean; supportedReleases: number[]
}
export interface JavaProblem {
  severity: 'error'; code: string; message: string; file: string | null; revision: string | null; range: SyntaxRange | null
}
export interface JavaResult {
  status: 'ok'; version: 1; source: 'javac'; requestId: string; contextRevision: string; runtime: string; release: number
  files: { file: string; revision: string; sourceLength: number; test: boolean }[]; diagnostics: JavaProblem[]
  file: string | null; baseRevision: string | null; revision: string | null; proposedContent: string | null
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const integer = (value: unknown, min = 0): value is number => Number.isSafeInteger(value) && (value as number) >= min
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const path = (value: unknown): value is string => typeof value === 'string' && !!value && !/^[A-Za-z]:|^[\\/]|[\\\0\r\n]/.test(value) && value.split('/').every(p => p && p !== '.' && p !== '..') && value.toLowerCase().endsWith('.java')
function invalid(context: string): never { throw new BackendApiError(context, 'Invalid Java compiler response', 'invalid_response', 200) }

export function requireJavaResult(body: Record<string, unknown>, context: string, requestId: string): JavaResult {
  if ('error' in body || body.status !== 'ok' || body.version !== 1 || body.source !== 'javac' || body.requestId !== requestId
      || !sha(body.contextRevision) || typeof body.runtime !== 'string' || !body.runtime || !integer(body.release, 7)
      || !Array.isArray(body.files) || !Array.isArray(body.diagnostics)) invalid(context)
  const files = new Map<string, { revision: string; sourceLength: number }>()
  for (const file of body.files as unknown[]) {
    if (!object(file) || !path(file.file) || !sha(file.revision) || !integer(file.sourceLength) || typeof file.test !== 'boolean' || files.has(file.file)) invalid(context)
    files.set(file.file as string, file as { revision: string; sourceLength: number })
  }
  for (const problem of body.diagnostics as unknown[]) {
    if (!object(problem) || problem.severity !== 'error' || typeof problem.code !== 'string' || !problem.code
        || typeof problem.message !== 'string' || !problem.message.trim()) invalid(context)
    if (problem.file === null) { if (problem.revision !== null || problem.range !== null) invalid(context); continue }
    const file = files.get(String(problem.file))
    if (!file || problem.revision !== file.revision) invalid(context)
    if (problem.range === null) continue
    const range = problem.range
    if (!object(range) || !integer(range.startOffset) || !integer(range.endOffset) || range.endOffset < range.startOffset || range.endOffset > file!.sourceLength
        || !integer(range.startLine, 1) || !integer(range.startColumn, 1) || !integer(range.endLine, 1) || !integer(range.endColumn, 1)
        || range.endLine < range.startLine || range.endLine === range.startLine && range.endColumn < range.startColumn) invalid(context)
  }
  if (body.file === null) {
    if (body.baseRevision !== null || body.revision !== null || body.proposedContent !== null) invalid(context)
  } else if (!path(body.file) || !sha(body.baseRevision) || !sha(body.revision) || files.get(body.file)?.revision !== body.revision
      || typeof body.proposedContent !== 'string' || body.proposedContent.length !== files.get(body.file)?.sourceLength) invalid(context)
  return body as unknown as JavaResult
}

export function requireJavaContext(body: Record<string, unknown>, context: string): JavaContext {
  const settings = body.settings
  if (body.status !== 'ok' || body.version !== 1 || 'error' in body || !object(settings) || typeof settings.jdkHome !== 'string'
      || !integer(settings.release, 7) || typeof body.configurationRevision !== 'string' || !(body.configurationRevision === 'missing' || sha(body.configurationRevision))
      || typeof body.runtimeHome !== 'string' || typeof body.runtimeVersion !== 'string' || typeof body.available !== 'boolean'
      || !Array.isArray(body.supportedReleases) || !body.supportedReleases.every(v => integer(v, 7))) invalid(context)
  for (const key of ['sourceRoots', 'testRoots', 'classpath', 'modulePath']) {
    if (!Array.isArray(settings![key]) || !(settings![key] as unknown[]).every(v => typeof v === 'string' && v.trim())) invalid(context)
  }
  return body as unknown as JavaContext
}
