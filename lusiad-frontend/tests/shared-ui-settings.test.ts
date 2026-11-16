import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, unlinkSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readPreferences, savePreferences, validatePreferences } from '../src/lib/config/shared-ui-settings.ts'

test('preference writes merge fields, retain private/configuration sections, and respect another writer lock', () => {
  const folder = mkdtempSync(join(tmpdir(), 'lusiad-settings-')), file = join(folder, 'config.json')
  const previous = process.env.LUSIAD_CONFIG_FILE, environment = process.env.LUSIAD_ENV
  process.env.LUSIAD_CONFIG_FILE = file; process.env.LUSIAD_ENV = 'normal'
  try {
    writeFileSync(file, JSON.stringify({ version: 1, apiToken: 'internal-fixture', database: { password: 'fixture' }, javaProjects: { a: {} }, ui: { language: 'en' } }))
    savePreferences({ theme: 'dark' }); savePreferences({ changeTextLanguage: 'interface' })
    assert.deepEqual(readPreferences(), { language: 'en', theme: 'dark', changeTextLanguage: 'interface' })
    const saved = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(saved.apiToken, 'internal-fixture'); assert.equal(saved.database.password, 'fixture'); assert.deepEqual(saved.javaProjects, { a: {} })
    assert.equal('apiToken' in readPreferences(), false)
    writeFileSync(file + '.lock', 'other writer')
    const before = readFileSync(file, 'utf8')
    assert.throws(() => savePreferences({ theme: 'light' }))
    assert.equal(readFileSync(file + '.lock', 'utf8'), 'other writer'); assert.equal(readFileSync(file, 'utf8'), before)
  } finally {
    if (previous === undefined) delete process.env.LUSIAD_CONFIG_FILE; else process.env.LUSIAD_CONFIG_FILE = previous
    if (environment === undefined) delete process.env.LUSIAD_ENV; else process.env.LUSIAD_ENV = environment
    for (const name of ['config.json', 'config.json.lock']) if (existsSync(join(folder, name))) unlinkSync(join(folder, name))
    rmdirSync(folder)
  }
})
test('preferences validate typed values and reject operational/unknown keys', () => {
  assert.throws(() => validatePreferences({ theme: ['dark'] }))
  assert.throws(() => validatePreferences({ apiToken: 'not-a-preference' }))
  assert.throws(() => validatePreferences({ palette: { version: 1, preset: 'custom', custom: { types: 'invalid' } } }))
  assert.deepEqual(validatePreferences({ language: 'pt-BR', theme: 'system' }), { language: 'pt-BR', theme: 'system' })
})
