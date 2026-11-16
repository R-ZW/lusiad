import "server-only"
import { randomUUID } from "node:crypto"
import { resolve } from "node:path"
import { relativeContained } from "../contained-paths"
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise"
import { readResourceStates, resourcePostimages } from '../undo/resource-image'
import { snapshotProject } from '../external-sync/sync-disk'
import { backendUrl } from '@/lib/config/backend'
import { postBackendJson } from '../backend-client'
import { testGitEnvironment, assertTestGitRepository, assertSafeGitArchive } from "@/lib/config/test-git"
import { GitOperation, GitPendingError, GitValidationError, canonicalText, textHash, type GitPlan } from "./git-operation"

interface Event extends RowDataPacket {
  id: number; branch_id: number | null; change_type: string; scope: string; req_body: Record<string, unknown>
}
interface Branch extends RowDataPacket { id: number; name: string; base: number | null }
interface Frozen {
  version: 1; projectId: number; root: string; branchId: number; baseId: number | null
  branchName: string; title: string; description: string | null
  events: Array<{ id: number; digest: string }>; plan: GitPlan
  restoreSourceCommitId?: number
  restoreSourceChangeId?: number
}
interface Journal extends RowDataPacket { operation_id: string; payload: Frozen; commit_id: number | null; state: string }

function eventDigest(event: Event): string {
  return textHash(JSON.stringify([event.id, event.branch_id, event.change_type, event.scope, event.req_body]))
}
function parsePayload(value: unknown): Frozen {
  const payload = typeof value === "string" ? JSON.parse(value) : value
  if (!payload || payload.version !== 1 || payload.plan?.version !== 1 || !Array.isArray(payload.events))
    throw new GitValidationError("Intenção Git inválida; preserve o registro para inspeção")
  return payload
}

async function selected(connection: PoolConnection, projectId: number): Promise<Branch> {
  const [rows] = await connection.query<Branch[]>("SELECT id,name,base FROM branches WHERE project_id=? AND selected='1'", [projectId])
  if (rows.length !== 1) throw new GitValidationError("O projeto precisa de exatamente uma branch selecionada")
  return rows[0]
}

async function pendingEvents(connection: PoolConnection, projectId: number, branchId: number): Promise<Event[]> {
  const [rows] = await connection.query<Event[]>("SELECT id,branch_id,change_type,scope,req_body FROM changes WHERE project_id=? AND commit_id IS NULL ORDER BY id", [projectId])
  if (rows.some((row) => row.branch_id !== null && row.branch_id !== branchId))
    throw new GitValidationError("Há mudanças pendentes de outra branch; conclua-as na origem")
  if (rows.some((row) => row.branch_id === null)) {
    const [branches] = await connection.query<RowDataPacket[]>("SELECT id FROM branches WHERE project_id=?", [projectId])
    if (branches.length > 1) throw new GitValidationError("Eventos legados sem branch em projeto com múltiplas branches exigem revisão antes de commitar")
  }
  return rows
}

/** Validate the final postimages, including later structural renames/deletions and external bundles. */
async function verifyEvents(git: GitOperation, plan: GitPlan, events: Event[], connection: PoolConnection, projectId: number): Promise<void> {
  const expected = new Map<string, string | Buffer | null>()
  const directories = new Set<string>()
  const relative = (value: unknown) => relativeContained(git.root, String(value ?? ""), true)
  const relocate = (from: string, to: string | null) => {
    for (const [path, content] of [...expected]) {
      if (path !== from && !path.startsWith(from + "/")) continue
      expected.set(path, null)
      if (to !== null) expected.set(to + path.slice(from.length), content)
    }
  }
  for (const event of events) {
    const body = typeof event.req_body === "string" ? JSON.parse(event.req_body) : event.req_body
    const images = readResourceStates(body)
    if (images) {
      resourcePostimages(expected, images)
      for (const path of directories) if (images.after.roots.some(root => path === root || path.startsWith(root+'/'))) directories.delete(path)
      for (const [path, entry] of Object.entries(images.after.entries)) if (entry.kind === 'directory') directories.add(path)
    } else if (event.scope === "file" && body.recordVersion === 2) {
      if (typeof body.afterText !== "string" || textHash(body.afterText) !== body.afterHash
        || typeof body.beforeText !== "string" || textHash(body.beforeText) !== body.beforeHash)
        throw new GitValidationError(`Evento ${event.id} possui hashes inválidos`)
      const path = relative(body.path)
      const previous = expected.get(path)
      if (previous !== undefined && previous !== null && canonicalText(previous.toString()) !== body.beforeText)
        throw new GitValidationError(`Pré-imagem descontínua no evento ${event.id}`)
      expected.set(path, body.afterText)
    } else if (event.change_type === "external_bundle") {
      const [files] = await connection.query<Array<RowDataPacket & { path: string; after_kind: string | null; after_content: Buffer | null }>>(
        "SELECT bf.path,bf.after_kind,bf.after_content FROM external_sync_bundle_files bf JOIN changes ch ON ch.id=bf.change_id WHERE ch.project_id=? AND ch.id=?", [projectId, event.id])
      for (const file of files) {
        if (file.after_kind === "file") expected.set(relative(file.path), file.after_content ?? Buffer.alloc(0))
        else if (file.after_kind === null) relocate(relative(file.path), null)
      }
    } else if (event.change_type.endsWith("_delete")) {
      const path = relative(body.path); relocate(path, null); expected.set(path, null)
    } else if (event.change_type.endsWith("_rename")) {
      const path = relative(body.path), parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : ""
      const target = parent + String(body.newName), known = expected.has(path)
      relocate(path, target)
      if (event.change_type === "file_rename" && !known) { expected.set(path, null); expected.delete(target) }
    } else if (event.change_type.endsWith("_move")) {
      const path = relative(body.sourcePath), target = relative(body.destPath)
      const destination = (target ? target + "/" : "") + path.split("/").at(-1), known = expected.has(path)
      relocate(path, destination)
      if (event.change_type === "file_move" && !known) { expected.set(path, null); expected.delete(destination) }
    } else if (event.change_type === "file_create") {
      const parent = relative(body.path)
      expected.set((parent ? parent + "/" : "") + String(body.name), "")
    } else if (event.scope === "file") {
      // Old records lack postimages. Never pretend to validate their complete replay.
      expected.delete(relative(body.path))
    }
  }
  const entries = (await git.git(["ls-tree", "-r", "--name-only", "-z", plan.sha])).split("\0")
  for (const path of directories) if (entries.includes(path)) throw new GitValidationError(`Snapshot mantém arquivo onde o evento registra diretório: ${path}`)
  for (const [path, content] of expected) {
    if (content === null) {
      if (entries.some((entry) => entry === path || entry.startsWith(path + "/"))) throw new GitValidationError(`Snapshot mantém caminho excluído: ${path}`)
    } else {
      const matches = !entries.includes(path) ? false : Buffer.isBuffer(content)
        ? (await git.git(["rev-parse", `${plan.sha}:${path}`])).trim() === await git.contentObject(path, content)
        : canonicalText((await git.bytes(["show", `${plan.sha}:${path}`])).toString("utf8")) === content
      if (!matches)
        throw new GitValidationError(`Snapshot Git difere do estado final registrado: ${path}`)
    }
  }
}

async function finish(connection: PoolConnection, projectId: number, root: string, row: Journal): Promise<{ commitId: number; updatedChanges: number; branchId: number }> {
  const frozen = parsePayload(row.payload), { plan } = frozen
  if (frozen.projectId !== projectId || frozen.root !== root || plan.id !== row.operation_id) throw new GitValidationError("Projeto/raiz da intenção Git mudou")
  const git = new GitOperation(root, testGitEnvironment())
  await git.verify(plan)
  await assertSafeGitArchive(root, plan.sha)
  if (plan.kind === "restore") {
    const [source] = await connection.query<Array<RowDataPacket & { git_id: string }>>(
      "SELECT c.git_id FROM commits c JOIN branches b ON b.id=c.branch_id WHERE b.project_id=? AND c.id=?",
      [projectId, frozen.restoreSourceCommitId])
    if (source.length !== 1 || (!frozen.restoreSourceChangeId && source[0].git_id !== plan.restoreSource))
      throw new GitValidationError("Commit de origem não pertence mais a este projeto")
    if (frozen.restoreSourceChangeId) {
      const [changes] = await connection.query<RowDataPacket[]>(
        "SELECT ch.id FROM changes ch WHERE ch.project_id=? AND ch.commit_id=? AND ch.id=? LIMIT 1",
        [projectId, frozen.restoreSourceCommitId, frozen.restoreSourceChangeId])
      if (changes.length !== 1) throw new GitValidationError("Mudança de origem não pertence mais ao commit")
    }
  }
  // Validate exact, immutable IDs BEFORE publishing a ref, and again inside final SQL transaction.
  const validateEvents = async () => {
    if (!frozen.events.length) return
    const [events] = await connection.query<Event[]>(`SELECT id,branch_id,change_type,scope,req_body FROM changes WHERE project_id=? AND commit_id IS NULL AND id IN (${frozen.events.map(() => "?").join(",")}) ORDER BY id`, [projectId, ...frozen.events.map((event) => event.id)])
    if (events.length !== frozen.events.length || events.some((event, i) => eventDigest(event) !== frozen.events[i].digest))
      throw new GitValidationError("Eventos da intenção foram alterados; associação recusada")
    await verifyEvents(git, plan, events, connection, projectId)
  }
  await validateEvents()
  if (plan.kind === "restore") await postBackendJson(backendUrl('/restore/commit/check'),
    { projectId }, 'Não foi possível verificar documentos abertos na IDE', body => {
      if (body.status !== 'ok') throw new GitValidationError('A IDE não confirmou os documentos salvos')
      return true
    })
  await git.publish(plan)
  if (plan.kind === "restore") await postBackendJson(backendUrl('/restore/commit/refresh'),
    { projectId }, 'Não foi possível atualizar o projeto na IDE', body => {
      if (body.status !== 'ok') throw new GitValidationError('A IDE não confirmou a atualização')
      return true
    })
  const restoredFiles = plan.kind === "restore" ? await snapshotProject(root) : null
  await connection.beginTransaction()
  let commitId: number, branchId = frozen.branchId
  try {
    const [receipt] = await connection.query<Journal[]>("SELECT operation_id,payload,state,commit_id FROM lusiad_git_operations WHERE project_id=? AND operation_id=? FOR UPDATE", [projectId, plan.id])
    if (receipt[0]?.state === "applied") { await connection.commit(); return { commitId: receipt[0].commit_id!, updatedChanges: frozen.events.length, branchId } }
    if (receipt[0]?.state !== "prepared") throw new GitValidationError("Intenção Git ausente")
    await validateEvents()
    const current = await selected(connection, projectId)
    if (current.id !== frozen.branchId) throw new GitValidationError("Branch SQL mudou durante operação Git")
    if (plan.kind === "branch") {
      const [existing] = await connection.query<Branch[]>("SELECT id FROM branches WHERE project_id=? AND name=?", [projectId, frozen.branchName])
      if (existing.length) throw new GitValidationError("Branch SQL conflitante")
      const [insert] = await connection.execute<ResultSetHeader>("INSERT INTO branches(project_id,base,active,selected,name) VALUES(?,?,'1','0',?)", [projectId, frozen.branchId, frozen.branchName])
      branchId = insert.insertId
    } else if (plan.kind === "merge") branchId = frozen.baseId!
    const [owner] = await connection.query<Branch[]>("SELECT id,base FROM branches WHERE project_id=? AND id=?", [projectId, branchId])
    if (owner.length !== 1) throw new GitValidationError("Branch pertence a outro projeto ou foi removida")
    const [parents] = await connection.query<Array<RowDataPacket & { id: number; branch_id: number }>>(
      "SELECT c.id,c.branch_id FROM commits c JOIN branches b ON b.id=c.branch_id WHERE b.project_id=? AND c.git_id=? ORDER BY (c.branch_id=?) DESC,c.id DESC", [projectId, plan.kind === "merge" ? plan.before : plan.source, branchId])
    if (plan.source && !parents.length) throw new GitValidationError("Pai Git sem vínculo SQL neste projeto; importe/reconcilie antes de continuar")
    const [insert] = plan.kind === "restore"
      ? await connection.execute<ResultSetHeader>("INSERT INTO commits(branch_id,git_id,prev,next,summary,description,timestamp,is_merge_commit,is_new_branch_commit,restored_from_commit_id,restored_from_change_id) VALUES(?,?,?,NULL,?,?,NOW(),'0','0',?,?)",
        [branchId, plan.sha, parents[0]?.id ?? null, frozen.title, frozen.description, frozen.restoreSourceCommitId!, frozen.restoreSourceChangeId ?? null])
      : await connection.execute<ResultSetHeader>("INSERT INTO commits(branch_id,git_id,prev,next,summary,description,timestamp,is_merge_commit,is_new_branch_commit) VALUES(?,?,?,NULL,?,?,NOW(),?,?)",
        [branchId, plan.sha, parents[0]?.id ?? null, frozen.title, frozen.description, plan.kind === "merge" ? "1" : "0", plan.kind === "branch" ? "1" : "0"])
    commitId = insert.insertId
    // prev follows the actual Git first parent. next is only a convenience on the same branch;
    // it cannot describe a fork/DAG and must never overwrite another branch's successor.
    if (parents[0]?.branch_id === branchId) await connection.execute("UPDATE commits SET next=? WHERE id=? AND next IS NULL", [commitId, parents[0].id])
    for (const event of frozen.events) {
      const [assigned] = await connection.execute<ResultSetHeader>("UPDATE changes SET commit_id=?,branch_id=? WHERE id=? AND project_id=? AND commit_id IS NULL AND (branch_id=? OR branch_id IS NULL)", [commitId, branchId, event.id, projectId, frozen.branchId])
      if (assigned.affectedRows !== 1) throw new GitValidationError("Evento não pertence mais ao snapshot congelado")
      await connection.execute("INSERT INTO commit_change_sets(git_id,project_id,branch_id,change_id) VALUES(?,?,?,?)", [plan.sha, projectId, branchId, event.id])
    }
    if (plan.kind === "branch" || plan.kind === "merge") {
      const [branches] = await connection.query<Branch[]>("SELECT id,base FROM branches WHERE project_id=?", [projectId])
      const active = new Set<number>(); let cursor: number | null = branchId
      while (cursor !== null) {
        if (active.has(cursor)) throw new GitValidationError("Ciclo na base das branches")
        active.add(cursor); cursor = branches.find((branch) => branch.id === cursor)?.base ?? null
      }
      for (const branch of branches) await connection.execute("UPDATE branches SET active=?,selected=? WHERE project_id=? AND id=?", [active.has(branch.id) ? "1" : "0", branch.id === branchId ? "1" : "0", projectId, branch.id])
    }
    if (restoredFiles) {
      const [initialized] = await connection.query<RowDataPacket[]>("SELECT project_id FROM external_sync_projects WHERE project_id=?", [projectId])
      if (initialized.length) {
        await connection.execute("DELETE FROM external_sync_files WHERE project_id=?", [projectId])
        for (const value of restoredFiles.values()) await connection.execute(
          "INSERT INTO external_sync_files(project_id,path,kind,content,sha256) VALUES(?,?,?,?,?)",
          [projectId, value.path, value.kind, value.content, value.sha256])
      }
    }
    await connection.execute("UPDATE external_sync_projects SET pending_bundle_change_id=NULL WHERE project_id=? AND pending_bundle_change_id IN (SELECT change_id FROM commit_change_sets WHERE project_id=? AND git_id=?)", [projectId, projectId, plan.sha])
    await connection.execute("UPDATE lusiad_git_operations SET state='applied',commit_id=? WHERE project_id=? AND operation_id=?", [commitId, projectId, plan.id])
    await connection.commit()
  } catch (e) { await connection.rollback().catch(() => {}); throw e }
  await git.cleanup(plan.id).catch(() => {}) // Disposable cleanup must not turn a known committed receipt into failure.
  return { commitId, updatedChanges: frozen.events.length, branchId }
}

/** Same advisory lock as Java P05.2. Prepared intents also fence edits after connection loss. */
export async function withGitRecordingLock<T>(connection: PoolConnection, projectId: number, root: string, action: () => Promise<T>): Promise<T> {
  root = resolve(root)
  await assertTestGitRepository(root)
  const [database] = await connection.query<Array<RowDataPacket & { name: string }>>("SELECT DATABASE() AS name")
  const name = "lusiad:edit:" + textHash(`${database[0].name}:${projectId}`).slice(0, 40)
  const [lock] = await connection.query<Array<RowDataPacket & { acquired: number }>>("SELECT GET_LOCK(?,5) AS acquired", [name])
  if (Number(lock[0]?.acquired) !== 1) throw new GitValidationError("Outra operação está ativa neste projeto")
  try {
    const [registration] = await connection.query<Array<RowDataPacket & { path: string }>>("SELECT path FROM projects WHERE id=?", [projectId])
    const key = (path: string) => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path)
    if (!registration[0] || key(registration[0].path) !== key(root)) throw new GitValidationError("Cadastro do projeto mudou; recarregue antes de continuar")
    try {
      const [administration] = await connection.query<RowDataPacket[]>("SELECT operation_id FROM lusiad_project_operations WHERE project_id=? AND state IN ('prepared','applied') LIMIT 1", [projectId])
      if (administration.length) throw new GitValidationError("Recupere a operação de gestão do projeto antes de continuar")
    } catch (error) { if ((error as { errno?: number }).errno !== 1146) throw error }
    const [pending] = await connection.query<Journal[]>("SELECT operation_id,payload,state,commit_id FROM lusiad_git_operations WHERE project_id=? AND state='prepared' ORDER BY created_at,operation_id", [projectId])
    for (const row of pending) {
      try { await finish(connection, projectId, root, row) }
      catch (error) {
        const plan = parsePayload(row.payload).plan
        if (plan.kind === 'restore') {
          const git = new GitOperation(root, testGitEnvironment())
          if (await git.ref(plan.ref) === plan.before) {
            await connection.execute("DELETE FROM lusiad_git_operations WHERE project_id=? AND operation_id=? AND state='prepared'", [projectId, plan.id])
            await git.cleanup(plan.id).catch(() => {})
            throw error
          }
        }
        throw new GitPendingError(row.operation_id, error)
      }
    }
    return await action()
  } finally { await connection.query("SELECT RELEASE_LOCK(?)", [name]).catch(() => {}) }
}

export async function recordGitOperation(connection: PoolConnection, projectId: number, root: string,
  kind: GitPlan["kind"], title: string, description: string | null, name?: string, validateSnapshot?: () => Promise<unknown>) {
  root = resolve(root)
  const branch = await selected(connection, projectId), git = new GitOperation(root, testGitEnvironment())
  if (await git.headRef() !== `refs/heads/${branch.name}`) throw new GitValidationError("Branch Git difere da selecionada no Lusiad")
  const events = await pendingEvents(connection, projectId, branch.id)
  if (kind === "commit" && !events.length) throw new GitValidationError("Não há mudanças não commitadas para salvar")
  if (kind !== "commit" && events.length) throw new GitValidationError("Conclua as mudanças antes de criar/integrar branch")
  let baseId: number | null = null
  if (kind === "merge") {
    const [base] = await connection.query<Branch[]>("SELECT id,name FROM branches WHERE project_id=? AND id=?", [projectId, branch.base])
    if (base.length !== 1) throw new GitValidationError("Branch base não encontrada neste projeto")
    name = base[0].name; baseId = base[0].id
    title = `Merge ${branch.name} -> ${name}`
  }
  if (kind === "branch") {
    const [duplicates] = await connection.query<Branch[]>("SELECT id FROM branches WHERE project_id=? AND name=?", [projectId, name])
    if (duplicates.length) throw new GitValidationError("Já existe uma branch com este nome")
  }
  if (!title.trim() || [...title].length > 255 || (description && Buffer.byteLength(description, "utf8") > 65535))
    throw new GitValidationError("Título/descrição excedem os limites do registro SQL")
  if (kind === "branch" || kind === "merge") {
    if (!name?.trim() || [...name].length > 255) throw new GitValidationError("Nome de branch inválido ou longo demais")
    const [lineage] = await connection.query<Branch[]>("SELECT id,base FROM branches WHERE project_id=?", [projectId])
    const visited = new Set<number>(); let cursor: number | null = branch.id
    while (cursor !== null) {
      const node = lineage.find((entry) => entry.id === cursor)
      if (!node || visited.has(cursor)) throw new GitValidationError("Base de branch inválida ou cíclica; revise o cadastro")
      visited.add(cursor); cursor = node.base
    }
  }
  const id = randomUUID(), plan = await git.plan(id, kind, title, description, name)
  const frozen: Frozen = { version: 1, projectId, root, branchId: branch.id, baseId, branchName: name ?? branch.name, title, description,
    events: events.map((event) => ({ id: event.id, digest: eventDigest(event) })), plan }
  try {
    await validateSnapshot?.()
    if (kind === "branch" || kind === "merge") await git.assertClean()
    await assertSafeGitArchive(root, plan.sha)
    // Refuse unlinked Git parents before publishing, including external commits not yet reconciled.
    for (const parent of [...new Set([plan.source, ...(kind === "merge" ? [plan.before] : [])])].filter(Boolean)) {
      const [parents] = await connection.query<RowDataPacket[]>("SELECT c.id FROM commits c JOIN branches b ON b.id=c.branch_id WHERE b.project_id=? AND c.git_id=?", [projectId, parent])
      if (!parents.length) throw new GitValidationError("HEAD Git sem vínculo SQL neste projeto")
    }
    await verifyEvents(git, plan, events, connection, projectId)
  } catch (e) { await git.cleanup(id); throw e }
  try {
    await connection.execute("INSERT INTO lusiad_git_operations(operation_id,project_id,state,payload) VALUES(?,?,'prepared',?)", [id, projectId, JSON.stringify(frozen)])
    return await finish(connection, projectId, root, { operation_id: id, payload: frozen, state: "prepared", commit_id: null } as Journal)
  } catch (e) {
    throw new GitPendingError(id, e)
  }
}

/** Restore a recorded tree as a new child of the current HEAD, with a durable source link. */
export async function recordRestoreCommit(connection: PoolConnection, projectId: number, root: string, sourceCommitId: number,
  requestId: string = randomUUID(), change?: { changeId: number; tree: string }) {
  root = resolve(root)
  const branch = await selected(connection, projectId)
  const git = new GitOperation(root, testGitEnvironment())
  if (await git.headRef() !== `refs/heads/${branch.name}`) throw new GitValidationError("Branch Git difere da selecionada no Lusiad")
  if ((await pendingEvents(connection, projectId, branch.id)).length)
    throw new GitValidationError("Conclua ou descarte todas as mudanças pendentes antes de restaurar")
  const [source] = await connection.query<Array<RowDataPacket & { git_id: string }>>(
    "SELECT c.git_id FROM commits c JOIN branches b ON b.id=c.branch_id WHERE b.project_id=? AND c.id=?",
    [projectId, sourceCommitId])
  if (source.length !== 1) throw new GitValidationError("Commit de origem não encontrado neste projeto")
  if (change) {
    const [rows] = await connection.query<RowDataPacket[]>(
      "SELECT id FROM changes WHERE project_id=? AND commit_id=? AND id=? LIMIT 1",
      [projectId, sourceCommitId, change.changeId])
    if (rows.length !== 1 || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(change.tree))
      throw new GitValidationError("Mudança ou árvore de origem inválida")
    await assertSafeGitArchive(root, change.tree)
  }
  await assertSafeGitArchive(root, source[0].git_id)
  await git.assertClean()
  const head = await git.ref(await git.headRef())
  if (!head) throw new GitValidationError("A branch atual não possui commit")
  const [parents] = await connection.query<RowDataPacket[]>(
    "SELECT c.id FROM commits c JOIN branches b ON b.id=c.branch_id WHERE b.project_id=? AND c.git_id=? LIMIT 1",
    [projectId, head])
  if (!parents.length) throw new GitValidationError("HEAD Git sem vínculo SQL neste projeto")
  const target = change?.tree ?? source[0].git_id
  if ((await git.git(["rev-parse", `${head}^{tree}`])).trim() === (await git.git(["rev-parse", `${target}^{tree}`])).trim())
    throw new GitValidationError(change
      ? "O projeto já corresponde ao estado após a mudança selecionada"
      : "O projeto já corresponde ao commit selecionado")
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(requestId)) throw new GitValidationError("Identificador de restauração inválido")
  const id = requestId, title = change ? `Restaurar projeto após mudança #${change.changeId}` : `Restaurar projeto para commit #${sourceCommitId}`
  const description = change
    ? `Origem: estado após a mudança #${change.changeId} do commit #${sourceCommitId} (${source[0].git_id}); árvore parcial ${change.tree}.`
    : `Origem: commit #${sourceCommitId} (${source[0].git_id}).`
  const plan = await git.plan(id, "restore", title, description, target)
  const frozen: Frozen = { version: 1, projectId, root, branchId: branch.id, baseId: null,
    branchName: branch.name, title, description, events: [], plan, restoreSourceCommitId: sourceCommitId,
    ...(change ? { restoreSourceChangeId: change.changeId } : {}) }
  try {
    await assertSafeGitArchive(root, plan.sha)
    if ((await pendingEvents(connection, projectId, branch.id)).length) throw new GitValidationError("Mudanças pendentes surgiram durante a restauração")
    await git.assertClean()
  } catch (error) { await git.cleanup(id); throw error }
  try {
    await connection.execute("INSERT INTO lusiad_git_operations(operation_id,project_id,state,payload) VALUES(?,?,'prepared',?)", [id, projectId, JSON.stringify(frozen)])
    return await finish(connection, projectId, root, { operation_id: id, payload: frozen, state: "prepared", commit_id: null } as Journal)
  } catch (error) {
    if (await git.ref(plan.ref) === plan.before) {
      await connection.execute("DELETE FROM lusiad_git_operations WHERE project_id=? AND operation_id=? AND state='prepared'", [projectId, id])
      await git.cleanup(id).catch(() => {})
      throw error
    }
    throw new GitPendingError(id, error)
  }
}

/** Call inside the project recording lock, after registering its actual symbolic branch.
 * Existing HEADs and unborn histories with pending edits are preserved, never re-parented.
 */
export async function needsInitialGitSnapshot(connection: PoolConnection, projectId: number, root: string): Promise<boolean> {
  const git = new GitOperation(resolve(root), testGitEnvironment())
  if (await git.ref(await git.headRef())) return false
  const [events] = await connection.query<RowDataPacket[]>("SELECT id FROM changes WHERE project_id=? LIMIT 1", [projectId])
  const [commits] = await connection.query<RowDataPacket[]>("SELECT c.id FROM commits c JOIN branches b ON b.id=c.branch_id WHERE b.project_id=? LIMIT 1", [projectId])
  if (commits.length) throw new GitValidationError("Git sem HEAD mas com histórico SQL: restaure o repositório original antes de continuar")
  // A snapshot of already edited files would apply those events twice during replay.
  // Keep the legacy root commit path; its recorded preimages resolve its first preview.
  return events.length === 0
}

export async function ensureInitialGitSnapshot(connection: PoolConnection, projectId: number, root: string): Promise<void> {
  if (!await needsInitialGitSnapshot(connection, projectId, root)) return
  await recordGitOperation(connection, projectId, root, "initialize", "Lusiad: initial project snapshot",
    "Technical baseline captured before the first tracked change; no user files were created.")
}
