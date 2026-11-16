import {
  buildSnippetDragTransferFeature,
  listLibrarySnippetsFeature,
  type ComponentsPanelDragTransferData,
} from "@/features/model-editor/components-panel.feature"
import type { LibrarySnippet, LibrarySnippetGroup } from "@/lib/models/model-editor/components-panel.model"

/** Retorna snippets disponiveis para exibicao no ComponentsPanel. */
export function listLibrarySnippetsController(): LibrarySnippetGroup[] {
  return listLibrarySnippetsFeature()
}

/**
 * Valida o snippet e devolve dados de drag prontos para o DataTransfer.
 */
export function buildSnippetDragTransferController(snippet: LibrarySnippet): ComponentsPanelDragTransferData {
  // Evita iniciar drag de item invalido sem conteudo util.
  if (!snippet.content) {
    throw new Error("Nao foi possivel arrastar snippet: conteudo vazio")
  }

  return buildSnippetDragTransferFeature(snippet)
}
