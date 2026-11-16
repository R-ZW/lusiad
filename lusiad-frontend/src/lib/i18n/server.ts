import "server-only"

import { cookies } from "next/headers"
import { LOCALE_COOKIE_NAME, resolveLocale, translate, translatePlural, type MessageValues } from "./core"
import type { MessageKey } from "./messages"

export async function getServerLocale() {
  const store = await cookies()
  return resolveLocale(store.get(LOCALE_COOKIE_NAME)?.value)
}

export async function getServerI18n() {
  const locale = await getServerLocale()
  return {
    locale,
    t: (key: MessageKey, values?: MessageValues) => translate(locale, key, values),
    tp: (key: string, count: number, values?: MessageValues) => translatePlural(locale, key, count, values),
  }
}
