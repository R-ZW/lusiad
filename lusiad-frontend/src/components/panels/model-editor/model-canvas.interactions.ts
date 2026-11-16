"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { PsiNode } from "@/lib/types"
import {
  LINE_HEIGHT_REM,
  buildLineStartOffsets,
  buildReferencePathContext,
  collectBoxOverlays,
  collectBlankLineOverlays,
  collectHoverOnlyInlineOverlays,
  collectLeafTextSegments,
  isDescendantPath,
  isHiddenByCollapsedAncestor,
  resolveWhitespaceLineDeleteRange,
  type BoxOverlay,
  type DragPreview,
  type LeafTextSegment,
} from "@/lib/models/model-editor/model-canvas.model"
import {
  EXAMPLE_DRAG_MIME_TYPE,
  MOVE_DRAG_MIME_TYPE,
  type LibraryDragPayload,
} from "@/lib/models/model-editor/model-editor-dnd.model"

import { resolveCanvasDrop, dropDestination, validMovePayload } from "@/lib/models/model-editor/canvas-drop.model"
import { buildCanvasInsertionPreview, draggedLibraryTemplate, sourcePositionFromInsertion, type CanvasInsertionPreview } from "@/lib/models/model-editor/canvas-insertion-preview.model"
import type { LibrarySnippet } from "@/lib/models/model-editor/components-panel.model"
import { isLibraryComponentId, type CreateComponentRequest } from "@/lib/models/model-editor/component-creation.model"
import { canonicalInteractionOverlays, selectedInteractionOverlay } from "@/lib/models/model-editor/component-overlays.model"

/** Parametros de inicializacao do hook de interacoes do canvas. */
export interface UseModelCanvasInteractionsParams {
  leafTextContent: string
  readOnly?: boolean
  tree: PsiNode
  selectedNode: PsiNode | null
  isCreatingNode?: boolean
  isMovingNode?: boolean
  onClearSelection: () => void
  onDeleteNode: (node: PsiNode) => Promise<void> | void
  onDeleteLine: (lineNumber: number, startOffset: number, endOffset: number) => Promise<void> | void
  onCreateSnippet: (params: CreateComponentRequest) => Promise<void> | void
  onMoveNode: (params: {
    startOffset: number
    endOffset: number
    line: number
    lineEnd?: number
    column?: number
    blockType?: string
  }) => Promise<void> | void
  onDropLog: (message: string) => void
}

/** Contrato completo de estado e handlers consumido pelo componente visual. */
export interface UseModelCanvasInteractionsResult {
  codeTextRef: React.RefObject<HTMLPreElement | null>
  collapsedNodePaths: Set<string>
  dragPreview: DragPreview | null
  insertionPreview: CanvasInsertionPreview | null
  hasRenderableLeafText: boolean
  nonEmptyLeafSegments: LeafTextSegment[]
  sourceText: string
  sourceLines: string[]
  lineNumberDigits: number
  selectedNodePath: string | null
  visibleOverlays: BoxOverlay[]
  visibleHoverOnlyOverlays: BoxOverlay[]
  blankLineNodes: Map<number, PsiNode>
  toggleCollapsedNode: (nodePath: string) => void
  handleMoveDragStart: (event: React.DragEvent<HTMLButtonElement>, node: PsiNode) => void
  handleDragSourceEnd: () => void
  handleDeleteIntent: (node: PsiNode) => void
  handleDeleteWhitespaceLine: (event: React.MouseEvent<HTMLElement>, lineNumber: number) => Promise<void>
  handleCanvasShellClick: (event: React.MouseEvent<HTMLDivElement>) => void
  handleModelBoxClick: (event: React.MouseEvent<HTMLDivElement>) => void
  handleModelBoxDragOver: (event: React.DragEvent<HTMLDivElement>) => void
  handleModelBoxDragLeave: (event: React.DragEvent<HTMLDivElement>) => void
  handleModelBoxDrop: (event: React.DragEvent<HTMLDivElement>) => void
}

/**
 * Centraliza estado e regras de interacao do ModelCanvas para manter JSX focado em render.
 */
export function useModelCanvasInteractions({
  leafTextContent,
  readOnly = false,
  tree,
  selectedNode,
  isCreatingNode = false,
  isMovingNode = false,
  onClearSelection,
  onDeleteNode,
  onDeleteLine,
  onCreateSnippet,
  onMoveNode,
  onDropLog,
}: UseModelCanvasInteractionsParams): UseModelCanvasInteractionsResult {
  const [collapseState, setCollapseState] = useState({ tree, paths: new Set<string>() })
  const collapsedNodePaths = useMemo(() => collapseState.tree === tree ? collapseState.paths : new Set<string>(), [collapseState, tree])
  const [dragState, setDragState] = useState<{ tree: PsiNode; destination: DragPreview; snippet: LibrarySnippet | null } | null>(null)
  const currentDrag = !readOnly && !isCreatingNode && !isMovingNode && dragState?.tree === tree ? dragState : null
  const dragPreview = currentDrag?.destination ?? null
  const setDragPreview = useCallback((destination: DragPreview | null, snippet: LibrarySnippet | null = null) => {
    setDragState(previous => {
      if (!destination) return null
      if (previous?.tree === tree && previous.snippet === snippet && JSON.stringify(previous.destination) === JSON.stringify(destination)) return previous
      return { tree, destination, snippet }
    })
  }, [tree])
  useEffect(() => {
    const clear = () => setDragState(null)
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') clear() }
    const hidden = () => { if (document.hidden) clear() }
    window.addEventListener('dragend', clear)
    window.addEventListener('drop', clear)
    window.addEventListener('blur', clear)
    window.addEventListener('keydown', escape)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('dragend', clear); window.removeEventListener('drop', clear)
      window.removeEventListener('blur', clear); window.removeEventListener('keydown', escape)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [])
  const codeTextRef = useRef<HTMLPreElement | null>(null)
  const dragSource = useMemo(() => ({ tree, id: crypto.randomUUID() }), [tree])
  const dragSourceId = dragSource.id

  /** Alterna estado de colapso de um caminho de no no canvas. */
  const toggleCollapsedNode = useCallback((nodePath: string) => {
    setCollapseState((prev) => {
      const next = new Set(prev.tree === tree ? prev.paths : [])
      if (next.has(nodePath)) {
        next.delete(nodePath)
      } else {
        next.add(nodePath)
      }
      return { tree, paths: next }
    })
  }, [tree])

  /** Inicia drag de movimentacao de no serializando offsets no DataTransfer. */
  const handleMoveDragStart = useCallback((event: React.DragEvent<HTMLButtonElement>, node: PsiNode) => {
    event.stopPropagation()

    const startOffset = node.startOffset
    const endOffset = node.endOffset

    if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset)) {
      return
    }

    event.dataTransfer.setData(
      MOVE_DRAG_MIME_TYPE,
      JSON.stringify({
        type: node.type,
        sourceId: dragSourceId,
        startOffset: Number(startOffset),
        endOffset: Number(endOffset),
      })
    )
    event.dataTransfer.effectAllowed = "move"
  }, [dragSourceId])

  /** Limpa pre-visualizacao de drop ao encerrar o drag na origem. */
  const handleDragSourceEnd = useCallback(() => {
    setDragPreview(null)
  }, [setDragPreview])

  /** Encapsula delecao de no mantendo chamada fire-and-forget na UI. */
  const handleDeleteIntent = useCallback(
    (node: PsiNode) => {
      void onDeleteNode(node)
    },
    [onDeleteNode]
  )

  /** Segmentos folha calculados a partir da arvore PSI. */
  const leafSegments = useMemo(() => collectLeafTextSegments(tree), [tree])
  /** Segmentos efetivamente renderizaveis (descarta vazios). */
  const nonEmptyLeafSegments = useMemo(() => leafSegments.filter((segment) => segment.text.length > 0), [leafSegments])
  const hasRenderableLeafText = nonEmptyLeafSegments.length > 0

  /**
   * Texto fonte base do canvas.
   * Quando ha segmentos de folha, reconstruimos o texto por eles para alinhar overlays.
   */
  const sourceText = useMemo(() => {
    if (hasRenderableLeafText) {
      return nonEmptyLeafSegments.map((segment) => segment.text).join("")
    }

    return leafTextContent
  }, [hasRenderableLeafText, leafTextContent, nonEmptyLeafSegments])

  /** Linhas derivadas do texto fonte. */
  const sourceLines = useMemo(() => sourceText.split("\n"), [sourceText])
  /** Inicio de cada linha em offset absoluto para operacoes de delete por linha. */
  const lineStartOffsets = useMemo(() => buildLineStartOffsets(sourceText), [sourceText])
  /** Digitos usados para reservar largura da coluna de numeracao. */
  const lineNumberDigits = String(sourceLines.length).length

  /** Exclui linha em branco resolvendo range de offsets no texto atual. */
  const handleDeleteWhitespaceLine = useCallback(
    async (event: React.MouseEvent<HTMLElement>, lineNumber: number) => {
      event.preventDefault()
      event.stopPropagation()

      const range = resolveWhitespaceLineDeleteRange(lineNumber, sourceLines, lineStartOffsets, sourceText.length)

      if (!range) {
        return
      }

      await onDeleteLine(lineNumber, range.startOffset, range.endOffset)
    },
    [lineStartOffsets, onDeleteLine, sourceLines, sourceText.length]
  )

  /** Canonical action owners are local to the editor; history/diff retain their visual collectors. */
  const interactionOverlays = useMemo(() => {
    const referencePathContext = buildReferencePathContext(tree, sourceLines)
    const regular = [
      ...collectBoxOverlays(tree, sourceLines, referencePathContext).filter((overlay) => !/WhiteSpace/.test(overlay.node.type)),
      ...collectBlankLineOverlays(tree, sourceText),
    ]
    const inline = collectHoverOnlyInlineOverlays(tree, sourceLines)
    const original = [...regular, ...inline]
    const canonical = canonicalInteractionOverlays(original)
    const owners = new Set(canonical)
    return { original, canonical, overlays: regular.filter(item => owners.has(item)), hoverOnlyOverlays: inline.filter(item => owners.has(item)) }
  }, [sourceLines, sourceText, tree])
  const { overlays, hoverOnlyOverlays } = interactionOverlays

  /** Caminho textual do no selecionado, usado para filtrar descendentes. */
  const selectedNodePath = useMemo(() => {
    return selectedInteractionOverlay(interactionOverlays.original, interactionOverlays.canonical, selectedNode)?.nodePath ?? null
  }, [interactionOverlays, selectedNode])

  /** Overlays visiveis apos aplicar regras de colapso de ancestrais. */
  const visibleOverlays = useMemo(
    () => overlays.filter((overlay) => !isHiddenByCollapsedAncestor(overlay.nodePath, collapsedNodePaths)),
    [collapsedNodePaths, overlays]
  )

  const blankLineNodes = useMemo(() => new Map(visibleOverlays
    .filter((overlay) => /WhiteSpace/.test(overlay.node.type))
    .map((overlay) => [overlay.node.startLine, overlay.node])), [visibleOverlays])

  /**
   * Overlays inline visiveis, removendo os que pertencem a descendentes do no selecionado.
   */
  const visibleHoverOnlyOverlays = useMemo(
    () =>
      hoverOnlyOverlays.filter(
        (overlay) =>
          !isHiddenByCollapsedAncestor(overlay.nodePath, collapsedNodePaths) &&
          !(selectedNodePath && isDescendantPath(overlay.nodePath, selectedNodePath))
      ),
    [collapsedNodePaths, hoverOnlyOverlays, selectedNodePath]
  )

  /**
   * Clique no shell limpa selecao apenas quando nao for em overlay, acao ou texto.
   */
  const handleCanvasShellClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement

      if (target.closest("[data-model-overlay='true']")) {
        return
      }

      if (target.closest("[data-model-action='true']")) {
        return
      }

      if (target.closest("[data-model-text='true']")) {
        return
      }

      onClearSelection()
    },
    [onClearSelection]
  )

  /** Clique no container interno limpa selecao somente em clique no fundo do box. */
  const handleModelBoxClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        onClearSelection()
      }
    },
    [onClearSelection]
  )

  const snippet = currentDrag?.snippet
  const insertionPreview = useMemo(() => dragPreview && snippet
    ? buildCanvasInsertionPreview(tree, sourceText, dragPreview, snippet, visibleOverlays) : null,
  [tree, sourceText, dragPreview, snippet, visibleOverlays])

  /**
   * Traduz posicao do mouse em uma pre-visualizacao de drop por linha/entre-linhas.
   */
  const resolveDragPreview = useCallback(
    (event: React.DragEvent<HTMLDivElement>): DragPreview | null => {
      const codeTextElement = codeTextRef.current

      if (!codeTextElement || sourceLines.length === 0) {
        return null
      }

      const rect = codeTextElement.getBoundingClientRect()
      const computedLineHeight = Number.parseFloat(getComputedStyle(codeTextElement).lineHeight)
      const fallbackLineHeight = rect.height > 0 ? rect.height / sourceLines.length : 16 * LINE_HEIGHT_REM
      // Fallback evita NaN quando line-height computado nao vier numerico.
      const lineHeightPx =
        Number.isFinite(computedLineHeight) && computedLineHeight > 0 ? computedLineHeight : fallbackLineHeight
      const computedFontSize = Number.parseFloat(getComputedStyle(codeTextElement).fontSize)
      const approxCharacterWidthPx = Number.isFinite(computedFontSize) && computedFontSize > 0 ? computedFontSize * 0.6 : 8

      const relativeY = event.clientY - rect.top
      const relativeX = Math.max(0, event.clientX - rect.left)
      const rawLineIndex = Math.floor(relativeY / lineHeightPx)
      let boundedLineIndex = Math.max(0, Math.min(sourceLines.length - 1, rawLineIndex))
      let hoveredColumnIndex = Math.max(0, Math.floor(relativeX / approxCharacterWidthPx))
      if (insertionPreview && draggedLibraryTemplate(event.dataTransfer.types)?.id === insertionPreview.componentId) {
        const original = sourcePositionFromInsertion(insertionPreview, rawLineIndex, hoveredColumnIndex)
        if (!original) return insertionPreview.destination
        boundedLineIndex = original.line
        hoveredColumnIndex = original.column
      }
      return resolveCanvasDrop(tree, sourceText, boundedLineIndex, hoveredColumnIndex)
    },
    [sourceLines, sourceText, tree, insertionPreview]
  )

  /** Atualiza preview de drop durante drag sobre o box principal do canvas. */
  const handleModelBoxDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const isExampleDrag = event.dataTransfer.types.includes(EXAMPLE_DRAG_MIME_TYPE)
      const isMoveDrag = event.dataTransfer.types.includes(MOVE_DRAG_MIME_TYPE)

      if (!isExampleDrag && !isMoveDrag) {
        return
      }

      if (readOnly || isCreatingNode || isMovingNode) { setDragPreview(null); return }
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = isMoveDrag ? "move" : "copy"

      const preview = resolveDragPreview(event)
      setDragPreview(preview, isMoveDrag ? null : draggedLibraryTemplate(event.dataTransfer.types))
    },
    [resolveDragPreview, readOnly, isCreatingNode, isMovingNode, setDragPreview]
  )

  /** Limpa preview quando o ponteiro sai efetivamente do box de drop. */
  const handleModelBoxDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && event.currentTarget.contains(nextTarget)) {
      return
    }

    setDragPreview(null)
  }, [setDragPreview])

  /**
   * Processa drop de movimentacao (move) ou criacao de snippet (copy) no canvas.
   */
  const handleModelBoxDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const isExampleDrag = event.dataTransfer.types.includes(EXAMPLE_DRAG_MIME_TYPE)
      const isMoveDrag = event.dataTransfer.types.includes(MOVE_DRAG_MIME_TYPE)

      if (!isExampleDrag && !isMoveDrag) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const preview = resolveDragPreview(event)

      if (!preview) {
        setDragPreview(null)
        return
      }

      if (isMoveDrag) {
        if (isMovingNode) {
          // Evita concorrencia de move enquanto operacao anterior ainda esta ativa.
          setDragPreview(null)
          return
        }

        const rawMovePayload = event.dataTransfer.getData(MOVE_DRAG_MIME_TYPE)
        let movePayload: unknown
        try { movePayload = JSON.parse(rawMovePayload) } catch { movePayload = null }
        if (!validMovePayload(movePayload, dragSourceId, sourceText.length)) {
          onDropLog("Movimento recusado: origem ou revisão do componente mudou")
          setDragPreview(null)
          return
        }
        void onMoveNode({
          startOffset: movePayload.startOffset, endOffset: movePayload.endOffset,
          ...dropDestination(preview), blockType: movePayload.type,
        })
      } else {
        if (isCreatingNode) {
          // Evita concorrencia de create enquanto operacao anterior ainda esta ativa.
          setDragPreview(null)
          return
        }

        const rawPayload = event.dataTransfer.getData(EXAMPLE_DRAG_MIME_TYPE)
        let snippetPayload: LibraryDragPayload | null = null

        try {
          snippetPayload = JSON.parse(rawPayload) as LibraryDragPayload
        } catch {
          snippetPayload = null
        }

        if (!isLibraryComponentId(snippetPayload?.id)) {
          onDropLog("Falha ao adicionar elemento: componente desconhecido")
          setDragPreview(null)
          return
        }

        void onCreateSnippet({ componentId: snippetPayload.id, ...dropDestination(preview) })
      }

      setDragPreview(null)
    },
    [dragSourceId, sourceText, isCreatingNode, isMovingNode, onCreateSnippet, onDropLog, onMoveNode, resolveDragPreview, setDragPreview]
  )

  return {
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
  }
}
