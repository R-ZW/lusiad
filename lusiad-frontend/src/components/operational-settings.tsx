'use client'

import { Feedback } from '@/components/ui/feedback'
import { useEffect, useState } from 'react'
import { loadSettingsController, saveTempRootController } from '@/controllers/settings/settings.controller'
import { useI18n } from '@/lib/i18n/locale-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SettingsHelp } from '@/components/ui/settings-help'
import { Cable, Database, FolderOpen, LockKeyhole, Plug, Save } from 'lucide-react'
import type { MessageKey } from '@/lib/i18n/messages'

export function OperationalSettings() {
  const { t } = useI18n()
  const [settings, setSettings] = useState<Awaited<ReturnType<typeof loadSettingsController>> | null>(null)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(true)
  const [status, setStatus] = useState<'saved' | 'conflict' | 'managed' | 'invalid' | null>(null)
  function info(label: MessageKey, value: string | number | boolean | null, option: string) {
    return <div key={option} className="min-w-0 space-y-1">
      <div className="flex items-center gap-2"><Label className="flex-1 text-xs">{t(label)}</Label><SettingsHelp label={t(label)}>{t('settings.environmentHelp')}{'\n'}{option}</SettingsHelp></div>
      <div className="flex min-w-0 items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"><LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /><span className="min-w-0 break-all">{typeof value === 'boolean' ? t(value ? 'settings.enabled' : 'settings.disabled') : value ?? '—'}</span></div>
    </div>
  }
  useEffect(() => {
    let active = true
    loadSettingsController().then((result) => {
      if (active) { setSettings(result); setValue(result.tempRoot); setBusy(false) }
    }).catch(() => { if (active) { setStatus('invalid'); setBusy(false) } })
    return () => { active = false }
  }, [])

  async function save() {
    if (!settings) return
    setBusy(true); setStatus(null)
    try {
      const result = await saveTempRootController(value, settings.revision)
      if (!result.ok) { setStatus(result.code ?? 'invalid'); return }
      const current = await loadSettingsController()
      setSettings(current); setValue(current.tempRoot); setStatus('saved')
    } catch { setStatus('invalid') }
    finally { setBusy(false) }
  }

  return <section data-testid="settings-operational" aria-busy={busy} className="space-y-3">
    <div className="flex items-center gap-2"><FolderOpen className="size-4 text-muted-foreground" /><Label htmlFor="temp-root" className="flex-1">{t('settings.tempRoot')}</Label><SettingsHelp testId="settings-temp-help" label={t('settings.tempRoot')}>{t('settings.tempRootHelp')}{settings && !settings.editable && <> {'\n'}{t('settings.operational.managed')}</>}</SettingsHelp></div>
    <Input id="temp-root" data-testid="settings-temp-root" value={value} onChange={(event) => { setValue(event.target.value); setStatus(null) }} disabled={busy || !settings?.editable} />
    <Button data-testid="settings-temp-save" size="sm" disabled={busy || !settings?.editable || value === settings.tempRoot} onClick={() => void save()}><Save className="size-4" />{t('common.save')}</Button>
    {status && <Feedback data-testid="settings-temp-status" data-status={status} tone={status === 'saved' ? 'success' : 'error'}>{t(`settings.operational.${status}`)}</Feedback>}
    {settings && <div data-testid="settings-environment-summary" className="space-y-5 border-t pt-5">
      {info('settings.configFile', settings.configFile, 'LUSIAD_CONFIG_FILE')}
      {info('settings.profile', settings.environment.profile, 'LUSIAD_ENV / LUSIAD_TEST_CONFIG')}
      <section className="space-y-3 rounded-lg border p-4"><h3 className="flex items-center gap-2 text-sm font-medium"><Cable className="size-4" />{t('settings.connections')}</h3><div className="grid gap-4 sm:grid-cols-2">
        {info('settings.apiUrl', settings.apiUrl, 'apiUrl · LUSIAD_API_URL / LUSIAD_API_PORT')}
        {info('settings.frontendUrl', settings.environment.frontendUrl, 'frontendUrl · LUSIAD_FRONTEND_URL')}
        {info('settings.cloudflareTunnel', settings.environment.allowCloudflareTunnel, 'allowCloudflareTunnel · LUSIAD_ALLOW_CLOUDFLARE_TUNNEL')}
        {info('settings.requestTimeout', settings.environment.requestTimeoutMs, 'requestTimeoutMs · LUSIAD_API_TIMEOUT_MS')}
        {info('settings.analytics', settings.environment.analyticsEnabled, 'analyticsEnabled · LUSIAD_ANALYTICS_ENABLED')}
      </div></section>
      <section className="space-y-3 rounded-lg border p-4"><h3 className="flex items-center gap-2 text-sm font-medium"><Database className="size-4" />{t('settings.database')}</h3><div className="grid gap-4 sm:grid-cols-2">
        {info('settings.dbHost', settings.environment.database.host, 'database.host · LUSIAD_DB_HOST')}
        {info('settings.dbPort', settings.environment.database.port, 'database.port · LUSIAD_DB_PORT')}
        {info('settings.dbName', settings.environment.database.name, 'database.name · LUSIAD_DB_NAME')}
        {info('settings.dbTls', settings.environment.database.tls, 'database.tls · LUSIAD_DB_TLS')}
        {info('settings.dbConnectTimeout', settings.environment.database.connectTimeoutMs, 'database.connectTimeoutMs · LUSIAD_DB_CONNECT_TIMEOUT_MS')}
        {info('settings.dbSocketTimeout', settings.environment.database.socketTimeoutMs, 'database.socketTimeoutMs · LUSIAD_DB_SOCKET_TIMEOUT_MS')}
      </div></section>
      <div className="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm"><LockKeyhole className="size-4" /><span className="flex-1">{t('settings.credentials')}</span><SettingsHelp label={t('settings.credentials')}>{t('settings.credentialsHelp')}</SettingsHelp></div>
      <div className="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm"><Plug className="size-4" /><span className="flex-1">IntelliJ</span><SettingsHelp testId="settings-plugin-help" label="IntelliJ">{t('settings.pluginHelp')}</SettingsHelp></div>
    </div>}
  </section>
}
