import type { Pool, RowDataPacket } from "mysql2/promise"
import { assertTestPath, loadRuntimeConfig, publicTestContext } from "./runtime-config"
import { backendRequestOptions } from "./backend"

/** Read-only checks on the raw pool. Never call through the guarded pool here. */
export async function assertTestDatabase(pool: Pool, checkBackend = true): Promise<void> {
  const config = loadRuntimeConfig(), test = config.test
  if (!test) return
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT DATABASE() AS db, @@server_uuid AS serverUuid, run_id, config_hash, schema_hash FROM lusiad_test_context WHERE singleton = 1")
  const row = rows[0]
  if (rows.length !== 1 || row.db !== test.database.name || row.serverUuid !== test.database.serverUuid ||
      row.run_id !== test.runId || row.config_hash !== test.configHash || row.schema_hash !== test.schemaHash) {
    throw new Error("Refusing SQL: test database ownership does not match")
  }
  const [columns] = await pool.query<RowDataPacket[]>(
    "SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION")
  const actual: Record<string, string[]> = {}
  for (const column of columns) (actual[String(column.tableName)] ??= []).push(String(column.columnName))
  if (Object.keys(actual).length !== Object.keys(test.schemaColumns).length ||
      Object.entries(test.schemaColumns).some(([table, expected]) => JSON.stringify(actual[table]) !== JSON.stringify(expected))) {
    throw new Error("Refusing SQL: incompatible test schema")
  }
  const [projects] = await pool.query<RowDataPacket[]>("SELECT path, temp_path FROM projects")
  for (const project of projects) {
    assertTestPath(String(project.path), "projects", false)
    if (project.temp_path) assertTestPath(String(project.temp_path), "temp", false)
  }
  if (checkBackend) {
    const response = await fetch(`${config.apiUrl}/_lusiad/test-context`, backendRequestOptions())
    if (!response.ok) throw new Error("Test backend unavailable or not in the same test profile")
    const backend = await response.json() as Record<string, unknown>
    const expected = publicTestContext(config)!
    if (backend.service !== "backend" || backend.ready !== true || backend.runId !== expected.runId || backend.configHash !== expected.configHash ||
        backend.schemaHash !== expected.schemaHash) throw new Error("Frontend/backend test contexts differ")
  }
}

/** Keep the existing synchronous getPool contract; guard each query/checkout in test mode. */
export function guardTestPool(raw: Pool): Pool {
  return new Proxy(raw, {
    get(target, property) {
      if (["query", "execute", "getConnection"].includes(String(property))) {
        return async (...args: unknown[]) => {
          await assertTestDatabase(raw)
          const operation = Reflect.get(target, property) as (...values: unknown[]) => unknown
          return operation.apply(target, args)
        }
      }
      const value: unknown = Reflect.get(target, property)
      return typeof value === "function" ? value.bind(target) : value
    },
  })
}
