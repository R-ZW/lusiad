'use client'

import { useActionState, useMemo, useRef, useState } from 'react'
import { AlignLeft, Folder, FolderPlus, Loader2, Search, Tag, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState, Feedback } from '@/components/ui/feedback'
import { ProjectRecoveries } from './project-management'
import { ProjectSummary } from './project-summary'
import { ProjectHelp, ProjectPathInput } from './project-fields'
import { ProjectPresenceBadge, useProjectPresence } from './project-presence'
import { useI18n } from '@/lib/i18n/locale-provider'
import { cn } from '@/lib/utils'
import { filterProjects, type ProjectListItem, type ProjectCreateState } from '@/lib/models/projects-overview'

type CreateAction = (state: ProjectCreateState, form: FormData) => Promise<ProjectCreateState>
function NewProjectDialog({ action, close }: { action: CreateAction; close: () => void }) {
  const { t } = useI18n()
  const [state, formAction, pending] = useActionState(action, { error: null })
  const [choosing, setChoosing] = useState(false)
  const [name, setName] = useState(''), [path, setPath] = useState(''), [description, setDescription] = useState('')
  return <Dialog open onOpenChange={open => { if (!open && !pending) close() }}>
    <DialogContent data-testid="project-create-dialog" showCloseButton={!pending}>
      <DialogHeader><div className="flex items-center gap-2 pr-7"><DialogTitle>{t('projects.new')}</DialogTitle><ProjectHelp message="projects.overview.createHelp" /></div><DialogDescription className="sr-only">{t('projects.new')}</DialogDescription></DialogHeader>
      <form data-testid="project-create" action={formAction} aria-busy={pending || choosing} className="space-y-4" onSubmit={event => { if (choosing) event.preventDefault() }}>
        <div className="space-y-2"><Label htmlFor="project-new-name">{t('common.name')}</Label><div className="relative"><Tag aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" id="project-new-name" name="name" value={name} onChange={e => setName(e.target.value)} disabled={pending} maxLength={255} placeholder={t('projects.namePlaceholder')} /></div></div>
        <div className="space-y-2"><div className="flex items-center gap-1"><Label htmlFor="project-new-path">{t('projects.path')}</Label><ProjectHelp message="projects.overview.pathHelp" /></div>
          <ProjectPathInput id="project-new-path" name="path" value={path} onChange={setPath} disabled={pending} onBusyChange={setChoosing} /></div>
        <div className="space-y-2"><Label htmlFor="project-new-description">{t('common.description')}</Label><div className="relative"><AlignLeft aria-hidden="true" className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Textarea id="project-new-description" name="description" value={description} onChange={e => setDescription(e.target.value)} disabled={pending} maxLength={16384} className="min-h-24 pl-9" placeholder={t('projects.descriptionPlaceholder')} /></div></div>
        {state.error && <Feedback data-testid="project-create-error" tone="error">{state.error}</Feedback>}
        <DialogFooter><Button type="button" variant="outline" data-testid="project-create-cancel" disabled={pending} onClick={close}>{t('common.cancel')}</Button>
          <Button data-testid="project-create-submit" type="submit" disabled={pending || choosing}>{pending ? <Loader2 className="animate-spin" /> : <FolderPlus />}{t(pending ? 'projects.overview.creating' : 'projects.create')}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}

export function ProjectsHome({ projects, createAction }: { projects: ProjectListItem[]; createAction: CreateAction }) {
  const { t, tp } = useI18n()
  const presence = useProjectPresence()
  const searchInput = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState(''), [selectedId, setSelectedId] = useState<number | null>(null), [creating, setCreating] = useState(false)
  const filtered = useMemo(() => filterProjects(projects, query), [projects, query])
  const selected = projects.find(project => project.id === selectedId)
  function clearSearch() { setQuery(''); searchInput.current?.focus() }
  return <>
    <p role="status" className="sr-only">{selected ? t('projects.overview.selectedPreview', { name: selected.name || selected.path }) : ''}</p>
    {Boolean(presence?.unregisteredIdeProjects.length) && <Feedback data-testid="unregistered-ide-project" tone="warning">{t('projects.unregisteredIde')}: {presence?.unregisteredIdeProjects.map(p => p.name).join(', ')}</Feedback>}
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">{t('projects.title')}</h1>
      <Button data-testid="project-create-open" onClick={() => setCreating(true)}><FolderPlus />{t('projects.new')}</Button>
    </header>
    <div className="grid min-h-0 flex-1 grid-rows-[minmax(8rem,0.65fr)_minmax(0,1.35fr)] gap-4 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)] sm:grid-rows-1">
      <section aria-label={t('projects.existing')} className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden rounded-xl border bg-card p-3">
        <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-medium">{t('projects.existing')}</h2><span data-testid="projects-count" className="text-xs text-muted-foreground">{tp('projects.count', filtered.length)}</span></div>
        <div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input ref={searchInput} data-testid="projects-search" aria-label={t('projects.overview.search')} value={query} onChange={e => setQuery(e.target.value)} placeholder={t('projects.overview.search')} className="pl-9 pr-10" />
          {query && <Button variant="ghost" size="icon" className="absolute right-0 top-0 size-9" data-testid="projects-search-clear" aria-label={t('projects.overview.clearSearch')} onClick={clearSearch}><X /></Button>}
        </div>
        <div data-testid="projects-list-scroll" tabIndex={0} role="region" aria-label={t('projects.existing')} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
          <ProjectRecoveries />
          {filtered.map(project => <article data-testid="project-card" data-project-id={project.id} data-selected={selected?.id === project.id} key={project.id}>
            <button type="button" data-testid="project-summary-select" onClick={() => setSelectedId(project.id)}
              aria-controls="project-summary" aria-expanded={selected?.id === project.id}
              className={cn('block w-full rounded-lg border bg-background p-4 text-left transition-colors hover:border-primary/40', selected?.id === project.id && 'border-primary/50 bg-accent/20')}>
              <span className="flex items-start gap-3">
                <span aria-hidden="true" className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/30"><Folder className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="line-clamp-2 break-words text-sm font-semibold">{project.name || project.path}</span>
                  <span className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">{project.description || t('common.noDescription')}</span>
                </span>
              </span>
              <span className="mt-3 block truncate font-mono text-xs text-muted-foreground" title={project.path}>{project.path}</span>
              <ProjectPresenceBadge status={presence} projectId={project.id} />
            </button>
          </article>)}
          {!filtered.length && <div data-testid="projects-empty" className="rounded-xl border border-dashed"><EmptyState icon={<Folder />}><h3 className="font-medium text-foreground">{t(projects.length ? 'projects.overview.noMatches' : 'projects.overview.noProjects')}</h3>
            <p>{t(projects.length ? 'projects.overview.trySearch' : 'projects.empty')}</p>
            <Button variant="outline" onClick={() => projects.length ? clearSearch() : setCreating(true)}>{t(projects.length ? 'projects.overview.clearSearch' : 'projects.new')}</Button>
          </EmptyState></div>}
        </div>
      </section>
      <ProjectSummary project={selected} />
    </div>
    {creating && <NewProjectDialog action={createAction} close={() => setCreating(false)} />}
  </>
}
