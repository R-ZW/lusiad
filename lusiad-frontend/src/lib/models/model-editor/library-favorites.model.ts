import { listLibrarySnippetsModel } from './components-panel.model.ts'
import type { LibraryComponentId } from './component-creation.model.ts'

/** Personal shortcuts in this browser, across projects; not operational/server configuration. */
export const LIBRARY_FAVORITES_STORAGE_KEY = 'lusiad-library-favorites'
const known = new Set(listLibrarySnippetsModel().flatMap(group => group.snippets.map(snippet => snippet.id)))
export function parseLibraryFavorites(raw: string | null): LibraryComponentId[] {
  try {
    const value: unknown = JSON.parse(raw ?? 'null')
    if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('ids' in value) || !Array.isArray(value.ids)) return []
    return [...new Set(value.ids.filter((id): id is LibraryComponentId => typeof id === 'string' && known.has(id as LibraryComponentId)))]
  } catch { return [] }
}
export function toggleLibraryFavorite(ids: LibraryComponentId[], id: LibraryComponentId): LibraryComponentId[] {
  if (!known.has(id)) return ids
  return ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]
}
