'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Play, Settings2, Square, X } from 'lucide-react'
import { FloatingTool } from '@/components/ui/floating-tools'
import { Feedback, EmptyState } from '@/components/ui/feedback'
import { Button } from '@/components/ui/button'
import { javaRunClient } from '@/lib/services/java-run/java-run-client'
import type { JavaMain, JavaRunList, JavaRunStatus } from '@/lib/services/java-run/java-run-contract'
import { useI18n } from '@/lib/i18n/locale-provider'
import { BackendApiError } from '@/lib/services/backend-response'
import { JavaConfiguration } from './java-configuration'

const active = (state?: string) => state === 'preparing' || state === 'compiling' || state === 'running'
const knownMessage = {
  'Compilation failed': 'run.compileFailed',
  'Program exited with an error': 'run.programFailed',
  'Execution interrupted': 'run.interrupted',
  'Compilation exceeded the time limit': 'run.compileTimeout',
  'Program exceeded the time limit': 'run.programTimeout',
  'Java output exceeded 256 KiB': 'run.outputLimit',
} as const

export function JavaRunControls({ projectId, contextRevision, onContextChange }: { projectId: number; contextRevision: number; onContextChange: () => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [list, setList] = useState<JavaRunList | null>(null)
  const [selected, setSelected] = useState('')
  const [run, setRun] = useState<JavaRunStatus | null>(null)
  const [error, setError] = useState('')
  const [configurationError, setConfigurationError] = useState(false)
  const [contextChanged, setContextChanged] = useState(false)
  const [configure, setConfigure] = useState(false)
  const generation = useRef(0)
  const begin = useCallback(async (choice: JavaMain, available: JavaRunList) => {
    const ticket = generation.current
    setLoading(true); setError('')
    try {
      const started = await javaRunClient(projectId, 'start', { main: choice.className, contextRevision: available.contextRevision })
      if (ticket === generation.current) { setRun(started); setContextChanged(false) }
    } catch (failure) { if (ticket === generation.current) setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { if (ticket === generation.current) setLoading(false) }
  }, [projectId])
  const refresh = useCallback(async (autoStart: boolean) => {
    const ticket = ++generation.current
    setLoading(true); setError(''); setConfigurationError(false)
    try {
      const current = await javaRunClient(projectId, 'status')
      if (ticket !== generation.current) return
      setRun(current)
      if (active(current.state)) return
      setList(null); setSelected('')
      const available = await javaRunClient(projectId, 'list')
      if (ticket !== generation.current) return
      setList(available)
      setContextChanged(current.state !== 'idle' && current.contextRevision !== available.contextRevision)
      setSelected(available.mains[0]?.className ?? '')
      if (autoStart && available.mains.length === 1) await begin(available.mains[0], available)
    } catch (failure) {
      if (ticket === generation.current) {
        setError(failure instanceof Error ? failure.message : String(failure))
        setConfigurationError(failure instanceof BackendApiError &&
          ['java_context_incomplete', 'java_context_unavailable', 'java_context_stale', 'java_compiler_unavailable'].includes(failure.code))
      }
    }
    finally { if (ticket === generation.current) setLoading(false) }
  }, [begin, projectId])
  const previousContext = useRef(contextRevision)
  useEffect(() => {
    if (previousContext.current === contextRevision) return
    previousContext.current = contextRevision
    setList(null); setSelected(''); setContextChanged(true)
    if (open && !active(run?.state)) void refresh(false)
  }, [contextRevision, open, refresh, run?.state])
  useEffect(() => {
    if (!open || !active(run?.state)) return
    const ticket = generation.current
    const timer = window.setInterval(() => {
      void javaRunClient(projectId, 'status').then(current => {
        if (ticket !== generation.current) return
        if (current.state === 'idle') { setRun(current); setError(t('run.lost')); return }
        if (current.id === run?.id) setRun(current)
      }).catch(failure => { if (ticket === generation.current) setError(failure instanceof Error ? failure.message : String(failure)) })
    }, 700)
    return () => window.clearInterval(timer)
  }, [open, projectId, run?.id, run?.state, t])
  useEffect(() => () => { generation.current++ }, [])
  const toggle = () => {
    if (open) { setOpen(false); return }
    setOpen(true)
    void refresh(true)
  }
  const stop = async () => {
    if (!run?.id) return
    const ticket = generation.current
    setLoading(true); setError('')
    try {
      const stopped = await javaRunClient(projectId, 'stop', { runId: run.id })
      if (ticket === generation.current) setRun(stopped)
    } catch (failure) { if (ticket === generation.current) setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { if (ticket === generation.current) setLoading(false) }
  }
  const again = () => { setRun(null); void refresh(true) }
  const previousResult = run && run.state !== 'idle' && !active(run.state) &&
    (contextChanged || Boolean(error) || Boolean(list && list.contextRevision !== run.contextRevision))
  return <>
    <Button data-testid="java-run-toggle" type="button" variant="outline" size="icon" className="shrink-0"
      aria-label={t('run.execute')} title={t('run.execute')} aria-expanded={open} onClick={toggle}>
      {active(run?.state) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
    </Button>
    {open && <FloatingTool><section data-testid="java-run-panel" aria-label={t('run.title')}
      className="ui-tool-surface flex max-h-[min(55vh,500px)] w-[44rem] max-w-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b p-3">
        <strong className="min-w-0 flex-1 truncate text-sm">{t('run.title')}</strong>
        <Button data-testid="java-run-configure" type="button" size="icon" variant="ghost" className="h-8 w-8"
          disabled={loading || active(run?.state)} aria-label={t('java.configure')} title={t('java.configure')}
          onClick={() => setConfigure(true)}><Settings2 className="h-4 w-4" /></Button>
        {active(run?.state) && <Button data-testid="java-run-stop" type="button" size="sm" variant="outline" disabled={loading} onClick={() => void stop()}>
          <Square className="mr-1 h-3 w-3" />{t('run.stop')}</Button>}
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={t('common.close')} onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
      </div>
      <div className="overflow-y-auto p-3 text-sm">
        {loading && <Feedback tone="loading">{t('run.preparing')}</Feedback>}
        {error && <Feedback data-testid="java-run-error" tone="error" className="mb-3">{error}</Feedback>}
        {configurationError && <p data-testid="java-run-context-help" className="mb-3 text-muted-foreground">{t('run.contextHelp')}</p>}
        {previousResult && <p data-testid="java-run-previous-result" className="mb-2 font-medium">{t('run.previousResult')}</p>}
        {run && run.state !== 'idle' && <p data-testid="java-run-state" data-state={run.state} data-run-id={run.id} role="status" className="mb-2">
          {t(`run.state.${run.state}`)} · {run.main}{run.exitCode !== undefined ? ` · ${t('run.exitCode', { code: run.exitCode })}` : ''}
        </p>}
        {run?.message && <p className="mb-2 text-muted-foreground">
          {run.message in knownMessage ? t(knownMessage[run.message as keyof typeof knownMessage]) : run.message}
        </p>}
        {run?.output && <div className="mb-3"><h3 className="mb-1 font-medium">{t('run.output')}</h3><pre data-testid="java-run-output" className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 font-mono text-xs">{run.output}</pre></div>}
        {run?.errors && <div className="mb-3"><h3 className="mb-1 font-medium">{t('run.errors')}</h3><pre data-testid="java-run-errors" className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 font-mono text-xs">{run.errors}</pre></div>}
        {list && !active(run?.state) && !loading && <div className="mt-2 flex flex-wrap items-end gap-2">
          {list.mains.length === 0 ? <EmptyState data-testid="java-run-no-main" className="w-full py-4">{t('run.noMain')}</EmptyState> : <>
            {list.mains.length > 1 && <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">{t('run.mainClass')}
              <select data-testid="java-run-main" className="h-9 rounded border bg-background px-2" value={selected} onChange={event => setSelected(event.target.value)}>
                {list.mains.map(item => <option key={item.className} value={item.className}>{item.className} · {item.file}</option>)}
              </select></label>}
            <Button data-testid="java-run-start" size="sm" disabled={!selected} onClick={() => {
              const choice = list.mains.find(item => item.className === selected); if (choice) void begin(choice, list)
            }}><Play className="mr-1 h-3 w-3" />{t(run?.state === 'idle' ? 'run.start' : 'run.again')}</Button>
          </>}
        </div>}
        {!loading && !active(run?.state) && <Button data-testid="java-run-refresh" type="button" size="sm" variant="ghost" onClick={again}>{t('run.refresh')}</Button>}
      </div>
    </section></FloatingTool>}
    {configure && <JavaConfiguration projectId={projectId} onClose={() => setConfigure(false)} onSaved={() => {
      onContextChange() // Shared settings invalidate discovery; they never start a program.
    }} />}
  </>
}
