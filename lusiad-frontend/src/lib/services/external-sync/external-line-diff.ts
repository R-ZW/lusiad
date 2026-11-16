export interface ExternalDiffLine {
  kind: 'context' | 'added' | 'deleted'
  text: string
}

function lines(text: string): string[] {
  if (text === '') return []
  const result = text.split(/\r?\n/)
  if (result[result.length - 1] === '') result.pop()
  return result
}

export function buildExternalLineDiff(before: string, after: string): ExternalDiffLine[] {
  const a = lines(before)
  const b = lines(after)
  // Bound quadratic memory use for large files; the fallback remains honest.
  if (a.length * b.length > 250_000) {
    return [
      ...a.map((text) => ({ kind: 'deleted' as const, text })),
      ...b.map((text) => ({ kind: 'added' as const, text })),
    ]
  }
  const lengths = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i][j] = a[i] === b[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1])
    }
  }
  const output: ExternalDiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      output.push({ kind: 'context', text: a[i++] })
      j++
    } else if (j < b.length && (i === a.length || lengths[i][j + 1] >= lengths[i + 1][j])) {
      output.push({ kind: 'added', text: b[j++] })
    } else {
      output.push({ kind: 'deleted', text: a[i++] })
    }
  }
  return output
}
