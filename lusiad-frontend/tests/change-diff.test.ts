import assert from "node:assert/strict"
import test from "node:test"

import { resolveChangeFocus } from "../src/lib/services/change-diff/change-focus.service.ts"
import { buildReferencePathContext, collectBoxOverlays } from "../src/lib/models/model-editor/model-canvas.model.ts"
import type { JavaModel, PsiNode } from "../src/lib/types.ts"

function lineAt(source: string, offset: number): number {
  return source.slice(0, offset).split("\n").length
}

function leaf(source: string, start: number, end: number): PsiNode {
  return {
    type: "PsiWhiteSpace",
    text: source.slice(start, end),
    startOffset: start,
    endOffset: end,
    startLine: lineAt(source, start),
    endLine: lineAt(source, Math.max(start, end - 1)),
    startColumn: 1,
    endColumn: 1,
  }
}

function modelWithStatement(source: string, statement: string): { model: JavaModel; statementNode: PsiNode; methodNode: PsiNode } {
  const classStart = source.search(/\bclass\s+/)
  const methodMatch = /\b(?:(?:public|protected|private)\s+)?(?:static\s+)?(?:void|[A-Za-z_$][\w$<>\[\]]*)\s+[A-Za-z_$][\w$]*\s*\(/.exec(source)
  const methodStart = methodMatch?.index ?? -1
  const statementStart = source.indexOf(statement)
  const statementEnd = statementStart + statement.length
  const methodEnd = source.lastIndexOf("\n}")
  const classEnd = source.length

  const statementNode: PsiNode = {
    type: "PsiExpressionStatementImpl",
    startOffset: statementStart,
    endOffset: statementEnd,
    startLine: lineAt(source, statementStart),
    endLine: lineAt(source, statementEnd - 1),
    startColumn: 1,
    endColumn: 1,
    children: [leaf(source, statementStart, statementEnd)],
  }
  const methodNode: PsiNode = {
    type: "PsiMethodImpl",
    startOffset: methodStart,
    endOffset: methodEnd,
    startLine: lineAt(source, methodStart),
    endLine: lineAt(source, methodEnd - 1),
    startColumn: 1,
    endColumn: 1,
    children: [
      leaf(source, methodStart, statementStart),
      statementNode,
      leaf(source, statementEnd, methodEnd),
    ],
  }
  const classNode: PsiNode = {
    type: "PsiClassImpl",
    startOffset: classStart,
    endOffset: classEnd,
    startLine: lineAt(source, classStart),
    endLine: lineAt(source, classEnd - 1),
    startColumn: 1,
    endColumn: 1,
    children: [leaf(source, classStart, methodStart), methodNode, leaf(source, methodEnd, classEnd)],
  }

  return {
    model: {
      file: "Example.java",
      tree: {
        type: "PsiJavaFile",
        startOffset: 0,
        endOffset: source.length,
        startLine: 1,
        endLine: lineAt(source, source.length - 1),
        startColumn: 1,
        endColumn: 1,
        children: [leaf(source, 0, classStart), classNode],
      },
    },
    statementNode,
    methodNode,
  }
}

function modelWithElements(source: string, elements: Array<{ text: string; type: string; occurrence?: number }>): { model: JavaModel; nodes: PsiNode[] } {
  const spans = elements.map(({ text, type, occurrence = 0 }) => {
    let start = -1
    for (let index = 0; index <= occurrence; index += 1) start = source.indexOf(text, start + 1)
    if (start < 0) throw new Error(`Missing fixture element: ${text}`)
    return { start, end: start + text.length, type }
  }).sort((left, right) => left.start - right.start)
  const children: PsiNode[] = []
  const nodes: PsiNode[] = []
  let cursor = 0
  for (const span of spans) {
    if (span.start < cursor) throw new Error("Fixture elements overlap")
    if (span.start > cursor) children.push(leaf(source, cursor, span.start))
    const node: PsiNode = {
      type: span.type,
      startOffset: span.start,
      endOffset: span.end,
      startLine: lineAt(source, span.start),
      endLine: lineAt(source, span.end - 1),
      startColumn: span.start - (source.lastIndexOf("\n", span.start - 1) + 1) + 1,
      endColumn: span.end - (source.lastIndexOf("\n", span.end - 1) + 1),
      children: [leaf(source, span.start, span.end)],
    }
    children.push(node)
    nodes.push(node)
    cursor = span.end
  }
  if (cursor < source.length) children.push(leaf(source, cursor, source.length))
  return {
    model: {
      file: "Example.java",
      tree: {
        type: "PsiJavaFile",
        startOffset: 0,
        endOffset: source.length,
        startLine: 1,
        endLine: lineAt(source, Math.max(0, source.length - 1)),
        startColumn: 1,
        endColumn: 1,
        children,
      },
    },
    nodes,
  }
}

test("a created method is found after formatting shifts the recorded line", () => {
  const method = "public void myMethod() {}"
  const beforeSource = "class Class {\n  private String name;\n}\n"
  const afterSource = "class Class {\n  private String name;\n\n  " + method + "\n}\n"
  const before = modelWithElements(beforeSource, [{ text: "private String name;", type: "PsiFieldImpl" }])
  const after = modelWithElements(afterSource, [{ text: method, type: "PsiMethodImpl" }])
  const focus = resolveChangeFocus({
    operation: "create",
    beforeModel: before.model,
    afterModel: after.model,
    reqBody: { line: "2", lineEnd: "3", content: "public void myMethod() {\n}\n" },
  })

  assert.equal(focus.before.range, null)
  assert.equal(focus.after.node, after.nodes[0])
  assert.deepEqual(focus.after.range, {
    start: afterSource.indexOf(method),
    end: afterSource.indexOf(method) + method.length,
  })
  const lines = afterSource.split("\n")
  const overlays = collectBoxOverlays(after.model.tree, lines, buildReferencePathContext(after.model.tree, lines))
  assert.ok(overlays.some((overlay) => overlay.node === focus.after.node))
})

test("replaying a creation identifies its exact occurrence among identical elements", () => {
  const statement = "return 1;"
  const beforeSource = "class A {\n  int first() { " + statement + " }\n  int second() {}\n}\n"
  const afterSource = "class A {\n  int first() { " + statement + " }\n  int second() { " + statement + " }\n}\n"
  const before = modelWithElements(beforeSource, [{ text: statement, type: "PsiReturnStatementImpl" }])
  const after = modelWithElements(afterSource, [
    { text: statement, type: "PsiReturnStatementImpl", occurrence: 0 },
    { text: statement, type: "PsiReturnStatementImpl", occurrence: 1 },
  ])
  const focus = resolveChangeFocus({
    operation: "create",
    beforeModel: before.model,
    afterModel: after.model,
    reqBody: {
      line: lineAt(beforeSource, beforeSource.indexOf("int second")),
      column: beforeSource.split("\n")[2].indexOf("}") + 1,
      content: statement,
    },
  })
  assert.equal(focus.after.node, after.nodes[1])
})

test("a trailing newline in an unformatted insertion still focuses the PSI element", () => {
  const beforeSource = "class A {\n}\n"
  const method = "void m() {}"
  const afterSource = "class A {\n  " + method + "\n}\n"
  const before = modelWithElements(beforeSource, [])
  const after = modelWithElements(afterSource, [{ text: method, type: "PsiMethodImpl" }])
  const focus = resolveChangeFocus({
    operation: "create",
    beforeModel: before.model,
    afterModel: after.model,
    reqBody: { line: 2, content: "  " + method + "\n" },
  })
  assert.equal(focus.after.node, after.nodes[0])
  assert.deepEqual(focus.after.range, {
    start: afterSource.indexOf(method),
    end: afterSource.indexOf(method) + method.length,
  })
})

test("updates keep independent source and destination ranges across formatting", () => {
  const beforeSource = "class Example {\n  private int n;\n}\n"
  const afterSource = "class Example {\n\n    private int number;\n}\n"
  const before = modelWithElements(beforeSource, [{ text: "private int n;", type: "PsiFieldImpl" }])
  const after = modelWithElements(afterSource, [{ text: "private int number;", type: "PsiFieldImpl" }])
  const start = beforeSource.indexOf("n;")
  const focus = resolveChangeFocus({
    operation: "update",
    beforeModel: before.model,
    afterModel: after.model,
    reqBody: { startOffset: start, endOffset: start + 1, newContent: "number" },
  })

  assert.deepEqual(focus.before.range, { start, end: start + 1 })
  assert.deepEqual(focus.after.range, {
    start: afterSource.indexOf("number"),
    end: afterSource.indexOf("number") + "number".length,
  })
  assert.equal(focus.after.node, after.nodes[0])
})

test("deletion highlights the removed element only in Before", () => {
  const field = "private String name;"
  const beforeSource = "class Example {\n  " + field + "\n}\n"
  const afterSource = "class Example {\n}\n"
  const before = modelWithElements(beforeSource, [{ text: field, type: "PsiFieldImpl" }])
  const after = modelWithElements(afterSource, [])
  const start = beforeSource.indexOf(field)
  const focus = resolveChangeFocus({
    operation: "delete",
    beforeModel: before.model,
    afterModel: after.model,
    reqBody: { startOffset: start, endOffset: start + field.length },
  })
  assert.equal(focus.before.node, before.nodes[0])
  assert.equal(focus.after.range, null)
})

test("whitespace-only changes retain an exact textual focus when no PSI box exists", () => {
  const beforeSource = "class A {\n  int x;\n}\n"
  const afterSource = "class A {\n  int x;\n\n}\n"
  const before = modelWithElements(beforeSource, [])
  const after = modelWithElements(afterSource, [])
  const insertOffset = beforeSource.indexOf("}")
  const created = resolveChangeFocus({
    operation: "create",
    beforeModel: before.model,
    afterModel: after.model,
    reqBody: { line: lineAt(beforeSource, insertOffset), content: "\n" },
  })
  assert.deepEqual(created.after.range, { start: insertOffset, end: insertOffset + 1 })

  const removed = resolveChangeFocus({
    operation: "delete",
    beforeModel: after.model,
    afterModel: before.model,
    reqBody: { startOffset: insertOffset, endOffset: insertOffset + 1 },
  })
  assert.deepEqual(removed.before.range, { start: insertOffset, end: insertOffset + 1 })
  assert.equal(removed.after.range, null)
})

test("a move selects the destination occurrence when identical code exists elsewhere", () => {
  const statement = "return value;"
  const beforeSource = "class A {\n  void first() {\n    " + statement + "\n  }\n  void second() {\n    " + statement + "\n  }\n  void target() {}\n}\n"
  const afterSource = "class A {\n  void first() {}\n  void second() {\n    " + statement + "\n  }\n  void target() {\n    " + statement + "\n  }\n}\n"
  const before = modelWithElements(beforeSource, [
    { text: statement, type: "PsiReturnStatementImpl", occurrence: 0 },
    { text: statement, type: "PsiReturnStatementImpl", occurrence: 1 },
  ])
  const after = modelWithElements(afterSource, [
    { text: statement, type: "PsiReturnStatementImpl", occurrence: 0 },
    { text: statement, type: "PsiReturnStatementImpl", occurrence: 1 },
  ])
  const start = beforeSource.indexOf(statement)
  const focus = resolveChangeFocus({
    operation: "move",
    beforeModel: before.model,
    afterModel: after.model,
    reqBody: {
      startOffset: start,
      endOffset: start + statement.length,
      line: lineAt(beforeSource, beforeSource.indexOf("void target")),
      column: "18",
    },
  })
  assert.equal(focus.before.node, before.nodes[0])
  assert.equal(focus.after.node, after.nodes[1])
})

test("ambiguous repeated content and changed string literals do not produce false highlights", () => {
  const before = modelWithElements("", [])
  const repeated = modelWithElements("foo;\nfoo;\n", [
    { text: "foo;", type: "PsiExpressionStatementImpl", occurrence: 0 },
    { text: "foo;", type: "PsiExpressionStatementImpl", occurrence: 1 },
  ])
  const ambiguous = resolveChangeFocus({
    operation: "create",
    beforeModel: before.model,
    afterModel: repeated.model,
    reqBody: { content: "foo;" },
  })
  assert.equal(ambiguous.after.range, null)

  const literal = modelWithElements('class A { void m() { println("ab"); } }', [])
  const mismatch = resolveChangeFocus({
    operation: "create",
    beforeModel: before.model,
    afterModel: literal.model,
    reqBody: { content: 'println("a b");' },
  })
  assert.equal(mismatch.after.range, null)

  const identifier = modelWithElements("class A { int counter; }", [])
  const substring = resolveChangeFocus({
    operation: "update",
    beforeModel: before.model,
    afterModel: identifier.model,
    reqBody: { newContent: "count" },
  })
  assert.equal(substring.after.range, null)

  const invalidRange = resolveChangeFocus({
    operation: "update",
    beforeModel: before.model,
    afterModel: identifier.model,
    reqBody: { startOffset: 50, endOffset: 60, newContent: "counter" },
  })
  assert.equal(invalidRange.after.range, null)
})

test("a moved statement receives distinct real PSI targets before and after line displacement", () => {
  const statement = 'System.out.println("Hello");'
  const beforeSource = `class Example {\n  void myMethod() {\n    switch (value) {\n      case 1 -> {\n        ${statement}\n      }\n      default -> {}\n    }\n  }\n}\n`
  const afterSource = `class Example {\n  void myMethod() {\n    switch (value) {\n      case 1 -> {}\n      default -> {\n        ${statement}\n      }\n    }\n  }\n}\n`
  const before = modelWithStatement(beforeSource, statement)
  const after = modelWithStatement(afterSource, statement)
  const sourceStart = beforeSource.indexOf(statement)
  const sourceEnd = sourceStart + statement.length
  const originalTargetLine = lineAt(beforeSource, beforeSource.indexOf("default"))

  const focus = resolveChangeFocus({
    operation: "move",
    beforeModel: before.model,
    afterModel: after.model,
    reqBody: { startOffset: sourceStart, endOffset: sourceEnd, line: originalTargetLine },
  })

  assert.equal(focus.before.node, before.statementNode)
  assert.equal(focus.after.node, after.statementNode)
  assert.equal(focus.after.source, "content")
  assert.notEqual(focus.after.node?.startLine, originalTargetLine)
})

test("a sparse PSI response does not interrupt the change details view", () => {
  const sparseModel = { file: "Partial.java", tree: undefined } as unknown as JavaModel

  assert.doesNotThrow(() => {
    const focus = resolveChangeFocus({
      operation: "update",
      beforeModel: sparseModel,
      afterModel: sparseModel,
      reqBody: { startOffset: 0, endOffset: 1, newContent: "x" },
    })
    assert.equal(focus.before.node, null)
    assert.equal(focus.after.node, null)
  })
})

test("history focus rejects a plausible repeated snippet when the complete states do not prove that edit", () => {
  const before = "class Demo { void f(){ old(); } void g(){ repeated(); } }"
  const after = "class Demo { void f(){ unrelated(); } void g(){ repeated(); } }"
  const a = modelWithStatement(before, "old();").model, b = modelWithStatement(after, "repeated();").model
  const focus = resolveChangeFocus({ operation: "update", beforeModel: a, afterModel: b,
    reqBody: { startOffset: before.indexOf("old();"), endOffset: before.indexOf("old();")+6, newContent: "repeated();" } })
  assert.equal(focus.before.source, "none"); assert.equal(focus.after.source, "none")
})

test("history focus checks recorded v2 identities and meaningful lexical boundaries", () => {
  const before = "class Demo {}", after = "class Demo { intvalue; }"
  const focus = resolveChangeFocus({ operation: "create", beforeModel: modelWithStatement(before, "").model,
    afterModel: modelWithStatement(after, "intvalue;").model, reqBody: { content: "int value;", line: 1, column: 14 } })
  assert.equal(focus.after.source, "none")
  const mixed = resolveChangeFocus({ operation: "update", beforeModel: modelWithStatement(before, "").model,
    afterModel: modelWithStatement(after, "intvalue;").model, reqBody: { recordVersion: 2, beforeText: "another request", afterText: after, startOffset: 0, endOffset: 5, newContent: "class" } })
  assert.equal(mixed.before.source, "none");assert.equal(mixed.after.source,"none")
})


test("a moved leaf comment focuses its own destination with recorded component separators", () => {
  const before = "class A {\n  // note\n  void f() {}\n}\n"
  const after = "class A {\n  void f() {\n    // note\n  }\n}\n"
  const a = modelWithElements(before, [{text:"// note",type:"PsiCommentImpl"}])
  const b = modelWithElements(after, [{text:"// note",type:"PsiCommentImpl"}])
  const focus = resolveChangeFocus({operation:"move",beforeModel:a.model,afterModel:b.model,
    reqBody:{startOffset:before.indexOf("//"),endOffset:before.indexOf("//")+7,line:3,column:13,insertedContent:"\n// note\n"}})
  assert.equal(focus.before.node,a.nodes[0])
  assert.equal(focus.after.node,b.nodes[0])
})
