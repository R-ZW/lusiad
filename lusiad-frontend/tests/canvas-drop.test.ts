import assert from "node:assert/strict"
import test from "node:test"
import { resolveCanvasDrop, dropDestination, validMovePayload } from "../src/lib/models/model-editor/canvas-drop.model.ts"
import { collectHoverOnlyInlineOverlays, collectBoxOverlays, buildReferencePathContext } from "../src/lib/models/model-editor/model-canvas.model.ts"
import type { PsiNode } from "../src/lib/types.ts"

function node(type: string, source: string, start = 0, end = source.length, children?: PsiNode[]): PsiNode {
  const last = Math.max(start, end - 1)
  return { type, text: children ? undefined : source.slice(start, end), children, startOffset: start, endOffset: end,
    startLine: source.slice(0, start).split("\n").length, endLine: source.slice(0, last).split("\n").length,
    startColumn: start - source.lastIndexOf("\n", start - 1), endColumn: last - source.lastIndexOf("\n", last - 1) }
}

test("drop destinations cover empty file, blank line, between lines and EOF without a newline", () => {
  for (const source of ["", "class A {}", "class A {}\n", "one\ntwo"]) {
    const tree = node("PsiJavaFileImpl", source)
    const last = source.split("\n").length - 1
    const target = dropDestination(resolveCanvasDrop(tree, source, last, 0)!)
    assert.equal(target.line, last + 1)
    assert.equal(target.lineEnd, undefined, "EOF never sends a nonexistent following line")
    if (source && !source.endsWith("\n")) assert.equal(target.column, source.split("\n")[last].length + 1)
  }
  const source = "one\ntwo"
  assert.deepEqual(dropDestination(resolveCanvasDrop(node("PsiJavaFileImpl", source), source, 0, 0)!), { line: 1, lineEnd: 2 })
})

test("only real empty PSI bodies are inline destinations, including multiple bodies on one line", () => {
  const source = 'class A { String s="{}"; /* {} */ void a() {} void b() { } }'
  const body = (start: number) => {
    const end = source.indexOf("}", start) + 1
    return node("PsiCodeBlockImpl", source, start, end, [node("PsiJavaTokenImpl", source, start, start+1), node("PsiJavaTokenImpl", source, end-1, end)])
  }
  const a = source.indexOf("{}", source.indexOf("void")), b = source.indexOf("{ }", a)
  const tree = node("PsiJavaFileImpl", source, 0, source.length, [body(a), body(b)])
  assert.equal(resolveCanvasDrop(tree, source, 0, source.indexOf('"{}"')+1)?.mode, "end")
  assert.equal(resolveCanvasDrop(tree, source, 0, source.indexOf("/* {}")+3)?.mode, "end")
  for (const start of [a,b]) assert.deepEqual(dropDestination(resolveCanvasDrop(tree, source, 0, start)!), { line: 1, column: start+2 })
  const array = node("PsiArrayInitializerExpressionImpl", "{}", 0, 2, [node("PsiJavaTokenImpl", "{}", 0, 1), node("PsiJavaTokenImpl", "{}", 1, 2)])
  assert.equal(resolveCanvasDrop(array, "{}", 0, 0)?.mode, "end")
})

test("nested inline statements stay selectable and one-character leaf statements have real boxes", () => {
  const source = "void a() { return; }"
  const statement = node("PsiReturnStatementImpl", source, 11, 18, [node("PsiKeywordImpl", source, 11, 17)])
  const method = node("PsiMethodImpl", source, 0, source.length, [statement])
  // Add preceding code on the same line, making the method itself inline too.
  method.startColumn = 3
  const overlays = collectHoverOnlyInlineOverlays(method, ["  " + source])
  assert.ok(overlays.some(item => item.node === statement))
  const empty = node("PsiEmptyStatementImpl", ";")
  assert.equal(collectBoxOverlays(empty, [";"], buildReferencePathContext(empty, [";"])).length, 1)
  assert.equal(collectBoxOverlays(node("PsiJavaFileImpl", ""), [""], buildReferencePathContext(node("PsiJavaFileImpl", ""), [""])).length, 0)
})

test("moving requires the original canvas revision and a nonempty contained UTF-16 range", () => {
  const valid = { sourceId: "own", startOffset: 0, endOffset: 5, type: "PsiCommentImpl" }
  assert.equal(validMovePayload(valid, "own", 5), true)
  for (const change of [{sourceId:"another-file"}, {startOffset:5}, {endOffset:6}, {startOffset:-1}, {endOffset:1.5}, {type: []}])
    assert.equal(validMovePayload({...valid,...change}, "own", 5), false)
  assert.equal(validMovePayload(null, "own", 5), false)
})


test("library drops cannot insert code into the interior of multiline comments or text blocks", () => {
  for (const [type,source] of [["PsiCommentImpl","/*\n\n*/\n"],["PsiLiteralExpressionImpl",'"""\n\n"""\n']]) {
    const tree = node(type,source,0,source.length-1)
    assert.equal(resolveCanvasDrop(tree,source,0,0),null)
    assert.equal(resolveCanvasDrop(tree,source,1,0),null)
    assert.ok(resolveCanvasDrop(tree,source,2,0), "a destination after the closing delimiter remains allowed")
  }
})


test("library visual previews identify catalogue templates without reading protected drag data", async () => {
  const { draggedLibraryTemplate } = await import('../src/lib/models/model-editor/canvas-insertion-preview.model.ts')
  const { EXAMPLE_DRAG_MIME_TYPE, LIBRARY_PREVIEW_MIME_PREFIX } = await import('../src/lib/models/model-editor/model-editor-dnd.model.ts')
  assert.equal(draggedLibraryTemplate(['text/plain']), null)
  assert.equal(draggedLibraryTemplate([EXAMPLE_DRAG_MIME_TYPE, LIBRARY_PREVIEW_MIME_PREFIX + 'unknown']), null)
  assert.equal(draggedLibraryTemplate([LIBRARY_PREVIEW_MIME_PREFIX + 'field-declaration']), null)
  assert.equal(draggedLibraryTemplate([EXAMPLE_DRAG_MIME_TYPE, LIBRARY_PREVIEW_MIME_PREFIX + 'field-declaration'])?.content, 'private String name;\n')
})

test("visual insertion is a disposable copy for blank, between, empty and EOF destinations", async () => {
  const { buildCanvasInsertionPreview, draggedLibraryTemplate } = await import('../src/lib/models/model-editor/canvas-insertion-preview.model.ts')
  const { EXAMPLE_DRAG_MIME_TYPE, LIBRARY_PREVIEW_MIME_PREFIX } = await import('../src/lib/models/model-editor/model-editor-dnd.model.ts')
  const snippet = draggedLibraryTemplate([EXAMPLE_DRAG_MIME_TYPE, LIBRARY_PREVIEW_MIME_PREFIX + 'field-declaration'])!
  for (const [source, line] of [['', 0], ['class A {\n\n}', 1], ['one\ntwo', 0], ['class A {}', 0]] as const) {
    const tree = node('PsiJavaFileImpl', source)
    const snapshot = JSON.stringify(tree)
    const destination = resolveCanvasDrop(tree, source, line, 0)!
    const preview = buildCanvasInsertionPreview(tree, source, destination, snippet)
    assert.equal(JSON.stringify(tree), snapshot)
    assert.equal(preview.before + preview.component + preview.after, preview.text)
    assert.ok(preview.text.includes(snippet.content))
    assert.equal(preview.text.slice(0, preview.offset) + preview.text.slice(preview.offset + preview.insertedLength), source)
    assert.equal(preview.lines.length, source.split('\n').length + 1 + Number(destination.mode === 'end'))
  }
})

test("inline previews grow parent boxes, move following boxes and map the cursor back without jitter", async () => {
  const { buildCanvasInsertionPreview, draggedLibraryTemplate, sourcePositionFromInsertion } = await import('../src/lib/models/model-editor/canvas-insertion-preview.model.ts')
  const { EXAMPLE_DRAG_MIME_TYPE, LIBRARY_PREVIEW_MIME_PREFIX } = await import('../src/lib/models/model-editor/model-editor-dnd.model.ts')
  const source = 'class A { void run() {} }\nclass B {}'
  const open = source.indexOf('{}'), close = open + 2
  const body = node('PsiCodeBlockImpl', source, open, close, [node('PsiJavaTokenImpl', source, open, open+1), node('PsiJavaTokenImpl', source, close-1, close)])
  const tree = node('PsiJavaFileImpl', source, 0, source.length, [body])
  const following = node('PsiClassImpl', source, source.indexOf('class B'))
  const overlays = [body, following].map((item, i) => ({ id: String(i), nodePath: String(i), node: item, depth: i, isLeaf: false,
    topRem: (item.startLine-1)*3+0.18, leftCh: item.startColumn-1, widthCh: item.endOffset!-item.startOffset!, heightRem: 2.64 }))
  const template = draggedLibraryTemplate([EXAMPLE_DRAG_MIME_TYPE, LIBRARY_PREVIEW_MIME_PREFIX + 'variable-declaration'])!
  const preview = buildCanvasInsertionPreview(tree, source, resolveCanvasDrop(tree, source, 0, open)!, template, overlays)
  assert.equal(preview.destination.mode, 'inline-empty-block')
  assert.ok(preview.boxes[0].heightRem > overlays[0].heightRem)
  assert.ok(preview.boxes[1].topRem > overlays[1].topRem)
  for (let line = preview.firstLine; line <= preview.lastLine; line++) assert.equal(sourcePositionFromInsertion(preview, line, 0), null)
  assert.deepEqual(sourcePositionFromInsertion(preview, preview.lines.length-1, 0), { line: 1, column: 0 })
})

test("visual projection preserves CRLF, Unicode and incomplete source without parsing it", async () => {
  const { buildCanvasInsertionPreview, draggedLibraryTemplate } = await import('../src/lib/models/model-editor/canvas-insertion-preview.model.ts')
  const { EXAMPLE_DRAG_MIME_TYPE, LIBRARY_PREVIEW_MIME_PREFIX } = await import('../src/lib/models/model-editor/model-editor-dnd.model.ts')
  const source = '// Ω 😀\r\nclass Incompleta {\r\n'
  const tree = node('PsiJavaFileImpl', source)
  for (const id of ['method-declaration', 'blank-line']) {
    const snippet = draggedLibraryTemplate([EXAMPLE_DRAG_MIME_TYPE, LIBRARY_PREVIEW_MIME_PREFIX + id])!
    const preview = buildCanvasInsertionPreview(tree, source, resolveCanvasDrop(tree, source, 2, 0)!, snippet)
    assert.equal(preview.text.slice(0, preview.offset) + preview.text.slice(preview.offset+preview.insertedLength), source)
    assert.equal(preview.text.replaceAll('\r\n', '').includes('\n'), false)
    assert.ok(preview.highlight.heightRem > 0)
    assert.ok(preview.text.includes('Ω 😀'))
  }
})
