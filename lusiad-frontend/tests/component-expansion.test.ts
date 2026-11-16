import assert from 'node:assert/strict'
import test from 'node:test'
import type { PsiNode } from '../src/lib/types.ts'
import { structuredForm, applyStructuredValues } from '../src/lib/models/model-editor/component-edit.model.ts'
import { creationContextAttributes } from '../src/lib/models/model-editor/component-context.model.ts'

// Explicit PSI-shaped boundary fixtures. Actual parser node kinds are checked in
// SyntaxDiagnosticsTest, and the author runs the forms against live PSI in P18 E2E.
type Spec = { kind: string; value?: string; children?: Spec[] }
const leaf = (kind: string, value: string): Spec => ({ kind, value })
const owner = (kind: string, ...children: Spec[]): Spec => ({ kind, children })
const word = (value: string) => leaf('JavaToken', value)
const ws = (value = ' ') => leaf('WhiteSpace', value)
const identifier = (value: string) => leaf('Identifier', value)
const block = () => owner('CodeBlock', word('{'), ws('\n'), leaf('Comment', '// keep Ω'), ws('\n'), word('}'))
function fixture(spec: Spec) {
  const text = (s: Spec): string => s.children ? s.children.map(text).join('') : s.value ?? ''
  const source = text(spec)
  function build(s: Spec, start = 0): PsiNode {
    const value = text(s), end = start + value.length
    let cursor = start
    return { type: 'Psi' + s.kind + 'Impl', startOffset: start, endOffset: end,
      startLine: source.slice(0, start).split('\n').length, startColumn: start - source.lastIndexOf('\n', start - 1),
      endLine: source.slice(0, Math.max(start, end - 1)).split('\n').length, endColumn: end - source.lastIndexOf('\n', Math.max(start, end - 2)) - 1,
      ...(s.children ? { children: s.children.map(child => { const result = build(child, cursor); cursor += text(child).length; return result }) } : { text: value }) }
  }
  return { tree: build(spec), source }
}
const edited = (spec: Spec, id: string, changes: Record<string, string>) => {
  const f = fixture(spec), form = structuredForm(f.tree, f.source)
  assert.ok(form)
  assert.equal(form.componentId, id)
  assert.equal(applyStructuredValues(form, form.values), f.source)
  return { ...f, form, result: applyStructuredValues(form, { ...form.values, ...changes }) }
}

test('constructor and initializer fields keep their source-owned bodies and comments', () => {
  const ctor = owner('Method', owner('ModifierList', word('public')), ws(), identifier('Box'),
    owner('ParameterList', word('('), word(')')), ws(), block())
  const result = edited(ctor, 'constructor-declaration', { name: 'Other' })
  assert.equal(result.result, result.source.replace('Box(', 'Other('))
  assert.equal(result.form.bindings.some(b => b.field.id === 'returnType'), false)
  for (const isStatic of [true, false]) {
    const init = owner('ClassInitializer', owner('ModifierList', ...(isStatic ? [word('static')] : [])),
      ...(isStatic ? [ws()] : []), block())
    const f = edited(init, isStatic ? 'static-initializer' : 'instance-initializer', { body: '\n// changed Ω\n' })
    assert.equal(f.result, f.source.replace('// keep Ω', '// changed Ω'))
  }
})

test('record header and annotation declaration are edited without regenerating their bodies', () => {
  const record = owner('Class', owner('ModifierList'), word('record'), ws(), identifier('Pair'),
    owner('RecordHeader', word('('), leaf('RecordComponent', 'int left'), word(')')), ws(), word('{'), ws(), word('}'))
  const f = edited(record, 'record-declaration', { parameters: 'int left, long right' })
  assert.equal(f.result, 'record Pair(int left, long right) { }')
  const annotation = owner('Class', owner('ModifierList'), word('@'), word('interface'), ws(), identifier('Mark'),
    ws(), word('{'), leaf('AnnotationMethod', 'String value() default "";'), word('}'))
  const a = edited(annotation, 'annotation-declaration', { name: 'Stamp' })
  assert.equal(a.result, a.source.replace('@interface Mark', '@interface Stamp'))
})

test('foreach separates iteration variable, iterable expression and existing body', () => {
  const loop = owner('ForeachStatement', word('for'), ws(), word('('),
    owner('Parameter', owner('ModifierList'), leaf('TypeElement', 'String'), ws(), identifier('item')),
    ws(), word(':'), ws(), leaf('ReferenceExpression', 'items'), word(')'), ws(), owner('BlockStatement', block()))
  const f = edited(loop, 'foreach-loop', { iterable: 'this.items', name: 'entry' })
  assert.equal(f.result, f.source.replace('String item : items', 'String entry : this.items'))
})

test('optional assert details and jump labels stay separate from expressions', () => {
  const assertion = owner('AssertStatement', word('assert'), ws(), leaf('ReferenceExpression', 'valid'), word(';'))
  assert.equal(edited(assertion, 'assert-statement', { detail: '"Ω"' }).result, 'assert valid : "Ω";')
  for (const kind of ['Break', 'Continue']) {
    const f = edited(owner(kind + 'Statement', word(kind.toLowerCase()), word(';')), kind.toLowerCase() + '-statement', { label: 'outer' })
    assert.equal(f.result, kind.toLowerCase() + ' outer;')
  }
})

test('a constructor default uses the enclosing PSI type and never changes the insertion destination', () => {
  const f = fixture(owner('JavaFile', owner('Class', word('class'), ws(), identifier('Box'), ws(), word('{'), ws('\n'), word('}'))))
  const destination = { line: 2 }
  assert.deepEqual(creationContextAttributes('constructor-declaration', f.tree, f.source, destination), { name: 'Box' })
  assert.deepEqual(destination, { line: 2 })
  assert.deepEqual(creationContextAttributes('constructor-declaration', f.tree, f.source, { line: 1 }), {})
  assert.deepEqual(creationContextAttributes('field-declaration', f.tree, f.source, destination), {})
})
