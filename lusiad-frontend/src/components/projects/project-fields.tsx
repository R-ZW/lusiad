'use client'

import { useEffect, useRef, useState } from 'react'
import { CircleHelp, FolderOpen, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useI18n } from '@/lib/i18n/locale-provider'
import type { MessageKey } from '@/lib/i18n/messages'
import { chooseProjectDirectory } from '@/controllers/projects/directory-picker.controller'

/** Help is available by click/keyboard, rather than permanent copy in every form. */
export function ProjectHelp({ message }: { message: MessageKey }) {
  const { t } = useI18n()
  return <Popover>
    <PopoverTrigger asChild><Button type="button" data-testid="project-help" variant="ghost" size="icon" className="size-7 shrink-0" aria-label={t('projects.folder.help')} title={t('projects.folder.help')}><CircleHelp className="size-4" /></Button></PopoverTrigger>
    <PopoverContent data-testid="project-help-content" align="end" className="text-sm">{t(message)}</PopoverContent>
  </Popover>
}

/** A browser cannot disclose a local folder's absolute path; selection happens in the plugin. */
export function ProjectPathInput({ id, name, testId, value, onChange, disabled = false, onBusyChange }: {
  id: string; name?: string; testId?: string; value: string; onChange: (value: string) => void
  disabled?: boolean; onBusyChange?: (busy: boolean) => void
}) {
  const { t, locale } = useI18n()
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const request = useRef<{ id: string; locale: typeof locale } | null>(null)
  useEffect(() => () => {
    const active = request.current
    request.current = null
    if (active) void chooseProjectDirectory(active.id, 'cancel', '', active.locale).catch(() => {})
  }, [])

  async function browse() {
    if (disabled || request.current) return
    const active = { id: crypto.randomUUID(), locale }
    request.current = active; setBusy(true); onBusyChange?.(true); setError(null)
    try {
      let result = await chooseProjectDirectory(active.id, 'start', value, locale)
      while (request.current === active && result.ok && result.value.state === 'pending') {
        await new Promise(resolve => window.setTimeout(resolve, 600))
        if (request.current !== active) return
        result = await chooseProjectDirectory(active.id, 'status', '', locale)
      }
      if (request.current !== active) return
      if (!result.ok) {
        setError(t(result.code === 'directory_picker_busy' ? 'projects.folder.busy' : 'projects.folder.unavailable'))
        void chooseProjectDirectory(active.id, 'cancel', '', locale).catch(() => {})
      } else if (result.value.state === 'selected' && result.value.path) onChange(result.value.path)
      else if (result.value.state === 'failed') setError(t('projects.folder.unavailable'))
    } catch {
      if (request.current === active) {
        setError(t('projects.folder.unavailable'))
        void chooseProjectDirectory(active.id, 'cancel', '', locale).catch(() => {})
      }
    } finally {
      if (request.current === active) { request.current = null; setBusy(false); onBusyChange?.(false) }
    }
  }
  function cancel() {
    const active = request.current
    if (!active) return
    request.current = null; setBusy(false); onBusyChange?.(false)
    void chooseProjectDirectory(active.id, 'cancel', '', active.locale).catch(() => {})
  }
  return <div className="space-y-2">
    <div className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1"><FolderOpen aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input id={id} name={name} data-testid={testId} value={value} onChange={event => { setError(null); onChange(event.target.value) }} disabled={disabled || busy}
          className="pl-9" placeholder={t('projects.pathPlaceholder')} required aria-describedby={error || busy ? `${id}-status` : undefined} />
      </div>
      <Button type="button" data-testid="project-path-browse" variant="outline" size="icon" disabled={disabled} onClick={() => { if (busy) cancel(); else void browse() }}
        aria-label={t(busy ? 'common.cancel' : 'projects.folder.browse')} title={t(busy ? 'common.cancel' : 'projects.folder.browse')}>{busy ? <X /> : <FolderOpen />}</Button>
    </div>
    {(busy || error) && <p id={`${id}-status`} data-testid="project-path-status" role={error ? 'alert' : 'status'} className={`flex items-center gap-2 text-xs ${error ? 'text-destructive' : 'text-muted-foreground'}`}>
      {busy && <Loader2 className="size-3.5 animate-spin" />}{error ?? t('projects.folder.waiting')}
    </p>}
  </div>
}
