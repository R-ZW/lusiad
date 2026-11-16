export function historyLimit(value = 250): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 2000) throw new Error('Invalid history page size')
  return value
}

export function historyCursor(value?: number): number | undefined {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) throw new Error('Invalid history cursor')
  return value
}

/** IDs express recorded/replay order; dates are presentation data, including ties or clock changes. */
export function compareHistoryIds(a: { id: string | number }, b: { id: string | number }): number {
  return Number(String(a.id).replace(/^commit-/, '')) - Number(String(b.id).replace(/^commit-/, ''))
}
