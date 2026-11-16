'use client'

import { useState } from 'react'
import { Copy, Loader2, Pencil, Plus, Tag, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/lib/i18n/locale-provider'
import { createHistoryTagController, deleteHistoryTagController, renameHistoryTagController } from '@/controllers/history-tags/history-tags.controller'
import { historyTagReference, normalizeHistoryTagName, tagsForTarget, type HistoryTag, type HistoryTagMutationResult, type HistoryTagsSnapshot, type HistoryTagTarget } from '@/lib/models/history-tags/history-tags.model'

export interface TagManagerTarget extends HistoryTagTarget { title: string; committed: boolean; external?: boolean }

export function HistoryTagChips({ tags, onManage }: { tags: HistoryTag[]; onManage: () => void }) {
  const { t } = useI18n()
  if (!tags.length) return null
  return <div className="flex flex-wrap gap-1">
    {tags.map((tag) => <button data-testid="tag-chip" data-tag-id={tag.id} key={tag.id} type="button" onClick={onManage}
      title={t('tags.manageNamed', { name: tag.name })}
      className="inline-flex max-w-full items-center gap-1 rounded-full border border-violet-300/50 bg-violet-500/5 px-2 py-0.5 text-xs text-violet-700 hover:bg-violet-500/10 focus-visible:outline-2 focus-visible:outline-ring dark:text-violet-300">
      <Tag className="h-2.5 w-2.5 shrink-0" /><span className="truncate">{tag.name}</span>
    </button>)}
  </div>
}

export function TagManager({ projectId, target, snapshot, onClose, onChanged }: {
  projectId: number; target: TagManagerTarget; snapshot: HistoryTagsSnapshot | null
  onClose: () => void; onChanged: () => void | Promise<void>
}) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const tags = tagsForTarget(snapshot?.tags ?? [], target)
  const available = snapshot?.available === true
  const nameLength = [...name.normalize('NFC').trim().replace(/ +/g, ' ')].length
  let warning = ''
  if (name.trim()) {
    try {
      const normalized = normalizeHistoryTagName(name)
      if (snapshot?.tags.some(tag => tag.id !== editing && normalizeHistoryTagName(tag.name).key === normalized.key)) warning = t('tags.duplicateHelp')
    } catch { warning = t(nameLength > 80 ? 'tags.errors.invalidName' : 'tags.nameRules') }
  }

  const run = async (operation: () => Promise<HistoryTagMutationResult>) => {
    setError(''); setNotice(''); setBusy(true)
    try {
      const result = await operation()
      if (!result.ok) { setError(t(`tags.errors.${result.code}`)); return }
      setName(''); setEditing(null); setDeleting(null)
      await onChanged()
      setNotice(t('tags.saved'))
    } catch { setError(t('tags.errors.unavailable')) }
    finally { setBusy(false) }
  }
  const save = () => {
    try { normalizeHistoryTagName(name) } catch { setError(t('tags.errors.invalidName')); return }
    void run(() => editing === null ? createHistoryTagController(projectId, target, name) : renameHistoryTagController(projectId, editing, name))
  }
  const copy = async (tag: HistoryTag) => {
    try { await navigator.clipboard.writeText(historyTagReference(tag)); setNotice(t('tags.copied')); setError('') }
    catch { setError(t('history.copyError')) }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}>
    <DialogContent data-testid="tag-manager" data-target-kind={target.kind} data-target-id={target.id} aria-busy={busy} className="z-(--ui-dialog) w-[calc(100vw-2rem)] max-w-lg" showCloseButton={!busy}
      onEscapeKeyDown={(event) => { if (busy) event.preventDefault() }} onPointerDownOutside={(event) => { if (busy) event.preventDefault() }}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Tag className="h-4 w-4 text-violet-600" />{t('tags.manage')}</DialogTitle>
        <DialogDescription className="sr-only">{target.title}</DialogDescription>
      </DialogHeader>
      <div className="min-w-0 rounded-md border bg-muted/30 px-3 py-2">
        <p className="text-xs text-muted-foreground">{t(target.kind === 'commit' ? 'comparison.refKind.commit' : 'comparison.refKind.change')} #{target.id}</p>
        <p className="truncate text-sm font-medium" title={target.title}>{target.title}</p>
      </div>
      {!available && <p role="alert" className="text-xs diff-text-modified">{t('tags.errors.migrationRequired')}</p>}
      {!target.committed && <p className="text-xs text-muted-foreground">{t('tags.pendingHelp')}</p>}
      {target.external && <p className="text-xs text-muted-foreground">{t('tags.externalHelp')}</p>}
      <div className="max-h-60 space-y-2 overflow-auto">
        {!tags.length && <p className="py-3 text-center text-xs text-muted-foreground">{t('tags.empty')}</p>}
        {tags.map((tag) => <div data-testid="tag-row" data-tag-id={tag.id} key={tag.id} className="flex flex-wrap items-center gap-1 rounded-md border px-2 py-1.5">
          <Tag className="h-3 w-3 text-violet-600" /><span className="min-w-0 flex-1 truncate text-xs" title={tag.name}>{tag.name}</span>
          {deleting === tag.id ? <>
            <Button data-testid="tag-confirm-remove" size="sm" variant="destructive" className="h-7 text-xs" disabled={busy} onClick={() => void run(() => deleteHistoryTagController(projectId, tag.id))}>{t('tags.confirmRemove')}</Button>
            <Button data-testid="tag-cancel-remove" size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={() => setDeleting(null)}>{t('common.cancel')}</Button>
          </> : <>
            <Button data-testid="tag-copy" size="icon" variant="ghost" className="h-8 w-8" disabled={busy || !target.committed} title={t('tags.copy')} aria-label={t('tags.copy')} onClick={() => void copy(tag)}><Copy className="h-3 w-3" /></Button>
            <Button data-testid="tag-rename" size="icon" variant="ghost" className="h-8 w-8" disabled={busy} title={t('tags.rename')} aria-label={t('tags.renameNamed', { name: tag.name })} onClick={() => { setEditing(tag.id); setName(tag.name); setError(''); setNotice('') }}><Pencil className="h-3 w-3" /></Button>
            <Button data-testid="tag-remove" size="icon" variant="ghost" className="h-8 w-8 text-destructive" disabled={busy} title={t('tags.remove')} aria-label={t('tags.removeNamed', { name: tag.name })} onClick={() => setDeleting(tag.id)}><Trash2 className="h-3 w-3" /></Button>
          </>}
        </div>)}
      </div>
      <form className="space-y-2 border-t pt-3" onSubmit={(event) => { event.preventDefault(); save() }}>
        <div className="flex items-center justify-between gap-2"><label htmlFor="history-tag-name" className="text-xs font-medium">{t(editing === null ? 'tags.add' : 'tags.rename')}</label><output data-testid="tag-name-count" htmlFor="history-tag-name" className={`text-xs tabular-nums ${nameLength > 80 ? 'text-destructive' : 'text-muted-foreground'}`} aria-label={t('tags.characters', { count: nameLength })}>{nameLength}/80</output></div>
        <div className="flex gap-2">
          <Input id="history-tag-name" value={name} maxLength={160} disabled={busy || !available} onChange={(event) => { setName(event.target.value); setError(''); setNotice('') }} placeholder={t('tags.placeholder')} className="h-9 text-sm" aria-invalid={Boolean(warning)} aria-describedby={warning ? 'history-tag-name-warning' : undefined} />
          <Button data-testid="tag-save" type="submit" size="sm" disabled={busy || !available || !name.trim()} className="h-9 gap-1.5">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}{t(editing === null ? 'tags.add' : 'common.save')}
          </Button>
        </div>
        {warning && warning !== error && <p id="history-tag-name-warning" data-testid="tag-name-warning" role="alert" className="text-xs text-destructive">{warning}</p>}
        {editing !== null && <Button data-testid="tag-cancel-edit" type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setEditing(null); setName(''); setError('') }}>{t('common.cancel')}</Button>}
      </form>
      {error && <p id={warning === error ? 'history-tag-name-warning' : undefined} role="alert" className="text-xs text-destructive">{error}</p>}
      {notice && <p role="status" className="text-xs diff-text-added">{notice}</p>}
      <DialogFooter><Button data-testid="tag-close" variant="outline" disabled={busy} onClick={onClose}>{t('common.close')}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
