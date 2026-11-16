export interface HistoryQuery {
  query?: string
  showMerges?: boolean
  showBranches?: boolean
  taggedOnly?: boolean
}

export function normalizeHistoryQuery(filter: HistoryQuery = {}) {
  if (filter.query !== undefined && typeof filter.query !== "string") throw new Error("Invalid history filter")
  const query = (filter.query ?? "").trim()
  if (query.length > 200
    || [filter.showMerges, filter.showBranches, filter.taggedOnly].some((value) => value !== undefined && typeof value !== "boolean")) {
    throw new Error("Invalid history filter")
  }
  return { query, showMerges: filter.showMerges !== false, showBranches: filter.showBranches !== false, taggedOnly: filter.taggedOnly === true }
}

/** Shared by the count and page queries: filters always run before pagination. */
export function historyWhere(projectId: number, filter: HistoryQuery = {}, tagsAvailable = false): { sql: string; values: Array<string | number> } {
  if (!Number.isSafeInteger(projectId) || projectId <= 0) throw new Error("Invalid project")
  const search = normalizeHistoryQuery(filter)
  const clauses = ["b.project_id = ?"]
  const values: Array<string | number> = [projectId]
  if (!search.showMerges) clauses.push("c.is_merge_commit = '0'")
  if (!search.showBranches) clauses.push("c.is_new_branch_commit = '0'")
  const tagMatch = `EXISTS (SELECT 1 FROM lusiad_history_tags ht
    LEFT JOIN changes tc ON tc.id = ht.change_id AND tc.project_id = ht.project_id
    WHERE ht.project_id = b.project_id AND (ht.commit_id = c.id OR tc.commit_id = c.id)`
  if (search.taggedOnly) clauses.push(tagsAvailable ? `${tagMatch})` : "1 = 0")
  const direct = /^(commit|change):([1-9]\d*)$/.exec(search.query)
  if (direct) {
    if (!Number.isSafeInteger(Number(direct[2]))) throw new Error("Invalid history reference")
    clauses.push(direct[1] === "commit" ? "c.id = ?" : "EXISTS (SELECT 1 FROM changes ch WHERE ch.commit_id = c.id AND ch.project_id = b.project_id AND ch.id = ?)")
    values.push(Number(direct[2]))
  } else {
    for (const term of search.query.replace(/^#(?=\d+$)/, "").split(/\s+/).filter(Boolean)) {
      const pattern = `%${term.replace(/[=%_]/g, (character) => `=${character}`)}%`
      // JSON strings may carry utf8mb4_bin even when the database uses another
      // collation. Use an explicit search collation for every concatenated field.
      const fields = ["CONVERT(CONCAT_WS(' ', c.id, c.summary, c.description, c.git_id, b.name, c.timestamp) USING utf8mb4) COLLATE utf8mb4_general_ci LIKE ? ESCAPE '='",
        "EXISTS (SELECT 1 FROM changes ch WHERE ch.commit_id = c.id AND ch.project_id = b.project_id AND CONVERT(CONCAT_WS(' ', ch.id, ch.summary, ch.description, CAST(ch.req_body AS CHAR)) USING utf8mb4) COLLATE utf8mb4_general_ci LIKE ? ESCAPE '=')"]
      values.push(pattern, pattern)
      if (tagsAvailable) { fields.push(`${tagMatch} AND ht.name LIKE ? ESCAPE '=')`); values.push(pattern) }
      clauses.push(`(${fields.join(" OR ")})`)
    }
  }
  return { sql: clauses.join(" AND "), values }
}
