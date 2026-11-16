'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { FloatingTool } from '@/components/ui/floating-tools'
import { useI18n } from '@/lib/i18n/locale-provider'
import { inspectProblemFileController, listProblemSourcesController } from '@/controllers/model-editor/problems.controller'
import { unwrapBackendAction } from '@/lib/services/backend-action-result'
import { finishedStatus, ProblemsSequence, reusableAnalysis, sameCatalog, type FileAnalysis, type ProblemLocation, type ProblemsSnapshot } from '@/lib/models/model-editor/problems.model'
import type { JavaModel } from '@/lib/types'
import { cn } from '@/lib/utils'
import { JavaProblemsPanel, type ProblemsPanelProps } from './java-problems-panel'

export function ProblemsPanel(props: ProblemsPanelProps) {
  const [java, setJava] = useState(false)
  return java ? <JavaProblemsPanel {...props} onSyntax={() => setJava(false)} />
    : <SyntaxProblemsPanel {...props} onJava={() => setJava(true)} />
}

function SyntaxProblemsPanel({ projectId, model, activePath, signal, loading, onNavigate, onJava }: {
  projectId: number; model: JavaModel | null; activePath: string; signal: string; loading: boolean
  onNavigate: (location: ProblemLocation) => void
  onJava: () => void
}) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const [scope, setScope] = useState('file')
  const [refresh, setRefresh] = useState(0)
  const [sequence] = useState(() => new ProblemsSequence())
  const cache = useRef(new Map<string, FileAnalysis>())
  const navigation = useRef(0)
  const sourcePath = scope === 'file' ? activePath : ''
  const sourceRevision = scope === 'file' ? model?.revision : undefined
  const waiting = scope === 'file' && loading
  const key = JSON.stringify([projectId, scope, sourcePath, sourceRevision, signal, refresh, waiting])
  const [snapshot, setSnapshot] = useState<ProblemsSnapshot>({ key: '', status: 'checking', entries: [], failures: [], total: 0 })

  useEffect(() => {
    const ticket = sequence.next()
    const current = () => sequence.current(ticket)
    const publish = (value: Omit<ProblemsSnapshot, 'key'>) => { if (current()) setSnapshot({ ...value, key }) }
    publish({ status: 'checking', entries: [], failures: [], total: 0 })
    void (async () => {
      if (scope === 'file') {
        if (waiting) return
        if (!sourcePath) { publish({ status: 'partial', entries: [], failures: [], total: 0 }); return }
        const result = unwrapBackendAction(await inspectProblemFileController(projectId, sourcePath))
        if (!current()) return
        cache.current.set(result.file, { file: result.file, revision: result.revision, result })
        publish({ status: sourceRevision === result.revision ? 'complete' : 'stale',
          entries: [{ file: result.file, revision: result.revision, result }], failures: [], total: 1 })
        return
      }
      const catalog = unwrapBackendAction(await listProblemSourcesController(projectId))
      if (!current()) return
      const entries: FileAnalysis[] = []
      const failures = catalog.failures.map(value => ({ file: value.file, error: value.code }))
      // Serial bounded requests keep PSI work short and make superseded scans stop between files.
      for (const file of catalog.files) {
        if (!current()) return
        const reused = reusableAnalysis(cache.current, file)
        let value = reused
        if (!value) {
          try {
            const result = unwrapBackendAction(await inspectProblemFileController(projectId, file.file, file.revision))
            value = { ...file, result }
          } catch (error) { value = { ...file, error: error instanceof Error ? error.message : String(error) } }
        }
        if (!current()) return
        cache.current.set(file.file, value)
        entries.push(value)
        publish({ status: 'checking', entries: [...entries], failures, total: catalog.files.length })
      }
      let after
      try { after = unwrapBackendAction(await listProblemSourcesController(projectId)) }
      catch { publish({ status: 'partial', entries, failures: [...failures, { file: '.', error: 'read' }], total: catalog.files.length }); return }
      if (!current()) return
      for (const file of cache.current.keys()) if (!after.files.some(item => item.file === file)) cache.current.delete(file)
      publish({ status: finishedStatus(entries, failures, !sameCatalog(catalog, after)), entries, failures, total: catalog.files.length })
    })().catch(error => {
      publish({ status: 'unavailable', entries: [], failures: [{ file: sourcePath || '.', error: error instanceof Error ? error.message : String(error) }], total: 0 })
    })
    return () => sequence.invalidate()
  }, [key, projectId, scope, sequence, sourcePath, sourceRevision, waiting])

  const view = snapshot.key === key ? snapshot : { ...snapshot, status: 'checking' as const, entries: [], failures: [] }
  const count = view.entries.reduce((sum, entry) => sum + (entry.result?.diagnostics.length ?? 0), 0)
  const clean = view.status === 'complete' && count === 0
  const failureCount = view.failures.length + view.entries.filter(entry => entry.error).length
  const status = !activePath && scope === 'file' ? t('problems.noFile') : t(`problems.${view.status}`)
  return <FloatingTool><section data-testid="problems" data-scope={scope} data-state={view.status} data-count={count}
    data-failures={failureCount} className={cn("flex min-h-0 max-h-full max-w-full flex-col text-xs", expanded ? "w-[28rem]" : "w-auto")}>
    {expanded && <div id="problems-content" data-testid="problems-panel" className="mb-2 flex min-h-0 max-h-[min(26rem,55vh)] w-full max-w-full flex-col overflow-hidden rounded-lg border bg-background shadow-md">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b p-3">
        <label className="flex items-center gap-2">{t('problems.scope')}
          <select data-testid="problems-scope" value={scope} onChange={event => setScope(event.target.value)} className="rounded border bg-background p-1.5">
            <option value="file">{t('problems.file')}</option><option value="project">{t('problems.project')}</option>
          </select>
        </label>
        <button data-testid="problems-refresh" type="button" onClick={() => { cache.current.clear(); setRefresh(value => value + 1) }}
          title={t('problems.refresh')} aria-label={t('problems.refresh')} className="rounded p-2 hover:bg-muted"><RefreshCw className={cn('h-4 w-4', view.status === 'checking' && 'animate-spin')} /></button>
      </div>
      <button data-testid="java-analyze" className="border-b px-3 py-2 text-left hover:bg-muted" onClick={onJava}>{t('java.analyze')}</button>
      <p data-testid="problems-status" role="status" className={cn('px-3 py-2', clean ? 'diff-text-added' : 'text-muted-foreground')}>
        {clean ? t('problems.clean') : status}
        {scope === 'project' && <span className="ml-1">{t('problems.progress', { done: view.entries.filter(entry => entry.result).length, total: view.total })}</span>}
      </p>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-3 pb-3">
        {failureCount > 0 && <p data-testid="problems-tool-failures" className="mb-2 diff-text-modified">{t('problems.toolFailures', { count: failureCount })}</p>}
        {view.failures.map((failure, index) => <p key={`${failure.file}:${index}`} className="mb-2 break-words rounded bg-muted p-2"><b>{failure.file}</b> · {t(failure.error === 'read' ? 'problems.readFailed' : failure.error === 'path' ? 'problems.pathFailed' : 'problems.unavailable')}</p>)}
        {view.entries.filter(entry => entry.error || entry.result?.diagnostics.length).map(entry => <div data-testid="problems-group" data-file={entry.file} key={entry.file} className="mb-3">
          <p className="mb-1 break-words font-semibold">{entry.file} <span data-testid="problems-group-count" className="font-normal text-muted-foreground">({entry.result?.diagnostics.length ?? 0})</span></p>
          {entry.error && <p className="rounded bg-muted p-2 diff-text-modified">{t('problems.unavailable')} · {entry.error}</p>}
          {entry.result?.diagnostics.map((problem, index) => <button key={index} type="button" data-testid="problem-item" data-file={entry.file}
            className="mb-1 block w-full rounded border border-transparent p-2 text-left hover:border-border hover:bg-muted"
            onClick={() => onNavigate({ file: entry.file, revision: entry.revision, message: problem.message,
              line: problem.range?.startLine, column: problem.range?.startColumn, id: ++navigation.current })}>
            <span className="block break-words">{problem.message}</span>
            <span className="text-muted-foreground">{problem.range ? t('syntax.location', { line: problem.range.startLine, column: problem.range.startColumn }) : t('syntax.noLocation')}</span>
          </button>)}
        </div>)}
      </div>
    </div>}
    <div className="flex shrink-0 justify-end"><button type="button" data-testid="problems-toggle" aria-expanded={expanded} aria-controls="problems-content"
      onClick={() => setExpanded(value => !value)} className={cn('inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-2 shadow-md hover:bg-muted', clean && 'border-emerald-300 diff-text-added')}>
      {view.status === 'checking' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <AlertCircle className={cn('h-4 w-4', view.status !== 'complete' && 'diff-text-modified')} />}
      {t('problems.title')} <span data-testid="problems-count">{count}</span>
      {view.status !== 'complete' && <span className="text-muted-foreground">· {t(`problems.short.${view.status}`)}</span>}
      <span className="sr-only">{status}</span>{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
    </button></div>
  </section></FloatingTool>
}
