'use client'

import * as React from 'react'
import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
} from 'next-themes'
import { DEFAULT_PALETTE, PALETTE_STORAGE_KEY, THEME_STORAGE_KEY, paletteVariables, parsePalette, type PalettePreference } from '@/lib/appearance'

const PaletteContext = React.createContext<{
  palette: PalettePreference; savePalette: (value: PalettePreference) => void; persisted: boolean
} | null>(null)
function applyPalette(value: PalettePreference) {
  for (const [key, color] of Object.entries(paletteVariables(value))) document.documentElement.style.setProperty(key, color)
  document.documentElement.dataset.blockPalette = value.preset
}
function PaletteProvider({ children }: { children: React.ReactNode }) {
  const [palette, setPalette] = React.useState<PalettePreference>(() => {
    try { return typeof window === 'undefined' ? DEFAULT_PALETTE : parsePalette(localStorage.getItem(PALETTE_STORAGE_KEY)) }
    catch { return DEFAULT_PALETTE }
  })
  const [persisted, setPersisted] = React.useState(true)
  React.useEffect(() => {
    applyPalette(palette)
    const changed = (event: StorageEvent) => {
      if (event.key !== PALETTE_STORAGE_KEY && event.key !== null) return
      const value = parsePalette(event.newValue); applyPalette(value); setPalette(value)
    }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [palette])
  const savePalette = React.useCallback((value: PalettePreference) => {
    applyPalette(value); setPalette(value)
    try { localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(value)); setPersisted(true) }
    catch { setPersisted(false) }
  }, [])
  return <PaletteContext.Provider value={{ palette, savePalette, persisted }}>{children}</PaletteContext.Provider>
}
export function useBlockPalette() {
  const context = React.useContext(PaletteContext)
  if (!context) throw new Error('Palette provider is unavailable')
  return context
}
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider attribute="class" defaultTheme="system" enableSystem storageKey={THEME_STORAGE_KEY} disableTransitionOnChange {...props}>
    <PaletteProvider>{children}</PaletteProvider>
  </NextThemesProvider>
}
