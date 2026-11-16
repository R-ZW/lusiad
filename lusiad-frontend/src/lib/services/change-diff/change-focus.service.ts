import type { JavaModel, PsiNode } from "@/lib/types"

export type ChangeFocusOperation = "create" | "update" | "delete" | "move" | "unknown"

export interface TextRange {
  start: number
  end: number
}

export interface ChangeFocus {
  node: PsiNode | null
  range: TextRange | null
  source: "range" | "content" | "none"
}

export interface ChangeFocusPair {
  before: ChangeFocus
  after: ChangeFocus
}

interface ChangeRequestBody {
  startOffset?: number | string
  endOffset?: number | string
  line?: number | string
  lineEnd?: number | string
  column?: number | string
  content?: string
  newContent?: string
  insertedContent?: string
}

interface CanonicalText {
  value: string
  offsets: number[]
}

function parseBody(value: unknown): ChangeRequestBody {
  return value && typeof value === "object" ? value as ChangeRequestBody : {}
}

function parseNumber(value: number | string | undefined): number | null {
  if (value === undefined || value === null || value === "") return null
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

function isPsiNode(value: unknown): value is PsiNode {
  return Boolean(value) && typeof value === "object" && typeof (value as PsiNode).type === "string"
}

function childrenOf(node: PsiNode): PsiNode[] {
  return Array.isArray(node.children) ? node.children.filter(isPsiNode) : []
}

function renderLeafText(node: PsiNode | null): string {
  if (!node) return ""
  const children = childrenOf(node)
  return children.length === 0 ? node.text ?? "" : children.map(renderLeafText).join("")
}

/**
 * Ignore only layout whitespace. Whitespace inside literals and comments is
 * meaningful, so a global whitespace replacement can identify the wrong code.
 * Keep a map back to the actual UTF-16 offsets used by PSI and the canvas.
 */
function canonicalize(source: string): CanonicalText {
  let value = ""
  const offsets: number[] = []
  let state: "code" | "string" | "character" | "textBlock" | "lineComment" | "blockComment" = "code"
  let textBlockOpen = -1

  function escapedAt(index: number): boolean {
    let slashes = 0
    for (let previous = index - 1; previous >= 0 && source[previous] === "\\"; previous -= 1) slashes += 1
    return slashes % 2 === 1
  }

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]
    if (state === "code") {
      if (/\s/.test(char)) {
        const previous = source[index - 1], nextCode = source.slice(index).match(/^\s*([\s\S])/)?.[1]
        const word = (value: string | undefined) => Boolean(value && /[\p{L}\p{N}_$]/u.test(value))
        const operator = (value: string | undefined) => Boolean(value && /[+\-*/<>=!&|?:]/.test(value))
        if (!/\s/.test(previous ?? "") && ((word(previous) && word(nextCode)) || (operator(previous) && operator(nextCode)))) { value += "\0"; offsets.push(index) }
        continue
      }
      if (char === '"') {
        state = source.slice(index, index + 3) === '"""' ? "textBlock" : "string"
        if (state === "textBlock") textBlockOpen = index
      }
      else if (char === "'") state = "character"
      else if (char === "/" && next === "/") state = "lineComment"
      else if (char === "/" && next === "*") state = "blockComment"
    } else if (state === "lineComment" && char === "\n") {
      state = "code"
    } else if (state === "blockComment" && char === "/" && source[index - 1] === "*") {
      state = "code"
    } else if (state === "string" && char === '"' && !escapedAt(index)) {
      state = "code"
    } else if (state === "character" && char === "'" && !escapedAt(index)) {
      state = "code"
    } else if (state === "textBlock" && index >= textBlockOpen + 5 && source.slice(index - 2, index + 1) === '"""' && !escapedAt(index - 2)) {
      state = "code"
    }
    value += char
    offsets.push(index)
  }

  return { value, offsets }
}

function canonicalIndexAtOffset(text: CanonicalText, offset: number): number {
  let low = 0
  let high = text.offsets.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (text.offsets[middle] < offset) low = middle + 1
    else high = middle
  }
  return low
}

function findNodeForRange(root: PsiNode | null, range: TextRange, source: string): PsiNode | null {
  if (!root) return null
  const expected = canonicalize(source.slice(range.start, range.end)).value
  let best: PsiNode | null = null
  let bestQuality = Number.POSITIVE_INFINITY
  let bestLength = Number.POSITIVE_INFINITY

  function visit(node: PsiNode): void {
    const start = node.startOffset
    const end = node.endOffset
    if (typeof start !== "number" || typeof end !== "number" || start > range.start || end < range.end) return

    const exact = start === range.start && end === range.end
    const sameContent = expected.length > 0 && canonicalize(source.slice(start, end)).value === expected
    // An exact PSI element is ideal. Formatting may have changed only its
    // whitespace; otherwise choose the smallest enclosing element. A text
    // range remains available for precise inline highlighting in either case.
    const quality = exact ? 0 : sameContent ? 1 : 2
    const length = end - start
    if (quality < bestQuality || (quality === bestQuality && length < bestLength)) {
      best = node
      bestQuality = quality
      bestLength = length
    }
    for (const child of childrenOf(node)) visit(child)
  }

  visit(root)
  return best
}

function offsetAtLineColumn(text: string, line: number | null, lineEnd: number | null, column: number | null): number | null {
  if (line === null || line < 1) return null
  const targetLine = lineEnd ?? line
  const lines = text.split("\n")
  if (targetLine < 1 || targetLine > lines.length) return null
  let offset = 0
  for (let index = 0; index < targetLine - 1; index += 1) offset += lines[index].length + 1
  return offset + (column === null ? 0 : Math.min(Math.max(column - 1, 0), lines[targetLine - 1].length))
}

/**
 * When the reconstructed After is exactly the requested operation plus
 * formatting, the operation itself identifies the occurrence, even if the
 * same snippet appears several times. This is stronger than text searching.
 */
function replayedContentRange(
  beforeText: string,
  afterText: string,
  operation: ChangeFocusOperation,
  snippet: string,
  sourceRange: TextRange | null,
  targetOffset: number | null,
): TextRange | null {
  let replayed = ""
  let insertionStart = 0
  if (operation === "create" && targetOffset !== null && targetOffset <= beforeText.length) {
    insertionStart = targetOffset
    replayed = beforeText.slice(0, insertionStart) + snippet + beforeText.slice(insertionStart)
  } else if (operation === "update" && sourceRange && sourceRange.end <= beforeText.length) {
    insertionStart = sourceRange.start
    replayed = beforeText.slice(0, sourceRange.start) + snippet + beforeText.slice(sourceRange.end)
  } else if (operation === "move" && sourceRange && sourceRange.end <= beforeText.length &&
      targetOffset !== null && targetOffset <= beforeText.length &&
      (targetOffset < sourceRange.start || targetOffset > sourceRange.end)) {
    const withoutSource = beforeText.slice(0, sourceRange.start) + beforeText.slice(sourceRange.end)
    insertionStart = targetOffset > sourceRange.end
      ? targetOffset - (sourceRange.end - sourceRange.start) : targetOffset
    replayed = withoutSource.slice(0, insertionStart) + snippet + withoutSource.slice(insertionStart)
  } else {
    return null
  }

  if (replayed === afterText && snippet.length > 0) {
    let start = insertionStart
    let end = insertionStart + snippet.length
    if (canonicalize(snippet).value.length > 0) {
      while (start < end && /\s/.test(afterText[start])) start += 1
      while (end > start && /\s/.test(afterText[end - 1])) end -= 1
    }
    return { start, end }
  }
  const expected = canonicalize(replayed)
  const actual = canonicalize(afterText)
  if (expected.value !== actual.value) return null
  const start = canonicalIndexAtOffset(expected, insertionStart)
  const end = canonicalIndexAtOffset(expected, insertionStart + snippet.length)
  if (end <= start || end > actual.offsets.length) return null
  return { start: actual.offsets[start], end: actual.offsets[end - 1] + 1 }
}

/** A fallback occurrence is accepted only if undoing it reproduces the entire
 * other state (ignoring layout only). Context scores/distances are not proof. */
function findContentRange(beforeText: string, afterText: string, snippet: string, _anchor: TextRange | null,
  operation: ChangeFocusOperation, sourceRange: TextRange | null): TextRange | null {
  const before = canonicalize(beforeText), after = canonicalize(afterText), target = canonicalize(snippet).value
  if (!target || before.value === after.value) return null
  let expected = before.value
  let replacement = ""
  if (operation === "move" || operation === "update") {
    if (!sourceRange) return null
    const start = canonicalIndexAtOffset(before, sourceRange.start), end = canonicalIndexAtOffset(before, sourceRange.end)
    if (operation === "move") expected = before.value.slice(0, start) + before.value.slice(end)
    else replacement = before.value.slice(start, end)
  } else if (operation !== "create") return null
  const matches: TextRange[] = []
  for (let index = after.value.indexOf(target); index >= 0; index = after.value.indexOf(target, index + 1)) {
    const end = index + target.length
    if (after.value.slice(0,index) + replacement + after.value.slice(end) === expected)
      matches.push({ start: after.offsets[index], end: after.offsets[end - 1] + 1 })
  }
  return matches.length === 1 ? matches[0] : null
}

function emptyFocus(): ChangeFocus {
  return { node: null, range: null, source: "none" }
}

function focusAtRange(tree: PsiNode | null, source: string, range: TextRange | null, origin: "range" | "content"): ChangeFocus {
  if (!range || range.start < 0 || range.end > source.length || range.end <= range.start) return emptyFocus()
  return { node: findNodeForRange(tree, range, source), range, source: origin }
}

/** Resolve each panel from its own reconstructed PSI snapshot. */
export function resolveChangeFocus(params: {
  operation: ChangeFocusOperation
  beforeModel: JavaModel | null
  afterModel: JavaModel | null
  reqBody: unknown
}): ChangeFocusPair {
  const body = parseBody(params.reqBody)
  const start = parseNumber(body.startOffset)
  const end = parseNumber(body.endOffset)
  const line = parseNumber(body.line)
  const lineEnd = parseNumber(body.lineEnd)
  const column = parseNumber(body.column)
  const beforeTree = isPsiNode(params.beforeModel?.tree) ? params.beforeModel.tree : null
  const afterTree = isPsiNode(params.afterModel?.tree) ? params.afterModel.tree : null
  const beforeText = renderLeafText(beforeTree)
  const afterText = renderLeafText(afterTree)
  const recorded = parseBody(params.reqBody) as ChangeRequestBody & { recordVersion?: number; beforeText?: string; afterText?: string }
  if ((recorded.recordVersion === 2 || recorded.recordVersion === 3) && (recorded.beforeText !== beforeText || recorded.afterText !== afterText))
    return { before: emptyFocus(), after: emptyFocus() }
  const navigation = (body as unknown as Record<string,unknown>).navigation
  const facts = (body as unknown as { changeMetadata?: { before?: { range?: { start: number; end: number } | null }; after?: { range?: { start: number; end: number } | null } } }).changeMetadata
  if (navigation && facts) return {
    before: beforeTree && facts.before?.range ? focusAtRange(beforeTree, beforeText, facts.before.range, 'range') : emptyFocus(),
    after: afterTree && facts.after?.range ? focusAtRange(afterTree, afterText, facts.after.range, 'range') : emptyFocus(),
  }
  const originalRange = start !== null && end !== null && end > start && end <= beforeText.length
    ? { start, end } : null
  let before = beforeTree && params.operation !== "create"
    ? focusAtRange(beforeTree, beforeText, originalRange, "range") : emptyFocus()

  if (params.operation === "delete" && originalRange && canonicalize(beforeText.slice(0,originalRange.start) + beforeText.slice(originalRange.end)).value !== canonicalize(afterText).value) before = emptyFocus()
  if (!afterTree || params.operation === "delete" ||
      (params.operation === "create" && beforeText === afterText)) {
    return { before, after: emptyFocus() }
  }

  let snippet: string | null = null
  let anchor: TextRange | null = null
  let targetOffset: number | null = null
  if (params.operation === "create") {
    snippet = typeof body.insertedContent === "string" ? body.insertedContent : typeof body.content === "string" ? body.content : null
    targetOffset = offsetAtLineColumn(beforeText, line, lineEnd, column)
    if (targetOffset !== null) anchor = { start: targetOffset, end: targetOffset }
  } else if (params.operation === "update") {
    snippet = typeof body.newContent === "string" ? body.newContent : null
    anchor = originalRange
  } else if (params.operation === "move" && originalRange && originalRange.end <= beforeText.length) {
    snippet = typeof body.insertedContent === "string" ? body.insertedContent : beforeText.slice(originalRange.start, originalRange.end)
    targetOffset = offsetAtLineColumn(beforeText, line, lineEnd, column)
    if (targetOffset !== null &&
        (targetOffset < originalRange.start || targetOffset > originalRange.end)) {
      anchor = { start: targetOffset, end: targetOffset }
    } else {
      targetOffset = null
    }
  }

  const replaySnippet = params.operation === "create" && snippet && lineEnd !== null && !snippet.endsWith("\n")
    ? snippet + "\n" : snippet
  const matched = snippet
    ? replayedContentRange(beforeText, afterText, params.operation, replaySnippet ?? snippet, originalRange, targetOffset) ??
      findContentRange(beforeText, afterText, snippet, anchor, params.operation, originalRange)
    : null
  if (!matched && (params.operation === "update" || params.operation === "move")) {
    const emptyUpdate = params.operation === "update" && snippet === "" && originalRange &&
      canonicalize(beforeText.slice(0,originalRange.start) + beforeText.slice(originalRange.end)).value === canonicalize(afterText).value
    if (!emptyUpdate) before = emptyFocus()
  }
  // Inserted component separators prove the operation but are not part of its PSI node.
  if (matched && afterText.slice(matched.start, matched.end).trim()) {
    while (matched.start < matched.end && /\s/.test(afterText[matched.start])) matched.start += 1
    while (matched.end > matched.start && /\s/.test(afterText[matched.end - 1])) matched.end -= 1
  }
  const after = focusAtRange(afterTree, afterText, matched, "content")
  return { before, after }
}
