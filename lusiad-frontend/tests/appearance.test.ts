import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { BLOCK_GROUPS, DEFAULT_PALETTE, PALETTE_BOOTSTRAP, PALETTE_STORAGE_KEY, blockGroup, changeBlockColor, paletteColors, parsePalette } from '../src/lib/appearance.ts'

test('palette storage rejects unsupported versions and CSS injection; keeps valid known colors', () => {
  for (const raw of [null, '{', '{"version":2,"preset":"custom"}', '{"version":1,"preset":"unknown"}']) {
    assert.deepEqual(parsePalette(raw), DEFAULT_PALETTE)
  }
  const input = JSON.stringify({ version: 1, preset: 'custom', custom: { types: '#ABC123', methods: 'url(https://invalid)', extra: '#000000', fields: 12 } })
  const parsed = parsePalette(input)
  assert.deepEqual(parsed.custom, { types: '#abc123' })
  assert.equal(paletteColors(parsed).methods, paletteColors(DEFAULT_PALETTE).methods)
  assert.equal(paletteColors(parsed).types, '#abc123')
})

test('editing a preset preserves other family colors across storage and reset', () => {
  const preset = { ...DEFAULT_PALETTE, preset: 'soft' as const }
  const edited = changeBlockColor(preset, 'types', '#102030')
  assert.equal(edited.preset, 'custom')
  assert.deepEqual(paletteColors(parsePalette(JSON.stringify(edited))), { ...paletteColors(preset), types: '#102030' })
  assert.equal(changeBlockColor(edited, 'types', 'red'), edited)
  assert.notEqual(paletteColors(DEFAULT_PALETTE).types, '#102030')
  assert.equal(new Set(Object.values(paletteColors({ ...preset, preset: 'monochrome' }))).size, 1)
})

test('prepaint palette script allows only known properties and survives unavailable storage', () => {
  const properties: Record<string, string> = {}, dataset: Record<string, string> = {}
  const sandbox = {
    localStorage: { getItem: (key: string) => { assert.equal(key, PALETTE_STORAGE_KEY); return JSON.stringify({ version: 1, preset: 'custom', custom: { types: '#ff00ff', '--foreground': '#000000', calls: 'red; display:none' } }) } },
    document: { documentElement: { style: { setProperty: (key: string, value: string) => { properties[key] = value } }, dataset } },
  }
  vm.runInNewContext(PALETTE_BOOTSTRAP, sandbox)
  assert.deepEqual(Object.keys(properties).sort(), BLOCK_GROUPS.map(g => `--block-${g}-base`).sort())
  assert.equal(properties['--block-types-base'], '#ff00ff')
  assert.equal(properties['--block-calls-base'], paletteColors(DEFAULT_PALETTE).calls)
  assert.equal(dataset.blockPalette, 'custom')
  assert.doesNotThrow(() => vm.runInNewContext(PALETTE_BOOTSTRAP, { localStorage: { getItem: () => { throw Error('unavailable') } } }))
})

test('PSI families cover declarations, statements, comments and future fallback', () => {
  const examples = { PsiClassImpl: 'types', PsiMethodImpl: 'methods', PsiFieldImpl: 'fields', PsiDeclarationStatementImpl: 'variables', PsiIfStatementImpl: 'conditionals', PsiForeachStatementImpl: 'loops', PsiSwitchExpressionImpl: 'switch', PsiCatchSectionImpl: 'exceptions', PsiExpressionStatementImpl: 'calls', PsiReturnStatementImpl: 'returns', PsiContinueStatementImpl: 'jumps', PsiDocCommentImpl: 'comments', PsiImportStatementImpl: 'file', PsiFutureNodeImpl: 'blocks' }
  for (const [type, expected] of Object.entries(examples)) assert.equal(blockGroup(type), expected)
})
