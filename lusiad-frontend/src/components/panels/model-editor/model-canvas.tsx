"use client"
import { useEffect, useRef } from "react"
import type { ProblemLocation } from "@/lib/models/model-editor/problems.model"
import type { CreateComponentRequest } from "@/lib/models/model-editor/component-creation.model"

import { Maximize2, Minimize2, Move, Trash2 } from "lucide-react"
import type { PsiNode } from "@/lib/types"
import {
  LINE_HEIGHT_REM,
  getNodeBorderVisualStyle,
  getSegmentColorClass,
  isDescendantPath,
  isHiddenByCollapsedAncestor,
  type BoxOverlay,
} from "@/lib/models/model-editor/model-canvas.model"
import { CanvasInsertionPreview } from "./canvas-insertion-preview"
import { useModelCanvasInteractions } from "./model-canvas.interactions"
import { useI18n } from "@/lib/i18n/locale-provider"
import { blockGroup } from '@/lib/appearance'

/** Props do painel central de renderizacao e interacao com o modelo PSI. */
export interface ModelCanvasProps {
  diagnosticLocation?: ProblemLocation | null
  readOnly?: boolean
  /** Texto fonte de fallback quando a arvore nao expor folhas renderizaveis. */
  leafTextContent: string
  /** Raiz da arvore PSI atualmente carregada. */
  tree: PsiNode
  /** No atualmente selecionado no canvas. */
  selectedNode: PsiNode | null
  /** Flag visual de exclusao em andamento. */
  isDeletingNode?: boolean
  /** Flag visual de criacao em andamento. */
  isCreatingNode?: boolean
  /** Flag visual de movimentacao em andamento. */
  isMovingNode?: boolean
  /** Seleciona um no PSI no canvas. */
  onSelectNode: (node: PsiNode) => void
  /** Limpa selecao atual. */
  onClearSelection: () => void
  /** Exclui um no PSI por seus offsets. */
  onDeleteNode: (node: PsiNode) => Promise<void> | void
  /** Exclui uma linha em branco por range de offsets resolvido no canvas. */
  onDeleteLine: (lineNumber: number, startOffset: number, endOffset: number) => Promise<void> | void
  /** Cria snippet em linha unica ou intervalo de linhas. */
  onCreateSnippet: (params: CreateComponentRequest) => Promise<void> | void
  /** Move trecho entre offsets para nova linha/intervalo. */
  onMoveNode: (params: { startOffset: number; endOffset: number; line: number; lineEnd?: number }) => Promise<void> | void
  /** Publica erros/avisos de drop para o log superior. */
  onDropLog: (message: string) => void
}

/**
 * Componente visual do canvas de modelo.
 * Toda logica de estado e interacao fica em useModelCanvasInteractions.
 */
export function ModelCanvas({
  diagnosticLocation,
  readOnly = false,
  leafTextContent,
  tree,
  selectedNode,
  isDeletingNode = false,
  isCreatingNode = false,
  isMovingNode = false,
  onSelectNode,
  onClearSelection,
  onDeleteNode,
  onDeleteLine,
  onCreateSnippet,
  onMoveNode,
  onDropLog,
}: ModelCanvasProps) {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (diagnosticLocation?.line) canvasRef.current?.querySelector(`[data-testid="canvas-line"][data-line="${diagnosticLocation.line}"]`)?.scrollIntoView({ block: 'center', inline: 'nearest' })
  }, [diagnosticLocation, tree])
  // O hook consolida derivacoes (overlays, linhas, preview de drag) e handlers.
  const {
    codeTextRef,
    collapsedNodePaths,
    dragPreview,
    insertionPreview,
    hasRenderableLeafText,
    nonEmptyLeafSegments,
    sourceText,
    sourceLines,
    lineNumberDigits,
    selectedNodePath,
    visibleOverlays,
    visibleHoverOnlyOverlays,
    blankLineNodes,
    toggleCollapsedNode,
    handleMoveDragStart,
    handleDragSourceEnd,
    handleDeleteIntent,
    handleDeleteWhitespaceLine,
    handleCanvasShellClick,
    handleModelBoxClick,
    handleModelBoxDragOver,
    handleModelBoxDragLeave,
    handleModelBoxDrop,
  } = useModelCanvasInteractions({
    leafTextContent,
    readOnly,
    tree,
    selectedNode,
    isCreatingNode,
    isMovingNode,
    onClearSelection,
    onDeleteNode,
    onDeleteLine,
    onCreateSnippet,
    onMoveNode,
    onDropLog,
  })

  const displayLines = insertionPreview?.lines ?? sourceLines

  // Leaf components (comments) and inline components share the same actions.
  // Only collapsing requires children.
  const renderNodeActions = (overlay: BoxOverlay) => overlay.nodePath === selectedNodePath && (
    <div data-model-action="true" className="absolute -right-8 top-1/2 z-50 flex -translate-y-1/2 flex-col gap-1 rounded-sm border border-border bg-background/95 p-1 shadow-md">
      {!overlay.isLeaf && (
        <button type="button" data-model-action="true" data-testid="node-collapse"
          className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          title={collapsedNodePaths.has(overlay.nodePath) ? t('editor.expandNode') : t('editor.collapseNode')}
          onClick={(event) => { event.stopPropagation(); toggleCollapsedNode(overlay.nodePath) }}>
          {collapsedNodePaths.has(overlay.nodePath) ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
        </button>
      )}
      <button type="button" data-model-action="true" data-testid="node-move" draggable={!readOnly} disabled={readOnly || isMovingNode}
        className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        title={isMovingNode ? t('editor.moving') : t('editor.dragToMove')}
        onClick={(event) => event.stopPropagation()}
        onDragStart={(event) => handleMoveDragStart(event, overlay.node)} onDragEnd={handleDragSourceEnd}>
        <Move className="h-3.5 w-3.5" />
      </button>
      <button type="button" data-model-action="true" data-testid="node-delete" disabled={readOnly || isDeletingNode}
        className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
        title={isDeletingNode ? t('editor.deleting') : t('editor.delete')}
        onClick={(event) => { event.stopPropagation(); handleDeleteIntent(overlay.node) }}>
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )

  return (
    <main ref={canvasRef} data-testid="model-canvas" data-insertion-preview={Boolean(insertionPreview)} tabIndex={0} aria-label={t('editor.modelKeyboard')}
      onKeyDown={event => {
        if (insertionPreview && event.key === 'Escape') { event.preventDefault(); return }
        if (event.altKey || event.ctrlKey || event.metaKey) return
        const target = event.target
        if (!(target instanceof HTMLElement) || (target !== event.currentTarget && !target.matches('[data-model-overlay="true"]'))) return
        if (event.key === 'Escape') { event.preventDefault(); onClearSelection(); event.currentTarget.focus(); return }
        if (!['Enter', ' ', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-model-overlay="true"][data-node-path]'))
          .sort((a, b) => Number(a.dataset.startOffset ?? Number.MAX_SAFE_INTEGER) - Number(b.dataset.startOffset ?? Number.MAX_SAFE_INTEGER)
            || Number(b.dataset.endOffset ?? 0) - Number(a.dataset.endOffset ?? 0))
        const index = elements.indexOf(target)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? elements.length - 1
          : event.key === 'ArrowDown' ? Math.min(elements.length - 1, index + 1)
          : event.key === 'ArrowUp' ? Math.max(0, index - 1) : Math.max(0, index)
        const element = elements[next]
        const overlay = [...visibleOverlays, ...visibleHoverOnlyOverlays].find(item => item.nodePath === element?.dataset.nodePath)
        if (overlay && element) { onSelectNode(overlay.node); element.focus() }
      }} aria-busy={isDeletingNode || isMovingNode || isCreatingNode} className="h-full overflow-hidden bg-background px-2 pb-5">
      <div
        className="flex h-full min-h-80 flex-col overflow-hidden rounded-xl bg-card/30"
        onClick={handleCanvasShellClick}
      >

        <div className="mt-6 min-h-0 flex-1 overflow-auto">
          <div className="inline-flex min-h-full min-w-full items-stretch gap-3">
            <aside
              className="select-none pt-4 text-right text-xs text-muted-foreground"
              style={{ width: `${Math.max(lineNumberDigits, String(displayLines.length).length) + 1}ch` }}
            >
              <div className="m-0 font-mono">
                {displayLines.map((_, index) => {
                  const lineNumber = index + 1
                  const blankLineNode = insertionPreview ? undefined : blankLineNodes.get(lineNumber)

                  return (
                    <div
                      data-testid={insertionPreview ? "canvas-preview-line" : "canvas-line"} data-line={lineNumber} key={`line-number-${lineNumber}`}
                      data-diagnostic={!insertionPreview && diagnosticLocation?.line === lineNumber || undefined}
                      className={`group relative flex items-center justify-end ${!insertionPreview && diagnosticLocation?.line === lineNumber ? 'canvas-diagnostic-line' : ''}`}
                      style={{ height: `${LINE_HEIGHT_REM}rem` }}
                    >
                      {blankLineNode && (
                        <>
                          <button
                            type="button"
                            data-model-action="true"
                            disabled={readOnly || isDeletingNode}
                            className="absolute left-0 inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-destructive group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                            data-testid="blank-line-delete"
                            title={isDeletingNode ? t('editor.deleting') : t('editor.deleteLine', { line: lineNumber })}
                            onClick={(event) => {
                              if (!readOnly) void handleDeleteWhitespaceLine(event, lineNumber)
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            data-model-action="true"
                            disabled={isDeletingNode}
                            className="rounded-sm px-0 text-right text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                            data-testid="blank-line-select"
                            title={t('editor.selectBlankLine', { line: lineNumber })}
                            onClick={(event) => {
                              event.stopPropagation()
                              onSelectNode(blankLineNode)
                            }}
                          >
                            {lineNumber}
                          </button>
                        </>
                      )}
                      {!blankLineNode && <span>{lineNumber}</span>}
                    </div>
                  )
                })}
              </div>
            </aside>

            <div
              className="min-h-full min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-background p-4"
              onClick={handleModelBoxClick}
              data-testid="canvas-drop-surface" onDragOver={readOnly ? undefined : handleModelBoxDragOver}
              onDragLeave={handleModelBoxDragLeave}
              onDrop={readOnly ? undefined : handleModelBoxDrop}
            >
              <div className="relative z-0 w-full min-w-max font-mono text-sm" style={{ lineHeight: `${LINE_HEIGHT_REM}rem`, minHeight: insertionPreview ? `${displayLines.length * LINE_HEIGHT_REM}rem` : undefined, minWidth: insertionPreview ? `${insertionPreview.widthCh}ch` : undefined }}>
                {/* Leaf spans set visibility explicitly. Opacity hides the entire saved layer
                    while retaining the original geometry used to resolve the drop. */}
                <div data-testid="canvas-saved-model" inert={Boolean(insertionPreview)} aria-hidden={insertionPreview ? true : undefined} style={{ opacity: insertionPreview ? 0 : undefined }}>
                <pre
                  ref={codeTextRef}
                  className="code-text pointer-events-none relative z-[1] m-0 whitespace-pre font-mono text-sm"
                  data-model-text="true"
                  style={{ lineHeight: `${LINE_HEIGHT_REM}rem` }}
                >
                  {hasRenderableLeafText
                    ? nonEmptyLeafSegments.map((segment) => (
                        <span
                          key={segment.id}
                          className={getSegmentColorClass(segment)}
                          style={{
                            visibility: isHiddenByCollapsedAncestor(segment.nodePath, collapsedNodePaths)
                              ? "hidden"
                              : "visible",
                          }}
                        >
                          {segment.text}
                        </span>
                      ))
                    : sourceText}
                </pre>

                {dragPreview && !insertionPreview && (
                  <div data-testid="canvas-drop-guide" className="pointer-events-none absolute inset-0 z-[3000]">
                    {dragPreview.mode === "line" ? (
                      <div
                        className="canvas-drop absolute left-0 right-0 rounded-none border border-dashed"
                        style={{
                          top: `${(dragPreview.line - 1) * LINE_HEIGHT_REM}rem`,
                          height: `${LINE_HEIGHT_REM}rem`,
                        }}
                      />
                    ) : dragPreview.mode === "inline-empty-block" ? (
                      <div
                        className="canvas-drop absolute rounded-sm border border-dashed"
                        style={{
                          top: `${dragPreview.topRem}rem`,
                          left: `${dragPreview.leftCh}ch`,
                          width: `${dragPreview.widthCh}ch`,
                          height: `${dragPreview.heightRem}rem`,
                        }}
                      />
                    ) : (
                      <div
                        className="canvas-drop absolute left-0 right-0 border-t-2 border-dashed"
                        style={{ top: `${dragPreview.line * LINE_HEIGHT_REM}rem` }}
                      />
                    )}
                  </div>
                )}

                <div className="pointer-events-none absolute inset-0 z-0 font-mono text-sm">
                  {visibleOverlays.map((overlay) => {
                    const isSelected = overlay.nodePath === selectedNodePath
                    const isBlankLine = /WhiteSpace/.test(overlay.node.type)
                    const isCollapsed = collapsedNodePaths.has(overlay.nodePath)
                    // Descendentes do no selecionado removem borda para reduzir ruido visual.
                    const isDescendantOfSelected = selectedNodePath
                      ? isDescendantPath(overlay.nodePath, selectedNodePath)
                      : false
                    const borderStyle = getNodeBorderVisualStyle(overlay.node.type)
                    const baseOverlayClass = "absolute cursor-pointer rounded-none border border-r-4 transition-colors"

                      return (
                      <div
                        key={overlay.id}
                        data-testid="psi-node"
                        data-node-path={overlay.nodePath}
                        data-node-type={overlay.node.type} role="group"
                        data-block-group={blockGroup(overlay.node.type)}
                        tabIndex={overlay.nodePath === selectedNodePath ? 0 : -1}
                        aria-label={t('editor.nodeLocation', { type: overlay.node.type, line: overlay.node.startLine, column: overlay.node.startColumn })}
                        data-start-offset={overlay.node.startOffset}
                        data-end-offset={overlay.node.endOffset}
                        data-selected={isSelected}
                        data-collapsed={isCollapsed}
                        data-model-overlay="true"
                        className={
                          `pointer-events-auto ` +
                          (isDescendantOfSelected || (isBlankLine && !isSelected)
                            ? "absolute cursor-pointer rounded-none border border-transparent border-r-transparent bg-transparent"
                            : isSelected
                              ? `${baseOverlayClass} border-2 border-r-[6px] ${borderStyle.border} ${borderStyle.accent} ${borderStyle.background} lusiad-selected`
                              : `${baseOverlayClass} ${borderStyle.border} ${borderStyle.accent} ${borderStyle.background}`)
                        }
                        style={{
                          top: `${overlay.topRem}rem`,
                          left: `${overlay.leftCh}ch`,
                          width: `${overlay.widthCh}ch`,
                          height: `${overlay.heightRem}rem`,
                          zIndex: overlay.depth + 1,
                        }}
                        onClick={() => onSelectNode(overlay.node)}
                        title={t('editor.nodeLocation', {
                          type: overlay.node.type,
                          line: overlay.node.startLine,
                          column: overlay.node.startColumn,
                        })}
                      >
                        {renderNodeActions(overlay)}
                      </div>
                    )
                  })}
                </div>

                {/* Empty space must pass through to structural blocks in the layer below. */}
                <div className="pointer-events-none absolute inset-0 z-0 font-mono text-sm">
                  {visibleHoverOnlyOverlays.map((overlay) => (
                    <div
                      key={overlay.id}
                      data-testid="psi-node"
                      data-node-path={overlay.nodePath}
                      data-node-type={overlay.node.type} role="group"
                      data-block-group={blockGroup(overlay.node.type)}
                        tabIndex={overlay.nodePath === selectedNodePath ? 0 : -1}
                        aria-label={t('editor.nodeLocation', { type: overlay.node.type, line: overlay.node.startLine, column: overlay.node.startColumn })}
                      data-start-offset={overlay.node.startOffset}
                      data-end-offset={overlay.node.endOffset}
                      data-selected={overlay.nodePath === selectedNodePath}
                      data-model-overlay="true"
                      className={`pointer-events-auto absolute cursor-pointer rounded-none border transition-colors lusiad-inline block-${blockGroup(overlay.node.type)} ${overlay.nodePath === selectedNodePath ? 'lusiad-selected border-2' : ''}`}
                      style={{
                        top: `${overlay.topRem}rem`,
                        left: `${overlay.leftCh}ch`,
                        width: `${overlay.widthCh}ch`,
                        height: `${overlay.heightRem}rem`,
                        zIndex: overlay.depth + 2000,
                      }}
                      onClick={() => onSelectNode(overlay.node)}
                      title={t('editor.nodeLocation', {
                        type: overlay.node.type,
                        line: overlay.node.startLine,
                        column: overlay.node.startColumn,
                      })}
                    >
                      {renderNodeActions(overlay)}
                    </div>
                  ))}
                </div>
                </div>
                {insertionPreview && <CanvasInsertionPreview preview={insertionPreview} />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
