import type { PsiNode } from "@/lib/types"
import {
  canEditPropertiesNodeFeature,
  evaluatePropertiesPanelEditStateFeature,
  formatNodeTypeLabelFeature,
  type PropertiesPanelEditStateFeatureResult,
} from "@/features/model-editor/properties-panel.feature"

/**
 * Requisicao validada para disparar uma atualizacao de conteudo do no selecionado.
 */
export interface PropertiesPanelUpdateRequestControllerResult {
  node: PsiNode
  newContent: string
}

/**
 * Adapter do controller para formatacao de tipo exibida na UI.
 */
export function formatNodeTypeLabelController(type: string): string {
  return formatNodeTypeLabelFeature(type)
}

/**
 * Adapter do controller para o estado derivado de edicao.
 */
export function evaluatePropertiesPanelEditStateController(
  node: PsiNode | null,
  editableContent: string,
  selectedNodeContent: string
): PropertiesPanelEditStateFeatureResult {
  return evaluatePropertiesPanelEditStateFeature(node, editableContent, selectedNodeContent)
}

/**
 * Valida e constroi o payload usado para solicitar update de um no no backend.
 */
export function buildPropertiesPanelUpdateRequestController(
  selectedNode: PsiNode | null,
  editableContent: string
): PropertiesPanelUpdateRequestControllerResult {
  if (!selectedNode) {
    throw new Error("Nao foi possivel editar: nenhum elemento selecionado")
  }

  const canEdit = canEditPropertiesNodeFeature(selectedNode)

  if (!canEdit) {
    throw new Error("Este elemento nao pode ser editado porque nao possui offsets validos")
  }

  return {
    node: selectedNode,
    newContent: editableContent,
  }
}
