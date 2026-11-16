"use client"

import { useSyntaxConfirmation } from "./syntax-confirmation"
import { inspectModelOperationController, inspectSavedSyntaxController } from "@/controllers/model-editor/syntax-diagnostics.controller"
import type { SyntaxOperation, SyntaxResult } from "@/lib/services/syntax-diagnostics/syntax-contract"
import { analyzeJavaOperationController, cancelJavaAnalysisController, checkJavaContextController } from "@/lib/services/java-diagnostics/java-client"
import { EditorSession, type MutationGate } from "@/lib/models/model-editor/editor-session"
import type { FormattingStatus } from "@/lib/services/backend-response"
import { withUndoCapacity } from "@/lib/services/undo/undo-capacity"
import { useI18n } from "@/lib/i18n/locale-provider"
import { unwrapBackendAction } from "@/lib/services/backend-action-result"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  createSnippetController,
  deleteRangeController,
  loadModelController,
  moveRangeController,
  updateRangeController,
} from "@/controllers/model-editor/model-editor.controller"
import { findDeepestNodePathByLine, findNodePath, renderLeafTextContent } from "@/lib/models/model-editor/model-tree.model"
import type { JavaModel, PsiNode } from "@/lib/types"
import { translate, type AppLocale } from "@/lib/i18n/core"
import type { AttributeValues, CreateComponentRequest } from "@/lib/models/model-editor/component-creation.model"
import { creationContextAttributes } from "@/lib/models/model-editor/component-context.model"

export interface CreationProposal extends CreateComponentRequest {
  initialValues: AttributeValues
  id: string
  path: string
  view: object
  model: JavaModel
}

const DEFAULT_LEFT_PANEL_WIDTH_PX = 272
const DEFAULT_RIGHT_PANEL_WIDTH_PX = 288
const MIN_PANEL_WIDTH_PX = 220
const MAX_PANEL_WIDTH_PX = 560
const MIN_CENTER_WIDTH_PX = 480
const RESIZE_HANDLE_WIDTH_PX = 8

type ResizeSide = "left" | "right" | null

export interface ModelEditorLogEntry {
  id: string
  message: string
  timestamp: Date
}

/** Parametros de inicializacao do hook de interacoes do Model Editor. */
export interface UseModelEditorInteractionsParams {
  projectId: number
  checkJavaProposals?: boolean
  javaContextRevision?: number
  changeTextLocale: AppLocale
  mutationGate?: MutationGate
  writeBlocked?: boolean
  readOnly?: boolean
  onMutation?: () => void
  onMutationStart?: () => void
  defaultPath?: string
  onLogEntry?: (entry: ModelEditorLogEntry, filePath: string) => void
}

/**
 * Contrato completo retornado pelo hook: estado, dados derivados e handlers de UI.
 */
export interface UseModelEditorInteractionsResult {
  layoutRef: React.RefObject<HTMLDivElement | null>
  modelPath: string
  setModelPath: React.Dispatch<React.SetStateAction<string>>
  currentModel: JavaModel | null
  isLoadingModel: boolean
  isDeletingNode: boolean
  isUpdatingNode: boolean
  isCreatingNode: boolean
  isMovingNode: boolean
  backgroundError: string | null
  backgroundFormattingNotice: string | null
  modelError: string | null
  formattingNotice: FormattingStatus | null
  selectedNode: PsiNode | null
  isDesktopLayout: boolean
  leftPanelWidthPx: number
  rightPanelWidthPx: number
  leafTextContent: string
  selectedNodeContent: string
  selectedNodeBreadcrumb: PsiNode[]
  handleSelectNode: (node: PsiNode) => void
  handleSelectBreadcrumb: (node: PsiNode, _index?: number) => void
  handleClearSelection: () => void
  handleModelPathSubmit: (pathOverride?: string) => void
  handleDeleteNode: (node: PsiNode) => Promise<void>
  handleDeleteWhitespaceLine: (lineNumber: number, startOffset: number, endOffset: number) => Promise<void>
  handleUpdateNode: (node: PsiNode, newContent: string, onCancelDraft?: () => void) => Promise<void>
  syntax: ReturnType<typeof useSyntaxConfirmation>
  savedSyntax: { revision: string; result?: SyntaxResult; error?: string } | null
  pendingCreation: CreationProposal | null
  creationError: string | null
  creationRetryable: boolean
  creationStale: boolean
  handleCreateSnippet: (params: CreateComponentRequest) => void
  handleConfirmCreation: (content: string) => Promise<void>
  handleCancelCreation: () => void
  handleMoveNode: (params: {
    startOffset: number
    endOffset: number
    line: number
    lineEnd?: number
    column?: number
    blockType?: string
  }) => Promise<void>
  handleAddLogEntry: (message: string) => void
  handleResizeStart: (side: Exclude<ResizeSide, null>) => void
  handleClearModel: () => void
}

/**
 * Resolve o caminho efetivo do arquivo dando prioridade ao caminho retornado pelo modelo.
 */
function buildResolvedPath(currentModel: JavaModel | null, modelPath: string): string {
  return (currentModel?.file ?? modelPath).trim()
}

/**
 * Centraliza o estado e as interacoes do Model Editor para manter o componente visual enxuto.
 */
export function useModelEditorInteractions({
  projectId,
  checkJavaProposals = false,
  javaContextRevision = 0,
  changeTextLocale,
  defaultPath,
  mutationGate,
  writeBlocked = false,
  readOnly = false,
  onMutation,
  onMutationStart,
  onLogEntry,
}: UseModelEditorInteractionsParams): UseModelEditorInteractionsResult {
  const { t } = useI18n()
  const layoutRef = useRef<HTMLDivElement | null>(null)
  const [session] = useState(() => new EditorSession<JavaModel>(mutationGate))
  useEffect(() => () => { session.select("") }, [projectId, session])
  const [backgroundError, setBackgroundError] = useState<string | null>(null)
  const [backgroundFormattingNotice, setBackgroundFormattingNotice] = useState<string | null>(null)
  const [modelPath, setModelPath] = useState(defaultPath ?? '')
  const [currentModel, setCurrentModel] = useState<JavaModel | null>(null)
  const [isLoadingModel, setIsLoadingModel] = useState(false)
  const [isDeletingNode, setIsDeletingNode] = useState(false)
  const [isUpdatingNode, setIsUpdatingNode] = useState(false)
  const [isCreatingNode, setIsCreatingNode] = useState(false)
  const [pendingCreation, setPendingCreation] = useState<CreationProposal | null>(null)
  const [creationError, setCreationError] = useState<string | null>(null)
  const [creationRetryable, setCreationRetryable] = useState(false)
  const [isMovingNode, setIsMovingNode] = useState(false)
  const [formattingNotice, setFormattingNotice] = useState<FormattingStatus | null>(null)
  const [modelError, setModelError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<PsiNode | null>(null)
  const syntaxIdentity = useMemo(() => ({ projectId, currentModel, selectedNode, readOnly, writeBlocked, checkJavaProposals, javaContextRevision }), [projectId, currentModel, selectedNode, readOnly, writeBlocked, checkJavaProposals, javaContextRevision])
  const syntax = useSyntaxConfirmation(syntaxIdentity)
  const confirmSyntax = syntax.confirm
  const [savedSyntax, setSavedSyntax] = useState<{ revision: string; result?: SyntaxResult; error?: string } | null>(null)
  const semanticReceipt = useRef<string | undefined>(undefined)
  const proposalRequest = useRef('')
  useEffect(() => () => { if (checkJavaProposals && proposalRequest.current) void cancelJavaAnalysisController(projectId, 'proposal', proposalRequest.current).catch(() => {}) }, [syntaxIdentity, checkJavaProposals, projectId])
  const confirmOperation = useCallback((operation: { view: object }, command: SyntaxOperation) => {
    semanticReceipt.current = undefined
    const model = currentModel
    if (!model) return Promise.resolve("correct" as const)
    if (checkJavaProposals) return confirmSyntax(model.file, async () => {
      semanticReceipt.current = undefined
      proposalRequest.current = crypto.randomUUID()
      const result = unwrapBackendAction(await analyzeJavaOperationController(projectId, model.file, renderLeafTextContent(model.tree), model.revision ?? '', command, proposalRequest.current))
      return result
    }, () => session.current(operation.view), 'java', async result => {
      semanticReceipt.current = undefined
      if (result.source === 'javac') {
        unwrapBackendAction(await checkJavaContextController(projectId, result.contextRevision))
        semanticReceipt.current = result.contextRevision
      }
    }).then(choice => {
      if (choice !== 'apply' && proposalRequest.current) void cancelJavaAnalysisController(projectId, 'proposal', proposalRequest.current).catch(() => {})
      return choice
    })
    return confirmSyntax(model.file, async () => unwrapBackendAction(await inspectModelOperationController(
      projectId, model.file, renderLeafTextContent(model.tree), model.revision ?? "", command)),
      () => session.current(operation.view))
  }, [currentModel, projectId, session, confirmSyntax, checkJavaProposals])
  const [isDesktopLayout, setIsDesktopLayout] = useState(false)
  const [leftPanelWidthPx, setLeftPanelWidthPx] = useState(DEFAULT_LEFT_PANEL_WIDTH_PX)
  const [rightPanelWidthPx, setRightPanelWidthPx] = useState(DEFAULT_RIGHT_PANEL_WIDTH_PX)
  const [activeResizeSide, setActiveResizeSide] = useState<ResizeSide>(null)

  /** Cria e publica entradas de log com contexto do arquivo atual. */
  const handleAddLogEntry = useCallback(
    (message: string) => {
      const entry: ModelEditorLogEntry = {
        id: crypto.randomUUID(),
        message,
        timestamp: new Date(),
      }

      // O caminho pode mudar apos um reload; priorizamos o valor mais atual do modelo.
      const resolvedPath = buildResolvedPath(currentModel, modelPath)
      onLogEntry?.(entry, resolvedPath)
    },
    [currentModel, modelPath, onLogEntry]
  )

  /** Limpa o modelo atual quando nao houver mais abas abertas. */
  const handleClearModel = useCallback(() => {
    session.select("")
    setSavedSyntax(null)
    setModelPath('')
    setCurrentModel(null)
    setSelectedNode(null)
    setModelError(null)
    setFormattingNotice(null)
    setIsLoadingModel(false)
  }, [session])

  /** Carrega o modelo PSI e sincroniza estados de erro/carregamento/selecionado. */
  const loadModel = useCallback(async (path: string, notice: FormattingStatus | null = null, analyzeSaved = false) => {
    setSavedSyntax(null)
    const request = session.select(path)
    setModelPath(path)
    setCurrentModel(null)
    setSelectedNode(null)
    setIsLoadingModel(true)
    setModelError(null)
    setFormattingNotice(null)

    try {
      const modelData = unwrapBackendAction(await loadModelController(projectId, path))
      if (!session.current(request)) return
      session.accept(request, modelData)
      setCurrentModel(modelData)
      setFormattingNotice(notice)
      setSelectedNode(null)
      setModelPath(path)
      if (analyzeSaved) {
        const revision = modelData.revision ?? ''
        setSavedSyntax({ revision })
        void inspectSavedSyntaxController(projectId, modelData.file, renderLeafTextContent(modelData.tree)).then(response => {
          const result = unwrapBackendAction(response)
          if (result.revision !== revision) throw new Error('Saved syntax revision differs from the loaded file')
          if (session.current(request)) setSavedSyntax({ revision, result })
        }).catch(error => {
          if (session.current(request)) setSavedSyntax({ revision, error: error instanceof Error ? error.message : String(error) })
        })
      }
    } catch (error) {
      if (!session.current(request)) return
      const message = error instanceof Error ? error.message : "Erro ao carregar modelo"
      setModelError(message)
    } finally {
      if (session.current(request)) setIsLoadingModel(false)
    }
  }, [projectId, session])

  const acknowledgeMutation = useCallback(async (
    operation: { view: object; path: string },
    response: { path: string; formatting: { status: FormattingStatus } }
  ) => {
    onMutation?.()
    const notice = response.formatting.status === "rejected" || response.formatting.status === "failed" ? response.formatting.status : null
    if (session.current(operation.view)) await loadModel(response.path, notice, true)
    else if (notice) setBackgroundFormattingNotice(`${operation.path}: ${translate(changeTextLocale, notice === "rejected" ? "editor.formatRejected" : "editor.formatFailed")}`)
  }, [onMutation, session, loadModel, changeTextLocale])

  useLayoutEffect(() => {
    session.setBlocked(writeBlocked)
    const path = session.path
    if (path) {
      if (writeBlocked) { session.select(path); setSelectedNode(null); setFormattingNotice(null); setIsLoadingModel(false) }
      else void loadModel(path)
    }
  }, [writeBlocked, session, loadModel])

  const beginMutation = useCallback(() => {
    const operation = readOnly ? null : session.begin(currentModel)
    if (operation) onMutationStart?.()
    return operation
  }, [readOnly, session, currentModel, onMutationStart])

  /** Texto fonte completo reconstruido a partir da arvore PSI atual. */
  const leafTextContent = useMemo(() => {
    if (!currentModel) {
      return ""
    }

    return renderLeafTextContent(currentModel.tree)
  }, [currentModel])

  /** Conteudo textual do no selecionado para exibicao/edicao no painel lateral. */
  const selectedNodeContent = useMemo(() => {
    if (!selectedNode) {
      return ""
    }

    return renderLeafTextContent(selectedNode)
  }, [selectedNode])

  /** Caminho hierarquico da raiz ate o no selecionado para breadcrumb. */
  const selectedNodeBreadcrumb = useMemo(() => {
    if (!selectedNode || !currentModel) {
      return []
    }

    const path = findNodePath(currentModel.tree, selectedNode)
    if (path) return path
    // A visual subrange (one blank line) retains the ancestry of its PSI owner.
    const ownerPath = findDeepestNodePathByLine(currentModel.tree, selectedNode.startLine)
    const ancestry = ownerPath?.at(-1)?.type === selectedNode.type ? ownerPath.slice(0, -1) : ownerPath ?? []
    return [...ancestry, selectedNode]
  }, [currentModel, selectedNode])

  /** Seleciona explicitamente um no no canvas. */
  const handleSelectNode = useCallback((node: PsiNode) => {
    setSelectedNode(node)
  }, [])

  /** Seleciona um ancestral via breadcrumb. */
  const handleSelectBreadcrumb = useCallback((node: PsiNode) => {
    setSelectedNode(node)
  }, [])

  /** Limpa a selecao atual no canvas. */
  const handleClearSelection = useCallback(() => {
    setSelectedNode(null)
  }, [])

  /** Valida o input de caminho e dispara uma nova leitura de modelo. */
  const modelPathRef = useRef(modelPath)
  useEffect(() => { modelPathRef.current = modelPath }, [modelPath])

  const handleModelPathSubmit = useCallback((pathOverride?: string) => {
    const trimmedPath = (pathOverride ?? modelPathRef.current).trim()

    if (!trimmedPath) {
      setModelError("Selecione um arquivo no explorador")
      return
    }

    void loadModel(trimmedPath)
  }, [loadModel])

  /** Exclui um no PSI selecionado usando seu intervalo de offsets. */
  const handleDeleteNode = useCallback(
    async (node: PsiNode) => {
      const operation = beginMutation()
      if (!operation) return
      setBackgroundError(null)
      setBackgroundFormattingNotice(null)
      setIsDeletingNode(true)
      setModelError(null)
      setFormattingNotice(null)

      try {
        if (await confirmOperation(operation, { operation: 'delete', startOffset: Number(node.startOffset), endOffset: Number(node.endOffset) }) !== 'apply') return
        const response = await withUndoCapacity(allow => deleteRangeController({
          projectId,
          expectedHash: currentModel?.revision,
          semanticContext: semanticReceipt.current,
          path: buildResolvedPath(currentModel, modelPath),
          // startOffset/endOffset podem vir opcionais do PSI; o controller valida tudo.
          startOffset: Number(node.startOffset),
          endOffset: Number(node.endOffset),
        }, allow), t("undo.capacityHelp"))

        handleAddLogEntry(
          `Exclusao aplicada (${node.type}) offsets ${response.startOffset}-${response.endOffset}, removidos ${response.removedChars} chars`
        )

        await acknowledgeMutation(operation, response)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao excluir elemento"
        if (session.current(operation.view)) setModelError(message)
        else setBackgroundError(`${operation.path}: ${message}`)
        handleAddLogEntry(`Falha na exclusao: ${message}`)
      } finally {
        session.finish(operation)
        setIsDeletingNode(false)
      }
    },
    [projectId, currentModel, handleAddLogEntry, modelPath, session, acknowledgeMutation, beginMutation, confirmOperation, t]
  )

  /** Remove uma linha em branco no texto fonte usando offsets calculados no canvas. */
  const handleDeleteWhitespaceLine = useCallback(
    async (lineNumber: number, startOffset: number, endOffset: number) => {
      const operation = beginMutation()
      if (!operation) return
      setBackgroundError(null)
      setBackgroundFormattingNotice(null)
      setIsDeletingNode(true)
      setModelError(null)
      setFormattingNotice(null)

      try {
        const resolvedPath = buildResolvedPath(currentModel, modelPath)
        if (await confirmOperation(operation, { operation: 'delete', startOffset, endOffset }) !== 'apply') return
        const response = await withUndoCapacity(allow => deleteRangeController({
          projectId,
          expectedHash: currentModel?.revision,
          semanticContext: semanticReceipt.current,
          path: resolvedPath,
          startOffset,
          endOffset,
        }, allow), t("undo.capacityHelp"))

        handleAddLogEntry(
          `Linha ${lineNumber} removida (${response.startOffset}-${response.endOffset}), removidos ${response.removedChars} chars`
        )

        await acknowledgeMutation(operation, response)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao excluir elemento"
        if (session.current(operation.view)) setModelError(message)
        else setBackgroundError(`${operation.path}: ${message}`)
        handleAddLogEntry(`Falha na exclusao: ${message}`)
      } finally {
        session.finish(operation)
        setIsDeletingNode(false)
      }
    },
    [projectId, currentModel, handleAddLogEntry, modelPath, session, acknowledgeMutation, beginMutation, confirmOperation, t]
  )

  /** Atualiza o conteudo textual do no selecionado. */
  const handleUpdateNode = useCallback(
    async (node: PsiNode, newContent: string, onCancelDraft?: () => void) => {
      const operation = beginMutation()
      if (!operation) return
      setBackgroundError(null)
      setBackgroundFormattingNotice(null)
      setIsUpdatingNode(true)
      setModelError(null)
      setFormattingNotice(null)

      try {
        const decision = await confirmOperation(operation, { operation: 'update', startOffset: Number(node.startOffset), endOffset: Number(node.endOffset), newContent })
        if (decision !== 'apply') { if (decision === 'cancel') onCancelDraft?.(); return }
        const response = await withUndoCapacity(allow => updateRangeController({
          projectId,
          expectedHash: currentModel?.revision,
          semanticContext: semanticReceipt.current,
          path: buildResolvedPath(currentModel, modelPath),
          // Conversao explicita para garantir contrato numerico na borda da camada.
          startOffset: Number(node.startOffset),
          endOffset: Number(node.endOffset),
          newContent,
        }, allow), t("undo.capacityHelp"))

        handleAddLogEntry(
          `Edicao aplicada (${node.type}) offsets ${response.startOffset}-${response.endOffset}, removidos ${response.removedChars}, inseridos ${response.insertedChars}`
        )

        await acknowledgeMutation(operation, response)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao editar elemento"
        if (session.current(operation.view)) setModelError(message)
        else setBackgroundError(`${operation.path}: ${message}`)
        handleAddLogEntry(`Falha na edicao: ${message}`)
      } finally {
        session.finish(operation)
        setIsUpdatingNode(false)
      }
    },
    [projectId, currentModel, handleAddLogEntry, modelPath, session, acknowledgeMutation, beginMutation, confirmOperation, t]
  )

  const creationStale = !!pendingCreation && (readOnly || writeBlocked || currentModel !== pendingCreation.model || !session.current(pendingCreation.view))

  /** A drop is a proposal. No write, event or mutation lock until confirmation. */
  const handleCreateSnippet = useCallback((request: CreateComponentRequest) => {
    const target = readOnly ? null : session.capture(currentModel)
    if (!target || !currentModel || pendingCreation) return
    setCreationError(null)
    setCreationRetryable(false)
    const initialValues = creationContextAttributes(request.componentId, currentModel.tree, renderLeafTextContent(currentModel.tree), request)
    setPendingCreation({ ...request, ...target, initialValues, model: currentModel, id: crypto.randomUUID() })
  }, [readOnly, session, currentModel, pendingCreation])

  const handleCancelCreation = useCallback(() => {
    if (isCreatingNode) return
    setPendingCreation(null)
    setCreationError(null)
    setCreationRetryable(false)
  }, [isCreatingNode])

  const handleConfirmCreation = useCallback(
    async (content: string) => {
      if (!pendingCreation || creationStale || creationError && !creationRetryable || !content) return
      const operation = beginMutation()
      if (!operation) return
      const { line, lineEnd, column, path, model } = pendingCreation
      setBackgroundError(null)
      setBackgroundFormattingNotice(null)
      setIsCreatingNode(true)
      setCreationError(null)
      setCreationRetryable(false)
      setModelError(null)
      setFormattingNotice(null)

      try {
        const decision = await confirmOperation(operation, { operation: 'create', line, lineEnd, column, content })
        if (decision !== 'apply') { if (decision === 'cancel') setPendingCreation(null); return }
        const response = await withUndoCapacity(async allow => {
          const result = await createSnippetController({
          projectId,
          expectedHash: model.revision,
          semanticContext: semanticReceipt.current,
          path,
          line,
          lineEnd,
          column,
          content,
          }, allow)
        // Java-context refusals happen before the mutation callback; their drafts can safely be retried.
          if ('backendError' in result && (result.backendError.code.startsWith('java_') || result.backendError.code === 'undo_capacity')) setCreationRetryable(true)
          return result
        }, t('undo.capacityHelp'))

        // Formata o alvo de insercao conforme resposta do backend (linha ou faixa).
        const lineTargetText =
          typeof response.lineEnd === "number" ? `${response.line}:${response.lineEnd}` : String(response.line)
        const columnTargetText = typeof response.column === "number" ? `, coluna ${response.column}` : ""

        handleAddLogEntry(
          `Criacao aplicada na linha ${lineTargetText}${columnTargetText}, inseridos ${response.insertedChars} chars (${response.mode})`
        )

        await acknowledgeMutation(operation, response)
        setPendingCreation(null)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao criar trecho"
        // A lost acknowledgement may mean the write succeeded. Do not repeat it blindly.
        setCreationError(message)
        handleAddLogEntry(`Falha na criacao: ${message}`)
      } finally {
        session.finish(operation)
        setIsCreatingNode(false)
      }
    },
    [projectId, pendingCreation, creationStale, creationError, creationRetryable, handleAddLogEntry, session, acknowledgeMutation, beginMutation, confirmOperation, t]
  )

  /** Move um trecho do arquivo para uma nova linha/intervalo de destino. */
  const handleMoveNode = useCallback(
    async ({
      startOffset,
      endOffset,
      line,
      lineEnd,
      column,
    }: {
      startOffset: number
      endOffset: number
      line: number
      lineEnd?: number
      column?: number
      blockType?: string
    }) => {
      const operation = beginMutation()
      if (!operation) return
      setBackgroundError(null)
      setBackgroundFormattingNotice(null)
      setIsMovingNode(true)
      setModelError(null)
      setFormattingNotice(null)

      const resolvedPath = buildResolvedPath(currentModel, modelPath)

      try {
        if (await confirmOperation(operation, { operation: 'move', startOffset, endOffset, line, lineEnd, column }) !== 'apply') return
        const response = await withUndoCapacity(allow => moveRangeController({
          projectId,
          expectedHash: currentModel?.revision,
          semanticContext: semanticReceipt.current,
          path: resolvedPath,
          startOffset,
          endOffset,
          line,
          lineEnd,
          column,
        }, allow), t("undo.capacityHelp"))

        // A visualizacao de log usa o formato uniforme linha ou linha:linhaFim.
        const lineTargetText =
          typeof response.lineEnd === "number" ? `${response.line}:${response.lineEnd}` : String(response.line)
        const columnTargetText = typeof response.column === "number" ? `, coluna ${response.column}` : ""

        handleAddLogEntry(
          `Movimentacao aplicada para linha ${lineTargetText}${columnTargetText}, movidos ${response.movedChars} chars (${response.mode})`
        )

        await acknowledgeMutation(operation, response)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao mover elemento"
        if (session.current(operation.view)) setModelError(message)
        else setBackgroundError(`${operation.path}: ${message}`)
        handleAddLogEntry(`Falha na movimentacao: ${message}`)
      } finally {
        session.finish(operation)
        setIsMovingNode(false)
      }
    },
    [projectId, currentModel, handleAddLogEntry, modelPath, session, acknowledgeMutation, beginMutation, confirmOperation, t]
  )

  /** Inicia o modo de resize horizontal para o painel solicitado. */
  const handleResizeStart = useCallback(
    (side: Exclude<ResizeSide, null>) => {
      if (!isDesktopLayout) {
        return
      }

      setActiveResizeSide(side)
    },
    [isDesktopLayout]
  )

  /** Detecta quando o layout entra/sai de desktop para habilitar resize lateral. */
  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)")

    const updateLayoutMode = (event?: MediaQueryListEvent) => {
      const matches = event ? event.matches : mediaQuery.matches
      setIsDesktopLayout(matches)

      if (!matches) {
        setActiveResizeSide(null)
      }
    }

    updateLayoutMode()
    mediaQuery.addEventListener("change", updateLayoutMode)

    return () => {
      mediaQuery.removeEventListener("change", updateLayoutMode)
    }
  }, [])

  /**
   * Aplica resize drag-and-drop dos paineis laterais com limites de largura.
   */
  useEffect(() => {
    if (!isDesktopLayout || !activeResizeSide) {
      return
    }

    const handleMouseMove = (event: MouseEvent) => {
      const layoutElement = layoutRef.current

      if (!layoutElement) {
        return
      }

      const rect = layoutElement.getBoundingClientRect()
      const totalWidth = rect.width

      if (totalWidth <= 0) {
        return
      }

      if (activeResizeSide === "left") {
        const rawWidth = event.clientX - rect.left
        // Garante espaco minimo para painel direito + centro + dois handles.
        const maxWidth = Math.min(
          MAX_PANEL_WIDTH_PX,
          totalWidth - rightPanelWidthPx - RESIZE_HANDLE_WIDTH_PX * 2 - MIN_CENTER_WIDTH_PX
        )
        const clampedWidth = Math.max(MIN_PANEL_WIDTH_PX, Math.min(maxWidth, rawWidth))
        setLeftPanelWidthPx(clampedWidth)
        return
      }

      const rawWidth = rect.right - event.clientX
      // Mesmo limite acima, agora invertendo a referencia para o lado direito.
      const maxWidth = Math.min(
        MAX_PANEL_WIDTH_PX,
        totalWidth - leftPanelWidthPx - RESIZE_HANDLE_WIDTH_PX * 2 - MIN_CENTER_WIDTH_PX
      )
      const clampedWidth = Math.max(MIN_PANEL_WIDTH_PX, Math.min(maxWidth, rawWidth))
      setRightPanelWidthPx(clampedWidth)
    }

    const handleMouseUp = () => {
      setActiveResizeSide(null)
    }

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect

    // Bloqueia selecao de texto durante o drag para evitar comportamento visual estranho.
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)

    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect

      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [activeResizeSide, isDesktopLayout, leftPanelWidthPx, rightPanelWidthPx])

  /** Carrega automaticamente o modelo inicial quando o painel monta. */
  useEffect(() => {
    if (!defaultPath) {
      return
    }

    // Fire-and-forget: os estados sao tratados dentro de loadModel.
    void loadModel(defaultPath)
  }, [defaultPath, loadModel])

  return {
    syntax, savedSyntax,
    layoutRef,
    modelPath,
    setModelPath,
    currentModel,
    isLoadingModel,
    isDeletingNode,
    isUpdatingNode,
    isCreatingNode,
    isMovingNode,
    modelError,
    backgroundError,
    backgroundFormattingNotice,
    formattingNotice,
    selectedNode,
    isDesktopLayout,
    leftPanelWidthPx,
    rightPanelWidthPx,
    leafTextContent,
    selectedNodeContent,
    selectedNodeBreadcrumb,
    handleSelectNode,
    handleSelectBreadcrumb,
    handleClearSelection,
    handleModelPathSubmit,
    handleDeleteNode,
    handleDeleteWhitespaceLine,
    handleUpdateNode,
    handleCreateSnippet,
    pendingCreation,
    creationError,
    creationRetryable,
    creationStale,
    handleConfirmCreation,
    handleCancelCreation,
    handleMoveNode,
    handleAddLogEntry,
    handleResizeStart,
    handleClearModel,
  }
}
