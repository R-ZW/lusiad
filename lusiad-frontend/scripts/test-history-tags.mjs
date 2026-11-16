// Isolated MySQL integration check. Never connects to the application's database.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import mysql from 'mysql2/promise'
import ts from 'typescript'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const executable = process.argv[2] ?? process.env.LUSIAD_MYSQLD ?? 'mysqld'
const cache = join(project, '.cache')
await mkdir(cache, { recursive: true })
const lab = await mkdtemp(join(cache, 'history-tags-test-'))
const data = join(lab, 'data')
await mkdir(data)
let server
let pool
const childExit = async (child) => {
  let errors = ''
  child.stderr?.on('data', (chunk) => { errors += chunk })
  const [code] = await once(child, 'exit')
  if (code !== 0) throw new Error(`MySQL exited with ${code}: ${errors}`)
}
const delay = (ms) => new Promise((done) => setTimeout(done, ms))
try {
  console.log('Initializing a disposable MySQL data directory…')
  await childExit(spawn(executable, ['--no-defaults', '--initialize-insecure', `--datadir=${data}`, '--console'], { windowsHide: true }))
  const socket = createServer()
  socket.listen(0, '127.0.0.1')
  await once(socket, 'listening')
  const port = socket.address().port
  await new Promise((done) => socket.close(done))
  assert.ok(port !== 3306 && port !== 3307)
  server = spawn(executable, ['--no-defaults', `--datadir=${data}`, `--port=${port}`, '--bind-address=127.0.0.1',
    '--mysqlx=OFF', '--innodb-buffer-pool-size=32M', '--innodb-redo-log-capacity=16M', '--console'], { windowsHide: true })
  let serverOutput = ''
  server.stderr.on('data', (chunk) => { serverOutput += chunk })
  server.stdout.on('data', (chunk) => { serverOutput += chunk })
  let connection
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error(`Disposable MySQL failed: ${serverOutput}`)
    try { connection = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', multipleStatements: true }); break }
    catch { await delay(250) }
  }
  assert.ok(connection, 'Disposable MySQL did not become ready')
  const [location] = await connection.query('SELECT @@datadir AS path')
  assert.equal(resolve(location[0].path).toLowerCase(), resolve(data).toLowerCase(), 'Refuse to change any other server')
  await connection.query('CREATE DATABASE lusiad_tags_test; USE lusiad_tags_test')
  await connection.query(await readFile(join(project, '../lusiad-backend/db/migrations/lusiad-test-schema.sql'), 'utf8'))
  // Use the real current schema. Only the optional tags table is absent while
  // exercising the documented pre-migration fallback on this owned server.
  await connection.query('DROP TABLE lusiad_history_tags')
  await connection.query(`
    INSERT INTO projects(id,path,name) VALUES (11,'/fixture/11','Tags project'),(22,'/fixture/22','Other project');
    INSERT INTO branches(id,project_id,name,active,selected) VALUES (1,11,'main','1','1'),(2,22,'main','1','1');
    INSERT INTO commits(id,git_id,branch_id,prev,next,summary,description,timestamp,is_merge_commit,is_new_branch_commit) VALUES
      (1,'aaaaaaa',1,NULL,NULL,'Initial version','','2026-10-01','0','0'),
      (2,'bbbbbbb',1,1,NULL,'Second version','','2026-10-02','1','0'),
      (3,'ccccccc',2,NULL,NULL,'Other project','','2026-10-03','0','0');
    INSERT INTO changes(id,project_id,branch_id,commit_id,summary,description,date_time,change_type,scope,req_body) VALUES
      (101,11,1,1,'Add class','','2026-10-01','create','file','{"path":"Calculator.java"}'),
      (102,11,1,NULL,'Pending edit','','2026-10-02','update','file','{"path":"Pending.java"}'),
      (201,22,2,3,'Other change','','2026-10-03','create','file','{"path":"Other.java"}');
    INSERT INTO commit_change_sets(git_id,project_id,branch_id,change_id) VALUES ('aaaaaaa',11,1,101),('ccccccc',22,2,201);`)
  await connection.end()
  pool = mysql.createPool({ host: '127.0.0.1', port, user: 'root', database: 'lusiad_tags_test', dateStrings: true, multipleStatements: true })
  globalThis.__historyTagTestPool = pool
  await writeFile(join(lab, 'database.mjs'), 'export const getPool = () => globalThis.__historyTagTestPool;')
  const modules = {
    '@/lib/repositories/database': 'database',
    '@/lib/models/change-history/change-history.model': 'changes-model',
    '@/lib/models/history-tags/history-tags.model': 'tags-model',
    '@/lib/models/change-history/history-query.model': 'query-model',
    '@/lib/repositories/history-tags/history-tags.repository': 'tags-repository',
    '@/lib/repositories/commit-history/commit-history.repository': 'commits-repository',
  }
  modules['@/lib/repositories/history-read'] = 'history-read'
  modules['@/lib/models/change-history/history-page'] = 'history-page'
  const sources = {
    'changes-repository': 'src/lib/repositories/change-history/change-history.repository.ts',
    'changes-model': 'src/lib/models/change-history/change-history.model.ts',
    'history-read': 'src/lib/repositories/history-read.ts',
    'history-page': 'src/lib/models/change-history/history-page.ts',
    'tags-model': 'src/lib/models/history-tags/history-tags.model.ts',
    'query-model': 'src/lib/models/change-history/history-query.model.ts',
    'tags-repository': 'src/lib/repositories/history-tags/history-tags.repository.ts',
    'commits-repository': 'src/lib/repositories/commit-history/commit-history.repository.ts',
    'tags-controller': 'src/controllers/history-tags/history-tags.controller.ts',
    'commits-service': 'src/lib/services/commit-history/commit-history.service.ts',
  }
  // Execute the repository/controller code itself, with only its pool replaced.
  for (const [name, path] of Object.entries(sources)) {
    let source = (await readFile(join(project, path), 'utf8')).replace(/import ["']server-only["']\s*/g, '').replace("from './database'", 'from "@/lib/repositories/database"')
    for (const [alias, module] of Object.entries(modules)) source = source.replaceAll(`"${alias}"`, JSON.stringify(pathToFileURL(join(lab, `${module}.mjs`)).href))
    await writeFile(join(lab, `${name}.mjs`), ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText)
  }
  const repo = await import(pathToFileURL(join(lab, 'tags-repository.mjs')))
  const controller = await import(pathToFileURL(join(lab, 'tags-controller.mjs')))
  const commits = await import(pathToFileURL(join(lab, 'commits-service.mjs')))
  assert.deepEqual(await repo.listProjectHistoryTags(11), { available: false, tags: [] })
  assert.equal((await commits.fetchCommitHistoryService(11)).totalCount, 2, 'Old history still loads without the migration')
  assert.deepEqual(await controller.createHistoryTagController(11, { kind: 'commit', id: 1 }, 'Demo'), { ok: false, code: 'migrationRequired' })
  // P20: real SQL pages/counts/revisions, all fixtures on this disposable server.
  const changes = await import(pathToFileURL(join(lab, 'changes-repository.mjs')))
  for (let index = 0; index < 252; index++) await pool.execute(
    "INSERT INTO changes(project_id,branch_id,summary,date_time,change_type,scope,req_body) VALUES(11,1,?, '2026-10-01','update','file','{}')", [`Page ${index}`])
  const first = await changes.pendingHistoryPage(11, 250)
  assert.equal(first.total, 253)
  assert.equal(first.rows.length, 250)
  const second = await changes.pendingHistoryPage(11, 250, first.nextBeforeId, first.revision)
  assert.equal(second.rows.length, 3)
  assert.equal(second.nextBeforeId, null)
  const ids = [...first.rows, ...second.rows].map(row => row.id)
  assert.equal(new Set(ids).size, 253)
  assert.deepEqual(ids, [...ids].sort((a, b) => b - a))
  assert.ok(!ids.includes(201), 'Another project never leaks into a pending page')
  await pool.execute("INSERT INTO changes(project_id,branch_id,summary,date_time,change_type,scope,req_body) VALUES(11,1,'new event', NOW(),'update','file','{}')")
  await assert.rejects(changes.pendingHistoryPage(11, 250, first.nextBeforeId, first.revision), /changed/)
  const initialPage = await commits.fetchCommitHistoryService(11, 1)
  await pool.execute("INSERT INTO commits(git_id,branch_id,prev,summary,timestamp,is_merge_commit,is_new_branch_commit) VALUES('new-sha',1,2,'New commit',NOW(),'0','0')")
  const anchored = await commits.fetchCommitHistoryService(11, 1, 1, undefined, initialPage.upperId)
  assert.equal(anchored.totalCount, initialPage.totalCount)
  assert.notEqual(anchored.records[0].id, initialPage.records[0].id)
  assert.equal((await commits.fetchCommitHistoryService(11)).totalCount, initialPage.totalCount + 1)
  // Restore fixture membership for the existing tags assertions below.
  await pool.execute("DELETE FROM commits WHERE git_id='new-sha'")
  await pool.execute("DELETE FROM changes WHERE project_id=11 AND id>201")
  const migration = await readFile(join(project, '../lusiad-backend/db/migrations/lusiad-tags-migration.sql'), 'utf8')
  await pool.query(migration)
  await pool.query(migration) // Repeatability on an existing schema.
  assert.deepEqual(await controller.createHistoryTagController(11, { kind: 'commit', id: 1 }, 'Versão 1'), { ok: true })
  assert.deepEqual(await controller.createHistoryTagController(11, { kind: 'change', id: 101 }, 'Método pronto'), { ok: true })
  assert.deepEqual(await controller.createHistoryTagController(11, { kind: 'change', id: 102 }, 'Pendente'), { ok: true })
  assert.deepEqual(await controller.createHistoryTagController(11, { kind: 'commit', id: 1 }, 'VERSAO 1'), { ok: false, code: 'duplicate' })
  assert.deepEqual(await controller.createHistoryTagController(22, { kind: 'commit', id: 3 }, 'Versão 1'), { ok: true }, 'Same name is allowed in another project')
  assert.deepEqual(await controller.createHistoryTagController(11, { kind: 'commit', id: 3 }, 'Foreign'), { ok: false, code: 'invalidTarget' })
  assert.deepEqual(await controller.createHistoryTagController(11, { kind: 'change', id: 201 }, 'Foreign'), { ok: false, code: 'invalidTarget' })
  assert.deepEqual(await controller.createHistoryTagController(11, { kind: 'commit', id: 1 }, '<invalid>'), { ok: false, code: 'invalidName' })
  let tags = (await repo.listProjectHistoryTags(11)).tags
  assert.equal(tags.length, 3)
  const version = tags.find((tag) => tag.name === 'Versão 1')
  const change = tags.find((tag) => tag.name === 'Método pronto')
  const pending = tags.find((tag) => tag.name === 'Pendente')
  assert.equal(pending.commitId, null)
  await pool.query('UPDATE changes SET commit_id = 2 WHERE id = 102')
  await pool.query("INSERT INTO commit_change_sets(git_id,project_id,branch_id,change_id) VALUES ('bbbbbbb',11,1,102)")
  assert.equal((await repo.listProjectHistoryTags(11)).tags.find((tag) => tag.id === pending.id).commitId, 2, 'Pending tag survives committing')
  assert.deepEqual(await controller.renameHistoryTagController(22, version.id, 'Forbidden'), { ok: false, code: 'notFound' })
  assert.deepEqual(await controller.deleteHistoryTagController(22, version.id), { ok: false, code: 'notFound' })
  assert.deepEqual(await controller.renameHistoryTagController(11, change.id, 'VERSAO 1'), { ok: false, code: 'duplicate' })
  assert.deepEqual(await controller.renameHistoryTagController(11, version.id, 'Demonstração'), { ok: true })
  assert.equal((await repo.listProjectHistoryTags(11)).tags.find((tag) => tag.id === version.id).name, 'Demonstração')
  const found = await commits.fetchCommitHistoryService(11, 10, 0, { query: 'demonstracao' })
  assert.equal(found.totalCount, 1)
  assert.deepEqual(found.records.map((record) => record.id), ['1'])
  assert.equal((await commits.fetchCommitHistoryService(11, 10, 0, { query: 'Metodo pronto' })).totalCount, 1, 'Change tags find their parent commit')
  assert.equal((await commits.fetchCommitHistoryService(11, 10, 0, { query: 'Calculator.java' })).totalCount, 1)
  assert.equal((await commits.fetchCommitHistoryService(11, 10, 0, { query: 'change:102' })).records[0].id, '2')
  assert.equal((await commits.fetchCommitHistoryService(11, 1, 0, { taggedOnly: true, showMerges: false })).totalCount, 1, 'Count uses filters before pagination')
  assert.equal((await commits.fetchCommitHistoryService(11, 10, 0, { query: 'missing' })).totalCount, 0)
  assert.deepEqual(await controller.deleteHistoryTagController(11, version.id), { ok: true })
  assert.equal((await repo.listProjectHistoryTags(22)).tags.length, 1, 'Deleting a tag cannot affect another project')
  await assert.rejects(pool.query('INSERT INTO lusiad_history_tags (project_id, name, name_key, commit_id, change_id) VALUES (11, \'Invalid\', \'invalid\', 1, 101)'))
  await pool.query('DELETE FROM changes WHERE id = 101')
  assert.ok(!(await repo.listProjectHistoryTags(11)).tags.some((tag) => tag.id === change.id), 'Target deletion cascades to its tags')
  console.log('PASS: schema fallback, repeated migration, commit/change/pending tags, uniqueness, project isolation, rename/delete, filtered search/paging and foreign keys.')
} finally {
  if (pool) {
    try { await pool.query('SHUTDOWN') } catch { /* Server may close the connection as it shuts down. */ }
    await pool.end()
  }
  if (server && server.exitCode === null) {
    await Promise.race([once(server, 'exit'), delay(10000)])
    if (server.exitCode === null) { server.kill(); await once(server, 'exit') }
  }
  delete globalThis.__historyTagTestPool
  if (!resolve(lab).startsWith(`${resolve(cache)}${sep}`)) throw new Error('Unexpected test directory')
  await rm(lab, { recursive: true, force: true })
}
