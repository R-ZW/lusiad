import { findProjectById } from "@/lib/repositories/track-control/track-control.repository"
import { assertSeparateRoots, relativeContained } from "../contained-paths"
import { readHistoricalModel } from "../restore/snapshot-reader"
import { recoverPsiEdits } from "./psi-recovery.service"
import "server-only"
import { backendUrl } from "@/lib/config/backend"
import { postBackendJson } from "../backend-client"
import { BackendApiError, requirePsiMutationResult, requirePsiModel, type PsiSaveMetadata } from "../backend-response"
import type { JavaModel } from "@/lib/types"

/** Endpoints da API PSI executada localmente. */

/** Campos padrao retornados pelo backend em operacoes de escrita. */
interface BackendStatusResponse extends PsiSaveMetadata {
  status: "ok"
  message?: string
  path: string
}

/** Resposta da operacao de exclusao por faixa de offsets. */
export interface DeleteResponse extends BackendStatusResponse {
  startOffset: number
  endOffset: number
  removedChars: number
}

/** Resposta da operacao de atualizacao por faixa de offsets. */
export interface UpdateResponse extends BackendStatusResponse {
  startOffset: number
  endOffset: number
  removedChars: number
  insertedChars: number
}

/** Resposta da operacao de criacao de trecho em linha ou intervalo de linhas. */
export interface CreateResponse extends BackendStatusResponse {
  mode: string
  line: number
  lineEnd?: number
  column?: number
  offset: number
  insertedChars: number
}

/** Resposta da operacao de movimentacao de trecho. */
export interface MoveResponse extends BackendStatusResponse {
  mode: string
  startOffset: number
  endOffset: number
  movedChars: number
  targetOriginalOffset: number
  line: number
  lineEnd?: number
  column?: number
}

export class PsiFileNotFoundError extends BackendApiError {
  constructor(detail: string) {
    super("Falha ao ler modelo", detail, "psi_file_not_found", 404)
    this.name = "PsiFileNotFoundError"
  }
}

interface DeleteRangeRequest {
  projectId: number
  path: string
  startOffset: string
  endOffset: string
  changeDescription?: string
  allowWithoutUndo?: boolean
  expectedHash?: string
}

interface UpdateRangeRequest {
  projectId: number
  path: string
  startOffset: string
  endOffset: string
  newContent: string
  changeDescription?: string
  allowWithoutUndo?: boolean
  expectedHash?: string
}

interface CreateSnippetRequest {
  componentPlacement: boolean
  projectId: number
  path: string
  line: string
  lineEnd?: string
  column?: string
  content: string
  changeDescription?: string
  allowWithoutUndo?: boolean
  expectedHash?: string
}

interface MoveRangeRequest {
  componentPlacement: boolean
  projectId: number
  path: string
  startOffset: string
  endOffset: string
  line: string
  lineEnd?: string
  column?: string
  changeDescription?: string
  allowWithoutUndo?: boolean
  expectedHash?: string
}

/**
 * Envia requisicoes JSON para o backend PSI com tratamento uniforme de erro HTTP.
 */
async function postJson<TResponse extends BackendStatusResponse>(
  endpoint: string,
  body: unknown,
  requestErrorMessage: string,
  requiredFields: readonly string[],
): Promise<TResponse> {
  return postBackendJson(endpoint, body, requestErrorMessage,
    (result, context) => requirePsiMutationResult<TResponse>(result, context, ["path", ...requiredFields]))
}

/** Carrega o modelo PSI completo de um arquivo Java. */
export async function readPsiModel(projectId: number, path: string): Promise<JavaModel> {
  try {
    const project = await findProjectById(projectId)
    if (!project) throw new Error("Project not found")
    let live = true
    try { relativeContained(project.path, path) } catch { live = false }
    if (!live) {
      if (!project.tempPath) throw new Error("Snapshot root not found")
      assertSeparateRoots(project.path, project.tempPath)
      return readHistoricalModel(projectId, project.tempPath, path)
    }
    await recoverPsiEdits(projectId)
    const model = await postBackendJson(backendUrl("/psi/read"), { projectId, path }, "Falha ao ler modelo", requirePsiModel)
    if (!model.revision || !/^[a-f0-9]{64}$/.test(model.revision)) throw new BackendApiError("Falha ao ler modelo", "Modelo sem revisão", "invalid_response", 200)
    return model
  } catch (failure) {
    // Both the new HTTP 404/code and the older HTTP 200/error identify a missing snapshot file.
    if (failure instanceof BackendApiError && (failure.code === "psi_file_not_found" || failure.detail === "Java file not found")) {
      throw new PsiFileNotFoundError(failure.detail)
    }
    throw failure
  }
}

/** Exclui um trecho do arquivo usando offsets absolutos. */
export async function deletePsiRange(
  projectId: number,
  path: string,
  startOffset: number,
  endOffset: number,
  changeDescription?: string,
  expectedHash?: string,
  allowWithoutUndo = false,
): Promise<DeleteResponse> {
  const request: DeleteRangeRequest = {
    projectId,
    path,
    expectedHash, allowWithoutUndo,
    startOffset: String(startOffset),
    endOffset: String(endOffset),
  }

  if (changeDescription?.trim()) {
    request.changeDescription = changeDescription
  }

  return postJson<DeleteResponse>(backendUrl("/psi/delete"), request, "Falha ao excluir no backend", ["startOffset", "endOffset", "removedChars"])
}

/** Substitui o conteudo de um intervalo de offsets por um novo texto. */
export async function updatePsiRange(
  projectId: number,
  path: string,
  startOffset: number,
  endOffset: number,
  newContent: string,
  changeDescription?: string,
  expectedHash?: string,
  allowWithoutUndo = false,
): Promise<UpdateResponse> {
  const request: UpdateRangeRequest = {
    projectId,
    path,
    expectedHash, allowWithoutUndo,
    startOffset: String(startOffset),
    endOffset: String(endOffset),
    newContent,
  }

  if (changeDescription?.trim()) {
    request.changeDescription = changeDescription
  }

  return postJson<UpdateResponse>(backendUrl("/psi/update"), request, "Falha ao editar no backend", ["startOffset", "endOffset", "removedChars", "insertedChars"])
}

/**
 * Cria um trecho em uma linha alvo ou entre linhas, conforme suporte do backend.
 */
export async function createPsiSnippet(
  projectId: number,
  path: string,
  line: number,
  content: string,
  lineEnd?: number,
  column?: number,
  changeDescription?: string,
  expectedHash?: string,
  allowWithoutUndo = false,
): Promise<CreateResponse> {
  const request: CreateSnippetRequest = {
    componentPlacement: true,
    projectId,
    path,
    expectedHash, allowWithoutUndo,
    line: String(line),
    content,
  }

  // O backend interpreta lineEnd apenas quando o destino e um intervalo valido.
  if (Number.isFinite(lineEnd) && typeof lineEnd === "number" && lineEnd > line) {
    request.lineEnd = String(lineEnd)
  }

  if (Number.isFinite(column) && typeof column === "number" && column > 0) {
    request.column = String(column)
  }

  if (changeDescription?.trim()) {
    request.changeDescription = changeDescription
  }

  return postJson<CreateResponse>(backendUrl("/psi/create"), request, "Falha ao criar no backend", ["mode", "line", "offset", "insertedChars"])
}

/**
 * Move um trecho delimitado por offsets para uma linha ou intervalo de linhas.
 */
export async function movePsiRange(
  projectId: number,
  path: string,
  startOffset: number,
  endOffset: number,
  line: number,
  lineEnd?: number,
  column?: number,
  changeDescription?: string,
  expectedHash?: string,
  allowWithoutUndo = false,
): Promise<MoveResponse> {
  const request: MoveRangeRequest = {
    componentPlacement: true,
    projectId,
    path,
    expectedHash, allowWithoutUndo,
    startOffset: String(startOffset),
    endOffset: String(endOffset),
    line: String(line),
  }

  // Mantemos lineEnd opcional para preservar os dois modos de destino no backend.
  if (Number.isFinite(lineEnd) && typeof lineEnd === "number" && lineEnd > line) {
    request.lineEnd = String(lineEnd)
  }

  if (Number.isFinite(column) && typeof column === "number" && column > 0) {
    request.column = String(column)
  }

  if (changeDescription?.trim()) {
    request.changeDescription = changeDescription
  }

  return postJson<MoveResponse>(backendUrl("/psi/move"), request, "Falha ao mover no backend", ["mode", "startOffset", "endOffset", "movedChars", "targetOriginalOffset", "line"])
}
