'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, FolderOpen, GitCommitHorizontal, History, Loader2, RefreshCw, Tag, Workflow } from 'lucide-react'
import { readProject } from '@/controllers/projects/project-management.controller'
import { renderCurrentUmlController } from '@/controllers/current-uml/current-uml.controller'
import { DiagramPanel } from '@/components/panels/model-editor/change-uml-preview'
import { Button } from '@/components/ui/button'
import { ProjectManagement } from './project-management'
import { EmptyState, Feedback } from '@/components/ui/feedback'
import { useI18n } from '@/lib/i18n/locale-provider'
import { projectPreviewKey, type ProjectListItem } from '@/lib/models/projects-overview'
import type { CurrentUmlResult } from '@/lib/models/current-uml.model'
import type { RegistrationView } from '@/lib/services/project-management/contract'

function SummaryContent({ project }: { project: ProjectListItem }) {
  const { t, locale } = useI18n()
  const [refresh, setRefresh] = useState(0)
  const [summary, setSummary] = useState<{ key: string; value?: RegistrationView; error?: boolean } | null>(null)
  const [diagram, setDiagram] = useState<{ key: string; result?: CurrentUmlResult; error?: string } | null>(null)
  const key = projectPreviewKey(project, locale, refresh)
  useEffect(() => {
    let cancelled = false
    void readProject(project.id).then(result => {
      if (!cancelled) setSummary(result.ok && result.value.id === project.id ? { key, value: result.value } : { key, error: true })
    }).catch(() => { if (!cancelled) setSummary({ key, error: true }) })
    return () => { cancelled = true }
  }, [key, project.id])
  useEffect(() => {
    let cancelled = false
    void renderCurrentUmlController({ projectId: project.id, view: 'project' }).then(result => {
      if (!cancelled) setDiagram({ key, ...result })
    }).catch(() => { if (!cancelled) setDiagram({ key, error: t('currentUml.error') }) })
    return () => { cancelled = true }
  }, [key, project.id, t])
  // Identity includes registration, locale and refresh. Never show the previous project's response.
  const info = summary?.key === key ? summary : null
  const uml = diagram?.key === key ? diagram : null
  const state = !uml ? 'loading' : uml.error ? 'error' : !uml.result?.fileCount ? 'empty'
    : !uml.result.diagram.classifiers.length ? 'no-classes' : 'ready'
  const stats = [
    { label: 'projects.overview.commits', value: info?.value?.commits, Icon: GitCommitHorizontal },
    { label: 'projects.overview.changes', value: info?.value?.changes, Icon: History },
    { label: 'projects.overview.pending', value: info?.value?.pending, Icon: FolderOpen },
    { label: 'projects.overview.tags', value: info?.value?.tags, Icon: Tag },
  ] as const
  return <div data-testid="project-summary" data-project-id={project.id} data-state={state} className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <header className="shrink-0 space-y-2 border-b px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h2 data-testid="project-summary-name" className="min-w-0 flex-1 truncate text-xl font-semibold tracking-tight" title={project.name || project.path}>{project.name || project.path}</h2>
        <div data-testid="project-summary-actions" data-project-id={project.id} className="flex shrink-0 items-center gap-2">
          <ProjectManagement projectId={project.id} />
          <span aria-hidden="true" className="h-5 shrink-0 border-l" />
          <Button data-testid="project-summary-refresh" variant="ghost" size="icon" className="size-8" aria-label={t('projects.overview.refresh')} title={t('projects.overview.refresh')} onClick={() => setRefresh(value => value + 1)}><RefreshCw /></Button>
        </div>
      </div>
      <p className="line-clamp-2 break-words text-sm text-muted-foreground" title={project.description || undefined}>{project.description || t('common.noDescription')}</p>
    </header>
    <div className="shrink-0 space-y-3 px-4 py-3">
      <p data-testid="project-summary-path" title={project.path} className="truncate rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground">{project.path}</p>
      <dl data-testid="project-summary-stats" data-state={!info ? 'loading' : info.error ? 'error' : 'ready'} aria-busy={!info} className="grid grid-cols-4 gap-2">
        {stats.map(({ label, value, Icon }) => <div key={label} className="rounded-md border bg-muted/20 px-3 py-2">
          <dt title={t(label)} className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"><Icon className="size-3.5 shrink-0" /><span className="truncate">{t(label)}</span></dt>
          <dd data-stat={label.split('.').pop()} className="mt-1 text-lg font-semibold tabular-nums">{value ?? '—'}</dd>
        </div>)}
      </dl>
      {info?.error && <Feedback tone="warning" className="text-xs">{t('projects.overview.statsError')}</Feedback>}
      <div data-testid="project-launcher" data-project-id={project.id} className="flex justify-end">
        <Button asChild size="sm" className="w-full"><Link data-testid="project-open" href={`/project/${project.id}`}>{t('projects.open')}<ArrowUpRight /></Link></Button>
      </div>
    </div>
    <div data-testid="project-summary-uml" data-state={state} data-revision={uml?.result?.revision ?? ''} aria-busy={!uml} className="flex min-h-0 flex-1 flex-col overflow-hidden border-t p-3">
      {!uml && <EmptyState className="flex-1"><Loader2 aria-hidden="true" className="size-5 animate-spin" /><p role="status">{t('diff.umlLoading')}</p></EmptyState>}
      {uml?.error && <EmptyState className="flex-1"><Feedback tone="error">{uml.error}</Feedback>
        <Button variant="outline" size="sm" onClick={() => setRefresh(value => value + 1)}>{t('common.reloadView')}</Button></EmptyState>}
      {uml?.result && <DiagramPanel key={key} side="current" title={t('projects.overview.diagram')} panel={uml.result.diagram}
          emptyText={t(uml.result.fileCount ? 'currentUml.noClasses' : 'currentUml.noFiles')} />}
    </div>
  </div>
}

function ProjectPlaceholder() {
  const { t } = useI18n()
  return <EmptyState data-testid="project-summary-empty" className="min-h-0 flex-1 gap-4 rounded-lg border border-dashed bg-muted/15 p-4">
    <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl border bg-muted/30"><Workflow className="size-6" /></span>
    <div className="max-w-xs space-y-2"><h2 className="font-medium text-foreground">{t('projects.overview.choose')}</h2>
      <p>{t('projects.overview.chooseHelp')}</p></div>
  </EmptyState>
}

export function ProjectSummary({ project }: { project?: ProjectListItem }) {
  const { t } = useI18n()
  return <aside id="project-summary" data-testid="project-summary-region" aria-label={t('projects.overview.summary')} tabIndex={-1}
    className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card">
    {project ? <SummaryContent key={project.id} project={project} /> : <div className="flex min-h-0 flex-1 flex-col p-3"><ProjectPlaceholder /></div>}
  </aside>
}
