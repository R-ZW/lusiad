'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  GitCommit,
  Loader2,
  FileText,
  Tag,
  Clock,
  Hash,
  AlignLeft,
  FolderOpen,
  GitBranch,
  Layers,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { ChangeDiffPreview } from '@/components/panels/model-editor/change-diff-preview'
import { ExternalBundleDiff } from '@/components/panels/external-sync/external-bundle-diff'
import { FileExplorer } from '@/components/panels/file-explorer'
import { CommitGraphSVG } from '@/components/panels/track-control'
import { useTrackControlInteractions } from '@/components/panels/track-control/track-control.interactions'
import { cn } from '@/lib/utils'
import type { Change, Commit, FileNode } from '@/lib/types'
import type { ChangeHistoryRecord, ChangeHistorySnapshot } from '@/lib/models/change-history/change-history.model'
import type { CommitHistoryRecord } from '@/lib/services/commit-history/commit-history.service'
import { loadChangeHistoryController } from '@/controllers/change-history/change-history.controller'
import { loadCommitByIdController } from '@/controllers/commit-history/commit-history.controller'
import { useI18n } from '@/lib/i18n/locale-provider'
import { localizeGeneratedChange } from '@/lib/i18n/change-text'
import { compareHistoryIds } from '@/lib/models/change-history/history-page'
import type { AppLocale } from '@/lib/i18n/core'

type ExplorerHighlightTone = 'create' | 'delete' | 'rename' | 'move'

interface ChangeDetailsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  change: Change | null
  onChangeSelect?: (change: Change) => void
  onRestoreChange?: (change: Change) => Promise<void> | void
  projectId: number
  projectTempPath: string
  projectPath: string
  explorerFiles: FileNode[]
  explorerRepositoryPath: string
  highlightedPath?: string | null
  highlightTone?: ExplorerHighlightTone | null
}

function resolveTypeLabel(change: Change): string {
  const t = String(change.changeType ?? '').toLowerCase()
  if (t.includes('move')) return 'M'
  if (t.includes('rename')) return 'R'
  if (t.includes('update')) return 'U'
  switch (change.type) {
    case 'added': return 'A'
    case 'modified': return 'M'
    case 'deleted': return 'D'
  }
}

function resolveTypeClass(change: Change): string {
  const t = String(change.changeType ?? '').toLowerCase()
  if (t.includes('move')) return 'diff-text-moved'
  if (t.includes('rename')) return 'diff-text-moved'
  if (t.includes('update')) return 'diff-text-modified'
  switch (change.type) {
    case 'added': return 'diff-text-added'
    case 'modified': return 'diff-text-modified'
    case 'deleted': return 'diff-text-removed'
  }
}

function resolveBadgeBg(change: Change): string {
  const t = String(change.changeType ?? '').toLowerCase()
  if (t.includes('move')) return 'diff-block diff-moved'
  if (t.includes('rename')) return 'diff-block diff-moved'
  if (t.includes('update')) return 'diff-block diff-modified'
  switch (change.type) {
    case 'added': return 'diff-block diff-added'
    case 'modified': return 'diff-block diff-modified'
    case 'deleted': return 'diff-block diff-removed'
  }
}

function resolveCommitKey(commitId: string): string {
  return commitId.startsWith('commit-') ? commitId : `commit-${commitId}`
}

function normalizeCommitId(commitId?: string | null): number | null {
  if (!commitId) return null
  const raw = commitId.startsWith('commit-') ? commitId.slice('commit-'.length) : commitId
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function previewExplorerHighlight(change: Change | null, side: 'before' | 'after', projectPath: string,
  snapshotRoot: string): string | null {
  if (!change?.preview || change.stale) return null
  const kind = String(change.changeType ?? '').toLowerCase()
  if (side === 'after' && (kind.endsWith('_delete') || kind === 'delete')) return null
  if (side === 'before' && (kind.endsWith('_create') || kind === 'create')) return null

  const body = change.reqBody && typeof change.reqBody === 'object' && !Array.isArray(change.reqBody)
    ? change.reqBody as Record<string, unknown> : {}
  const root = projectPath.replaceAll('\\', '/').replace(/\/$/, '')
  const relativeToProject = (value: unknown): string | null => {
    if (typeof value !== 'string') return null
    const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '')
    if (normalized === '.' || normalized.toLowerCase() === root.toLowerCase()) return ''
    return normalized.toLowerCase().startsWith(root.toLowerCase() + '/')
      ? normalized.slice(root.length + 1) : normalized
  }
  const original = relativeToProject(kind.endsWith('_move') ? body.sourcePath : body.path)
  let relative = original
  if (side === 'after' && kind.endsWith('_create')) {
    const parent = relativeToProject(body.path)
    relative = parent !== null && typeof body.name === 'string' ? [parent, body.name].filter(Boolean).join('/') : null
  } else if (side === 'after' && kind.endsWith('_rename')) {
    const name = body.newName ?? body.name
    relative = original !== null && typeof name === 'string' ? [...original.split('/').slice(0, -1), name].join('/') : null
  } else if (side === 'after' && kind.endsWith('_move')) {
    const parent = relativeToProject(body.destPath)
    relative = parent !== null && original !== null ? [parent, original.split('/').at(-1)].filter(Boolean).join('/') : null
  }
  if (!relative || relative.startsWith('/') || /^[a-z]:\//i.test(relative) || relative.split('/').includes('..')) return null
  return `${snapshotRoot}/${relative}`
}

function mapHistoryRecordToChange(record: ChangeHistoryRecord, locale: AppLocale): Change {
  const parsedTimestamp = new Date(record.timestamp)
  const resolvedTimestamp = Number.isNaN(parsedTimestamp.getTime()) ? new Date() : parsedTimestamp

  return localizeGeneratedChange({
    id: record.id,
    title: record.title,
    description: record.description,
    timestamp: resolvedTimestamp,
    type: record.type,
    changeType: record.changeType,
    scope: record.scope,
    fileName: record.fileName,
    commitId: record.commitId,
    reqBody: record.reqBody,
  }, locale)
}

function resolveCommitChanges(
  commitId: number | string,
  snapshot: ChangeHistorySnapshot | null
): ChangeHistoryRecord[] {
  if (!snapshot) {
    return []
  }

  const normalizedId = String(commitId).replace(/^commit-/, '')
  const direct = snapshot.committedChangesByCommitId[normalizedId]
  if (direct) {
    return direct
  }

  const prefixed = `commit-${normalizedId}`
  return snapshot.committedChangesByCommitId[prefixed] ?? []
}

function buildCommitFromRecord(record: CommitHistoryRecord, changes: Change[]): Commit {
  const parsedTimestamp = new Date(record.timestamp)
  const resolvedTimestamp = Number.isNaN(parsedTimestamp.getTime()) ? new Date() : parsedTimestamp
  const trackId = `branch-${record.branchId}`
  const trackName = record.branchName ?? trackId

  return {
    id: resolveCommitKey(record.id),
    title: record.summary,
    description: record.description ?? undefined,
    timestamp: resolvedTimestamp,
    trackId,
    trackName,
    changes,
    isMergeCommit: record.isMergeCommit,
    isNewBranchCommit: record.isNewBranchCommit,
  }
}

function DetailItem({
  icon: Icon,
  label,
  value,
  mono = false,
  className,
  testId,
}: {
  icon: React.ElementType
  label: string
  value: string
  mono?: boolean
  className?: string
  testId?: string
}) {
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted/60">
        <Icon className="h-3 w-3 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
          {label}
        </p>
        <p data-testid={testId} className={cn('whitespace-pre-wrap break-words text-xs text-foreground leading-snug', mono && 'font-mono text-xs')}>
          {value}
        </p>
      </div>
    </div>
  )
}

// ─── ChangeChain ────────────────────────────────────────────────────────────
//
// Recebe `scrollTrigger` (incrementado a cada vez que o modal abre ou a
// mudança ativa muda) para forçar a re-execução do scroll mesmo quando
// `activeChangeId` não muda entre duas aberturas do modal.

interface ChangeChainProps {
  changes: Change[]
  activeChangeId?: string | null
  /** Incrementado externamente para forçar re-centralização */
  scrollTrigger?: number
  onSelect?: (change: Change) => void
  onRestoreChange?: (change: Change) => void
}

function ChangeChain({
  changes,
  activeChangeId,
  scrollTrigger,
  onSelect,
  onRestoreChange,
}: ChangeChainProps) {
  const { t } = useI18n()
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

  // Centraliza o item ativo sempre que activeChangeId, scrollTrigger ou a
  // lista de mudanças mudam. Usa requestAnimationFrame para garantir que o
  // layout já foi calculado pelo browser antes de tentar scrollar.
  useEffect(() => {
    const container = scrollRef.current
    const activeEl  = activeRef.current
    if (!container || !activeEl) return

    const run = () => {
      const containerWidth = container.getBoundingClientRect().width
      const scrollLeft =
        activeEl.offsetLeft - container.offsetLeft - containerWidth / 2 + activeEl.offsetWidth / 2
      container.scrollTo({ left: scrollLeft, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    }

    // rAF duplo: primeiro frame atualiza medidas, segundo aplica o scroll
    const id = requestAnimationFrame(() => requestAnimationFrame(run))
    return () => cancelAnimationFrame(id)
  }, [activeChangeId, scrollTrigger, changes])

  if (changes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        {t('history.noChanges')}
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      className="flex items-center gap-1.5 overflow-x-auto pb-1"
      // scrollbar-thin via scrollbarWidth — visível para o usuário indicar que
      // há mais itens fora da área visível
      style={{ scrollbarWidth: 'thin', scrollbarColor: 'hsl(var(--border)) transparent' }}
    >
      {changes.map((change, index) => {
        const isActive   = change.id === activeChangeId
        const canRestore = Boolean(onRestoreChange && change.commitId && change.changeType !== 'external_bundle')
        return (
          <div key={change.id} className="flex shrink-0 items-center gap-1.5">
            <button
              data-testid="history-timeline-change" data-change-id={change.id} data-active={isActive}
              ref={isActive ? activeRef : undefined}
              onClick={() => {
                if (canRestore) {
                  onRestoreChange?.(change)
                }
                onSelect?.(change)
              }}
              className={cn(
                'flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-all duration-150',
                'hover:border-border hover:bg-accent/50',
                isActive
                  ? cn('shadow-sm', resolveBadgeBg(change))
                  : 'border-border/40 bg-transparent',
              )}
            >
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded text-xs font-bold font-mono',
                  resolveTypeClass(change),
                  resolveBadgeBg(change),
                  'border',
                )}
              >
                {resolveTypeLabel(change)}
              </span>
              <div className="min-w-0">
                <p
                  className={cn(
                    'max-w-[120px] truncate text-xs font-medium',
                    isActive ? 'text-foreground' : 'text-foreground/70',
                  )}
                >
                  {change.title}
                </p>
                <p className="text-xs text-muted-foreground/70">
                  {String(change.scope ?? '').toLowerCase() === 'dir'
                    ? t('history.scope.directory')
                    : String(change.scope ?? '').toLowerCase() === 'project'
                      ? t('history.scope.project')
                      : t('history.scope.file')}
                </p>
              </div>
            </button>
            {index < changes.length - 1 && (
              <ArrowRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground/30" />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export function ChangeDetailsModal({
  open,
  onOpenChange,
  change,
  onChangeSelect,
  onRestoreChange,
  projectId,
  projectTempPath,
  projectPath,
  explorerFiles,
  explorerRepositoryPath,
  highlightedPath,
  highlightTone,
}: ChangeDetailsModalProps) {
  const { changeTextLocale, dateTime, t, tp } = useI18n()
  const [commitDetails, setCommitDetails] = useState<Commit | null>(null)
  const [commitChanges, setCommitChanges] = useState<Change[]>([])
  const [isCommitLoading, setIsCommitLoading] = useState(false)
  const [activeDiffView, setActiveDiffView] = useState<'code' | 'uml'>('code')
  const [explorerSide, setExplorerSide] = useState<'before' | 'after'>('after')
  useEffect(() => { setExplorerSide(highlightTone === 'delete' ? 'before' : 'after') }, [change?.id, change?.preview?.snapshotId, highlightTone])
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [isRestoring, setIsRestoring] = useState(false)
  const pendingRestoresRef = useRef(0)
  const latestRestoreRequestRef = useRef(0)

  const restoreFromTimeline = async (nextChange: Change) => {
    if (!onRestoreChange) return
    const requestId = ++latestRestoreRequestRef.current
    pendingRestoresRef.current += 1
    setRestoreError(null)
    setIsRestoring(true)
    try {
      await onRestoreChange(nextChange)
    } catch (error) {
      console.warn('Change reconstruction failed', error)
      if (requestId === latestRestoreRequestRef.current) {
        setRestoreError(error instanceof Error ? error.message : t('errors.restoreChange'))
      }
    } finally {
      pendingRestoresRef.current -= 1
      if (pendingRestoresRef.current === 0) setIsRestoring(false)
    }
  }

  // Incrementado sempre que o modal abre OU a mudança selecionada muda,
  // para forçar a re-centralização no ChangeChain mesmo que activeChangeId
  // seja o mesmo valor da abertura anterior.
  const [chainScrollTrigger, setChainScrollTrigger] = useState(0)

  useEffect(() => {
    if (open) {
      // Agenda após um frame para que o modal já esteja montado no DOM
      const id = requestAnimationFrame(() => {
        setChainScrollTrigger((prev) => prev + 1)
      })
      return () => cancelAnimationFrame(id)
    }
  }, [open, change?.id])

  useEffect(() => {
    if (!open) {
      setCommitDetails(null)
      setCommitChanges([])
      setIsCommitLoading(false)
      setRestoreError(null)
      return
    }

    if (!change?.commitId) {
      setCommitDetails(null)
      setCommitChanges(change ? [change] : [])
      setIsCommitLoading(false)
      return
    }

    const normalizedCommitId = normalizeCommitId(change.commitId)

    if (!normalizedCommitId) {
      setCommitDetails(null)
      setCommitChanges(change ? [change] : [])
      setIsCommitLoading(false)
      return
    }

    let cancelled = false
    setIsCommitLoading(true)

    Promise.all([
      loadCommitByIdController({ projectId, commitId: normalizedCommitId }),
      loadChangeHistoryController({
        projectId,
        commitIds: [normalizedCommitId],
        includeUncommittedDetails: false,
        includeUncommittedCount: false,
        limit: 2000,
      }),
    ])
      .then(([commitRecord, snapshot]) => {
        if (cancelled) {
          return
        }

        const changes = resolveCommitChanges(normalizedCommitId, snapshot)
          .map((record) => mapHistoryRecordToChange(record, changeTextLocale))
        setCommitChanges(changes)
        setCommitDetails(commitRecord ? buildCommitFromRecord(commitRecord, changes) : null)
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn(error)
          setCommitDetails(null)
          setCommitChanges(change ? [change] : [])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsCommitLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [change, changeTextLocale, open, projectId])

  const timelineChanges = useMemo(() => {
    const baseChanges = commitDetails?.changes?.length
      ? commitDetails.changes
      : commitChanges.length
        ? commitChanges
        : change
          ? [change]
          : []

    return [...baseChanges].sort(compareHistoryIds)
  }, [change, commitChanges, commitDetails])

  const commitTargetId = useMemo(
    () => normalizeCommitId(change?.commitId ?? null),
    [change?.commitId],
  )

  const {
    branches,
    commits: trackCommits,
    selectedCommit,
    focusedBranch,
    historyTags: graphTags, changeMarkers: graphMarkers,
    isLoading: isGraphLoading,
    handleSelectCommit,
    handleSelectBranch, hasMore, isLoadingMore, handleLoadMore, error: graphError,
  } = useTrackControlInteractions({ isVisible: open, repositoryPath: projectPath, focusCommitId: commitTargetId ?? undefined })

  const normalizedTrackCommits = useMemo(
    () => trackCommits.map((c) => ({ ...c, description: c.description ?? null })),
    [trackCommits],
  )

  const normalizedSelectedCommit = useMemo(
    () =>
      selectedCommit
        ? { ...selectedCommit, description: selectedCommit.description ?? null }
        : null,
    [selectedCommit],
  )

  // Seleciona o commit correto no grafo sempre que o commitTargetId ou a
  // lista de commits mudam (ex.: dados carregados após a abertura do modal).
  useEffect(() => {
    if (!commitTargetId) return
    const match = trackCommits.find((c) => c.id === commitTargetId)
    if (!match) return
    handleSelectBranch(match.branchId)
    handleSelectCommit(match.id)
  }, [commitTargetId, handleSelectBranch, handleSelectCommit, trackCommits])

  // ── Scroll do grafo para centralizar o commit selecionado ───────────────
  //
  // O CommitGraphSVG renderiza cada dot como um <g data-commit-id="..."> —
  // veja a nota no arquivo track-control.tsx. O seletor abaixo busca esse
  // atributo para calcular a posição de scroll.
  const graphScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const targetCommitId = commitTargetId ?? normalizedSelectedCommit?.id

    if (!open || isGraphLoading || !graphScrollRef.current || !targetCommitId) return

    const run = () => {
      const container = graphScrollRef.current
      if (!container) return

      // Busca pelo atributo data-commit-id que o CommitGraphSVG expõe em
      // cada <g> de commit dot (ver track-control.tsx CommitGraphSVG).
      const node = container.querySelector(
        `[data-commit-id="${targetCommitId}"]`,
      ) as SVGGElement | HTMLElement | null

      if (!node) return

      const containerRect = container.getBoundingClientRect()
      const nodeRect      = node.getBoundingClientRect()

      const scrollTop =
        container.scrollTop +
        (nodeRect.top - containerRect.top) -
        containerRect.height / 2 +
        nodeRect.height / 2

      container.scrollTo({ top: scrollTop, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    }

    const id = requestAnimationFrame(() => requestAnimationFrame(run))
    return () => cancelAnimationFrame(id)
  }, [commitTargetId, normalizedSelectedCommit?.id, open, trackCommits.length, isGraphLoading])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="change-details" data-snapshot-id={change?.preview?.snapshotId} className="flex h-[95vh] w-[95vw] max-w-none flex-col overflow-hidden p-0">

        {/* ── Header ── */}
        <div className="shrink-0 border-b border-border/70 px-5 py-3.5">
          <DialogTitle className="text-sm font-semibold text-foreground">
            {t('history.detailsTitle')}
          </DialogTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {change ? change.title : t('history.selectChange')}
          </p>
        </div>

        {/* ── Body ── */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {restoreError && (
            <p role="alert" className="mx-4 mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {restoreError}
            </p>
          )}

          {/* Diff viewer */}
          <div className="min-h-0 flex-[1.1] border-b border-border/60">
            {isRestoring ? (
              <div role="status" className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('common.loading')}
              </div>
            ) : change ? (
              change.stale ? <p data-testid="pending-preview-stale" role="status" className="m-4 rounded-md border diff-block diff-modified p-4 text-sm text-foreground">{t('history.pendingStale')}</p>
              : change.changeType === 'external_bundle' ? (
                <ExternalBundleDiff projectId={projectId} changeId={Number(change.id)} />
              ) : <ChangeDiffPreview
                key={change?.preview?.snapshotId ?? change?.id}
                mode="full"
                projectId={projectId}
                projectTempPath={projectTempPath}
                change={change}
                activeView={activeDiffView}
                onActiveViewChange={setActiveDiffView}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t('history.noSelectedChange')}
              </div>
            )}
          </div>

          {/*
            ── Bottom strip ──
            Layout: [grafo + detalhes commit] | [chain + detalhes mudança] | [explorador]
          */}
          <div className="flex min-h-0 flex-1 overflow-hidden">

            {/* ── Col A: commit graph (top) + commit details (bottom) ── */}
            <div className="flex w-[280px] shrink-0 flex-col divide-y divide-border/60 overflow-hidden">

              {graphError && <p role="alert" className="p-2 text-xs text-destructive">{graphError}</p>}
              {/* Graph */}
              <div className="min-h-0 flex-1 overflow-hidden">
                {isGraphLoading ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : branches.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    {t('history.noLoadedCommit')}
                  </div>
                ) : (
                  <div
                    ref={graphScrollRef}
                    className="h-full overflow-auto"
                    style={{ scrollbarWidth: 'thin', scrollbarColor: 'hsl(var(--border)) transparent' }}
                  >
                    <div className="p-3">
                      {hasMore && <button type="button" data-testid="details-graph-more" disabled={isLoadingMore} onClick={() => void handleLoadMore()} className="mb-2 text-xs underline">{t('history.loadMore')}</button>}
                      <CommitGraphSVG
                        branches={branches}
                        commits={normalizedTrackCommits}
                        selectedCommit={normalizedSelectedCommit}
                        focusedBranchId={focusedBranch?.id ?? null}
                        onSelectCommit={handleSelectCommit}
                        onSelectBranch={handleSelectBranch}
                        tags={graphTags?.tags}
                        changeMarkers={graphMarkers}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Commit details */}
              <div className="shrink-0 overflow-auto px-3 py-3" style={{ scrollbarWidth: 'none' }}>
                {isCommitLoading ? (
                  <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
                    {t('history.loadingCommit')}
                  </div>
                ) : commitDetails ? (
                  <div className="space-y-2.5">
                    <DetailItem icon={AlignLeft} label={t('history.summary')} value={commitDetails.title} />
                    {commitDetails.description && (
                      <DetailItem icon={FileText} label={t('common.description')} value={commitDetails.description} />
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <DetailItem icon={GitBranch} label={t('history.track')} value={commitDetails.trackName} />
                      <DetailItem icon={Clock} label={t('history.time')} value={dateTime(commitDetails.timestamp)} />
                    </div>
                    <div className="flex items-center gap-1.5 rounded-md bg-muted/40 px-2.5 py-1.5">
                      <GitCommit className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {tp('history.changesInCommit', commitDetails.changes.length)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
                    {t('history.noAssociatedCommit')}
                  </div>
                )}
              </div>
            </div>

            <div className="w-px shrink-0 bg-border/60" />

            {/* ── Col B: change chain (top) + change details (bottom) ── */}
            <div className="flex min-h-0 flex-1 flex-col divide-y divide-border/60 overflow-hidden">

              {/* Chain strip — altura fixa para que a scrollbar seja alocada
                  dentro da faixa e não empurre o layout. O overflow-hidden no
                  container garante que a scrollbar interna apareça. */}
              <div className="h-[72px] shrink-0 overflow-hidden px-4">
                <div className="flex h-full items-center">
                  <ChangeChain
                    changes={timelineChanges}
                    activeChangeId={change?.id}
                    scrollTrigger={chainScrollTrigger}
                    onSelect={onChangeSelect}
                    onRestoreChange={restoreFromTimeline}
                  />
                </div>
              </div>

              {/* Change details */}
              <div className="min-h-0 flex-1 overflow-auto px-4 py-3" style={{ scrollbarWidth: 'thin' }}>
                {change ? (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-3">
                    <DetailItem testId="history-change-title" icon={AlignLeft} label={t('common.title')} value={change.title} className="col-span-2 lg:col-span-3" />
                    <DetailItem icon={FileText} label={t('common.file')} value={change.fileName} mono />
                    <DetailItem icon={Tag} label={t('common.type')} value={change.changeType || change.type} />
                    <DetailItem
                      icon={FolderOpen}
                      label={t('history.scope')}
                      value={String(change.scope ?? '').toLowerCase() === 'dir'
                        ? t('history.scope.directory')
                        : String(change.scope ?? '').toLowerCase() === 'project'
                          ? t('history.scope.project')
                          : t('history.scope.file')}
                    />
                    <DetailItem icon={Clock} label={t('history.time')} value={dateTime(change.timestamp)} />
                    <DetailItem
                      icon={Hash}
                      label={t('branches.commit')}
                      value={change.commitId ?? t('history.uncommittedValue')}
                      mono
                    />
                    {change.description && (
                      <DetailItem
                        icon={Layers}
                        label={t('common.description')}
                        value={change.description}
                        testId="history-change-description"
                        className="col-span-2 lg:col-span-3"
                      />
                    )}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    {t('history.noDetails')}
                  </div>
                )}
              </div>
            </div>

            <div className="w-px shrink-0 bg-border/60" />

            {/* ── Col C: file explorer ── */}
            <div className="flex w-[220px] shrink-0 min-h-0 overflow-hidden">
              <div className="flex h-full w-full flex-col overflow-hidden">
                {change?.preview && !change.stale && <div data-testid="history-explorer-side" data-side={explorerSide} className="flex shrink-0 gap-1 border-b p-1">
                  {(['before', 'after'] as const).map(side => <button key={side} type="button" onClick={() => setExplorerSide(side)}
                    aria-pressed={explorerSide === side} className={cn('flex-1 rounded px-2 py-1 text-xs', explorerSide === side ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-muted')}>
                    {t(side === 'before' ? 'diff.before' : 'diff.after')}
                  </button>)}
                </div>}
                <div className="min-h-0 flex-1 overflow-auto" style={{ scrollbarWidth: 'thin' }}>
                  <FileExplorer
                    key={change?.preview ? `${change.preview.snapshotId}:${explorerSide}` : explorerRepositoryPath}
                    projectId={projectId}
                    files={change?.preview && !change.stale ? explorerSide === 'before' ? change.preview.beforeTree : change.preview.afterTree : explorerFiles}
                    repositoryPath={change?.preview && !change.stale ? `${projectTempPath}/comparisons/${change.preview.snapshotId}/${explorerSide === 'before' ? 'working-copy-prev' : 'working-copy'}` : explorerRepositoryPath}
                    highlightedPath={change?.preview && !change.stale
                      ? previewExplorerHighlight(change, explorerSide, projectPath,
                          `${projectTempPath}/comparisons/${change.preview.snapshotId}/${explorerSide === 'before' ? 'working-copy-prev' : 'working-copy'}`)
                      : change?.preview ? null : highlightedPath}
                    highlightTone={highlightTone}
                    readOnly
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
