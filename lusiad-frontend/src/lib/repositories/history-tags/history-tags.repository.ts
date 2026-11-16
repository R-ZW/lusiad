import "server-only"
import type { RowDataPacket, ResultSetHeader, PoolConnection } from "mysql2/promise"
import { getPool } from "@/lib/repositories/database"
import { HistoryTagError, isHistoryTagsTableMissing, type HistoryTag, type HistoryTagsSnapshot, type HistoryTagTarget } from "@/lib/models/history-tags/history-tags.model"

interface TagRow extends RowDataPacket {
  id: number; name: string; commit_id: number | null; change_id: number | null
  resolved_commit_id: number | null; target_title: string; branch_name: string | null
  timestamp: string | Date; change_type: string | null
}

export async function listProjectHistoryTags(projectId: number, connection?: PoolConnection): Promise<HistoryTagsSnapshot> {
  try {
    const [rows] = await (connection ?? getPool()).query<TagRow[]>(
      `SELECT t.id, t.name, t.commit_id, t.change_id,
         COALESCE(t.commit_id, ch.commit_id) AS resolved_commit_id,
         COALESCE(ch.summary, c.summary, '') AS target_title,
         COALESCE(cb.name, b.name) AS branch_name,
         COALESCE(ch.date_time, c.timestamp) AS timestamp, ch.change_type
       FROM lusiad_history_tags t
       LEFT JOIN commits c ON c.id = t.commit_id
       LEFT JOIN branches b ON b.id = c.branch_id
       LEFT JOIN changes ch ON ch.id = t.change_id
       LEFT JOIN commits cc ON cc.id = ch.commit_id
       LEFT JOIN branches cb ON cb.id = cc.branch_id
       WHERE t.project_id = ? AND
         ((t.commit_id IS NOT NULL AND b.project_id = t.project_id) OR
          (t.change_id IS NOT NULL AND ch.project_id = t.project_id
           AND (ch.commit_id IS NULL OR cb.project_id = t.project_id)))
       ORDER BY t.name_key, t.id`, [projectId])
    return { available: true, tags: rows.map((row): HistoryTag => ({
      id: row.id, name: row.name, targetKind: row.change_id === null ? "commit" : "change",
      targetId: Number(row.change_id ?? row.commit_id), commitId: row.resolved_commit_id,
      targetTitle: row.target_title, branchName: row.branch_name,
      timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : row.timestamp,
      changeType: row.change_type,
    })) }
  } catch (error) {
    if (isHistoryTagsTableMissing(error)) return { available: false, tags: [] }
    throw error
  }
}

export async function mutateHistoryTag(projectId: number, action:
  | { kind: "create"; name: string; key: string; target: HistoryTagTarget }
  | { kind: "rename"; id: number; name: string; key: string }
  | { kind: "delete"; id: number }): Promise<void> {
  const connection = await getPool().getConnection()
  try {
    await connection.beginTransaction()
    if (action.kind === "create") {
      const target = action.target
      // Lock the actual target, and validate membership before inserting a tag.
      const [rows] = await connection.query<RowDataPacket[]>(target.kind === "commit"
        ? "SELECT c.id FROM commits c INNER JOIN branches b ON b.id = c.branch_id WHERE c.id = ? AND b.project_id = ? FOR UPDATE"
        : `SELECT ch.id FROM changes ch LEFT JOIN commits c ON c.id = ch.commit_id
           LEFT JOIN branches b ON b.id = c.branch_id WHERE ch.id = ? AND ch.project_id = ?
           AND (ch.commit_id IS NULL OR b.project_id = ch.project_id) FOR UPDATE`, [target.id, projectId])
      if (!rows.length) throw new HistoryTagError("invalidTarget")
      await connection.query<ResultSetHeader>(
        "INSERT INTO lusiad_history_tags (project_id, name, name_key, commit_id, change_id) VALUES (?, ?, ?, ?, ?)",
        [projectId, action.name, action.key, target.kind === "commit" ? target.id : null, target.kind === "change" ? target.id : null])
    } else {
      const [rows] = await connection.query<RowDataPacket[]>(
        "SELECT id FROM lusiad_history_tags WHERE project_id = ? AND id = ? FOR UPDATE", [projectId, action.id])
      if (!rows.length) throw new HistoryTagError("notFound")
      if (action.kind === "delete") {
        await connection.query("DELETE FROM lusiad_history_tags WHERE project_id = ? AND id = ?", [projectId, action.id])
      } else {
        await connection.query("UPDATE lusiad_history_tags SET name = ?, name_key = ? WHERE project_id = ? AND id = ?",
          [action.name, action.key, projectId, action.id])
      }
    }
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    if (isHistoryTagsTableMissing(error)) throw new HistoryTagError("migrationRequired")
    if ((error as { code?: string })?.code === "ER_DUP_ENTRY") throw new HistoryTagError("duplicate")
    throw error
  } finally { connection.release() }
}
