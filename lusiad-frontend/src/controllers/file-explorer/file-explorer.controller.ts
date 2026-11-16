'use server'

import { assertPathName } from "@/lib/services/contained-paths"
import { backendAction } from "@/lib/services/backend-action"
import { isJavaFileName } from '@/lib/models/file-explorer/file-kind'
import { BackendApiError } from '@/lib/services/backend-response'

import { basename, dirname, join } from 'node:path'
import { withLusiadMutation } from '@/lib/services/external-sync/external-sync.service'
import {
  createDirectoryFeature,
  createFileFeature,
  deleteDirectoryFeature,
  deleteFileFeature,
  moveDirectoryFeature,
  moveFileFeature,
  renameDirectoryFeature,
  renameFileFeature,
} from '@/features/file-explorer/file-explorer.feature'

function requirePath(path: string, message: string): string {
  const trimmed = path.trim()

  if (!trimmed) {
    throw new Error(message)
  }

  return trimmed
}

function requireName(name: string, message: string): string {
  const trimmed = name.trim()

  if (!trimmed) {
    throw new Error(message)
  }

  assertPathName(trimmed)
  return trimmed
}

export async function createFileEntryController(params: {
  projectId: number
  parentPath: string
  name: string
  content?: string
}, allowWithoutUndo = false) {
  return backendAction(async () => {
    const parentPath = requirePath(params.parentPath, 'Informe o caminho do diretório pai')
    const name = requireName(params.name, 'Informe o nome do arquivo')
    if (!isJavaFileName(name)) throw new BackendApiError('File', 'Only Java files can be created', 'java_file_required', 400)

    return withLusiadMutation(params.projectId, [join(parentPath, name)], () => createFileFeature({
      projectId: params.projectId, allowWithoutUndo,
      path: parentPath,
      name,
      content: params.content,
    }), { kind: "file", destination: join(parentPath, name), content: params.content })
  })
}

export async function createDirectoryEntryController(params: {
  projectId: number
  parentPath: string
  name: string
}, allowWithoutUndo = false) {
  return backendAction(async () => {
    const parentPath = requirePath(params.parentPath, 'Informe o caminho do diretório pai')
    const name = requireName(params.name, 'Informe o nome da pasta')

    return withLusiadMutation(params.projectId, [join(parentPath, name)], () => createDirectoryFeature({
      projectId: params.projectId, allowWithoutUndo,
      path: parentPath,
      name,
    }), { kind: "directory", destination: join(parentPath, name) })
  })
}

export async function deleteFileEntryController(params: { projectId: number; path: string }, allowWithoutUndo = false) {
  return backendAction(async () => {
    const path = requirePath(params.path, 'Informe o caminho do arquivo')
    return withLusiadMutation(params.projectId, [path], () => deleteFileFeature({ projectId: params.projectId, allowWithoutUndo, path }), { kind: "file", source: path })
  })
}

export async function deleteDirectoryEntryController(params: { projectId: number; path: string }, allowWithoutUndo = false) {
  return backendAction(async () => {
    const path = requirePath(params.path, 'Informe o caminho da pasta')
    return withLusiadMutation(params.projectId, [path], () => deleteDirectoryFeature({ projectId: params.projectId, allowWithoutUndo, path }), { kind: "directory", source: path })
  })
}

export async function renameFileEntryController(params: { projectId: number; path: string; name: string }, allowWithoutUndo = false) {
  return backendAction(async () => {
    const path = requirePath(params.path, 'Informe o caminho do arquivo')
    const name = requireName(params.name, 'Informe o novo nome do arquivo')
    return withLusiadMutation(params.projectId, [path, join(dirname(path), name)], () => renameFileFeature({ projectId: params.projectId, allowWithoutUndo, path, name }), { kind: "file", source: path, destination: join(dirname(path), name) })
  })
}

export async function renameDirectoryEntryController(params: { projectId: number; path: string; name: string }, allowWithoutUndo = false) {
  return backendAction(async () => {
    const path = requirePath(params.path, 'Informe o caminho da pasta')
    const name = requireName(params.name, 'Informe o novo nome da pasta')
    return withLusiadMutation(params.projectId, [path, join(dirname(path), name)], () => renameDirectoryFeature({ projectId: params.projectId, allowWithoutUndo, path, name }), { kind: "directory", source: path, destination: join(dirname(path), name) })
  })
}

export async function moveFileEntryController(params: {
  projectId: number
  sourcePath: string
  destPath: string
}, allowWithoutUndo = false) {
  return backendAction(async () => {
    const sourcePath = requirePath(params.sourcePath, 'Informe o arquivo de origem')
    const destPath = requirePath(params.destPath, 'Informe o diretório de destino')

    return withLusiadMutation(params.projectId, [sourcePath, join(destPath, basename(sourcePath))], () => moveFileFeature({
      projectId: params.projectId, allowWithoutUndo,
      sourcePath,
      destPath,
    }), { kind: "file", source: sourcePath, destination: join(destPath, basename(sourcePath)) })
  })
}

export async function moveDirectoryEntryController(params: {
  projectId: number
  sourcePath: string
  destPath: string
}, allowWithoutUndo = false) {
  return backendAction(async () => {
    const sourcePath = requirePath(params.sourcePath, 'Informe a pasta de origem')
    const destPath = requirePath(params.destPath, 'Informe o diretório de destino')

    return withLusiadMutation(params.projectId, [sourcePath, join(destPath, basename(sourcePath))], () => moveDirectoryFeature({
      projectId: params.projectId, allowWithoutUndo,
      sourcePath,
      destPath,
    }), { kind: "directory", source: sourcePath, destination: join(destPath, basename(sourcePath)) })
  })
}

/** Read the registered live root, never a browser-supplied filesystem path. */
export async function loadWorkspaceTreeController(projectId: number) {
  return backendAction(async () => {
    const { findProjectById } = await import("@/lib/repositories/track-control/track-control.repository")
    const { loadFileTree } = await import("@/lib/services/file-explorer/file-explorer.service")
    const project = await findProjectById(projectId)
    if (!project) throw new Error("Project not found")
    return loadFileTree(project.path)
  })
}
