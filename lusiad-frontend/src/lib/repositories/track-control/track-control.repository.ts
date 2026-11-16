import "server-only"

import { basename, isAbsolute, resolve } from "path"
import { realpathSync } from "node:fs"
import { createHash } from "node:crypto"
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise"
import { getPool } from "@/lib/repositories/database"
import { assertTestPath } from "@/lib/config/runtime-config"

export interface ProjectRow extends RowDataPacket {
  id: number
  name: string
  description: string | null
  path: string
  tempPath?: string | null
}

export interface ProjectInsertParams {
  path: string
  name?: string
  description?: string | null
}

export interface BranchRow extends RowDataPacket {
  id: number
  project_id: number
  base: number | null
  active: "0" | "1"
  selected: "0" | "1"
  name: string
}

type QueryExecutor = Pick<Pool, "query" | "execute">

function resolveExecutor(connection?: PoolConnection): QueryExecutor {
  return connection ?? getPool()
}

function projectRootKey(path: string): string {
  let root: string
  try { root = realpathSync.native(path) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; root = resolve(path) }
  return process.platform === "win32" ? root.toLowerCase() : root
}

export async function findProjectByPath(
  path: string,
  connection?: PoolConnection
): Promise<ProjectRow | null> {
  const executor = resolveExecutor(connection)
  const [rows] = await executor.query<ProjectRow[]>(
    "SELECT id, name, description, path, temp_path AS tempPath FROM projects"
  )
  const key = projectRootKey(path), matches = rows.filter((row) => projectRootKey(row.path) === key)
  if (matches.length > 1) throw new Error("Mais de um cadastro aponta para a mesma raiz física; revise os projetos antes de continuar")
  return matches[0] ?? null
}

export async function findProjectById(
  projectId: number,
  connection?: PoolConnection
): Promise<ProjectRow | null> {
  const executor = resolveExecutor(connection)
  const [rows] = await executor.query<ProjectRow[]>(
    "SELECT id, name, description, path, temp_path AS tempPath FROM projects WHERE id = ? LIMIT 1",
    [projectId]
  )

  return rows[0] ?? null
}

export async function listProjects(connection?: PoolConnection): Promise<ProjectRow[]> {
  const executor = resolveExecutor(connection)
  const [rows] = await executor.query<ProjectRow[]>(
    "SELECT id, name, description, path FROM projects ORDER BY name ASC, id ASC"
  )

  return rows
}

export async function insertProject(
  params: string | ProjectInsertParams,
  connection?: PoolConnection
): Promise<ProjectRow> {
  const resolvedParams: ProjectInsertParams = typeof params === "string" ? { path: params } : params
  const resolvedPath = resolvedParams.path.trim()
  if (!isAbsolute(resolvedPath)) throw new Error("Informe um caminho absoluto para o projeto")
  assertTestPath(resolvedPath, "projects", false)
  const resolvedName = resolvedParams.name?.trim() || basename(resolvedPath).trim() || resolvedPath || "Projeto"
  const resolvedDescription = resolvedParams.description?.trim() || null
  const executor = connection ?? await getPool().getConnection()
  const lock = "lusiad:project:" + createHash("sha256").update(projectRootKey(resolvedPath)).digest("hex").slice(0, 40)
  try {
    const [registry] = await executor.query<Array<RowDataPacket & { acquired: number }>>("SELECT GET_LOCK('lusiad:registry',5) AS acquired")
    if (Number(registry[0]?.acquired) !== 1) throw new Error("Gestão de projetos ocupada; tente novamente")
    const [locked] = await executor.query<Array<RowDataPacket & { acquired: number }>>("SELECT GET_LOCK(?,5) AS acquired", [lock])
    if (Number(locked[0]?.acquired) !== 1) throw new Error("Cadastro desta raiz está ocupado; tente novamente")
    if (await findProjectByPath(resolvedPath, executor)) throw new Error("Esta raiz já está cadastrada; abra o projeto existente")
    const [result] = await executor.execute<ResultSetHeader>(
      "INSERT INTO projects (name, description, path) VALUES (?, ?, ?)",
      [resolvedName, resolvedDescription, resolvedPath]
    )
    return {
      id: Number(result.insertId),
      name: resolvedName,
      description: resolvedDescription,
      path: resolvedPath,
    } as ProjectRow
  } finally {
    await executor.query("SELECT RELEASE_LOCK(?)", [lock]).catch(() => {})
    await executor.query("SELECT RELEASE_LOCK('lusiad:registry')").catch(() => {})
    if (!connection) executor.release()
  }
}

export async function setProjectTempPath(
  projectId: number,
  tempPath: string,
  connection?: PoolConnection
): Promise<void> {
  const executor = resolveExecutor(connection)
  const resolvedTempPath = tempPath.trim()
  assertTestPath(resolvedTempPath, "temp", false)

  if (!resolvedTempPath) {
    throw new Error("Caminho temporario do projeto invalido")
  }

  await executor.execute(
    "UPDATE projects SET temp_path = ? WHERE id = ?",
    [resolvedTempPath, projectId]
  )
}

export async function findBranchByProjectAndName(
  projectId: number,
  name: string,
  connection?: PoolConnection
): Promise<BranchRow | null> {
  const executor = resolveExecutor(connection)
  const [rows] = await executor.query<BranchRow[]>(
    "SELECT id, project_id, base, active, selected, name FROM branches WHERE project_id = ? AND name = ? LIMIT 1",
    [projectId, name]
  )

  return rows[0] ?? null
}

export async function findSelectedBranch(
  projectId: number,
  connection?: PoolConnection
): Promise<BranchRow | null> {
  const executor = resolveExecutor(connection)
  const [rows] = await executor.query<BranchRow[]>(
    "SELECT id, project_id, base, active, selected, name FROM branches WHERE project_id = ? AND selected = '1' LIMIT 1",
    [projectId]
  )

  return rows[0] ?? null
}

export async function listBranchesByProjectId(
  projectId: number,
  connection?: PoolConnection
): Promise<BranchRow[]> {
  const executor = resolveExecutor(connection)
  const [rows] = await executor.query<BranchRow[]>(
    "SELECT id, project_id, base, active, selected, name FROM branches WHERE project_id = ? ORDER BY id ASC",
    [projectId]
  )

  return rows
}

export async function insertBranch(
  params: {
    projectId: number
    baseId?: number | null
    active?: boolean
    selected?: boolean
    name: string
  },
  connection?: PoolConnection
): Promise<BranchRow> {
  const executor = resolveExecutor(connection)
  const activeValue = params.active ? "1" : "0"
  const selectedValue = params.selected ? "1" : "0"
  const [result] = await executor.execute<ResultSetHeader>(
    "INSERT INTO branches (project_id, base, active, selected, name) VALUES (?, ?, ?, ?, ?)",
    [params.projectId, params.baseId ?? null, activeValue, selectedValue, params.name]
  )

  return {
    id: Number(result.insertId),
    project_id: params.projectId,
    base: params.baseId ?? null,
    active: activeValue,
    selected: selectedValue,
    name: params.name,
  } as BranchRow
}

export async function setBranchState(
  projectId: number,
  selectedBranchId: number,
  activeBranchIds: number[],
  connection?: PoolConnection
): Promise<void> {
  const executor = resolveExecutor(connection)
  const resolvedActiveIds = activeBranchIds.length > 0 ? activeBranchIds : [selectedBranchId]
  const activePlaceholders = resolvedActiveIds.map(() => "?").join(", ")

  await executor.execute(
    `UPDATE branches
     SET
       active = CASE WHEN id IN (${activePlaceholders}) THEN '1' ELSE '0' END,
       selected = CASE WHEN id = ? THEN '1' ELSE '0' END
     WHERE project_id = ?`,
    [...resolvedActiveIds, selectedBranchId, projectId]
  )
}
