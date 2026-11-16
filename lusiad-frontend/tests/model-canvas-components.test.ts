import assert from "node:assert/strict"
import { test } from "node:test"
import { listLibrarySnippetsModel } from "../src/lib/models/model-editor/components-panel.model.ts"
import type { PsiNode } from "../src/lib/types.ts"
import { buildReferencePathContext, collectBoxOverlays, collectHoverOnlyInlineOverlays, collectBlankLineOverlays } from "../src/lib/models/model-editor/model-canvas.model.ts"
import { isNodeContentChangedModel } from "../src/lib/models/model-editor/properties-panel.model.ts"

function leaf(type: string, text: string, line: number, column: number): PsiNode {
  return { type, text, startLine: line, endLine: line, startColumn: column, endColumn: column + text.length - 1 }
}

test("leaf comments receive component boxes while ordinary Java tokens do not", () => {
  for (const [type, text] of [["PsiCommentImpl", "// comentário Ω"], ["PsiCommentImpl", "/* comment */"], ["PsiDocCommentImpl", "/** docs */"]]) {
    const comment = leaf(type, text, 1, 3)
    const lines = [`  ${text}`]
    const overlays = collectBoxOverlays(comment, lines, buildReferencePathContext(comment, lines))
    assert.equal(overlays.length, 1)
    assert.equal(overlays[0].node, comment)
    assert.equal(overlays[0].isLeaf, true)
    assert.deepEqual(collectHoverOnlyInlineOverlays(comment, lines), [])
  }
  const token = leaf("PsiJavaTokenImpl", "return", 1, 1)
  const lines = ["return"]
  assert.deepEqual(collectBoxOverlays(token, lines, buildReferencePathContext(token, lines)), [])
})

test("comments at the end of another component remain selectable through an inline overlay", () => {
  const prefix = "int value = 1; "
  const comment = leaf("PsiCommentImpl", "// inline", 1, prefix.length + 1)
  const lines = [prefix + comment.text]
  assert.deepEqual(collectBoxOverlays(comment, lines, buildReferencePathContext(comment, lines)), [])
  const overlays = collectHoverOnlyInlineOverlays(comment, lines)
  assert.equal(overlays.length, 1)
  assert.equal(overlays[0].node, comment)
  const token = leaf("PsiJavaTokenImpl", "1", 1, 13)
  assert.deepEqual(collectHoverOnlyInlineOverlays(token, lines), [])
})

function rangedLeaf(type: string, source: string, start: number, end: number): PsiNode {
  const endPosition = Math.max(start, end - 1)
  return { type, text: source.slice(start, end), startOffset: start, endOffset: end,
    startLine: source.slice(0, start).split('\n').length, endLine: source.slice(0, endPosition).split('\n').length,
    startColumn: start - source.lastIndexOf('\n', start - 1), endColumn: endPosition - source.lastIndexOf('\n', endPosition - 1) }
}

test("blank lines use exact UTF-16 ranges without including the next statement's indentation", () => {
  assert.equal(listLibrarySnippetsModel().flatMap(group => group.snippets).find(item => item.id === "blank-line")?.formalName, "Whitespace Line")
  const source = 'class Demo { // 😀\n\n \t\n  void run() {}\n}\n'
  const whitespace = rangedLeaf('PsiWhiteSpaceImpl', source, source.indexOf('\n'), source.indexOf('void'))
  const overlays = collectBlankLineOverlays(whitespace, source)
  assert.deepEqual(overlays.map((overlay) => overlay.node.text), ['\n', ' \t\n'])
  assert.deepEqual(overlays.map((overlay) => overlay.node.startLine), [2, 3])
  for (const overlay of overlays) {
    const node = overlay.node
    assert.equal(source.slice(node.startOffset, node.endOffset), node.text)
    assert.equal(overlay.heightRem > 0 && overlay.widthCh > 0, true)
    assert.equal(isNodeContentChangedModel(node, '\n\n', node.text ?? ''), true)
  }
  assert.equal(source.slice(Number(overlays[1].node.endOffset)).startsWith('  void'), true)
})

test("blank-looking lines inside comments/literals and an empty EOF are not layout components", () => {
  for (const [type, source] of [['PsiCommentImpl', '/*\n\n*/'], ['PsiLiteralExpressionImpl', '"""\n\n"""']]) {
    assert.deepEqual(collectBlankLineOverlays(rangedLeaf(type, source, 0, source.length), source), [])
  }
  const source = '\n'
  const overlays = collectBlankLineOverlays(rangedLeaf('PsiWhiteSpaceImpl', source, 0, 1), source)
  assert.equal(overlays.length, 1)
  assert.equal(overlays[0].node.startLine, 1)
  assert.deepEqual(collectBlankLineOverlays(rangedLeaf('PsiWhiteSpaceImpl', '', 0, 0), ''), [])
})
