"use client"

import { useI18n } from "@/lib/i18n/locale-provider"
import { LINE_HEIGHT_REM } from "@/lib/models/model-editor/model-canvas.model"
import type { CanvasInsertionPreview as Preview } from "@/lib/models/model-editor/canvas-insertion-preview.model"

/** A passive visual layer; the saved canvas and its hit-test origin stay underneath. */
export function CanvasInsertionPreview({ preview }: { preview: Preview }) {
  const { t } = useI18n()
  const { highlight } = preview
  return <div data-testid="canvas-insertion-preview" data-component-id={preview.componentId} data-mode={preview.destination.mode}
    data-target-line={preview.destination.line} data-insert-offset={preview.offset} data-state="visual-only" role="img" aria-label={t('editor.insertionPreview')}
    className="pointer-events-none absolute inset-0 z-[4000] font-mono text-sm" style={{ lineHeight: `${LINE_HEIGHT_REM}rem` }}>
    <div aria-hidden="true" className="absolute inset-0 z-0">
      {preview.boxes.map(box => <div key={box.id} data-testid="canvas-preview-box" className="canvas-preview-existing absolute rounded-none border border-r-4"
        style={{ top: `${box.topRem}rem`, left: `${box.leftCh}ch`, width: `${box.widthCh}ch`, height: `${box.heightRem}rem`, zIndex: box.depth }} />)}
    </div>
    <div data-testid="canvas-drop-guide" aria-hidden="true" className="canvas-drop absolute inset-x-0 z-[1] border-t-2 border-dashed" style={{ top: `${preview.firstLine * LINE_HEIGHT_REM}rem` }} />
    <div data-testid="canvas-insertion-highlight" aria-hidden="true" className="canvas-drop absolute z-[1] rounded-none border border-dashed border-r-4"
      style={{ top: `${highlight.topRem}rem`, left: `${highlight.leftCh}ch`, width: `${highlight.widthCh}ch`, height: `${highlight.heightRem}rem` }} />
    <pre data-testid="canvas-insertion-text" aria-hidden="true" className="relative z-[2] m-0 whitespace-pre font-mono text-sm" style={{ lineHeight: `${LINE_HEIGHT_REM}rem` }}>
      <span className="text-muted-foreground">{preview.before}</span><span data-testid="canvas-insertion-component" className="font-medium text-foreground">{preview.component}</span><span data-testid="canvas-insertion-after" className="text-muted-foreground">{preview.after}</span>
    </pre>
  </div>
}
