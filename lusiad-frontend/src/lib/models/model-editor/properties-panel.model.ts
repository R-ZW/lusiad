import type { PsiNode } from "@/lib/types"

/**
 * Normaliza nomes de tipos PSI para exibicao compacta na UI.
 */
export function formatNodeTypeLabelModel(type: string): string {
  return type.replace(/^Psi/, "").replace(/Impl$/, "")
}

/**
 * Define se um no pode ser editado com base na validade dos offsets.
 */
export function canEditNodeModel(node: PsiNode | null): boolean {
  return Boolean(
    node &&
      Number.isFinite(node.startOffset) &&
      Number.isFinite(node.endOffset) &&
      (node.endOffset ?? 0) > (node.startOffset ?? 0)
  )
}

/**
 * Verifica se o conteudo foi alterado em relacao ao texto original do no selecionado.
 */
export function isNodeContentChangedModel(
  node: PsiNode | null,
  editableContent: string,
  selectedNodeContent: string
): boolean {
  if (!node) {
    return false
  }

  return editableContent !== selectedNodeContent
}
