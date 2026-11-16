import { messageCatalogs, type MessageKey } from "./messages.ts"

export const SUPPORTED_LOCALES = ["pt-BR", "en"] as const
export const DEFAULT_LOCALE: AppLocale = "pt-BR"
export const LOCALE_COOKIE_NAME = "lusiad-locale"
export const LOCALE_STORAGE_KEY = "lusiad.locale"
export const CHANGE_TEXT_LOCALE_STORAGE_KEY = "lusiad.change-text-locale"

export type AppLocale = (typeof SUPPORTED_LOCALES)[number]
export type ChangeTextLocalePreference = AppLocale | "interface"
export type MessageValues = Record<string, string | number>

export interface LocalizedMessage {
  code: string
  params?: MessageValues
  fallback?: string
}

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && SUPPORTED_LOCALES.includes(value as AppLocale)
}

export function resolveLocale(value: unknown): AppLocale {
  return isAppLocale(value) ? value : DEFAULT_LOCALE
}

export function isChangeTextLocalePreference(value: unknown): value is ChangeTextLocalePreference {
  return value === "interface" || isAppLocale(value)
}

export function resolveChangeTextLocale(
  preference: unknown,
  interfaceLocale: AppLocale
): AppLocale {
  return isAppLocale(preference) ? preference : interfaceLocale
}

function interpolate(template: string, values?: MessageValues): string {
  if (!values) return template
  return template.replace(/\{([\w.]+)\}/g, (placeholder, name: string) => {
    const value = values[name]
    return value === undefined ? placeholder : String(value)
  })
}

export function translate(locale: AppLocale, key: MessageKey, values?: MessageValues): string {
  return interpolate(messageCatalogs[locale][key] ?? messageCatalogs[DEFAULT_LOCALE][key] ?? key, values)
}

export function translatePlural(
  locale: AppLocale,
  key: string,
  count: number,
  values: MessageValues = {}
): string {
  const category = new Intl.PluralRules(locale).select(count)
  const exactKey = `${key}.${category}` as MessageKey
  const fallbackKey = `${key}.other` as MessageKey
  const catalog = messageCatalogs[locale] as Record<string, string>
  const fallbackCatalog = messageCatalogs[DEFAULT_LOCALE] as Record<string, string>
  const template = catalog[exactKey] ?? catalog[fallbackKey] ?? fallbackCatalog[exactKey] ?? fallbackCatalog[fallbackKey] ?? key
  return interpolate(template, { ...values, count })
}

export function resolveLocalizedMessage(locale: AppLocale, message: LocalizedMessage): string {
  const translated = (messageCatalogs[locale] as Record<string, string>)[message.code]
  if (!translated && message.fallback) return message.fallback
  return interpolate(translated ?? message.fallback ?? message.code, message.params)
}

export function formatDateTime(locale: AppLocale, value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "--"
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date)
}

export function formatTime(locale: AppLocale, value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "--:--"
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date)
}
