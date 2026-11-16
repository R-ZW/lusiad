'use client'

import { useState } from 'react'
import { useTheme } from 'next-themes'
import { useBlockPalette } from './theme-provider'
import { useI18n } from '@/lib/i18n/locale-provider'
import { BLOCK_GROUPS, DEFAULT_PALETTE, THEME_STORAGE_KEY, changeBlockColor, paletteColors, type PalettePreset } from '@/lib/appearance'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Feedback } from './ui/feedback'
import { SettingsHelp } from './ui/settings-help'
import { SunMoon, Palette, RotateCcw } from 'lucide-react'

export function AppearanceSettings() {
  const { t } = useI18n()
  const { theme, resolvedTheme, setTheme } = useTheme()
  const { palette, savePalette, persisted } = useBlockPalette()
  const [modePersisted, setModePersisted] = useState(true)
  const colors = paletteColors(palette)
  return <section data-testid="theme-settings" data-mode={theme ?? 'system'} data-resolved={resolvedTheme ?? 'light'} className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2">
      <div className="flex items-center gap-2"><SunMoon className="size-4 text-muted-foreground" /><Label htmlFor="appearance-mode" className="flex-1">{t('appearance.mode')}</Label><SettingsHelp label={t('appearance.mode')}>{t('appearance.saved')}</SettingsHelp></div>
      <select id="appearance-mode" data-testid="theme-mode" className="w-full rounded-md border border-input bg-background px-3 text-foreground" value={theme ?? 'system'} disabled={!theme} onChange={event => {
        const value = event.target.value; setTheme(value)
        try { setModePersisted(localStorage.getItem(THEME_STORAGE_KEY) === value) } catch { setModePersisted(false) }
      }}>
        <option value="light">{t('appearance.light')}</option><option value="dark">{t('appearance.dark')}</option><option value="system">{t('appearance.system')}</option>
      </select>
    </div>
    <div className="space-y-2">
      <div className="flex items-center gap-2"><Palette className="size-4 text-muted-foreground" /><Label htmlFor="appearance-palette" className="flex-1">{t('appearance.palette')}</Label><SettingsHelp label={t('appearance.palette')}>{t('appearance.paletteHelp')} {t('appearance.contrastHelp')} {t('appearance.umlPaper')}</SettingsHelp></div>
      <select id="appearance-palette" data-testid="theme-palette" className="w-full rounded-md border border-input bg-background px-3 text-foreground" value={palette.preset} onChange={event => savePalette({ ...palette, preset: event.target.value as PalettePreset })}>
        <option value="classic">{t('appearance.classic')}</option><option value="soft">{t('appearance.soft')}</option><option value="monochrome">{t('appearance.monochrome')}</option><option value="custom">{t('appearance.custom')}</option>
      </select>
    </div></div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {BLOCK_GROUPS.map(group => <div key={group} className="flex items-center gap-2">
        <Input id={`block-color-${group}`} data-testid={`theme-color-${group}`} type="color" className="h-9 w-12 shrink-0 cursor-pointer p-1" value={colors[group]} onChange={event => savePalette(changeBlockColor(palette, group, event.target.value))} />
        <div className="min-w-0"><Label htmlFor={`block-color-${group}`} className="text-xs">{t(`appearance.group.${group}`)}</Label><p className="font-mono text-xs text-muted-foreground">{colors[group]}</p></div>
      </div>)}
    </div>
    <Button data-testid="theme-palette-reset" size="sm" variant="outline" onClick={() => savePalette(DEFAULT_PALETTE)}><RotateCcw className="size-4" />{t('appearance.reset')}</Button>
    {(!persisted || !modePersisted) && <Feedback tone="warning">{t('appearance.unsaved')}</Feedback>}
  </section>
}
