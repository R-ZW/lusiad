import type { PsiNode } from "@/lib/types"

export interface SemanticToken {
  key: string
  node: PsiNode
}

export interface TokenComparison {
  beforeMatched: Set<number>
  afterMatched: Set<number>
}

export interface ModelComparison extends TokenComparison {
  beforeTokens: SemanticToken[]
  afterTokens: SemanticToken[]
  beforeUnpaired: WeakSet<PsiNode>
  afterUnpaired: WeakSet<PsiNode>
  beforeModified: WeakSet<PsiNode>
  afterModified: WeakSet<PsiNode>
  beforeCounterparts: WeakMap<PsiNode, PsiNode>
  afterCounterparts: WeakMap<PsiNode, PsiNode>
}

export interface ModelOutlineNode {
  id: string
  type: string
  label: string
  status: "same" | "added" | "removed" | "context"
  changedCount: number
  children: ModelOutlineNode[]
}

export interface CanvasDiffSegment {
  id: string
  type: string
  text: string
  changed: boolean
}

export interface CanvasDiff {
  segments: CanvasDiffSegment[]
  fullyChangedNodes: WeakSet<PsiNode>
  partiallyChangedNodes: WeakSet<PsiNode>
}

export interface CanvasOverlay {
  nodePath: string
  node: PsiNode
}

export interface CanvasHighlights {
  overlayStatus: Map<string, "complete" | "partial">
  coveredSegments: Set<string>
}

export interface CanvasComparisonContext {
  counterparts: WeakMap<PsiNode, PsiNode>
  counterpartOverlays: CanvasOverlay[]
}

function children(node: PsiNode): PsiNode[] {
  return Array.isArray(node.children) ? node.children.filter(Boolean) : []
}

function sourceText(node: PsiNode): string {
  const nested = children(node)
  return nested.length ? nested.map(sourceText).join("") : node.text ?? ""
}

function isTrivia(node: PsiNode): boolean {
  return /WhiteSpace/.test(node.type) || !node.text?.trim()
}

function contextualName(node: PsiNode, source: string): string | null {
  const type = node.type
  const classifier = /^Psi(Class|Interface|Enum|Record)(Impl)?$/.test(type)
  const method = /^Psi(Method|AnnotationMethod)(Impl)?$/.test(type)
  const switchLabel = /^PsiSwitch(Label|LabeledRule)Statement(Impl)?$/.test(type)
  if (!classifier && !method && !switchLabel) return null
  const text = source.slice(node.startOffset ?? 0, node.endOffset ?? source.length)
  if (classifier) {
    const match = /\b(class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/.exec(text)
    return match ? `${match[1]}:${match[2]}` : null
  }
  if (method) {
    const header = text.slice(0, text.indexOf("{") >= 0 ? text.indexOf("{") : text.length)
    const match = [...header.matchAll(/([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g)].at(-1)
    return match ? `method:${match[1]}(${match[2].replace(/\s+/g, "")})` : null
  }
  const label = text.slice(0, Math.max(0, Math.min(...[text.indexOf("->"), text.indexOf(":")].filter((index) => index >= 0), 80)))
  return `case:${label.replace(/\s+/g, " ").trim()}`
}

/** Lexical PSI leaves, excluding formatting whitespace but retaining literals and comments. */
export function semanticTokens(root: PsiNode): SemanticToken[] {
  const source = sourceText(root)
  const result: SemanticToken[] = []
  function visit(node: PsiNode, context: string[]) {
    const nested = children(node)
    if (nested.length) {
      // The PSI ancestry is part of a token's identity. This prevents a brace
      // in one component from matching a brace in an unrelated component.
      const own = contextualName(node, source)
      const nextContext = [...context, `${node.type}:${own ?? ""}`]
      nested.forEach((child) => visit(child, nextContext))
    } else if (!isTrivia(node)) {
      result.push({ key: `${context.join("/")}\0${node.type}\0${node.text}`, node })
    }
  }
  visit(root, [])
  return result
}

/** Myers sequence comparison; identical tokens remain matched in order. */
export function compareSemanticTokens(before: SemanticToken[], after: SemanticToken[]): TokenComparison {
  const beforeMatched = new Set<number>()
  const afterMatched = new Set<number>()
  const n = before.length
  const m = after.length
  const trace: Array<Map<number, number>> = []
  const frontier = new Map<number, number>([[1, 0]])
  let foundDepth = 0

  outer: for (let depth = 0; depth <= n + m; depth++) {
    trace.push(new Map(frontier))
    for (let diagonal = -depth; diagonal <= depth; diagonal += 2) {
      const down = frontier.get(diagonal + 1) ?? -1
      const right = frontier.get(diagonal - 1) ?? -1
      let x = diagonal === -depth || (diagonal !== depth && right < down) ? down : right + 1
      let y = x - diagonal
      while (x < n && y < m && before[x].key === after[y].key) { x++; y++ }
      frontier.set(diagonal, x)
      if (x >= n && y >= m) { foundDepth = depth; break outer }
    }
  }

  let x = n
  let y = m
  for (let depth = foundDepth; depth >= 0; depth--) {
    const prior = trace[depth]
    const diagonal = x - y
    const down = prior.get(diagonal + 1) ?? -1
    const right = prior.get(diagonal - 1) ?? -1
    const priorDiagonal = diagonal === -depth || (diagonal !== depth && right < down)
      ? diagonal + 1 : diagonal - 1
    const priorX = prior.get(priorDiagonal) ?? 0
    const priorY = priorX - priorDiagonal
    while (x > priorX && y > priorY) {
      beforeMatched.add(--x)
      afterMatched.add(--y)
    }
    if (depth > 0) {
      if (x === priorX) y--
      else x--
    }
  }
  return { beforeMatched, afterMatched }
}

interface ExactComponent {
  node: PsiNode
  signature: string
  start: number
  end: number
}

interface ComponentAnalysis {
  exact: ExactComponent[]
  signatures: WeakMap<PsiNode, string>
}

/** Canonical PSI subtrees omit formatting but retain node types and token order. */
function analyzeComponents(root: PsiNode): ComponentAnalysis {
  const components: ExactComponent[] = []
  const signatures = new WeakMap<PsiNode, string>()
  let tokenIndex = 0

  function visit(node: PsiNode): { signature: string; meaningful: boolean } {
    const nested = children(node)
    if (!nested.length) {
      if (isTrivia(node)) return { signature: "", meaningful: false }
      tokenIndex++
      return {
        signature: JSON.stringify([node.type, node.text ?? ""]),
        meaningful: /[\p{L}\p{N}_$]/u.test(node.text ?? ""),
      }
    }

    const start = tokenIndex
    const parts = nested.map(visit)
    const signature = JSON.stringify([node.type, ...parts.map((part) => part.signature).filter(Boolean)])
    signatures.set(node, signature)
    const meaningful = parts.some((part) => part.meaningful)
    // Punctuation-only wrappers are not useful components: matching their
    // braces across unrelated constructs would hide a real replacement.
    if (tokenIndex - start >= 2 && meaningful) {
      components.push({ node, signature, start, end: tokenIndex })
    }
    return { signature, meaningful }
  }

  visit(root)
  return { exact: components.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start), signatures }
}

interface StructuralEntry {
  node: PsiNode
  key: string
  signature: string
}

function structuralEntries(root: PsiNode, signatures: WeakMap<PsiNode, string>): StructuralEntry[] {
  const source = sourceText(root)
  const entries: StructuralEntry[] = []
  function visit(node: PsiNode, ancestry: string[]) {
    const nested = children(node)
    if (!nested.length) return
    const path = [...ancestry, JSON.stringify([node.type, contextualName(node, source)])]
    entries.push({ node, key: JSON.stringify(path), signature: signatures.get(node) ?? "" })
    nested.forEach((child) => visit(child, path))
  }
  visit(root, [])
  return entries
}

/** Pair components with the same structural role, regardless of line number. */
function unpairedStructures(before: StructuralEntry[], after: StructuralEntry[]): {
  beforeUnpaired: WeakSet<PsiNode>; afterUnpaired: WeakSet<PsiNode>
  beforeModified: WeakSet<PsiNode>; afterModified: WeakSet<PsiNode>
  beforeCounterparts: WeakMap<PsiNode, PsiNode>; afterCounterparts: WeakMap<PsiNode, PsiNode>
} {
  const beforeUnpaired = new WeakSet<PsiNode>()
  const afterUnpaired = new WeakSet<PsiNode>()
  const beforeModified = new WeakSet<PsiNode>()
  const afterModified = new WeakSet<PsiNode>()
  const beforeCounterparts = new WeakMap<PsiNode, PsiNode>()
  const afterCounterparts = new WeakMap<PsiNode, PsiNode>()
  const afterByKey = new Map<string, StructuralEntry[]>()
  for (const entry of after) {
    const bucket = afterByKey.get(entry.key) ?? []
    bucket.push(entry)
    afterByKey.set(entry.key, bucket)
  }
  const pairedAfter = new Set<PsiNode>()
  const pairedBefore = new Set<PsiNode>()
  function pair(entry: StructuralEntry, counterpart: StructuralEntry) {
    pairedBefore.add(entry.node)
    pairedAfter.add(counterpart.node)
    beforeCounterparts.set(entry.node, counterpart.node)
    afterCounterparts.set(counterpart.node, entry.node)
    if (entry.signature !== counterpart.signature) {
      beforeModified.add(entry.node)
      afterModified.add(counterpart.node)
    }
  }
  // Exact siblings are paired first, so an insertion before an existing node
  // cannot steal that node's match simply because its position changed.
  for (const entry of before) {
    if (!entry.signature) continue
    const counterpart = afterByKey.get(entry.key)?.find((candidate) =>
      !pairedAfter.has(candidate.node) && candidate.signature === entry.signature)
    if (counterpart) pair(entry, counterpart)
  }
  for (const entry of before) {
    if (pairedBefore.has(entry.node)) continue
    const counterpart = afterByKey.get(entry.key)?.find((candidate) => !pairedAfter.has(candidate.node))
    if (counterpart) pair(entry, counterpart)
    else beforeUnpaired.add(entry.node)
  }
  for (const entry of after) {
    if (!pairedAfter.has(entry.node)) afterUnpaired.add(entry.node)
  }
  return { beforeUnpaired, afterUnpaired, beforeModified, afterModified, beforeCounterparts, afterCounterparts }
}

/**
 * Match complete components globally first, then compare the remaining tokens
 * only within compatible PSI ancestry. Position is not part of component identity.
 */
export function compareModelTrees(beforeRoot: PsiNode | null, afterRoot: PsiNode | null): ModelComparison {
  const beforeTokens = beforeRoot ? semanticTokens(beforeRoot) : []
  const afterTokens = afterRoot ? semanticTokens(afterRoot) : []
  const beforeMatched = new Set<number>()
  const afterMatched = new Set<number>()
  let beforeUnpaired = new WeakSet<PsiNode>()
  let afterUnpaired = new WeakSet<PsiNode>()
  let beforeModified = new WeakSet<PsiNode>()
  let afterModified = new WeakSet<PsiNode>()
  let beforeCounterparts = new WeakMap<PsiNode, PsiNode>()
  let afterCounterparts = new WeakMap<PsiNode, PsiNode>()

  if (beforeRoot && afterRoot) {
    const beforeAnalysis = analyzeComponents(beforeRoot)
    const afterAnalysis = analyzeComponents(afterRoot)
    const beforeComponents = beforeAnalysis.exact
    const afterComponents = afterAnalysis.exact
    const structuralMatches = unpairedStructures(
      structuralEntries(beforeRoot, beforeAnalysis.signatures), structuralEntries(afterRoot, afterAnalysis.signatures))
    beforeUnpaired = structuralMatches.beforeUnpaired
    afterUnpaired = structuralMatches.afterUnpaired
    beforeModified = structuralMatches.beforeModified
    afterModified = structuralMatches.afterModified
    beforeCounterparts = structuralMatches.beforeCounterparts
    afterCounterparts = structuralMatches.afterCounterparts
    function available(component: ExactComponent, matched: Set<number>): boolean {
      for (let index = component.start; index < component.end; index++) {
        if (matched.has(index)) return false
      }
      return true
    }
    const afterBySignature = new Map<string, ExactComponent[]>()
    for (const component of afterComponents) {
      const bucket = afterBySignature.get(component.signature) ?? []
      bucket.push(component)
      afterBySignature.set(component.signature, bucket)
    }

    for (const before of beforeComponents) {
      if (!available(before, beforeMatched)) continue
      const after = afterBySignature.get(before.signature)?.find((candidate) => available(candidate, afterMatched))
      if (!after) continue
      const length = before.end - before.start
      if (length !== after.end - after.start) continue
      for (let index = 0; index < length; index++) {
        beforeMatched.add(before.start + index)
        afterMatched.add(after.start + index)
      }
    }
  }

  if (beforeRoot && !afterRoot) {
    for (const entry of structuralEntries(beforeRoot, analyzeComponents(beforeRoot).signatures)) beforeUnpaired.add(entry.node)
  }
  if (afterRoot && !beforeRoot) {
    for (const entry of structuralEntries(afterRoot, analyzeComponents(afterRoot).signatures)) afterUnpaired.add(entry.node)
  }

  const remainingBefore = beforeTokens.flatMap((token, index) => beforeMatched.has(index) ? [] : [{ token, index }])
  const remainingAfter = afterTokens.flatMap((token, index) => afterMatched.has(index) ? [] : [{ token, index }])
  const remainingMatches = compareSemanticTokens(remainingBefore.map(({ token }) => token), remainingAfter.map(({ token }) => token))
  for (const index of remainingMatches.beforeMatched) beforeMatched.add(remainingBefore[index].index)
  for (const index of remainingMatches.afterMatched) afterMatched.add(remainingAfter[index].index)

  return { beforeTokens, afterTokens, beforeMatched, afterMatched,
    beforeUnpaired, afterUnpaired, beforeModified, afterModified, beforeCounterparts, afterCounterparts }
}

/** The same token matches drive the outline and the read-only visual canvas. */
export function buildCanvasDiff(root: PsiNode, tokens: SemanticToken[], matched: Set<number>,
  unpaired?: WeakSet<PsiNode>, modified?: WeakSet<PsiNode>): CanvasDiff {
  const tokenIndex = new WeakMap<PsiNode, number>()
  tokens.forEach((token, index) => tokenIndex.set(token.node, index))
  const segments: CanvasDiffSegment[] = []
  const fullyChangedNodes = new WeakSet<PsiNode>()
  const partiallyChangedNodes = new WeakSet<PsiNode>()

  function visit(node: PsiNode, path: string): { total: number; changed: number } {
    const nested = children(node)
    if (nested.length === 0) {
      const index = tokenIndex.get(node)
      const changed = index !== undefined && !matched.has(index)
      segments.push({ id: path, type: node.type, text: node.text ?? "", changed })
      if (changed) fullyChangedNodes.add(node)
      return { total: index === undefined ? 0 : 1, changed: changed ? 1 : 0 }
    }
    const counts = nested.map((child, index) => visit(child, `${path}.${index}`))
    const total = counts.reduce((sum, count) => sum + count.total, 0)
    const changed = counts.reduce((sum, count) => sum + count.changed, 0)
    if (changed > 0 && (unpaired?.has(node) || changed === total)) fullyChangedNodes.add(node)
    else if (changed > 0 || modified?.has(node)) partiallyChangedNodes.add(node)
    return { total, changed }
  }

  visit(root, "0")
  return { segments, fullyChangedNodes, partiallyChangedNodes }
}

/**
 * A box owns its inline PSI content. Nested visible boxes have their own colors,
 * so their presence and contents must not change the enclosing box's signature.
 * This uses the actual canvas boundaries, rather than a list of Java constructs.
 */
function boxContentSignature(isBoundary: (node: PsiNode) => boolean): (node: PsiNode) => string {
  const signatures = new WeakMap<PsiNode, string>()
  function signature(node: PsiNode): string {
    const cached = signatures.get(node)
    if (cached !== undefined) return cached
    const nested = children(node)
    const value = nested.length
      ? JSON.stringify([node.type, ...nested.flatMap((child) => {
        if (isBoundary(child)) return []
        const part = signature(child)
        return part ? [part] : []
      })])
      : isTrivia(node) ? "" : JSON.stringify([node.type, node.text ?? ""])
    signatures.set(node, value)
    return value
  }
  return signature
}

/** Color full blocks and only the box that owns a change, independently in each panel. */
export function resolveCanvasHighlights(diff: CanvasDiff, overlays: CanvasOverlay[],
  comparison?: CanvasComparisonContext): CanvasHighlights {
  const overlayStatus = new Map<string, "complete" | "partial">()
  const coveredSegments = new Set<string>()
  const candidates = new Map<string, "complete" | "partial">()

  for (const overlay of overlays) {
    // The file root is context, not a useful addition/removal or modification box.
    if (overlay.nodePath === "0") continue
    if (diff.fullyChangedNodes.has(overlay.node)) candidates.set(overlay.nodePath, "complete")
    else if (diff.partiallyChangedNodes.has(overlay.node)) candidates.set(overlay.nodePath, "partial")
  }

  for (const [path, status] of candidates) {
    if (status === "complete") overlayStatus.set(path, status)
  }

  for (const segment of diff.segments) {
    if (!segment.changed) continue
    let path = segment.id
    let covered = false
    let closest: { path: string; status: "complete" | "partial" } | null = null
    while (path !== "0") {
      const status = candidates.get(path)
      if (status === "complete") covered = true
      if (status && !closest) closest = { path, status }
      path = path.slice(0, path.lastIndexOf("."))
    }
    // A partial class/method stays neutral when a more specific changed box exists.
    if (!covered && closest?.status === "partial") overlayStatus.set(closest.path, "partial")
    if (covered) coveredSegments.add(segment.id)
  }

  // A component can change even when all its words match elsewhere. Compare
  // its own inline content with its counterpart, excluding nested boxes on
  // BOTH sides. Child-only additions/removals then leave the old shell neutral.
  const boundaries = new WeakSet(overlays.map((overlay) => overlay.node))
  const counterpartBoundaries = new WeakSet(comparison?.counterpartOverlays.map((overlay) => overlay.node) ?? [])
  // A formatting change can make a box visible in only one panel. Treat the
  // paired component as a boundary in both, so layout never changes ownership.
  if (comparison) for (const overlay of overlays) {
    const counterpart = comparison.counterparts.get(overlay.node)
    if (counterpart) counterpartBoundaries.add(counterpart)
  }
  const ownSignature = comparison ? boxContentSignature((node) => {
    const counterpart = comparison.counterparts.get(node)
    return boundaries.has(node) || Boolean(counterpart && counterpartBoundaries.has(counterpart))
  }) : null
  const counterpartSignature = comparison ? boxContentSignature((node) => counterpartBoundaries.has(node)) : null
  const hiddenChanges = new WeakMap<PsiNode, boolean>()
  function hasHiddenChange(node: PsiNode): boolean {
    const cached = hiddenChanges.get(node)
    if (cached !== undefined) return cached
    const changed = Boolean(comparison && ownSignature && counterpartSignature && children(node).some((child) => {
      // A visible child paints itself. A box visible only in the other layout
      // needs its nearest visible owner here when its actual content changed.
      if (boundaries.has(child)) return false
      const counterpart = comparison.counterparts.get(child)
      return Boolean(counterpart && counterpartBoundaries.has(counterpart)
        && ownSignature(child) !== counterpartSignature(counterpart)) || hasHiddenChange(child)
    }))
    hiddenChanges.set(node, changed)
    return changed
  }
  const hasColoredDescendant = new Set<string>()
  function noteAncestors(path: string) {
    let parent = path.slice(0, path.lastIndexOf("."))
    while (parent && parent !== "0") {
      hasColoredDescendant.add(parent)
      parent = parent.slice(0, parent.lastIndexOf("."))
    }
  }
  for (const path of overlayStatus.keys()) noteAncestors(path)
  const partialPaths = [...candidates].filter(([, status]) => status === "partial")
    .map(([path]) => path).sort((a, b) => b.length - a.length)
  const nodesByPath = new Map(overlays.map((overlay) => [overlay.nodePath, overlay.node]))
  for (const path of partialPaths) {
    if (overlayStatus.has(path)) continue
    if (comparison && ownSignature && counterpartSignature) {
      const node = nodesByPath.get(path)!
      const counterpart = comparison.counterparts.get(node)
      if (!counterpart || (ownSignature(node) === counterpartSignature(counterpart) && !hasHiddenChange(node))) continue
    } else if (hasColoredDescendant.has(path)) continue
    let ancestor = path.slice(0, path.lastIndexOf("."))
    let insideComplete = false
    while (ancestor && ancestor !== "0") {
      if (overlayStatus.get(ancestor) === "complete") { insideComplete = true; break }
      ancestor = ancestor.slice(0, ancestor.lastIndexOf("."))
    }
    if (!insideComplete) {
      overlayStatus.set(path, "partial")
      noteAncestors(path)
    }
  }

  return { overlayStatus, coveredSegments }
}

function significant(type: string): boolean {
  return /(JavaFile|Class|Interface|Enum|Record|Method|Field|Statement|CodeBlock|Import|Package|Variable|Comment)/.test(type)
}

function labelFor(node: PsiNode, source: string): string {
  const text = source.slice(node.startOffset ?? 0, node.endOffset ?? source.length)
  if (/^Psi(Method|AnnotationMethod)(Impl)?$/.test(node.type)) {
    const header = text.slice(0, text.indexOf("{") >= 0 ? text.indexOf("{") : text.length).replace(/\s+/g, " ").trim()
    return header.length > 110 ? `${header.slice(0, 107)}…` : header
  }
  const first = text.split(/\r?\n/).find((line) => line.trim())?.trim() ?? ""
  return first.length > 110 ? `${first.slice(0, 107)}…` : first
}

export function buildModelOutline(root: PsiNode, matched: Set<number>, side: "before" | "after",
  unpaired?: WeakSet<PsiNode>, modified?: WeakSet<PsiNode>): ModelOutlineNode {
  const source = sourceText(root)
  const tokenIndex = new WeakMap<PsiNode, number>()
  semanticTokens(root).forEach((token, index) => tokenIndex.set(token.node, index))
  let nextId = 0

  function visit(node: PsiNode): { rows: ModelOutlineNode[]; total: number; changed: number } {
    const nested = children(node)
    if (!nested.length) {
      const index = tokenIndex.get(node)
      if (index === undefined) return { rows: [], total: 0, changed: 0 }
      const changed = matched.has(index) ? 0 : 1
      if (!changed) return { rows: [], total: 1, changed: 0 }
      return {
        rows: [{ id: String(nextId++), type: node.type, label: node.text ?? "", status: side === "before" ? "removed" : "added", changedCount: 1, children: [] }],
        total: 1, changed: 1,
      }
    }
    const parts = nested.map(visit)
    const total = parts.reduce((sum, part) => sum + part.total, 0)
    const changed = parts.reduce((sum, part) => sum + part.changed, 0)
    const rows = parts.flatMap((part) => part.rows)
    if (!significant(node.type) && node !== root) return { rows, total, changed }
    const status = changed === 0 && !modified?.has(node) ? "same" : changed > 0 && (changed === total || unpaired?.has(node))
      ? side === "before" ? "removed" : "added" : "context"
    return {
      rows: [{ id: String(nextId++), type: node.type, label: labelFor(node, source), status,
        changedCount: changed || (modified?.has(node) ? 1 : 0), children: rows }],
      total, changed,
    }
  }
  return visit(root).rows[0] ?? { id: "root", type: root.type, label: "", status: "same", changedCount: 0, children: [] }
}
