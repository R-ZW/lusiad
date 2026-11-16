"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  formatDateTime,
  formatTime,
  CHANGE_TEXT_LOCALE_STORAGE_KEY,
  LOCALE_COOKIE_NAME,
  LOCALE_STORAGE_KEY,
  isChangeTextLocalePreference,
  isAppLocale,
  resolveChangeTextLocale,
  resolveLocale,
  translate,
  translatePlural,
  type AppLocale,
  type ChangeTextLocalePreference,
  type MessageValues,
} from "./core"
import type { MessageKey } from "./messages"

interface I18nContextValue {
  locale: AppLocale
  setLocale: (locale: AppLocale) => void
  changeTextLocale: AppLocale
  changeTextLocalePreference: ChangeTextLocalePreference
  setChangeTextLocalePreference: (preference: ChangeTextLocalePreference) => void
  t: (key: MessageKey, values?: MessageValues) => string
  tp: (key: string, count: number, values?: MessageValues) => string
  dateTime: (value: Date | string | number) => string
  time: (value: Date | string | number) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function LocaleProvider({ initialLocale, children }: { initialLocale: AppLocale; children: ReactNode }) {
  const router = useRouter()
  const [locale, setLocaleState] = useState<AppLocale>(() => resolveLocale(initialLocale))
  const [changeTextLocalePreference, setChangeTextLocalePreferenceState] = useState<ChangeTextLocalePreference>("interface")

  const setLocale = useCallback((nextLocale: AppLocale) => {
    const resolved = resolveLocale(nextLocale)
    setLocaleState(resolved)
    document.documentElement.lang = resolved
    window.localStorage.setItem(LOCALE_STORAGE_KEY, resolved)
    document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(resolved)}; Path=/; Max-Age=31536000; SameSite=Lax`
    router.refresh()
  }, [router])

  const setChangeTextLocalePreference = useCallback((preference: ChangeTextLocalePreference) => {
    const resolvedPreference = isChangeTextLocalePreference(preference) ? preference : "interface"
    setChangeTextLocalePreferenceState(resolvedPreference)
    window.localStorage.setItem(CHANGE_TEXT_LOCALE_STORAGE_KEY, resolvedPreference)
  }, [])

  useEffect(() => {
    const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    if (isAppLocale(storedLocale) && storedLocale !== locale) {
      setLocale(storedLocale)
    }
  }, [locale, setLocale])

  useEffect(() => {
    const storedPreference = window.localStorage.getItem(CHANGE_TEXT_LOCALE_STORAGE_KEY)
    if (isChangeTextLocalePreference(storedPreference)) {
      setChangeTextLocalePreferenceState(storedPreference)
    }
  }, [])

  const changeTextLocale = resolveChangeTextLocale(changeTextLocalePreference, locale)

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    changeTextLocale,
    changeTextLocalePreference,
    setChangeTextLocalePreference,
    t: (key, values) => translate(locale, key, values),
    tp: (key, count, values) => translatePlural(locale, key, count, values),
    dateTime: (input) => formatDateTime(locale, input),
    time: (input) => formatTime(locale, input),
  }), [changeTextLocale, changeTextLocalePreference, locale, setChangeTextLocalePreference, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) throw new Error("useI18n must be used inside LocaleProvider")
  return context
}
