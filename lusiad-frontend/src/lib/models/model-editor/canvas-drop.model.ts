import type { PsiNode } from "../../types.ts"
import { LINE_HEIGHT_REM, type DragPreview } from "./model-canvas.model.ts"

/** Empty destinations come from PSI containers, never braces inside source literals. */
export function resolveCanvasDrop(tree: PsiNode, source: string, lineIndex: number, columnIndex: number): DragPreview | null {
  const lines = source.split("\n")
  const line = Math.max(0, Math.min(lines.length - 1, lineIndex)) + 1
  let block: DragPreview | null = null
  function visit(node: PsiNode) {
    const children = node.children ?? []
    if (/(?:CodeBlock|Class)Impl$/.test(node.type)) {
      const open = children.find(child => child.text === "{")
      const close = children.findLast(child => child.text === "}")
      if (open?.endOffset !== undefined && close?.startOffset !== undefined && open.startLine === line && close.startLine === line
          && !source.slice(open.endOffset, close.startOffset).trim()
          && columnIndex >= open.startColumn - 1 && columnIndex <= close.endColumn) {
        block = { mode: "inline-empty-block", line, nextLine: line + 1,
          column: open.startColumn + 1, leftCh: open.startColumn - 1,
          widthCh: close.endColumn - open.startColumn + 1,
          topRem: (line - 1) * LINE_HEIGHT_REM + 0.22, heightRem: LINE_HEIGHT_REM - 0.44 }
      }
    }
    for (const child of children) visit(child)
  }
  visit(tree)
  const preview: DragPreview = block ?? (!lines[line - 1].trim()
    ? { mode: "line", line, nextLine: line + 1 }
    : line === lines.length
      ? { mode: "end", line, nextLine: line + 1, column: lines[line - 1].length + 1 }
      : { mode: "between", line, nextLine: line + 1 })
  const target = dropDestination(preview)
  const targetLine = target.lineEnd ?? target.line
  const offset = lines.slice(0, targetLine - 1).reduce((sum, text) => sum + text.length + 1, 0) + (target.column ?? 1) - 1
  function protectedInterior(node: PsiNode): boolean {
    const literalOrComment = /Comment|LiteralExpression/.test(node.type)
      || (!node.children?.length && /^["']/.test(node.text ?? ""))
    if (literalOrComment && node.startOffset !== undefined && node.endOffset !== undefined
        && offset > node.startOffset && offset < node.endOffset) return true
    return (node.children ?? []).some(protectedInterior)
  }
  return protectedInterior(tree) ? null : preview
}

export function dropDestination(preview: DragPreview): { line: number; column?: number; lineEnd?: number } {
  if (preview.mode === "inline-empty-block" || preview.mode === "end") return { line: preview.line, column: preview.column }
  return preview.mode === "between" ? { line: preview.line, lineEnd: preview.nextLine } : { line: preview.line }
}

/** Offsets are meaningful only in the exact canvas revision which started the drag. */
export function validMovePayload(value: unknown, sourceId: string, length: number): value is { sourceId: string; startOffset: number; endOffset: number; type?: string } {
  if (!value || typeof value !== "object") return false
  const item = value as Record<string, unknown>
  return item.sourceId === sourceId && Number.isSafeInteger(item.startOffset) && Number.isSafeInteger(item.endOffset)
    && Number(item.startOffset) >= 0 && Number(item.endOffset) > Number(item.startOffset) && Number(item.endOffset) <= length
    && (item.type === undefined || typeof item.type === "string")
}
