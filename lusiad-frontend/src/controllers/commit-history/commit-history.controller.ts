"use server"

import type { HistoryQuery } from "@/lib/models/change-history/history-query.model"

import {
  fetchCommitByIdService,
  fetchCommitHistoryService,
  type CommitHistoryRecord,
} from "@/lib/services/commit-history/commit-history.service"

export interface LoadCommitHistoryControllerParams {
  projectId: number
  limit?: number
  offset?: number
  upperId?: number
  filter?: HistoryQuery
}

export interface LoadCommitByIdControllerParams {
  projectId: number
  commitId: number | string
}

export type CommitHistoryControllerResult = Awaited<ReturnType<typeof fetchCommitHistoryService>>

export async function loadCommitHistoryController(
  params: LoadCommitHistoryControllerParams
): Promise<CommitHistoryControllerResult> {
  try {
    return await fetchCommitHistoryService(params.projectId, params.limit, params.offset, params.filter, params.upperId)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar commits"
    throw new Error(message)
  }
}

export async function loadCommitByIdController(
  params: LoadCommitByIdControllerParams
): Promise<CommitHistoryRecord | null> {
  try {
    return await fetchCommitByIdService(params.projectId, params.commitId)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar commit"
    throw new Error(message)
  }
}
