import type { PsiNode } from "@/lib/types"
import { blockGroup } from "../../appearance.ts"

/** Altura visual de cada linha renderizada no canvas (em rem). */
export const LINE_HEIGHT_REM = 3
/** Espacamento vertical interno dos overlays de caixa (em rem). */
export const BOX_GAP_VERTICAL_REM = 0.18
/** Ajuste horizontal esquerdo aplicado a caixas de no (em ch). */
export const BOX_PADDING_LEFT_CH = 0.45
/** Ajuste horizontal direito aplicado a caixas de no (em ch). */
export const BOX_PADDING_RIGHT_CH = 0.45
/** Incremento de "degrau" horizontal para ancestrais no caminho de referencia (em ch). */
export const BOX_PARENT_RIGHT_STEP_CH = 1.35

/** Estado visual da pre-visualizacao de drop no canvas. */
export type DragPreview =
  | {
      mode: "line" | "between"
      line: number
      nextLine: number
    }
  | { mode: "end"; line: number; nextLine: number; column: number }
  | {
      column: number
      mode: "inline-empty-block"
      line: number
      nextLine: number
      leftCh: number
      widthCh: number
      topRem: number
      heightRem: number
    }

/** Geometria de uma caixa overlay que representa um no PSI. */
export interface BoxOverlay {
  id: string
  nodePath: string
  topRem: number
  leftCh: number
  widthCh: number
  heightRem: number
  depth: number
  isLeaf: boolean
  node: PsiNode
}

/**
 * Contexto auxiliar para alinhar bordas direitas usando o caminho "mais a direita"
 * da arvore PSI como referencia visual.
 */
export interface ReferencePathContext {
  pathNodes: Set<PsiNode>
  depthByNode: Map<PsiNode, number>
  referenceDepth: number
  referenceRightEdgeCh: number
}

/** Segmento textual de no folha para renderizacao com colorizacao por tipo. */
export interface LeafTextSegment {
  id: string
  nodePath: string
  type: string
  text: string
}

/** Classe visual de borda/fundo usada para destacar tipos de no PSI. */
export interface NodeBorderVisualStyle {
  border: string
  accent: string
  background: string
}

/**
 * Verifica se so ha whitespace antes da coluna inicial do no em uma linha.
 */
export function hasOnlyWhitespaceBefore(line: string, startColumn: number): boolean {
  // startColumn e 1-based na PSI; convertemos para indice 0-based da string.
  const startIndex = Math.max(0, startColumn - 1)
  return line.slice(0, startIndex).trim().length === 0
}

/**
 * Verifica se so ha whitespace depois da coluna final do no em uma linha.
 */
export function hasOnlyWhitespaceAfter(line: string, endColumn: number): boolean {
  const endIndex = Math.max(0, endColumn)
  return line.slice(endIndex).trim().length === 0
}

/**
 * Determina se o no possui intervalo visivel (ao menos 1 caractere ou multiplas linhas).
 */
export function hasVisibleRange(node: PsiNode): boolean {
  if (typeof node.startOffset === "number" && typeof node.endOffset === "number" && node.endOffset <= node.startOffset) return false
  if (node.endLine > node.startLine) {
    return true
  }

  if (node.endLine < node.startLine) {
    return false
  }

  return node.endColumn >= node.startColumn
}

/** Comments and leaf statements remain components; ordinary Java tokens do not. */
function isComponentNode(node: PsiNode): boolean {
  return (node.children?.length ?? 0) > 0 || /(?:Comment|Statement)(?:Impl)?$/.test(node.type)
}

/**
 * Para nos multi-linha, calcula a maior coluna final util (sem trailing spaces).
 */
export function getMaxLineEndColumn(lines: string[], node: PsiNode): number {
  let maxEndColumn = Math.max(node.startColumn, node.endColumn)

  for (let lineNumber = node.startLine; lineNumber <= node.endLine; lineNumber += 1) {
    const line = lines[lineNumber - 1] ?? ""
    const trimmedEndLength = line.replace(/\s+$/g, "").length
    maxEndColumn = Math.max(maxEndColumn, trimmedEndLength)
  }

  return maxEndColumn
}

/**
 * Encontra recursivamente o caminho cujo no final esta mais a direita.
 * Em empate de coluna final, prefere maior profundidade para estabilidade visual.
 */
export function findRightmostNodePath(node: PsiNode, currentPath: PsiNode[] = []): PsiNode[] {
  const nextPath = [...currentPath, node]
  let bestPath = nextPath
  let bestEndColumn = Math.max(0, node.endColumn)
  let bestDepth = nextPath.length - 1

  const children = node.children ?? []

  for (const child of children) {
    const childPath = findRightmostNodePath(child, nextPath)
    const childNode = childPath[childPath.length - 1]
    const childEndColumn = Math.max(0, childNode.endColumn)
    const childDepth = childPath.length - 1

    const isBetterCandidate =
      childEndColumn > bestEndColumn || (childEndColumn === bestEndColumn && childDepth > bestDepth)

    if (isBetterCandidate) {
      bestPath = childPath
      bestEndColumn = childEndColumn
      bestDepth = childDepth
    }
  }

  return bestPath
}

/**
 * Constroi contexto de referencia para "degraus" horizontais de caixas ancestrais.
 */
export function buildReferencePathContext(tree: PsiNode, lines: string[]): ReferencePathContext {
  const referencePath = findRightmostNodePath(tree)
  const referenceNode = referencePath[referencePath.length - 1]
  const referenceDepth = referencePath.length - 1
  const referenceIsSingleLine = referenceNode.startLine === referenceNode.endLine
  const referenceEndColumn = referenceIsSingleLine
    ? Math.max(0, referenceNode.endColumn)
    : getMaxLineEndColumn(lines, referenceNode)
  const referenceRightEdgeCh = referenceEndColumn + BOX_PADDING_RIGHT_CH

  // Set para lookup O(1) de pertencimento ao caminho de referencia.
  const pathNodes = new Set<PsiNode>(referencePath)
  // Mapa de profundidade para calcular o deslocamento de "degrau" por ancestral.
  const depthByNode = new Map<PsiNode, number>()

  for (let index = 0; index < referencePath.length; index += 1) {
    depthByNode.set(referencePath[index], index)
  }

  return {
    pathNodes,
    depthByNode,
    referenceDepth,
    referenceRightEdgeCh,
  }
}

/**
 * Ajusta a geometria horizontal padrao da caixa de no.
 * Quando o no pertence ao caminho de referencia, amplia a borda direita para
 * manter um efeito visual em escada nos ancestrais.
 */
export function applyDefaultBoxHorizontalSpacing(
  baseLeftCh: number,
  baseWidthCh: number,
  node: PsiNode,
  referencePathContext: ReferencePathContext
): { leftCh: number; widthCh: number } {
  const leftCh = Math.max(0, baseLeftCh - BOX_PADDING_LEFT_CH)
  const ownRightEdgeCh = baseLeftCh + baseWidthCh
  const defaultRightEdgeCh = ownRightEdgeCh + BOX_PADDING_RIGHT_CH

  let targetRightEdgeCh = defaultRightEdgeCh

  if (referencePathContext.pathNodes.has(node)) {
    const nodeDepth = referencePathContext.depthByNode.get(node) ?? referencePathContext.referenceDepth
    // Quanto mais ancestral no caminho de referencia, maior o deslocamento para a direita.
    const ancestorStepMultiplier = Math.max(0, referencePathContext.referenceDepth - nodeDepth)
    const stairRightEdgeCh = referencePathContext.referenceRightEdgeCh + ancestorStepMultiplier * BOX_PARENT_RIGHT_STEP_CH
    targetRightEdgeCh = Math.max(defaultRightEdgeCh, stairRightEdgeCh)
  }

  // Evita largura zero em casos limite de geometria.
  const widthCh = Math.max(0.5, targetRightEdgeCh - leftCh)

  return { leftCh, widthCh }
}

/**
 * Geometria horizontal para overlays somente de hover inline.
 */
export function applyInlineHoverHorizontalGeometry(
  baseLeftCh: number,
  baseWidthCh: number
): { leftCh: number; widthCh: number } {
  return {
    leftCh: baseLeftCh,
    widthCh: baseWidthCh,
  }
}

/**
 * Informa se um caminho textual representa descendente de outro caminho.
 */
export function isDescendantPath(nodePath: string, ancestorPath: string): boolean {
  return nodePath.startsWith(`${ancestorPath}.`)
}

/**
 * Informa se um no deve ficar oculto porque algum ancestral esta colapsado.
 */
export function isHiddenByCollapsedAncestor(nodePath: string, collapsedNodePaths: Set<string>): boolean {
  for (const collapsedPath of collapsedNodePaths) {
    if (isDescendantPath(nodePath, collapsedPath)) {
      return true
    }
  }

  return false
}

/**
 * Coleta overlays de caixa "completa" para nos que ocupam bloco visual relevante.
 */
export function collectBoxOverlays(
  node: PsiNode,
  lines: string[],
  referencePathContext: ReferencePathContext,
  depth = 0,
  path = "0"
): BoxOverlay[] {
  const children = node.children ?? []
  const isLeaf = children.length === 0
  const currentLine = lines[node.startLine - 1] ?? ""
  const startsWithOnlyWhitespaceBefore = hasOnlyWhitespaceBefore(currentLine, node.startColumn)
  const isSingleLine = node.startLine === node.endLine
  const endsWithOnlyWhitespaceAfter = isSingleLine ? hasOnlyWhitespaceAfter(currentLine, node.endColumn) : false

  const overlays: BoxOverlay[] = []

  // Renderizamos caixa de bloco quando o no inicia em area "limpa" da linha.
  if (hasVisibleRange(node) && startsWithOnlyWhitespaceBefore) {
    const shouldRenderSingleLineBox = isComponentNode(node) && isSingleLine && endsWithOnlyWhitespaceAfter
    const shouldRenderMultiLineBox = !isSingleLine

    if (shouldRenderSingleLineBox || shouldRenderMultiLineBox) {
      // startColumn e 1-based; para canvas trabalhamos em base 0.
      const baseLeftCh = Math.max(0, node.startColumn - 1)
      const baseTopRem = Math.max(0, node.startLine - 1) * LINE_HEIGHT_REM
      const endColumn = isSingleLine ? node.endColumn : getMaxLineEndColumn(lines, node)
      const baseWidthCh = Math.max(1, endColumn - baseLeftCh)
      const baseHeightRem = Math.max(1, node.endLine - node.startLine + 1) * LINE_HEIGHT_REM
      const { leftCh, widthCh } = applyDefaultBoxHorizontalSpacing(baseLeftCh, baseWidthCh, node, referencePathContext)

      const topRem = baseTopRem + BOX_GAP_VERTICAL_REM
      const heightRem = Math.max(0.5, baseHeightRem - BOX_GAP_VERTICAL_REM * 2)

      overlays.push({
        id: `${path}:${node.type}:${node.startLine}:${node.startColumn}:${node.endLine}:${node.endColumn}`,
        nodePath: path,
        topRem,
        leftCh,
        widthCh,
        heightRem,
        depth,
        isLeaf,
        node,
      })
    }
  }

  // Recursao DFS para coletar overlays dos filhos no mesmo formato.
  return [
    ...overlays,
    ...children.flatMap((child, index) =>
      collectBoxOverlays(child, lines, referencePathContext, depth + 1, `${path}.${index}`)
    ),
  ]
}

/**
 * Coleta overlays de hover para nos inline que compartilham a linha com outros tokens.
 * Wrapper chains share one overlay; independent nested components remain selectable.
 */
export function collectHoverOnlyInlineOverlays(
  node: PsiNode,
  lines: string[],
  depth = 0,
  path = "0",
  hasInlineQualifiedAncestor = false
): BoxOverlay[] {
  const children = node.children ?? []
  const isLeaf = children.length === 0
  const currentLine = lines[node.startLine - 1] ?? ""
  const isSingleLine = node.startLine === node.endLine
  const startsWithOnlyWhitespaceBefore = hasOnlyWhitespaceBefore(currentLine, node.startColumn)
  const endsWithOnlyWhitespaceAfter = hasOnlyWhitespaceAfter(currentLine, node.endColumn)
  const sharesLineWithOtherContent = !startsWithOnlyWhitespaceBefore || !endsWithOnlyWhitespaceAfter
  const isInlineSharedLineCandidate = hasVisibleRange(node) && isComponentNode(node) && isSingleLine && sharesLineWithOtherContent

  const overlays: BoxOverlay[] = []

  if (isInlineSharedLineCandidate && (!hasInlineQualifiedAncestor || /(?:Statement|Method|Class|Field|Comment)Impl$/.test(node.type))) {
    // startColumn e 1-based; para canvas trabalhamos em base 0.
    const baseLeftCh = Math.max(0, node.startColumn - 1)
    const endColumn = node.endColumn
    const baseWidthCh = Math.max(1, endColumn - baseLeftCh)
    const baseTopRem = Math.max(0, node.startLine - 1) * LINE_HEIGHT_REM
    const baseHeightRem = LINE_HEIGHT_REM
    const { leftCh, widthCh } = applyInlineHoverHorizontalGeometry(baseLeftCh, baseWidthCh)

    const topRem = baseTopRem + BOX_GAP_VERTICAL_REM
    const heightRem = Math.max(0.5, baseHeightRem - BOX_GAP_VERTICAL_REM * 2)

    overlays.push({
      id: `${path}:hover-inline:${node.type}:${node.startLine}:${node.startColumn}:${node.endLine}:${node.endColumn}`,
      nodePath: path,
      topRem,
      leftCh,
      widthCh,
      heightRem,
      depth,
      isLeaf,
      node,
    })
  }

  // Recursao DFS para filhos, carregando a flag de ancestral inline qualificado.
  return [
    ...overlays,
    ...children.flatMap((child, index) =>
      collectHoverOnlyInlineOverlays(
        child,
        lines,
        depth + 1,
        `${path}.${index}`,
        hasInlineQualifiedAncestor || isInlineSharedLineCandidate
      )
    ),
  ]
}

/**
 * Coleta segmentos de texto de nos folha preservando um "nodePath" estavel.
 */
export function collectLeafTextSegments(node: PsiNode, path = "0"): LeafTextSegment[] {
  const children = node.children ?? []

  if (children.length === 0) {
    return [
      {
        id: `${path}:${node.type}:${node.startLine}:${node.startColumn}:${node.endLine}:${node.endColumn}`,
        nodePath: path,
        type: node.type,
        text: node.text ?? "",
      },
    ]
  }

  // Concatenamos DFS para preservar ordem textual original das folhas.
  return children.flatMap((child, index) => collectLeafTextSegments(child, `${path}.${index}`))
}

/**
 * Resolve classe de cor de sintaxe para cada segmento textual de folha.
 */
export function getSegmentColorClass(segment: LeafTextSegment): string {
  const tokenText = segment.text.trim()
  const isStringLiteral =
    (tokenText.startsWith('"') && tokenText.endsWith('"') && tokenText.length >= 2) ||
    (tokenText.startsWith("'") && tokenText.endsWith("'") && tokenText.length >= 2)

  if (segment.type.includes("Keyword")) {
    return "code-keyword"
  }

  if (segment.type.includes("Identifier")) {
    return "code-identifier"
  }

  if (isStringLiteral || segment.type.includes("Literal")) {
    return "code-literal"
  }

  return segment.type.includes('Comment') ? 'code-comment' : 'code-text'
}

/**
 * Resolve estilo de borda/fundo por tipo de no PSI com fallback seguro.
 */
export function getNodeBorderVisualStyle(type: string): NodeBorderVisualStyle {
  return { border: `lusiad-block block-${blockGroup(type)}`, accent: '', background: '' }
}

/**
 * Mapeia inicio de cada linha para offset absoluto no texto fonte.
 */
export function buildLineStartOffsets(sourceText: string): number[] {
  const offsets = [0]

  for (let index = 0; index < sourceText.length; index += 1) {
    // O caractere apos cada newline marca o inicio da proxima linha.
    if (sourceText[index] === "\n") {
      offsets.push(index + 1)
    }
  }

  return offsets
}

/** Select individual blank lines, not the PSI whitespace chunk spanning adjacent code. */
export function collectBlankLineOverlays(tree: PsiNode, sourceText: string): BoxOverlay[] {
  const lines = sourceText.split("\n")
  const starts = buildLineStartOffsets(sourceText)
  const overlays: BoxOverlay[] = []
  const visit = (node: PsiNode, path: string, depth: number) => {
    const children = node.children ?? []
    if (children.length === 0 && /WhiteSpace/.test(node.type)
        && typeof node.startOffset === "number" && typeof node.endOffset === "number") {
      for (let line = node.startLine; line <= Math.min(node.endLine, lines.length); line++) {
        const range = resolveWhitespaceLineDeleteRange(line, lines, starts, sourceText.length)
        if (!range || range.startOffset < node.startOffset || range.endOffset > node.endOffset) continue
        const text = sourceText.slice(range.startOffset, range.endOffset)
        const blank: PsiNode = { type: node.type, text, ...range,
          startLine: line, endLine: line, startColumn: 1, endColumn: lines[line - 1].length + 1 }
        const nodePath = `${path}.blank.${line}`
        overlays.push({ id: nodePath, nodePath, node: blank, isLeaf: true, depth: depth + 1,
          topRem: (line - 1) * LINE_HEIGHT_REM + BOX_GAP_VERTICAL_REM,
          heightRem: LINE_HEIGHT_REM - 2 * BOX_GAP_VERTICAL_REM,
          leftCh: 0, widthCh: Math.max(4, lines[line - 1].length + 1) })
      }
    }
    children.forEach((child, index) => visit(child, `${path}.${index}`, depth + 1))
  }
  visit(tree, "0", 0)
  return overlays
}

/**
 * Resolve o range de exclusao de uma linha em branco.
 * O intervalo retornado e [startOffset, endOffset), incluindo o newline quando existir.
 */
export function resolveWhitespaceLineDeleteRange(
  lineNumber: number,
  sourceLines: string[],
  lineStartOffsets: number[],
  sourceTextLength: number
): { startOffset: number; endOffset: number } | null {
  if (lineNumber < 1 || lineNumber > sourceLines.length) {
    return null
  }

  const lineContent = sourceLines[lineNumber - 1] ?? ""
  const isWhitespaceOnlyLine = lineContent.trim().length === 0

  if (!isWhitespaceOnlyLine) {
    return null
  }

  const startOffset = lineStartOffsets[lineNumber - 1]

  if (typeof startOffset !== "number") {
    return null
  }

  const nextLineStartOffset = lineStartOffsets[lineNumber]
  const endOffset = typeof nextLineStartOffset === "number" ? nextLineStartOffset : sourceTextLength

  // Protecao contra ranges inconsistentes em cenarios de texto inesperado.
  if (endOffset <= startOffset) {
    return null
  }

  return { startOffset, endOffset }
}
