"use server"

import { backendAction } from '@/lib/services/backend-action'
import { parseJavaSource } from '@/lib/services/model-comparison/model-comparison.service'
import { renderLeafTextContent } from '@/lib/models/model-editor/model-tree.model'
import { locateStructuredForm } from '@/lib/models/model-editor/component-edit.model'

/** Read-only analysis of the exact draft in its file context; no VFS, formatter, disk or SQL writes. */
export async function inspectComponentDraftController(projectId: number, path: string, context: string, start: number, end: number, draft: string) {
  return backendAction(async () => {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > context.length
        || [context, draft].some(value => value.includes('\r'))) throw new Error('Invalid draft context')
    const proposed = context.slice(0, start) + draft + context.slice(end)
    const model = await parseJavaSource(projectId, path, proposed)
    if (renderLeafTextContent(model.tree) !== proposed) throw new Error('PSI source differs from draft')
    return { form: locateStructuredForm(model.tree, proposed, start, start + draft.length) }
  })
}
