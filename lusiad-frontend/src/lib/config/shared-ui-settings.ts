import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { configFilePath, readSharedConfig } from './operational-config.ts'
import { BLOCK_GROUPS, type PalettePreference, validColor } from '../appearance.ts'
import type { AppLocale, ChangeTextLocalePreference } from '../i18n/core'

export interface SharedUiPreferences { language?: AppLocale; changeTextLanguage?: ChangeTextLocalePreference; theme?: 'light' | 'dark' | 'system'; palette?: PalettePreference }
export function validatePreferences(value: unknown): SharedUiPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid preferences')
  const result: SharedUiPreferences = {}
  for (const [key, field] of Object.entries(value)) {
    switch (key) {
      case 'language': if (field !== 'pt-BR' && field !== 'en') throw new Error('Invalid language'); result.language = field; break
      case 'changeTextLanguage': if (typeof field !== 'string' || !['interface', 'pt-BR', 'en'].includes(field)) throw new Error('Invalid language'); result.changeTextLanguage = field as ChangeTextLocalePreference; break
      case 'theme': if (typeof field !== 'string' || !['system', 'light', 'dark'].includes(field)) throw new Error('Invalid theme'); result.theme = field as SharedUiPreferences['theme']; break
      case 'palette': {
        const palette = field as PalettePreference
        if (!palette || palette.version !== 1 || !['classic', 'soft', 'monochrome', 'custom'].includes(palette.preset) || !palette.custom || typeof palette.custom !== 'object' || Array.isArray(palette.custom)) throw new Error('Invalid palette')
        for (const [group, color] of Object.entries(palette.custom)) if (!BLOCK_GROUPS.includes(group as typeof BLOCK_GROUPS[number]) || !validColor(color)) throw new Error('Invalid color')
        result.palette = palette; break
      }
      default: throw new Error('Unknown preference')
    }
  }
  return result
}
export function readPreferences(): SharedUiPreferences {
  const file = configFilePath()
  if (existsSync(file) && statSync(file).size > 4 * 1024 * 1024) throw new Error('Configuration exceeds 4 MiB')
  return validatePreferences(readSharedConfig(file).ui ?? {})
}
/** Merge only changed preferences. Never serialize or replace other configuration sections. */
export function savePreferences(input: unknown): SharedUiPreferences {
  if (process.env.LUSIAD_ENV === 'test') throw new Error('Managed test configuration')
  const patch = validatePreferences(input), file = configFilePath()
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const lock = `${file}.lock`, temporary = `${file}.${randomUUID()}.tmp`
  const descriptor = openSync(lock, 'wx', 0o600)
  try {
    if (lstatSync(dirname(file)).isSymbolicLink() || existsSync(file) && lstatSync(file).isSymbolicLink()) throw new Error('Linked configuration is read-only')
    if (existsSync(file) && statSync(file).size > 4 * 1024 * 1024) throw new Error('Configuration exceeds 4 MiB')
    const root = readSharedConfig(file)
    const merged = validatePreferences({ ...validatePreferences(root.ui ?? {}), ...patch })
    const bytes = JSON.stringify({ ...root, ui: merged }, null, 2) + '\n'
    if (Buffer.byteLength(bytes) > 4 * 1024 * 1024) throw new Error('Configuration exceeds 4 MiB')
    writeFileSync(temporary, bytes, { flag: 'wx', mode: existsSync(file) ? statSync(file).mode & 0o777 : 0o600 })
    // Keep the config private; the contents (including the internal API token) never leave the server.
    if (existsSync(file) && readFileSync(file).length > 4 * 1024 * 1024) throw new Error('Configuration exceeds 4 MiB')
    renameSync(temporary, file)
    return merged
  } finally { if (existsSync(temporary)) unlinkSync(temporary); closeSync(descriptor); unlinkSync(lock) }
}
