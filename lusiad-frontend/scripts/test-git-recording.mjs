// Isolated MySQL integration check. Never connects to the application's database.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import mysql from 'mysql2/promise'
import ts from 'typescript'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const executable = process.argv[2] ?? process.env.LUSIAD_MYSQLD ?? 'mysqld'
const cache = join(project, '.cache')
await mkdir(cache, { recursive: true })
const lab = await mkdtemp(join(cache, 'git-recording-test-'))
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
  await writeFile(join(lab, 'context.json'), JSON.stringify({ port, data }))
  // Upgrade an actual P05.2 schema with legacy records, not just an empty bootstrap.
  const bootstrap = await readFile(join(project, '../lusiad-backend/db/migrations/lusiad-test-schema.sql'), 'utf8')
  const migration = await readFile(join(project, '../lusiad-backend/db/migrations/lusiad-git-operations-migration.sql'), 'utf8')
  await connection.query('CREATE DATABASE lusiad_git_upgrade; USE lusiad_git_upgrade')
  await connection.query(bootstrap.split('-- P06.1:')[0])
  await connection.query(`INSERT INTO projects(id,path,name) VALUES(1,'legacy-root','Legacy');
    INSERT INTO branches(id,project_id,active,selected,name) VALUES(1,1,'1','1','main');
    INSERT INTO commits(id,branch_id,git_id,summary,timestamp,is_merge_commit,is_new_branch_commit) VALUES(1,1,'legacy-sha','Legacy',NOW(),'0','0');
    INSERT INTO changes(id,project_id,branch_id,commit_id,summary,date_time,change_type,scope,req_body) VALUES(1,1,1,1,'Legacy',NOW(),'update','file','{"path":"Old.java"}');
    INSERT INTO commit_change_sets VALUES('legacy-sha',1,1,1);`)
  const snapshot = async () => {
    const result = []
    for (const table of ['projects','branches','commits','changes','commit_change_sets']) result.push((await connection.query('SELECT * FROM ' + table))[0])
    return result
  }
  const legacy = await snapshot()
  await connection.query(migration); await connection.query(migration)
  const syncMigration = await readFile(join(project, '../lusiad-backend/db/migrations/lusiad-sync-operations-migration.sql'), 'utf8')
  await connection.query(syncMigration); await connection.query(syncMigration)
  assert.deepEqual(await snapshot(), legacy, 'Additive migration must preserve existing records and links')
  await connection.query('CREATE DATABASE lusiad_git_test; USE lusiad_git_test')
  await connection.query(await readFile(join(project, '../lusiad-backend/db/migrations/lusiad-test-schema.sql'), 'utf8'))
  await connection.query(await readFile(join(project, '../lusiad-backend/db/migrations/lusiad-git-operations-migration.sql'), 'utf8'))
  await connection.end()
  pool = mysql.createPool({ host: '127.0.0.1', port, user: 'root', database: 'lusiad_git_test', dateStrings: true })
  const production = join(project, 'src/lib/services/commit-menu/git-recording.service.ts')
  let source = (await readFile(production, 'utf8')).replace('import "server-only"', '')
  for (const [alias, path] of Object.entries({
    '../contained-paths': 'src/lib/services/contained-paths.ts',
    '@/lib/config/test-git': 'src/lib/config/test-git.ts',
    './git-operation': 'src/lib/services/commit-menu/git-operation.ts',
  })) source = source.replaceAll('"' + alias + '"', JSON.stringify(pathToFileURL(join(project, path)).href))
  await writeFile(join(lab, 'recording.mjs'), ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText)
  const { recordGitOperation, withGitRecordingLock, ensureInitialGitSnapshot, needsInitialGitSnapshot } = await import(pathToFileURL(join(lab, 'recording.mjs')))
  const { GitOperation, textHash } = await import(pathToFileURL(join(project, 'src/lib/services/commit-menu/git-operation.ts')))
  const { testGitEnvironment } = await import(pathToFileURL(join(project, 'src/lib/config/test-git.ts')))
  const one = await pool.getConnection(), two = await pool.getConnection()
  globalThis.__gitRegressionPool = pool
  await writeFile(join(lab, 'pool.mjs'), 'export const getPool = () => globalThis.__gitRegressionPool;')
  let registrySource = (await readFile(join(project, 'src/lib/repositories/track-control/track-control.repository.ts'), 'utf8')).replace('import "server-only"', '')
  registrySource = registrySource.replace('"@/lib/repositories/database"', JSON.stringify(pathToFileURL(join(lab, 'pool.mjs')).href))
    .replace('"@/lib/config/runtime-config"', JSON.stringify(pathToFileURL(join(project, 'src/lib/config/runtime-config.ts')).href))
  await writeFile(join(lab, 'registry.mjs'), ts.transpileModule(registrySource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText)
  const registry = await import(pathToFileURL(join(lab, 'registry.mjs')))
  async function compileRepository(name, path) {
    let source = (await readFile(join(project, path), 'utf8')).replace('import "server-only"', '')
    source = source.replaceAll('"@/lib/repositories/database"', JSON.stringify(pathToFileURL(join(lab, 'pool.mjs')).href))
      .replaceAll('"@/lib/models/change-history/history-query.model"', JSON.stringify(pathToFileURL(join(project, 'src/lib/models/change-history/history-query.model.ts')).href))
    await writeFile(join(lab, name + '.mjs'), ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText)
    return import(pathToFileURL(join(lab, name + '.mjs')))
  }
  const history = await compileRepository('commit-history', 'src/lib/repositories/commit-history/commit-history.repository.ts')
  const changes = await compileRepository('change-history', 'src/lib/repositories/change-history/change-history.repository.ts')

  async function fixture(id, db = one) {
    const root = join(lab, 'project-' + id); await mkdir(root)
    const git = new GitOperation(root, testGitEnvironment())
    await git.git(['init', '-b', 'main'])
    await git.git(['config', 'user.name', 'Lusiad Regression'])
    await git.git(['config', 'user.email', 'regression@example.invalid'])
    await git.git(['config', 'commit.gpgsign', 'false'])
    await git.git(['config', 'core.autocrlf', 'true'])
    await pool.execute('INSERT INTO projects(id,path,name) VALUES(?,?,?)', [id, root, 'Project ' + id])
    await pool.execute("INSERT INTO branches(id,project_id,active,selected,name) VALUES(?,?,'1','1','main')", [id, id])
    const file = join(root, 'Demo.java'); await writeFile(file, 'class Demo {}\n')
    // Net-zero structural sequence still has real events, including a legitimate root parent.
    for (const [type, body] of [
      ['file_create', { path: '', name: 'Temporary.java' }],
      ['file_rename', { path: 'Temporary.java', newName: 'Renamed.java' }],
      ['file_move', { sourcePath: 'Renamed.java', destPath: 'folder' }],
      ['file_delete', { path: 'folder/Renamed.java' }],
    ]) await pool.execute("INSERT INTO changes(project_id,branch_id,summary,date_time,change_type,scope,req_body) VALUES(?,?,'Structural fixture',NOW(),?,'dir',?)", [id,id,type,JSON.stringify(body)])
    await pool.execute("INSERT INTO changes(project_id,branch_id,summary,date_time,change_type,scope,req_body) VALUES(?,?,'Fixture',NOW(),'update','file',?)",
      [id, id, JSON.stringify({ path: 'Demo.java' })]) // Legacy event compatibility.
    // External bundles retain real disk bytes; Git normalizes CRLF text and preserves binary bytes.
    const [bundle] = await pool.execute("INSERT INTO changes(project_id,branch_id,summary,date_time,change_type,scope,req_body) VALUES(?,?,'External fixture',NOW(),'external_bundle','project','{}')", [id,id])
    for (const [path, bytes] of [
      ['External.java', Buffer.from('class External {}\r\n')],
      ['binary.dat', Buffer.from([0,1,255,13,10,254])],
    ]) {
      await writeFile(join(root,path),bytes)
      await pool.execute("INSERT INTO external_sync_bundle_files(change_id,path,kind,before_kind,after_kind,after_content) VALUES(?,?,'added',NULL,'file',?)", [bundle.insertId,path,bytes])
    }
    const run = (kind, title, target) => withGitRecordingLock(db, id, root, () => recordGitOperation(db, id, root.replaceAll('\\', '/'), kind, title, null, target))
    const initial = await run('commit', 'Initial ' + id)
    const value = { id, root, file, git, run, initial }; return value
  }
  async function edit(f, text, branchId) {
    const before = (await readFile(f.file, 'utf8')).replace(/\r\n?/g, '\n')
    await writeFile(f.file, text)
    const body = { path: 'Demo.java', recordVersion: 2, beforeText: before, beforeHash: textHash(before), afterText: text, afterHash: textHash(text) }
    const [insert] = await pool.execute("INSERT INTO changes(project_id,branch_id,summary,date_time,change_type,scope,req_body) VALUES(?,?,'Edit',NOW(),'update','file',?)", [f.id, branchId, JSON.stringify(body)])
    return insert.insertId
  }
  const a = await fixture(11), b = await fixture(22)
  assert.equal((await registry.findProjectByPath(a.root)).id, 11)
  await assert.rejects(() => registry.insertProject(a.root), /já está cadastrada/)
  const newRoot = join(lab, 'concurrent-registration'); await mkdir(newRoot)
  const registered = await Promise.allSettled([registry.insertProject(newRoot), registry.insertProject(newRoot)])
  assert.equal(registered.filter((result) => result.status === 'fulfilled').length, 1)
  assert.equal(registered.filter((result) => result.status === 'rejected').length, 1)
  const [duplicate] = await pool.execute('INSERT INTO projects(path,name) VALUES(?,?)', [a.root, 'Legacy duplicate'])
  await assert.rejects(() => registry.findProjectByPath(a.root), /mesma raiz física/)
  await pool.execute('DELETE FROM projects WHERE id=?', [duplicate.insertId])

  async function recoverAfterDisconnect(f, kind, title, name) {
    const connection = await pool.getConnection()
    const [ids] = await connection.query('SELECT CONNECTION_ID() AS id')
    const original = GitOperation.prototype.publish
    let armed = true
    GitOperation.prototype.publish = async function(plan) {
      await original.call(this, plan)
      if (armed && this.root === f.root && plan.kind === kind) {
        armed = false; await two.query('KILL ' + Number(ids[0].id))
      }
    }
    try {
      await assert.rejects(() => withGitRecordingLock(connection, f.id, f.root,
        () => recordGitOperation(connection, f.id, f.root, kind, title, null, name)), /sem confirmação/)
    } finally { GitOperation.prototype.publish = original; connection.release() }
    await withGitRecordingLock(two, f.id, f.root, async () => {})
    await withGitRecordingLock(two, f.id, f.root, async () => {})
    const sha = await f.git.ref(await f.git.headRef())
    const [receipt] = await pool.query("SELECT op.commit_id,c.branch_id FROM lusiad_git_operations op JOIN commits c ON c.id=op.commit_id WHERE op.project_id=? AND op.state='applied' AND c.git_id=?", [f.id,sha])
    assert.equal(receipt.length, 1)
    const [selected] = await pool.query("SELECT id FROM branches WHERE project_id=? AND selected='1'", [f.id])
    assert.deepEqual(selected, [{ id: receipt[0].branch_id }])
    return { branchId: receipt[0].branch_id, commitId: receipt[0].commit_id }
  }
  // Interleaved projects, each with main + feature. No global prev/next or event assignment.
  const branchA = await recoverAfterDisconnect(a, 'branch', 'Feature A', 'feature')
  const branchB = await b.run('branch', 'Feature B', 'feature')
  const eventA = await edit(a, 'class Demo { int a; }\n', branchA.branchId)
  const eventB = await edit(b, 'class Demo { int b; }\n', branchB.branchId)
  const commitA = await a.run('commit', 'Edit A')
  const [unaffected] = await pool.query('SELECT commit_id FROM changes WHERE id=?', [eventB]); assert.equal(unaffected[0].commit_id, null)
  const commitB = await b.run('commit', 'Edit B')
  for (const [f, branch, commit, event] of [[a, branchA, commitA, eventA], [b, branchB, commitB, eventB]]) {
    const [rows] = await pool.query('SELECT c.*,b.project_id FROM commits c JOIN branches b ON b.id=c.branch_id WHERE c.id=?', [commit.commitId])
    assert.equal(rows[0].project_id, f.id); assert.equal(rows[0].branch_id, branch.branchId)
    assert.equal(rows[0].prev, branch.commitId)
    assert.equal(await f.git.git(['show', rows[0].git_id + ':Demo.java']), await readFile(f.file, 'utf8'))
    const [set] = await pool.query('SELECT project_id,branch_id,change_id FROM commit_change_sets WHERE git_id=?', [rows[0].git_id])
    assert.deepEqual(set, [{ project_id: f.id, branch_id: branch.branchId, change_id: event }])
  }
  // Exercise the production history queries, including deliberately corrupted legacy links.
  assert.equal(await history.getCommitRowById(a.id, b.initial.commitId), null)
  const scoped = await history.listCommitRowsByBranchIds(a.id, [branchA.branchId, branchB.branchId], 250)
  assert.ok(scoped.length > 0 && scoped.every((row) => row.branch_id === branchA.branchId))
  await pool.execute('UPDATE commits SET prev=? WHERE id=?', [b.initial.commitId,a.initial.commitId])
  assert.equal((await history.getCommitRowById(a.id, a.initial.commitId)).prev, null)
  await pool.execute('UPDATE commits SET prev=NULL WHERE id=?', [a.initial.commitId])
  const [badEvent] = await pool.execute("INSERT INTO changes(project_id,branch_id,commit_id,summary,date_time,change_type,scope,req_body) VALUES(?,?,?,'Legacy wrong owner',NOW(),'update','file','{}')", [a.id,branchB.branchId,commitB.commitId])
  assert.ok(!(await changes.listCommittedChangeHistoryRows(a.id, 250)).some((row) => row.id === badEvent.insertId))
  assert.deepEqual(await changes.listCommittedChangeHistoryRowsByCommitIds(a.id, [commitB.commitId]), [])
  await pool.execute('DELETE FROM changes WHERE id=?', [badEvent.insertId])
  // A real hook rejection cannot leave a fake branch/commit/intent; the real index is unchanged.
  const index = await a.git.indexHash()
  await writeFile(join(a.root, '.git/hooks/pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 })
  await assert.rejects(() => a.run('branch', 'Rejected', 'rejected'))
  assert.equal(await a.git.ref('refs/heads/rejected'), null)
  const [rejected] = await pool.query("SELECT id FROM branches WHERE project_id=11 AND name='rejected'"); assert.equal(rejected.length, 0)
  assert.equal(await a.git.indexHash(), index)
  await rm(join(a.root, '.git/hooks/pre-commit'))
  // Reject a tree that does not match recorded postimages before any ref is published.
  const corruptEvent = await edit(a, 'class Demo { int c; }\n', branchA.branchId)
  await writeFile(a.file, 'class Unrecorded {}\n')
  const beforeMismatch = await a.git.ref('refs/heads/feature')
  await assert.rejects(() => a.run('commit', 'Mismatch'), /Snapshot Git difere/)
  assert.equal(await a.git.ref('refs/heads/feature'), beforeMismatch)
  await writeFile(a.file, 'class Demo { int c; }\n')
  // Inject loss of the actual SQL connection after Git publication but before SQL transaction.
  let armed = true, savedConnectionId
  const [ids] = await one.query('SELECT CONNECTION_ID() AS id'); savedConnectionId = ids[0].id
  const originalPublish = GitOperation.prototype.publish
  GitOperation.prototype.publish = async function(plan) {
    await originalPublish.call(this, plan)
    if (armed && this.root === a.root) {
      armed = false
      // The durable prepared set already exists; a later event is never swept into it.
      await pool.execute("INSERT INTO changes(project_id,branch_id,summary,date_time,change_type,scope,req_body) VALUES(11,?,'Later event',NOW(),'update','file',?)", [branchA.branchId, JSON.stringify({ path: 'Later.java' })])
      await two.query('KILL ' + Number(savedConnectionId))
    }
  }
  await assert.rejects(() => a.run('commit', 'Recover A'), /sem confirmação/)
  GitOperation.prototype.publish = originalPublish
  const sha = await a.git.ref('refs/heads/feature')
  const [pending] = await pool.query("SELECT operation_id FROM lusiad_git_operations WHERE project_id=11 AND state='prepared'"); assert.equal(pending.length, 1)
  await withGitRecordingLock(two, a.id, a.root, async () => {})
  await withGitRecordingLock(two, a.id, a.root, async () => {}) // Restarted/idempotent recovery.
  const [recovered] = await pool.query('SELECT c.id,c.git_id FROM commits c JOIN branches b ON b.id=c.branch_id WHERE b.project_id=11 AND c.git_id=?', [sha]); assert.equal(recovered.length, 1)
  const [assigned] = await pool.query('SELECT id,commit_id FROM changes WHERE id=?', [corruptEvent]); assert.equal(assigned[0].commit_id, recovered[0].id)
  const [later] = await pool.query("SELECT commit_id FROM changes WHERE project_id=11 AND summary='Later event'"); assert.equal(later[0].commit_id, null)
  // Remove only the intentionally inserted fixture event on this proven disposable server.
  await pool.query("DELETE FROM changes WHERE project_id=11 AND summary='Later event'")
  // Lost acknowledgement AFTER the SQL transaction committed: no duplicate event set/commit.
  await edit(a, 'class Demo { int acknowledged; }\n', branchA.branchId)
  let loseAck = true
  const ackConnection = new Proxy(two, { get(target, key) {
    if (key === 'commit') return async () => { await target.commit(); if (loseAck) { loseAck = false; throw new Error('Lost SQL acknowledgement') } }
    const value = target[key]; return typeof value === 'function' ? value.bind(target) : value
  } })
  await assert.rejects(() => withGitRecordingLock(ackConnection, a.id, a.root,
    () => recordGitOperation(ackConnection, a.id, a.root, 'commit', 'Acknowledged', null)), /sem confirmação/)
  await withGitRecordingLock(two, a.id, a.root, async () => {})
  const ackSha = await a.git.ref('refs/heads/feature')
  const [ackRows] = await pool.query('SELECT c.id FROM commits c JOIN branches b ON b.id=c.branch_id WHERE b.project_id=11 AND c.git_id=?', [ackSha])
  assert.equal(ackRows.length, 1)
  // A wrong project/branch association is refused, not silently reassigned.
  const [foreign] = await pool.execute("INSERT INTO changes(project_id,branch_id,summary,date_time,change_type,scope,req_body) VALUES(11,?,'Wrong branch',NOW(),'update','file','{}')", [branchB.branchId])
  await assert.rejects(() => withGitRecordingLock(two, a.id, a.root,
    () => recordGitOperation(two, a.id, a.root, 'commit', 'Wrong', null)), /outra branch/)
  assert.equal(await a.git.ref('refs/heads/feature'), ackSha)
  await pool.query('DELETE FROM changes WHERE id=?', [foreign.insertId])
  // Lock contention across independent connections; the second command must not publish.
  const lockName = 'lusiad:edit:' + textHash('lusiad_git_test:11').slice(0, 40)
  await two.query('SELECT GET_LOCK(?,1)', [lockName])
  const contender = await pool.getConnection()
  await assert.rejects(() => withGitRecordingLock(contender, a.id, a.root, async () => {}), /Outra operação/)
  await two.query('SELECT RELEASE_LOCK(?)', [lockName]); contender.release()
  // Merge both projects using their own base branch; no links cross project boundaries.
  const mergeA = await recoverAfterDisconnect(a, 'merge', 'Merge')
  const mergeB = await withGitRecordingLock(two, b.id, b.root, () => recordGitOperation(two, b.id, b.root, 'merge', 'Merge', null))
  assert.equal(mergeA.branchId, 11); assert.equal(mergeB.branchId, 22)
  const [cross] = await pool.query(`SELECT c.id FROM commits c JOIN branches b ON b.id=c.branch_id
    JOIN commits p ON p.id=c.prev JOIN branches pb ON pb.id=p.branch_id WHERE b.project_id<>pb.project_id`)
  assert.equal(cross.length, 0)
  const [wrong] = await pool.query(`SELECT ch.id FROM changes ch JOIN commits c ON c.id=ch.commit_id JOIN branches b ON b.id=c.branch_id
    WHERE ch.project_id<>b.project_id OR ch.branch_id<>c.branch_id`)
  assert.equal(wrong.length, 0)
  const [intents] = await pool.query("SELECT operation_id FROM lusiad_git_operations WHERE state='prepared'"); assert.equal(intents.length, 0)
  // P06.2: empty/new/legacy initialization uses the same durable protocol, without a schema change.
  async function newborn(id) {
    const root = join(lab, 'initial-' + id); await mkdir(root)
    const git = new GitOperation(root, testGitEnvironment())
    await git.git(['init', '-b', 'main']); await git.git(['config', 'user.name', 'Initial Regression'])
    await git.git(['config', 'user.email', 'initial@example.invalid']); await git.git(['config', 'commit.gpgsign', 'false'])
    await git.git(['config', 'core.hooksPath', join(root, '.git/hooks')])
    await pool.execute('INSERT INTO projects(id,path,name) VALUES(?,?,?)', [id, root, 'Initial ' + id])
    await pool.execute("INSERT INTO branches(id,project_id,active,selected,name) VALUES(?,?,'1','1','main')", [id,id])
    const init = () => withGitRecordingLock(two, id, root, () => ensureInitialGitSnapshot(two, id, root))
    return { id, root, git, init }
  }
  const fresh = await newborn(100)
  const pristineIndex = await fresh.git.indexHash()
  const hook = join(fresh.root, '.git/hooks/pre-commit')
  await writeFile(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 })
  await assert.rejects(fresh.init)
  assert.equal(await fresh.git.ref('refs/heads/main'), null)
  assert.equal(await fresh.git.indexHash(), pristineIndex)
  assert.equal((await pool.query('SELECT id FROM commits WHERE branch_id=100'))[0].length, 0)
  assert.equal(await needsInitialGitSnapshot(two, fresh.id, fresh.root), true)
  await rm(hook)
  // Lose the real SQL connection AFTER publishing the technical empty commit.
  const initConnection = await pool.getConnection()
  const [initIds] = await initConnection.query('SELECT CONNECTION_ID() AS id')
  const savedPublish = GitOperation.prototype.publish
  let killInit = true
  GitOperation.prototype.publish = async function(plan) {
    await savedPublish.call(this, plan)
    if (killInit && this.root === fresh.root && plan.kind === 'initialize') {
      killInit = false; await two.query('KILL ' + Number(initIds[0].id))
    }
  }
  try { await assert.rejects(() => withGitRecordingLock(initConnection, fresh.id, fresh.root,
    () => ensureInitialGitSnapshot(initConnection, fresh.id, fresh.root)), /sem confirmação/) }
  finally { GitOperation.prototype.publish = savedPublish; initConnection.release() }
  await fresh.init(); await fresh.init()
  const [initialRows] = await pool.query('SELECT * FROM commits WHERE branch_id=100')
  assert.equal(initialRows.length, 1); assert.equal(initialRows[0].prev, null)
  assert.equal((await fresh.git.git(['ls-tree', '-r', '--name-only', 'HEAD'])).trim(), '')
  assert.equal((await pool.query('SELECT id FROM changes WHERE project_id=100'))[0].length, 0)
  const before = '', after = 'class First { String s = "olá"; }\n'
  await writeFile(join(fresh.root, 'First.java'), after)
  await pool.execute("INSERT INTO changes(project_id,branch_id,summary,date_time,change_type,scope,req_body) VALUES(100,100,'Create',NOW(),'file_create','dir',?)", [JSON.stringify({path:'',name:'First.java'})])
  const [firstEdit] = await pool.execute("INSERT INTO changes(project_id,branch_id,summary,date_time,change_type,scope,req_body) VALUES(100,100,'First edit',NOW(),'create','file',?)", [JSON.stringify({path:'First.java',recordVersion:2,beforeText:before,beforeHash:textHash(before),afterText:after,afterHash:textHash(after)})])
  await writeFile(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 })
  await assert.rejects(() => withGitRecordingLock(two, fresh.id, fresh.root, () => recordGitOperation(two, fresh.id, fresh.root, 'commit', 'Rejected first commit', null)))
  assert.equal(await fresh.git.ref('refs/heads/main'), initialRows[0].git_id)
  assert.equal((await pool.query('SELECT commit_id FROM changes WHERE id=?',[firstEdit.insertId]))[0][0].commit_id,null)
  assert.equal((await pool.query('SELECT id FROM commits WHERE branch_id=100'))[0].length,1)
  await rm(hook)
  const firstCommit = await withGitRecordingLock(two, fresh.id, fresh.root, () => recordGitOperation(two, fresh.id, fresh.root, 'commit', 'First real commit', null))
  assert.equal((await pool.query('SELECT prev FROM commits WHERE id=?', [firstCommit.commitId]))[0][0].prev, initialRows[0].id)
  assert.equal((await fresh.git.git(['show','-s','--format=%P','HEAD'])).trim(), initialRows[0].git_id)

  const restoreRepository = await compileRepository('restore-repository', 'src/lib/repositories/restore/restore.repository.ts')
  let archiveSource = (await readFile(join(project, 'src/lib/services/restore/change-archive.service.ts'), 'utf8')).replace('import "server-only"','')
  for (const [alias,path] of Object.entries({
    '../contained-paths': 'src/lib/services/contained-paths.ts', '../temporary-files': 'src/lib/services/temporary-files.ts',
    '@/lib/config/runtime-config': 'src/lib/config/runtime-config.ts',
    '@/lib/config/test-git': 'src/lib/config/test-git.ts', '../commit-menu/git-operation': 'src/lib/services/commit-menu/git-operation.ts',
    './initial-baseline': 'src/lib/services/restore/initial-baseline.ts',
  })) archiveSource = archiveSource.replaceAll('"'+alias+'"', JSON.stringify(pathToFileURL(join(project,path)).href))
  archiveSource = archiveSource.replace('"@/lib/repositories/restore/restore.repository"', JSON.stringify(pathToFileURL(join(lab,'restore-repository.mjs')).href))
  await writeFile(join(lab,'change-archive.mjs'), ts.transpileModule(archiveSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText)
  const { prepareChangeArchive } = await import(pathToFileURL(join(lab,'change-archive.mjs')))
  const temp = join(lab,'snapshots'); await mkdir(temp)
  const firstContext = await restoreRepository.findRestoreContextByChangeId(firstEdit.insertId)
  firstContext.tempPath = temp
  await prepareChangeArchive(firstContext)
  assert.deepEqual(await (await import('node:fs/promises')).readdir(join(temp,'archive')), [])

  const legacyRoot = await newborn(101)
  await writeFile(join(legacyRoot.root,'Old.java'),'class Old { int after; }\n')
  const oldBefore = 'class Old { int before; }\n', oldAfter = 'class Old { int after; }\n'
  const [oldEvent] = await pool.execute("INSERT INTO changes(project_id,branch_id,summary,date_time,change_type,scope,req_body) VALUES(101,101,'Old edit',NOW(),'update','file',?)", [JSON.stringify({path:'Old.java',recordVersion:2,beforeText:oldBefore,beforeHash:textHash(oldBefore),afterText:oldAfter,afterHash:textHash(oldAfter)})])
  await legacyRoot.init() // Pending events: never capture edited content as their own parent.
  assert.equal(await legacyRoot.git.ref('refs/heads/main'), null)
  await withGitRecordingLock(two,101,legacyRoot.root,()=>recordGitOperation(two,101,legacyRoot.root,'commit','Existing root history',null))
  const preservedSha = await legacyRoot.git.ref('refs/heads/main')
  const oldContext = await restoreRepository.findRestoreContextByChangeId(oldEvent.insertId); oldContext.tempPath=temp
  await prepareChangeArchive(oldContext)
  assert.equal(await readFile(join(temp,'archive/Old.java'),'utf8'),oldBefore)
  await prepareChangeArchive(oldContext,'comparisons/compare-00000000-0000-0000-0000-000000000000/archive')
  assert.equal(await readFile(join(temp,'comparisons/compare-00000000-0000-0000-0000-000000000000/archive/Old.java'),'utf8'),oldBefore)
  await legacyRoot.init(); assert.equal(await legacyRoot.git.ref('refs/heads/main'),preservedSha)
  // Insufficient v1 evidence refuses the preview and preserves its previously published archive.
  await pool.execute('UPDATE changes SET req_body=? WHERE id=?',[JSON.stringify({path:'Old.java'}),oldEvent.insertId])
  await assert.rejects(()=>prepareChangeArchive(oldContext), /preimage unavailable/)
  assert.equal(await readFile(join(temp,'archive/Old.java'),'utf8'),oldBefore)
  assert.equal(await legacyRoot.git.ref('refs/heads/main'),preservedSha)
  if (process.argv.includes('--restore-java')) {
    const replayTemp=join(lab,'java-replay');await mkdir(replayTemp)
    firstContext.tempPath=replayTemp;await prepareChangeArchive(firstContext)
    await pool.execute('UPDATE projects SET temp_path=? WHERE id=100',[replayTemp])
    const config=join(lab,'replay-fixture.json')
    await writeFile(config,JSON.stringify({owner:'p07-p08-disposable',port,target:firstEdit.insertId}))
    const backend=resolve(project,'../lusiad-backend')
    const args=['test','--tests','com.lusiad.backend.service.restore.RestoreSqlIntegrationTest',`-PlusiadReplayFixture=${config}`,'--configuration-cache']
    const child=process.platform==='win32'
      ? spawn('cmd.exe',['/d','/c','gradlew.bat',...args],{cwd:backend,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']})
      : spawn('./gradlew',args,{cwd:backend,env:process.env,stdio:['ignore','pipe','pipe']})
    child.stdout.on('data',chunk=>process.stdout.write(chunk));await childExit(child)
    assert.equal(JSON.parse(await readFile(join(lab,'replay-result.json'),'utf8')).passed,true)
  }
  await (await import('./check-external-sync.mjs')).checkExternalSync({ project, lab, pool, fixture: async id => { const db=await pool.getConnection();try { return await fixture(id,db) } finally { db.release() } } })
  one.release(); two.release()
  await writeFile(join(lab, 'result.json'), JSON.stringify({ kind: 'service-regression', passed: true, timestamp: new Date().toISOString(),
    checks: ['P11/P12 selection/revision/cancel/net-zero/own-race/SQL disconnect/lost acknowledgement/rollback/new file/first-scan recorded SHA', 'legacy migration/rerun', 'registration concurrency and duplicate roots', 'production history queries reject foreign owners and mask legacy global links', 'two projects/two branches',
      'exact trees/parents/event sets', 'core.autocrlf=true with CRLF and binary external bundles', 'hook rejection', 'postimage mismatch', 'SQL connection killed after Git commit/branch/merge publication',
      'late event excluded', 'lost SQL acknowledgement', 'foreign branch rejected', 'lock contention', 'idempotent recovery', 'initial empty snapshot, first edit/commit, hook failure and real SQL disconnect recovery', 'shared first-root archive for history/comparison; legacy SHA preserved; missing preimage refuses without replacing archive'] }, null, 2))
  console.log('PASS: P06.2 initial snapshot/first commit/recovery/legacy archive, plus legacy migration/rerun, root registration concurrency/duplicates, two projects/two branches, exact trees and sets, hook refusal, content mismatch, real SQL disconnect after commit/branch/merge, frozen IDs, lost acknowledgement, foreign-branch refusal, idempotent recovery and contention.')
} finally {
  delete globalThis.__gitRegressionPool
  if (pool) {
    await pool.query('SHUTDOWN').catch(() => {})
    await pool.end().catch(() => {})
  }
  if (server && server.exitCode === null) {
    // Only stop the process created by this script, never the normal MySQL service.
    await Promise.race([once(server, 'exit'), delay(10000)])
    if (server.exitCode === null) throw new Error('Owned MySQL did not shut down; inspect ' + data)
  }
  console.log('Disposable evidence preserved at ' + lab)
}
