'use client'

import { toast } from '@/hooks/use-toast'
import { Feedback } from '@/components/ui/feedback'
import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, Braces, CheckCircle2, ChevronDown, ChevronLeft, Copy, Eye, File, FolderTree, GitBranch, GitCommitHorizontal, GitCompare, GitMerge, History, Funnel, Loader2, Maximize2, MoreHorizontal, Pencil, RefreshCw, RotateCcw, Search, Tag, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TutorialButton } from '@/components/tutorials/tutorial-provider'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { Change, Commit } from '@/lib/types'
import { useI18n } from '@/lib/i18n/locale-provider'
import { tagsForTarget, type HistoryTag } from '@/lib/models/history-tags/history-tags.model'
import { useChangeHistoryInteractions } from './change-history.interactions'
import { HistoryTagChips, TagManager, type TagManagerTarget } from './tag-manager'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { preparePendingRewindController, prepareAllPendingRewindController, applyPendingRewindController, releasePendingRewindController } from '@/controllers/restore/pending-rewind.controller'
import type { PendingRewindPreview } from '@/lib/services/restore/pending-rewind.service'
import { prepareCommitRestoreController, prepareChangeRestoreController, applyCommitRestoreController, releaseChangeRestorePreviewController } from '@/controllers/restore/commit-restoration.controller'
import type { CommitRestorePreview } from '@/lib/services/restore/commit-restoration.service'
import type { MutationGate } from '@/lib/models/model-editor/editor-session'

import { historyLocationQuery, type HistoryNavigation } from '@/lib/models/change-history/history-navigation'

interface ChangeHistoryProps {
  projectId: number
  commits?: Commit[]
  isDrawerOpen?: boolean
  changeSignal?: number
  activeChangeId?: string | null
  navigation?: HistoryNavigation | null
  onNavigationHandled?: (requestId: number) => void
  onExpandDetails?: () => void
  onCompareCommit?: (commitId: string, previousId?: string | null) => void
  onRestoreChange?: (change: Change) => Promise<void> | void
  mutationGate?: MutationGate
  operationsBlocked?: boolean
  onWorkingChange?: (busy: boolean) => void
  onPendingRewindComplete?: () => Promise<void> | void
}

function ChangeItem({ change, mounted, active, focused, tags, onManageTags, onPreview, onRewind, onRestore, onCopy, busy }: {
  change: Change; mounted: boolean; active?: boolean; focused?: boolean; tags: HistoryTag[]; onManageTags: () => void
  onPreview?: () => void; onRewind?: () => void; onRestore?: () => void; onCopy: (value: string) => void; busy?: boolean
}) {
  const { t, dateTime, time } = useI18n()
  const kind = String(change.changeType ?? '')
  const moved = kind.includes('move')
  const renamed = kind.includes('rename')
  const external = kind === 'external_bundle'
  const Icon = external ? RefreshCw : moved ? ArrowRight : renamed || change.type === 'modified' ? Pencil : change.type === 'added' ? ArrowUp : ArrowDown
  const label = external ? t('history.external') : moved ? t('common.move') : renamed ? t('history.renamed') : t(`common.${change.type}`)
  const tone = moved || renamed ? 'moved' : change.type === 'added' ? 'added' : change.type === 'deleted' ? 'removed' : 'modified'
  const color = `diff-block diff-${tone} diff-text-${tone}`
  const ScopeIcon = change.scope === 'dir' ? File : change.scope === 'project' ? FolderTree : Braces
  const summary = <>
    <span data-testid="change-summary" className="block truncate text-xs font-medium leading-4 text-foreground" title={`${change.title}\n#${change.id}`}>{change.title}</span>
    <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[10px] leading-3 text-muted-foreground">
      <span data-testid="change-scope" data-scope={change.scope} className="inline-flex min-w-0 items-center gap-1" title={change.fileName}><ScopeIcon className="h-3 w-3 shrink-0" /><span className="truncate">{change.fileName || t('history.scope.project')}</span></span>
      <span className="shrink-0" title={mounted ? dateTime(change.timestamp) : ''}>{mounted ? time(change.timestamp) : '--:--'}</span>
    </span>
  </>
  const actions = (context = false) => {
    const Item = context ? ContextMenuItem : DropdownMenuItem
    return <>
      {onPreview && <Item data-testid="change-preview-icon" disabled={busy} onSelect={onPreview}><Eye />{t('history.preview')}</Item>}
      {onRewind && <Item data-testid="pending-rewind" disabled={busy} onSelect={onRewind}><RotateCcw />{t('history.rewind')}</Item>}
      {onRestore && <Item data-testid="change-restore" disabled={busy} onSelect={onRestore}><RotateCcw />{t('history.restoreAfterChange')}</Item>}
      <Item data-testid="change-tags" disabled={busy} onSelect={onManageTags}><Tag />{t('tags.manage')}</Item>
      {change.commitId && <Item data-testid="change-copy" disabled={busy} onSelect={() => onCopy(`change:${change.id}`)}><Copy />{t('comparison.copyChangeId')}</Item>}
    </>
  }
  return <ContextMenu>
    <ContextMenuTrigger asChild disabled={busy}>
      <div data-testid="history-change" data-change-id={change.id} data-active={active} data-tone={tone} data-history-focused={Boolean(focused)} title={`#${change.id}`} onContextMenu={event => event.stopPropagation()} className={cn('history-change rounded-lg border border-transparent px-2.5 py-2 transition-colors hover:bg-accent/40', active && `diff-${tone}`, focused && 'ring-2 ring-ring/60 ring-offset-1')}>
        <div className="flex items-center gap-2">
          <span data-testid="change-kind" className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md border', color)} title={label} aria-label={label}><Icon className="h-3 w-3" /></span>
          <div className="min-w-0 flex-1">
            {onPreview ? <button type="button" data-testid="change-preview" disabled={busy} onClick={onPreview} className="block w-full min-w-0 text-left outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60" aria-label={t('history.previewNamed', { title: change.title })}>{summary}</button>
              : <div className="min-w-0 flex-1">{summary}</div>}
            {tags.length > 0 && <div className="mt-1"><HistoryTagChips tags={tags} onManage={onManageTags} /></div>}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" data-testid="change-actions" disabled={busy} aria-label={t('history.actionsNamed', { title: change.title })}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-(--ui-menu)">{actions()}</DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </ContextMenuTrigger>
    <ContextMenuContent data-testid="change-context-menu" aria-label={t('history.actionsNamed', { title: change.title })}>{actions(true)}</ContextMenuContent>
  </ContextMenu>
}

function CommitBlock({ commit, tags, mounted, activeChangeId, navigation, onCompare, onRestore, onRestoreChange, onManageTags, onPreview, onCopy, loading, previewing }: {
  commit: Commit; tags: HistoryTag[]; mounted: boolean; activeChangeId?: string | null; navigation?: HistoryNavigation | null
  onCompare?: () => void; onRestore?: () => void; onRestoreChange?: (change: Change) => void; onManageTags: (target: TagManagerTarget) => void
  onPreview: (change: Change) => void; onCopy: (value: string) => void; loading: boolean; previewing: boolean
}) {
  const { t, tp, dateTime } = useI18n()
  const [open, setOpen] = useState(false)
  const [visibleChanges, setVisibleChanges] = useState(50)
  const cardRef = useRef<HTMLElement>(null)
  const id = Number(commit.id.replace(/^commit-/, ''))
  const active = commit.changes.some((change) => change.id === activeChangeId)
  useEffect(() => {
    if (!active) return
    setOpen(true)
    setVisibleChanges(previous => Math.max(previous, commit.changes.findIndex(change => change.id === activeChangeId) + 1))
  }, [active, activeChangeId, commit.changes])
  useEffect(() => {
    if (!navigation || loading) return
    setOpen(true)
    if (navigation.changeId) setVisibleChanges(previous => Math.max(previous, commit.changes.findIndex(change => change.id === String(navigation.changeId)) + 1))
  }, [navigation, loading, commit.changes])
  useEffect(() => {
    if (!navigation || loading || !open) return
    const frame = window.requestAnimationFrame(() => {
      const target = navigation.changeId
        ? cardRef.current?.querySelector<HTMLElement>(`[data-change-id="${navigation.changeId}"] [data-testid="change-preview"]`)
        : cardRef.current?.querySelector<HTMLElement>('[data-slot="collapsible-trigger"]')
      target?.scrollIntoView({ block: 'center', inline: 'nearest' })
      target?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [navigation, loading, open, visibleChanges])
  const target: TagManagerTarget = { kind: 'commit', id, title: commit.title, committed: true }
  const ownTags = tagsForTarget(tags, target)
  const CommitIcon = commit.isMergeCommit ? GitMerge : commit.isNewBranchCommit ? GitBranch : GitCommitHorizontal
  const commitKind = commit.isMergeCommit ? 'merge' : commit.isNewBranchCommit ? 'branch' : 'commit'
  const actions = (context = false) => {
    const Item = context ? ContextMenuItem : DropdownMenuItem
    return <>
      <Item data-testid="commit-compare" disabled={loading || previewing || !onCompare} onSelect={onCompare}><GitCompare />{t('history.compareCommit')}</Item>
      <Item data-testid="commit-restore" disabled={loading || previewing || !onRestore} onSelect={onRestore}><RotateCcw />{t('history.restoreCommit')}</Item>
      <Item data-testid="commit-tags" disabled={loading || previewing} onSelect={() => onManageTags(target)}><Tag />{t('tags.manage')}</Item>
      <Item data-testid="commit-copy" disabled={loading || previewing} onSelect={() => onCopy(`commit:${id}`)}><Copy />{t('comparison.copyCommitId')}</Item>
      {commit.gitId && <Item data-testid="commit-copy-sha" disabled={loading || previewing} onSelect={() => onCopy(`sha:${commit.gitId}`)}><Copy />{t('comparison.copySha')}</Item>}
    </>
  }
  return <Collapsible data-testid="history-commit" data-commit-id={id} open={open} onOpenChange={setOpen}>
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={loading || previewing}>
        <article ref={cardRef} data-history-focused={Boolean(navigation && !navigation.changeId)} data-testid="commit-card" data-commit-id={id} data-kind={commitKind} title={`#${id}`} className={cn('overflow-hidden rounded-lg border bg-muted/15', active && 'border-primary/30', navigation && !navigation.changeId && 'ring-2 ring-ring/60 ring-offset-1')}>
          <div className="flex items-center gap-1 px-2 py-1.5">
            <CollapsibleTrigger asChild>
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring">
                <span data-testid="commit-kind" data-kind={commitKind} role="img" aria-label={t(commit.isMergeCommit ? 'history.merge' : commit.isNewBranchCommit ? 'history.newBranch' : 'comparison.refKind.commit')} title={t(commit.isMergeCommit ? 'history.merge' : commit.isNewBranchCommit ? 'history.newBranch' : 'comparison.refKind.commit')} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-muted/50 text-muted-foreground"><CommitIcon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold leading-snug" data-testid="commit-title" title={`${commit.title}\n#${id}`}>{commit.title}</span>
                  <span className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span className="inline-flex min-w-0 items-center gap-1 text-foreground/75" title={commit.trackName}><GitBranch className="h-3 w-3 shrink-0" /><span className="truncate">{commit.trackName}</span></span>
                    <span>{mounted ? dateTime(commit.timestamp) : '--/--/--, --:--'}</span>
                  </span>
                </span>
                <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')} />
              </button>
            </CollapsibleTrigger>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button data-testid="commit-actions" disabled={loading || previewing} type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={t('history.actionsNamed', { title: commit.title })}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-(--ui-menu)">
                {actions()}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
            <Badge variant="secondary" className="text-xs font-normal">{loading ? t('common.loading') : tp('history.changes', commit.changes.length)}</Badge>
            <span className="font-mono text-[11px] text-muted-foreground" title={`#${id}${commit.gitId ? ` · ${commit.gitId}` : ''}`}>{commit.gitId?.slice(0, 7)}</span>
            {commit.restoredFromCommitId && <Badge data-testid="restore-source" variant="outline" title={commit.restoredFromChangeId
              ? t('history.restoredFromChange', { change: commit.restoredFromChangeId, commit: commit.restoredFromCommitId })
              : t('history.restoredFrom', { id: commit.restoredFromCommitId })} className="gap-1 text-xs font-normal"><RotateCcw className="h-3 w-3" />{t('history.restoredVersion')}</Badge>}
            <HistoryTagChips tags={ownTags} onManage={() => onManageTags(target)} />
          </div>
          <CollapsibleContent className="border-t bg-muted/10">
            {commit.description && <p className="px-4 pt-3 text-xs text-muted-foreground whitespace-pre-wrap">{commit.description}</p>}
            <div className="space-y-0.5 p-2">
              {loading ? <p role="status" className="px-3 py-3 text-xs text-muted-foreground">{t('history.loadingDetails')}</p> : commit.changes.length ? commit.changes.slice(0, visibleChanges).map((change) => <ChangeItem key={change.id} change={change} mounted={mounted} active={activeChangeId === change.id} focused={navigation?.changeId === Number(change.id)} busy={previewing}
                tags={tagsForTarget(tags, { kind: 'change', id: Number(change.id) })}
                onPreview={() => onPreview(change)} onRestore={onRestoreChange ? () => onRestoreChange(change) : undefined} onCopy={onCopy}
                onManageTags={() => onManageTags({ kind: 'change', id: Number(change.id), title: change.title, committed: true, external: change.changeType === 'external_bundle' })} />)
                : <p className="px-3 py-3 text-xs text-muted-foreground">{t('history.noChangeDetails')}</p>}
            </div>
            {visibleChanges < commit.changes.length && <Button data-testid="commit-changes-more" variant="ghost" size="sm" onClick={() => setVisibleChanges(value => value + 50)}>{t('history.loadMore')}</Button>}
          </CollapsibleContent>
        </article>
      </ContextMenuTrigger>
      <ContextMenuContent data-testid="commit-context-menu" aria-label={t('history.actionsNamed', { title: commit.title })}>{actions(true)}</ContextMenuContent>
    </ContextMenu>
  </Collapsible>
}

function HistoryPageInput({ page, total, disabled, onPageChange }: { page: number; total: number; disabled: boolean; onPageChange: (index: number) => void }) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<string | null>(null)
  const confirm = () => {
    if (draft === null) return
    const value = /^\d+$/.test(draft.trim()) ? Number(draft.trim()) : NaN
    if (Number.isSafeInteger(value) && total > 0) onPageChange(Math.min(total, Math.max(1, value)) - 1)
    setDraft(null)
  }
  return <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums text-muted-foreground" title={t('history.page', { page, total })}>
    <Input data-testid="history-current-page" type="text" inputMode="numeric" autoComplete="off" aria-label={t('history.currentPage')} title={t('history.pageEntryHelp')} disabled={disabled} value={draft ?? String(page)} onChange={event => setDraft(event.target.value)} onBlur={confirm} onKeyDown={event => {
      if (event.key === 'Enter') { event.preventDefault(); confirm() }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setDraft(null) }
    }} className="h-7 min-w-9 px-1 text-center text-[11px] tabular-nums" style={{ width: `${Math.max(2, String(total).length) + 2}ch` }} />
    <span>/{total}</span>
  </span>
}

export function ChangeHistory({ projectId, commits: baseCommits, isDrawerOpen = true, changeSignal, activeChangeId, navigation, onNavigationHandled, onExpandDetails, onCompareCommit, onRestoreChange, mutationGate, operationsBlocked, onWorkingChange, onPendingRewindComplete }: ChangeHistoryProps) {
  const { t } = useI18n()
  const [uncommittedOpen, setUncommittedOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [pageSize, setPageSize] = useState(10)
  const [pageIndex, setPageIndex] = useState(0)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [historyTarget, setHistoryTarget] = useState<HistoryNavigation | null>(null)
  const lastNavigation = useRef<HistoryNavigation | null>(null)
  const [showMerges, setShowMerges] = useState(true)
  const [showBranches, setShowBranches] = useState(true)
  const [taggedOnly, setTaggedOnly] = useState(false)
  const [tagTarget, setTagTarget] = useState<TagManagerTarget | null>(null)
  const [notice, setNotice] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [rewindPreview, setRewindPreview] = useState<PendingRewindPreview | null>(null)
  const [rewindRequestId, setRewindRequestId] = useState<string | null>(null)
  const [rewindBusy, setRewindBusy] = useState(false)
  const [rewindError, setRewindError] = useState('')
  const [restorePreview, setRestorePreview] = useState<CommitRestorePreview | null>(null)
  const [restoreRequestId, setRestoreRequestId] = useState<string | null>(null)
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [restoreError, setRestoreError] = useState('')
  const { commits, totalCommitCount, uncommittedChanges, uncommittedCount, hasUncommittedCount,
    isCountLoading, isCommittedLoading, isCurrentPage, isDetailsLoading, error, historyTags, handleReload, handleRestoreChange, hasMorePending, handleMorePending } = useChangeHistoryInteractions({
    projectId, pageSize, pageIndex, baseCommits, isVisible: isDrawerOpen, isUncommittedOpen: uncommittedOpen,
    changeSignal, onRestoreChange, filter: { query: search, showMerges, showBranches, taggedOnly },
  })
  const tags = historyTags?.tags ?? []
  const filtersActive = !showMerges || !showBranches || taggedOnly

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    if (!navigation || !isDrawerOpen || navigation.projectId !== projectId
      || (lastNavigation.current?.requestId === navigation.requestId && lastNavigation.current.projectId === projectId)) return
    lastNavigation.current = navigation
    const query = historyLocationQuery(navigation)
    setHistoryTarget(navigation)
    setQuery(query); setSearch(query); setPageIndex(0)
    setShowMerges(true); setShowBranches(true); setTaggedOnly(false)
    onNavigationHandled?.(navigation.requestId)
  }, [navigation, isDrawerOpen, projectId, onNavigationHandled])
  const navigationReady = historyTarget?.projectId === projectId && isDrawerOpen && !isCommittedLoading && !error && isCurrentPage
    && !filtersActive && query === historyLocationQuery(historyTarget) && search === query
  const focusedTarget = navigationReady ? historyTarget : null
  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(query); setPageIndex(0) }, 250)
    return () => window.clearTimeout(timer)
  }, [query])
  useEffect(() => {
    if (isCommittedLoading) return
    setPageIndex((previous) => Math.min(previous, Math.max(0, Math.ceil(totalCommitCount / pageSize) - 1)))
  }, [totalCommitCount, pageSize, isCommittedLoading])
  useEffect(() => { if (!isDrawerOpen) { setTagTarget(null); setUncommittedOpen(false) } }, [isDrawerOpen])

  const preview = async (change: Change) => {
    setPreviewing(true)
    try { await handleRestoreChange(change) } finally { setPreviewing(false) }
  }
  const prepareRewind = async (change: Change) => {
    if (operationsBlocked || rewindBusy) return
    setRewindBusy(true); setRewindError('')
    try {
      const response = await preparePendingRewindController(projectId, Number(change.id))
      if (response.status === 'error') throw new Error(response.message)
      setRewindPreview(response.value)
      setRewindRequestId(crypto.randomUUID())
    }
    catch (error) { setRewindError(error instanceof Error ? error.message : t('history.rewindFailed')) }
    finally { setRewindBusy(false) }
  }
  const prepareDiscardAll = async () => {
    if (operationsBlocked || rewindBusy) return
    setRewindBusy(true); setRewindError('')
    try {
      const response = await prepareAllPendingRewindController(projectId)
      if (response.status === 'error') throw new Error(response.message)
      setRewindPreview(response.value); setRewindRequestId(crypto.randomUUID())
    } catch (error) { setRewindError(error instanceof Error ? error.message : t('history.rewindFailed')) }
    finally { setRewindBusy(false) }
  }
  const prepareRestore = async (commit: Commit) => {
    if (operationsBlocked || restoreBusy) return
    setRestoreBusy(true); setRestoreError(''); setNotice('')
    try {
      const response = await prepareCommitRestoreController(projectId, Number(commit.id.replace(/^commit-/, '')))
      if (response.status === 'error') throw new Error(response.message)
      setRestorePreview(response.value); setRestoreRequestId(crypto.randomUUID())
    } catch (error) { setRestoreError(error instanceof Error ? error.message : t('history.restoreFailed')) }
    finally { setRestoreBusy(false) }
  }
  const prepareRestoreChange = async (change: Change) => {
    if (operationsBlocked || restoreBusy) return
    setRestoreBusy(true); setRestoreError(''); setNotice('')
    try {
      const response = await prepareChangeRestoreController(projectId, Number(change.id))
      if (response.status === 'error') throw new Error(response.message)
      setRestorePreview(response.value); setRestoreRequestId(crypto.randomUUID())
    } catch (error) { setRestoreError(error instanceof Error ? error.message : t('history.restoreFailed')) }
    finally { setRestoreBusy(false) }
  }
  const confirmRestore = async () => {
    const selection = restorePreview
    if (!selection || !restoreRequestId || restoreBusy || operationsBlocked) return
    const token = mutationGate?.acquire()
    if (mutationGate && !token) { setRestoreError(t('history.rewindBusy')); return }
    setRestoreBusy(true); setRestoreError(''); onWorkingChange?.(true)
    try {
      const response = await applyCommitRestoreController(projectId, selection, restoreRequestId)
      if (response.status === 'error') throw new Error(response.message)
      setRestorePreview(null); setRestoreRequestId(null)
      if (selection.snapshotId) void releaseChangeRestorePreviewController(projectId, selection.snapshotId).catch(() => {})
      setNotice(t('history.restoreDone', { id: response.value.commitId }))
      try { await onPendingRewindComplete?.() } catch { setRestoreError(t('history.rewindRefreshFailed')) }
    } catch (error) { setRestoreError(error instanceof Error ? error.message : t('history.restoreFailed')) }
    finally { setRestoreBusy(false); onWorkingChange?.(false); if (token) mutationGate?.release(token) }
  }
  const cancelRestore = () => {
    if (restoreBusy) return
    const snapshotId = restorePreview?.snapshotId
    setRestorePreview(null); setRestoreRequestId(null)
    if (snapshotId) void releaseChangeRestorePreviewController(projectId, snapshotId).catch(() => {})
  }
  const cancelRewind = () => {
    if (rewindBusy) return
    const snapshot = rewindPreview?.snapshotId
    setRewindPreview(null); setRewindRequestId(null)
    if (snapshot) void releasePendingRewindController(projectId, snapshot).catch(() => {})
  }
  const confirmRewind = async () => {
    const selection = rewindPreview
    if (!selection || !rewindRequestId || rewindBusy || operationsBlocked) return
    const token = mutationGate?.acquire()
    if (mutationGate && !token) { setRewindError(t('history.rewindBusy')); return }
    setRewindBusy(true); setRewindError(''); onWorkingChange?.(true)
    try {
      const response = await applyPendingRewindController(projectId, selection, rewindRequestId)
      if (response.status === 'error') throw new Error(response.message)
      setRewindPreview(null); setRewindRequestId(null)
      setNotice(t('history.rewindDone'))
      void releasePendingRewindController(projectId, selection.snapshotId).catch(() => {})
      try { await onPendingRewindComplete?.() }
      catch { setRewindError(t('history.rewindRefreshFailed')) }
    } catch (error) { setRewindError(error instanceof Error ? error.message : t('history.rewindFailed')) }
    finally { setRewindBusy(false); onWorkingChange?.(false); if (token) mutationGate?.release(token) }
  }
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); toast({ description: t('history.copied') }) }
    catch { setNotice(t('history.copyError')) }
  }
  const resetFilters = () => { setHistoryTarget(null); setQuery(''); setShowMerges(true); setShowBranches(true); setTaggedOnly(false); setPageIndex(0) }
  const totalPages = Math.max(1, Math.ceil(totalCommitCount / pageSize))
  const start = totalCommitCount ? pageIndex * pageSize + 1 : 0
  const end = Math.min(totalCommitCount, (pageIndex + 1) * pageSize)

  return <div data-testid="change-history" aria-busy={isDetailsLoading || previewing} className="flex h-full min-h-0 flex-col bg-background">

    <div data-testid="history-header" className="flex shrink-0 items-center gap-1.5 border-b border-border bg-muted/50 px-2 py-1.5 dark:bg-black/15">
      <div className="grid min-w-0 flex-1 grid-cols-2 items-center gap-1.5">
      <Button type="button" size="sm" className="h-8 w-full min-w-0 gap-2 px-3 text-xs font-semibold" data-testid="history-reload" onClick={handleReload} disabled={isDetailsLoading || previewing} title={t('history.reload')} aria-label={t('history.reload')}><RefreshCw className={cn('h-3.5 w-3.5', isDetailsLoading && 'animate-spin')} /><span className="truncate">{t('history.reload')}</span></Button>


        <div data-testid="history-pagination" className="flex min-w-0 items-center justify-center gap-0.5 overflow-x-auto">
          <Button type="button" variant="ghost" size="icon" className="h-7 w-6" disabled={!pageIndex || isCommittedLoading} onClick={() => setPageIndex((previous) => previous - 1)} data-testid="history-previous" aria-label={t('history.previousPage')}><ChevronLeft className="h-3.5 w-3.5" /></Button>
          <HistoryPageInput key={`${projectId}:${pageIndex}:${pageSize}:${search}:${showMerges}:${showBranches}:${taggedOnly}:${totalPages}`} page={totalCommitCount ? pageIndex + 1 : 0} total={totalCommitCount ? totalPages : 0} disabled={!totalCommitCount || isCommittedLoading} onPageChange={setPageIndex} />
          <Button type="button" variant="ghost" size="icon" className="h-7 w-6" disabled={pageIndex >= totalPages - 1 || !totalCommitCount || isCommittedLoading} onClick={() => setPageIndex((previous) => previous + 1)} data-testid="history-next" aria-label={t('history.nextPage')}><ChevronDown className="h-3.5 w-3.5 -rotate-90" /></Button>
        </div>
      </div>
      <TutorialButton tutorial="history" />
    </div>
    {(error || rewindError) && <Feedback tone="error" data-testid="pending-rewind-error" className="m-3">{rewindError || error}</Feedback>}
    {restoreError && !restorePreview && <Feedback tone="error" data-testid="commit-restore-error" className="m-3">{restoreError}</Feedback>}
    {notice && <p role="status" className="flex items-center gap-2 border-b bg-background px-4 py-2 text-xs"><span className="flex-1">{notice}</span><button type="button" onClick={() => setNotice('')} aria-label={t('common.close')}><X className="h-3 w-3" /></button></p>}
    {historyTags?.available === false && <p role="status" className="border-b bg-amber-500/5 px-4 py-2 text-xs diff-text-modified">{t('tags.errors.migrationRequired')}</p>}
    <div data-testid="history-list" className="min-h-0 flex-1 space-y-3 overflow-auto p-2">
        <div data-testid="history-search-area" className="flex w-full items-center gap-1.5"><div className="relative min-w-0 flex-1"><Search className="absolute left-2 top-2.5 h-3 w-3 text-muted-foreground" />
          <Input data-testid="history-search" value={query} onChange={(event) => { setHistoryTarget(null); setQuery(event.target.value) }} maxLength={200} className="h-8 pl-7 pr-6 text-xs" placeholder={t('history.searchPlaceholder')} title={t('history.searchPlaceholder')} aria-label={t('history.search')} />
          {query && <Button type="button" variant="ghost" size="icon" className="absolute right-0.5 top-0.5 h-7 w-6" onClick={() => { setHistoryTarget(null); setQuery('') }} aria-label={t('history.clearSearch')}><X className="h-3 w-3" /></Button>}
          </div>
        <label className="shrink-0 text-xs text-muted-foreground"><span className="sr-only">{t('history.perPage')}</span><select data-testid="history-page-size" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPageIndex(0) }} className="h-8 w-24 min-w-24 rounded-md border bg-background pl-3 pr-8 text-xs text-foreground">
          {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
        <Popover><PopoverTrigger asChild><Button type="button" variant={filtersActive ? 'secondary' : 'outline'} size="icon" className="relative h-8 w-8 shrink-0" data-testid="history-filters" title={t('history.filters')} aria-label={t('history.filters')} aria-pressed={filtersActive}><Funnel className="h-3.5 w-3.5" />{filtersActive && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />}</Button></PopoverTrigger>
          <PopoverContent align="end" className="z-(--ui-menu) w-64 space-y-3">
            <p className="text-xs font-semibold">{t('history.filters')}</p>
            {([
              { label: t('history.showMerge'), checked: showMerges, set: setShowMerges },
              { label: t('history.showBranches'), checked: showBranches, set: setShowBranches },
              { label: t('history.taggedOnly'), checked: taggedOnly, set: setTaggedOnly },
            ]).map((filter) => <label key={filter.label} className="flex cursor-pointer items-center gap-2 text-xs"><Checkbox checked={filter.checked} disabled={filter.set === setTaggedOnly && historyTags?.available !== true} onCheckedChange={(value) => { filter.set(value === true); setPageIndex(0) }} />{filter.label}</label>)}
            <Button type="button" size="sm" variant="ghost" className="h-7 w-full text-xs" data-testid="history-reset-filters" onClick={resetFilters}>{t('history.resetFilters')}</Button>
          </PopoverContent>
        </Popover>
        </div>
      <Collapsible data-testid="history-pending" aria-busy={isDetailsLoading} data-count={uncommittedCount} open={uncommittedOpen} onOpenChange={setUncommittedOpen}>
        <section className="overflow-hidden rounded-lg border bg-muted/15">
          <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/30">
            <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', uncommittedCount ? 'bg-amber-500/10 diff-text-modified' : 'bg-emerald-500/10 diff-text-added')}>{uncommittedCount ? <Pencil className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</span>
            <span className="min-w-0 flex-1"><span className="block text-xs font-semibold">{t('history.uncommitted')}</span></span>
            <Badge variant="secondary" className="text-xs">{isCountLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : hasUncommittedCount ? uncommittedCount : '—'}</Badge>
            <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground', !uncommittedOpen && '-rotate-90')} />
          </CollapsibleTrigger>
          <CollapsibleContent className="border-t">

            <div className="space-y-0.5 p-2">
              {uncommittedChanges.map((change, index) => <ChangeItem key={change.id} change={change} mounted={mounted} active={change.id === activeChangeId} busy={previewing || rewindBusy || operationsBlocked || isDetailsLoading} onPreview={() => void preview(change)} onRewind={index > 0 ? () => void prepareRewind(change) : undefined} tags={tagsForTarget(tags, { kind: 'change', id: Number(change.id) })} onCopy={(value) => void copy(value)}
                onManageTags={() => setTagTarget({ kind: 'change', id: Number(change.id), title: change.title, committed: false, external: change.changeType === 'external_bundle' })} />)}
              {!uncommittedChanges.length && !isCountLoading && !error && <p className="px-3 py-3 text-xs text-muted-foreground">{t('history.clean')}</p>}
              {hasMorePending && <Button data-testid="history-pending-more" type="button" variant="ghost" size="sm" disabled={isDetailsLoading} onClick={() => void handleMorePending()}>{t('history.loadMore')}</Button>}
              {uncommittedChanges.length < uncommittedCount && <p className="px-3 py-2 text-xs text-muted-foreground">{t('history.pendingLimit', { shown: uncommittedChanges.length, total: uncommittedCount })}</p>}
            </div>
            {uncommittedCount > 0 && <div className="flex justify-center border-t px-3 py-2"><Button data-testid="pending-discard-all" type="button" variant="destructive" size="sm" disabled={rewindBusy || operationsBlocked} onClick={() => void prepareDiscardAll()} className="history-discard-button h-7 text-xs"><Trash2 className="h-3.5 w-3.5" />{t('history.discardAll')}</Button></div>}
          </CollapsibleContent>
        </section>
      </Collapsible>
      <hr data-testid="history-section-divider" className="border-t-2 border-border" />
      <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground"><History className="h-3 w-3" />{t('history.committed')}<span className="ml-auto normal-case tracking-normal">{t('history.range', { start, end, total: totalCommitCount })}</span></div>
      <div data-testid="history-committed" aria-busy={isCommittedLoading} className="space-y-2">
        {isCommittedLoading && <p role="status" className="flex items-center gap-2 px-1 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('history.loading')}</p>}
        {commits.map((commit) => <CommitBlock key={commit.id} commit={commit} tags={tags} mounted={mounted} activeChangeId={activeChangeId} loading={isCommittedLoading} previewing={previewing || isCommittedLoading}
          navigation={focusedTarget?.commitId === Number(commit.id.replace(/^commit-/, '')) ? focusedTarget : null}
          onCompare={onCompareCommit ? () => onCompareCommit(commit.id, commit.previousId) : undefined}
          onRestore={() => void prepareRestore(commit)}
          onRestoreChange={(change) => void prepareRestoreChange(change)}
          onPreview={(change) => void preview(change)} onManageTags={setTagTarget} onCopy={(value) => void copy(value)} />)}
        {!commits.length && !isCommittedLoading && <div className="rounded-xl border border-dashed px-6 py-8 text-center"><History className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" /><p className="text-xs font-medium">{t(focusedTarget ? 'history.navigationMissing' : search || filtersActive ? 'history.noResults' : 'history.empty')}</p>
          {(search || filtersActive) && <Button type="button" variant="ghost" size="sm" className="mt-2 h-7 text-xs" data-testid="history-reset-filters" onClick={resetFilters}>{t('history.resetFilters')}</Button>}</div>}
      </div>
    </div>
    <footer data-testid="history-footer" className="shrink-0 border-t border-border bg-muted/50 px-3 py-2 dark:bg-black/15">
      <Button type="button" size="sm" className="h-8 w-full gap-2 px-4 text-xs font-semibold" data-testid="history-expand" onClick={onExpandDetails} disabled={!activeChangeId || previewing} title={t('history.expandDetails')}><Maximize2 className="h-4 w-4" />{t('history.expand')}</Button>
    </footer>
    <AlertDialog open={Boolean(rewindPreview)} onOpenChange={(open) => { if (!open) cancelRewind() }}>
      <AlertDialogContent data-testid="pending-rewind-confirmation" className="max-h-[85vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{t(rewindPreview?.changeId === 0 ? 'history.discardAllTitle' : 'history.rewindTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{rewindPreview?.changeId === 0 ? t('history.discardAllDescription') : t('history.rewindDescription', { id: rewindPreview?.changeId ?? '' })}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3 text-xs">
          <section><p className="font-semibold">{t('history.rewindEvents')}</p>
            <ul className="mt-1 max-h-28 overflow-auto rounded-md border p-2" data-testid="pending-rewind-events">
              {rewindPreview?.discarded.map(item => <li key={item.id} data-change-id={item.id}>#{item.id} · {item.title}</li>)}
            </ul>
          </section>
          <section><p className="font-semibold">{t('history.rewindPaths')}</p>
            <ul className="mt-1 max-h-28 overflow-auto rounded-md border p-2 font-mono" data-testid="pending-rewind-paths">
              {rewindPreview?.paths.map(path => <li key={path}>{path}</li>)}
            </ul>
          </section>
          {Boolean(rewindPreview?.tags.length) && <p data-testid="pending-rewind-tags">{t('history.rewindTags')}: {rewindPreview?.tags.map(tag => `${tag.name} (#${tag.changeId})`).join(', ')}</p>}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="pending-rewind-cancel" disabled={rewindBusy}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction data-testid="pending-rewind-apply" disabled={rewindBusy || operationsBlocked} onClick={(event) => { event.preventDefault(); void confirmRewind() }}>{rewindBusy ? t('common.loading') : t('history.rewindConfirm')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={Boolean(restorePreview)} onOpenChange={(open) => { if (!open) cancelRestore() }}>
      <AlertDialogContent data-testid="commit-restore-confirmation" className="max-h-[85vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('history.restoreTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{restorePreview?.sourceChangeId
            ? t('history.restoreChangeDescription', { change: restorePreview.sourceChangeId, commit: restorePreview.sourceCommitId })
            : t('history.restoreDescription', { id: restorePreview?.sourceCommitId ?? '' })}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 text-xs">
          <p>{t('history.restoreBranch', { branch: restorePreview?.branchName ?? '' })}</p>
          <ul data-testid="commit-restore-files" className="max-h-64 overflow-auto rounded-md border p-2 font-mono">
            {restorePreview?.files.map((file, index) => <li key={index}>{t(`history.restoreFile.${file.kind}`)} · {file.beforePath && file.afterPath && file.beforePath !== file.afterPath ? `${file.beforePath} → ${file.afterPath}` : file.afterPath ?? file.beforePath}</li>)}
          </ul>
          {restoreError && <p role="alert" data-testid="commit-restore-error" className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-destructive">{restoreError}</p>}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="commit-restore-cancel" disabled={restoreBusy}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction data-testid="commit-restore-apply" disabled={restoreBusy || operationsBlocked} onClick={event => { event.preventDefault(); void confirmRestore() }}>{restoreBusy ? t('common.loading') : t('history.restoreConfirm')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {tagTarget && <TagManager key={`${tagTarget.kind}-${tagTarget.id}`} projectId={projectId} target={tagTarget} snapshot={historyTags} onClose={() => setTagTarget(null)} onChanged={handleReload} />}
  </div>
}
