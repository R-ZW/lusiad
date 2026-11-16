// Service/SQL/Git regression on the disposable server owned by test-git-recording.
// The Java HTTP recovery call is stubbed; this is not browser or native IntelliJ E2E.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, rename, access } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

export async function checkExternalSync({ project, lab, pool, fixture }) {
  await writeFile(join(lab, 'psi-recovery.mjs'), 'export async function recoverPsiEdits() {}')
  let source = (await readFile(join(project, 'src/lib/services/external-sync/external-sync.service.ts'), 'utf8')).replace('import "server-only"', '')
  const imports = {
    '@/lib/repositories/database': join(lab, 'pool.mjs'),
    '@/lib/repositories/track-control/track-control.repository': join(lab, 'registry.mjs'),
    '@/lib/config/runtime-config': join(project, 'src/lib/config/runtime-config.ts'),
    '@/lib/config/test-git': join(project, 'src/lib/config/test-git.ts'),
    '@/lib/models/change-history/change-metadata': join(project, 'src/lib/models/change-history/change-metadata.ts'),
    '../commit-menu/git-recording.service': join(lab, 'recording.mjs'),
    '../commit-menu/git-operation': join(project, 'src/lib/services/commit-menu/git-operation.ts'),
    '../model-editor/psi-recovery.service': join(lab, 'psi-recovery.mjs'),
    '../contained-paths': join(project, 'src/lib/services/contained-paths.ts'),
    './external-sync.model': join(project, 'src/lib/services/external-sync/external-sync.model.ts'),
    './sync-plan': join(project, 'src/lib/services/external-sync/sync-plan.ts'),
    './sync-disk': join(project, 'src/lib/services/external-sync/sync-disk.ts'),
  }
  for (const [key, path] of Object.entries(imports)) source = source.replaceAll('"' + key + '"', JSON.stringify(pathToFileURL(path).href))
  const compiled = join(lab, 'synchronization.mjs')
  await writeFile(compiled, ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText)
  const sync = await import(pathToFileURL(compiled))
  const { snapshotProject } = await import(pathToFileURL(join(project, 'src/lib/services/external-sync/sync-disk.ts')))
  const { planEntries, encodePlan, entry } = await import(pathToFileURL(join(project, 'src/lib/services/external-sync/sync-plan.ts')))
  const f = await fixture(77)
  assert.deepEqual((await sync.scanExternalChanges(f.id)).changes, [], 'First scan must handle working-tree LF with core.autocrlf=true')
  const original = await readFile(f.file)
  const changed = Buffer.from('class Demo { String label = "external Ω"; }\r\n')
  await writeFile(f.file, changed)
  await writeFile(join(f.root, 'notes.txt'), 'explorer write')
  await mkdir(join(f.root, 'empty'))
  const reviewed = await sync.scanExternalChanges(f.id)
  assert.equal(reviewed.changes.length, 3)
  const selected = reviewed.changes.map(c => ({ ...c, keep: c.path === 'Demo.java' }))
  await writeFile(join(f.root, 'late.txt'), 'new during review')
  await assert.rejects(() => sync.reviewExternalChanges(f.id, selected), /sync_revision_conflict/)
  assert.deepEqual(await readFile(f.file), changed)
  assert.equal((await sync.scanExternalChanges(f.id)).commitRequired, false)
  const fresh = await sync.scanExternalChanges(f.id), id = randomUUID()
  const freshChoices = fresh.changes.map(c => ({ ...c, keep: c.path === 'Demo.java' }))
  const result = await sync.reviewExternalChanges(f.id, freshChoices, id)
  assert.equal(result.commitRequired, true); assert.equal(result.changes.length, 0)
  await assert.rejects(() => access(join(f.root, 'notes.txt')))
  await assert.rejects(() => access(join(f.root, 'empty')))
  const bundle = result.bundleChangeId
  const [files] = await pool.query('SELECT path,before_content,after_content FROM external_sync_bundle_files WHERE change_id=?', [bundle])
  assert.equal(files.length, 1); assert.deepEqual(files[0].before_content, original); assert.deepEqual(files[0].after_content, changed)
  const [events] = await pool.query('SELECT req_body FROM changes WHERE id=?', [bundle])
  const event = typeof events[0].req_body === 'string' ? JSON.parse(events[0].req_body) : events[0].req_body
  assert.deepEqual(event.changeMetadata.files, [{ path: 'Demo.java', kind: 'modified', beforeKind: 'file', afterKind: 'file' }], 'P17: describe only accepted cumulative entries')
  assert.equal((await sync.reviewExternalChanges(f.id, freshChoices, id)).bundleChangeId, bundle, 'Lost acknowledgement retry must not duplicate the bundle')
  await assert.rejects(() => sync.withLusiadMutation(f.id, [f.file], async () => { throw Error('must not run') }), /sync_review_required/)
  await assert.rejects(() => sync.discardAcceptedBundle(f.id, randomUUID(), bundle + 1), /sync_revision_conflict/)
  assert.equal((await sync.scanExternalChanges(f.id)).bundleChangeId, bundle, 'A fresh connection preserves mandatory commit')
  const foreign = (await pool.query('SELECT id FROM projects WHERE id<>? LIMIT 1', [f.id]))[0][0].id
  const [foreignBundle] = await pool.execute("INSERT INTO changes(project_id,summary,date_time,change_type,scope,req_body) VALUES(?,'Foreign fixture',NOW(),'external_bundle','project','{}')", [foreign])
  await pool.execute('UPDATE external_sync_projects SET pending_bundle_change_id=? WHERE project_id=?', [foreignBundle.insertId, f.id])
  await assert.rejects(() => sync.scanExternalChanges(f.id), /sync_recovery_conflict/)
  await pool.execute('UPDATE external_sync_projects SET pending_bundle_change_id=? WHERE project_id=?', [bundle, f.id])
  await pool.execute('DELETE FROM changes WHERE id=?', [foreignBundle.insertId])

  // An arrival between reading bundle metadata and capturing cancellation must
  // remain pending, rather than being absorbed into the restored baseline.
  const beforeCancelGet = pool.getConnection.bind(pool)
  let interceptedConnection
  pool.getConnection = async () => {
    const db = await beforeCancelGet(), query = db.query.bind(db)
    interceptedConnection = db
    db.query = async (...args) => {
      const answer = await query(...args)
      if (String(args[0]).startsWith('SELECT path,kind,before_kind')) await writeFile(join(f.root, 'CancelArrival.txt'), 'preserve cancellation arrival')
      return answer
    }
    return db
  }
  try { await assert.rejects(() => sync.discardAcceptedBundle(f.id, randomUUID(), bundle), /sync_revision_conflict/) }
  finally { pool.getConnection = beforeCancelGet; if (interceptedConnection) delete interceptedConnection.query }
  assert.equal(await readFile(join(f.root, 'CancelArrival.txt'), 'utf8'), 'preserve cancellation arrival')
  assert.equal((await sync.scanExternalChanges(f.id)).bundleChangeId, bundle)
  const arrived = await sync.scanExternalChanges(f.id)
  await sync.reviewExternalChanges(f.id, arrived.changes.map(c => ({ ...c, keep: false })))
  await sync.discardAcceptedBundle(f.id, randomUUID(), bundle)
  assert.deepEqual(await readFile(f.file), original)
  assert.equal((await sync.scanExternalChanges(f.id)).commitRequired, false)

  // Repeated acceptance collapses a net-zero bundle back to no mandatory commit.
  await writeFile(f.file, changed)
  let current = await sync.scanExternalChanges(f.id)
  await sync.reviewExternalChanges(f.id, current.changes.map(c => ({ ...c, keep: true })))
  await writeFile(f.file, original)
  current = await sync.scanExternalChanges(f.id)
  assert.equal((await sync.reviewExternalChanges(f.id, current.changes.map(c => ({ ...c, keep: true })))).commitRequired, false)

  // The acknowledged own operation is its planned result, not a later external re-read.
  const own = join(f.root, 'Own.java')
  await sync.withLusiadMutation(f.id, [own], async () => { await writeFile(own, 'external immediately after own creation'); return { status: 'ok' } },
    { kind: 'file', destination: own, content: 'class Own {}' })
  current = await sync.scanExternalChanges(f.id)
  assert.deepEqual(current.changes.map(c => c.path), ['Own.java'])
  await sync.reviewExternalChanges(f.id, current.changes.map(c => ({ ...c, keep: false })))
  assert.equal(await readFile(own, 'utf8'), 'class Own {}')

  // A durable intent plus a reserved file survives module reload/new SQL connection.
  // No production fault hook/reset endpoint: materialize the actual recorded crash boundary.
  const baseline = await snapshotProject(f.root)
  await writeFile(f.file, changed)
  const before = await snapshotProject(f.root), desired = new Map(before)
  desired.set('Demo.java', entry('Demo.java', 'file', original))
  const plan = { version: 1, id: randomUUID(), projectId: f.id, root: f.root, kind: 'review', bundleId: null, entries: planEntries(baseline, before, desired) }
  await pool.execute("INSERT INTO lusiad_sync_operations(operation_id,project_id,state,payload) VALUES(?,?,'prepared',?)", [plan.id, f.id, encodePlan(plan)])
  await mkdir(join(f.root, '.lusiad-sync-' + plan.id))
  await rename(f.file, join(f.root, '.lusiad-sync-' + plan.id, '0.before'))
  const restarted = await import(pathToFileURL(compiled).href + '?restarted=1')
  assert.deepEqual((await restarted.scanExternalChanges(f.id)).changes, [])
  assert.deepEqual(await readFile(f.file), original)
  assert.equal((await pool.query('SELECT state FROM lusiad_sync_operations WHERE operation_id=?', [plan.id]))[0][0].state, 'applied')

  // COMMIT can succeed while its acknowledgement is lost; compensating is wrong then.
  await writeFile(f.file, changed)
  current = await sync.scanExternalChanges(f.id)
  const originalGet = pool.getConnection.bind(pool)
  pool.getConnection = async () => {
    const db = await originalGet(), commit = db.commit.bind(db)
    db.commit = async () => { await commit(); throw Error('controlled lost COMMIT acknowledgement') }
    return db
  }
  let confirmed
  try { confirmed = await sync.reviewExternalChanges(f.id, current.changes.map(c => ({ ...c, keep: true }))) }
  finally { pool.getConnection = originalGet }
  assert.equal(confirmed.commitRequired, true)
  assert.deepEqual(await readFile(f.file), changed)
  // mysql2 reuses the connection object; restore the injected method before returning it.
  const restore = await pool.getConnection(); delete restore.commit; restore.release()
  await sync.discardAcceptedBundle(f.id)

  // Failed SQL commit compensates only reviewed paths, preserving a new file.
  await writeFile(f.file, changed)
  current = await sync.scanExternalChanges(f.id)
  pool.getConnection = async () => {
    const db = await originalGet()
    db.commit = async () => { await writeFile(join(f.root, 'DuringFailure.txt'), 'keep newer file'); throw Error('controlled SQL rollback') }
    return db
  }
  try { await assert.rejects(() => sync.reviewExternalChanges(f.id, current.changes.map(c => ({ ...c, keep: false }))), /controlled SQL rollback/) }
  finally { pool.getConnection = originalGet }
  const resetCommit = await pool.getConnection(); delete resetCommit.commit; resetCommit.release()
  assert.deepEqual(await readFile(f.file), changed, 'Compensation must retain the pre-review external version')
  assert.equal(await readFile(join(f.root, 'DuringFailure.txt'), 'utf8'), 'keep newer file')
  current = await sync.scanExternalChanges(f.id)
  await sync.reviewExternalChanges(f.id, current.changes.map(c => ({ ...c, keep: false })))
  assert.deepEqual(await readFile(f.file), original)

  const firstScan = await fixture(78)
  const [knownRows] = await pool.query('SELECT c.git_id FROM commits c JOIN branches b ON b.id=c.branch_id WHERE b.project_id=? ORDER BY c.id DESC LIMIT 1', [firstScan.id])
  const knownBytes = await firstScan.git.bytes(['cat-file', '--filters', knownRows[0].git_id + ':Demo.java'])
  await writeFile(firstScan.file, changed)
  await firstScan.git.git(['add', 'Demo.java']); await firstScan.git.git(['commit', '-m', 'External commit before first scan'])
  const first = await sync.scanExternalChanges(firstScan.id)
  assert.deepEqual(first.changes.map(c => c.path), ['Demo.java'], 'First baseline must use the SQL-recorded SHA, not silently adopt external HEAD')
  await sync.reviewExternalChanges(firstScan.id, first.changes.map(c => ({ ...c, keep: false })))
  assert.deepEqual(await readFile(firstScan.file), knownBytes)

  // Actual SQL disconnect after a durable prepare leaves intent for the next connection.
  await writeFile(f.file, changed)
  current = await sync.scanExternalChanges(f.id)
  pool.getConnection = async () => {
    const db = await originalGet(), execute = db.execute.bind(db)
    db.execute = async (...args) => {
      const answer = await execute(...args)
      if (String(args[0]).startsWith('INSERT INTO lusiad_sync_operations')) {
        await pool.query('KILL CONNECTION ' + Number(db.threadId))
      }
      return answer
    }
    return db
  }
  try { await assert.rejects(() => sync.reviewExternalChanges(f.id, current.changes.map(c => ({ ...c, keep: false }))), /sync_operation_pending/) }
  finally { pool.getConnection = originalGet }
  const recovered = await restarted.scanExternalChanges(f.id)
  assert.equal(recovered.commitRequired, false); assert.deepEqual(await readFile(f.file), original)
  assert.equal((await pool.query("SELECT operation_id FROM lusiad_sync_operations WHERE project_id=? AND state='prepared'", [f.id]))[0].length, 0)
  if (process.argv.includes('--sync-java')) {
    const { default: mysql } = await import('mysql2/promise')
    const { spawn } = await import('node:child_process')
    const { once } = await import('node:events')
    const { port } = JSON.parse(await readFile(join(lab, 'context.json'), 'utf8'))
    await pool.query('CREATE DATABASE lusiad_p052')
    const admin = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', database: 'lusiad_p052', multipleStatements: true })
    await admin.query(await readFile(join(project, '../lusiad-backend/db/migrations/lusiad-test-schema.sql'), 'utf8'))
    await admin.execute('INSERT INTO projects(id,path,name) VALUES(1,?,?)', [lab, 'Java disposable fixture'])
    await admin.execute("INSERT INTO branches(id,project_id,active,selected,name) VALUES(1,1,'1','1','main')")
    await admin.execute('INSERT INTO external_sync_projects(project_id,initialized_at) VALUES(1,NOW())')
    const [identity] = await admin.query('SELECT @@server_uuid AS uuid')
    await admin.end()
    const context = join(lab, 'java-edit-fixture.json')
    await writeFile(context, JSON.stringify({ owner: 'p05.2-disposable', port, root: lab, uuid: identity[0].uuid }))
    const backend = join(project, '../lusiad-backend')
    const args = ['test', '--tests', 'com.lusiad.backend.service.psi.EditSqlIntegrationTest', `-PlusiadEditIntegrationConfig=${context}`, '--configuration-cache']
    const env = { ...process.env, LUSIAD_IDE_SANDBOX: join(backend, '.cache/p11-verification-sandbox') }
    const child = process.platform === 'win32' ? spawn('cmd.exe', ['/d', '/c', 'gradlew.bat', ...args], { cwd: backend, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      : spawn('./gradlew', args, { cwd: backend, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let diagnostics = ''
    child.stdout.on('data', chunk => process.stdout.write(chunk)); child.stderr.on('data', chunk => { diagnostics += chunk })
    const [code] = await once(child, 'exit')
    assert.equal(code, 0, diagnostics)
    await writeFile(join(lab, 'sync-java-result.json'), JSON.stringify({ passed: true, kind: 'Java/SQL service regression', nativeUI: false }))
  }
  console.log('PASS: P11/P12 revisions, partial selection, cancel, net-zero, own/external race, durable recovery, lost COMMIT acknowledgement and real SQL disconnect, SQL rollback/new file preservation and first-scan external HEAD (service regression; no native UI claim).')
}
