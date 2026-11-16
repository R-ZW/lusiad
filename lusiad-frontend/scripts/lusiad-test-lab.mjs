// Foreground owner of one disposable mysqld. No service/production database access.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import { loadRuntimeConfig, noLinks } from '../src/lib/config/runtime-config.ts'

const configPath = resolve(process.argv[2] ?? '')
const executable = resolve(process.argv[3] ?? '')
process.env.LUSIAD_ENV = 'test'
process.env.LUSIAD_TEST_CONFIG = configPath
const test = loadRuntimeConfig().test
if (!test || !existsSync(executable)) throw new Error('Disposable mysqld executable not found; pass --mysqld')
for (const name of ['mysql', 'processes', 'logs']) noLinks(test.labRoot, join(test.labRoot, name))
const data = join(test.labRoot, 'mysql', 'data')
noLinks(test.labRoot, data)
if (resolve(test.database.dataDirectory).toLowerCase() !== resolve(data).toLowerCase()) throw new Error('Unowned MySQL data directory')
const schemaPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../lusiad-backend/db/migrations/lusiad-test-schema.sql')
const schema = await readFile(schemaPath, 'utf8')
if (createHash('sha256').update(schema).digest('hex') !== test.schemaHash) throw new Error('Test schema differs from the manifest')
const probe = createServer()
probe.listen(test.database.port, '127.0.0.1')
await once(probe, 'listening') // rejects EADDRINUSE; no connection to that other server
await new Promise(done => probe.close(done))
await mkdir(data, { recursive: true })
const logs = join(test.labRoot, 'logs')
await mkdir(logs, { recursive: true })
const runChild = (args) => spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let initializingChild
function cancelInitialization() { if (initializingChild?.exitCode === null) initializingChild.kill() }
for (const event of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(event, cancelInitialization)
async function initialize() {
  if (existsSync(join(data, 'auto.cnf'))) return
  const child = runChild(['--no-defaults', '--initialize-insecure', `--datadir=${data}`, '--console'])
  initializingChild = child
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  const [code] = await once(child, 'exit')
  initializingChild = null
  await writeFile(join(logs, 'mysql-initialize.log'), output)
  if (code !== 0) throw new Error('Disposable MySQL initialization failed; see owned lab logs')
}
await initialize()
const server = runChild(['--no-defaults', `--datadir=${data}`, `--port=${test.database.port}`, '--bind-address=127.0.0.1',
  '--mysqlx=OFF', '--innodb-buffer-pool-size=32M', '--innodb-redo-log-capacity=16M', '--console'])
let output = '', connection, connectionFailure = '', ownedServerUuid
server.stdout.on('data', chunk => { output += chunk })
server.stderr.on('data', chunk => { output += chunk })
const delay = ms => new Promise(done => setTimeout(done, ms))
let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  await connection?.end().catch(() => {})
  if (server.exitCode === null) {
    const exited = once(server, 'exit')
    if (ownedServerUuid) {
      try {
        const admin = await mysql.createConnection({ host: '127.0.0.1', port: test.database.port, user: 'root', connectTimeout: 1000 })
        try {
          const [[identity]] = await admin.query({ sql: 'SELECT @@server_uuid AS uuid', timeout: 3000 })
          if (identity.uuid === ownedServerUuid) await admin.query({ sql: 'SHUTDOWN', timeout: 3000 }).catch(() => {})
        } finally { await admin.end().catch(() => {}) }
        await Promise.race([exited, delay(3000)])
      } catch { /* Fall back only to the actual child, never a PID/port lookup. */ }
    }
    if (server.exitCode === null) server.kill()
    await exited
  }
  await writeFile(join(logs, 'mysql.log'), output)
  await writeFile(join(test.labRoot, 'processes/mysql.json'), JSON.stringify({ runId: test.runId, state: 'stopped' }) + '\n')
}
process.on('SIGINT', () => { void stop() })
process.on('SIGTERM', () => { void stop() })
process.on('SIGBREAK', () => { void stop() })
try {
  for (let n = 0; n < 120; n++) {
    if (server.exitCode !== null || stopping) throw new Error('Disposable MySQL stopped before readiness')
    try {
      connection = await mysql.createConnection({ host: '127.0.0.1', port: test.database.port, user: 'root', multipleStatements: true, connectTimeout: 1000 })
      break
    } catch (failure) { connectionFailure = failure.code ?? failure.name; await delay(250) }
  }
  if (!connection) throw new Error(`Disposable MySQL connection unavailable (${connectionFailure}); see owned lab logs`)
  const [[serverIdentity]] = await connection.query('SELECT @@datadir AS dataDirectory, @@server_uuid AS serverUuid')
  if ((await realpath(serverIdentity.dataDirectory)).toLowerCase() !== (await realpath(data)).toLowerCase()) throw new Error('SQL server is not the child data directory; refusing all writes')
  ownedServerUuid = serverIdentity.serverUuid
  if (test.database.serverUuid !== 'pending-bootstrap' && test.database.serverUuid !== serverIdentity.serverUuid) throw new Error('SQL server UUID changed')
  const [[existing]] = await connection.query('SELECT COUNT(*) AS n FROM information_schema.schemata WHERE schema_name=?', [test.database.name])
  if (Number(existing.n) === 0) {
    if (test.database.serverUuid !== 'pending-bootstrap') throw new Error('Previously bootstrapped schema is missing; prepare a new lab')
    await connection.query(`CREATE DATABASE \`${test.database.name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`)
    await connection.query(`USE \`${test.database.name}\``)
    await connection.query(schema)
    await connection.query("CREATE USER 'lusiad_e2e'@'%' IDENTIFIED BY ?", [test.database.password])
    await connection.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON \`${test.database.name}\`.* TO 'lusiad_e2e'@'%'`)
    const manifest = JSON.parse(await readFile(configPath, 'utf8'))
    manifest.database.serverUuid = serverIdentity.serverUuid
    const bytes = JSON.stringify(manifest, null, 2) + '\n'
    const hash = createHash('sha256').update(bytes).digest('hex')
    await writeFile(configPath, bytes)
    await writeFile(join(test.labRoot, '.lusiad-test-owner.json'), JSON.stringify({ runId: test.runId, configHash: hash }) + '\n')
    await connection.query('INSERT INTO lusiad_test_context(singleton,run_id,config_hash,schema_hash) VALUES(1,?,?,?)', [test.runId, hash, test.schemaHash])
  } else {
    await connection.query(`USE \`${test.database.name}\``)
    const [[owner]] = await connection.query('SELECT run_id, config_hash, schema_hash FROM lusiad_test_context WHERE singleton=1')
    if (!owner || owner.run_id !== test.runId || owner.config_hash !== test.configHash || owner.schema_hash !== test.schemaHash) throw new Error('Existing schema ownership mismatch; no bootstrap/reset performed')
  }
  await writeFile(join(test.labRoot, 'processes/mysql.json'), JSON.stringify({ runId: test.runId, state: 'running', pid: server.pid,
    executable, dataDirectory: data, port: test.database.port, serverUuid: serverIdentity.serverUuid }) + '\n')
  await connection.end(); connection = null
  console.log(`Disposable MySQL ready: ${test.database.host}:${test.database.port} / ${test.database.name}`)
  console.log('Keep this terminal open. Ctrl+C stops only this child; lab data is retained.')
  if (server.exitCode === null) {
    const [code] = await once(server, 'exit')
    if (!stopping && code !== 0) throw new Error('Disposable MySQL exited unexpectedly')
  }
} finally { await stop() }
