import type { Change } from "@/lib/types"

export interface ChangeHistoryRow {
  id: number | string
  commit_id: number | string | null
  summary: string | null
  description: string | null
  date_time: string | Date | null
  // `path` was removed from the DB; keep optional to support older rows
  path?: unknown
  change_type: string | null
  scope: string | null
  req_body: unknown
}

export interface ChangeHistoryRecord {
  id: string
  commitId: string | null
  title: string
  description: string
  timestamp: string
  type: Change["type"]
  fileName: string
  changeType: string
  scope: string
  path: unknown
  reqBody: unknown
}

export interface ChangeHistorySnapshot {
  pendingPage?: { revision: string; nextBeforeId: number | null }
  uncommittedCount: number
  uncommittedChanges: ChangeHistoryRecord[]
  committedChangesByCommitId: Record<string, ChangeHistoryRecord[]>
}

const FALLBACK_FILE_NAME = "Arquivo"

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function parseJsonMaybe(value: unknown): unknown {
  if (typeof value !== "string") {
    return value
  }

  const trimmed = value.trim()

  if (!trimmed) {
    return value
  }

  const looksLikeJson = trimmed.startsWith("{") || trimmed.startsWith("[")
  if (!looksLikeJson) {
    return value
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

function resolvePathValue(value: unknown): string | null {
  const parsedValue = parseJsonMaybe(value)

  if (typeof parsedValue === "string") {
    return parsedValue
  }

  if (Array.isArray(parsedValue)) {
    const lastSegment = [...parsedValue].reverse().find((item) => typeof item === "string")
    return typeof lastSegment === "string" ? lastSegment : null
  }

  if (parsedValue && typeof parsedValue === "object") {
    const record = parsedValue as Record<string, unknown>
    const candidates = [
      record.resourcePath,
      record.path,
      record.filePath,
      record.file,
      record.fileName,
      record.name,
      record.target,
      record.source,
    ]

    for (const candidate of candidates) {
      if (typeof candidate === "string") {
        return candidate
      }
    }
  }

  return null
}

function resolveFileNameFromPath(pathValue: unknown): string {
  const rawPath = resolvePathValue(pathValue)

  if (!rawPath) {
    return FALLBACK_FILE_NAME
  }

  const normalizedPath = rawPath.replace(/\\/g, "/")
  const segments = normalizedPath.split("/").filter(Boolean)
  return segments[segments.length - 1] ?? FALLBACK_FILE_NAME
}

function normalizeTimestamp(value: string | Date | null): string {
  if (!value) {
    return new Date().toISOString()
  }

  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isNaN(time) ? new Date().toISOString() : value.toISOString()
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
}

function mapChangeType(value: string): Change["type"] {
  const normalized = value.toLowerCase()

  if (normalized.includes("delete")) {
    return "deleted"
  }

  if (normalized.includes("create")) {
    return "added"
  }

  if (normalized.includes("move")) {
    return "modified"
  }

  if (normalized.includes("update")) {
    return "modified"
  }

  return "modified"
}

function buildFallbackTitle(type: Change["type"], fileName: string): string {
  switch (type) {
    case "added":
      return `Criacao em ${fileName}`
    case "deleted":
      return `Exclusao em ${fileName}`
    case "modified":
      return `Alteracao em ${fileName}`
  }
}

export function buildChangeHistoryRecordModel(row: ChangeHistoryRow): ChangeHistoryRecord {
  const changeTypeRaw = normalizeText(row.change_type) || "unknown"
  const mappedType = mapChangeType(changeTypeRaw)

  // prefer explicit path; if missing, try req_body, description or summary
  const pathSource = row.path ?? row.req_body ?? row.description ?? row.summary
  const fileName = changeTypeRaw === "external_bundle" ? "Project" : resolveFileNameFromPath(pathSource)

  const summary = normalizeText(row.summary)
  const description = typeof row.description === "string" ? row.description : ""
  const title = summary || buildFallbackTitle(mappedType, fileName)
  const commitId = row.commit_id === null || row.commit_id === undefined ? null : String(row.commit_id)
  const resolvedDescription = description

  return {
    id: String(row.id),
    commitId,
    title,
    description: resolvedDescription,
    timestamp: normalizeTimestamp(row.date_time),
    type: mappedType,
    fileName,
    changeType: changeTypeRaw,
    scope: normalizeText(row.scope) || "unknown",
    path: parseJsonMaybe(pathSource),
    reqBody: parseJsonMaybe(row.req_body),
  }
}

export function groupChangeHistoryRecordsModel(records: ChangeHistoryRecord[]): ChangeHistorySnapshot {
  const uncommittedChanges: ChangeHistoryRecord[] = []
  const committedChangesByCommitId: Record<string, ChangeHistoryRecord[]> = {}

  for (const record of records) {
    if (!record.commitId) {
      uncommittedChanges.push(record)
      continue
    }

    if (!committedChangesByCommitId[record.commitId]) {
      committedChangesByCommitId[record.commitId] = []
    }

    committedChangesByCommitId[record.commitId].push(record)
  }

  return {
    uncommittedCount: uncommittedChanges.length,
    uncommittedChanges,
    committedChangesByCommitId,
  }
}
