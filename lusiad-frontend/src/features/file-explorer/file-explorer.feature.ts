import type { FileExplorerMutationResponse } from '@/lib/models/file-explorer/file-explorer.model'
import {
  createDirectoryEntryService,
  createFileEntryService,
  deleteDirectoryEntryService,
  deleteFileEntryService,
  moveDirectoryEntryService,
  moveFileEntryService,
  renameDirectoryEntryService,
  renameFileEntryService,
} from '@/lib/services/file-explorer/file-explorer-api.service'

interface FileOperationParams {
  allowWithoutUndo?: boolean
  projectId: number
  path: string
}

interface CreateFileFeatureParams extends FileOperationParams {
  name: string
  content?: string
}

interface CreateDirectoryFeatureParams extends FileOperationParams {
  name: string
}

interface RenameFeatureParams extends FileOperationParams {
  name: string
}

interface MoveFeatureParams {
  allowWithoutUndo?: boolean
  projectId: number
  sourcePath: string
  destPath: string
  overwrite?: boolean
}

interface DeleteDirectoryFeatureParams extends FileOperationParams {
  recursive?: boolean
}

function ensureMutationOk(response: FileExplorerMutationResponse, fallbackMessage: string): FileExplorerMutationResponse {
  if (response.error) {
    throw new Error(response.error)
  }

  if (response.status && response.status !== 'ok') {
    throw new Error(response.message || fallbackMessage)
  }

  return response
}

export async function createFileFeature(params: CreateFileFeatureParams): Promise<FileExplorerMutationResponse> {
  return ensureMutationOk(
    await createFileEntryService({
      projectId: params.projectId, allowWithoutUndo: params.allowWithoutUndo,
      path: params.path,
      name: params.name,
      content: params.content,
    }),
    'Falha ao criar arquivo'
  )
}

export async function createDirectoryFeature(params: CreateDirectoryFeatureParams): Promise<FileExplorerMutationResponse> {
  return ensureMutationOk(
    await createDirectoryEntryService({
      projectId: params.projectId, allowWithoutUndo: params.allowWithoutUndo,
      path: params.path,
      name: params.name,
    }),
    'Falha ao criar pasta'
  )
}

export async function deleteFileFeature(params: FileOperationParams): Promise<FileExplorerMutationResponse> {
  return ensureMutationOk(
    await deleteFileEntryService({
      projectId: params.projectId, allowWithoutUndo: params.allowWithoutUndo,
      path: params.path,
      safe: true,
    }),
    'Falha ao excluir arquivo'
  )
}

export async function deleteDirectoryFeature(
  params: DeleteDirectoryFeatureParams
): Promise<FileExplorerMutationResponse> {
  return ensureMutationOk(
    await deleteDirectoryEntryService({
      projectId: params.projectId, allowWithoutUndo: params.allowWithoutUndo,
      path: params.path,
      recursive: params.recursive ?? true,
    }),
    'Falha ao excluir pasta'
  )
}

export async function renameFileFeature(params: RenameFeatureParams): Promise<FileExplorerMutationResponse> {
  return ensureMutationOk(
    await renameFileEntryService({
      projectId: params.projectId, allowWithoutUndo: params.allowWithoutUndo,
      path: params.path,
      name: params.name,
    }),
    'Falha ao renomear arquivo'
  )
}

export async function renameDirectoryFeature(params: RenameFeatureParams): Promise<FileExplorerMutationResponse> {
  return ensureMutationOk(
    await renameDirectoryEntryService({
      projectId: params.projectId, allowWithoutUndo: params.allowWithoutUndo,
      path: params.path,
      name: params.name,
    }),
    'Falha ao renomear pasta'
  )
}

export async function moveFileFeature(params: MoveFeatureParams): Promise<FileExplorerMutationResponse> {
  return ensureMutationOk(
    await moveFileEntryService({
      projectId: params.projectId, allowWithoutUndo: params.allowWithoutUndo,
      sourcePath: params.sourcePath,
      destPath: params.destPath,
      overwrite: params.overwrite ?? false,
    }),
    'Falha ao mover arquivo'
  )
}

export async function moveDirectoryFeature(params: MoveFeatureParams): Promise<FileExplorerMutationResponse> {
  return ensureMutationOk(
    await moveDirectoryEntryService({
      projectId: params.projectId, allowWithoutUndo: params.allowWithoutUndo,
      sourcePath: params.sourcePath,
      destPath: params.destPath,
    }),
    'Falha ao mover pasta'
  )
}
