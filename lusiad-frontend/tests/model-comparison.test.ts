import assert from "node:assert/strict"
import test from "node:test"

import { buildCanvasDiff, buildModelOutline, compareModelTrees, compareSemanticTokens, resolveCanvasHighlights, semanticTokens } from "../src/lib/services/model-comparison/model-comparison.model.ts"
import type { PsiNode } from "../src/lib/types.ts"
import { buildReferencePathContext, collectBoxOverlays } from "../src/lib/models/model-editor/model-canvas.model.ts"

function leaf(text: string, type = "PsiJavaTokenImpl", startOffset = 0): PsiNode {
  return { type, text, startOffset, endOffset: startOffset + text.length,
    startLine: 1, startColumn: 1, endLine: 1, endColumn: text.length + 1 }
}

function javaFile(parts: Array<[string, string]>): PsiNode {
  let offset = 0
  const children = parts.map(([text, type]) => {
    const node = leaf(text, type, offset)
    offset += text.length
    return node
  })
  return { type: "PsiJavaFileImpl", children, startOffset: 0, endOffset: offset,
    startLine: 1, startColumn: 1, endLine: 1, endColumn: offset + 1 }
}

type PsiSpec = { type: string; text: string } | { type: string; children: PsiSpec[] }

function modelTree(spec: PsiSpec): PsiNode {
  let offset = 0
  let line = 1
  let column = 1
  function visit(part: PsiSpec): PsiNode {
    const startOffset = offset
    const startLine = line
    const startColumn = column
    if ("text" in part) {
      for (const char of part.text) {
        offset++
        if (char === "\n") { line++; column = 1 }
        else column++
      }
      return { type: part.type, text: part.text, startOffset, endOffset: offset,
        startLine, startColumn, endLine: line, endColumn: column }
    }
    const children = part.children.map(visit)
    return { type: part.type, children, startOffset, endOffset: offset,
      startLine, startColumn, endLine: line, endColumn: column }
  }
  return visit(spec)
}

const token = (text: string, type = "PsiJavaTokenImpl"): PsiSpec => ({ type, text })
const group = (type: string, ...children: PsiSpec[]): PsiSpec => ({ type, children })
const whitespace = (text: string): PsiSpec => token(text, "PsiWhiteSpaceImpl")

/** Use the same box geometry and both snapshots as the real comparison canvas. */
function compareCanvases(before: PsiNode, after: PsiNode) {
  const comparison = compareModelTrees(before, after)
  const beforeDiff = buildCanvasDiff(before, comparison.beforeTokens, comparison.beforeMatched,
    comparison.beforeUnpaired, comparison.beforeModified)
  const afterDiff = buildCanvasDiff(after, comparison.afterTokens, comparison.afterMatched,
    comparison.afterUnpaired, comparison.afterModified)
  function overlays(root: PsiNode, diff: typeof beforeDiff) {
    const lines = diff.segments.map((segment) => segment.text).join("").split("\n")
    return collectBoxOverlays(root, lines, buildReferencePathContext(root, lines))
  }
  const beforeOverlays = overlays(before, beforeDiff)
  const afterOverlays = overlays(after, afterDiff)
  const beforeHighlights = resolveCanvasHighlights(beforeDiff, beforeOverlays, {
    counterparts: comparison.beforeCounterparts, counterpartOverlays: afterOverlays,
  })
  const afterHighlights = resolveCanvasHighlights(afterDiff, afterOverlays, {
    counterparts: comparison.afterCounterparts, counterpartOverlays: beforeOverlays,
  })
  function coloredNodes(side: "before" | "after") {
    const boxes = side === "before" ? beforeOverlays : afterOverlays
    const highlights = side === "before" ? beforeHighlights : afterHighlights
    return boxes.flatMap((box) => {
      const status = highlights.overlayStatus.get(box.nodePath)
      return status ? [{ node: box.node, status }] : []
    })
  }
  return { comparison, beforeDiff, afterDiff, beforeHighlights, afterHighlights, coloredNodes }
}

test("adding or removing a field keeps preserved class and method boxes neutral in both panels", () => {
  const field = (name: string) => group("PsiFieldImpl", token("private String "), token(name, "PsiIdentifierImpl"), token(";"))
  const file = (withNewField: boolean) => modelTree(group("PsiJavaFileImpl",
    group("PsiClassImpl", token("public class Calculator {"), whitespace("\n    "),
      ...(withNewField ? [field("name"), whitespace("\n    ")] : []),
      field("operation"), whitespace("\n\n    "),
      group("PsiMethodImpl", token("public void sum() {"), whitespace("\n        "),
        group("PsiReturnStatementImpl", token("return "), token("c", "PsiIdentifierImpl"), token(";")),
        whitespace("\n    "), token("}")), whitespace("\n"), token("}"))))
  for (const reverse of [false, true]) {
    const result = compareCanvases(file(reverse), file(!reverse))
    const changed = result.coloredNodes(reverse ? "before" : "after")
    const unchanged = result.coloredNodes(reverse ? "after" : "before")
    assert.equal(changed.length, 1, "only the added/removed field should have a colored box")
    assert.equal(changed[0].node.type, "PsiFieldImpl")
    assert.equal(changed[0].status, "complete")
    assert.equal(unchanged.length, 0, "an insertion/deletion must not color the opposite class")
  }
})

test("adding or removing nested statements does not modify the preserved if shell", () => {
  const file = (populated: boolean) => modelTree(group("PsiJavaFileImpl",
    group("PsiClassImpl", token("public class Class {"), whitespace("\n    "),
      group("PsiMethodImpl", token("public void myMethod() {"), whitespace("\n        "),
        group("PsiIfStatementImpl", token("if (condition) "),
          group("PsiBlockStatementImpl", group("PsiCodeBlockImpl", token("{"), whitespace("\n            "),
            ...(populated ? [
              group("PsiDeclarationStatementImpl", token("int "), token("x", "PsiIdentifierImpl"), token(" = 10;")),
              whitespace("\n            "),
              group("PsiExpressionStatementImpl", token("System.out.println(\"\");")),
              whitespace("\n        "),
            ] : []), token("}"))), token(" else "),
          group("PsiBlockStatementImpl", group("PsiCodeBlockImpl", token("{"), whitespace("\n        "), token("}")))),
        whitespace("\n    "), token("}")), whitespace("\n"), token("}"))))
  for (const reverse of [false, true]) {
    const result = compareCanvases(file(reverse), file(!reverse))
    const changed = result.coloredNodes(reverse ? "before" : "after")
    assert.deepEqual(changed.map(({ node, status }) => [node.type, status]), [
      ["PsiDeclarationStatementImpl", "complete"], ["PsiExpressionStatementImpl", "complete"],
    ])
    assert.equal(result.coloredNodes(reverse ? "after" : "before").length, 0)
  }
})

test("child-only differences are neutral for arbitrary nested PSI containers", () => {
  const file = (populated: boolean) => modelTree(group("PsiJavaFileImpl",
    group("PsiOuterContainer", token("outer {"), whitespace("\n    "),
      group("PsiInnerContainer", token("inner {"), whitespace("\n        "),
        ...(populated ? [group("PsiNewComponent", token("newComponent();")), whitespace("\n    ")] : []),
        token("}")), whitespace("\n"), token("}"))))
  for (const reverse of [false, true]) {
    const result = compareCanvases(file(reverse), file(!reverse))
    assert.deepEqual(result.coloredNodes(reverse ? "before" : "after").map(({ node, status }) => [node.type, status]), [
      ["PsiNewComponent", "complete"],
    ])
    assert.equal(result.coloredNodes(reverse ? "after" : "before").length, 0)
  }
})

test("an inline edit stays amber while an independent new block stays green", () => {
  const file = (changed: boolean) => modelTree(group("PsiJavaFileImpl",
    group("PsiContainer", token("container {"), whitespace("\n    "),
      group("PsiComponent", token("component("), token(changed ? "target" : "base", "PsiIdentifierImpl"), token(") {"),
        whitespace("\n        "),
        group("PsiStatement", token("kept();")), whitespace("\n        "),
        ...(changed ? [group("PsiNewComponent", token("inserted();")), whitespace("\n    ")] : []),
        token("}")), whitespace("\n"), token("}"))))
  const result = compareCanvases(file(false), file(true))
  assert.deepEqual(result.coloredNodes("before").map(({ node, status }) => [node.type, status]), [
    ["PsiComponent", "partial"],
  ])
  assert.deepEqual(result.coloredNodes("after").map(({ node, status }) => [node.type, status]), [
    ["PsiComponent", "partial"], ["PsiNewComponent", "complete"],
  ])
  assert.deepEqual(result.beforeDiff.segments.filter((part) => part.changed).map((part) => part.text), ["base"])
  assert.deepEqual(result.afterDiff.segments.filter((part) => part.changed && !result.afterHighlights.coveredSegments.has(part.id))
    .map((part) => part.text), ["target"])
})

test("formatting a preserved child inline does not paint its parent when adding a sibling", () => {
  const file = (changed: boolean) => modelTree(group("PsiJavaFileImpl",
    group("PsiContainer", token("container {"), whitespace(changed ? " " : "\n    "),
      group("PsiComponent", token("kept();")), whitespace("\n"),
      ...(changed ? [group("PsiNewComponent", token("newComponent();")), whitespace("\n")] : []),
      token("}"))))
  for (const reverse of [false, true]) {
    const result = compareCanvases(file(reverse), file(!reverse))
    const neutral = result.coloredNodes(reverse ? "after" : "before")
    assert.equal(neutral.length, 0, "a child visible in only one layout still owns its changes")
  }
})

test("formatting whitespace does not create a model difference", () => {
  const before = javaFile([["int", "PsiKeyword"], [" ", "PsiWhiteSpace"], ["value", "PsiIdentifier"], ["=", "PsiJavaTokenImpl"], ["1", "PsiLiteralExpressionImpl"]])
  const after = javaFile([["int", "PsiKeyword"], ["   ", "PsiWhiteSpace"], ["value", "PsiIdentifier"], [" ", "PsiWhiteSpace"], ["=", "PsiJavaTokenImpl"], ["1", "PsiLiteralExpressionImpl"]])
  const diff = compareModelTrees(before, after)
  assert.equal(diff.beforeMatched.size, diff.beforeTokens.length)
  assert.equal(diff.afterMatched.size, diff.afterTokens.length)
})

test("literal whitespace is preserved and an update becomes removal plus addition", () => {
  const before = javaFile([["\"a b\"", "PsiLiteralExpressionImpl"]])
  const after = javaFile([["\"ab\"", "PsiLiteralExpressionImpl"]])
  const diff = compareModelTrees(before, after)
  assert.equal(diff.beforeMatched.size, 0)
  assert.equal(diff.afterMatched.size, 0)
  assert.equal(buildModelOutline(before, diff.beforeMatched, "before").children[0].status, "removed")
  assert.equal(buildModelOutline(after, diff.afterMatched, "after").children[0].status, "added")
})

test("visual canvas marks only changed PSI leaves and preserves the complete source", () => {
  const before = javaFile([["int", "PsiKeyword"], [" ", "PsiWhiteSpace"], ["value", "PsiIdentifier"], [" = ", "PsiWhiteSpace"], ["1", "PsiLiteralExpressionImpl"]])
  const after = javaFile([["int", "PsiKeyword"], ["  ", "PsiWhiteSpace"], ["value", "PsiIdentifier"], [" = ", "PsiWhiteSpace"], ["2", "PsiLiteralExpressionImpl"]])
  const matches = compareModelTrees(before, after)
  const left = buildCanvasDiff(before, matches.beforeTokens, matches.beforeMatched, matches.beforeUnpaired)
  const right = buildCanvasDiff(after, matches.afterTokens, matches.afterMatched, matches.afterUnpaired)

  assert.equal(left.segments.map((segment) => segment.text).join(""), "int value = 1")
  assert.equal(right.segments.map((segment) => segment.text).join(""), "int  value = 2")
  assert.deepEqual(left.segments.filter((segment) => segment.changed).map((segment) => segment.text), ["1"])
  assert.deepEqual(right.segments.filter((segment) => segment.changed).map((segment) => segment.text), ["2"])
  assert.equal(left.fullyChangedNodes.has(before.children![4]), true)
  assert.equal(left.fullyChangedNodes.has(before.children![2]), false)
})

test("visual canvas colors complete blocks without word highlights and partial blocks in amber", () => {
  const field: PsiNode = { type: "PsiFieldImpl", children: [leaf("int", "PsiKeyword"), leaf(" ", "PsiWhiteSpace"), leaf("number", "PsiIdentifier"), leaf(";", "PsiJavaTokenImpl")],
    startOffset: 0, endOffset: 11, startLine: 1, startColumn: 1, endLine: 1, endColumn: 12 }
  const method: PsiNode = { type: "PsiMethodImpl", children: [leaf("return", "PsiKeyword"), leaf(" ", "PsiWhiteSpace"), leaf("0", "PsiLiteralExpressionImpl"), leaf(";", "PsiJavaTokenImpl")],
    startOffset: 11, endOffset: 20, startLine: 2, startColumn: 1, endLine: 2, endColumn: 10 }
  const classifier: PsiNode = { type: "PsiClassImpl", children: [field, method],
    startOffset: 0, endOffset: 20, startLine: 1, startColumn: 1, endLine: 2, endColumn: 10 }
  const root: PsiNode = { type: "PsiJavaFileImpl", children: [classifier],
    startOffset: 0, endOffset: 20, startLine: 1, startColumn: 1, endLine: 2, endColumn: 10 }
  const tokens = semanticTokens(root)
  const matched = new Set(tokens.flatMap((token, index) => ["int", ";"].includes(token.node.text ?? "") && index < 3 ? [index] : []))
  const diff = buildCanvasDiff(root, tokens, matched)
  const visual = resolveCanvasHighlights(diff, [
    { nodePath: "0", node: root },
    { nodePath: "0.0", node: classifier },
    { nodePath: "0.0.0", node: field },
    { nodePath: "0.0.1", node: method },
  ])

  assert.equal(visual.overlayStatus.get("0.0.0"), "partial")
  assert.equal(visual.overlayStatus.get("0.0.1"), "complete")
  assert.equal(visual.overlayStatus.has("0.0"), false)
  assert.equal(visual.coveredSegments.has("0.0.0.2"), false)
  assert.equal(visual.coveredSegments.has("0.0.1.0"), true)
  assert.equal(visual.coveredSegments.has("0.0.1.2"), true)
})

test("a method remains the same component while unrelated inner structures are replaced", () => {
  function file(flowType: string, keyword: string, condition: string): PsiNode {
    return modelTree(group("PsiJavaFileImpl",
      group("PsiClassImpl", token("class Class {\n"),
        group("PsiMethodImpl", token("void myMethod() {\n"),
          group(flowType, token(keyword, "PsiKeywordImpl"), token(" ("), token(condition, "PsiIdentifierImpl"), token(") "),
            group("PsiCodeBlockImpl", token("{\n"),
              group("PsiExpressionStatementImpl", token("System.out.println", "PsiReferenceExpressionImpl"), token("(1);\n")),
              token("}\n"))),
          token("}\n")), token("}\n"))))
  }
  const before = file("PsiIfStatementImpl", "if", "condition")
  const after = file("PsiSwitchStatementImpl", "switch", "value")
  const comparison = compareModelTrees(before, after)
  const oldMethod = before.children![0].children![1]
  const newMethod = after.children![0].children![1]
  const oldFlow = oldMethod.children![1]
  const newFlow = newMethod.children![1]
  const oldDiff = buildCanvasDiff(before, comparison.beforeTokens, comparison.beforeMatched, comparison.beforeUnpaired)
  const newDiff = buildCanvasDiff(after, comparison.afterTokens, comparison.afterMatched, comparison.afterUnpaired)
  assert.equal(oldDiff.partiallyChangedNodes.has(oldMethod), true)
  assert.equal(newDiff.partiallyChangedNodes.has(newMethod), true)
  assert.equal(oldDiff.fullyChangedNodes.has(oldFlow), true)
  assert.equal(newDiff.fullyChangedNodes.has(newFlow), true)
  assert.ok(oldDiff.segments.some((segment) => segment.id.startsWith("0.0.1.1.") && !segment.changed))
  assert.ok(newDiff.segments.some((segment) => segment.id.startsWith("0.0.1.1.") && !segment.changed))
  const oldVisual = resolveCanvasHighlights(oldDiff, [
    { nodePath: "0.0.1", node: oldMethod }, { nodePath: "0.0.1.1", node: oldFlow },
  ])
  const newVisual = resolveCanvasHighlights(newDiff, [
    { nodePath: "0.0.1", node: newMethod }, { nodePath: "0.0.1.1", node: newFlow },
  ])
  assert.equal(oldVisual.overlayStatus.has("0.0.1"), false)
  assert.equal(newVisual.overlayStatus.has("0.0.1"), false)
  assert.equal(oldVisual.overlayStatus.get("0.0.1.1"), "complete")
  assert.equal(newVisual.overlayStatus.get("0.0.1.1"), "complete")
  const canvas = compareCanvases(before, after)
  assert.deepEqual(canvas.coloredNodes("before").map(({ node, status }) => [node.type, status]), [
    ["PsiIfStatementImpl", "complete"],
  ])
  assert.deepEqual(canvas.coloredNodes("after").map(({ node, status }) => [node.type, status]), [
    ["PsiSwitchStatementImpl", "complete"],
  ])
})

test("structural replacement works for arbitrary PSI node types with shared descendants", () => {
  const file = (type: string, label: string) => modelTree(group("PsiJavaFileImpl",
    group("PsiMethodImpl", token("void same() {\n"),
      group(type, token(label, "PsiKeywordImpl"),
        group("PsiCodeBlockImpl", token("{"), token("shared", "PsiIdentifierImpl"), token("}"))),
      token("}\n"))))
  const before = file("PsiOriginalContainerImpl", "original")
  const after = file("PsiReplacementContainerImpl", "replacement")
  const comparison = compareModelTrees(before, after)
  const original = before.children![0].children![1]
  const replacement = after.children![0].children![1]
  const beforeDiff = buildCanvasDiff(before, comparison.beforeTokens, comparison.beforeMatched, comparison.beforeUnpaired)
  const afterDiff = buildCanvasDiff(after, comparison.afterTokens, comparison.afterMatched, comparison.afterUnpaired)
  assert.equal(beforeDiff.fullyChangedNodes.has(original), true)
  assert.equal(afterDiff.fullyChangedNodes.has(replacement), true)
  assert.ok(comparison.beforeTokens.some((entry, index) => entry.node.text === "shared" && comparison.beforeMatched.has(index)))
  assert.ok(comparison.afterTokens.some((entry, index) => entry.node.text === "shared" && comparison.afterMatched.has(index)))
})

test("a changed statement is highlighted even when all its tokens match elsewhere", () => {
  const expression = () => group("PsiBinaryExpressionImpl", token("a", "PsiIdentifierImpl"),
    token("+"), token("b", "PsiIdentifierImpl"))
  const returnStatement = (inlineExpression: boolean) => group("PsiReturnStatementImpl",
    token("return", "PsiKeywordImpl"), token(" ", "PsiWhiteSpaceImpl"),
    inlineExpression ? expression() : token("c", "PsiIdentifierImpl"), token(";"), token("\n", "PsiWhiteSpaceImpl"))
  const file = (inlineExpression: boolean, compact = false) => modelTree(group("PsiJavaFileImpl",
    group("PsiClassImpl", token("class Calculator {\n"),
      group("PsiMethodImpl", token(compact ? "void sum() { " : "void sum() {\n"),
        ...(!inlineExpression ? [group("PsiDeclarationStatementImpl",
          token("int", "PsiKeywordImpl"), token(" c = "), expression(), token(";\n"))] : []),
        returnStatement(inlineExpression), token("}\n")), token("}\n"))))
  const before = file(false)
  const after = file(true)
  const comparison = compareModelTrees(before, after)
  const changedReturn = after.children![0].children![1].children![1]
  const afterDiff = buildCanvasDiff(after, comparison.afterTokens, comparison.afterMatched,
    comparison.afterUnpaired, comparison.afterModified)

  assert.ok(afterDiff.segments.filter((segment) => segment.id.startsWith("0.0.1.1.")).every((segment) => !segment.changed))
  assert.equal(comparison.afterModified.has(changedReturn), true)
  const visual = resolveCanvasHighlights(afterDiff, [
    { nodePath: "0.0", node: after.children![0] },
    { nodePath: "0.0.1", node: after.children![0].children![1] },
    { nodePath: "0.0.1.1", node: changedReturn },
  ])
  assert.equal(visual.overlayStatus.get("0.0.1.1"), "partial")
  assert.equal(visual.overlayStatus.has("0.0.1"), false)
  const outline = buildModelOutline(after, comparison.afterMatched, "after",
    comparison.afterUnpaired, comparison.afterModified)
  assert.equal(outline.children[0].children[0].children[0].status, "context")
  const canvas = compareCanvases(before, after)
  assert.deepEqual(canvas.coloredNodes("after").map(({ node, status }) => [node.type, status]), [
    ["PsiReturnStatementImpl", "partial"],
  ], "the two-panel ownership check must still show a recomposed return even when all words match")
  const compactCanvas = compareCanvases(before, file(true, true))
  assert.deepEqual(compactCanvas.coloredNodes("after").map(({ node, status }) => [node.type, status]), [
    ["PsiMethodImpl", "partial"],
  ], "an edited child without its own box must remain visible in its nearest owner")
})

test("an identical method is retained after moving to another class", () => {
  const method = () => group("PsiMethodImpl", token("void calculate() {\n"),
    group("PsiCodeBlockImpl", token("return", "PsiKeywordImpl"), token(" 1;\n")), token("}\n"))
  const classifier = (name: string, includeMethod: boolean) => group("PsiClassImpl",
    token(`class ${name} {\n`), ...(includeMethod ? [method()] : []), token("}\n"))
  const before = modelTree(group("PsiJavaFileImpl", classifier("A", true), classifier("B", false)))
  const after = modelTree(group("PsiJavaFileImpl", classifier("A", false), classifier("B", true)))
  const comparison = compareModelTrees(before, after)
  const movedBefore = before.children![0].children![1]
  const movedAfter = after.children![1].children![1]
  function leaves(node: PsiNode): Set<PsiNode> {
    if (!node.children?.length) return new Set([node])
    return new Set(node.children.flatMap((child) => [...leaves(child)]))
  }
  const oldLeaves = leaves(movedBefore)
  const newLeaves = leaves(movedAfter)
  const beforeIndices = comparison.beforeTokens.flatMap((entry, index) =>
    oldLeaves.has(entry.node) ? [index] : [])
  const afterIndices = comparison.afterTokens.flatMap((entry, index) =>
    newLeaves.has(entry.node) ? [index] : [])
  assert.ok(beforeIndices.length > 0 && afterIndices.length > 0)
  assert.ok(beforeIndices.every((index) => comparison.beforeMatched.has(index)))
  assert.ok(afterIndices.every((index) => comparison.afterMatched.has(index)))
  const canvas = compareCanvases(before, after)
  assert.equal(canvas.coloredNodes("before").length, 0)
  assert.equal(canvas.coloredNodes("after").length, 0)
})

test("unchanged repeated tokens align while inserted tokens are additions", () => {
  const before = javaFile([["a", "PsiIdentifier"], ["b", "PsiIdentifier"], ["a", "PsiIdentifier"]])
  const after = javaFile([["a", "PsiIdentifier"], ["c", "PsiIdentifier"], ["b", "PsiIdentifier"], ["a", "PsiIdentifier"]])
  const diff = compareSemanticTokens(semanticTokens(before), semanticTokens(after))
  assert.deepEqual([...diff.beforeMatched].sort(), [0, 1, 2])
  assert.deepEqual([...diff.afterMatched].sort(), [0, 2, 3])
})

test("an identical statement remains matched when moved between switch labels", () => {
  function rule(label: string): PsiNode {
    const heading = `${label} -> `
    const body = "System.out.println(1);"
    const child: PsiNode = { type: "PsiExpressionStatementImpl", children: [leaf("System.out.println", "PsiReferenceExpressionImpl", heading.length),
      leaf("(1);", "PsiJavaTokenImpl", heading.length + 18)],
      startOffset: heading.length, endOffset: heading.length + body.length,
      startLine: 1, startColumn: heading.length + 1, endLine: 1, endColumn: heading.length + body.length + 1 }
    return { type: "PsiSwitchLabeledRuleStatementImpl", children: [leaf(heading), child],
      startOffset: 0, endOffset: heading.length + body.length,
      startLine: 1, startColumn: 1, endLine: 1, endColumn: heading.length + body.length + 1 }
  }
  const before = rule("case 1")
  const after = rule("default")
  const diff = compareModelTrees(before, after)
  assert.equal(diff.beforeMatched.has(0), false)
  assert.equal(diff.afterMatched.has(0), false)
  assert.equal(diff.beforeMatched.has(1), true)
  assert.equal(diff.beforeMatched.has(2), true)
  assert.equal(diff.afterMatched.has(1), true)
  assert.equal(diff.afterMatched.has(2), true)
})

test("token matcher agrees with the optimal common subsequence for short edits", () => {
  const alphabet = ["a", "b", "c"]
  for (let seed = 0; seed < 150; seed++) {
    let state = seed + 1
    const next = () => { state = (state * 16807) % 2147483647; return state }
    const left = Array.from({ length: next() % 7 }, () => alphabet[next() % alphabet.length])
    const right = Array.from({ length: next() % 7 }, () => alphabet[next() % alphabet.length])
    const before = semanticTokens(javaFile(left.map((value) => [value, "PsiIdentifier"])))
    const after = semanticTokens(javaFile(right.map((value) => [value, "PsiIdentifier"])))
    const diff = compareSemanticTokens(before, after)
    const dp = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0))
    for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--) {
      dp[i][j] = left[i] === right[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
    assert.equal(diff.beforeMatched.size, dp[0][0], `seed ${seed}`)
    assert.equal(diff.afterMatched.size, dp[0][0], `seed ${seed}`)
  }
})
