import type { PsiNode } from "../../types.ts"
import { listLibrarySnippetsModel, type LibrarySnippet } from "./components-panel.model.ts"
import { EXAMPLE_DRAG_MIME_TYPE, LIBRARY_PREVIEW_MIME_PREFIX } from "./model-editor-dnd.model.ts"
import { BOX_GAP_VERTICAL_REM, LINE_HEIGHT_REM, buildLineStartOffsets, type BoxOverlay, type DragPreview } from "./model-canvas.model.ts"

const templates = new Map(listLibrarySnippetsModel().flatMap(group => group.snippets).map(snippet => [snippet.id, snippet]))
export function draggedLibraryTemplate(types: readonly string[]): LibrarySnippet | null {
  if (!types.includes(EXAMPLE_DRAG_MIME_TYPE)) return null
  return [...templates.values()].find(snippet => types.includes(LIBRARY_PREVIEW_MIME_PREFIX + snippet.id)) ?? null
}

function position(starts: number[], offset: number) {
  let low = 0, high = starts.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (starts[middle] <= offset) low = middle
    else high = middle - 1
  }
  return { line: low, column: offset - starts[low] }
}

function insertionIndent(tree: PsiNode, source: string, offset: number, line: number) {
  const lines = source.split("\n")
  const leading = (value: string) => value.match(/^[\t ]*/)?.[0] ?? ""
  let indent = leading(lines[line - 1] ?? "")
  // Positioning only: reuse the existing container, without parsing or checking the proposal.
  function visit(node: PsiNode) {
    const children = node.children ?? []
    const open = children.find(child => child.text === "{")
    const close = children.findLast(child => child.text === "}")
    if (/(?:CodeBlock|Class)Impl$/.test(node.type) && open?.endOffset !== undefined && close?.startOffset !== undefined
      && open.endOffset <= offset && offset <= close.startOffset) {
      const base = leading(lines[node.startLine - 1] ?? "")
      const childIndent = children.map(child => leading(lines[child.startLine - 1] ?? "")).find(value => value.startsWith(base) && value.length > base.length)
      indent = childIndent ?? base + (base.includes("\t") || lines.some(value => value.startsWith("\t")) ? "\t" : "    ")
    }
    children.forEach(visit)
  }
  visit(tree)
  return indent
}

export interface CanvasInsertionPreview {
  componentId: string
  destination: DragPreview
  before: string
  component: string
  after: string
  text: string
  lines: string[]
  lineStarts: number[]
  sourceLineStarts: number[]
  sourceLength: number
  offset: number
  insertedLength: number
  firstLine: number
  lastLine: number
  widthCh: number
  highlight: { topRem: number; leftCh: number; widthCh: number; heightRem: number }
  boxes: { id: string; topRem: number; leftCh: number; widthCh: number; heightRem: number; depth: number }[]
}

/** Disposable visual projection. No parser, formatter, diagnostic, model mutation or I/O. */
export function buildCanvasInsertionPreview(tree: PsiNode, source: string, destination: DragPreview, snippet: LibrarySnippet, overlays: BoxOverlay[] = []): CanvasInsertionPreview {
  const sourceLineStarts = buildLineStartOffsets(source)
  const line = destination.mode === "between" ? destination.nextLine : destination.line
  const column = "column" in destination ? destination.column - 1 : 0
  const offset = Math.min(source.length, (sourceLineStarts[line - 1] ?? source.length) + column)
  const eol = source.includes("\r\n") ? "\r\n" : "\n"
  const indent = insertionIndent(tree, source, offset, line)
  const component = snippet.content.replace(/\r\n/g, "\n").split("\n").map(value => value ? indent + value : value).join(eol)
  const prefix = offset > 0 && source[offset - 1] !== "\n" ? eol : ""
  const suffix = component.endsWith("\n") ? "" : eol
  const before = source.slice(0, offset) + prefix
  const after = suffix + source.slice(offset)
  const text = before + component + after
  const insertedLength = prefix.length + component.length + suffix.length
  const lines = text.split("\n")
  const lineStarts = buildLineStartOffsets(text)
  const firstLine = position(lineStarts, before.length).line
  const lastLine = position(lineStarts, Math.max(before.length, before.length + component.length - eol.length * Number(component.endsWith(eol)) - 1)).line
  const contentLines = component.replace(/\r?\n$/, "").split(/\r?\n/)
  const leftCh = Math.min(...contentLines.filter(value => value.trim()).map(value => value.match(/^[\t ]*/)?.[0].length ?? 0), indent.length)
  const mapStart = (value: number) => value >= offset ? value + insertedLength : value
  const mapEnd = (value: number) => value > offset ? value + insertedLength : value
  const boxes = overlays.filter(overlay => !/WhiteSpace/.test(overlay.node.type)).flatMap(overlay => {
    const { startOffset, endOffset } = overlay.node
    if (startOffset === undefined || endOffset === undefined || endOffset <= startOffset) return []
    const file = /JavaFile/.test(overlay.node.type)
    const mappedStart = file && startOffset === offset ? startOffset : mapStart(startOffset)
    const mappedEnd = file && endOffset === offset ? endOffset + insertedLength : mapEnd(endOffset)
    const start = position(lineStarts, mappedStart)
    const end = position(lineStarts, Math.max(mappedStart, mappedEnd - 1))
    const leftCh = overlay.leftCh + start.column - (overlay.node.startColumn - 1)
    const widthCh = lines.slice(start.line, end.line + 1).reduce((width, value) => Math.max(width, value.replace(/\r$/, "").length - leftCh + 0.45), overlay.widthCh)
    return [{ id: overlay.id, depth: overlay.depth, leftCh, widthCh,
      topRem: start.line * LINE_HEIGHT_REM + BOX_GAP_VERTICAL_REM,
      heightRem: Math.max(0.5, (end.line - start.line + 1) * LINE_HEIGHT_REM - 2 * BOX_GAP_VERTICAL_REM) }]
  })
  return { componentId: snippet.id, destination, before, component, after, text, lines, lineStarts, sourceLineStarts, sourceLength: source.length,
    offset, insertedLength, firstLine, lastLine, widthCh: Math.max(lines.reduce((width, value) => Math.max(width, value.length), 1), boxes.reduce((width, box) => Math.max(width, box.leftCh + box.widthCh), 1)), boxes,
    highlight: { topRem: firstLine * LINE_HEIGHT_REM + BOX_GAP_VERTICAL_REM, leftCh,
      widthCh: Math.max(4, ...contentLines.map(value => value.length - leftCh)) + 0.5,
      heightRem: Math.max(1, lastLine - firstLine + 1) * LINE_HEIGHT_REM - 2 * BOX_GAP_VERTICAL_REM } }
}

/** Keep the insertion band stable under the cursor; map surrounding projected rows back to the saved source. */
export function sourcePositionFromInsertion(preview: CanvasInsertionPreview, lineIndex: number, columnIndex: number): { line: number; column: number } | null {
  const line = Math.max(0, Math.min(preview.lines.length - 1, lineIndex))
  if (line >= preview.firstLine && line <= preview.lastLine) return null
  const offset = preview.lineStarts[line] + Math.min(columnIndex, preview.lines[line].replace(/\r$/, "").length)
  const original = offset < preview.offset ? offset : Math.max(preview.offset, offset - preview.insertedLength)
  return position(preview.sourceLineStarts, Math.min(original, preview.sourceLength))
}
