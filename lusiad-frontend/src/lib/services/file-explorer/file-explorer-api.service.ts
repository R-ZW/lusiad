import "server-only"
import { backendUrl } from "@/lib/config/backend"
import { postBackendJson } from "../backend-client"
import { requireMutationResult } from "../backend-response"
import type { FileExplorerMutationResponse } from '@/lib/models/file-explorer/file-explorer.model'



interface FileCreateRequest {
  allowWithoutUndo?: boolean
  projectId: number
  path: string
  name: string
  content?: string
}

interface FileDeleteRequest {
  allowWithoutUndo?: boolean
  projectId: number
  path: string
  safe?: boolean
}

interface FileRenameRequest {
  allowWithoutUndo?: boolean
  projectId: number
  path: string
  name: string
}

interface FileMoveRequest {
  allowWithoutUndo?: boolean
  projectId: number
  sourcePath: string
  destPath: string
  overwrite?: boolean
}

interface DirDeleteRequest {
  allowWithoutUndo?: boolean
  projectId: number
  path: string
  recursive?: boolean
}

async function postJson<TResponse extends FileExplorerMutationResponse>(endpoint: string, body: unknown, requestErrorMessage: string): Promise<TResponse> {
  return postBackendJson(endpoint, body, requestErrorMessage,
    (result, context) => requireMutationResult<TResponse>(result, context, endpoint.endsWith("/move") ? ["oldPath", "newPath"] : ["path"]))
}

export async function createFileEntryService(request: FileCreateRequest): Promise<FileExplorerMutationResponse> {
  return postJson<FileExplorerMutationResponse>(backendUrl("/fs/file/create"), request, 'Falha ao criar arquivo')
}

export async function deleteFileEntryService(request: FileDeleteRequest): Promise<FileExplorerMutationResponse> {
  return postJson<FileExplorerMutationResponse>(backendUrl("/fs/file/delete"), request, 'Falha ao excluir arquivo')
}

export async function renameFileEntryService(request: FileRenameRequest): Promise<FileExplorerMutationResponse> {
  return postJson<FileExplorerMutationResponse>(backendUrl("/fs/file/rename"), request, 'Falha ao renomear arquivo')
}

export async function moveFileEntryService(request: FileMoveRequest): Promise<FileExplorerMutationResponse> {
  return postJson<FileExplorerMutationResponse>(backendUrl("/fs/file/move"), request, 'Falha ao mover arquivo')
}

export async function createDirectoryEntryService(request: FileCreateRequest): Promise<FileExplorerMutationResponse> {
  return postJson<FileExplorerMutationResponse>(backendUrl("/fs/dir/create"), request, 'Falha ao criar pasta')
}

export async function deleteDirectoryEntryService(request: DirDeleteRequest): Promise<FileExplorerMutationResponse> {
  return postJson<FileExplorerMutationResponse>(backendUrl("/fs/dir/delete"), request, 'Falha ao excluir pasta')
}

export async function renameDirectoryEntryService(request: FileRenameRequest): Promise<FileExplorerMutationResponse> {
  return postJson<FileExplorerMutationResponse>(backendUrl("/fs/dir/rename"), request, 'Falha ao renomear pasta')
}

export async function moveDirectoryEntryService(request: FileMoveRequest): Promise<FileExplorerMutationResponse> {
  return postJson<FileExplorerMutationResponse>(backendUrl("/fs/dir/move"), request, 'Falha ao mover pasta')
}
