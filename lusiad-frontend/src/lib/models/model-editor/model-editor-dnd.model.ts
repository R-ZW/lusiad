/** MIME type usado para drag de snippets da biblioteca para o canvas. */
export const EXAMPLE_DRAG_MIME_TYPE = "application/x-model-editor"
/** Dragover cannot read protected payload data. This type identifies a local catalogue template. */
export const LIBRARY_PREVIEW_MIME_PREFIX = "application/x-lusiad-component-"
/** MIME type usado para drag de movimentacao de nos existentes no canvas. */
export const MOVE_DRAG_MIME_TYPE = "application/x-model-editor-move"

/** Payload serializado no DataTransfer para criacao por drag-and-drop. */
export interface LibraryDragPayload {
  id?: string
  label?: string
  formalName?: string
  content?: string
}

/** Payload serializado no DataTransfer para mover um no PSI existente. */
export interface MoveDragPayload {
  sourceId?: string
  type?: string
  startOffset?: number
  endOffset?: number
}
