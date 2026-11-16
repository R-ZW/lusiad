import { EXAMPLE_DRAG_MIME_TYPE } from "@/lib/models/model-editor/model-editor-dnd.model"
import {
  buildLibraryDragPayloadModel,
  listLibrarySnippetsModel,
  type LibrarySnippetGroup,
  type LibrarySnippet,
} from "@/lib/models/model-editor/components-panel.model"

/** Contrato final usado para preencher o DataTransfer no drag start. */
export interface ComponentsPanelDragTransferData {
  mimeType: string
  payload: string
  effectAllowed: "copy"
}

/** Expone os snippets disponiveis para a camada de controller/interactions. */
export function listLibrarySnippetsFeature(): LibrarySnippetGroup[] {
  return listLibrarySnippetsModel()
}

/**
 * Monta os dados de transferencia do drag no formato esperado pelo navegador.
 */
export function buildSnippetDragTransferFeature(snippet: LibrarySnippet): ComponentsPanelDragTransferData {
  return {
    mimeType: EXAMPLE_DRAG_MIME_TYPE,
    // DataTransfer aceita string; por isso serializamos o payload como JSON.
    payload: JSON.stringify(buildLibraryDragPayloadModel(snippet)),
    effectAllowed: "copy",
  }
}
