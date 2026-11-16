'use client'

import { withUndoCapacity } from "@/lib/services/undo/undo-capacity"

import { useI18n } from "@/lib/i18n/locale-provider"
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FileNode } from '@/lib/types'
import {
  createDirectoryEntryController,
  createFileEntryController,
  deleteDirectoryEntryController,
  deleteFileEntryController,
  moveDirectoryEntryController,
  moveFileEntryController,
  renameDirectoryEntryController,
  renameFileEntryController,
} from '@/controllers/file-explorer/file-explorer.controller'

import { MutationGate } from '@/lib/models/model-editor/editor-session'
import { remapPath, pathKey, parentPath, type FileMutation } from '@/lib/models/model-editor/workspace-paths'

type CreatingNode = {
  parentPath: string
  type: 'file' | 'folder'
}

interface FileExplorerInteractionsParams {
  projectId: number
  repositoryPath: string
  files: FileNode[]
  readOnly?: boolean
  mutationGate?: MutationGate
  onWorkingChange?: (busy: boolean) => void
  onBackgroundError?: (message: string | null) => void
  onTreeChanged?: (mutation?: FileMutation) => Promise<void> | void
  onOpenFile?: (node: FileNode) => void
}

export interface FileExplorerInteractionsResult {
  selected: FileNode | null
  expanded: Set<string>
  creating: CreatingNode | null
  isWorking: boolean
  error: string | null
  clearError: () => void
  setSelected: (node: FileNode | null) => void
  toggleExpand: (id: string) => void
  handleExpandAll: (nodes: FileNode[]) => void
  handleCollapseAll: () => void
  handleStartCreate: (type: CreatingNode['type'], context?: FileNode | null) => void
  handleCancelCreate: () => void
  handleSubmitCreate: (name: string) => Promise<void>
  handleDeleteSelected: (expected?: FileNode) => Promise<boolean>
  handleRenameNode: (node: FileNode, name: string) => Promise<boolean>
  handleDropNode: (source: FileNode, target: FileNode) => Promise<void>
  handleDoubleClickNode: (node: FileNode) => void
  setCreating: (value: CreatingNode | null) => void
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').trim()
}

function resolveParentPath(selected: FileNode | null, repositoryPath: string): string {
  if (!selected || !selected.path) {
    return repositoryPath
  }

  if (selected.type === 'folder') {
    return selected.path
  }

  const parent = parentPath(selected.path)
  return parent ? normalizePath(parent) : repositoryPath
}

function resolveDropDestination(target: FileNode, repositoryPath: string): string {
  if (target.type === 'folder' && target.path) {
    return target.path
  }

  if (target.path) {
    const parent = parentPath(target.path)
    return parent ? normalizePath(parent) : repositoryPath
  }

  return repositoryPath
}

export function useFileExplorerInteractions({
  projectId,
  repositoryPath,
  onTreeChanged, files, readOnly = false, mutationGate, onWorkingChange, onBackgroundError,
  onOpenFile,
}: FileExplorerInteractionsParams): FileExplorerInteractionsResult {
  const { t } = useI18n()
  const [localGate] = useState(() => new MutationGate())
  const gate = mutationGate ?? localGate
  const busy = useRef(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const index = useMemo(() => {
    const result = new Map<string, FileNode>()
    const walk = (nodes: FileNode[]) => { for (const node of nodes) { result.set(node.id, node); walk(node.children ?? []) } }
    walk(files); return result
  }, [files])
  const [selected, setSelected] = useState<FileNode | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState<CreatingNode | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reportError = useCallback((message: string) => {
    if (alive.current) setError(message)
    else onBackgroundError?.(`${repositoryPath}: ${message}`)
  }, [repositoryPath, onBackgroundError])

  useEffect(() => {
    setSelected(previous => previous ? index.get(previous.id) ?? null : null)
    setExpanded(previous => new Set([...previous].filter(id => index.has(id))))
    setCreating(previous => previous && pathKey(previous.parentPath) !== pathKey(repositoryPath) && ![...index.values()].some(node => node.type === 'folder' && node.path && pathKey(node.path) === pathKey(previous.parentPath)) ? null : previous)
  }, [index, repositoryPath])
  useEffect(() => { if (readOnly) setCreating(null) }, [readOnly])

  const begin = useCallback(() => {
    if (readOnly || busy.current) return null
    const token = gate.acquire()
    if (!token) return null
    busy.current = true; setIsWorking(true); setError(null); onBackgroundError?.(null); onWorkingChange?.(true)
    return token
  }, [readOnly, gate, onWorkingChange, onBackgroundError])
  const finish = useCallback((token: object) => {
    gate.release(token); busy.current = false; setIsWorking(false); onWorkingChange?.(false)
  }, [gate, onWorkingChange])
  const handleAfterMutation = useCallback(async (mutation?: FileMutation) => {
    setCreating(null); setError(null)
    if (mutation) {
      setSelected(previous => {
        if (!previous?.path) return previous
        const path = remapPath(previous.path, mutation)
        return path ? { ...previous, path, id: path, name: path.replaceAll('\\','/').split('/').at(-1) ?? previous.name } : null
      })
      setExpanded(previous => new Set([...previous].map(id => remapPath(id, mutation)).filter((id): id is string => id !== null)))
    }
    await onTreeChanged?.(mutation)
  }, [onTreeChanged])

  const toggleExpand = useCallback((id: string) => {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const handleExpandAll = useCallback((nodes: FileNode[]) => {
    const all = new Set<string>()

    const walk = (items: FileNode[]) => {
      items.forEach((node) => {
        if (node.type === 'folder') {
          all.add(node.id)
          if (node.children) {
            walk(node.children)
          }
        }
      })
    }

    walk(nodes)
    setExpanded(all)
  }, [])

  const handleCollapseAll = useCallback(() => {
    setExpanded(new Set())
  }, [])

  const handleStartCreate = useCallback(
    (type: CreatingNode['type'], context?: FileNode | null) => {
      if (readOnly || busy.current) return
      setError(null)
      const parentPath = resolveParentPath(context === undefined ? selected : context, repositoryPath)
      setCreating({ parentPath, type })
      const folder = [...index.values()].find(node => node.type === 'folder' && node.path && pathKey(node.path) === pathKey(parentPath))
      if (folder) setExpanded(previous => new Set([...previous, folder.id]))
    },
    [repositoryPath, selected, readOnly, index]
  )

  const handleCancelCreate = useCallback(() => {
    setCreating(null)
    setError(null)
  }, [])

  const handleSubmitCreate = useCallback(
    async (name: string) => {
      if (!creating) {
        return
      }

      const trimmedName = name.trim()
      if (!trimmedName) {
        setCreating(null)
        return
      }

      const token = begin()
      if (!token) return

      try {
        if (creating.type === 'file') {
          await withUndoCapacity(allow => createFileEntryController({ projectId, parentPath: creating.parentPath, name: trimmedName }, allow), t("undo.capacityHelp"))
        } else {
          await withUndoCapacity(allow => createDirectoryEntryController({ projectId, parentPath: creating.parentPath, name: trimmedName }, allow), t("undo.capacityHelp"))
        }

        await handleAfterMutation()
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Erro ao criar item'
        reportError(message)
      } finally {
        finish(token)
      }
    },
    [projectId, creating, handleAfterMutation, begin, finish, reportError, t]
  )

  const handleDeleteSelected = useCallback(async (expected?: FileNode) => {
    const target = expected ? index.get(expected.id) : selected
    if (!target?.path || (expected?.path && pathKey(target.path) !== pathKey(expected.path))) {
      reportError(t('explorer.ui.stale')); return false
    }

    const token = begin()
    if (!token) return false

    try {
      let recoveryPath: string | undefined
      if (target.type === 'file') {
        recoveryPath = (await withUndoCapacity(allow => deleteFileEntryController({ projectId, path: target.path! }, allow), t("undo.capacityHelp"))).recoveryPath
      } else {
        recoveryPath = (await withUndoCapacity(allow => deleteDirectoryEntryController({ projectId, path: target.path! }, allow), t("undo.capacityHelp"))).recoveryPath
      }

      await handleAfterMutation({ from: target.path })
      setSelected(null)
      if (recoveryPath) reportError(t("explorer.recoveryCopy", { path: recoveryPath }))
      return true
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Erro ao excluir item'
      reportError(message)
      return false
    } finally {
      finish(token)
    }
  }, [projectId, handleAfterMutation, selected, index, t, begin, finish, reportError])

  const handleRenameNode = useCallback(async (node: FileNode, name: string) => {
    const current = index.get(node.id)
    if (!node.path || !current?.path || pathKey(current.path) !== pathKey(node.path)) {
      reportError(t('explorer.ui.stale'))
      return false
    }

    const trimmedName = name.trim()
    if (!trimmedName || trimmedName === node.name) {
      return true
    }

    const token = begin()
    if (!token) return false

    try {
      if (node.type === 'file') {
        await withUndoCapacity(allow => renameFileEntryController({ projectId, path: node.path!, name: trimmedName }, allow), t("undo.capacityHelp"))
      } else {
        await withUndoCapacity(allow => renameDirectoryEntryController({ projectId, path: node.path!, name: trimmedName }, allow), t("undo.capacityHelp"))
      }

      await handleAfterMutation({ from: node.path, to: parentPath(node.path).replace(/\/+$/, '') + '/' + trimmedName })
      return true
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Erro ao renomear item'
      reportError(message)
      return false
    } finally {
      finish(token)
    }
  }, [projectId, index, handleAfterMutation, begin, finish, reportError, t])

  const handleDropNode = useCallback(async (source: FileNode, target: FileNode) => {
    if (!source.path) {
      return
    }

    const destinationPath = resolveDropDestination(target, repositoryPath)
    if (!destinationPath) {
      return
    }

    const token = begin()
    if (!token) return

    try {
      let recoveryPath: string | undefined
      if (source.type === 'file') {
        recoveryPath = (await withUndoCapacity(allow => moveFileEntryController({ projectId, sourcePath: source.path!, destPath: destinationPath }, allow), t("undo.capacityHelp"))).recoveryPath
      } else {
        await withUndoCapacity(allow => moveDirectoryEntryController({ projectId, sourcePath: source.path!, destPath: destinationPath }, allow), t("undo.capacityHelp"))
      }

      await handleAfterMutation({ from: source.path, to: normalizePath(destinationPath).replace(/\/+$/, '') + '/' + source.name })
      if (recoveryPath) reportError(t("explorer.recoveryCopy", { path: recoveryPath }))
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Erro ao mover item'
      reportError(message)
    } finally {
      finish(token)
    }
  }, [projectId, handleAfterMutation, repositoryPath, t, begin, finish, reportError])

  const handleDoubleClickNode = useCallback(
    (node: FileNode) => {
      if (node.type === 'file') {
        onOpenFile?.(node)
      }
    },
    [onOpenFile]
  )

  return {
    selected,
    expanded,
    creating,
    isWorking,
    error,
    clearError: () => setError(null),
    setSelected,
    toggleExpand,
    handleExpandAll,
    handleCollapseAll,
    handleStartCreate,
    handleCancelCreate,
    handleSubmitCreate,
    handleDeleteSelected,
    handleRenameNode,
    handleDropNode,
    handleDoubleClickNode,
    setCreating,
  }
}
