'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Folder, RefreshCw, History, GitBranch, FileUp, GitCompare } from 'lucide-react'
import { MutationGate } from '@/lib/models/model-editor/editor-session'
import type { FileMutation } from '@/lib/models/model-editor/workspace-paths'
import { loadWorkspaceTreeController } from '@/controllers/file-explorer/file-explorer.controller'
import { unwrapBackendAction } from '@/lib/services/backend-action-result'
import { Feedback } from "@/components/ui/feedback"
import { Header } from '@/components/header'
import { WorkspacePresence } from '@/components/projects/workspace-presence'
import { DrawerContainer, type DrawerItem } from '@/components/drawer-island'
import { ChangeDetailsModal } from '@/components/change-details-modal'
import { FileExplorer } from '@/components/panels/file-explorer'
import { ExternalSync } from '@/components/panels/external-sync'
import { PendingExternalPreview } from '@/components/panels/external-sync/pending-external-preview'
import { ChangeHistory } from '@/components/panels/change-history'
import { TrackControl } from '@/components/panels/track-control'
import { CommitMenu } from '@/components/panels/commit-menu'
import { DiffMenu } from '@/components/panels/diff-menu'
import { ComparisonPreview } from '@/components/panels/model-comparison/comparison-preview'
import { ModelEditor, type ModelEditorLogEntry } from '@/components/panels/model-editor'
import { releaseHistoryPreviewController, applyRestoreChangeController, isPendingHistoryPreviewCurrentController } from '@/controllers/restore/restore.controller'
import { scanExternalChangesController } from '@/controllers/external-sync/external-sync.controller'
import type { ComparisonFile } from '@/lib/services/model-comparison/model-comparison.service'
import type { HistoryLocation, HistoryNavigation } from '@/lib/models/change-history/history-navigation'
import type { Change, FileNode } from '@/lib/types'
import type { ExternalSyncSnapshot } from '@/lib/services/external-sync/external-sync.service'
import type { ExternalSyncChange } from '@/lib/services/external-sync/external-sync.model'
import { useI18n } from '@/lib/i18n/locale-provider'

export interface ProjectWorkspaceProps {
  projectId: number
  projectTempPath: string
  projectName: string
  projectDescription?: string | null
  projectPath: string
  fileTree: FileNode[]
  initialTreeError?: string
  workingCopyTree: FileNode[]
  workingCopyPrevTree: FileNode[]
}

function normalizePath(pathValue: string): string {
  return pathValue.replace(/\\/g, '/').replace(/\/+/g, '/')
}

function getWorkingCopyRoot(projectTempPath: string, snapshotId?: string): string {
  if (snapshotId) return `${projectTempPath}/comparisons/${snapshotId}/working-copy`
  const trimmed = projectTempPath.replace(/[\\/]+$/, '')
  return `${trimmed}\\working-copy`
}

function getWorkingCopyPrevRoot(projectTempPath: string, snapshotId?: string): string {
  if (snapshotId) return `${projectTempPath}/comparisons/${snapshotId}/working-copy-prev`
  const trimmed = projectTempPath.replace(/[\/]+$/, '')
  return `${trimmed}\\working-copy-prev`
}

function resolveStringValue(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function resolveDirectoryFromPath(pathValue: string): string {
  const normalized = normalizePath(pathValue)
  const parts = normalized.split('/').filter(Boolean)

  if (parts.length <= 1) {
    return ''
  }

  return parts.slice(0, -1).join('/')
}

function resolveBaseName(pathValue: string): string {
  const normalized = normalizePath(pathValue)
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

function joinRelativePath(parent: string, name: string): string {
  const normalizedParent = normalizePath(parent).replace(/\/+$/, '')
  const normalizedName = normalizePath(name).replace(/^\/+/, '')

  if (!normalizedParent) {
    return normalizedName
  }

  return `${normalizedParent}/${normalizedName}`
}

type ExplorerHighlightTone = 'create' | 'delete' | 'rename' | 'move'

type ExplorerHighlight = {
  path: string | null
  tone: ExplorerHighlightTone | null
  usePrevSnapshot: boolean
}

function resolveExplorerHighlight(
  change: Change | null,
  workingCopyRoot: string,
  workingCopyPrevRoot: string
): ExplorerHighlight {
  if (!change) {
    return { path: null, tone: null, usePrevSnapshot: false }
  }

  const reqBody = change.reqBody
  if (!reqBody || typeof reqBody !== 'object' || Array.isArray(reqBody)) {
    return { path: null, tone: null, usePrevSnapshot: false }
  }

  const record = reqBody as Record<string, unknown>
  const changeType = String(change.changeType ?? '').toLowerCase()

  const pathValue = resolveStringValue(record.path)
  const nameValue = resolveStringValue(record.name ?? record.newName)
  const sourcePath = resolveStringValue(record.sourcePath)
  const destPath = typeof record.destPath === 'string' ? record.destPath.trim() : null

  let relativePath: string | null = null
  let tone: ExplorerHighlightTone | null = null
  let usePrevSnapshot = false

  if (changeType === 'file_create' || changeType === 'dir_create') {
    tone = 'create'
    if (nameValue) {
      relativePath = joinRelativePath(pathValue ?? "", nameValue)
    }
  } else if (changeType === 'file_delete' || changeType === 'dir_delete') {
    tone = 'delete'
    relativePath = pathValue ?? sourcePath
    usePrevSnapshot = true
  } else if (changeType === 'file_rename' || changeType === 'dir_rename') {
    tone = 'rename'
    if (pathValue && nameValue) {
      const parentPath = resolveDirectoryFromPath(pathValue)
      relativePath = joinRelativePath(parentPath, nameValue)
    }
  } else if (changeType === 'file_move' || changeType === 'dir_move') {
    tone = 'move'
    if (sourcePath && destPath !== null) {
      const baseName = resolveBaseName(sourcePath)
      if (baseName) {
        relativePath = joinRelativePath(destPath, baseName)
      }
    }
  } else if (pathValue) {
    relativePath = pathValue
  }

  if (!relativePath) {
    return { path: null, tone, usePrevSnapshot }
  }

  const normalizedRelative = normalizePath(relativePath).replace(/^\/+/, '')
  const root = usePrevSnapshot ? workingCopyPrevRoot : workingCopyRoot
  const fullPath = `${root}\\${normalizedRelative.replace(/\//g, '\\')}`

  return { path: fullPath, tone, usePrevSnapshot }
}


export function ProjectWorkspace({
  projectId,
  projectTempPath,
  projectName,
  projectDescription,
  projectPath,
  fileTree,
  initialTreeError,
  workingCopyTree,
  workingCopyPrevTree,
}: ProjectWorkspaceProps) {
  const { t, tp } = useI18n()
  const [checkJavaProposals, setCheckJavaProposals] = useState(false)
  const [javaContextRevision, setJavaContextRevision] = useState(0)
  const invalidateJavaContext = useCallback(() => setJavaContextRevision(value => value + 1), [])
  const [syncState, setSyncState] = useState<ExternalSyncSnapshot | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncRevision, setSyncRevision] = useState(0)
  const [externalPreview, setExternalPreview] = useState<ExternalSyncChange | null>(null)
  const syncScanning = useRef(false)
  const syncGeneration = useRef(0)
  const [comparisonFile, setComparisonFile] = useState<ComparisonFile | null>(null)
  const handleComparisonStart = useCallback(() => setComparisonFile(null), [])
  const [diffInitialRefs, setDiffInitialRefs] = useState<{ base: string; target: string; signal: number } | undefined>(undefined)
  const [fileToOpen, setFileToOpen] = useState<string | undefined>(undefined)
  const [fileToOpenSignal, setFileToOpenSignal] = useState(0)
  const [mutationGate] = useState(() => new MutationGate())
  const restoreSequence = useRef(0)
  const treeRequest = useRef(0)
  const [fileBusy, setFileBusy] = useState(false)
  const [editorBusy, setEditorBusy] = useState(false)
  const [gitBusy, setGitBusy] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)
  const syncMutation = useRef(false)
  const handleSyncWorkingChange = useCallback((busy: boolean) => {
    syncMutation.current = busy
    syncGeneration.current += 1
    setSyncBusy(busy)
    if (busy) restoreSequence.current += 1
  }, [])
  const [treeRefreshing, setTreeRefreshing] = useState(false)
  const syncPaused = useRef(false)
  useLayoutEffect(() => {
    const paused = fileBusy || editorBusy || gitBusy || syncBusy || treeRefreshing
    if (paused && !syncPaused.current) syncGeneration.current += 1
    syncPaused.current = paused
  }, [fileBusy, editorBusy, gitBusy, syncBusy, treeRefreshing])
  const [treeError, setTreeError] = useState<string | null>(initialTreeError ?? null)
  const [fileOperationError, setFileOperationError] = useState<string | null>(null)
  const [fileMutation, setFileMutation] = useState<(FileMutation & { revision: number }) | undefined>()
  const [historyRevision, setHistoryRevision] = useState(0)
  const [workspaceEpoch, setWorkspaceEpoch] = useState(0)
  const handleModelMutation = useCallback(() => setHistoryRevision(value => value + 1), [])
  // SSR seeds the tree once; subsequent refreshes share the request sequence below.
  const [fileTreeState, setFileTreeState] = useState<FileNode[]>(fileTree)
  const [activeChange, setActiveChange] = useState<Change | null>(null)
  const [activeChangeSignal, setActiveChangeSignal] = useState(0)
  const invalidateRestore = useCallback(() => { restoreSequence.current += 1 }, [])
  const handleFileWorkingChange = useCallback((busy: boolean) => {
    if (busy) syncGeneration.current += 1
    setFileBusy(busy)
    if (busy) invalidateRestore()
  }, [invalidateRestore])
  const handleGitWorkingChange = useCallback((busy: boolean) => {
    if (busy) syncGeneration.current += 1
    setGitBusy(busy)
    if (busy) invalidateRestore()
  }, [invalidateRestore])
  const handleEditorWorkingChange = useCallback((busy: boolean) => {
    if (busy) syncGeneration.current += 1
    setEditorBusy(busy)
    if (busy) invalidateRestore()
  }, [invalidateRestore])
  const ownedPreviews = useRef(new Set<string>())
  const currentPreview = useRef<string | null>(null)
  const releaseOwnedPreview = useCallback((id: string) => {
    ownedPreviews.current.delete(id)
    if (currentPreview.current === id) currentPreview.current = null
    void releaseHistoryPreviewController(projectId, id).catch(() => {})
  }, [projectId])
  const lastHistoryRevision = useRef(historyRevision)
  useEffect(() => {
    if (lastHistoryRevision.current === historyRevision) return
    lastHistoryRevision.current = historyRevision
    restoreSequence.current += 1
    if (activeChange && !activeChange.commitId && !activeChange.stale) {
      if (activeChange.preview) releaseOwnedPreview(activeChange.preview.snapshotId)
      setActiveChange({ ...activeChange, stale: true, preview: undefined })
      setActiveChangeSignal(value => value + 1)
    }
  }, [historyRevision, activeChange, releaseOwnedPreview])
  useEffect(() => {
    if (!activeChange || activeChange.commitId || activeChange.stale || !activeChange.preview) return
    const { id, preview } = activeChange
    let cancelled = false
    const check = async () => {
      const current = await isPendingHistoryPreviewCurrentController(projectId, preview.snapshotId, Number(id)).catch(() => false)
      if (cancelled || current) return
      releaseOwnedPreview(preview.snapshotId)
      setActiveChange(previous => previous?.id === id && previous.preview?.snapshotId === preview.snapshotId
        ? { ...previous, stale: true, preview: undefined } : previous)
      setActiveChangeSignal(value => value + 1)
    }
    const timer = window.setInterval(() => void check(), 5000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [activeChange, projectId, releaseOwnedPreview])
  useEffect(() => () => {
    restoreSequence.current += 1
    treeRequest.current += 1
    for (const id of ownedPreviews.current) void releaseHistoryPreviewController(projectId, id).catch(() => {})
  }, [projectId])
  const [isChangeDetailsOpen, setIsChangeDetailsOpen] = useState(false)

  const [leftDrawers, setLeftDrawers] = useState<string[]>([])
  const [rightDrawers, setRightDrawers] = useState<string[]>([])
  const [historyNavigation, setHistoryNavigation] = useState<HistoryNavigation | null>(null)
  const historyNavigationSequence = useRef(0)
  const handleViewHistory = useCallback((target: HistoryLocation) => {
    setHistoryNavigation({ ...target, projectId, requestId: ++historyNavigationSequence.current })
    setRightDrawers(previous => [...previous.filter(id => id !== 'track-control' && id !== 'change-history'), 'change-history'])
  }, [projectId])
  const handleHistoryNavigationHandled = useCallback((requestId: number) => {
    setHistoryNavigation(current => current?.requestId === requestId ? null : current)
  }, [])

  const toggleLeftDrawer = (id: string) => {
    setLeftDrawers((previous) =>
      previous.includes(id) ? previous.filter((drawerId) => drawerId !== id) : [...previous, id]
    )
  }

  const toggleRightDrawer = (id: string) => {
    setRightDrawers((previous) =>
      previous.includes(id) ? previous.filter((drawerId) => drawerId !== id) : [...previous, id]
    )
  }

  const handleFileSelect = (node: FileNode) => {
    console.log('Selected:', node.name)
  }

  const handleFileDoubleClick = useCallback((node: FileNode) => {
    if (node.type === 'file' && node.path) {
      restoreSequence.current += 1
      setExternalPreview(null)
      setComparisonFile(null)
      setFileToOpen(node.path)
      setFileToOpenSignal((previous) => previous + 1)
      console.log('Opening file:', node.path)
    }
  }, [])

  const handleFileTreeChanged = useCallback(async (mutation?: FileMutation) => {
    const request = ++treeRequest.current
    syncGeneration.current += 1
    if (mutation) setFileMutation(previous => ({ ...mutation, revision: (previous?.revision ?? 0) + 1 }))
    setHistoryRevision(value => value + 1)
    setSyncRevision(value => value + 1)
    setTreeRefreshing(true)
    try {
      const files = unwrapBackendAction(await loadWorkspaceTreeController(projectId))
      if (treeRequest.current === request) { setFileTreeState(files); setTreeError(null) }
    } catch (error) {
      if (treeRequest.current === request) setTreeError(error instanceof Error ? error.message : t('errors.loadChanges'))
    } finally { if (treeRequest.current === request) setTreeRefreshing(false) }
  }, [projectId, t])

  const applySyncState = useCallback((next: ExternalSyncSnapshot) => {
    setSyncState((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
    setExternalPreview((previous) => previous && next.changes.some((change) =>
      change.path === previous.path && change.revision === previous.revision) ? previous : null)
    setSyncError(null)
  }, [])
  const handleSyncStateChange = useCallback((next: ExternalSyncSnapshot) => {
    syncGeneration.current += 1
    applySyncState(next)
  }, [applySyncState])

  const handleSyncRefresh = useCallback(async () => {
    if (syncScanning.current || syncMutation.current) return
    syncScanning.current = true
    const generation = syncGeneration.current
    try {
      const next = unwrapBackendAction(await scanExternalChangesController(projectId))
      if (generation === syncGeneration.current) applySyncState(next)
    } catch (caught) {
      if (generation !== syncGeneration.current) return
      setSyncError(caught instanceof Error ? caught.message : t('sync.scanFailed'))
      setSyncState(null)
      setExternalPreview(null)
    } finally {
      syncScanning.current = false
    }
  }, [applySyncState, projectId, t])
  const handlePendingRewindComplete = useCallback(async () => {
    restoreSequence.current += 1
    const old = currentPreview.current
    currentPreview.current = null
    setActiveChange(null); setActiveChangeSignal(value => value + 1)
    setIsChangeDetailsOpen(false); setExternalPreview(null); setComparisonFile(null)
    setFileToOpen(undefined); setFileToOpenSignal(value => value + 1)
    setWorkspaceEpoch(value => value + 1)
    if (old) releaseOwnedPreview(old)
    await Promise.all([handleFileTreeChanged(), handleSyncRefresh()])
  }, [handleFileTreeChanged, handleSyncRefresh, releaseOwnedPreview])

  useEffect(() => {
    const scan = () => { if (!syncPaused.current) void handleSyncRefresh() }
    scan()
    const timer = window.setInterval(scan, 4000)
    return () => { window.clearInterval(timer); syncGeneration.current += 1 }
  }, [handleSyncRefresh])

  const handleExpandDetails = () => {
    if (!activeChange) {
      return
    }

    setIsChangeDetailsOpen(true)
  }

  const handleCompareCommit = (commitId: string, previousId?: string | null) => {
    const target = `commit:${commitId.replace(/^commit-/, '')}`
    const base = previousId ? `commit:${previousId.replace(/^commit-/, '')}` : 'empty'
    setComparisonFile(null)
    setDiffInitialRefs((previous) => ({ base, target, signal: (previous?.signal ?? 0) + 1 }))
    setRightDrawers((previous) => previous.includes('diff-menu') ? previous : [...previous, 'diff-menu'])
  }

  const handleRestoreChange = useCallback(async (change: Change): Promise<void> => {
    const sequence = ++restoreSequence.current
    setExternalPreview(null); setComparisonFile(null)
    if (change.commitId && change.changeType === 'external_bundle') {
      const old = currentPreview.current
      currentPreview.current = null
      setActiveChange(change); setActiveChangeSignal(previous => previous + 1)
      if (old) releaseOwnedPreview(old)
      return
    }
    const result = await applyRestoreChangeController({ projectId, changeId: change.id }).catch(error => {
      if (sequence === restoreSequence.current) throw error
      return null
    })
    if (!result) return
    if (result.status !== 'ok') {
      if (sequence !== restoreSequence.current) return
      throw new Error(result.message ?? t('errors.restoreChange'))
    }
    ownedPreviews.current.add(result.preview.snapshotId)
    if (sequence !== restoreSequence.current) { releaseOwnedPreview(result.preview.snapshotId); return }
    const enriched = { ...change, stale: false, changeType: result.preview.changeType, reqBody: result.preview.reqBody, preview: result.preview }
    const old = currentPreview.current
    currentPreview.current = enriched.preview?.snapshotId ?? null
    setActiveChange(enriched); setActiveChangeSignal(previous => previous + 1)
    if (old && old !== currentPreview.current) releaseOwnedPreview(old)
  }, [projectId, releaseOwnedPreview, t])

  const previewChange = activeChange?.stale ? null : activeChange
  const workingCopyRoot = getWorkingCopyRoot(projectTempPath, previewChange?.preview?.snapshotId)
  const syncLocked = !syncState || Boolean(syncState.commitRequired || syncState.changes.length)
  const syncPendingReview = Boolean(syncState?.changes.length)
  const workingCopyPrevRoot = getWorkingCopyPrevRoot(projectTempPath, previewChange?.preview?.snapshotId)
  const highlight = resolveExplorerHighlight(previewChange, workingCopyRoot, workingCopyPrevRoot)
  const highlightedPath = highlight.path
  const explorerFiles = previewChange
    ? highlight.usePrevSnapshot
      ? previewChange.preview?.beforeTree ?? workingCopyPrevTree
      : previewChange.preview?.afterTree ?? workingCopyTree
    : fileTreeState
  const explorerRepositoryPath = previewChange
    ? highlight.usePrevSnapshot
      ? workingCopyPrevRoot
      : workingCopyRoot
    : projectPath

  const handleModelEditorLogEntry = useCallback((entry: ModelEditorLogEntry, filePath: string) => {
    console.log('Model editor log entry:', { entry, filePath })
  }, [])

  const handleCommit = async (title: string, description: string) => {
    console.log('Commit:', { title, description })
    await Promise.all([handleFileTreeChanged(), handleSyncRefresh()])
  }

  const leftDrawerItems: DrawerItem[] = [
    {
      id: 'file-explorer',
      title: t('drawers.fileExplorer'),
      icon: <Folder className="h-4 w-4" />,
      content: (
        <FileExplorer key={`${projectId}:${explorerRepositoryPath}`}
          projectId={projectId}
          files={explorerFiles}
          repositoryPath={explorerRepositoryPath}
          highlightedPath={highlightedPath}
          highlightTone={highlight.tone}
          readOnly={Boolean(activeChange) || syncLocked || editorBusy || gitBusy || syncBusy || treeRefreshing || Boolean(treeError)}
          mutationGate={mutationGate} onWorkingChange={handleFileWorkingChange}
          onBackgroundError={setFileOperationError}
          onDoubleClick={handleFileDoubleClick}
          onTreeChanged={handleFileTreeChanged}
        />
      ),
    },
    {
      id: 'external-sync',
      title: t('drawers.externalSync'),
      icon: <RefreshCw className="h-4 w-4" />,
      badge: syncState && !syncState.needsInitialCommit ? syncState.changes.length : undefined,
      badgeLabel: syncState ? tp('sync.detected', syncState.changes.length) : undefined,
      status: syncError ? 'error' : syncState?.changes.length || syncState?.commitRequired
        ? 'attention' : syncState?.initialized ? 'ready' : undefined,
      content: (
        <ExternalSync projectId={projectId} snapshot={syncState} scanError={syncError} onRefresh={handleSyncRefresh}
          onStateChange={handleSyncStateChange} onFilesChanged={handleFileTreeChanged}
          mutationGate={mutationGate} onWorkingChange={handleSyncWorkingChange}
          operationsBlocked={fileBusy || editorBusy || gitBusy || treeRefreshing || Boolean(treeError)}
          onPreviewChange={setExternalPreview} activePreviewPath={externalPreview?.path} />
      ),
    },
  ]

  const rightDrawerItems: DrawerItem[] = [
    {
      id: 'change-history',
      title: t('drawers.changeHistory'),
      icon: <History className="h-4 w-4" />,
      content: (
        <ChangeHistory
          projectId={projectId}
          changeSignal={historyRevision}
          navigation={historyNavigation}
          onNavigationHandled={handleHistoryNavigationHandled}
          isDrawerOpen={rightDrawers.includes('change-history')}
          activeChangeId={activeChange?.stale ? null : activeChange?.id ?? null}
          onExpandDetails={handleExpandDetails}
          onCompareCommit={handleCompareCommit}
          onRestoreChange={handleRestoreChange}
          mutationGate={mutationGate}
          operationsBlocked={fileBusy || editorBusy || gitBusy || syncBusy || treeRefreshing || Boolean(treeError) || Boolean(syncState?.changes.length)}
          onWorkingChange={handleGitWorkingChange}
          onPendingRewindComplete={handlePendingRewindComplete}
        />
      ),
    },
    {
      id: 'track-control',
      title: t('drawers.trackControl'),
      icon: <GitBranch className="h-4 w-4" />,
      content: <TrackControl onViewHistory={handleViewHistory} isDrawerOpen={rightDrawers.includes('track-control')} projectPath={projectPath}
        changeSignal={historyRevision} operationsBlocked={syncLocked || fileBusy || editorBusy || gitBusy || syncBusy || treeRefreshing || Boolean(treeError)}
        mutationGate={mutationGate} onWorkingChange={handleGitWorkingChange} onRepositoryChanged={handleFileTreeChanged} />,
    },
    {
      id: 'commit-menu',
      title: t('drawers.commitMenu'),
      icon: <FileUp className="h-4 w-4" />,
      content: (
        <CommitMenu
          changeSignal={syncRevision + historyRevision}
          operationsBlocked={fileBusy || editorBusy || gitBusy || syncBusy || treeRefreshing || Boolean(treeError)}
          mutationGate={mutationGate} onWorkingChange={handleGitWorkingChange} onRepositoryChanged={handleFileTreeChanged}
          isDrawerOpen={rightDrawers.includes('commit-menu')}
          onCommit={handleCommit}
          projectPath={projectPath}
          syncPendingReview={syncPendingReview}
          syncCommitRequired={Boolean(syncState?.commitRequired)}
        />
      ),
    },
    {
      id: 'diff-menu',
      title: t('drawers.diffMenu'),
      icon: <GitCompare className="h-4 w-4" />,
      content: (
        <DiffMenu
          projectId={projectId}
          initialRefs={diffInitialRefs}
          onSelectFile={setComparisonFile}
          onCompareStart={handleComparisonStart}
        />
      ),
    },
  ]

  return (
    <div data-testid="project-workspace" data-project-id={projectId} data-sync-locked={syncLocked} className="flex h-screen flex-col overflow-hidden bg-background">
      <WorkspacePresence projectId={projectId} />
      <Header
        projectId={projectId}
        projectName={projectName}
        projectDescription={projectDescription}
        checkJavaProposals={checkJavaProposals}
        onCheckJavaProposalsChange={setCheckJavaProposals}
        onJavaContextChange={invalidateJavaContext}
      />

      <div className="flex flex-1 overflow-hidden">
        <DrawerContainer
          items={leftDrawerItems}
          openDrawers={leftDrawers}
          onToggleDrawer={toggleLeftDrawer}
          position="left"
        />

        <div className="relative min-w-0 flex-1 overflow-hidden">
          {fileOperationError && <Feedback tone="error" data-testid="workspace-operation-error" className="m-3">{fileOperationError}</Feedback>}
          {treeError && <Feedback tone="error" data-testid="workspace-tree-error" className="m-3">{treeError}<button data-testid="workspace-tree-reload" className="ml-3 underline" onClick={() => void handleFileTreeChanged()}>{t('common.reloadView')}</button></Feedback>}
          <ModelEditor key={`${projectId}:${workspaceEpoch}`}
            checkJavaProposals={checkJavaProposals}
            onCheckJavaProposalsChange={setCheckJavaProposals}
            javaContextRevision={javaContextRevision}
            onJavaContextChange={invalidateJavaContext}
            projectPath={projectPath} problemsSignal={JSON.stringify([historyRevision, fileMutation?.revision, syncState?.changes, syncState?.commitRequired, syncError])}
            liveFiles={fileTreeState} fileMutation={fileMutation} mutationGate={mutationGate}
            operationsBlocked={fileBusy || gitBusy || syncBusy || treeRefreshing || Boolean(treeError)} onWorkingChange={handleEditorWorkingChange} onMutation={handleModelMutation} onUndoMutation={handleFileTreeChanged} onNavigate={invalidateRestore}
            projectId={projectId}
            projectTempPath={projectTempPath}
            openFile={fileToOpen}
            openFileSignal={fileToOpenSignal}
            openChange={activeChange}
            openChangeSignal={activeChangeSignal}
            onActiveChangeChange={setActiveChange}
            onCloseChange={(change) => { if (change.preview) releaseOwnedPreview(change.preview.snapshotId) }}
            onLogEntry={handleModelEditorLogEntry}
            syncLocked={syncLocked}
          />
          {externalPreview && <PendingExternalPreview key={`${externalPreview.path}:${externalPreview.revision}`}
            projectId={projectId} change={externalPreview} onClose={() => setExternalPreview(null)} />}
          {comparisonFile && <ComparisonPreview key={`${comparisonFile.path}:${comparisonFile.beforeSource?.length ?? 0}:${comparisonFile.afterSource?.length ?? 0}`}
            projectId={projectId} file={comparisonFile} onClose={() => setComparisonFile(null)} />}
        </div>

        <DrawerContainer
          items={rightDrawerItems}
          openDrawers={rightDrawers}
          onToggleDrawer={toggleRightDrawer}
          position="right"
        />
      </div>

      <ChangeDetailsModal
        open={isChangeDetailsOpen}
        onOpenChange={setIsChangeDetailsOpen}
        change={activeChange}
        onRestoreChange={handleRestoreChange}
        projectId={projectId}
        projectTempPath={projectTempPath}
        projectPath={projectPath}
        explorerFiles={explorerFiles}
        explorerRepositoryPath={explorerRepositoryPath}
        highlightedPath={highlightedPath}
        highlightTone={highlight.tone}
      />
    </div>
  )
}
