import type { PsiNode } from '../../types.ts'
import type { AttributeValues, InsertionDestination, LibraryComponentId } from './component-creation.model.ts'

/** Defaults are hints from the captured PSI, never a relocation or a validation bypass. */
export function creationContextAttributes(id: LibraryComponentId, tree: PsiNode, source: string, destination: InsertionDestination): AttributeValues {
  if (id !== 'constructor-declaration') return {}
  const line = destination.lineEnd ?? destination.line
  const lines = source.split('\n')
  const offset = lines.slice(0, line - 1).reduce((sum, text) => sum + text.length + 1, 0) + (destination.column ?? 1) - 1
  let owner: PsiNode | undefined
  function visit(node: PsiNode) {
    if (node.startOffset === undefined || node.endOffset === undefined || offset <= node.startOffset || offset >= node.endOffset) return
    if (node.type === 'PsiClassImpl') owner = node
    for (const child of node.children ?? []) visit(child)
  }
  visit(tree)
  if (!owner) return {}
  const children = owner.children ?? []
  if (!children.some(child => ['class', 'record', 'enum'].includes(child.text ?? ''))) return {}
  const name = children.find(child => child.type === 'PsiIdentifierImpl')?.text
  return name ? { name } : {}
}
