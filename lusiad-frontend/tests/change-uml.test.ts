import test from 'node:test'
import assert from 'node:assert/strict'
import { requireUmlResult } from '../src/lib/models/change-diff/change-uml.model.ts'

const result = () => ({ status: 'ok', engine: 'plantuml-smetana', noStructuralChange: false, movement: '',
  before: { svg: null, classifiers: [], focusFound: false },
  after: { svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Demo</text></svg>', classifiers: ['Demo'], focusFound: true } })

test('local UML accepts passive diagrams and an explicitly empty state', () => {
  const data = result()
  assert.equal(requireUmlResult(data, 'UML'), data)
  assert.equal(requireUmlResult(data, 'UML').before.svg, null)
})

test('UML rejects service errors, missing or mistyped fields and missing diagrams', () => {
  for (const value of [ {}, { ...result(), error: 'failure' }, { ...result(), status: 'error' },
    { ...result(), noStructuralChange: 'true' }, { ...result(), engine: 'remote' },
    { ...result(), before: { classifiers: [], svg: '<svg/>', focusFound: false } },
    { ...result(), after: { classifiers: ['Demo'], svg: null, focusFound: true } },
    { ...result(), after: { classifiers: [42], svg: '<svg/>', focusFound: true } },
  ]) assert.throws(() => requireUmlResult(value, 'UML'), { code: 'invalid_response' })
})

test('UML refuses active and externally linked SVG at the client boundary', () => {
  for (const content of [ '<script/>', '<foreignObject/>', '<image href="file:///secret"/>', '<a href="https://example.invalid"/>',
    '<text onload="x()"/>', '<?xml-stylesheet href="x"?>', '<!DOCTYPE svg>', '<iframe/>', '<style>body{}</style>',
  ]) {
    const value = result()
    value.after.svg = `<svg>${content}</svg>`
    assert.throws(() => requireUmlResult(value, 'UML'), { code: 'invalid_response' })
  }
})
