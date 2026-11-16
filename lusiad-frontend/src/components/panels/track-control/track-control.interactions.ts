"use client"

import { unwrapBackendAction } from "@/lib/services/backend-action-result"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  createTrackBranchController,
  loadTrackControlController,
  mergeSelectedBranchController,
  type TrackControlBranch,
  type TrackControlCommit,
} from "@/controllers/track-control/track-control.controller"
import { useI18n } from "@/lib/i18n/locale-provider"
import type { HistoryTagsSnapshot } from "@/lib/models/history-tags/history-tags.model"
import type { GraphChangeMarker } from "@/lib/models/change-history/commit-graph"

const DEFAULT_REPOSITORY_PATH = ""

export interface UseTrackControlInteractionsParams {
  isVisible?: boolean
  repositoryPath?: string
  changeSignal?: number
  focusCommitId?: number
}

export interface UseTrackControlInteractionsResult {
  branches: TrackControlBranch[]
  commits: TrackControlCommit[]
  selectedBranch: TrackControlBranch | null
  activeBranches: TrackControlBranch[]
  focusedBranch: TrackControlBranch | null
  selectedCommit: TrackControlCommit | null
  selectedChange: GraphChangeMarker | null
  historyTags: HistoryTagsSnapshot | null
  changeMarkers: GraphChangeMarker[]
  isLoading: boolean
  isWorking: boolean
  error: string | null
  repositoryPath: string
  handleCreateBranch: (name: string) => Promise<void>
  handleMergeSelectedBranch: () => Promise<void>
  handleSelectCommit: (commitId: number) => void
  handleSelectBranch: (branchId: number) => void
  handleSelectChange: (changeId: number) => void
  hasMore: boolean
  isLoadingMore: boolean
  handleLoadMore: () => Promise<void>
  handleRefresh: () => void
}

function groupCommitsByBranch(commits: TrackControlCommit[]) {
  const map = new Map<number, TrackControlCommit[]>()

  for (const commit of commits) {
    const existing = map.get(commit.branchId)
    if (existing) {
      existing.push(commit)
    } else {
      map.set(commit.branchId, [commit])
    }
  }

  for (const list of map.values()) {
    list.sort((a, b) => b.id - a.id)
  }

  return map
}

export function useTrackControlInteractions({
  isVisible = false,
  repositoryPath = DEFAULT_REPOSITORY_PATH,
  changeSignal, focusCommitId,
}: UseTrackControlInteractionsParams = {}): UseTrackControlInteractionsResult {
  const { t } = useI18n()
  const [branches, setBranches] = useState<TrackControlBranch[]>([])
  const [commits, setCommits] = useState<TrackControlCommit[]>([])
  const [selectedCommitId, setSelectedCommitId] = useState<number | null>(null)
  const [focusedBranchId, setFocusedBranchId] = useState<number | null>(null)
  const [selectedChangeId, setSelectedChangeId] = useState<number | null>(null)
  const [historyTags, setHistoryTags] = useState<HistoryTagsSnapshot | null>(null)
  const [changeMarkers, setChangeMarkers] = useState<GraphChangeMarker[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const statusRequest = useRef(0)
  const moreRequest = useRef(0)
  const [nextBeforeId, setNextBeforeId] = useState<number | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const resolvedRepositoryPath = useMemo(
    () => repositoryPath.trim() || DEFAULT_REPOSITORY_PATH,
    [repositoryPath]
  )

  const handleRefresh = useCallback(async () => {
    const request = ++statusRequest.current
    moreRequest.current += 1
    setIsLoadingMore(false)
    setNextBeforeId(null)
    setIsLoading(true)
    setError(null)

    try {
      const response = unwrapBackendAction(await loadTrackControlController({ repositoryPath: resolvedRepositoryPath, focusCommitId }))
      if (request !== statusRequest.current) return
      setBranches(response.branches)
      setCommits(response.commits)
      setNextBeforeId(response.nextBeforeId)
      setHistoryTags(response.historyTags)
      setChangeMarkers(response.changeMarkers)
    } catch (caught) {
      if (request !== statusRequest.current) return
      const message = caught instanceof Error ? caught.message : t('errors.loadBranches')
      setError(message)
      setBranches([])
      setCommits([])
      setHistoryTags(null); setChangeMarkers([])
    } finally {
      if (request === statusRequest.current) setIsLoading(false)
    }
  }, [resolvedRepositoryPath, focusCommitId, t])

  const handleLoadMore = useCallback(async () => {
    if (nextBeforeId === null || isLoadingMore || isLoading) return
    const generation = statusRequest.current, request = ++moreRequest.current
    setIsLoadingMore(true)
    try {
      const response = unwrapBackendAction(await loadTrackControlController({ repositoryPath: resolvedRepositoryPath, beforeId: nextBeforeId }))
      if (generation !== statusRequest.current || request !== moreRequest.current) return
      setCommits(previous => [...previous, ...response.commits.filter(row => !previous.some(existing => existing.id === row.id))])
      setNextBeforeId(response.nextBeforeId)
      setHistoryTags(response.historyTags)
      setChangeMarkers(previous => [...previous.filter(row => !response.changeMarkers.some(item => item.id === row.id)), ...response.changeMarkers])
      setError(null)
    } catch (caught) {
      if (generation === statusRequest.current && request === moreRequest.current)
        setError(caught instanceof Error ? caught.message : t('errors.loadBranches'))
    } finally { if (generation === statusRequest.current && request === moreRequest.current) setIsLoadingMore(false) }
  }, [isLoading, isLoadingMore, nextBeforeId, resolvedRepositoryPath, t])

  const handleCreateBranch = useCallback(
    async (name: string) => {
      setIsWorking(true)
      setError(null)

      try {
        unwrapBackendAction(await createTrackBranchController({
          repositoryPath: resolvedRepositoryPath,
          name,
        }))

        await handleRefresh()
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : t('errors.createBranch')
        setError(message)
        throw caught
      } finally {
        setIsWorking(false)
      }
    },
    [handleRefresh, resolvedRepositoryPath, t]
  )

  const handleMergeSelectedBranch = useCallback(async () => {
    setIsWorking(true)
    setError(null)

    try {
      unwrapBackendAction(await mergeSelectedBranchController({ repositoryPath: resolvedRepositoryPath }))
      await handleRefresh()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t('errors.mergeBranch')
      setError(message)
      throw caught
    } finally {
      setIsWorking(false)
    }
  }, [handleRefresh, resolvedRepositoryPath, t])

  useEffect(() => {
    if (isVisible) void handleRefresh()
    return () => { statusRequest.current += 1 }
  }, [handleRefresh, isVisible, changeSignal])

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.selected) ?? null,
    [branches]
  )

  const activeBranches = useMemo(
    () => branches.filter((branch) => branch.active),
    [branches]
  )

  const selectedCommit = useMemo(() => {
    if (!selectedCommitId) {
      return null
    }

    return commits.find((commit) => commit.id === selectedCommitId) ?? null
  }, [commits, selectedCommitId])

  const focusedBranch = useMemo(() => {
    if (!focusedBranchId) {
      return null
    }

    return branches.find((branch) => branch.id === focusedBranchId) ?? null
  }, [branches, focusedBranchId])

  const handleSelectCommit = useCallback((id: number) => { setSelectedCommitId(id); setSelectedChangeId(null) }, [])
  const handleSelectBranch = useCallback((id: number) => { setFocusedBranchId(id); setSelectedCommitId(null); setSelectedChangeId(null) }, [])
  const handleSelectChange = useCallback((id: number) => { setSelectedChangeId(id); setSelectedCommitId(null) }, [])
  const selectedChange = changeMarkers.find(change => change.id === selectedChangeId) ?? null

  return {
    branches,
    commits,
    selectedBranch,
    activeBranches,
    focusedBranch,
    selectedCommit,
    selectedChange, historyTags, changeMarkers,
    isLoading,
    isWorking,
    error,
    repositoryPath: resolvedRepositoryPath,
    handleCreateBranch,
    handleMergeSelectedBranch,
    handleSelectCommit, handleSelectBranch, handleSelectChange,
    handleRefresh, hasMore: nextBeforeId !== null, isLoadingMore, handleLoadMore,
  }
}

export function useCommitGraph(branches: TrackControlBranch[], commits: TrackControlCommit[]) {
  const commitsByBranch = useMemo(() => groupCommitsByBranch(commits), [commits])

  const orderedBranches = useMemo(() => {
    const activeFirst = [...branches].sort((a, b) => {
      if (a.selected && !b.selected) return -1
      if (b.selected && !a.selected) return 1
      if (a.active && !b.active) return -1
      if (b.active && !a.active) return 1
      return a.id - b.id
    })

    return activeFirst
  }, [branches])

  return {
    orderedBranches,
    commitsByBranch,
  }
}
