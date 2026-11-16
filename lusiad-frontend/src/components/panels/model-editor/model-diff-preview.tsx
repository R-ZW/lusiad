"use client"

import { useMemo } from "react"
import baseModelTreeData from "@/lib/data-example/model_tree.json"
import createModelTreeData from "@/lib/data-example/model_tree_create.json"
import deleteModelTreeData from "@/lib/data-example/model_tree_delete.json"
import {
  LINE_HEIGHT_REM,
  buildReferencePathContext,
  collectBoxOverlays,
  collectLeafTextSegments,
} from "@/lib/models/model-editor/model-canvas.model"
import { renderLeafTextContent } from "@/lib/models/model-editor/model-tree.model"
import type { JavaModel, PsiNode } from "@/lib/types"
import { cn } from "@/lib/utils"

export type DiffOperation = "create" | "delete" | "update"

type HighlightTone = "none" | "create" | "delete" | "update"

interface LineColumnRange {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

interface DiffPaneConfig {
  modelName: string
  model: JavaModel
  tone: HighlightTone
  sourceOverride?: string
}

interface DiffOperationConfig {
  operationText: string
  range: LineColumnRange
  before: DiffPaneConfig
  after: DiffPaneConfig
}

interface ModelDiffPreviewProps {
  operation: DiffOperation
}

interface HighlightRect {
  topRem: number
  leftCh: number
  widthCh: number
  heightRem: number
}

const BASE_MODEL = baseModelTreeData as JavaModel
const CREATE_MODEL = createModelTreeData as JavaModel
const DELETE_MODEL = deleteModelTreeData as JavaModel

const DIFF_RANGES: Record<DiffOperation, LineColumnRange> = {
  create: { startLine: 5, startColumn: 9, endLine: 5, endColumn: 18 },
  delete: { startLine: 5, startColumn: 17, endLine: 5, endColumn: 52 },
  update: { startLine: 5, startColumn: 17, endLine: 5, endColumn: 52 },
}

const DIFF_OPERATION_TEXT: Record<DiffOperation, string> = {
  create: "create(5:9; 5:18)",
  delete: "delete(5:17; 5:52)",
  update: "update(5:17; 5:52)",
}

const TONE_CLASSES: Record<Exclude<HighlightTone, "none">, string> = {
  create: "bg-emerald-400/30 ring-1 ring-emerald-500/55",
  delete: "bg-red-400/30 ring-1 ring-red-500/55",
  update: "bg-amber-400/30 ring-1 ring-amber-500/55",
}

function comparePosition(aLine: number, aColumn: number, bLine: number, bColumn: number): number {
  if (aLine < bLine) {
    return -1
  }

  if (aLine > bLine) {
    return 1
  }

  if (aColumn < bColumn) {
    return -1
  }

  if (aColumn > bColumn) {
    return 1
  }

  return 0
}

function nodeContainsRange(node: PsiNode, range: LineColumnRange): boolean {
  const startsBeforeOrAtRange = comparePosition(node.startLine, node.startColumn, range.startLine, range.startColumn) <= 0
  const endsAfterOrAtRange = comparePosition(node.endLine, node.endColumn, range.endLine, range.endColumn) >= 0

  return startsBeforeOrAtRange && endsAfterOrAtRange
}

function findSmallestContainingNode(node: PsiNode, range: LineColumnRange): PsiNode | null {
  if (!nodeContainsRange(node, range)) {
    return null
  }

  const children = node.children ?? []

  for (const child of children) {
    const match = findSmallestContainingNode(child, range)

    if (match) {
      return match
    }
  }

  return node
}

function buildReplacementTextForNodeType(nodeType: string): string {
  const normalizedType = nodeType.toLowerCase()

  if (normalizedType.includes("identifier")) {
    return "updatedIdentifier"
  }

  if (normalizedType.includes("literal")) {
    return '"updatedValue"'
  }

  if (normalizedType.includes("expression")) {
    return "computeUpdatedValue()"
  }

  if (normalizedType.includes("statement")) {
    return "if (isValid) { process(); }"
  }

  if (normalizedType.includes("keyword")) {
    return "final"
  }

  if (normalizedType.includes("type")) {
    return "String"
  }

  return `updated_${nodeType.replace(/^Psi/, "").replace(/Impl$/, "").toLowerCase()}`
}

function buildLineStartOffsets(sourceText: string): number[] {
  const lineStartOffsets: number[] = [0]

  for (let index = 0; index < sourceText.length; index += 1) {
    if (sourceText[index] === "\n") {
      lineStartOffsets.push(index + 1)
    }
  }

  return lineStartOffsets
}

function resolveOffset(lineStartOffsets: number[], line: number, column: number): number {
  const lineStart = lineStartOffsets[Math.max(0, line - 1)] ?? 0
  return lineStart + Math.max(0, column - 1)
}

function buildUpdateAfterSourceText(baseModel: JavaModel, range: LineColumnRange): string {
  const baseSourceText = renderLeafTextContent(baseModel.tree)
  const lineStartOffsets = buildLineStartOffsets(baseSourceText)
  const startOffset = resolveOffset(lineStartOffsets, range.startLine, range.startColumn)
  const endOffsetExclusive = resolveOffset(lineStartOffsets, range.endLine, range.endColumn + 1)

  if (endOffsetExclusive <= startOffset || startOffset < 0 || endOffsetExclusive > baseSourceText.length) {
    return baseSourceText
  }

  const targetNode = findSmallestContainingNode(baseModel.tree, range)
  const replacement = buildReplacementTextForNodeType(targetNode?.type ?? "PsiElement")

  return `${baseSourceText.slice(0, startOffset)}${replacement}${baseSourceText.slice(endOffsetExclusive)}`
}

function buildOperationConfig(operation: DiffOperation): DiffOperationConfig {
  const range = DIFF_RANGES[operation]

  if (operation === "create") {
    return {
      operationText: DIFF_OPERATION_TEXT.create,
      range,
      before: {
        modelName: "model_tree",
        model: BASE_MODEL,
        tone: "none",
      },
      after: {
        modelName: "model_tree_create",
        model: CREATE_MODEL,
        tone: "create",
      },
    }
  }

  if (operation === "delete") {
    return {
      operationText: DIFF_OPERATION_TEXT.delete,
      range,
      before: {
        modelName: "model_tree",
        model: BASE_MODEL,
        tone: "delete",
      },
      after: {
        modelName: "model_tree_delete",
        model: DELETE_MODEL,
        tone: "none",
      },
    }
  }

  return {
    operationText: DIFF_OPERATION_TEXT.update,
    range,
    before: {
      modelName: "model_tree",
      model: BASE_MODEL,
      tone: "update",
    },
    after: {
      modelName: "model_tree_update (calculado)",
      model: BASE_MODEL,
      tone: "update",
      sourceOverride: buildUpdateAfterSourceText(BASE_MODEL, range),
    },
  }
}

function buildHighlightRects(sourceLines: string[], range: LineColumnRange): HighlightRect[] {
  const rects: HighlightRect[] = []

  for (let lineNumber = range.startLine; lineNumber <= range.endLine; lineNumber += 1) {
    const lineText = sourceLines[lineNumber - 1] ?? ""
    const startIndex = lineNumber === range.startLine ? Math.max(0, range.startColumn - 1) : 0
    const endIndex = lineNumber === range.endLine ? Math.min(lineText.length, range.endColumn) : lineText.length

    if (endIndex <= startIndex) {
      continue
    }

    rects.push({
      topRem: (lineNumber - 1) * LINE_HEIGHT_REM + 0.2,
      leftCh: startIndex,
      widthCh: Math.max(1, endIndex - startIndex),
      heightRem: Math.max(0.5, LINE_HEIGHT_REM - 0.4),
    })
  }

  return rects
}

interface DiffModelPaneProps {
  title: string
  modelName: string
  model: JavaModel
  range: LineColumnRange
  tone: HighlightTone
  sourceOverride?: string
}

function DiffModelPane({ title, modelName, model, range, tone, sourceOverride }: DiffModelPaneProps) {
  const sourceText = sourceOverride ?? renderLeafTextContent(model.tree)
  const sourceLines = sourceText.split("\n")
  const lineDigits = String(sourceLines.length).length
  const leafSegments = collectLeafTextSegments(model.tree).filter((segment) => segment.text.length > 0)
  const shouldUseLeafSegments = !sourceOverride && leafSegments.length > 0
  const referencePathContext = buildReferencePathContext(model.tree, sourceLines)
  const overlays = collectBoxOverlays(model.tree, sourceLines, referencePathContext)
  const highlightRects = tone === "none" ? [] : buildHighlightRects(sourceLines, range)

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-background">
      <header className="shrink-0 border-b border-border bg-muted/30 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{modelName}</p>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="inline-flex min-h-full min-w-full items-stretch gap-3">
          <aside
            className="select-none pt-4 text-right text-xs text-muted-foreground"
            style={{ width: `${lineDigits + 1}ch` }}
          >
            <div className="m-0 font-mono">
              {sourceLines.map((_, index) => (
                <div
                  key={`${title}-line-${index + 1}`}
                  className="flex items-center justify-end"
                  style={{ height: `${LINE_HEIGHT_REM}rem` }}
                >
                  <span>{index + 1}</span>
                </div>
              ))}
            </div>
          </aside>

          <div className="min-h-full min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-background p-4">
            <div className="relative w-full min-w-max font-mono text-sm" style={{ lineHeight: `${LINE_HEIGHT_REM}rem` }}>
              <pre
                className="m-0 whitespace-pre font-mono text-sm text-foreground"
                data-model-text="true"
                style={{ lineHeight: `${LINE_HEIGHT_REM}rem` }}
              >
                {shouldUseLeafSegments
                  ? leafSegments.map((segment) => (
                      <span key={segment.id} className="text-foreground">
                        {segment.text}
                      </span>
                    ))
                  : sourceText}
              </pre>

              {highlightRects.length > 0 && (
                <div className="pointer-events-none absolute inset-0">
                  {highlightRects.map((rect, index) => (
                    <div
                      key={`${title}-highlight-${index}`}
                      className={cn("absolute rounded-sm", TONE_CLASSES[tone as Exclude<HighlightTone, "none">])}
                      style={{
                        top: `${rect.topRem}rem`,
                        left: `${rect.leftCh}ch`,
                        width: `${rect.widthCh}ch`,
                        height: `${rect.heightRem}rem`,
                        zIndex: 350,
                      }}
                    />
                  ))}
                </div>
              )}

              <div className="pointer-events-none absolute inset-0 font-mono text-sm">
                {overlays.map((overlay) => (
                  <div
                    key={overlay.id}
                    data-model-overlay="true"
                    className="absolute rounded-none border border-zinc-500/60 bg-zinc-400/5"
                    style={{
                      top: `${overlay.topRem}rem`,
                      left: `${overlay.leftCh}ch`,
                      width: `${overlay.widthCh}ch`,
                      height: `${overlay.heightRem}rem`,
                      zIndex: overlay.depth + 1,
                    }}
                    title={`Tipo: ${overlay.node.type} | Linha ${overlay.node.startLine}, Coluna ${overlay.node.startColumn}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function ModelDiffPreview({ operation }: ModelDiffPreviewProps) {
  const config = useMemo(() => buildOperationConfig(operation), [operation])

  return (
    <main className="h-full bg-background p-4 md:p-6">
      <div className="flex h-full min-h-80 flex-col overflow-hidden rounded-xl border border-border bg-card/30 p-4">
        <div className="shrink-0 border-b border-border pb-3">
          <h2 className="text-base font-semibold">Comparacao de Mudancas</h2>
          <p className="mt-1 text-xs text-muted-foreground">Mock sem edicao | Operacao: {config.operationText}</p>
        </div>

        <div className="mt-4 min-h-0 flex-1">
          <div className="grid h-full min-h-0 gap-4 lg:grid-cols-2">
            <DiffModelPane
              title="Antes"
              modelName={config.before.modelName}
              model={config.before.model}
              range={config.range}
              tone={config.before.tone}
              sourceOverride={config.before.sourceOverride}
            />
            <DiffModelPane
              title="Depois"
              modelName={config.after.modelName}
              model={config.after.model}
              range={config.range}
              tone={config.after.tone}
              sourceOverride={config.after.sourceOverride}
            />
          </div>
        </div>
      </div>
    </main>
  )
}
