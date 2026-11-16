'use client'

import { useState } from 'react'
import { AlignLeft, Check, GitCommitHorizontal, Plus, Pencil, Trash2, X, RotateCcw, Loader2, RefreshCw, Search } from 'lucide-react'
import { Feedback, EmptyState } from "@/components/ui/feedback"
import { Button } from '@/components/ui/button'
import { TutorialButton } from '@/components/tutorials/tutorial-provider'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { SettingsHelp } from '@/components/ui/settings-help'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import type { StagedFile, LoadingState } from '@/lib/types'
import { useCommitMenuInteractions } from './commit-menu.interactions'
import { useI18n } from '@/lib/i18n/locale-provider'
import type { MutationGate } from '@/lib/models/model-editor/editor-session'

interface CommitMenuProps {
  isDrawerOpen?: boolean
  projectPath?: string
  changeSignal?: number
  operationsBlocked?: boolean
  mutationGate?: MutationGate
  onWorkingChange?: (busy: boolean) => void
  onRepositoryChanged?: () => Promise<void> | void
  syncPendingReview?: boolean
  syncCommitRequired?: boolean
  onCommit?: (title: string, description: string) => Promise<void> | void
  onDiscardAll?: () => void
  onRemoveCreated?: (fileId: string) => void
  onRestoreDeleted?: (fileId: string) => void
  onUndoModified?: (fileId: string) => void
}

export function CommitMenu({
  isDrawerOpen = false,
  projectPath,
  changeSignal,
  operationsBlocked = false, mutationGate, onWorkingChange, onRepositoryChanged,
  syncPendingReview = false,
  syncCommitRequired = false,
  onCommit,
  onDiscardAll,
  onRemoveCreated,
  onRestoreDeleted,
  onUndoModified,
}: CommitMenuProps) {
  const { t, tp } = useI18n()
  const {
    stagedFiles,
    isRepo,
    needsInitialSnapshot,
    isLoading: isGitLoading,
    isCommitting,
    error: gitError,
    repositoryPath,
    handleInitRepository,
    handleCommitChanges,
    handleRefresh,
  } = useCommitMenuInteractions({
    isVisible: isDrawerOpen,
    repositoryPath: projectPath,
    changeSignal,
  })
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [query, setQuery] = useState('')
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
  const [loadingState, setLoadingState] = useState<LoadingState>('idle')

  const visibleFiles = stagedFiles.filter(file => `${file.path}${file.fileName}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const createdFiles = visibleFiles.filter(file => file.status === 'created')
  const modifiedFiles = visibleFiles.filter(file => file.status === 'modified')
  const deletedFiles = visibleFiles.filter(file => file.status === 'deleted')

  const hasChanges = stagedFiles.length > 0
  const canCommit = isRepo === true && !needsInitialSnapshot && (hasChanges || syncCommitRequired) && title.trim().length > 0 && !syncPendingReview && !operationsBlocked && !isGitLoading

  const handleCommit = async () => {
    if (!canCommit || isCommitting) return
    const token = mutationGate?.acquire()
    if (mutationGate && !token) return
    onWorkingChange?.(true)
    setLoadingState('loading')
    try {
      await handleCommitChanges(title.trim(), description.trim())
      await onCommit?.(title.trim(), description.trim())
      setTitle('')
      setDescription('')
      setQuery('')
      setLoadingState('success')
      setTimeout(() => setLoadingState('idle'), 2000)
    } catch {
      setLoadingState('idle')
    } finally { if (token) mutationGate?.release(token); onWorkingChange?.(false) }
  }

  const handleInit = async () => {
    if (operationsBlocked || isGitLoading) return
    const token = mutationGate?.acquire()
    if (mutationGate && !token) return
    onWorkingChange?.(true)
    try { await handleInitRepository(); await onRepositoryChanged?.() }
    catch { /* the hook or workspace owns the diagnostic */ }
    finally { if (token) mutationGate?.release(token); onWorkingChange?.(false) }
  }

  const handleDiscardAll = () => {
    onDiscardAll?.()
    setShowDiscardDialog(false)
  }

  const getStatusIcon = (status: StagedFile['status']) => {
    switch (status) {
      case 'created':
        return <Plus className="h-3 w-3" />
      case 'modified':
        return <Pencil className="h-3 w-3" />
      case 'deleted':
        return <Trash2 className="h-3 w-3" />
    }
  }

  const getTone = (status: StagedFile['status']) => status === 'created' ? 'added' : status === 'deleted' ? 'removed' : 'modified'
  const hasFileAction = (status: StagedFile['status']) => Boolean(status === 'created' ? onRemoveCreated : status === 'deleted' ? onRestoreDeleted : onUndoModified)

  const getStatusLabel = (status: StagedFile['status']) => {
    switch (status) {
      case 'created':
        return t('common.created')
      case 'modified':
        return t('common.modifiedPlural')
      case 'deleted':
        return t('common.deletedPlural')
    }
  }

  const handleFileAction = (file: StagedFile) => {
    switch (file.status) {
      case 'created':
        onRemoveCreated?.(file.id)
        break
      case 'modified':
        onUndoModified?.(file.id)
        break
      case 'deleted':
        onRestoreDeleted?.(file.id)
        break
    }
  }

  const getActionLabel = (status: StagedFile['status']) => {
    switch (status) {
      case 'created':
        return t('common.remove')
      case 'modified':
        return t('common.undo')
      case 'deleted':
        return t('common.restore')
    }
  }

  const renderFileGroup = (files: StagedFile[], status: StagedFile['status']) => {
    if (!files.length) return null
    const tone = getTone(status)
    return <section data-testid="commit-file-group" data-status={status} className="space-y-1">
      <div className="flex items-center gap-2 px-1 text-[11px] font-medium text-muted-foreground">
        <span>{getStatusLabel(status)}</span><Badge variant="outline" className={`diff-block diff-${tone} diff-text-${tone} px-1.5 py-0 text-[10px] tabular-nums`}>{files.length}</Badge>
      </div>
      {files.map(file => {
        const path = file.path === './' ? file.fileName : `${file.path}${file.fileName}`
        return <div data-testid="commit-file" data-file-path={file.path} data-relative-path={path} data-status={file.status} key={file.id}
          className="flex min-w-0 items-center gap-2 rounded-lg border border-transparent px-2.5 py-2">
          <span title={getStatusLabel(file.status)} className={`diff-block diff-${tone} diff-text-${tone} flex size-6 shrink-0 items-center justify-center rounded-md border`}>{getStatusIcon(file.status)}</span>
          <div className="min-w-0 flex-1" title={path}>
            <p className="truncate text-xs font-medium text-foreground">{file.fileName}</p>
            <p className="truncate text-[10px] text-muted-foreground">{file.path}</p>
          </div>
          {hasFileAction(file.status) && <Button variant="ghost" size="icon" className="size-7 shrink-0" data-testid="commit-file-action"
            disabled={operationsBlocked || isGitLoading || isCommitting || syncPendingReview || syncCommitRequired}
            title={getActionLabel(file.status)} aria-label={`${getActionLabel(file.status)}: ${path}`} onClick={() => handleFileAction(file)}><RotateCcw className="size-3.5" /></Button>}
        </div>
      })}
    </section>
  }

  return <div data-testid="commit-menu" aria-busy={isGitLoading || isCommitting}
    data-repository-state={isGitLoading ? 'loading' : gitError ? 'error' : needsInitialSnapshot ? 'initializing' : isRepo === true ? 'ready' : isRepo === false ? 'missing' : 'unknown'}
    className="flex h-full min-h-0 w-full min-w-0 flex-col bg-background">
    <header data-testid="commit-header" className="flex min-w-0 shrink-0 items-center gap-1 border-b border-border bg-muted/50 px-3 py-2 dark:bg-black/15">
      <Button type="button" data-testid="commit-refresh" className="h-8 min-w-0 flex-1 gap-2 text-xs font-semibold" onClick={() => void handleRefresh()} disabled={isGitLoading || isCommitting || operationsBlocked}>
        <RefreshCw className={cn('size-3.5', isGitLoading && 'animate-spin')} /><span className="truncate">{t('common.refresh')}</span>
      </Button>
      <TutorialButton tutorial="commit" />
    </header>
    <div data-testid="commit-list" className="min-h-0 min-w-0 flex-1 space-y-3 overflow-auto p-2">
      {gitError && <Feedback data-testid="git-error" tone="error">{gitError}</Feedback>}
      {syncPendingReview && <Feedback tone="warning">{t('sync.reviewBeforeCommit')}</Feedback>}
      {syncCommitRequired && !syncPendingReview && <Feedback tone="warning">{t('sync.commitRequired')}</Feedback>}
      {!gitError && (isRepo === false || needsInitialSnapshot) && !isGitLoading ? <EmptyState icon={<GitCommitHorizontal />} className="space-y-3 px-3 py-6 text-xs">
        <p className="break-words">{needsInitialSnapshot ? t('commit.needsInitialSnapshot') : t('commit.noRepository', { path: repositoryPath })}</p>
        <Button variant="outline" size="sm" onClick={() => void handleInit()} data-testid="git-init" disabled={operationsBlocked}>
          <Plus className="size-3.5" />{t(needsInitialSnapshot ? 'commit.finishInit' : 'commit.init')}
        </Button>
      </EmptyState> : hasChanges ? <>
        <div className="flex min-w-0 items-center gap-2">
          <div className="relative min-w-0 flex-1"><Search aria-hidden="true" className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input data-testid="commit-file-search" value={query} onChange={event => setQuery(event.target.value)} aria-label={t('comparison.filterFiles')} title={t('comparison.filterFiles')} className="h-8 pl-7 pr-8 text-xs" />
            {query && <Button type="button" data-testid="commit-search-clear" variant="ghost" size="icon" className="absolute right-0 top-0 size-8" onClick={() => setQuery('')} aria-label={t('history.clearSearch')}><X className="size-3.5" /></Button>}
          </div>
          <span data-testid="commit-file-count" data-count={stagedFiles.length} data-visible-count={visibleFiles.length} title={t('commit.filteredFiles', { shown: visibleFiles.length, total: stagedFiles.length })} className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{query.trim() ? `${visibleFiles.length}/${stagedFiles.length}` : tp('comparison.fileCount', stagedFiles.length)}</span>
        </div>
        {renderFileGroup(createdFiles, 'created')}{renderFileGroup(modifiedFiles, 'modified')}{renderFileGroup(deletedFiles, 'deleted')}
        {!visibleFiles.length && <EmptyState icon={<Search />} className="text-xs">{t('comparison.noFiles')}</EmptyState>}
      </> : isGitLoading ? <Feedback tone="loading">{t('common.loading')}</Feedback>
        : !gitError && isRepo === true && (syncCommitRequired ? <Feedback tone="info">{t('sync.emptyGitCommit')}</Feedback>
          : <EmptyState icon={<Check className="text-status-added" />} className="text-xs">{t('commit.noChanges')}</EmptyState>)}
    </div>
    <footer data-testid="commit-footer" className="max-h-[65%] min-w-0 shrink-0 space-y-2 overflow-y-auto border-t border-border bg-muted/50 p-3 dark:bg-black/15">
      <div className="relative"><GitCommitHorizontal aria-hidden="true" className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
        <Input placeholder={t('commit.titlePlaceholder')} data-testid="commit-title" disabled={isCommitting || loadingState === 'loading'} aria-label={t('commit.titlePlaceholder')} value={title} onChange={event => setTitle(event.target.value)} className="h-8 pl-8 text-xs" />
      </div>
      <div className="relative"><AlignLeft aria-hidden="true" className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
        <Textarea placeholder={t('commit.descriptionPlaceholder')} data-testid="commit-description" disabled={isCommitting || loadingState === 'loading'} aria-label={t('commit.descriptionPlaceholder')} value={description} onChange={event => setDescription(event.target.value)} className="min-h-16 resize-none pl-8 text-xs" />
      </div>
      <div className="flex items-center gap-1.5">
        <Button className="h-8 min-w-0 flex-1 gap-2 text-xs font-semibold" disabled={!canCommit || loadingState === 'loading' || isCommitting} onClick={handleCommit} data-testid="commit-submit">
          {loadingState === 'loading' || isCommitting ? <Loader2 className="size-3.5 animate-spin" /> : <GitCommitHorizontal className="size-3.5" />}{t('commit.action')}{hasChanges && <span data-testid="commit-submit-count" className="rounded bg-primary-foreground/15 px-1.5 py-0.5 text-[10px] tabular-nums" aria-label={tp('comparison.fileCount', stagedFiles.length)}>{stagedFiles.length}</span>}
        </Button>
        <SettingsHelp testId="commit-help" label={t('commit.action')}>{t('commit.formHelp')}</SettingsHelp>
        {onDiscardAll && hasChanges && isRepo === true && <Button type="button" variant="destructive" size="icon" className="history-discard-button size-8 shrink-0" disabled={operationsBlocked || isCommitting || isGitLoading || syncPendingReview || syncCommitRequired} onClick={() => setShowDiscardDialog(true)} data-testid="commit-discard" title={t('commit.discardAll')} aria-label={t('commit.discardAll')}><Trash2 className="size-3.5" /></Button>}
      </div>
    </footer>
    <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle className="flex items-center gap-2 text-destructive"><Trash2 className="size-4" />{t('commit.discardAll')}</AlertDialogTitle><AlertDialogDescription>{tp('commit.discardConfirm', stagedFiles.length)}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel data-testid="commit-discard-cancel">{t('common.cancel')}</AlertDialogCancel><AlertDialogAction data-testid="commit-discard-confirm" onClick={handleDiscardAll} className="history-discard-button">{t('commit.discard')}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
}
