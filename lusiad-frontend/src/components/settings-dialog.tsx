'use client'

import { useEffect, useState } from 'react'
import { Coffee, Globe2, Languages, Server, Settings } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { SettingsHelp } from './ui/settings-help'
import { AppearanceSettings } from './appearance-settings'
import { OperationalSettings } from './operational-settings'
import { JavaConfigurationForm } from './panels/model-editor/java-configuration'
import { useI18n } from '@/lib/i18n/locale-provider'
import type { AppLocale, ChangeTextLocalePreference } from '@/lib/i18n/core'
import { listSettingsProjectsController } from '@/controllers/settings/settings.controller'
import { Feedback } from './ui/feedback'

export interface ProjectSettingsProps {
  projectId?: number
  projectName?: string
  checkJavaProposals?: boolean
  onCheckJavaProposalsChange?: (value: boolean) => void
  onJavaContextChange?: () => void
}

function ProjectJavaSettings({ projectId, projectName, checkJavaProposals, onCheckJavaProposalsChange, onJavaContextChange, onBusyChange }: ProjectSettingsProps & { onBusyChange: (busy: boolean) => void }) {
  const { t } = useI18n()
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([])
  const [selected, setSelected] = useState(projectId ?? 0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (projectId) return
    let active = true
    setLoading(true)
    listSettingsProjectsController().then(value => { if (active) setProjects(value) })
      .catch(() => { if (active) setError(t('settings.projectsError')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId, t])
  async function loadProjects() {
    setLoading(true); setError('')
    try { setProjects(await listSettingsProjectsController()) }
    catch { setError(t('settings.projectsError')) }
    finally { setLoading(false) }
  }
  return <div className="space-y-5">
    {projectId ? <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"><Coffee className="size-4" /><span className="truncate">{projectName}</span></div> : <div className="space-y-2">
      <div className="flex items-center justify-between"><Label htmlFor="settings-java-project">{t('settings.project')}</Label><Button variant="outline" size="sm" disabled={loading || saving} onClick={() => void loadProjects()}>{t('settings.loadProjects')}</Button></div>
      <select id="settings-java-project" data-testid="settings-java-project" disabled={saving} className="w-full rounded-md border bg-background px-3" value={selected} onChange={event => setSelected(Number(event.target.value))}>
        <option value={0}>{t('settings.chooseProject')}</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
      {error && <Feedback tone="error">{error}</Feedback>}
    </div>}
    {onCheckJavaProposalsChange && <div className="flex items-center gap-2 rounded-md border p-3">
      <input id="settings-java-proposals" data-testid="settings-java-proposals" type="checkbox" checked={checkJavaProposals ?? false} onChange={event => onCheckJavaProposalsChange(event.target.checked)} />
      <Label htmlFor="settings-java-proposals" className="flex-1">{t('java.checkProposals')}</Label>
      <SettingsHelp label={t('java.checkProposals')}>{t('settings.javaProposalsHelp')}</SettingsHelp>
    </div>}
    {selected > 0 ? <JavaConfigurationForm key={selected} projectId={selected} onSaved={() => { if (selected === projectId) onJavaContextChange?.() }} onBusyChange={value => { setSaving(value); onBusyChange(value) }} /> : <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center text-muted-foreground"><Coffee className="size-8" /><p className="text-sm">{t('settings.chooseProject')}</p></div>}
  </div>
}

export function SettingsDialog(props: ProjectSettingsProps) {
  const { locale, setLocale, changeTextLocalePreference, setChangeTextLocalePreference, t } = useI18n()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('interface')
  const [visited, setVisited] = useState(['interface'])
  const [busy, setBusy] = useState(false)
  function changeTab(value: string) { setTab(value); setVisited(previous => previous.includes(value) ? previous : [...previous, value]) }
  return <Dialog open={open} onOpenChange={value => { if (!busy) { setOpen(value); if (!value) { setTab('interface'); setVisited(['interface']) } } }}>
    <DialogTrigger asChild><Button data-testid="settings-open" aria-label={t('settings.title')} variant="ghost" size="icon" className="h-8 w-8"><Settings className="size-4" /></Button></DialogTrigger>
    <DialogContent data-testid="settings-dialog" showCloseButton={!busy} className="flex h-[min(46rem,90dvh)] w-[min(62rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0">
      <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14">
        <DialogTitle className="flex items-center gap-2"><Settings className="size-5" />{t('settings.title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('settings.description')}</DialogDescription>
      </DialogHeader>
      <Tabs value={tab} onValueChange={changeTab} className="min-h-0 flex-1 gap-0">
        <TabsList data-testid="settings-tabs" aria-label={t('settings.title')} className="h-auto w-full shrink-0 justify-start gap-1 rounded-none border-b bg-muted/50 px-4 py-2">
          <TabsTrigger data-testid="settings-tab-interface" value="interface" disabled={busy}><Languages />{t('settings.interface')}</TabsTrigger>
          <TabsTrigger data-testid="settings-tab-java" value="java" disabled={busy}><Coffee />Java</TabsTrigger>
          <TabsTrigger data-testid="settings-tab-environment" value="environment" disabled={busy}><Server />{t('settings.environment')}</TabsTrigger>
        </TabsList>
        <TabsContent value="interface" forceMount hidden={tab !== 'interface'} className="min-h-0 overflow-y-auto p-6 data-[state=inactive]:hidden">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2"><div className="flex items-center gap-2"><Globe2 className="size-4 text-muted-foreground" /><Label htmlFor="language" className="flex-1">{t('settings.language')}</Label><SettingsHelp testId="settings-language-help" label={t('settings.language')}>{t('settings.languageDescription')} {t('settings.saved')}</SettingsHelp></div>
              <Select value={locale} onValueChange={value => setLocale(value as AppLocale)}><SelectTrigger data-testid="settings-language" id="language" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pt-BR">{t('settings.language.ptBR')}</SelectItem><SelectItem value="en">{t('settings.language.en')}</SelectItem></SelectContent></Select>
            </div>
            <div className="space-y-2"><div className="flex items-center gap-2"><Languages className="size-4 text-muted-foreground" /><Label htmlFor="change-text-language" className="flex-1">{t('settings.changeTextLanguage')}</Label><SettingsHelp label={t('settings.changeTextLanguage')}>{t('settings.changeTextLanguageDescription')} {t('settings.saved')}</SettingsHelp></div>
              <Select value={changeTextLocalePreference} onValueChange={value => setChangeTextLocalePreference(value as ChangeTextLocalePreference)}><SelectTrigger data-testid="settings-change-language" id="change-text-language" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem data-locale="interface" value="interface">{t('settings.changeTextLanguage.interface')}</SelectItem><SelectItem data-locale="pt-BR" value="pt-BR">{t('settings.language.ptBR')}</SelectItem><SelectItem data-locale="en" value="en">{t('settings.language.en')}</SelectItem></SelectContent></Select>
            </div>
          </div>
          <div className="mt-6 border-t pt-6"><AppearanceSettings /></div>
        </TabsContent>
        <TabsContent value="java" forceMount hidden={tab !== 'java'} className="min-h-0 overflow-y-auto p-6 data-[state=inactive]:hidden">{visited.includes('java') && <ProjectJavaSettings {...props} onBusyChange={setBusy} />}</TabsContent>
        <TabsContent value="environment" forceMount hidden={tab !== 'environment'} className="min-h-0 overflow-y-auto p-6 data-[state=inactive]:hidden">{visited.includes('environment') && <OperationalSettings />}</TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>
}
