import assert from 'node:assert/strict'
import test from 'node:test'
import type { PsiNode } from '../src/lib/types.ts'
import type { BoxOverlay } from '../src/lib/models/model-editor/model-canvas.model.ts'
import { canonicalInteractionOverlays, selectedInteractionOverlay } from '../src/lib/models/model-editor/component-overlays.model.ts'

function box(type: string, path: string, start = 0, end = 20): BoxOverlay {
  const node: PsiNode = { type, startOffset: start, endOffset: end, startLine: 1, endLine: 2, startColumn: 1, endColumn: 1 }
  return { id: path, nodePath: path, node, depth: path.split('.').length - 1, isLeaf: false,
    topRem: 0, leftCh: 0, widthCh: 30, heightRem: 6 }
}

test('coincident initializer/body wrappers expose one semantic action owner', () => {
  const file = box('PsiJavaFileImpl', '0')
  const init = box('PsiClassInitializerImpl', '0.1')
  const body = box('PsiCodeBlockImpl', '0.1.1')
  const original = [file, init, body]
  assert.deepEqual(canonicalInteractionOverlays(original), [init])
  assert.deepEqual(original, [file, init, body], 'raw visual overlays must remain unchanged for history/diff')
  assert.equal(selectedInteractionOverlay(original, [init], body.node), init)
  assert.equal(selectedInteractionOverlay(original, [init], { ...body.node }), undefined, 'an old model node must not match by offsets')
})

test('the rule also handles declaration and documentation wrappers without initializer-specific logic', () => {
  const declaration = box('PsiDeclarationStatementImpl', '0.1')
  const variable = box('PsiLocalVariableImpl', '0.1.0')
  declaration.node.children = [variable.node]
  assert.deepEqual(canonicalInteractionOverlays([declaration, variable]), [variable])
  const doc = box('PsiDocCommentImpl', '0.2')
  const token = box('PsiDocTokenImpl', '0.2.0')
  assert.deepEqual(canonicalInteractionOverlays([doc, token]), [doc])
})

test('different ranges, repeated source and unrelated nodes retain their independent targets', () => {
  const first = box('PsiClassInitializerImpl', '0.1')
  const repeated = box('PsiClassInitializerImpl', '0.2', 30, 50)
  const child = box('PsiExpressionStatementImpl', '0.1.0', 2, 12)
  const sibling = box('PsiClassInitializerImpl', '0.3')
  const input = [first, repeated, child, sibling]
  assert.deepEqual(canonicalInteractionOverlays(input), input)
})

test('transparent wrappers retain the previous deepest target and missing ranges are not guessed', () => {
  const outer = box('PsiBlockStatementImpl', '0.1')
  const inner = box('PsiCodeBlockImpl', '0.1.0')
  assert.deepEqual(canonicalInteractionOverlays([outer, inner]), [inner])
  const unknown = box('PsiCodeBlockImpl', '0.2')
  delete unknown.node.startOffset
  assert.deepEqual(canonicalInteractionOverlays([outer, unknown]), [outer, unknown])
})
