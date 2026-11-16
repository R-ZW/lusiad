"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, FileCode, FileText, History, Library, SlidersHorizontal, X } from "lucide-react"
import { ComponentsPanel } from "./components-panel"
import { ComponentCreationDialog } from "./component-creation-dialog"
import { ChangeDiffPreview } from "./change-diff-preview"
import { ExternalBundleDiff } from "@/components/panels/external-sync/external-bundle-diff"
import { ModelCanvas } from "./model-canvas"
import { useModelEditorInteractions, type ModelEditorLogEntry } from "./model-editor.interactions"
import { PropertiesPanel } from "./properties-panel"
import { SyntaxConfirmation } from "./syntax-confirmation"
import { ProblemsPanel } from "./problems-panel"
import { UndoControls } from './undo-controls'
import { JavaRunControls } from './java-run-controls'
import { CurrentUmlControls } from './current-uml-controls'
import { FileTextView } from './file-text-preview'
import { isJavaPath } from '@/lib/models/file-explorer/file-kind'
import type { UndoProposal } from '@/lib/services/undo/undo-contract'
import type { ProblemLocation } from "@/lib/models/model-editor/problems.model"
import { FloatingToolsProvider, FloatingToolsHost } from "@/components/ui/floating-tools"
import { Feedback, EmptyState } from "@/components/ui/feedback"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatNodeTypeLabelController } from "@/controllers/model-editor/properties-panel.controller"
import { remapPath, pathKey, openPath, treeFiles, isSnapshotPath, type FileMutation } from "@/lib/models/model-editor/workspace-paths"
import type { MutationGate } from "@/lib/models/model-editor/editor-session"
import type { FileNode } from "@/lib/types"
import type { Change } from "@/lib/types"
import { useI18n } from "@/lib/i18n/locale-provider"

/** Props publicas do painel Model Editor. */
export interface ModelEditorProps {
  projectId: number
  projectTempPath: string
  projectPath: string
  problemsSignal: string
  checkJavaProposals: boolean
  onCheckJavaProposalsChange: (value: boolean) => void
  javaContextRevision: number
  onJavaContextChange: () => void
  /** Callback para publicar operacoes realizadas no editor para o shell da pagina. */
  onLogEntry?: (entry: ModelEditorLogEntry, filePath: string) => void
  /** Arquivo a abrir em uma nova aba. Quando muda, abre o arquivo. */
  openFile?: string
  /** Sinal monotonicamente crescente para reabrir o mesmo arquivo quando necessario. */
  openFileSignal?: number
  /** Mudanca a abrir em uma aba de visualizacao. */
  openChange?: Change | null
  /** Sinal monotonicamente crescente para reabrir a mesma mudanca quando necessario. */
  openChangeSignal?: number
  /** Informa ao shell qual mudanca esta visivel na aba atual. */
  onActiveChangeChange?: (change: Change | null) => void
  onCloseChange?: (change: Change) => void
  liveFiles?: FileNode[]
  fileMutation?: FileMutation & { revision: number }
  mutationGate?: MutationGate
  operationsBlocked?: boolean
  onMutation?: () => void
  onUndoMutation?: (mutation?: FileMutation) => Promise<void>
  onWorkingChange?: (busy: boolean) => void
  onNavigate?: () => void
  syncLocked?: boolean
}
const MODEL_TAB_PREFIX = "model:"
const CHANGE_TAB_PREFIX = "change:"
const CHANGE_TAB_ID = `${CHANGE_TAB_PREFIX}current`

function resolveFileNameFromPath(path: string, fallback: string): string {
  const normalizedPath = path.replace(/\\/g, "/")
  const pathParts = normalizedPath.split("/").filter(Boolean)
  return pathParts[pathParts.length - 1] ?? fallback
}

function buildModelTabId(path: string): string {
  return `${MODEL_TAB_PREFIX}${path}`
}

function buildChangeTabId(): string {
  return CHANGE_TAB_ID
}

function parseTabId(
  tabId: string
): { kind: "model"; path: string } | { kind: "change" } | null {
  if (tabId.startsWith(MODEL_TAB_PREFIX)) {
    return {
      kind: "model",
      path: tabId.slice(MODEL_TAB_PREFIX.length),
    }
  }

  if (tabId.startsWith(CHANGE_TAB_PREFIX)) {
    return {
      kind: "change",
    }
  }

  return null
}

/**
 * Componente de composicao do Model Editor.
 * Toda a logica de estado/interacoes esta isolada em useModelEditorInteractions.
 */
export function ModelEditor({
  projectId,
  projectTempPath,
  projectPath, problemsSignal,
  checkJavaProposals, onCheckJavaProposalsChange, javaContextRevision, onJavaContextChange,
  onLogEntry,
  openFile,
  openFileSignal,
  openChange,
  openChangeSignal,
  onActiveChangeChange,
  onCloseChange,
  liveFiles, fileMutation, mutationGate, operationsBlocked = false, onMutation, onUndoMutation, onWorkingChange, onNavigate,
  syncLocked = false,
}: ModelEditorProps) {
  const { changeTextLocale, t } = useI18n()
  const [isComponentsPanelOpen, setIsComponentsPanelOpen] = useState(false)
  const [isPropertiesPanelOpen, setIsPropertiesPanelOpen] = useState(false)
  const [openModelTabs, setOpenModelTabs] = useState<string[]>([])
  const [openChangeTab, setOpenChangeTab] = useState<Change | null>(null)
  const [activeTabId, setActiveTabId] = useState('')
  const [problemLocation, setProblemLocation] = useState<ProblemLocation | null>(null)
  const [undoBusy, setUndoBusy] = useState(false)
  const [propertiesDraft, setPropertiesDraft] = useState(false)

  const orderedTabs = useMemo(
    () => [
      ...openModelTabs.map((path) => ({
        kind: 'model' as const,
        id: buildModelTabId(path),
        label: resolveFileNameFromPath(path, t('common.file')),
        title: path,
        icon: isJavaPath(path) ? FileCode : FileText,
      })),
      ...(openChangeTab
        ? [{
            kind: 'change' as const,
            id: buildChangeTabId(),
            label: openChangeTab.fileName || openChangeTab.title,
            title: `${openChangeTab.title} • ${openChangeTab.fileName}`,
            icon: History,
          }]
        : []),
    ],
    [openChangeTab, openModelTabs, t]
  )

  const activeTabIdRef = useRef(activeTabId)
  const orderedTabsRef = useRef(orderedTabs)
  const openedChangeSignal = useRef<number | string | undefined>(undefined)

  useLayoutEffect(() => { activeTabIdRef.current = activeTabId }, [activeTabId])
  useLayoutEffect(() => { orderedTabsRef.current = orderedTabs }, [orderedTabs])

  const activeFile = parseTabId(activeTabId)
  const historicalModel = activeFile?.kind === "model" && isSnapshotPath(activeFile.path, projectTempPath)
  const isTextView = activeFile?.kind === "model" && !isJavaPath(activeFile.path)

  const {
    syntax, savedSyntax,
    layoutRef,
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
  } = useModelEditorInteractions({
    projectId,
    checkJavaProposals, javaContextRevision,
    changeTextLocale,
    defaultPath: '',
    writeBlocked: !historicalModel && (syncLocked || operationsBlocked), readOnly: historicalModel || isTextView, mutationGate, onMutation, onMutationStart: onNavigate,
    onLogEntry,
  })

  const openEditorPath = useCallback((requested?: string) => {
    const active = parseTabId(activeTabIdRef.current)
    const path = requested ?? (active?.kind === 'model' ? active.path : '')
    if (path && isJavaPath(path)) handleModelPathSubmit(path)
    else handleClearModel() // Invalidate PSI requests when a read-only text tab becomes active.
  }, [handleModelPathSubmit, handleClearModel])

  const activeTab = useMemo(() => parseTabId(activeTabId), [activeTabId])
  const activeChangeTab = useMemo(() => {
    if (activeTab?.kind !== "change") {
      return null
    }

    return openChangeTab
  }, [activeTab, openChangeTab])

  const mutationBusy = isDeletingNode || isUpdatingNode || isCreatingNode || isMovingNode
  const handleUndoWorkingChange = useCallback((busy: boolean) => {
    setUndoBusy(busy)
    onWorkingChange?.(mutationBusy || busy)
  }, [mutationBusy, onWorkingChange])
  useEffect(() => { onWorkingChange?.(mutationBusy || undoBusy) }, [mutationBusy, undoBusy, onWorkingChange])
  useEffect(() => { onActiveChangeChange?.(activeChangeTab ?? (historicalModel ? openChangeTab : null)) },
    [activeChangeTab, historicalModel, openChangeTab, onActiveChangeChange])

  const isDiffViewActive = activeChangeTab !== null
  const handleUndoConfirmed = useCallback(async (proposal: UndoProposal) => {
    const { metadata, direction } = proposal
    const source = direction === 'undo' ? metadata.after : metadata.before
    const destination = direction === 'undo' ? metadata.before : metadata.after
    const absolute = (path: string) => projectPath.replace(/[\\/]+$/, '') + '/' + path
    const moved = metadata.kind !== 'code' && ['file_move','file_rename','dir_move','dir_rename'].includes(metadata.action) && source && destination
      ? { from: absolute(source.path), to: absolute(destination.path) } : undefined
    await onUndoMutation?.(moved)
    if (!onUndoMutation) onMutation?.()
    const surviving = proposal.files.find(file => file.afterKind === 'file' && file.path.toLowerCase().endsWith('.java'))
    if (surviving) {
      const paths = orderedTabsRef.current.filter(tab => tab.kind === 'model').map(tab => moved ? remapPath(tab.title, moved) : tab.title).filter((path): path is string => path !== null)
      const path = openPath(paths, absolute(surviving.path))
      setOpenModelTabs(previous => previous.some(item => pathKey(item) === pathKey(path)) ? previous : [...previous, path])
      setActiveTabId(buildModelTabId(path)); activeTabIdRef.current = buildModelTabId(path)
      openEditorPath(path)
    } else if (activeFile?.kind === 'model' && !proposal.files.some(file => pathKey(absolute(file.path)) === pathKey(activeFile.path) && file.afterKind !== 'file')) openEditorPath(activeFile.path)
    setProblemLocation(null)
  }, [projectPath, onUndoMutation, onMutation, openEditorPath, activeFile])
  const handleTabChange = useCallback(
    (nextTabId: string) => {
      if (!nextTabId || nextTabId === activeTabIdRef.current) return

      const parsedTab = parseTabId(nextTabId)
      if (!parsedTab) return
      onNavigate?.()

      setActiveTabId(nextTabId)
      activeTabIdRef.current = nextTabId
      if (parsedTab.kind === "change") handleClearModel()

      if (parsedTab.kind === "model") {
        setModelPath(parsedTab.path)
        openEditorPath(parsedTab.path)
      }
    },
    [openEditorPath, handleClearModel, setModelPath, onNavigate]
  )

  useLayoutEffect(() => {
    if (!openChange) return
    const signal = openChangeSignal ?? openChange.preview?.snapshotId ?? openChange.id
    if (openedChangeSignal.current === signal) return
    openedChangeSignal.current = signal
    handleClearModel()
    const id = openChange.preview?.snapshotId
    setOpenModelTabs(previous => previous.filter(path => !isSnapshotPath(path, projectTempPath) || Boolean(id && isSnapshotPath(path, projectTempPath, id))))

    setOpenChangeTab(openChange)
    setActiveTabId(buildChangeTabId())
    activeTabIdRef.current = buildChangeTabId()
  }, [openChange, openChangeSignal, handleClearModel, projectTempPath])

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const parsedTab = parseTabId(tabId)
      if (!parsedTab) return
      onNavigate?.()

      const currentTabs = orderedTabsRef.current
      const currentActiveTabId = activeTabIdRef.current
      const closingIndex = currentTabs.findIndex((tab) => tab.id === tabId)
      const closingSnapshot = parsedTab.kind === 'change' ? openChangeTab?.preview?.snapshotId : undefined
      const nextTabs = currentTabs.filter((tab) => tab.id !== tabId && !(closingSnapshot && tab.kind === 'model' && tab.id.includes(closingSnapshot)))
      const nextActiveTabId =
        currentActiveTabId === tabId || !nextTabs.some(tab => tab.id === currentActiveTabId)
          ? nextTabs[closingIndex]?.id ?? nextTabs[closingIndex - 1]?.id ?? ''
          : currentActiveTabId

      if (parsedTab.kind === 'model') {
        setOpenModelTabs((previous) => previous.filter((path) => buildModelTabId(path) !== tabId))
      } else if (parsedTab.kind === 'change') {
        if (openChangeTab) {
          onCloseChange?.(openChangeTab)
          const id = openChangeTab.preview?.snapshotId
          if (id) setOpenModelTabs(previous => previous.filter(path => !path.includes(id)))
        }
        setOpenChangeTab(null)
      }

      setActiveTabId(nextActiveTabId)
      activeTabIdRef.current = nextActiveTabId
      if (nextActiveTabId === currentActiveTabId) return

      const nextParsedTab = parseTabId(nextActiveTabId)
      if (nextParsedTab?.kind === 'model') {
        setModelPath(nextParsedTab.path)
        openEditorPath(nextParsedTab.path)
      } else handleClearModel()
    },
    [handleClearModel, openEditorPath, setModelPath, onCloseChange, openChangeTab, onNavigate]
  )

  useEffect(() => {
    if (!openFile) {
      return
    }

    const path = openPath(orderedTabsRef.current.filter(tab => tab.kind === 'model').map(tab => tab.title), openFile)
    setOpenModelTabs((previous) =>
      previous.some(item => pathKey(item) === pathKey(path)) ? previous : [...previous, path]
    )
    setModelPath(path)
    openEditorPath(path)

    setActiveTabId(buildModelTabId(path))
    activeTabIdRef.current = buildModelTabId(path)
  }, [openFile, openFileSignal, setModelPath, openEditorPath])

  useEffect(() => {
    if (!fileMutation) return
    setOpenModelTabs(previous => [...new Set(previous.map(path => remapPath(path, fileMutation)).filter((path): path is string => path !== null))])
    const active = parseTabId(activeTabIdRef.current)
    if (active?.kind === "model") {
      const next = remapPath(active.path, fileMutation)
      if (next !== active.path) {
        handleClearModel()
        setActiveTabId(next ? buildModelTabId(next) : '')
        activeTabIdRef.current = next ? buildModelTabId(next) : ''
        if (next) openEditorPath(next)
      }
    }
  }, [fileMutation, handleClearModel, openEditorPath])

  useEffect(() => {
    if (!liveFiles) return
    const paths = treeFiles(liveFiles)
    const historical = (path: string) => isSnapshotPath(path, projectTempPath)
    setOpenModelTabs(previous => previous.filter(path => historical(path) || paths.has(pathKey(path))))
    const active = parseTabId(activeTabIdRef.current)
    if (active?.kind === "model" && !historical(active.path)) {
      if (!paths.has(pathKey(active.path))) {
        setActiveTabId(''); activeTabIdRef.current = ''; handleClearModel()
      } else openEditorPath(active.path)
    }
  }, [liveFiles, handleClearModel, openEditorPath, projectTempPath])

  const navigateProblem = useCallback((location: ProblemLocation) => {
    const requested = projectPath.replaceAll('\\', '/').replace(/\/+$/, '') + '/' + location.file
    const path = openPath(orderedTabsRef.current.filter(tab => tab.kind === 'model').map(tab => tab.title), requested)
    onNavigate?.()
    handleClearSelection()
    setProblemLocation(location)
    setOpenModelTabs(previous => previous.some(value => pathKey(value) === pathKey(path)) ? previous : [...previous, path])
    setActiveTabId(buildModelTabId(path)); activeTabIdRef.current = buildModelTabId(path)
    openEditorPath(path)
  }, [projectPath, onNavigate, handleClearSelection, openEditorPath])
  const locationPath = problemLocation ? projectPath.replace(/[\\/]+$/, '') + '/' + problemLocation.file : ''
  const visibleLocation = problemLocation && currentModel && !historicalModel && activeFile?.kind === 'model'
    && pathKey(activeFile.path) === pathKey(locationPath) ? problemLocation : null

  return (
    <FloatingToolsProvider><div data-testid="model-editor" data-loading={isLoadingModel} data-locked={syncLocked} data-operation={undoBusy ? 'undo-redo' : isUpdatingNode ? 'update' : isCreatingNode ? 'create' : isMovingNode ? 'move' : isDeletingNode ? 'delete' : 'idle'} aria-busy={undoBusy || isLoadingModel || isUpdatingNode || isCreatingNode || isMovingNode || isDeletingNode} className="isolate flex h-full flex-col overflow-hidden bg-background text-foreground [container-type:inline-size]">
      {backgroundError && <Feedback data-testid="model-background-error" tone="error" className="m-3">{backgroundError}</Feedback>}
      {backgroundFormattingNotice && <Feedback data-testid="model-background-notice" tone="warning" className="m-3">{backgroundFormattingNotice}</Feedback>}
      <header className="relative z-20 shrink-0 border-b border-border bg-card/60 px-4 py-3">
        <div className="flex flex-col gap-3">
          <div className="flex w-full items-center gap-2">
            <UndoControls projectId={projectId} viewKey={activeTabId} signal={problemsSignal} semantic={checkJavaProposals} mutationGate={mutationGate}
              blocked={syncLocked || operationsBlocked || mutationBusy || isLoadingModel || !!pendingCreation || !!syntax.review || propertiesDraft || !!historicalModel || isDiffViewActive || isTextView}
              suspended={syncLocked || mutationBusy || !!pendingCreation || !!syntax.review || propertiesDraft || !!historicalModel || isDiffViewActive || isTextView}
              onBusyChange={handleUndoWorkingChange} onConfirmed={handleUndoConfirmed} />
            <div
              role="tablist"
              aria-label={t('editor.tabs')}
              className="relative z-10 inline-flex h-10 min-w-0 flex-1 flex-nowrap justify-start overflow-x-auto overflow-y-hidden rounded-md border border-border bg-muted/40 p-1"
            >
              {orderedTabs.map((tab) => {
                const isActive = activeTabId === tab.id
                return (
                  <div data-testid="model-tab" data-tab-id={tab.id} key={tab.id} className="relative flex-none">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={isActive} tabIndex={isActive ? 0 : -1}
                      onKeyDown={event => {
                        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                        event.preventDefault()
                        const index = orderedTabs.findIndex(item => item.id === tab.id)
                        const next = event.key === 'Home' ? 0 : event.key === 'End' ? orderedTabs.length - 1
                          : (index + (event.key === 'ArrowRight' ? 1 : -1) + orderedTabs.length) % orderedTabs.length
                        event.currentTarget.closest('[role="tablist"]')?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
                        handleTabChange(orderedTabs[next].id)
                      }}
                      onClick={() => handleTabChange(tab.id)}
                      className={cn(
                        "inline-flex h-8 max-w-72 flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-3 pr-7 text-xs font-medium transition-[color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                        isActive
                          ? "bg-background text-primary border-primary/30"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      title={tab.title}
                    >
                      <tab.icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{tab.label}</span>
                    </button>
                    <button
                      type="button"
                      data-testid="model-tab-close" aria-label={t('editor.closeTab', { tab: tab.label })}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        handleCloseTab(tab.id)
                      }}
                      className="absolute right-0.5 top-1/2 z-20 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )
              })}
            </div>
            <CurrentUmlControls key={projectId} projectId={projectId}
              file={activeFile?.kind === 'model' && !historicalModel && activeFile.path.toLowerCase().endsWith('.java') ? activeFile.path : undefined}
              signal={problemsSignal} />
            <JavaRunControls key={projectId} projectId={projectId} contextRevision={javaContextRevision} onContextChange={onJavaContextChange} />

          </div>
        </div>
      </header>

      <div ref={layoutRef} className="relative z-0 min-h-0 flex flex-1 overflow-hidden flex-col lg:flex-row">
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="flex h-full min-h-0 min-w-0 items-stretch">
            {!isDiffViewActive && !historicalModel && !isTextView && (
              <div className="shrink-0 py-4 pl-4">
                <div className="flex h-full items-center">
                  {isComponentsPanelOpen && (
                    <div
                      className="flex h-full max-h-full overflow-hidden rounded-md border border-border bg-background/95 shadow-sm backdrop-blur supports-backdrop-filter:bg-background/80"
                      style={{ width: isDesktopLayout ? `${leftPanelWidthPx}px` : "min(88vw, 340px)", maxWidth: "30cqw" }}
                    >
                      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                        <ComponentsPanel />
                      </div>
                      {isDesktopLayout && (
                        <div
                          className="flex w-2 cursor-col-resize items-center justify-center bg-transparent transition-colors hover:bg-muted/40"
                          onMouseDown={() => handleResizeStart("left")}
                          data-testid="library-resize" title={t('editor.resizeLibrary')}
                        >
                          <div className="h-full w-px bg-border" />
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    data-testid="library-toggle"
                    aria-expanded={isComponentsPanelOpen}
                    onClick={() => setIsComponentsPanelOpen((previous) => !previous)}
                    className={cn(
                      "ml-2 inline-flex h-10 items-center gap-1 rounded-md border border-border bg-background/95 px-2 text-xs font-medium text-foreground shadow-sm backdrop-blur transition-colors hover:bg-accent",
                      !isComponentsPanelOpen && "ml-0"
                    )}
                    aria-label={isComponentsPanelOpen ? t('editor.collapseLibrary') : t('editor.expandLibrary')}
                  >
                    <Library className="h-3.5 w-3.5" />
                    {isComponentsPanelOpen ? (
                      <ChevronLeft className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            )}

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {visibleLocation && !activeChangeTab && <div data-testid="problem-location" data-current={visibleLocation.revision === currentModel?.revision}
                role="status" className="shrink-0 border-b border-border bg-muted px-4 py-2 text-xs text-foreground">
                {visibleLocation.revision === currentModel?.revision ? <>{visibleLocation.message} · {visibleLocation.line ? t('syntax.location', { line: visibleLocation.line, column: visibleLocation.column ?? 1 }) : t('syntax.noLocation')}</> : t('problems.locationStale')}
                <button type="button" className="ml-2 underline" onClick={() => setProblemLocation(null)}>{t('common.close')}</button>
              </div>}
              {!activeChangeTab && !isTextView && !modelError && formattingNotice && (
                <p data-testid="model-save-notice" data-formatting={formattingNotice} role="status" className="shrink-0 border-b notice-warning px-4 py-2 text-xs">
                  {t(formattingNotice === "rejected" ? "editor.formatRejected" : "editor.formatFailed")}
                </p>
              )}
              <div className="relative min-h-0 min-w-0 flex-1">
                <FloatingToolsHost />
                {activeChangeTab ? (
                  activeChangeTab.stale ? <p data-testid="pending-preview-stale" role="status" className="m-4 rounded-md border notice-warning p-4 text-sm">{t('history.pendingStale')}</p>
                  : activeChangeTab.changeType === 'external_bundle'
                    ? <ExternalBundleDiff projectId={projectId} changeId={Number(activeChangeTab.id)} />
                    : <ChangeDiffPreview key={activeChangeTab.preview?.snapshotId ?? activeChangeTab.id} mode="compact" change={activeChangeTab} projectId={projectId} projectTempPath={projectTempPath} />
                ) : isTextView && activeFile?.kind === 'model' ? (
                  <FileTextView key={activeFile.path} projectId={projectId} path={activeFile.path} signal={`${problemsSignal}:${openFileSignal ?? 0}`} />
                ) : modelError ? (
                  <main className="h-full bg-background p-4 md:p-6">
                    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 p-4">
                      <Feedback data-testid="model-error" tone="error">{modelError}</Feedback>
                      <Button data-testid="model-reload" variant="outline" disabled={isLoadingModel} onClick={() => openEditorPath()}>{t('common.reloadView')}</Button>
                    </div>
                  </main>
                ) : currentModel ? (
                  <ModelCanvas
                    diagnosticLocation={visibleLocation?.revision === currentModel.revision ? visibleLocation : null}
                    readOnly={historicalModel || mutationBusy || isLoadingModel || syncLocked || operationsBlocked}
                    leafTextContent={leafTextContent}
                    tree={currentModel.tree}
                    selectedNode={selectedNode}
                    isDeletingNode={isDeletingNode}
                    isCreatingNode={isCreatingNode}
                    isMovingNode={isMovingNode}
                    onSelectNode={handleSelectNode}
                    onClearSelection={handleClearSelection}
                    onDeleteNode={handleDeleteNode}
                    onDeleteLine={handleDeleteWhitespaceLine}
                    onCreateSnippet={handleCreateSnippet}
                    onMoveNode={handleMoveNode}
                    onDropLog={handleAddLogEntry}
                  />
                ) : (
                  <main className="h-full bg-background p-4 md:p-6">
                    <EmptyState className="h-full">{isLoadingModel ? <Feedback tone="loading">{t('editor.loadingFile')}</Feedback> : t('editor.noFile')}</EmptyState>
                  </main>
                )}
                {!activeChangeTab && !historicalModel && !isTextView && <ProblemsPanel projectId={projectId} model={currentModel} loading={isLoadingModel}
                  checkProposals={checkJavaProposals} onCheckProposalsChange={onCheckJavaProposalsChange} onContextChange={onJavaContextChange}
                  activePath={activeFile?.kind === 'model' ? activeFile.path : ''} signal={JSON.stringify([problemsSignal, javaContextRevision])} onNavigate={navigateProblem} />}
              </div>
            </div>

            {!isDiffViewActive && !isTextView && (
              <div className="shrink-0 py-4 pr-4">
                <div className="flex h-full items-center">
                  <button
                    type="button"
                    data-testid="properties-toggle"
                    aria-expanded={isPropertiesPanelOpen}
                    onClick={() => setIsPropertiesPanelOpen((previous) => !previous)}
                    className={cn(
                      "mr-2 inline-flex h-10 items-center gap-1 rounded-md border border-border bg-background/95 px-2 text-xs font-medium text-foreground shadow-sm backdrop-blur transition-colors hover:bg-accent",
                      !isPropertiesPanelOpen && "mr-0"
                    )}
                    aria-label={isPropertiesPanelOpen ? t('editor.collapseProperties') : t('editor.expandProperties')}
                  >
                    {isPropertiesPanelOpen ? (
                      <ChevronRight className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronLeft className="h-3.5 w-3.5" />
                    )}
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                  </button>

                  {isPropertiesPanelOpen && (
                    <div
                      className="flex h-full max-h-full overflow-hidden rounded-md border border-border bg-background/95 shadow-sm backdrop-blur supports-backdrop-filter:bg-background/80"
                      style={{ width: isDesktopLayout ? `${rightPanelWidthPx}px` : "min(88vw, 360px)", maxWidth: "30cqw" }}
                    >
                      {isDesktopLayout && (
                        <div
                          className="flex w-2 cursor-col-resize items-center justify-center bg-transparent transition-colors hover:bg-muted/40"
                          onMouseDown={() => handleResizeStart("right")}
                          data-testid="properties-resize" title={t('editor.resizeProperties')}
                        >
                          <div className="h-full w-px bg-border" />
                        </div>
                      )}
                      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                        <PropertiesPanel
                          onDraftChange={setPropertiesDraft}
                          projectId={projectId} model={currentModel} modelSource={leafTextContent} saveError={modelError}
                          readOnly={historicalModel || mutationBusy || isLoadingModel || syncLocked || operationsBlocked}
                          selectedNode={selectedNode}
                          selectedNodeContent={selectedNodeContent}
                          isUpdatingNode={isUpdatingNode}
                          onUpdateNode={handleUpdateNode}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        {syncLocked && !activeChangeTab && !historicalModel && <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm">
          <p className="max-w-md rounded-lg border border-border bg-card p-5 text-center text-sm shadow-sm">{t('sync.editorLocked')}</p>
        </div>}
      </div>

      {savedSyntax && !activeChangeTab && !isTextView && savedSyntax.revision === currentModel?.revision && <p data-testid="saved-syntax-status"
        data-state={savedSyntax.error ? 'unavailable' : savedSyntax.result ? 'complete' : 'checking'} data-revision={savedSyntax.revision}
        data-error-count={savedSyntax.result?.diagnostics.length}
        role="status" className="shrink-0 border-t px-4 py-2 text-xs text-muted-foreground">
        {savedSyntax.error ? t('syntax.savedUnavailable') : savedSyntax.result ? t('syntax.savedCount', { count: savedSyntax.result.diagnostics.length }) : t('syntax.savedChecking')}
      </p>}
      {pendingCreation && <ComponentCreationDialog key={pendingCreation.id} proposal={pendingCreation} busy={isCreatingNode}
        stale={creationStale} error={creationError} retryable={creationRetryable} onConfirm={handleConfirmCreation} onCancel={handleCancelCreation} />}
      <SyntaxConfirmation review={syntax.review} decide={syntax.decide} />
      <footer className="shrink-0 border-t border-border bg-card/60 px-4 py-1 min-h-[2rem]">
        <div className="flex items-center gap-3 overflow-x-auto overflow-y-hidden flex-wrap lg:flex-nowrap">
          {!isTextView && selectedNodeBreadcrumb.length > 0 ? (
            <div className="flex flex-nowrap items-center gap-1 whitespace-nowrap">
              {selectedNodeBreadcrumb.map((node, index) => (
                <div data-testid="breadcrumb-node" data-depth={index} data-node-type={node.type} key={`${node.type}-${node.startLine}-${node.startColumn}-${index}`} className="flex items-center">
                  {index > 0 && <ChevronRight className="mx-1 h-3 w-3 text-muted-foreground" />}
                  <button
                    type="button"
                    onClick={() => handleSelectBreadcrumb(node, index)}
                    className={cn(
                      "rounded-md px-2 py-1 text-xs transition-colors",
                      index === selectedNodeBreadcrumb.length - 1
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {formatNodeTypeLabelController(node.type)}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">{t(isTextView ? 'explorer.text.readOnly' : 'editor.selectForHierarchy')}</span>
          )}
        </div>
      </footer>
    </div></FloatingToolsProvider>
  )
}
