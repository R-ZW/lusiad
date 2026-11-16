import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join, parse } from 'node:path'
import { loadApiToken, loadOperationalConfig, tempRootPath } from '../src/lib/config/operational-config.ts'
import { configurationRevision, saveTempRoot } from '../src/lib/config/temp-root-settings.ts'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'lusiad-operational-'))
  const file = join(root, 'config.json'), env = { LUSIAD_CONFIG_FILE: file }
  return { root, file, env, dispose: () => rmSync(root, { recursive: true, force: true }) }
}

test('portable defaults, shared file and explicit overrides have the same precedence', () => {
  const f = fixture()
  try {
    const initial = loadOperationalConfig(f.env)
    assert.equal(initial.tempRoot, join(homedir(), '.lusiad', 'temp'))
    assert.equal(initial.database.user, '')
    assert.equal(initial.database.password, '')
    assert.equal(initial.analyticsEnabled, false)
    assert.equal(initial.allowCloudflareTunnel, false)
    assert.equal(initial.requestTimeoutMs, 60000)
    assert.equal(initial.apiToken, '') // Plugin creates it; the loader never writes configuration.
    assert.equal(loadOperationalConfig({ ...f.env, LUSIAD_API_TIMEOUT_MS: '0' }).requestTimeoutMs, 60000)
    assert.equal(loadOperationalConfig({ ...f.env, LUSIAD_API_TIMEOUT_MS: '1234' }).requestTimeoutMs, 1234)
    assert.equal(loadOperationalConfig({ ...f.env, LUSIAD_API_TOKEN: 'x'.repeat(43) }).apiToken, 'x'.repeat(43))
    assert.equal(loadApiToken({ ...f.env, LUSIAD_API_TOKEN: 'x'.repeat(43), LUSIAD_DB_TLS: 'invalid' }), 'x'.repeat(43))
    assert.throws(() => loadOperationalConfig({ ...f.env, LUSIAD_API_TOKEN: 'invalid-secret' }), error => error instanceof Error && !error.message.includes('invalid-secret'))
    assert.equal(loadOperationalConfig({ ...f.env, LUSIAD_DB_TLS: 'true', LUSIAD_DB_HOST: 'localhost' }).database.tls, true)
    assert.throws(() => loadOperationalConfig({ ...f.env, LUSIAD_DB_TLS: 'true' }), /DNS hostname/)
    assert.throws(() => loadOperationalConfig({ ...f.env, LUSIAD_ANALYTICS_ENABLED: 'yes' }), /true or false/)
    writeFileSync(f.file, JSON.stringify({ version: 1, apiUrl: 'http://127.0.0.1:19000', database: { user: 'fixture', password: 'fixture-secret', port: 3307 } }))
    assert.equal(loadOperationalConfig(f.env).database.port, 3307)
    const override = loadOperationalConfig({ ...f.env, LUSIAD_DB_PASSWORD: '', LUSIAD_DB_PORT: '3308', LUSIAD_API_PORT: '19001' })
    assert.equal(override.database.password, '')
    assert.equal(override.database.port, 3308)
    assert.equal(override.apiUrl, 'http://127.0.0.1:19001')
    assert.throws(() => loadOperationalConfig({ ...f.env, LUSIAD_API_URL: 'http://localhost:19002', LUSIAD_API_PORT: '19003' }), /disagree/)
  } finally { f.dispose() }
})

test('Quick Tunnel access uses the central file with an explicit environment override', () => {
  const f = fixture()
  try {
    writeFileSync(f.file, JSON.stringify({ version: 1, allowCloudflareTunnel: true }))
    const config = loadOperationalConfig(f.env)
    assert.equal(config.allowCloudflareTunnel, true)
    assert.equal(config.frontendUrl, 'http://localhost:3000')
    assert.equal(config.apiUrl, 'http://127.0.0.1:8765')
    assert.equal(loadOperationalConfig({ ...f.env, LUSIAD_ALLOW_CLOUDFLARE_TUNNEL: 'false' }).allowCloudflareTunnel, false)
    assert.equal(loadOperationalConfig({ ...f.env, LUSIAD_ALLOW_CLOUDFLARE_TUNNEL: 'true' }).allowCloudflareTunnel, true)
    assert.throws(() => loadOperationalConfig({ ...f.env, LUSIAD_ALLOW_CLOUDFLARE_TUNNEL: '*' }), /true or false/)
    writeFileSync(f.file, JSON.stringify({ version: 1, allowCloudflareTunnel: [] }))
    assert.throws(() => loadOperationalConfig(f.env), /true or false/)
  } finally { f.dispose() }
})

test('invalid ports, origins, paths and files fail without leaking JSON credentials', () => {
  const f = fixture()
  try {
    for (const port of ['0', '-1', '3.5', '65536', '']) assert.throws(() => loadOperationalConfig({ ...f.env, LUSIAD_DB_PORT: port }))
    for (const url of ['http://user:secret@localhost:8765', 'http://localhost:8765/path', 'http://example.com:8765']) assert.throws(() => loadOperationalConfig({ ...f.env, LUSIAD_API_URL: url }))
    assert.throws(() => tempRootPath('relative/temp'))
    assert.throws(() => tempRootPath(parse(f.root).root))
    writeFileSync(f.file, '{"password":"never-show-this"')
    assert.throws(() => loadOperationalConfig(f.env), error => error instanceof Error && !error.message.includes('never-show-this'))
  } finally { f.dispose() }
})

test('changing default root preserves secrets, extensions and existing reconstruction files', () => {
  const f = fixture()
  try {
    const oldRoot = join(f.root, 'old'), newRoot = join(f.root, 'new')
    mkdirSync(oldRoot); writeFileSync(join(oldRoot, 'active-snapshot.java'), 'class Old {}')
    const original = { version: 1, apiToken: 'x'.repeat(43), tempRoot: oldRoot, database: { user: 'fixture', password: 'keep-secret' }, extension: { keep: true } }
    writeFileSync(f.file, JSON.stringify(original))
    saveTempRoot(newRoot, configurationRevision(f.file), f.env)
    assert.deepEqual(JSON.parse(readFileSync(f.file, 'utf8')), { ...original, tempRoot: newRoot })
    assert.equal(readFileSync(join(oldRoot, 'active-snapshot.java'), 'utf8'), 'class Old {}')
    assert.equal(loadOperationalConfig(f.env).tempRoot, newRoot)
  } finally { f.dispose() }
})

test('stale revision, environment lock and failed directory validation do not overwrite configuration', () => {
  const f = fixture()
  try {
    writeFileSync(f.file, JSON.stringify({ version: 1 }))
    const revision = configurationRevision(f.file)
    writeFileSync(f.file, JSON.stringify({ version: 1, database: { user: 'changed' } }))
    const content = readFileSync(f.file, 'utf8')
    assert.throws(() => saveTempRoot(join(f.root, 'new'), revision, f.env), /conflict/)
    assert.throws(() => saveTempRoot(join(f.root, 'new'), configurationRevision(f.file), { ...f.env, LUSIAD_TEMP_ROOT: f.root }), /managed/)
    const blocked = join(f.root, 'is-file'); writeFileSync(blocked, 'keep')
    assert.throws(() => saveTempRoot(blocked, configurationRevision(f.file), f.env))
    assert.equal(readFileSync(f.file, 'utf8'), content)
  } finally { f.dispose() }
})
