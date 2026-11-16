import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { structuredForm, locateStructuredForm, applyStructuredValues, validateStructuredValues, type StructuredForm } from '../src/lib/models/model-editor/component-edit.model.ts'
import { listLibrarySnippetsModel } from '../src/lib/models/model-editor/components-panel.model.ts'
import type { PsiNode } from '../src/lib/types.ts'

const fixture = (name: string): PsiNode => JSON.parse(readFileSync(new URL(`./fixtures/${name}.psi.json`, import.meta.url), 'utf8')).tree
const source = (n: PsiNode): string => n.children?.length ? n.children.map(source).join('') : n.text ?? ''
const all = (n: PsiNode): PsiNode[] => [n, ...(n.children ?? []).flatMap(all)]
const root = fixture('component-edit'), original = source(root)
const complex = fixture('component-edit-complex'), complexSource = source(complex)
function formFor(text: string, tree = root): StructuredForm {
  const node = all(tree).find(n => source(n) === text && structuredForm(n, source(tree)))
  assert.ok(node, 'No PSI-owned form for: ' + text)
  return structuredForm(node, source(tree))!
}
const update = (form: StructuredForm, values: Record<string, string>) => applyStructuredValues(form, { ...form.values, ...values })

test('the original 22 components retain lossless round trips on their real IntelliJ PSI fixture', () => {
  // The expanded catalogue is exercised against live PSI by the P18 UI sequence.
  // This saved fixture predates that expansion and proves the existing contracts remain intact.
  const added = new Set(['record-declaration', 'annotation-declaration', 'constructor-declaration', 'static-initializer', 'instance-initializer',
    'foreach-loop', 'expression-statement', 'break-statement', 'continue-statement', 'yield-statement', 'assert-statement', 'synchronized-statement'])
  const snippets = listLibrarySnippetsModel().flatMap(g => g.snippets).filter(s => !added.has(s.id))
  assert.equal(snippets.length, 22)
  for (const snippet of snippets) {
    if (snippet.id === 'blank-line') {
      const offset = original.indexOf('\n')
      const form = locateStructuredForm(root, original, offset, offset + 1)!
      assert.equal(form.componentId, snippet.id)
      assert.equal(applyStructuredValues(form, form.values), '\n')
      assert.equal(update(form, { count: '2' }), '\n\n')
    } else {
      const form = formFor(snippet.content.trimEnd())
      assert.equal(form.componentId, snippet.id)
      assert.ok(form.bindings.length)
      assert.equal(applyStructuredValues(form, form.values), form.source, snippet.id)
    }
  }
})

test('representative fields change each component without regenerating surrounding Java', () => {
  const samples: [string, Record<string, string>, string][] = [
    ['private String name;', { name: 'label' }, 'private String label;'],
    ['int x = 5;', { value: '7' }, 'int x = 7;'],
    ['System.out.println("");', { arguments: '"Ω, a:b"' }, 'System.out.println("Ω, a:b");'],
    ['return value;', { expression: 'value + 1' }, 'return value + 1;'],
    ['throw new RuntimeException();', { expression: 'new IllegalStateException()' }, 'throw new IllegalStateException();'],
    ['if (condition) {\n}\nelse {\n}', { condition: '!condition' }, 'if (!condition) {\n}\nelse {\n}'],
    ['switch (value) {\n    case 1 -> {\n    }\n    default -> {\n    }\n}', { expression: 'value + 1' }, 'switch (value + 1) {\n    case 1 -> {\n    }\n    default -> {\n    }\n}'],
    ['for (int i = 0; i < 10; i++) {\n}', { condition: 'i < 11' }, 'for (int i = 0; i < 11; i++) {\n}'],
    ['while (condition) {\n}', { condition: '!condition' }, 'while (!condition) {\n}'],
    ['do {\n} while (condition);', { condition: '!condition' }, 'do {\n} while (!condition);'],
    ['try {\n}\ncatch (Exception e) {\n}', { 'catchType.1': 'RuntimeException', 'catchName.1': 'problem' }, 'try {\n}\ncatch (RuntimeException problem) {\n}'],
    ['public void myMethod() {\n}', { name: 'changedMethod' }, 'public void changedMethod() {\n}'],
    ['public class MyClass {\n}', { name: 'ChangedClass' }, 'public class ChangedClass {\n}'],
    ['public interface MyContract {\n}', { name: 'ChangedContract' }, 'public interface ChangedContract {\n}'],
    ['public enum MyStatus {\n    ACTIVE,\n    INACTIVE\n}', { name: 'ChangedStatus' }, 'public enum ChangedStatus {\n    ACTIVE,\n    INACTIVE\n}'],
    ['// comentário', { text: ' comentário atualizado Ω' }, '// comentário atualizado Ω'],
    ['/*\n * comentário\n */', { text: '\n * atualizado Ω\n ' }, '/*\n * atualizado Ω\n */'],
    ['/**\n * descrição\n */', { text: '\n * atualizada Ω\n ' }, '/**\n * atualizada Ω\n */'],
    ['package com.example.app;', { qualifiedName: 'com.example.updated' }, 'package com.example.updated;'],
    ['import java.util.List;', { qualifiedName: 'java.util.Set' }, 'import java.util.Set;'],
    ['import java.util.*;', { qualifiedName: 'java.time' }, 'import java.time.*;'],
  ]
  for (const [before, values, after] of samples) assert.equal(update(formFor(before), values), after)
})

test('annotations, modifier comments, generic signatures and repeated code survive focused edits', () => {
  const field = '/** keep docs Ω */\n @Mark public /* keep modifier */ static final String name = "same";'
  const form = formFor(field, complex)
  assert.equal(update(form, { name: 'other' }), field.replace(' name ', ' other '))
  assert.equal(update(form, { modifiers: 'protected static final' }), field.replace(' public ', ' protected '))
  const methodNode = all(complex).find(n => n.type === 'PsiMethodImpl' && source(n).includes(' convert('))!
  const method = structuredForm(methodNode, complexSource)!
  assert.equal(update(method, { name: 'map' }), method.source.replace(' convert(', ' map('))
  assert.ok(update(method, { parameters: '/* keep parameter */ U renamed' }).includes('String repeated = "same";\n   return arg;'))
  const genericCall = formFor('this.<String>echo("same");', complex)
  assert.equal(update(genericCall, { name: 'other' }), 'this.<String>other("same");')
  const classifier = all(complex).find(n => n.type === 'PsiClassImpl' && source(n).includes('class Complex<'))!
  const c = structuredForm(classifier, complexSource)!
  assert.equal(update(c, { name: 'Renamed' }), c.source.replace('class Complex<', 'class Renamed<'))
})

test('multiple catches, nested semicolons and unbraced bodies follow PSI structure', () => {
  const loop = all(complex).find(n => n.type === 'PsiForStatementImpl' && source(n).includes('Supplier'))!
  const form = structuredForm(loop, complexSource)!
  assert.equal(update(form, { condition: 'i < 4' }), form.source.replace('i < 3', 'i < 4'))
  const infinite = formFor('for (;;) break;', complex)
  assert.equal(update(infinite, { body: 'call();\nbreak;' }), 'for (;;) {\ncall();\nbreak;\n}')
  const tryNode = all(complex).find(n => n.type === 'PsiTryStatementImpl')!
  const attempt = structuredForm(tryNode, complexSource)!
  assert.equal(update(attempt, { 'catchName.2': 'other' }), attempt.source.replace('second', 'other'))
  assert.ok(attempt.bindings.some(b => b.field.id === 'finallyBody'))
  const conditional = formFor('if (true) call(); else if (false) call();', complex)
  assert.equal(update(conditional, { condition: 'false' }), 'if (false) call(); else if (false) call();')
})

test('shared types and postfix arrays are not guessed or silently destroyed', () => {
  const field = all(complex).find(n => n.type === 'PsiFieldImpl' && source(n).includes('oldArray'))!
  const form = structuredForm(field, complexSource)!
  assert.equal(form.bindings.some(b => b.field.id === 'type'), false)
  assert.equal(update(form, { name: 'renamed' }), form.source.replace('oldArray', 'renamed'))
  const shared = all(complex).find(n => n.type === 'PsiFieldImpl' && source(n).includes('int a'))!
  const sharedForm = structuredForm(shared, complexSource)!
  assert.equal(sharedForm.bindings.some(b => b.field.id === 'type'), false)
  const arrayMethod = all(complex).find(n => n.type === 'PsiMethodImpl' && source(n).includes('arrayMethod'))!
  const method = structuredForm(arrayMethod, complexSource)!
  assert.equal(method.bindings.some(b => b.field.id === 'returnType'), false)
})

test('invalid or multiple-component drafts and whitespace inside literals do not get a fabricated form', () => {
  const method = all(root).find(n => n.type === 'PsiMethodImpl' && source(n).includes('myMethod'))!
  const invalid: PsiNode = { ...method, children: [...method.children!, { ...method, type: 'PsiErrorElementImpl', children: undefined, text: '' }] }
  assert.equal(structuredForm(invalid, original), null)
  assert.equal(locateStructuredForm(root, original, original.indexOf('private String'), original.indexOf('// comentário')), null)
  const fakeLiteral: PsiNode = { ...root, type: 'PsiLiteralExpressionImpl', children: undefined, text: '"\n\n"', startOffset: 0, endOffset: 4 }
  assert.equal(locateStructuredForm(fakeLiteral, '"\n\n"', 1, 3), null)
  assert.throws(() => update(formFor('private String name;'), { name: 'class' }), /Invalid structured/)
  assert.ok(validateStructuredValues(formFor('private String name;'), { ...formFor('private String name;').values, modifiers: '@Bad' }).modifiers)
})

test('simultaneous optional insertions have deterministic order and do not discard existing source', () => {
  const form = formFor('public class MyClass {\n}')
  assert.equal(update(form, { name: 'Box', typeParameters: 'T', extends: 'Base', implements: 'Runnable' }), 'public class Box<T> extends Base implements Runnable {\n}')
  const field = formFor('private String name;')
  assert.equal(update(field, { value: '"Ω"', name: 'other' }), 'private String other = "Ω";')
  const call = formFor('System.out.println("");')
  assert.equal(update(call, { receiver: '', name: 'print' }), 'print("");')
})
