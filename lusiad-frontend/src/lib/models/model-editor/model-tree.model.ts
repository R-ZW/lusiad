import type { PsiNode } from "@/lib/types"

/**
 * Reconstroi o texto bruto de um no PSI concatenando recursivamente o texto
 * de todos os nos folha.
 */
export function renderLeafTextContent(node: PsiNode): string {
  const children = node.children ?? []

  if (children.length === 0) {
    return node.text ?? ""
  }

  return children.map(renderLeafTextContent).join("")
}

/**
 * Encontra o caminho da raiz ate um no alvo.
 * Retorna null quando o alvo nao pertence a subarvore informada.
 */
export function findNodePath(root: PsiNode, target: PsiNode): PsiNode[] | null {
  if (root === target) {
    return [root]
  }

  const children = root.children ?? []

  for (const child of children) {
    const childPath = findNodePath(child, target)

    if (childPath) {
      return [root, ...childPath]
    }
  }

  return null
}

/** Used only to propose an insertion container, never as the recorded result's semantic context. */
export function findDeepestNodePathByLine(root: PsiNode, line: number): PsiNode[] | null {
  if (!Number.isFinite(line) || line < 1 || line < root.startLine || line > root.endLine) return null
  for (const child of root.children ?? []) {
    const path = findDeepestNodePathByLine(child, line)
    if (path) return [root, ...path]
  }
  return [root]
}
