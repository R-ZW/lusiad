'use client'

import { EmptyState, Feedback } from '@/components/ui/feedback'
import { unwrapBackendAction } from "@/lib/services/backend-action-result"

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpDown, GitCompare, Loader2, Plus, Trash2, Pencil, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { TutorialButton } from '@/components/tutorials/tutorial-provider'
import { cn } from '@/lib/utils'
import { compareReferencesController } from '@/controllers/model-comparison/model-comparison.controller'
import type { ComparisonFile, ComparisonResult } from '@/lib/services/model-comparison/model-comparison.service'
import { useI18n } from '@/lib/i18n/locale-provider'
import { ReferencePicker } from './reference-picker'

interface DiffMenuProps {
  projectId: number
  initialRefs?: { base: string; target: string; signal: number }
  onSelectFile: (file: ComparisonFile) => void
  onCompareStart?: () => void
}

export function DiffMenu({ projectId, initialRefs, onSelectFile, onCompareStart }: DiffMenuProps) {
  const { t, tp } = useI18n()
  const [baseRef, setBaseRef] = useState('')
  const [targetRef, setTargetRef] = useState('')
  const [result, setResult] = useState<ComparisonResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [fileFilter, setFileFilter] = useState('')
  const requestId = useRef(0)
  const historySelection = useRef<string | null>(null)

  const clearResult = useCallback(() => {
    requestId.current++
    setResult(null)
    setSelectedPath(null)
    setFileFilter('')
    setError(null)
    onCompareStart?.()
  }, [onCompareStart])

  const runComparison = useCallback(async (base: string, target: string) => {
    if (!base.trim() || !target.trim()) return
    clearResult()
    const id = requestId.current
    setLoading(true)
    try {
      const result = unwrapBackendAction(await compareReferencesController(projectId, base.trim(), target.trim()))
      if (requestId.current === id) setResult(result)
    } catch (caught) {
      if (requestId.current === id) setError(caught instanceof Error ? caught.message : t('comparison.loadError'))
    } finally {
      if (requestId.current === id) setLoading(false)
    }
  }, [projectId, t, clearResult])

  useEffect(() => {
    if (!initialRefs?.signal) return
    const selection = `${projectId}:${initialRefs.signal}`
    if (historySelection.current === selection) return
    historySelection.current = selection
    setBaseRef(initialRefs.base)
    setTargetRef(initialRefs.target)
    void runComparison(initialRefs.base, initialRefs.target)
  }, [projectId, initialRefs?.signal, initialRefs?.base, initialRefs?.target, runComparison])

  const counts = { addedLines: 0, removedLines: 0 }
  result?.files.forEach((file) => {
    counts.addedLines += file.addedLines
    counts.removedLines += file.removedLines
  })
  const visibleFiles = result?.files.filter((file) => file.path.toLocaleLowerCase().includes(fileFilter.trim().toLocaleLowerCase())) ?? []

  return <div data-testid="comparison-menu" aria-busy={loading} data-state={loading ? 'loading' : error ? 'error' : result ? 'ready' : 'idle'} className="flex h-full min-h-0 flex-col bg-background">
    <header data-testid="comparison-header" className="flex shrink-0 items-center gap-1.5 border-b border-border bg-muted/50 px-3 py-2 dark:bg-black/15">
      <div className="min-w-0 flex-1 space-y-2">
        <ReferencePicker side="base" key={`base-${projectId}`} projectId={projectId} label={t('comparison.base')} value={baseRef} disabled={loading} compact
          onChange={(next) => { if (next !== baseRef) { setBaseRef(next); clearResult() } }} />
        <ReferencePicker side="target" key={`target-${projectId}`} projectId={projectId} label={t('comparison.target')} value={targetRef} disabled={loading} compact
          onChange={(next) => { if (next !== targetRef) { setTargetRef(next); clearResult() } }} />
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1">
        <Button data-testid="comparison-swap" type="button" variant="outline" size="icon" className="size-8" disabled={loading || (!baseRef && !targetRef)} title={t('comparison.swapReferences')} aria-label={t('comparison.swapReferences')}
          onClick={() => { setBaseRef(targetRef); setTargetRef(baseRef); clearResult() }}><ArrowUpDown className="size-3.5" /></Button>
        <TutorialButton tutorial="comparison" />
      </div>
    </header>
    <div data-testid="comparison-list" className="min-h-0 flex-1 space-y-3 overflow-auto p-2">
      {error && <Feedback data-testid="comparison-error" tone="error">{error}</Feedback>}
      {loading && <Feedback tone="loading">{t('comparison.loading')}</Feedback>}
      {!loading && !error && !result && <EmptyState icon={<GitCompare />} className="px-3 py-6 text-xs">{t('diff.selectModels')}</EmptyState>}
      {result && <>
        {(result.referenceNotices ?? []).map((notice) => <Feedback key={notice.side} tone="warning" className="text-xs">
          {t('comparison.externalCommitNotice', { side: t(`comparison.${notice.side}`), changeId: notice.changeId, commitId: notice.commitId })}
        </Feedback>)}
        <div data-testid="comparison-summary" className="flex flex-wrap items-center gap-1.5 px-1 text-[11px]">
          <Badge variant="outline" className="diff-block diff-added diff-text-added px-1.5 py-0 text-[11px] tabular-nums" title={tp('comparison.addedLines', counts.addedLines)} data-testid="comparison-added-lines" data-count={counts.addedLines} aria-label={tp('comparison.addedLines', counts.addedLines)}>+{counts.addedLines}</Badge>
          <Badge variant="outline" className="diff-block diff-removed diff-text-removed px-1.5 py-0 text-[11px] tabular-nums" title={tp('comparison.removedLines', counts.removedLines)} data-testid="comparison-removed-lines" data-count={counts.removedLines} aria-label={tp('comparison.removedLines', counts.removedLines)}>−{counts.removedLines}</Badge>
          <span className="ml-auto text-muted-foreground" title={tp('comparison.changedFiles', result.files.length)}>{tp('comparison.fileCount', result.files.length)}</span>
        </div>
        {result.files.length > 0 && <div data-testid="comparison-file-tools" className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input data-testid="comparison-file-filter" value={fileFilter} onChange={event => setFileFilter(event.target.value)} className="h-8 pl-7 pr-8 text-xs" title={t('comparison.filterFiles')} aria-label={t('comparison.filterFiles')} />
          {fileFilter && <Button data-testid="comparison-search-clear" type="button" variant="ghost" size="icon" className="absolute right-0 top-0 size-8" onClick={() => setFileFilter('')} aria-label={t('history.clearSearch')}><X className="size-3.5" /></Button>}
        </div>}
        {result.files.length === 0 && <EmptyState icon={<GitCompare />} className="text-xs">{t('diff.empty')}</EmptyState>}
        {fileFilter && visibleFiles.length === 0 && <EmptyState icon={<Search />} className="text-xs">{t('comparison.noFiles')}</EmptyState>}
        <div className="space-y-1">{visibleFiles.map(file => {
          const path = file.path.replace(/\\/g, '/')
          const slash = path.lastIndexOf('/')
          const tone = file.status === 'added' ? 'added' : file.status === 'deleted' ? 'removed' : 'modified'
          return <button data-testid="comparison-file" data-file-path={file.path} data-status={file.status} data-selected={selectedPath === file.path} data-added-lines={file.addedLines} data-removed-lines={file.removedLines} key={file.path} type="button" aria-pressed={selectedPath === file.path}
            className={cn('change-file-row flex w-full min-w-0 items-center gap-2 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring', `diff-${tone}`)}
            onClick={() => { setSelectedPath(file.path); onSelectFile(file) }}>
            <span className={`diff-block diff-${tone} diff-text-${tone} flex size-6 shrink-0 items-center justify-center rounded-md border`} title={t(file.status === 'changed' ? 'common.modified' : `common.${file.status}`)}>
              {file.status === 'added' ? <Plus className="size-3" /> : file.status === 'deleted' ? <Trash2 className="size-3" /> : <Pencil className="size-3" />}
            </span>
            <span className="min-w-0 flex-1" title={file.path}><span className="block truncate text-xs font-medium text-foreground">{path.slice(slash + 1)}</span><span className="block truncate text-[10px] text-muted-foreground">{slash < 0 ? './' : path.slice(0, slash + 1)}</span></span>
            <span className="flex shrink-0 gap-1.5 text-[11px] tabular-nums">
              <span className="diff-text-added" title={tp('comparison.addedLines', file.addedLines)} aria-label={tp('comparison.addedLines', file.addedLines)}>+{file.addedLines}</span>
              <span className="diff-text-removed" title={tp('comparison.removedLines', file.removedLines)} aria-label={tp('comparison.removedLines', file.removedLines)}>−{file.removedLines}</span>
            </span>
          </button>
        })}</div>
      </>}
    </div>
    <footer data-testid="comparison-footer" className="shrink-0 border-t border-border bg-muted/50 px-3 py-2 dark:bg-black/15">
      <Button data-testid="comparison-run" size="sm" className="h-8 w-full gap-2 text-xs font-semibold" disabled={!baseRef.trim() || !targetRef.trim() || loading} onClick={() => void runComparison(baseRef, targetRef)}>
        {loading ? <Loader2 className="size-3.5 animate-spin" /> : <GitCompare className="size-3.5" />}{t('common.compare')}
      </Button>
    </footer>
  </div>
}
