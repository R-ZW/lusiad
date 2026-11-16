import type { PsiNode } from '../../types.ts'
import { componentDefinition, initialAttributes, validateAttributes, type AttributeField, type AttributeValues, type LibraryComponentId } from './component-creation.model.ts'

type Span = { start: number; end: number }
export interface EditField extends AttributeField { labelId: string; index?: number }
export interface FieldBinding extends Span {
  field: EditField
  prefix?: string
  suffix?: string
  removeWhenEmpty?: Span[]
  format?: 'modifiers' | 'statementBody' | 'lineCount'
  tokens?: Span[]
}
export interface StructuredForm {
  componentId: LibraryComponentId
  source: string
  bindings: FieldBinding[]
  values: AttributeValues
}
const children = (n: PsiNode) => n.children ?? []
const is = (n: PsiNode, type: string) => n.type === `Psi${type}Impl`
const text = (n: PsiNode): string => children(n).length ? children(n).map(text).join('') : n.text ?? ''
const child = (n: PsiNode, type: string) => children(n).find(c => is(c, type))
const token = (n: PsiNode, value: string) => children(n).find(c => !children(c).length && text(c) === value)
const modifierWords = new Set('public private protected abstract static final transient volatile synchronized native strictfp default sealed non-sealed'.split(' '))
function leaves(n: PsiNode): PsiNode[] { return children(n).length ? children(n).flatMap(leaves) : [n] }
function hasErrors(n: PsiNode): boolean { return /ErrorElement/.test(n.type) || children(n).some(hasErrors) }

export function libraryComponentForNode(n: PsiNode): LibraryComponentId | null {
  if (is(n, 'Class')) {
    if (token(n, 'record')) return 'record-declaration'
    if (token(n, 'interface') && token(n, '@')) return 'annotation-declaration'
    if (token(n, 'enum')) return 'enum-declaration'
    if (token(n, 'interface') && !token(n, '@')) return 'interface-declaration'
    return token(n, 'class') ? 'class-declaration' : null
  }
  if (is(n, 'Method') || is(n, 'AnnotationMethod')) return child(n, 'TypeElement') ? 'method-declaration' : 'constructor-declaration'
  if (is(n, 'ClassInitializer')) return token(child(n, 'ModifierList') ?? n, 'static') ? 'static-initializer' : 'instance-initializer'
  if (is(n, 'ReturnStatement') && child(n, 'SwitchExpression')) return 'switch-case'
  const kinds: Record<string, LibraryComponentId> = {
    Field: 'field-declaration', LocalVariable: 'variable-declaration',
    MethodCallExpression: 'method-call', ReturnStatement: 'return-statement', ThrowStatement: 'throw-statement',
    IfStatement: 'if-else', SwitchStatement: 'switch-case', SwitchExpression: 'switch-case', ForStatement: 'for-loop',
    WhileStatement: 'while-loop', DoWhileStatement: 'do-while-loop', TryStatement: 'try-catch', PackageStatement: 'package-declaration',
    ForeachStatement: 'foreach-loop', BreakStatement: 'break-statement', ContinueStatement: 'continue-statement',
    YieldStatement: 'yield-statement', AssertStatement: 'assert-statement', SynchronizedStatement: 'synchronized-statement',
    DocComment: 'javadoc',
  }
  for (const [type, id] of Object.entries(kinds)) if (is(n, type)) return id
  if (is(n, 'Comment')) return text(n).startsWith('//') ? 'single-line-comment' : 'block-comment'
  if (is(n, 'ImportStatement') || is(n, 'ImportStaticStatement')) return token(n, '*') ? 'import-wildcard' : 'import-single'
  if (is(n, 'WhiteSpace') && text(n).includes('\n')) return 'blank-line'
  if (is(n, 'DeclarationStatement') && children(n).filter(c => is(c, 'LocalVariable')).length === 1) return 'variable-declaration'
  if (is(n, 'ExpressionStatement')) return child(n, 'MethodCallExpression') ? 'method-call' : 'expression-statement'
  return null
}

/** Uses PSI ownership and UTF-16 ranges exclusively; never parses Java with prose/regex heuristics. */
export function structuredForm(node: PsiNode, source: string, selectionStart = node.startOffset, selectionEnd = node.endOffset): StructuredForm | null {
  const id = libraryComponentForNode(node)
  if (!id || hasErrors(node) || selectionStart === undefined || selectionEnd === undefined
      || selectionStart < 0 || selectionEnd > source.length || selectionEnd <= selectionStart) return null
  const start = selectionStart, end = selectionEnd
  const original = source.slice(start, end)
  const bindings: FieldBinding[] = []
  const relative = (s: Span): Span => ({ start: s.start - start, end: s.end - start })
  const absolute = (n: PsiNode): Span => ({ start: n.startOffset!, end: n.endOffset! })
  function add(labelId: string, span: Span, options: Partial<FieldBinding> = {}, value?: string, index?: number) {
    if (!Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end) || span.start < start || span.end > end || span.end < span.start) return
    const definition = componentDefinition(id!).fields.find(f => f.id === labelId)
    if (!definition) return
    const initial = value ?? source.slice(span.start, span.end)
    bindings.push({ ...relative(span), ...options,
      field: { ...definition, id: index === undefined ? labelId : `${labelId}.${index}`, labelId, index, initial, enabledBy: undefined } })
  }
  function trimmed(s: Span): Span {
    let { start: a, end: b } = s
    while (a < b && /\s/u.test(source[a])) a++
    while (b > a && /\s/u.test(source[b - 1])) b--
    return { start: a, end: b }
  }
  function property(label: string, n?: PsiNode, index?: number) { if (n) add(label, absolute(n), {}, undefined, index) }
  function inside(label: string, n: PsiNode | undefined, open: string, close: string, index?: number) {
    if (!n) return
    const a = token(n, open), b = children(n).findLast(c => text(c) === close && !children(c).length)
    if (a && b) add(label, { start: a.endOffset!, end: b.startOffset! }, {}, undefined, index)
  }
  function body(label: string, n?: PsiNode, index?: number) {
    if (!n) return
    const block = is(n, 'BlockStatement') ? child(n, 'CodeBlock') : n
    if (block && token(block, '{') && token(block, '}')) inside(label, block, '{', '}', index)
    else add(label, absolute(n), { format: 'statementBody' }, undefined, index)
  }
  function modifiers(owner: PsiNode, anchor: number) {
    const list = child(owner, 'ModifierList')
    const words = list ? children(list).filter(c => modifierWords.has(text(c))) : []
    add('modifiers', { start: anchor, end: anchor }, {
      format: 'modifiers', tokens: words.map(w => relative(absolute(w))),
      prefix: anchor && !/\s/.test(source[anchor - 1]) ? ' ' : '', suffix: ' ',
    }, words.map(text).join(' '))
  }
  function optionalList(label: string, list: PsiNode | undefined, keyword: string, anchor: number) {
    const word = list && token(list, keyword)
    if (word && list) add(label, trimmed({ start: word.endOffset!, end: list.endOffset! }), { removeWhenEmpty: [relative(absolute(word))] })
    else add(label, { start: anchor, end: anchor }, { prefix: ` ${keyword} ` }, '')
  }
  function typeParameters(owner: PsiNode, anchor: number, beforeReturn = false) {
    const list = child(owner, 'TypeParameterList'), open = list && token(list, '<'), close = list && token(list, '>')
    if (open && close) add('typeParameters', { start: open.endOffset!, end: close.startOffset! }, { removeWhenEmpty: [relative(absolute(open)), relative(absolute(close))] })
    else add('typeParameters', { start: anchor, end: anchor }, { prefix: '<', suffix: beforeReturn ? '> ' : '>' }, '')
  }
  function expression(label: string, owner: PsiNode, keyword?: string) {
    const a = keyword ? token(owner, keyword) : token(owner, '(')
    const b = keyword ? token(owner, ';') : token(owner, ')')
    if (a && b) add(label, trimmed({ start: a.endOffset!, end: b.startOffset! }), { prefix: a.endOffset === b.startOffset && keyword ? ' ' : '' })
  }

  let n = node
  if (is(n, 'DeclarationStatement')) n = child(n, 'LocalVariable')!
  if (is(n, 'ExpressionStatement') && id === 'method-call') n = child(n, 'MethodCallExpression')!
  if (is(n, 'ReturnStatement') && id === 'switch-case') n = child(n, 'SwitchExpression')!
  if (id === 'blank-line') {
    add('count', { start, end }, { format: 'lineCount' }, String(original.split('\n').length - 1))
  } else if (id === 'single-line-comment' || id === 'block-comment' || id === 'javadoc') {
    const width = id === 'javadoc' ? 3 : 2
    const finish = id === 'single-line-comment' ? n.endOffset! : n.endOffset! - 2
    add('text', { start: n.startOffset! + width, end: finish })
  } else if (id === 'package-declaration' || id === 'import-single' || id === 'import-wildcard') {
    property('qualifiedName', child(n, 'JavaCodeReferenceElement'))
    // Static/non-static and wildcard structure remain visible in code; no reconstruction of the import.
  } else if (['class-declaration', 'interface-declaration', 'enum-declaration', 'record-declaration', 'annotation-declaration'].includes(id)) {
    const keywords: Partial<Record<LibraryComponentId, string>> = { 'class-declaration': 'class', 'interface-declaration': 'interface', 'enum-declaration': 'enum',
      'record-declaration': 'record', 'annotation-declaration': 'interface' }
    const keywordText = keywords[id]
    const name = child(n, 'Identifier'), keyword = keywordText && token(n, keywordText)
    if (!name || !keyword) return null
    property('name', name)
    modifiers(n, child(n, 'ModifierList')?.endOffset ?? keyword.startOffset!)
    typeParameters(n, name.endOffset!)
    const typeList = child(n, 'TypeParameterList')
    const recordHeader = child(n, 'RecordHeader')
    if (recordHeader) inside('parameters', recordHeader, '(', ')')
    const anchor = recordHeader?.endOffset || typeList?.endOffset || name.endOffset!
    const references = children(n).filter(c => is(c, 'ReferenceList'))
    optionalList('extends', references.find(c => token(c, 'extends')), 'extends', anchor)
    optionalList('implements', references.find(c => token(c, 'implements')), 'implements', references.find(c => token(c, 'extends'))?.endOffset || anchor)
    if (id !== 'enum-declaration') body('body', n)
    else {
      const open = token(n, '{'), close = token(n, '}'), separator = token(n, ';')
      if (open && close) {
        add('constants', { start: open.endOffset!, end: separator?.startOffset ?? close.startOffset! })
        if (separator) add('body', { start: separator.endOffset!, end: close.startOffset! })
        else add('body', { start: close.startOffset!, end: close.startOffset! }, { prefix: ';\n' }, '')
      }
    }
  } else if (id === 'field-declaration' || id === 'variable-declaration') {
    const name = child(n, 'Identifier'), type = child(n, 'TypeElement')
    if (!name) return null
    property('name', name)
    // A shared declaration or postfix array cannot be safely rewritten as an independent type.
    const shared = !token(n, ';') || token(n, ',') || (is(node, 'DeclarationStatement') && children(node).filter(c => is(c, 'LocalVariable')).length > 1)
    const postfix = children(n).some(c => c.startOffset! > name.endOffset! && (text(c) === '[' || text(c) === ']'))
    if (type && !shared && !postfix) {
      property('type', type)
      modifiers(n, child(n, 'ModifierList')?.endOffset ?? type.startOffset!)
    }
    const equals = token(n, '=')
    const value = equals && children(n).find(c => c.startOffset! >= equals.endOffset! && /ExpressionImpl$/.test(c.type))
    if (value && equals) add('value', absolute(value), { removeWhenEmpty: [relative(absolute(equals))] })
    else {
      const semicolon = token(n, ';') || token(n, ',')
      add('value', { start: semicolon?.startOffset ?? n.endOffset!, end: semicolon?.startOffset ?? n.endOffset! }, { prefix: ' = ' }, '')
    }
  } else if (id === 'method-declaration' || id === 'constructor-declaration') {
    const name = child(n, 'Identifier'), type = child(n, 'TypeElement')
    if (!name) return null
    property('name', name)
    if (!children(n).some(c => text(c) === '[' || text(c) === ']')) property('returnType', type)
    modifiers(n, child(n, 'ModifierList')?.endOffset ?? type?.startOffset ?? name.startOffset!)
    typeParameters(n, type?.startOffset ?? name.startOffset!, true)
    inside('parameters', child(n, 'ParameterList'), '(', ')')
    const parameters = child(n, 'ParameterList')
    optionalList('throws', children(n).find(c => is(c, 'ReferenceList') && token(c, 'throws')), 'throws', parameters?.endOffset ?? name.endOffset!)
    body('body', child(n, 'CodeBlock'))
  } else if (id === 'method-call') {
    const reference = child(n, 'ReferenceExpression')
    if (!reference) return null
    const name = children(reference).findLast(c => is(c, 'Identifier'))
    property('name', name)
    const dot = token(reference, '.')
    const qualifier = children(reference).find(c => /ExpressionImpl$/.test(c.type))
    if (qualifier && dot) add('receiver', absolute(qualifier), { removeWhenEmpty: [relative(absolute(dot))] })
    else if (name) add('receiver', { start: reference.startOffset!, end: reference.startOffset! }, { suffix: '.' }, '')
    inside('arguments', child(n, 'ExpressionList'), '(', ')')
  } else if (id === 'static-initializer' || id === 'instance-initializer') body('body', child(n, 'CodeBlock'))
  else if (id === 'expression-statement') {
    const value = children(n).find(c => /ExpressionImpl$/.test(c.type))
    property('expression', value)
  } else if (id === 'break-statement' || id === 'continue-statement') {
    const label = child(n, 'Identifier'), end = token(n, ';')
    if (label) add('label', absolute(label))
    else if (end) add('label', { start: end.startOffset!, end: end.startOffset! }, { prefix: ' ' }, '')
  } else if (id === 'assert-statement') {
    const values = children(n).filter(c => /ExpressionImpl$/.test(c.type))
    property('condition', values[0])
    const colon = token(n, ':'), end = token(n, ';')
    if (colon && values[1]) add('detail', absolute(values[1]), { removeWhenEmpty: [relative(absolute(colon))] })
    else if (end) add('detail', { start: end.startOffset!, end: end.startOffset! }, { prefix: ' : ' }, '')
  } else if (id === 'synchronized-statement') { expression('expression', n); body('body', child(n, 'CodeBlock')) }
  else if (id === 'return-statement' || id === 'throw-statement' || id === 'yield-statement') expression('expression', n,
    id === 'return-statement' ? 'return' : id === 'throw-statement' ? 'throw' : 'yield')
  else if (id === 'if-else') {
    expression('condition', n)
    const branches = children(n).filter(c => /StatementImpl$/.test(c.type))
    body('thenBody', branches[0]); body('elseBody', branches[1])
  } else if (id === 'switch-case') { expression('expression', n); body('cases', child(n, 'CodeBlock')) }
  else if (id === 'for-loop') {
    const open = token(n, '('), close = token(n, ')')
    if (!open || !close) return null
    const header = children(n).filter(c => c.startOffset! >= open.endOffset! && c.endOffset! <= close.startOffset!)
    const separators = header.flatMap(c => text(c) === ';' ? [c] : /StatementImpl$/.test(c.type) && text(c).trimEnd().endsWith(';')
      ? leaves(c).filter(l => text(l) === ';').slice(-1) : []).sort((a, b) => a.startOffset! - b.startOffset!)
    if (separators.length !== 2) return null
    add('initializer', trimmed({ start: open.endOffset!, end: separators[0].startOffset! }))
    add('condition', trimmed({ start: separators[0].endOffset!, end: separators[1].startOffset! }))
    add('update', trimmed({ start: separators[1].endOffset!, end: close.startOffset! }))
    body('body', children(n).findLast(c => /StatementImpl$/.test(c.type) && c.startOffset! >= close.endOffset!))
  } else if (id === 'while-loop' || id === 'do-while-loop') {
    expression('condition', n)
    body('body', children(n).find(c => /StatementImpl$/.test(c.type)))
  } else if (id === 'foreach-loop') {
    const parameter = child(n, 'Parameter'), colon = token(n, ':'), close = token(n, ')')
    if (parameter) {
      property('name', child(parameter, 'Identifier')); property('type', child(parameter, 'TypeElement'))
      modifiers(parameter, child(parameter, 'ModifierList')?.endOffset ?? parameter.startOffset!)
    }
    if (colon && close) add('iterable', trimmed({ start: colon.endOffset!, end: close.startOffset! }))
    body('body', children(n).findLast(c => /StatementImpl$/.test(c.type)))
  } else if (id === 'try-catch') {
    const resources = child(n, 'ResourceList'), tryWord = token(n, 'try')
    if (resources) {
      const open = token(resources, '('), close = token(resources, ')')
      if (open && close) add('resources', { start: open.endOffset!, end: close.startOffset! },
        { removeWhenEmpty: [relative(absolute(open)), relative(absolute(close))] })
    } else if (tryWord) add('resources', { start: tryWord.endOffset!, end: tryWord.endOffset! }, { prefix: ' (', suffix: ')' }, '')
    body('tryBody', child(n, 'CodeBlock'))
    children(n).filter(c => is(c, 'CatchSection')).forEach((section, index) => {
      const parameter = child(section, 'Parameter')
      if (parameter) { property('catchType', child(parameter, 'TypeElement'), index + 1); property('catchName', child(parameter, 'Identifier'), index + 1) }
      body('catchBody', child(section, 'CodeBlock'), index + 1)
    })
    const finallyWord = token(n, 'finally')
    if (finallyWord) body('finallyBody', children(n).find(c => is(c, 'CodeBlock') && c.startOffset! >= finallyWord.endOffset!))
  }
  if (!bindings.length) return null
  return { componentId: id, source: original, bindings, values: Object.fromEntries(bindings.map(b => [b.field.id, b.field.initial])) }
}

/** Locate exactly one complete component, preserving leading/trailing draft whitespace too. */
export function locateStructuredForm(tree: PsiNode, source: string, start: number, end: number): StructuredForm | null {
  if (start < 0 || end > source.length || end <= start) return null
  const selected = source.slice(start, end)
  if (!selected.trim() && selected.includes('\n')) {
    function whitespace(n: PsiNode): PsiNode | undefined {
      if (n.startOffset! > start || n.endOffset! < end) return undefined
      if (is(n, 'WhiteSpace')) return n
      return children(n).map(whitespace).find(Boolean)
    }
    const owner = whitespace(tree)
    return owner ? structuredForm({ ...owner, text: selected, children: undefined, startOffset: start, endOffset: end }, source, start, end) : null
  }
  const a = start + selected.length - selected.trimStart().length, b = end - (selected.length - selected.trimEnd().length)
  function visit(n: PsiNode): StructuredForm | null {
    if (n.startOffset! > a || n.endOffset! < b) return null
    if ((n.startOffset === start && n.endOffset === end) || (n.startOffset === a && n.endOffset === b)) {
      const form = structuredForm(n, source, start, end)
      if (form) return form
    }
    for (const c of children(n)) { const found = visit(c); if (found) return found }
    return null
  }
  return visit(tree)
}

export function validateStructuredValues(form: StructuredForm, values: AttributeValues): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const binding of form.bindings) {
    const key = binding.field.id, label = binding.field.labelId
    if (values[key] === form.values[key]) continue
    const error = validateAttributes(form.componentId, { ...initialAttributes(form.componentId), [label]: values[key] })[label]
    if (error) errors[key] = error
    if (binding.format === 'modifiers' && String(values[key]).split(/\s+/).filter(Boolean).some(word => !modifierWords.has(word))) errors[key] = 'modifiers'
  }
  return errors
}

/** Apply only changed PSI-owned slots. Comments/annotations/bodies outside those slots stay byte-for-byte. */
export function applyStructuredValues(form: StructuredForm, values: AttributeValues, validate = true): string {
  if (validate && Object.keys(validateStructuredValues(form, values)).length) throw new Error('Invalid structured fields')
  const patches: (Span & { value: string; order: number })[] = []
  form.bindings.forEach((binding, order) => {
    const value = String(values[binding.field.id] ?? '')
    if (value === String(form.values[binding.field.id])) return
    if (binding.format === 'modifiers' && binding.tokens?.length) {
      const words = value.trim().split(/\s+/).filter(Boolean)
      binding.tokens.forEach((span, index) => patches.push({ ...span, order, value: index === binding.tokens!.length - 1 ? words.slice(index).join(' ') : words[index] ?? '' }))
      return
    }
    let replacement = value
    if (binding.format === 'statementBody') replacement = `{\n${value}\n}`
    else if (binding.format === 'lineCount') {
      const previous = form.source.slice(binding.start, binding.end), count = Number(value)
      if (!Number.isSafeInteger(count) || count < 1 || count > 1000) return
      const lines = previous.match(/[^\n]*\n/g) ?? []
      replacement = lines.slice(0, count).join('') + '\n'.repeat(Math.max(0, count - lines.length)) + previous.slice(previous.lastIndexOf('\n') + 1)
    } else replacement = value ? (binding.prefix ?? '') + value + (binding.suffix ?? '') : ''
    patches.push({ start: binding.start, end: binding.end, value: replacement, order })
    if (!value) for (const span of binding.removeWhenEmpty ?? []) patches.push({ ...span, value: '', order })
  })
  patches.sort((a, b) => b.start - a.start || b.order - a.order)
  let output = form.source, boundary = output.length
  for (const patch of patches) {
    if (patch.start < 0 || patch.end > boundary || patch.end < patch.start) throw new Error('Overlapping structured fields')
    output = output.slice(0, patch.start) + patch.value + output.slice(patch.end)
    boundary = patch.start
  }
  return output
}
