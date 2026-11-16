import assert from 'node:assert/strict'
import test from 'node:test'
import { filterLibrarySnippetsModel, listLibrarySnippetsModel } from '../src/lib/models/model-editor/components-panel.model.ts'
import { buildComponentSource, componentDefinition, componentDefinitions, initialAttributes, initialCreationDraft, isLibraryComponentId, previewComponentSource, reduceCreationDraft, validateAttributes, type AttributeValues, type LibraryComponentId } from '../src/lib/models/model-editor/component-creation.model.ts'
import { en, ptBR } from '../src/lib/i18n/messages.ts'
import { parseLibraryFavorites, toggleLibraryFavorite } from '../src/lib/models/model-editor/library-favorites.model.ts'

test('the entire library has a creation contract, matching defaults and translated fields', () => {
  const snippets = listLibrarySnippetsModel().flatMap(group => group.snippets)
  assert.deepEqual(snippets.map(s => s.id).sort(), Object.keys(componentDefinitions).sort())
  for (const snippet of snippets) {
    for (const catalog of [ptBR, en]) for (const key of [`library.snippet.${snippet.id}`, `library.category.${snippet.categoryId}`, `library.context.${snippet.context}`]) {
      assert.ok(key in catalog, key)
    }
    const fields = componentDefinition(snippet.id).fields
    assert.ok(fields.length, snippet.id)
    assert.equal(new Set(fields.map(f => f.id)).size, fields.length)
    assert.deepEqual(validateAttributes(snippet.id, initialAttributes(snippet.id)), {})
    assert.equal(buildComponentSource(snippet.id, initialAttributes(snippet.id)), snippet.content, snippet.id)
    for (const f of fields) for (const catalog of [ptBR, en]) {
      assert.ok(`creation.field.${f.id}` in catalog, f.id)
      assert.ok(`creation.help.${f.id}` in catalog, f.id)
      if (f.enabledBy) assert.ok(fields.some(other => other.id === f.enabledBy && other.kind === 'checkbox'))
    }
  }
  assert.equal(isLibraryComponentId('__proto__'), false)
  assert.equal(isLibraryComponentId('unknown'), false)
  assert.equal(isLibraryComponentId('method-declaration'), true)
})

test('curated choices remain extensible suggestions and never reject custom Java types', () => {
  const types = componentDefinition('field-declaration').fields.find(f => f.id === 'type')!.suggestions!
  const returns = componentDefinition('method-declaration').fields.find(f => f.id === 'returnType')!.suggestions!
  assert.ok(types.includes('int') && types.includes('String'))
  assert.ok(!types.includes('void') && returns.includes('void'))
  for (const definition of Object.values(componentDefinitions)) for (const field of definition.fields) {
    if (field.suggestions) assert.equal(new Set(field.suggestions).size, field.suggestions.length)
  }
  const values = { ...initialAttributes('method-declaration'), returnType: 'MinhaClasse<Outra>' }
  assert.deepEqual(validateAttributes('method-declaration', values), {})
  assert.match(buildComponentSource('method-declaration', values), /MinhaClasse<Outra> myMethod/)
})

test('direct code editing locks fields permanently for this draft, including undo and queued field edits', () => {
  let draft = initialCreationDraft('field-declaration')
  draft = reduceCreationDraft(draft, { type: 'attribute', id: 'name', value: 'other' })
  const generated = previewComponentSource('field-declaration', draft.values)
  assert.match(generated, /String other;/)
  assert.equal(draft.manualSource, null)
  draft = reduceCreationDraft(draft, { type: 'code', source: 'int manual;' })
  assert.equal(reduceCreationDraft(draft, { type: 'attribute', id: 'name', value: 'late' }), draft)
  draft = reduceCreationDraft(draft, { type: 'code', source: generated })
  assert.notEqual(draft.manualSource, null, 'restoring the generated text must not reactivate fields')
  assert.equal(initialCreationDraft('field-declaration').manualSource, null, 'a new creation starts with active fields')
  const invalid = { ...initialAttributes('field-declaration'), name: '' }
  assert.equal(previewComponentSource('field-declaration', invalid), 'private String ;\n')
  assert.equal(previewComponentSource('blank-line', { count: 'Infinity' }), '')
})

test('non-default attributes generate each component family without translating or rewriting user Java', () => {
  const examples: [LibraryComponentId, AttributeValues, string][] = [
    ['class-declaration', { name: 'Caixa', modifiers: 'abstract', typeParameters: 'T', extends: 'Base<T>', implements: 'Runnable', body: '// Ω\n' }, 'abstract class Caixa<T> extends Base<T> implements Runnable {\n// Ω\n}\n'],
    ['interface-declaration', { name: 'Contrato', extends: 'Runnable, AutoCloseable' }, 'public interface Contrato extends Runnable, AutoCloseable {\n}\n'],
    ['enum-declaration', { name: 'Estado', constants: 'ON, OFF', body: 'int value;' }, 'public enum Estado {\nON, OFF;\nint value;\n}\n'],
    ['record-declaration', { name: 'Pair', parameters: 'T first, T second', typeParameters: 'T', implements: 'Serializable' }, 'public record Pair<T>(T first, T second) implements Serializable {\n}\n'],
    ['annotation-declaration', { name: 'Mark', body: 'String value() default "Ω";' }, 'public @interface Mark {\nString value() default "Ω";\n}\n'],
    ['field-declaration', { name: 'ação', type: 'java.util.List<String>', modifiers: 'private final', value: 'java.util.List.of("Ω", "a:b,c")' }, 'private final java.util.List<String> ação = java.util.List.of("Ω", "a:b,c");\n'],
    ['variable-declaration', { name: 'count', type: 'long', modifiers: 'final', value: '' }, 'final long count;\n'],
    ['method-declaration', { name: 'map', returnType: 'T', typeParameters: 'T', parameters: 'T value, int... rest', throws: 'Exception', body: 'return value;' }, 'public <T> T map(T value, int... rest) throws Exception {\nreturn value;\n}\n'],
    ['constructor-declaration', { name: 'Box', parameters: 'int n', body: 'this.n = n;', throws: 'Exception' }, 'public Box(int n) throws Exception {\nthis.n = n;\n}\n'],
    ['static-initializer', { body: 'init();' }, 'static {\ninit();\n}\n'],
    ['instance-initializer', { body: '// Ω\ninit();' }, '{\n// Ω\ninit();\n}\n'],
    ['method-call', { receiver: '', name: 'ação', arguments: '"x\\ny", value' }, 'ação("x\\ny", value);\n'],
    ['return-statement', { expression: '' }, 'return;\n'],
    ['throw-statement', { expression: 'new IllegalStateException("Ω")' }, 'throw new IllegalStateException("Ω");\n'],
    ['expression-statement', { expression: 'count++' }, 'count++;\n'],
    ['break-statement', { label: 'outer' }, 'break outer;\n'],
    ['continue-statement', { label: '' }, 'continue;\n'],
    ['yield-statement', { expression: 'value + 1' }, 'yield value + 1;\n'],
    ['assert-statement', { condition: 'n > 0', detail: '"Ω"' }, 'assert n > 0 : "Ω";\n'],
    ['synchronized-statement', { expression: 'monitor', body: 'count++;' }, 'synchronized (monitor) {\ncount++;\n}\n'],
    ['if-else', { condition: 'value > 0', thenBody: 'go();', withElse: false, elseBody: 'ignored();' }, 'if (value > 0) {\ngo();\n}\n'],
    ['switch-case', { expression: 'n', cases: 'case 2 -> go();', withDefault: false }, 'switch (n) {\ncase 2 -> go();\n}\n'],
    ['for-loop', { initializer: '', condition: '', update: '', body: 'break;' }, 'for (; ; ) {\nbreak;\n}\n'],
    ['foreach-loop', { modifiers: 'final', type: 'var', name: 'entry', iterable: 'entries', body: 'use(entry);' }, 'for (final var entry : entries) {\nuse(entry);\n}\n'],
    ['while-loop', { condition: 'true', body: 'break;' }, 'while (true) {\nbreak;\n}\n'],
    ['do-while-loop', { condition: 'false', body: 'go();' }, 'do {\ngo();\n} while (false);\n'],
    ['try-catch', { resources: 'var in = open()', withCatch: false, withFinally: true, finallyBody: 'close();' }, 'try (var in = open()) {\n}\nfinally {\nclose();\n}\n'],
    ['package-declaration', { qualifiedName: 'app.ação' }, 'package app.ação;\n'],
    ['import-single', { qualifiedName: 'java.lang.Math.PI', isStatic: true }, 'import static java.lang.Math.PI;\n'],
    ['import-wildcard', { qualifiedName: 'java.lang.Math', isStatic: true }, 'import static java.lang.Math.*;\n'],
    ['single-line-comment', { text: '漢字 😀 "a,b:c" \\' }, '// 漢字 😀 "a,b:c" \\\n'],
    ['block-comment', { text: 'first\r\nsecond Ω' }, '/*\n * first\n * second Ω\n */\n'],
    ['javadoc', { text: '@param ação texto\n@return Ω' }, '/**\n * @param ação texto\n * @return Ω\n */\n'],
    ['blank-line', { count: '3' }, '\n\n\n'],
  ]
  assert.equal(examples.length, Object.keys(componentDefinitions).length)
  for (const [id, overrides, expected] of examples) assert.equal(buildComponentSource(id, { ...initialAttributes(id), ...overrides }), expected, id)
  const method = { ...initialAttributes('method-declaration'), modifiers: 'abstract', withBody: false, body: 'ignored();' }
  assert.equal(buildComponentSource('method-declaration', method), 'abstract void myMethod();\n')
  const switched = { ...initialAttributes('switch-case'), returnSwitch: true, expression: 'n', cases: 'case 1 -> 2;', defaultBody: 'yield 0;' }
  assert.equal(buildComponentSource('switch-case', switched), 'return switch (n) {\ncase 1 -> 2;\n    default -> {\nyield 0;\n    }\n};\n')
})

test('library search covers both languages, accents, aliases and no-result recovery', () => {
  const ids = (query: string) => filterLibrarySnippetsModel(query).flatMap(g => g.snippets.map(s => s.id))
  assert.deepEqual(ids('constructor'), ['constructor-declaration'])
  assert.deepEqual(ids('construtor'), ['constructor-declaration'])
  assert.ok(ids('atribuicao').includes('expression-statement'))
  assert.ok(ids('finally').includes('try-catch'))
  assert.ok(ids('++').includes('expression-statement'))
  assert.deepEqual(ids('componente-inexistente'), [])
  assert.deepEqual(ids('  '), listLibrarySnippetsModel().flatMap(g => g.snippets.map(s => s.id)))
})

test('library shortcuts retain pin order and discard duplicate, removed or invalid identities', () => {
  const raw = JSON.stringify({ version: 1, ids: ['method-declaration', 'unknown', 'method-declaration', null, '__proto__', 'return-statement'] })
  const ids = parseLibraryFavorites(raw)
  assert.deepEqual(ids, ['method-declaration', 'return-statement'])
  const pinned = toggleLibraryFavorite(ids, 'class-declaration')
  assert.deepEqual(pinned, ['method-declaration', 'return-statement', 'class-declaration'])
  assert.deepEqual(ids, ['method-declaration', 'return-statement'])
  assert.deepEqual(parseLibraryFavorites(JSON.stringify({ version: 1, ids: pinned })), pinned)
  assert.deepEqual(toggleLibraryFavorite(pinned, 'return-statement'), ['method-declaration', 'class-declaration'])
  for (const invalid of [null, '{', '{}', '{"version":2,"ids":["method-declaration"]}', '{"version":1,"ids":"method-declaration"}']) assert.deepEqual(parseLibraryFavorites(invalid), [])
})

test('library groups separate file structure, statements, jumps and documentation without changing contexts', () => {
  const groups = listLibrarySnippetsModel()
  assert.deepEqual(groups.map(group => group.category.id), ['declarations', 'members', 'statements', 'control-flow', 'loops', 'jumps', 'exceptions', 'organization', 'documentation'])
  assert.deepEqual(groups.find(group => group.category.id === 'jumps')?.snippets.map(snippet => snippet.id), ['return-statement', 'break-statement', 'continue-statement', 'yield-statement'])
  assert.ok(groups.find(group => group.category.id === 'documentation')?.snippets.every(snippet => snippet.context === 'any'))
  assert.ok(groups.find(group => group.category.id === 'organization')?.snippets.every(snippet => snippet.context === 'organization'))
})

test('basic form validation rejects incomplete fields and unsafe delimiters, without claiming Java compilation', () => {
  const errors = (id: LibraryComponentId, overrides: AttributeValues) => validateAttributes(id, { ...initialAttributes(id), ...overrides })
  for (const name of ['', 'two names', 'class', '_']) assert.ok(errors('field-declaration', { name }).name)
  assert.deepEqual(errors('field-declaration', { name: '$ação_2', type: 'Map<String, List<T>>' }), {})
  assert.equal(errors('class-declaration', { name: 'record' }).name, 'identifier')
  assert.equal(errors('package-declaration', { qualifiedName: 'x..y' }).qualifiedName, 'qualifiedName')
  assert.equal(errors('block-comment', { text: 'a */ evil' }).text, 'commentEnd')
  assert.equal(errors('single-line-comment', { text: '\n' }).text, 'singleLine')
  for (const count of ['0', '1001', '1.5', 'NaN', '']) assert.ok(errors('blank-line', { count }).count)
  assert.equal(errors('try-catch', { withCatch: false, catchName: '', withFinally: false }).resources, 'tryHandler')
  assert.deepEqual(errors('try-catch', { withCatch: false, catchName: '', withFinally: true }), {})
  assert.throws(() => buildComponentSource('blank-line', { count: '-1' }), /Invalid component attributes/)
  // Body/expression checking belongs to P29, not an improvised Java parser.
  assert.deepEqual(errors('method-declaration', { body: 'int missing = ' }), {})
})
