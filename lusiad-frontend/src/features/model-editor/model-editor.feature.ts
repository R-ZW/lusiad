import type { PsiSaveMetadata } from "@/lib/services/backend-response"
import type { JavaModel } from "@/lib/types"
import {
  createPsiSnippet,
  deletePsiRange,
  movePsiRange,
  readPsiModel,
  updatePsiRange,
  type CreateResponse,
  type DeleteResponse,
  type MoveResponse,
  type UpdateResponse,
} from "@/lib/services/model-editor/psi-api.service"

/** Parametros para operacoes baseadas em intervalo de offsets. */
interface DeleteRangeFeatureParams {
  projectId: number
  path: string
  startOffset: number
  endOffset: number
  changeDescription?: string
  allowWithoutUndo?: boolean
  expectedHash?: string
}

/** Parametros para atualizacao de conteudo em intervalo. */
interface UpdateRangeFeatureParams extends DeleteRangeFeatureParams {
  newContent: string
}

/** Parametros para insercao de trecho em linha alvo. */
interface CreateSnippetFeatureParams {
  projectId: number
  path: string
  line: number
  lineEnd?: number
  column?: number
  content: string
  changeDescription?: string
  allowWithoutUndo?: boolean
  expectedHash?: string
}

/** Parametros para mover trecho para linha alvo. */
interface MoveRangeFeatureParams extends DeleteRangeFeatureParams {
  line: number
  lineEnd?: number
  column?: number
}

/** Resultado normalizado de exclusao. */
export interface DeleteRangeFeatureResult extends PsiSaveMetadata {
  removedChars: number
}

/** Resultado normalizado de atualizacao. */
export interface UpdateRangeFeatureResult extends PsiSaveMetadata {
  removedChars: number
  insertedChars: number
}

/** Resultado normalizado de criacao. */
export interface CreateSnippetFeatureResult extends PsiSaveMetadata {
  line: number
  lineEnd?: number
  column?: number
  insertedChars: number
  mode: string
}

/** Resultado normalizado de movimentacao. */
export interface MoveRangeFeatureResult extends PsiSaveMetadata {
  line: number
  lineEnd?: number
  column?: number
  movedChars: number
  mode: string
}

/**
 * Garante que o backend confirmou a operacao com status "ok".
 */
function ensureStatusOk(
  response: DeleteResponse | UpdateResponse | CreateResponse | MoveResponse,
  fallbackMessage: string
) {
  if (response.status !== "ok") {
    throw new Error(response.message || fallbackMessage)
  }
}

/** Delega a leitura completa do modelo PSI para a camada de service. */
export async function readModelFeature(projectId: number, path: string): Promise<JavaModel> {
  return readPsiModel(projectId, path)
}

/**
 * Executa exclusao no backend e normaliza o total de caracteres removidos.
 */
export async function deleteRangeFeature({
  projectId,
  path,
  startOffset,
  endOffset,
  changeDescription,
  expectedHash, allowWithoutUndo,
}: DeleteRangeFeatureParams): Promise<DeleteRangeFeatureResult> {
  const response = await deletePsiRange(projectId, path, startOffset, endOffset, changeDescription, expectedHash, allowWithoutUndo)
  ensureStatusOk(response, "Backend retornou falha ao excluir")

  return {
    saved: response.saved,
    formatting: response.formatting,
    // Fallback para manter consistencia quando o backend nao retorna removedChars.
    removedChars:
      Number.isFinite(response.removedChars) && typeof response.removedChars === "number"
        ? response.removedChars
        : endOffset - startOffset,
  }
}

/**
 * Executa atualizacao no backend e normaliza contagem de removidos/inseridos.
 */
export async function updateRangeFeature({
  projectId,
  path,
  startOffset,
  endOffset,
  newContent,
  changeDescription,
  expectedHash, allowWithoutUndo,
}: UpdateRangeFeatureParams): Promise<UpdateRangeFeatureResult> {
  const response = await updatePsiRange(projectId, path, startOffset, endOffset, newContent, changeDescription, expectedHash, allowWithoutUndo)
  ensureStatusOk(response, "Backend retornou falha ao editar")

  return {
    saved: response.saved,
    formatting: response.formatting,
    // O fallback usa o intervalo solicitado quando o backend omite o valor.
    removedChars:
      Number.isFinite(response.removedChars) && typeof response.removedChars === "number"
        ? response.removedChars
        : endOffset - startOffset,
    // O fallback usa o tamanho do novo conteudo enviado.
    insertedChars:
      Number.isFinite(response.insertedChars) && typeof response.insertedChars === "number"
        ? response.insertedChars
        : newContent.length,
  }
}

/**
 * Cria um trecho e converte a resposta para um formato unico consumido pelo controller.
 */
export async function createSnippetFeature({
  projectId,
  path,
  line,
  lineEnd,
  column,
  content,
  changeDescription,
  expectedHash, allowWithoutUndo,
}: CreateSnippetFeatureParams): Promise<CreateSnippetFeatureResult> {
  const response = await createPsiSnippet(projectId, path, line, content, lineEnd, column, changeDescription, expectedHash, allowWithoutUndo)
  ensureStatusOk(response, "Backend retornou falha ao criar")

  return {
    saved: response.saved,
    formatting: response.formatting,
    // Se o backend nao sobrescrever a linha, mantemos a solicitada na entrada.
    line: response.line ?? line,
    lineEnd: typeof response.lineEnd === "number" ? response.lineEnd : undefined,
    column: typeof response.column === "number" ? response.column : column,
    insertedChars:
      Number.isFinite(response.insertedChars) && typeof response.insertedChars === "number"
        ? response.insertedChars
        : content.length,
    mode: response.mode ?? "UNKNOWN",
  }
}

/**
 * Move um trecho existente e normaliza os dados de destino retornados pelo backend.
 */
export async function moveRangeFeature({
  projectId,
  path,
  startOffset,
  endOffset,
  line,
  lineEnd,
  column,
  changeDescription,
  expectedHash, allowWithoutUndo,
}: MoveRangeFeatureParams): Promise<MoveRangeFeatureResult> {
  const response = await movePsiRange(projectId, path, startOffset, endOffset, line, lineEnd, column, changeDescription, expectedHash, allowWithoutUndo)
  ensureStatusOk(response, "Backend retornou falha ao mover")

  return {
    saved: response.saved,
    formatting: response.formatting,
    // Mantemos o destino de entrada quando o backend nao envia a linha final.
    line: response.line ?? line,
    lineEnd: typeof response.lineEnd === "number" ? response.lineEnd : undefined,
    column: typeof response.column === "number" ? response.column : column,
    movedChars:
      Number.isFinite(response.movedChars) && typeof response.movedChars === "number"
        ? response.movedChars
        : endOffset - startOffset,
    mode: response.mode ?? "UNKNOWN",
  }
}
