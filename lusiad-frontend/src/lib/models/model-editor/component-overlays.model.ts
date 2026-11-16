import type { PsiNode } from '../../types.ts'
import { libraryComponentForNode } from './component-edit.model.ts'
import { isDescendantPath, type BoxOverlay } from './model-canvas.model.ts'

const related = (a: BoxOverlay, b: BoxOverlay) => a.nodePath === b.nodePath
  || isDescendantPath(a.nodePath, b.nodePath) || isDescendantPath(b.nodePath, a.nodePath)
const ranged = (o: BoxOverlay) => Number.isSafeInteger(o.node.startOffset) && Number.isSafeInteger(o.node.endOffset)
  && o.node.endOffset! > o.node.startOffset!
const sameRange = (a: BoxOverlay, b: BoxOverlay) => ranged(a) && ranged(b)
  && a.node.startOffset === b.node.startOffset && a.node.endOffset === b.node.endOffset

/** One action owner per coincident PSI wrapper chain. Distinct code ranges remain independent. */
export function canonicalInteractionOverlays(input: BoxOverlay[]): BoxOverlay[] {
  const ranges = new Map<string, BoxOverlay[]>()
  for (const overlay of input) {
    if (!ranged(overlay)) continue // Missing/ambiguous ranges must not be guessed from line geometry.
    const key = `${overlay.node.startOffset}:${overlay.node.endOffset}`
    const owners = ranges.get(key) ?? []
    const index = owners.findIndex(owner => related(owner, overlay))
    if (index < 0) owners.push(overlay)
    else {
      const owner = owners[index]
      const known = libraryComponentForNode(overlay.node) !== null, previousKnown = libraryComponentForNode(owner.node) !== null
      // Prefer a semantic component over transparent wrappers. Equal-priority
      // candidates retain the previous deepest-node selection convention.
      if ((known && !previousKnown) || (known === previousKnown && overlay.depth > owner.depth)) owners[index] = overlay
    }
    ranges.set(key, owners)
  }
  const winners = new Set([...ranges.values()].flat())
  return input.filter(overlay => !ranged(overlay) || winners.has(overlay))
}

/** Selection can arrive from breadcrumbs/diagnostics on a wrapper in the current tree. */
export function selectedInteractionOverlay(original: BoxOverlay[], canonical: BoxOverlay[], selected: PsiNode | null): BoxOverlay | undefined {
  if (!selected) return undefined
  const current = original.find(overlay => overlay.node === selected)
  if (!current) return undefined // Never attach a selection from an earlier model by offset alone.
  return canonical.find(overlay => overlay === current || sameRange(overlay, current) && related(overlay, current))
}
