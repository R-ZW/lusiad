'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, ChevronDown, ChevronUp, Loader2, RefreshCw, Settings2, Square } from 'lucide-react'
import { FloatingTool } from '@/components/ui/floating-tools'
import { useI18n } from '@/lib/i18n/locale-provider'
import { analyzeJavaProjectController, cancelJavaAnalysisController, checkJavaContextController } from '@/lib/services/java-diagnostics/java-client'
import { unwrapBackendAction } from '@/lib/services/backend-action-result'
import type { JavaResult } from '@/lib/services/java-diagnostics/java-contract'
import type { ProblemLocation } from '@/lib/models/model-editor/problems.model'
import type { JavaModel } from '@/lib/types'
import { JavaConfiguration } from './java-configuration'
import { cn } from '@/lib/utils'
import { BackendApiError } from '@/lib/services/backend-response'

export interface CompilerControls {
  checkProposals: boolean; onCheckProposalsChange: (value: boolean) => void; onContextChange: () => void
}
export interface ProblemsPanelProps extends CompilerControls {
  projectId: number; model: JavaModel | null; activePath: string; signal: string; loading: boolean
  onNavigate: (location: ProblemLocation) => void
}

export function JavaProblemsPanel({ projectId, model, signal, onNavigate, onSyntax, checkProposals, onCheckProposalsChange, onContextChange }: ProblemsPanelProps & { onSyntax: () => void }) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(true)
  const [scope, setScope] = useState('project')
  const [state, setState] = useState<'checking' | 'complete' | 'stale' | 'unavailable'>('checking')
  const [result, setResult] = useState<JavaResult | null>(null)
  const [error, setError] = useState('')
  const [configure, setConfigure] = useState(false)
  const generation = useRef(0), navigation = useRef(0)
  const requestId = useRef('')
  const run = useCallback(async () => {
    const ticket = ++generation.current
    setState('checking'); setResult(null); setError('')
    try {
      requestId.current = crypto.randomUUID()
      const value = unwrapBackendAction(await analyzeJavaProjectController(projectId, requestId.current))
      if (generation.current === ticket) { setResult(value); setState('complete') }
    } catch (failure) {
      if (generation.current === ticket) { setState('unavailable'); setError(failure instanceof Error ? failure.message : String(failure)) }
    }
  }, [projectId])
  useEffect(() => {
    void run() // Mount is caused only by the explicit “Verificar Java” action.
    return () => { if (requestId.current) void cancelJavaAnalysisController(projectId, 'saved', requestId.current).catch(() => {}) }
  }, [projectId, run])
  const initialSignal = useRef(signal)
  useEffect(() => {
    if (signal === initialSignal.current) return
    initialSignal.current = signal; generation.current++; setResult(null); setState('stale')
    if (requestId.current) void cancelJavaAnalysisController(projectId, 'saved', requestId.current).catch(() => {})
  }, [signal, projectId])
  useEffect(() => {
    if (!result || state !== 'complete') return
    let active = true
    const ticket = generation.current
    const check = () => { void checkJavaContextController(projectId, result.contextRevision).catch(failure => {
      if (active && generation.current === ticket) {
        generation.current++; setResult(null); setState(failure instanceof BackendApiError && failure.code === 'java_context_stale' ? 'stale' : 'unavailable'); setError(failure instanceof Error ? failure.message : String(failure))
      }
    }) }
    const timer = setInterval(check, 10000)
    window.addEventListener('focus', check)
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', check) }
  }, [projectId, result, state])
  const revisionMismatch = !!result && !!model && result.files.some(file => file.file === model.file && file.revision !== model.revision)
  const outsideContext = state === 'complete' && scope === 'file' && (!model || !result?.files.some(file => file.file === model.file))
  const status = revisionMismatch ? 'stale' : outsideContext ? 'partial' : state
  const problems = status === 'complete' ? result?.diagnostics ?? [] : []
  const selected = problems.filter(problem => scope === 'project' || problem.file === model?.file || problem.file === null)
  const clean = status === 'complete' && selected.length === 0 && (scope === 'project' || !!model && !!result?.files.some(file => file.file === model.file))
  const groups = [...new Set(selected.map(problem => problem.file))]
  return <FloatingTool><section data-testid="problems" data-engine="javac" data-scope={scope} data-state={status} data-count={selected.length}
    data-failures={status === 'unavailable' ? 1 : 0} className={cn("flex min-h-0 max-h-full max-w-full flex-col text-xs", expanded ? "w-[28rem]" : "w-auto")}>
    {expanded && <div id="problems-content" data-testid="problems-panel" className="mb-2 flex min-h-0 max-h-[min(30rem,55vh)] w-full max-w-full flex-col overflow-hidden ui-tool-surface">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <b>{t('java.title')}</b><button data-testid="java-syntax" className="ml-auto rounded border p-1.5" onClick={onSyntax}>{t('java.syntax')}</button>
        <button data-testid="java-configure" title={t('java.configure')} aria-label={t('java.configure')} className="rounded p-1.5 hover:bg-muted" onClick={() => setConfigure(true)}><Settings2 className="h-4 w-4" /></button>
        <select aria-label={t('problems.scope')} data-testid="problems-scope" className="rounded border bg-background p-1.5" value={scope} onChange={event => setScope(event.target.value)}>
          <option value="file">{t('problems.file')}</option><option value="project">{t('problems.project')}</option>
        </select>
        <button data-testid="problems-refresh" className="rounded p-1.5 hover:bg-muted" aria-label={t('problems.refresh')} onClick={() => void run()}><RefreshCw className={cn('h-4 w-4', status === 'checking' && 'animate-spin')} /></button>
        {status === 'checking' && <button data-testid="java-cancel" aria-label={t('common.cancel')} onClick={() => {
          generation.current++; setState('stale'); setResult(null); void cancelJavaAnalysisController(projectId, 'saved', requestId.current).catch(failure => setError(String(failure)))
        }}><Square className="h-4 w-4" /></button>}
      </div>
      <label className="flex gap-2 border-b px-3 py-2"><input data-testid="java-check-proposals" type="checkbox" checked={checkProposals} onChange={event => onCheckProposalsChange(event.target.checked)} />{t('java.checkProposals')}</label>
      <p data-testid="problems-status" role="status" className={cn('px-3 py-2', clean ? 'diff-text-added' : 'text-muted-foreground')}>
        {clean ? t('java.clean') : t(`java.${status}`)}{result && status === 'complete' && <span className="block">javac · Java {result.release} · {t('problems.progress', { done: result.files.length, total: result.files.length })}</span>}
      </p>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-3 pb-3">
        {error && <p data-testid="java-tool-error" role="alert" className="mb-2 break-words rounded bg-muted p-2 diff-text-modified">{error}</p>}
        {status === 'complete' && <p className="mb-2 text-muted-foreground">{t('java.contextOnly')}{scope === 'file' && <span className="block">{t('java.projectCount', { count: problems.length })}</span>}</p>}
        {groups.map(file => <div data-testid="problems-group" data-file={file ?? ''} key={file ?? 'global'} className="mb-3">
          <p className="mb-1 break-words font-semibold">{file ?? t('problems.project')} <span data-testid="problems-group-count">({selected.filter(p => p.file === file).length})</span></p>
          {selected.filter(problem => problem.file === file).map((problem, index) => <button key={index} data-testid="problem-item" data-file={file ?? ''} disabled={!file}
            className="mb-1 block w-full rounded border border-transparent p-2 text-left hover:border-border hover:bg-muted" onClick={() => {
              if (file && problem.revision) onNavigate({ file, revision: problem.revision, message: problem.message, line: problem.range?.startLine, column: problem.range?.startColumn, id: ++navigation.current })
            }}><span className="block break-words">{problem.message}</span><span className="text-muted-foreground">{problem.range ? t('syntax.location', { line: problem.range.startLine, column: problem.range.startColumn }) : t('syntax.noLocation')}</span></button>)}
        </div>)}
      </div>
    </div>}
    <div className="flex shrink-0 justify-end"><button data-testid="problems-toggle" aria-expanded={expanded} aria-controls="problems-content" onClick={() => setExpanded(value => !value)}
      className={cn('inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-2 shadow-md hover:bg-muted', clean && 'border-emerald-300 diff-text-added')}>
      {status === 'checking' ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertCircle className="h-4 w-4" />}{t('problems.title')} · Java <span data-testid="problems-count">{selected.length}</span>
      {status !== 'complete' && <span>{t(`problems.short.${status}`)}</span>}{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
    </button></div>
    {configure && <JavaConfiguration projectId={projectId} onClose={() => setConfigure(false)} onSaved={() => {
      generation.current++; setResult(null); setState('stale'); setError(''); onContextChange()
    }} />}
  </section></FloatingTool>
}
