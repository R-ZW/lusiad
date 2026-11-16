'use client'

import { useEffect, useState } from 'react'
import { Coffee, FolderTree, Library, Loader2, Save } from 'lucide-react'
import { useI18n } from '@/lib/i18n/locale-provider'
import { javaContextController } from '@/lib/services/java-diagnostics/java-client'
import { unwrapBackendAction } from '@/lib/services/backend-action-result'
import type { JavaContext, JavaSettings } from '@/lib/services/java-diagnostics/java-contract'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SettingsHelp } from '@/components/ui/settings-help'
import { Feedback } from '@/components/ui/feedback'
import { toast } from '@/hooks/use-toast'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function JavaConfigurationForm({ projectId, onClose, onSaved, onBusyChange }: {
  projectId: number; onClose?: () => void; onSaved: () => void; onBusyChange?: (busy: boolean) => void
}) {
  const { t } = useI18n()
  const [context, setContext] = useState<JavaContext | null>(null), [draft, setDraft] = useState<JavaSettings | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { let active = true; void javaContextController(projectId).then(response => {
    if (!active) return
    try { const value = unwrapBackendAction(response); setContext(value); setDraft(value.settings) } catch (failure) { setError(String(failure)) }
  }).catch(failure => { if (active) setError(failure instanceof Error ? failure.message : String(failure)) }); return () => { active = false } }, [projectId])
  async function save() {
    if (!context || !draft || busy) return
    setBusy(true); onBusyChange?.(true); setError('')
    try {
      const cleaned = { ...draft }
      for (const key of ['sourceRoots', 'testRoots', 'classpath', 'modulePath'] as const) cleaned[key] = draft[key].map(value => value.trim()).filter(Boolean)
      const value = unwrapBackendAction(await javaContextController(projectId, cleaned, context.configurationRevision))
      setContext(value); setDraft(value.settings); onSaved()
      toast({ description: t('settings.javaSaved') })
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setBusy(false); onBusyChange?.(false) }
  }
  return <div data-testid="java-configuration-form" aria-busy={busy} className="space-y-5">
    {context && draft ? <>
      <div className="flex min-w-0 items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <Coffee className="size-4 shrink-0" /><span className="min-w-0 flex-1 truncate" title={context.runtimeHome}>{t('java.runtime')} {context.runtimeVersion}</span>
        <SettingsHelp label={t('java.runtime')}>{context.runtimeHome}{'\n'}{t('java.configurationHelp')}</SettingsHelp>
      </div>
      {!context.available && <Feedback tone="warning">{t('java.unavailable')}</Feedback>}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <div className="space-y-2">
          <div className="flex items-center gap-2"><Label htmlFor="java-jdk" className="flex-1">JDK</Label><SettingsHelp label="JDK">{t('settings.jdkHelp')}</SettingsHelp></div>
          <Input id="java-jdk" data-testid="java-jdk" value={draft.jdkHome} disabled={busy} onChange={event => setDraft({ ...draft, jdkHome: event.target.value })} />
          <Button data-testid="java-runtime-jdk" type="button" variant="outline" size="sm" disabled={busy} onClick={() => setDraft({ ...draft, jdkHome: context.runtimeHome })}>{t('java.useRuntime')}</Button>
        </div>
        <div className="space-y-2"><div className="flex items-center gap-2"><Label htmlFor="java-release" className="flex-1">{t('java.release')}</Label><SettingsHelp label={t('java.release')}>{t('settings.releaseHelp')}</SettingsHelp></div>
          <select id="java-release" data-testid="java-release" disabled={busy} className="w-full rounded-md border bg-background px-3" value={draft.release} onChange={event => setDraft({ ...draft, release: Number(event.target.value) })}>
            {[...new Set([...context.supportedReleases, draft.release])].sort((a, b) => a - b).map(release => <option key={release} value={release}>{release}</option>)}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(['sourceRoots', 'testRoots', 'classpath', 'modulePath'] as const).map(key => <div key={key} className="space-y-2">
          <div className="flex items-center gap-2">{key.endsWith('Roots') ? <FolderTree className="size-4 text-muted-foreground" /> : <Library className="size-4 text-muted-foreground" />}<Label htmlFor={`java-${key}`} className="flex-1">{t(`java.${key}`)}</Label><SettingsHelp label={t(`java.${key}`)}>{t('java.pathsHelp')}</SettingsHelp></div>
          <textarea id={`java-${key}`} data-testid={`java-${key}`} disabled={busy} rows={3} className="w-full rounded-md border bg-background p-2 font-mono text-sm" value={draft[key].join('\n')} onChange={event => setDraft({ ...draft, [key]: event.target.value.split('\n') })} />
        </div>)}
      </div>
    </> : !error && <Feedback tone="loading"><Loader2 className="size-4 animate-spin" />{t('common.loading')}</Feedback>}
    {error && <Feedback tone="error">{error}</Feedback>}
    <div className="flex justify-end gap-2 border-t pt-4">
      <Button variant="outline" disabled={busy} onClick={() => { if (context) { setDraft(context.settings); setError('') } onClose?.() }}>{t('common.cancel')}</Button>
      <Button data-testid="java-save-configuration" disabled={!draft || !context || busy} onClick={() => void save()}><Save className="size-4" />{t('common.save')}</Button>
    </div>
  </div>
}

export function JavaConfiguration({ projectId, onClose, onSaved }: { projectId: number; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}><DialogContent data-testid="java-configuration" showCloseButton={!busy} className="max-h-[90dvh] w-[min(54rem,calc(100vw-2rem))] overflow-y-auto">
    <DialogHeader><DialogTitle className="flex items-center gap-2"><Coffee className="size-5" />{t('java.configure')}</DialogTitle><DialogDescription className="sr-only">{t('java.configurationHelp')}</DialogDescription></DialogHeader>
    <JavaConfigurationForm projectId={projectId} onClose={onClose} onBusyChange={setBusy} onSaved={() => { onSaved(); onClose() }} />
  </DialogContent></Dialog>
}
