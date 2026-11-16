"use client"

import { unwrapBackendAction } from "@/lib/services/backend-action-result"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { StagedFile } from "@/lib/types"
import {
  commitChangesController,
  initCommitMenuRepositoryController,
  loadCommitMenuStatusController,
  type CommitMenuStatusEntry,
} from "@/controllers/commit-menu/commit-menu.controller"
import { useI18n } from "@/lib/i18n/locale-provider"

const DEFAULT_REPOSITORY_PATH = ""

export interface UseCommitMenuInteractionsParams {
  isVisible?: boolean
  repositoryPath?: string
  changeSignal?: number
}

export interface UseCommitMenuInteractionsResult {
  stagedFiles: StagedFile[]
  needsInitialSnapshot: boolean
  isRepo: boolean | null
  isLoading: boolean
  isCommitting: boolean
  error: string | null
  repositoryPath: string
  handleInitRepository: () => void
  handleCommitChanges: (title: string, description?: string) => Promise<void>
  handleRefresh: () => void
}

function resolveFileDisplay(filePath: string): { fileName: string; directory: string } {
  const normalizedPath = filePath.replace(/\\/g, "/")
  const parts = normalizedPath.split("/").filter(Boolean)
  const fileName = parts.pop() ?? normalizedPath
  const directory = parts.length > 0 ? `${parts.join("/")}/` : "./"

  return { fileName, directory }
}

function mapEntriesToStagedFiles(entries: CommitMenuStatusEntry[]): StagedFile[] {
  return entries.map((entry) => {
    const { fileName, directory } = resolveFileDisplay(entry.path)

    return {
      id: `${entry.status}:${entry.path}`,
      fileName,
      status: entry.status,
      path: directory,
    }
  })
}

export function useCommitMenuInteractions({
  isVisible = false,
  repositoryPath = DEFAULT_REPOSITORY_PATH,
  changeSignal,
}: UseCommitMenuInteractionsParams = {}): UseCommitMenuInteractionsResult {
  const { t } = useI18n()
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([])
  const [needsInitialSnapshot, setNeedsInitialSnapshot] = useState(false)
  const [isRepo, setIsRepo] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCommitting, setIsCommitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const statusRequest = useRef(0)

  const resolvedRepositoryPath = useMemo(() => repositoryPath.trim() || DEFAULT_REPOSITORY_PATH, [repositoryPath])

  const handleRefresh = useCallback(async () => {
    const request = ++statusRequest.current
    setIsLoading(true)
    setError(null)

    try {
      const response = unwrapBackendAction(await loadCommitMenuStatusController({
        repositoryPath: resolvedRepositoryPath,
      }))

      if (request !== statusRequest.current) return
      setIsRepo(response.isRepo)
      setNeedsInitialSnapshot(response.needsInitialSnapshot ?? false)
      setStagedFiles(mapEntriesToStagedFiles(response.entries))
    } catch (caught) {
      if (request !== statusRequest.current) return
      const message = caught instanceof Error ? caught.message : t('errors.gitStatus')
      setError(message)
      setIsRepo(false)
      setStagedFiles([])
    } finally {
      if (request === statusRequest.current) setIsLoading(false)
    }
  }, [resolvedRepositoryPath, t])

  const handleInitRepository = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      unwrapBackendAction(await initCommitMenuRepositoryController({
        repositoryPath: resolvedRepositoryPath,
      }))

      setIsRepo(true)
      await handleRefresh()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t('errors.gitInit')
      setError(message)
      setIsRepo(false)
      setStagedFiles([])
      throw caught
    } finally {
      setIsLoading(false)
    }
  }, [handleRefresh, resolvedRepositoryPath, t])

  const handleCommitChanges = useCallback(
    async (title: string, description?: string) => {
      setIsCommitting(true)
      setError(null)

      try {
        unwrapBackendAction(await commitChangesController({
          repositoryPath: resolvedRepositoryPath,
          title,
          description,
        }))

        await handleRefresh()
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : t('errors.commit')
        setError(message)
        throw caught
      } finally {
        setIsCommitting(false)
      }
    },
    [handleRefresh, resolvedRepositoryPath, t]
  )

  useEffect(() => {
    if (isVisible) void handleRefresh()
    return () => { statusRequest.current += 1 }
  }, [handleRefresh, isVisible, changeSignal])

  return {
    stagedFiles,
    needsInitialSnapshot,
    isRepo,
    isLoading,
    isCommitting,
    error,
    repositoryPath: resolvedRepositoryPath,
    handleInitRepository,
    handleCommitChanges,
    handleRefresh,
  }
}
