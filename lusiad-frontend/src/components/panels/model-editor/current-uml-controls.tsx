'use client'

import { useEffect, useState } from 'react'
import { Focus, Network, RotateCcw, Workflow, X } from 'lucide-react'
import { FloatingTool } from '@/components/ui/floating-tools'
import { Feedback, EmptyState } from '@/components/ui/feedback'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useI18n } from '@/lib/i18n/locale-provider'
import { renderCurrentUmlController } from '@/controllers/current-uml/current-uml.controller'
import type { CurrentUmlResult } from '@/lib/models/current-uml.model'
import { DiagramPanel } from './change-uml-preview'

/** The controls only request saved live files; historical tabs never supply a source path. */
export function CurrentUmlControls({ projectId, file, signal }: { projectId: number; file?: string; signal: string }) {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'file' | 'project'>('project')
  const [reload, setReload] = useState(0)
  const [state, setState] = useState<{ key: string; result?: CurrentUmlResult; error?: string } | null>(null)
  const selectedView = view === 'file' && !file ? 'project' : view
  const key = JSON.stringify([projectId, selectedView, selectedView === 'file' ? file : null, locale, signal, reload, open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void renderCurrentUmlController({ projectId, view: selectedView, file: selectedView === 'file' ? file : undefined })
      .then(value => { if (!cancelled) setState({ key, ...value }) })
      .catch(() => { if (!cancelled) setState({ key, error: t('currentUml.error') }) })
    return () => { cancelled = true }
  }, [open, projectId, selectedView, file, key, t])

  const current = state?.key === key ? state : null
  const result = current?.result
  const status = !current ? 'loading' : current.error ? 'error' : !result?.fileCount ? 'empty'
    : !result?.diagram.classifiers.length ? 'no-classes' : 'ready'
  return <>
    <Button data-testid="current-uml-toggle" type="button" variant="outline" size="icon" className="shrink-0"
      aria-label={t('currentUml.open')} title={t('currentUml.open')} aria-expanded={open}
      onClick={() => { if (!open) setView(file ? 'file' : 'project'); setOpen(value => !value) }}>
      <Workflow className="h-4 w-4" />
    </Button>
    {open && <FloatingTool><section data-testid="current-uml-panel" data-state={status} data-view={selectedView}
      data-revision={result?.revision ?? ''} aria-label={t('currentUml.title')}
      className="ui-tool-surface flex h-[min(70vh,650px)] w-[65rem] max-w-full flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        <strong className="min-w-0 flex-1 truncate text-sm">{t('currentUml.title')}</strong>
        <ToggleGroup type="single" value={selectedView} onValueChange={value => {
          if (value === 'project' || (value === 'file' && !!file)) setView(value)
        }} aria-label={t('currentUml.title')}>
          <ToggleGroupItem data-testid="current-uml-view" value="file" disabled={!file}><Focus className="mr-1 h-4 w-4" />{t('diff.umlView.focus')}</ToggleGroupItem>
          <ToggleGroupItem data-testid="current-uml-view" value="project"><Network className="mr-1 h-4 w-4" />{t('diff.umlView.project')}</ToggleGroupItem>
        </ToggleGroup>
        <Button data-testid="current-uml-refresh" type="button" variant="ghost" size="icon" aria-label={t('common.reloadView')}
          onClick={() => setReload(value => value + 1)}><RotateCcw className="h-4 w-4" /></Button>
        <Button type="button" variant="ghost" size="icon" aria-label={t('common.close')}
          onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
      </header>
      {!current && <EmptyState className="flex-1"><Feedback tone="loading">{t('diff.umlLoading')}</Feedback></EmptyState>}
      {current?.error && <Feedback tone="error" data-testid="current-uml-error" className="m-3">{current.error}</Feedback>}
      {result && <div className="flex min-h-0 flex-1 p-3">
        <DiagramPanel key={key} side="current" title={t(selectedView === 'file' ? 'diff.umlView.focus' : 'diff.umlView.project')}
          panel={result.diagram} emptyText={t(result.fileCount ? 'currentUml.noClasses' : 'currentUml.noFiles')} />
      </div>}
    </section></FloatingTool>}
  </>
}
