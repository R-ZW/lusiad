'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AlignLeft, FolderInput, FolderOpen, FolderSearch, KeyRound, Pencil, Tag, Trash2, Unlink } from 'lucide-react'
import { useI18n } from '@/lib/i18n/locale-provider'
import type { MessageKey } from '@/lib/i18n/messages'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { ProjectHelp, ProjectPathInput } from './project-fields'
import * as api from '@/controllers/projects/project-management.controller'
import type { ProjectAction, ProjectPlan, RegistrationView, ProjectOperation, ProjectReceipt } from '@/lib/services/project-management/contract'

const OPERATIONS_CHANGED = 'lusiad:project-operations'
function notifyOperations(receipt: ProjectReceipt | null) {
  window.dispatchEvent(new CustomEvent(OPERATIONS_CHANGED, { detail: receipt }))
}

function errorKey(code: string): MessageKey {
  return ({
    project_pending_changes: 'projectAdmin.error.pending', project_external_changes: 'projectAdmin.error.external',
    project_unsaved_documents: 'projectAdmin.error.unsaved',
    project_busy: 'projectAdmin.error.busy', project_stale: 'projectAdmin.error.stale',
    project_migration_required: 'projectAdmin.error.migration', project_not_found: 'projectAdmin.error.missing',
    project_recovery_required: 'projectAdmin.error.recovery', project_cleanup_pending: 'projectAdmin.error.cleanup',
    project_protected_path: 'projectAdmin.error.protected', project_host_path: 'projectAdmin.error.host',
    project_linked_path: 'projectAdmin.error.linked', project_path_conflict: 'projectAdmin.error.pathConflict',
    project_context_conflict: 'projectAdmin.error.context', project_original_exists: 'projectAdmin.error.original',
    project_identity_unverified: 'projectAdmin.error.identity', project_cross_reference: 'projectAdmin.error.references',
    project_invalid_path: 'projectAdmin.error.path', project_tree_limit: 'projectAdmin.error.limit',
    project_move_migration_required: 'projectAdmin.error.moveMigration', project_move_same_path: 'projectAdmin.error.moveSame',
    project_move_destination_exists: 'projectAdmin.error.moveExists', project_move_cross_device: 'projectAdmin.error.moveDevice',
    project_invalid_fields: 'projectAdmin.error.fields', project_confirmation_required: 'projectAdmin.error.confirmation',
  } as Record<string, MessageKey>)[code] ?? 'projectAdmin.error.generic'
}

export function ProjectManagement({ projectId }: { projectId: number }) {
  const { t } = useI18n(), router = useRouter()
  const [mode, setMode] = useState<'edit' | ProjectAction | null>(null)
  const [profile, setProfile] = useState<RegistrationView | null>(null)
  const [plan, setPlan] = useState<ProjectPlan | null>(null)
  const [name, setName] = useState(''), [description, setDescription] = useState(''), [path, setPath] = useState('')
  const [confirmation, setConfirmation] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const generation = useRef(0)
  const [operationId, setOperationId] = useState('')
  const [choosing, setChoosing] = useState(false)
  const title = mode === 'edit' ? 'projectAdmin.edit' : mode === 'move' ? 'projectAdmin.move' : mode === 'relink' ? 'projectAdmin.relink' : mode === 'delete' ? 'projectAdmin.delete' : 'projectAdmin.remove'
  async function open(next: NonNullable<typeof mode>) {
    const token = ++generation.current
    setMode(next); setChoosing(false); setBusy(true); setError(''); setPlan(null); setProfile(null); setConfirmation(''); setPath(''); setOperationId('')
    try {
      const result = await api.readProject(projectId)
      if (generation.current !== token) return
      if (result.ok) { setProfile(result.value); setName(result.value.name); setDescription(result.value.description) }
      else setError(result.code)
    } catch { if (generation.current === token) setError('project_unavailable') }
    finally { if (generation.current === token) setBusy(false) }
  }
  function close() { if (busy) return; generation.current++; setMode(null); router.refresh() }
  async function prepare() {
    if (!mode || mode === 'edit') return
    setBusy(true); setError('')
    try {
      const result = await api.previewProject(projectId, mode, path)
      if (result.ok) { setPlan(result.value); setOperationId(crypto.randomUUID()) }
      else setError(result.code)
    } catch { setError('project_unavailable') }
    finally { setBusy(false) }
  }
  async function submit() {
    if (!profile || !mode) return
    setBusy(true); setError('')
    if (mode !== 'edit') notifyOperations(null)
    try {
      if (mode === 'edit') {
        const result = await api.updateProject(projectId, profile.revision, name, description)
        if (result.ok) { toast({ description: t('projectAdmin.saved') }); setMode(null); router.refresh() } else setError(result.code)
      } else if (plan) {
        const result = await api.applyProject(projectId, mode, (mode === 'move' ? plan.destinationDirectory : plan.newPath) ?? '', plan.revision, confirmation, operationId)
        notifyOperations(result.ok ? result.value : null)
        if (result.ok && result.value.completed) { setMode(null); router.refresh() }
        else setError(result.ok ? result.value.state === 'aborted' ? 'project_stale' : 'project_cleanup_pending' : result.code)
      }
    } catch {
      setError('project_unavailable')
      if (mode !== 'edit') notifyOperations(null)
    } finally { setBusy(false) }
  }
  const id = `project-${projectId}`
  return <>
    <div role="group" aria-label={t('projectAdmin.manage')} data-testid="project-management-actions" className="flex items-center gap-2">
      <div role="group" aria-label={t('projectAdmin.registrationActions')} className="flex items-center gap-1">
        <Button type="button" data-testid="project-edit" variant="ghost" size="icon" className="size-8" aria-label={t('projectAdmin.edit')} title={t('projectAdmin.edit')} disabled={busy} onClick={() => void open('edit')}><Pencil className="size-4" /></Button>
        <Button type="button" data-testid="project-move" variant="ghost" size="icon" className="size-8" aria-label={t('projectAdmin.move')} title={t('projectAdmin.move')} disabled={busy} onClick={() => void open('move')}><FolderInput className="size-4" /></Button>
        <Button type="button" data-testid="project-relink" variant="ghost" size="icon" className="size-8" aria-label={t('projectAdmin.relink')} title={t('projectAdmin.relink')} disabled={busy} onClick={() => void open('relink')}><FolderSearch className="size-4" /></Button>
      </div>
      <div role="group" aria-label={t('projectAdmin.removalActions')} className="flex items-center gap-1 border-l pl-2">
        <Button type="button" data-testid="project-unregister" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" aria-label={t('projectAdmin.remove')} title={t('projectAdmin.remove')} disabled={busy} onClick={() => void open('remove')}><Unlink className="size-4" /></Button>
        <Button type="button" data-testid="project-delete" variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" aria-label={t('projectAdmin.delete')} title={t('projectAdmin.delete')} disabled={busy} onClick={() => void open('delete')}><Trash2 className="size-4" /></Button>
      </div>
    </div>
    <Dialog open={mode !== null} onOpenChange={value => { if (!value) close() }}>
      <DialogContent data-testid="project-management-dialog" data-mode={mode ?? ''} data-operation-id={operationId || undefined} aria-busy={busy} showCloseButton={!busy}>
        <DialogHeader><div className="flex items-center gap-2 pr-7"><DialogTitle>{t(title)}</DialogTitle><ProjectHelp message={mode === 'edit' ? 'projectAdmin.editHelp' : mode === 'move' ? 'projectAdmin.moveHelp' : mode === 'relink' ? 'projectAdmin.relinkHelp' : mode === 'delete' ? 'projectAdmin.deleteHelp' : 'projectAdmin.removeHelp'} /></div><DialogDescription className="sr-only">{t(title)}</DialogDescription></DialogHeader>
        {profile && <div className="space-y-4">
          <p className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-xs" data-testid="project-management-path"><FolderOpen aria-hidden="true" className="size-4 shrink-0" /><span className="break-all">{profile.path}</span></p>
          {mode === 'edit' ? <>
            <div className="space-y-2"><Label htmlFor={`${id}-name`}>{t('common.name')}</Label><div className="relative"><Tag aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" id={`${id}-name`} data-testid="project-edit-name" value={name} maxLength={255} disabled={busy} onChange={e => setName(e.target.value)} /></div></div>
            <div className="space-y-2"><Label htmlFor={`${id}-description`}>{t('common.description')}</Label><div className="relative"><AlignLeft aria-hidden="true" className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Textarea className="pl-9" id={`${id}-description`} data-testid="project-edit-description" value={description} maxLength={16384} disabled={busy} onChange={e => setDescription(e.target.value)} /></div></div>
          </> : <>
            <p className="text-sm">{t('projectAdmin.counts', { commits: profile.commits, changes: profile.changes, tags: profile.tags, pending: profile.pending })}</p>
            {(mode === 'relink' || mode === 'move') && <div className="space-y-2"><Label htmlFor={`${id}-newPath`}>{t(mode === 'move' ? 'projectAdmin.destinationDirectory' : 'projectAdmin.newPath')}</Label><ProjectPathInput id={`${id}-newPath`} testId={mode === 'move' ? 'project-move-path' : 'project-relink-path'} value={path} disabled={busy || !!plan} onChange={setPath} onBusyChange={setChoosing} /></div>}
            {plan && <div className="space-y-3" data-testid="project-management-preview">
              {plan.newPath && <p data-testid="project-management-destination" className="break-all text-sm"><span className="text-muted-foreground">{t('projectAdmin.target')}: </span>{plan.newPath}</p>}
              {mode === 'move' && <p className="text-sm">{t('projectAdmin.moveCount', { files: plan.files ?? 0, bytes: plan.bytes ?? 0 })}</p>}
              {mode === 'delete' && <p className="font-medium text-destructive">{t('projectAdmin.physicalCount', { files: plan.files ?? 0, bytes: plan.bytes ?? 0 })}</p>}
              {plan.snapshotsRetained && <p className="break-all text-xs text-muted-foreground">{t('projectAdmin.snapshots', { path: plan.snapshotsRetained })}</p>}
              <Label htmlFor={`${id}-confirmation`}>{t('projectAdmin.confirmName', { name: profile.name })}</Label>
              <div className="relative"><KeyRound aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" id={`${id}-confirmation`} data-testid="project-management-confirmation" autoComplete="off" value={confirmation} disabled={busy} onChange={e => setConfirmation(e.target.value)} /></div>
            </div>}
          </>}
        </div>}
        {busy && <p role="status" className="text-sm">{t('projectAdmin.working')}</p>}
        {error && <p role="alert" data-testid="project-management-error" data-code={error} className="text-sm text-destructive">{t(errorKey(error))}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={busy} data-testid="project-management-cancel" onClick={close}>{t(error ? 'common.close' : 'common.cancel')}</Button>
          {profile && (mode === 'edit' || plan ? <Button data-testid="project-management-confirm" variant={mode === 'delete' ? 'destructive' : 'default'} disabled={busy || choosing || (mode === 'edit' ? !name.trim() : confirmation !== profile.name)} onClick={() => void submit()}>{t(mode === 'edit' ? 'common.save' : error === 'project_cleanup_pending' || error === 'project_recovery_required' ? 'projectAdmin.recover' : title)}</Button>
            : <Button data-testid="project-management-prepare" disabled={busy || choosing || ((mode === 'relink' || mode === 'move') && !path.trim())} onClick={() => void prepare()}>{t('projectAdmin.review')}</Button>)}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}

export function ProjectRecoveries() {
  const { t } = useI18n(), router = useRouter()
  const [items, setItems] = useState<ProjectOperation[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState('')
  const shownReceipts = useRef(new Set<string>())
  const showReceipt = useCallback((receipt: ProjectReceipt | null) => {
    if (!receipt || (!receipt.completed && receipt.state !== 'aborted')) return
    const key = `${receipt.operationId}:${receipt.state}`
    if (shownReceipts.current.has(key)) return
    shownReceipts.current.add(key)
    toast({ duration: 4500, description: <span data-testid="project-operation-result" data-operation-id={receipt.operationId} data-state={receipt.state}>
      {t(receipt.completed ? 'projectAdmin.operationCompleted' : 'projectAdmin.operationAborted')}
    </span> })
  }, [t])
  const generation = useRef(0)
  const invalidate = useCallback(() => { generation.current++ }, [])
  const refresh = useCallback(async () => {
    const current = ++generation.current
    try {
      const result = await api.pendingProjectOperations()
      if (current !== generation.current) return
      if (result.ok) { setItems(result.value); setError('') } else setError(result.code)
    } catch { if (current === generation.current) setError('project_unavailable') }
  }, [])
  useEffect(() => {
    const changed = (event: Event) => {
      showReceipt((event as CustomEvent<ProjectReceipt | null>).detail)
      void refresh()
    }
    window.addEventListener(OPERATIONS_CHANGED, changed)
    void refresh()
    return () => { invalidate(); window.removeEventListener(OPERATIONS_CHANGED, changed) }
  }, [refresh, invalidate, showReceipt])
  async function recover(item: ProjectOperation) {
    setBusy(item.operationId); setError('')
    try {
      const result = await api.recoverProjectOperation(item.projectId, item.operationId)
      await refresh()
      if (!result.ok) setError(result.code)
      else {
        showReceipt(result.value)
        if (!result.value.completed && result.value.state !== 'aborted') setError('project_cleanup_pending')
      }
    } catch { setError('project_unavailable') }
    finally { setBusy(''); router.refresh() }
  }
  if (!items.length && !error) return null
  return <section className="space-y-3 rounded-lg border p-4" data-testid="project-recoveries">
    {(items.length > 0 || error) && <h2 className="font-semibold">{t('projectAdmin.recoveryTitle')}</h2>}
    {error && <p role="alert" className="text-sm text-destructive">{t(errorKey(error))}</p>}
    {items.map(item => <div key={item.operationId} className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="min-w-0 flex-1" title={item.operationId}>
        <p>{t('projectAdmin.recoveryItem', { id: item.projectId })} · {t(item.kind === 'delete' ? 'projectAdmin.delete' : item.kind === 'move' ? 'projectAdmin.move' : item.kind === 'relink' ? 'projectAdmin.relink' : 'projectAdmin.remove')}</p>
        <p className="break-all text-xs text-muted-foreground">{item.path}</p>
        {item.newPath && <p className="break-all text-xs text-muted-foreground">→ {item.newPath}</p>}
        {item.stagedPath && <p className="break-all text-xs text-muted-foreground">{item.stagedPath}</p>}
      </div>
      <Button variant="outline" disabled={!!busy} data-testid="project-recover" data-operation-id={item.operationId} onClick={() => void recover(item)}>{t('projectAdmin.recover')}</Button>
    </div>)}
    <Button variant="ghost" disabled={!!busy} onClick={() => void refresh()}>{t('projectAdmin.refresh')}</Button>
  </section>
}
