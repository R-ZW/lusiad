"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Change, Commit } from "@/lib/types"
import type { ChangeHistoryRecord } from "@/lib/models/change-history/change-history.model"
import {
  loadChangeHistoryController,
  type ChangeHistoryControllerResult,
} from "@/controllers/change-history/change-history.controller"
import {
  loadCommitHistoryController,
  type CommitHistoryControllerResult,
} from "@/controllers/commit-history/commit-history.controller"
import { useI18n } from "@/lib/i18n/locale-provider"
import { localizeGeneratedChange } from "@/lib/i18n/change-text"
import type { AppLocale } from "@/lib/i18n/core"
import type { HistoryQuery } from "@/lib/models/change-history/history-query.model"
import type { HistoryTagsSnapshot } from "@/lib/models/history-tags/history-tags.model"

const DEFAULT_LIMIT = 250

export interface UseChangeHistoryInteractionsParams {
  projectId: number
  pageSize: number
  pageIndex: number
  baseCommits?: Commit[]
  isVisible?: boolean
  isUncommittedOpen?: boolean
  changeSignal?: number
  onRestoreChange?: (change: Change) => Promise<void> | void
  filter?: HistoryQuery
}

export interface UseChangeHistoryInteractionsResult {
  commits: Commit[]
  totalCommitCount: number
  uncommittedChanges: Change[]
  uncommittedCount: number
  hasUncommittedCount: boolean
  isCountLoading: boolean
  isCommittedLoading: boolean
  isCurrentPage: boolean
  isDetailsLoading: boolean
  error: string | null
  historyTags: HistoryTagsSnapshot | null
  hasMorePending: boolean
  handleMorePending: () => Promise<void>
  handleReload: () => Promise<void> | void
  handleRestoreChange: (change: Change) => Promise<void>
}

function mapRecordToChange(record: ChangeHistoryRecord, locale: AppLocale): Change {
  const parsedTimestamp = new Date(record.timestamp)
  const resolvedTimestamp = Number.isNaN(parsedTimestamp.getTime()) ? new Date() : parsedTimestamp

  return localizeGeneratedChange({
    id: record.id,
    title: record.title,
    description: record.description,
    timestamp: resolvedTimestamp,
    type: record.type,
    changeType: record.changeType,
    scope: record.scope,
    fileName: record.fileName,
    commitId: record.commitId,
    reqBody: record.reqBody,
  }, locale)
}

function resolveCommitChanges(commitId: string, snapshot: ChangeHistoryControllerResult | null): ChangeHistoryRecord[] {
  if (!snapshot) {
    return []
  }

  const direct = snapshot.committedChangesByCommitId[commitId]
  if (direct) {
    return direct
  }

  if (commitId.startsWith("commit-")) {
    const stripped = commitId.slice("commit-".length)
    return snapshot.committedChangesByCommitId[stripped] ?? []
  }

  const prefixed = `commit-${commitId}`
  return snapshot.committedChangesByCommitId[prefixed] ?? []
}

export function useChangeHistoryInteractions(
  {
    projectId,
    pageSize,
    pageIndex,
    baseCommits = [],
    isVisible = true,
    isUncommittedOpen = false,
    changeSignal,
    onRestoreChange,
    filter,
  }: UseChangeHistoryInteractionsParams
): UseChangeHistoryInteractionsResult {
  const { changeTextLocale, t } = useI18n()
  const [snapshot, setSnapshot] = useState<ChangeHistoryControllerResult | null>(null)
  const [commitRecords, setCommitRecords] = useState<CommitHistoryControllerResult['records'] | null>(null)
  const [historyTags, setHistoryTags] = useState<HistoryTagsSnapshot | null>(null)
  const [totalCommitCount, setTotalCommitCount] = useState(0)
  const [uncommittedChanges, setUncommittedChanges] = useState<Change[]>([])
  const [uncommittedCount, setUncommittedCount] = useState(0)
  const [hasUncommittedCount, setHasUncommittedCount] = useState(false)
  const [isCountLoading, setIsCountLoading] = useState(false)
  const [isCommittedLoading, setIsCommittedLoading] = useState(false)
  const [loadedPageKey, setLoadedPageKey] = useState('')
  const [isUncommittedLoading, setIsUncommittedLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const commitListRequestIdRef = useRef(0)
  const uncommittedRequestIdRef = useRef(0)
  const commitAnchor = useRef<{ key: string; upperId: number } | null>(null)
  const [pendingPage, setPendingPage] = useState<ChangeHistoryControllerResult["pendingPage"]>(undefined)
  const pendingPageRef = useRef(pendingPage)
  useEffect(() => { pendingPageRef.current = pendingPage }, [pendingPage])
  const lastChangeSignalRef = useRef<number | null>(null)
  const isDetailsLoading = isCommittedLoading || isUncommittedLoading
  const query = filter?.query ?? ""
  const showMerges = filter?.showMerges ?? true
  const showBranches = filter?.showBranches ?? true
  const taggedOnly = filter?.taggedOnly ?? false
  const pageKey = JSON.stringify([projectId, query, showMerges, showBranches, taggedOnly, pageIndex, pageSize])

  const loadCommitPage = useCallback(async (refresh = false) => {
    const requestId = commitListRequestIdRef.current + 1
    commitListRequestIdRef.current = requestId
    setIsCommittedLoading(true)
    setError(null)

    try {
      const offset = Math.max(0, pageIndex) * Math.max(1, pageSize)
      const key = JSON.stringify([projectId, query, showMerges, showBranches, taggedOnly])
      const upperId = !refresh && commitAnchor.current?.key === key ? commitAnchor.current.upperId || undefined : undefined
      const response = await loadCommitHistoryController({ projectId, limit: pageSize, offset, upperId,
        filter: { query, showMerges, showBranches, taggedOnly } })

      if (commitListRequestIdRef.current === requestId) {
        const commitIds = response.records.map((commit) => commit.id)
        const committedResponse = await loadChangeHistoryController({
          projectId,
          commitIds,
          limit: pageSize,
          includeUncommittedDetails: false,
          includeUncommittedCount: false,
        })

        if (commitListRequestIdRef.current === requestId) {
          commitAnchor.current = { key, upperId: response.upperId }
          setCommitRecords(response.records)
          setTotalCommitCount(response.totalCount)
          setHistoryTags(response.historyTags)
          setSnapshot(committedResponse)
          setLoadedPageKey(pageKey)
        }
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Erro ao carregar commits"
      console.warn(message)
      if (commitListRequestIdRef.current === requestId) {
        setError(t('errors.loadCommits')); setCommitRecords([]); setSnapshot(null); setHistoryTags(null)
      }
    } finally {
      if (commitListRequestIdRef.current === requestId) setIsCommittedLoading(false)
    }
  }, [pageIndex, pageSize, projectId, query, showMerges, showBranches, taggedOnly, pageKey, t])

  const loadUncommittedDetails = useCallback(async (more = false) => {
    const cursor = more ? pendingPageRef.current : undefined
    if (more && (!cursor || cursor.nextBeforeId === null)) return
    const requestId = uncommittedRequestIdRef.current + 1
    uncommittedRequestIdRef.current = requestId

    setIsCountLoading(true)
    setIsUncommittedLoading(true)
    setError(null)

    try {
      const response = await loadChangeHistoryController({
        projectId,
        limit: DEFAULT_LIMIT,
        commitIds: [],
        pendingBeforeId: cursor?.nextBeforeId ?? undefined,
        pendingRevision: cursor?.revision,
        includeUncommittedDetails: true,
        includeUncommittedCount: true,
      })

      if (uncommittedRequestIdRef.current === requestId) {
        const page = response.uncommittedChanges.map((record) => mapRecordToChange(record, changeTextLocale))
        setUncommittedChanges(previous => more ? [...previous, ...page] : page)
        setPendingPage(response.pendingPage)
        setUncommittedCount(response.uncommittedCount)
        setHasUncommittedCount(true)
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Erro ao carregar mudancas"
      console.warn(message)
      if (uncommittedRequestIdRef.current === requestId) {
        setError(t(more ? 'history.pendingChanged' : 'errors.loadChanges'))
        setUncommittedChanges([]); setPendingPage(undefined); setHasUncommittedCount(false)
      }
    } finally {
      if (uncommittedRequestIdRef.current === requestId) {
        setIsCountLoading(false)
        setIsUncommittedLoading(false)
      }
    }
  }, [changeTextLocale, projectId, t])

  const loadUncommittedCount = useCallback(async () => {
    const requestId = ++uncommittedRequestIdRef.current
    setIsCountLoading(true)
    try {
      const response = await loadChangeHistoryController({ projectId, limit: 1, commitIds: [],
        includeUncommittedDetails: false, includeUncommittedCount: true })
      if (uncommittedRequestIdRef.current === requestId) {
        setUncommittedCount(response.uncommittedCount)
        setHasUncommittedCount(true)
      }
    } catch {
      if (uncommittedRequestIdRef.current === requestId) setError(t('errors.loadChanges'))
    } finally {
      if (uncommittedRequestIdRef.current === requestId) setIsCountLoading(false)
    }
  }, [projectId, t])

  useEffect(() => {
    if (!isVisible) {
      commitListRequestIdRef.current += 1
      uncommittedRequestIdRef.current += 1
      commitAnchor.current = null
      setPendingPage(undefined)
      setHasUncommittedCount(false)
      setUncommittedCount(0)
      setSnapshot(null)
      setCommitRecords(null)
      setHistoryTags(null)
      setTotalCommitCount(0)
      setUncommittedChanges([])
      setIsCommittedLoading(false)
      setIsUncommittedLoading(false)
      setIsCountLoading(false)
      setError(null)
      return
    }

    void loadCommitPage()
    return () => { commitListRequestIdRef.current += 1 }
  }, [isVisible, loadCommitPage])

  useEffect(() => {
    if (!isVisible) {
      uncommittedRequestIdRef.current += 1
      setIsUncommittedLoading(false)
      setIsCountLoading(false)
      return
    }

    if (isUncommittedOpen) void loadUncommittedDetails()
    else { setIsUncommittedLoading(false); void loadUncommittedCount() }
    return () => { uncommittedRequestIdRef.current += 1 }
  }, [isVisible, isUncommittedOpen, loadUncommittedDetails, loadUncommittedCount])

  useEffect(() => {
    if (changeSignal === undefined) {
      return
    }

    if (lastChangeSignalRef.current === null) {
      lastChangeSignalRef.current = changeSignal
      return
    }

    if (lastChangeSignalRef.current === changeSignal) {
      return
    }

    lastChangeSignalRef.current = changeSignal
    if (isVisible) {
      void loadCommitPage(true)
      if (isUncommittedOpen) void loadUncommittedDetails()
      else void loadUncommittedCount()
    }
  }, [changeSignal, isVisible, isUncommittedOpen, loadCommitPage, loadUncommittedDetails, loadUncommittedCount])

  const commits = useMemo(() => {
    const resolvedCommits = commitRecords ?? baseCommits

    return resolvedCommits.map((commit) => {
      const isDbCommit = "summary" in commit
      const commitId = isDbCommit ? `commit-${commit.id}` : commit.id
      const parsedTimestamp = new Date(commit.timestamp)
      const resolvedTimestamp = Number.isNaN(parsedTimestamp.getTime()) ? new Date() : parsedTimestamp

      if (!isDbCommit) {
        return {
          ...commit,
          timestamp: resolvedTimestamp,
          changes: resolveCommitChanges(commitId, snapshot).map((record) => mapRecordToChange(record, changeTextLocale)),
        }
      }

      const branchId = commit.branchId
      const branchName = commit.branchName ?? `branch-${branchId}`
      const trackId = `branch-${branchId}`

      return {
        id: commitId,
        gitId: commit.gitId,
        previousId: commit.previousId,
        title: commit.summary,
        description: commit.description ?? undefined,
        timestamp: resolvedTimestamp,
        trackId,
        trackName: branchName,
        changes: resolveCommitChanges(commitId, snapshot).map((record) => mapRecordToChange(record, changeTextLocale)),
        isMergeCommit: commit.isMergeCommit,
        isNewBranchCommit: commit.isNewBranchCommit,
        restoredFromCommitId: commit.restoredFromCommitId,
        restoredFromChangeId: commit.restoredFromChangeId,
      }
    })
  }, [baseCommits, changeTextLocale, commitRecords, snapshot])

  const handleRestoreChange = useCallback(
    async (change: Change) => {
      setError(null)

      try {
        await onRestoreChange?.(change)
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : t('errors.restoreChange')
        console.warn(message)
        setError(message)
      }
    },
    [onRestoreChange, t]
  )

  return {
    commits,
    totalCommitCount,
    uncommittedChanges: isUncommittedOpen ? uncommittedChanges : [],
    uncommittedCount,
    hasUncommittedCount,
    isCountLoading,
    isCommittedLoading,
    isCurrentPage: loadedPageKey === pageKey,
    isDetailsLoading,
    error,
    historyTags,
    hasMorePending: pendingPage?.nextBeforeId != null,
    handleMorePending: () => loadUncommittedDetails(true),
    handleReload: () => {
      if (!isVisible) {
        return
      }

      return Promise.all([loadCommitPage(true), isUncommittedOpen ? loadUncommittedDetails() : loadUncommittedCount()]).then(() => undefined)
    },
    handleRestoreChange,
  }
}
