import type { SyntaxCatalog, SyntaxFile } from '../../services/syntax-diagnostics/project-sources.ts'
import type { SyntaxResult } from '../../services/syntax-diagnostics/syntax-contract.ts'

export interface FileAnalysis { file: string; revision: string; result?: SyntaxResult; error?: string }
export type ProblemsStatus = 'checking' | 'complete' | 'partial' | 'stale' | 'unavailable'
export interface ProblemsSnapshot {
  key: string; status: ProblemsStatus; entries: FileAnalysis[]; failures: { file: string; error: string }[]; total: number
}
export interface ProblemLocation { file: string; revision: string; message: string; line?: number; column?: number; id: number }

/** A retained result is reusable only for the identical file and saved revision. */
export function reusableAnalysis(cache: Map<string, FileAnalysis>, file: SyntaxFile): FileAnalysis | undefined {
  const value = cache.get(file.file)
  return value?.revision === file.revision && value.result ? value : undefined
}

export function finishedStatus(entries: FileAnalysis[], failures: unknown[], stale = false): ProblemsStatus {
  if (stale) return 'stale'
  const failed = failures.length > 0 || entries.some(entry => !entry.result)
  return failed ? entries.some(entry => entry.result) ? 'partial' : 'unavailable' : 'complete'
}
export function sameCatalog(a: SyntaxCatalog, b: SyntaxCatalog) { return a.revision === b.revision }

/** A scan owns all its progress/final results. Changing scope or file immediately abandons it. */
export class ProblemsSequence {
  private generation = 0
  next() { return ++this.generation }
  current(ticket: number) { return ticket === this.generation }
  invalidate() { this.generation++ }
}
