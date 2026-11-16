'use client'

import { useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import { useI18n } from '@/lib/i18n/locale-provider'
import { useBlockPalette } from './theme-provider'
import type { SharedUiPreferences } from '@/lib/config/shared-ui-settings'
import { toast } from '@/hooks/use-toast'

/** File-backed preferences are shared with the plugin; browser storage remains an offline cache. */
export function SharedPreferencesBridge() {
  const { locale, setLocale, changeTextLocalePreference, setChangeTextLocalePreference, t } = useI18n()
  const { theme, setTheme } = useTheme()
  const { palette, savePalette } = useBlockPalette()
  const latest = useRef({ language: locale, changeTextLanguage: changeTextLocalePreference, theme: (theme ?? 'system') as 'system' | 'light' | 'dark', palette })
  const setters = useRef({ setLocale, setChangeTextLocalePreference, setTheme, savePalette, t })
  const baseline = useRef<SharedUiPreferences | null>(null), pending = useRef<SharedUiPreferences>({}), generation = useRef(0)
  useEffect(() => {
    const current = { language: locale, changeTextLanguage: changeTextLocalePreference, theme: (theme ?? 'system') as 'system' | 'light' | 'dark', palette }
    latest.current = current
    setters.current = { setLocale, setChangeTextLocalePreference, setTheme, savePalette, t }
    // Start observing before the first read completes, so a user's early change
    // cannot be replaced by that older response.
    if (!baseline.current) { baseline.current = current; return }
    for (const key of Object.keys(current) as (keyof SharedUiPreferences)[]) if (JSON.stringify(current[key]) !== JSON.stringify(baseline.current[key])) {
      Object.assign(pending.current, { [key]: current[key] }); generation.current++
    }
    baseline.current = current
    if (Object.keys(pending.current).length) { document.documentElement.dataset.sharedPreferences = 'pending'; window.dispatchEvent(new Event('lusiad-preferences-dirty')) }
  }, [locale, changeTextLocalePreference, theme, palette, setLocale, setChangeTextLocalePreference, setTheme, savePalette, t])
  useEffect(() => {
    let active = true, busy = false, warned = false
    document.documentElement.dataset.sharedPreferences = 'loading'
    const request = async (patch?: SharedUiPreferences) => {
      const response = await fetch('/api/lusiad/settings', { method: patch ? 'POST' : 'GET', headers: patch ? { 'Content-Type': 'application/json' } : undefined, body: patch ? JSON.stringify(patch) : undefined, cache: 'no-store', signal: AbortSignal.timeout(5000) })
      const body = await response.json()
      if (!response.ok || body.status !== 'ok' || !body.preferences || typeof body.preferences !== 'object') throw new Error()
      return body.preferences as SharedUiPreferences
    }
    const sync = async () => {
      if (busy || !active) return; busy = true
      try {
        const ticket = generation.current
        const patch = pending.current
        let remote = await request(Object.keys(patch).length ? patch : undefined)
        if (!active) return
        if (ticket !== generation.current) return
        const missing: SharedUiPreferences = {}
        for (const key of Object.keys(latest.current) as (keyof SharedUiPreferences)[]) if (remote[key] === undefined) Object.assign(missing, { [key]: latest.current[key] })
        if (Object.keys(missing).length) {
          pending.current = { ...missing, ...pending.current }
          remote = await request(pending.current)
          if (!active || ticket !== generation.current) return
        }
        pending.current = {}
        const next = { ...latest.current, ...remote }
        baseline.current = next
        const controls = setters.current
        if (next.language !== latest.current.language) controls.setLocale(next.language)
        if (next.changeTextLanguage !== latest.current.changeTextLanguage) controls.setChangeTextLocalePreference(next.changeTextLanguage)
        if (next.theme !== latest.current.theme) controls.setTheme(next.theme)
        if (JSON.stringify(next.palette) !== JSON.stringify(latest.current.palette)) controls.savePalette(next.palette)
        document.documentElement.dataset.sharedPreferences = 'ready'
        warned = false
      } catch {
        if (active) document.documentElement.dataset.sharedPreferences = 'unavailable'
        if (active && Object.keys(pending.current).length && !warned) { warned = true; toast({ variant: 'destructive', description: setters.current.t('settings.sharedUnavailable') }) }
        if (!baseline.current) baseline.current = latest.current
      } finally { busy = false }
    }
    void sync()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void sync() }, 2000)
    const release = () => { if (Object.keys(pending.current).length) navigator.sendBeacon('/api/lusiad/settings', new Blob([JSON.stringify(pending.current)], { type: 'application/json' })) }
    window.addEventListener('focus', sync); window.addEventListener('lusiad-preferences-dirty', sync); window.addEventListener('pagehide', release)
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', sync); window.removeEventListener('lusiad-preferences-dirty', sync); window.removeEventListener('pagehide', release); release() }
  }, [])
  return null
}
