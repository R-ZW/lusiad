"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  buildSnippetDragTransferController,
  listLibrarySnippetsController,
} from "@/controllers/model-editor/components-panel.controller"
import type { LibrarySnippet, LibrarySnippetGroup } from "@/lib/models/model-editor/components-panel.model"
import { LIBRARY_PREVIEW_MIME_PREFIX } from "@/lib/models/model-editor/model-editor-dnd.model"
import { LIBRARY_FAVORITES_STORAGE_KEY, parseLibraryFavorites, toggleLibraryFavorite } from "@/lib/models/model-editor/library-favorites.model"
import type { LibraryComponentId } from "@/lib/models/model-editor/component-creation.model"
import { useI18n } from "@/lib/i18n/locale-provider"
import { toast } from "@/hooks/use-toast"

const FAVORITES_CHANGED = 'lusiad:library-favorites'

/** Contrato de estado/handlers usado pelo componente ComponentsPanel. */
export interface UseComponentsPanelInteractionsResult {
  groups: LibrarySnippetGroup[]
  favoriteIds: LibraryComponentId[]
  favoritesReady: boolean
  toggleFavorite: (id: LibraryComponentId) => void
  handleDragStart: (event: React.DragEvent<HTMLDivElement>, snippet: LibrarySnippet) => void
}

/**
 * Centraliza as interacoes do ComponentsPanel para manter o JSX focado em render.
 */
export function useComponentsPanelInteractions(): UseComponentsPanelInteractionsResult {
  const { t } = useI18n()
  // Catalogo estatico: memoizado para manter referencia estavel entre renders.
  const groups = useMemo(() => listLibrarySnippetsController(), [])
  const [favoriteIds, setFavoriteIds] = useState<LibraryComponentId[]>([])
  const [favoritesReady, setFavoritesReady] = useState(false)
  useEffect(() => {
    const read = () => {
      try { setFavoriteIds(parseLibraryFavorites(localStorage.getItem(LIBRARY_FAVORITES_STORAGE_KEY))) }
      catch { /* The panel remains usable if browser storage is blocked. */ }
      setFavoritesReady(true)
    }
    const storage = (event: StorageEvent) => { if (event.key === null || event.key === LIBRARY_FAVORITES_STORAGE_KEY) read() }
    read()
    window.addEventListener('storage', storage)
    window.addEventListener(FAVORITES_CHANGED, read)
    return () => { window.removeEventListener('storage', storage); window.removeEventListener(FAVORITES_CHANGED, read) }
  }, [])
  const toggleFavorite = useCallback((id: LibraryComponentId) => {
    if (!favoritesReady) return
    try {
      const next = toggleLibraryFavorite(parseLibraryFavorites(localStorage.getItem(LIBRARY_FAVORITES_STORAGE_KEY)), id)
      localStorage.setItem(LIBRARY_FAVORITES_STORAGE_KEY, JSON.stringify({ version: 1, ids: next }))
      setFavoriteIds(next)
      window.dispatchEvent(new Event(FAVORITES_CHANGED))
    } catch {
      setFavoriteIds(previous => toggleLibraryFavorite(previous, id))
      toast({ description: t('library.favoritesSessionOnly') })
    }
  }, [favoritesReady, t])

  /** Preenche o DataTransfer quando o usuario inicia drag de um snippet. */
  const handleDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, snippet: LibrarySnippet) => {
    try {
      const transferData = buildSnippetDragTransferController(snippet)
      event.dataTransfer.setData(transferData.mimeType, transferData.payload)
      event.dataTransfer.setData(LIBRARY_PREVIEW_MIME_PREFIX + snippet.id, snippet.id)
      event.dataTransfer.effectAllowed = transferData.effectAllowed
    } catch (error) {
      // Erro nao bloqueia a UI; apenas registra para depuracao local.
      const message = error instanceof Error ? error.message : "Erro ao iniciar drag do snippet"
      console.warn(message)
    }
  }, [])

  return {
    groups,
    favoriteIds, favoritesReady, toggleFavorite,
    handleDragStart,
  }
}
