import "server-only"

import type { RowDataPacket } from "mysql2/promise"
import { getPool } from "@/lib/repositories/database"
import type { normalizeComparisonSearch } from "@/lib/services/model-comparison/comparison-reference.model"

export interface ComparisonHistoryRow extends RowDataPacket {
  id: number
  kind: "commit" | "change"
  label: string
  timestamp: string | Date
  branch_name: string
  commit_id: number | null
  git_id: string
  file_path: string | null
  change_type: string | null
  req_body: unknown
}

/** Only committed states of the selected project can be chosen for comparison. */
export async function searchComparisonHistoryRows(projectId: number,
  search: ReturnType<typeof normalizeComparisonSearch>, limit: number, offset: number): Promise<ComparisonHistoryRow[]> {
  const selects: string[] = []
  const values: Array<string | number> = []
  const words = search.query.split(/\s+/).filter(Boolean)
  function conditions(id: string, fields: string[]): string {
    if (search.exactId !== null) {
      values.push(search.exactId)
      return ` AND ${id} = ?`
    }
    return words.map((word) => {
      // Treat %, _ and the escape character as literal search text.
      values.push(`%${word.replace(/=/g, "==").replace(/%/g, "=%").replace(/_/g, "=_")}%`)
      return ` AND CONCAT_WS(' ', ${fields.join(", ")}) LIKE ? ESCAPE '='`
    }).join("")
  }
  if (search.kind === "all" || search.kind === "commit") {
    values.push(projectId)
    const filter = conditions("c.id", ["c.summary", "c.description", "c.git_id", "b.name", "c.timestamp"])
    selects.push(`SELECT c.id, 'commit' AS kind, c.summary AS label, c.timestamp,
      b.name AS branch_name, NULL AS commit_id, c.git_id, NULL AS file_path, NULL AS change_type, NULL AS req_body
      FROM commits c INNER JOIN branches b ON c.branch_id = b.id
      WHERE b.project_id = ?${filter}`)
  }
  if (search.kind === "all" || search.kind === "change") {
    values.push(projectId, projectId)
    const path = "COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ch.req_body, '$.changeMetadata.after.path')), JSON_UNQUOTE(JSON_EXTRACT(ch.req_body, '$.changeMetadata.before.path')), JSON_UNQUOTE(JSON_EXTRACT(ch.req_body, '$.path')))"
    const paths = [path, ...["name", "sourcePath", "destPath", "paths"].map((key) =>
      `JSON_UNQUOTE(JSON_EXTRACT(ch.req_body, '$.${key}'))`)]
    const filter = conditions("ch.id", ["ch.summary", "ch.description", "ch.change_type", "c.summary", "c.git_id", "b.name", "ch.date_time", ...paths])
    selects.push(`SELECT ch.id, 'change' AS kind, ch.summary AS label, ch.date_time AS timestamp,
      b.name AS branch_name, ch.commit_id, c.git_id, ${path} AS file_path, ch.change_type,
      JSON_OBJECT('changeMetadata', JSON_EXTRACT(ch.req_body, '$.changeMetadata')) AS req_body
      FROM changes ch INNER JOIN commits c ON ch.commit_id = c.id
      INNER JOIN branches b ON c.branch_id = b.id
      WHERE ch.project_id = ? AND b.project_id = ?${filter}`)
  }
  if (!selects.length) return []
  const [rows] = await getPool().query<ComparisonHistoryRow[]>(
    `SELECT * FROM (${selects.join(" UNION ALL ")}) history
     ORDER BY timestamp DESC, id DESC, kind ASC LIMIT ? OFFSET ?`, [...values, limit, offset])
  return rows
}
