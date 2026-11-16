import { BackendApiError } from '../backend-response.ts'

export interface SyntaxEdit { startOffset: number; endOffset: number; newContent: string }
export interface SyntaxRange { startOffset: number; endOffset: number; startLine: number; startColumn: number; endLine: number; endColumn: number }
export interface SyntaxProblem { severity: 'error'; message: string; range: SyntaxRange | null }
export interface SyntaxResult {
  status: 'ok'; version: 1; source: 'psi-syntax'; file: string; baseRevision: string; revision: string
  sourceLength: number; languageLevel: string; diagnostics: SyntaxProblem[]
}
export interface SyntaxExpectation { file: string; baseRevision: string; revision: string; source: string }
export type SyntaxOperation =
  | { operation: 'create'; line: number; lineEnd?: number; column?: number; content: string }
  | { operation: 'update'; startOffset: number; endOffset: number; newContent: string }
  | { operation: 'delete'; startOffset: number; endOffset: number }
  | { operation: 'move'; startOffset: number; endOffset: number; line: number; lineEnd?: number; column?: number }

/** An edit is applied to the complete caller-owned file snapshot, never to an isolated snippet. */
export function syntaxSource(source: string, edit?: SyntaxEdit): string {
  if (typeof source !== 'string' || !source.isWellFormed()) throw new Error('Complete Unicode source is required')
  if (!edit) return source
  if (!Number.isSafeInteger(edit.startOffset) || !Number.isSafeInteger(edit.endOffset)
      || edit.startOffset < 0 || edit.endOffset < edit.startOffset || edit.endOffset > source.length || typeof edit.newContent !== 'string')
    throw new Error('Invalid syntax proposal range')
  const proposed = source.slice(0, edit.startOffset) + edit.newContent + source.slice(edit.endOffset)
  if (!proposed.isWellFormed()) throw new Error('The proposal splits a Unicode character')
  return proposed
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const integer = (value: unknown, minimum = 0): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum

/** A successful empty result must identify the exact requested file/content and complete parse contract. */
export function requireSyntaxResult(body: Record<string, unknown>, context: string, expected: SyntaxExpectation): SyntaxResult {
  function invalid(): never { throw new BackendApiError(context, 'Invalid syntax analysis response', 'invalid_response', 200) }
  if ('error' in body || body.status !== 'ok' || body.version !== 1 || body.source !== 'psi-syntax'
      || body.file !== expected.file || body.baseRevision !== expected.baseRevision || body.revision !== expected.revision
      || !/^[a-f0-9]{64}$/.test(String(body.revision)) || !/^[a-f0-9]{64}$/.test(String(body.baseRevision))
      || body.sourceLength !== expected.source.length || typeof body.languageLevel !== 'string'
      || !/^JDK_(?:1_[3-9]|[1-9]\d*)$/.test(body.languageLevel) || !Array.isArray(body.diagnostics)) invalid()
  const text = expected.source, starts = [0]
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\r') { if (text[i + 1] === '\n') i++; starts.push(i + 1) }
    else if (text[i] === '\n') starts.push(i + 1)
  }
  function position(offset: number): [number, number] {
    if (offset > 0 && text[offset - 1] === '\r' && text[offset] === '\n') invalid()
    let low = 0, high = starts.length
    while (low + 1 < high) { const middle = (low + high) >>> 1; if (starts[middle] <= offset) low = middle; else high = middle }
    return [low + 1, offset - starts[low] + 1]
  }
  for (const item of body.diagnostics as unknown[]) {
    if (!record(item) || item.severity !== 'error' || typeof item.message !== 'string' || !item.message.trim() || !('range' in item)) invalid()
    if (item.range === null) continue
    const range = item.range
    if (!record(range) || !integer(range.startOffset) || !integer(range.endOffset)
        || range.endOffset < range.startOffset || range.endOffset > text.length) invalid()
    const [startLine, startColumn] = position(range.startOffset as number), [endLine, endColumn] = position(range.endOffset as number)
    if (range.startLine !== startLine || range.startColumn !== startColumn || range.endLine !== endLine || range.endColumn !== endColumn) invalid()
  }
  return body as unknown as SyntaxResult
}
