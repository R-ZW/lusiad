/** Shared creation contract. Every catalogue ID must have fields, defaults and a source builder. */
export type AttributeValues = Record<string, string | boolean>
export type FieldRule = 'identifier' | 'typeName' | 'qualifiedName' | 'comment' | 'singleLine' | 'lineCount'
export interface AttributeField {
  id: string
  kind: 'text' | 'multiline' | 'checkbox' | 'number'
  initial: string | boolean
  required?: boolean
  rule?: FieldRule
  enabledBy?: string
  suggestions?: readonly string[]
}
export interface ComponentDefinition {
  fields: readonly AttributeField[]
  source: (values: AttributeValues) => string
}
export interface InsertionDestination { line: number; lineEnd?: number; column?: number }

// Curated Java conveniences, not a validator or operational configuration.
const javaTypes = ['boolean', 'byte', 'short', 'int', 'long', 'float', 'double', 'char', 'String', 'Object', 'Integer', 'Long', 'Double', 'Boolean'] as const
export const attributeSuggestions: Readonly<Record<string, readonly string[]>> = {
  type: javaTypes,
  returnType: ['void', ...javaTypes],
  modifiers: ['public', 'private', 'protected', 'static', 'final', 'public static', 'private final', 'public static final'],
  catchType: ['Exception', 'RuntimeException', 'java.io.IOException', 'IllegalArgumentException'],
}
const field = (id: string, initial = '', options: Partial<AttributeField> = {}): AttributeField => ({ id, initial, kind: 'text', suggestions: attributeSuggestions[id], ...options })
const name = (initial: string, typeName = false) => field('name', initial, { required: true, rule: typeName ? 'typeName' : 'identifier' })
const code = (id = 'body', initial = '', enabledBy?: string) => field(id, initial, { kind: 'multiline', enabledBy })
const toggle = (id: string, initial: boolean) => field(id, '', { kind: 'checkbox', initial })
const s = (v: AttributeValues, key: string) => String(v[key] ?? '').replace(/\r\n?/g, '\n')
const text = (v: AttributeValues, key: string) => s(v, key).trim()
const yes = (v: AttributeValues, key: string) => v[key] === true
const prefix = (value: string) => value ? value + ' ' : ''
const clause = (word: string, value: string) => value ? ` ${word} ${value}` : ''
const body = (value: string) => value ? value + (value.endsWith('\n') ? '' : '\n') : ''
const block = (header: string, content: string, closingIndent = '') => `${header} {\n${body(content)}${closingIndent}}\n`
const declaration = (keyword: string, v: AttributeValues) => prefix(text(v, 'modifiers')) + keyword + ' ' + text(v, 'name')
const variable = (v: AttributeValues) => `${prefix(text(v, 'modifiers'))}${text(v, 'type')} ${text(v, 'name')}${text(v, 'value') ? ' = ' + text(v, 'value') : ''};\n`
const comment = (opening: string, value: string) => `${opening}\n${value.split('\n').map(line => ' *' + (line ? ' ' + line : '')).join('\n')}\n */\n`

export const componentDefinitions = {
  'class-declaration': {
    fields: [name('MyClass', true), field('modifiers', 'public'), field('typeParameters'), field('extends'), field('implements'), code()],
    source: v => block(declaration('class', v) + (text(v, 'typeParameters') ? `<${text(v, 'typeParameters')}>` : '')
      + clause('extends', text(v, 'extends')) + clause('implements', text(v, 'implements')), s(v, 'body')),
  },
  'interface-declaration': {
    fields: [name('MyContract', true), field('modifiers', 'public'), field('typeParameters'), field('extends'), code()],
    source: v => block(declaration('interface', v) + (text(v, 'typeParameters') ? `<${text(v, 'typeParameters')}>` : '')
      + clause('extends', text(v, 'extends')), s(v, 'body')),
  },
  'enum-declaration': {
    fields: [name('MyStatus', true), field('modifiers', 'public'), field('implements'), code('constants', '    ACTIVE,\n    INACTIVE'), code()],
    source: v => block(declaration('enum', v) + clause('implements', text(v, 'implements')),
      s(v, 'constants') + (s(v, 'body') ? ';\n' + s(v, 'body') : '')),
  },
  'record-declaration': {
    fields: [name('MyRecord', true), field('modifiers', 'public'), field('typeParameters'), code('parameters', 'String name'), field('implements'), code()],
    source: v => block(declaration('record', v) + (text(v, 'typeParameters') ? `<${text(v, 'typeParameters')}>` : '')
      + `(${text(v, 'parameters')})` + clause('implements', text(v, 'implements')), s(v, 'body')),
  },
  'annotation-declaration': {
    fields: [name('MyAnnotation', true), field('modifiers', 'public'), code('body', '    String value() default "";')],
    source: v => block(declaration('@interface', v), s(v, 'body')),
  },
  'field-declaration': {
    fields: [name('name'), field('type', 'String', { required: true }), field('modifiers', 'private'), code('value')], source: variable,
  },
  'variable-declaration': {
    fields: [name('x'), field('type', 'int', { required: true }), field('modifiers', '', { suggestions: ['final'] }), code('value', '5')], source: variable,
  },
  'method-declaration': {
    fields: [name('myMethod'), field('returnType', 'void', { required: true }), field('modifiers', 'public'), field('typeParameters'),
      code('parameters'), field('throws'), toggle('withBody', true), code('body', '', 'withBody')],
    source: v => {
      const signature = prefix(text(v, 'modifiers')) + (text(v, 'typeParameters') ? `<${text(v, 'typeParameters')}> ` : '')
        + `${text(v, 'returnType')} ${text(v, 'name')}(${text(v, 'parameters')})` + clause('throws', text(v, 'throws'))
      return yes(v, 'withBody') ? block(signature, s(v, 'body')) : signature + ';\n'
    },
  },
  'constructor-declaration': {
    fields: [name('MyClass', true), field('modifiers', 'public'), field('typeParameters'), code('parameters'), field('throws'), code()],
    source: v => block(prefix(text(v, 'modifiers')) + (text(v, 'typeParameters') ? `<${text(v, 'typeParameters')}> ` : '')
      + `${text(v, 'name')}(${text(v, 'parameters')})` + clause('throws', text(v, 'throws')), s(v, 'body')),
  },
  'static-initializer': { fields: [code()], source: v => block('static', s(v, 'body')) },
  'instance-initializer': { fields: [code()], source: v => block('', s(v, 'body')).trimStart() },
  'method-call': {
    fields: [field('receiver', 'System.out'), name('println'), code('arguments', '""')],
    source: v => `${text(v, 'receiver') ? text(v, 'receiver') + '.' : ''}${text(v, 'name')}(${text(v, 'arguments')});\n`,
  },
  'return-statement': { fields: [code('expression', 'value')], source: v => `return${text(v, 'expression') ? ' ' + text(v, 'expression') : ''};\n` },
  'throw-statement': { fields: [field('expression', 'new RuntimeException()', { required: true })], source: v => `throw ${text(v, 'expression')};\n` },
  'expression-statement': { fields: [code('expression', 'x = 0')].map(f => ({ ...f, required: true })), source: v => `${text(v, 'expression')};\n` },
  'break-statement': { fields: [field('label', '', { rule: 'identifier' })], source: v => `break${text(v, 'label') ? ' ' + text(v, 'label') : ''};\n` },
  'continue-statement': { fields: [field('label', '', { rule: 'identifier' })], source: v => `continue${text(v, 'label') ? ' ' + text(v, 'label') : ''};\n` },
  'yield-statement': { fields: [code('expression', 'value')].map(f => ({ ...f, required: true })), source: v => `yield ${text(v, 'expression')};\n` },
  'assert-statement': {
    fields: [field('condition', 'condition', { required: true }), code('detail')],
    source: v => `assert ${text(v, 'condition')}${text(v, 'detail') ? ' : ' + text(v, 'detail') : ''};\n`,
  },
  'synchronized-statement': {
    fields: [field('expression', 'this', { required: true }), code()],
    source: v => block(`synchronized (${text(v, 'expression')})`, s(v, 'body')),
  },
  'if-else': {
    fields: [field('condition', 'condition', { required: true }), code('thenBody'), toggle('withElse', true), code('elseBody', '', 'withElse')],
    source: v => block(`if (${text(v, 'condition')})`, s(v, 'thenBody')) + (yes(v, 'withElse') ? block('else', s(v, 'elseBody')) : ''),
  },
  'switch-case': {
    fields: [field('expression', 'value', { required: true }), code('cases', '    case 1 -> {\n    }'),
      toggle('withDefault', true), code('defaultBody', '', 'withDefault'), toggle('returnSwitch', false)],
    source: v => {
      const value = block(`${yes(v, 'returnSwitch') ? 'return ' : ''}switch (${text(v, 'expression')})`, body(s(v, 'cases'))
        + (yes(v, 'withDefault') ? block('    default ->', s(v, 'defaultBody'), '    ') : ''))
      return yes(v, 'returnSwitch') ? value.trimEnd() + ';\n' : value
    },
  },
  'for-loop': {
    fields: [field('initializer', 'int i = 0'), field('condition', 'i < 10'), field('update', 'i++'), code()],
    source: v => block(`for (${text(v, 'initializer')}; ${text(v, 'condition')}; ${text(v, 'update')})`, s(v, 'body')),
  },
  'foreach-loop': {
    fields: [field('modifiers', '', { suggestions: ['final'] }), field('type', 'String', { required: true }), name('item'),
      field('iterable', 'items', { required: true }), code()],
    source: v => block(`for (${prefix(text(v, 'modifiers'))}${text(v, 'type')} ${text(v, 'name')} : ${text(v, 'iterable')})`, s(v, 'body')),
  },
  'while-loop': { fields: [field('condition', 'condition', { required: true }), code()], source: v => block(`while (${text(v, 'condition')})`, s(v, 'body')) },
  'do-while-loop': {
    fields: [field('condition', 'condition', { required: true }), code()],
    source: v => `do {\n${body(s(v, 'body'))}} while (${text(v, 'condition')});\n`,
  },
  'try-catch': {
    fields: [code('resources'), code('tryBody'), toggle('withCatch', true), field('catchType', 'Exception', { required: true, enabledBy: 'withCatch' }),
      field('catchName', 'e', { required: true, rule: 'identifier', enabledBy: 'withCatch' }), code('catchBody', '', 'withCatch'),
      toggle('withFinally', false), code('finallyBody', '', 'withFinally')],
    source: v => block('try' + (text(v, 'resources') ? ` (${text(v, 'resources')})` : ''), s(v, 'tryBody'))
      + (yes(v, 'withCatch') ? block(`catch (${text(v, 'catchType')} ${text(v, 'catchName')})`, s(v, 'catchBody')) : '')
      + (yes(v, 'withFinally') ? block('finally', s(v, 'finallyBody')) : ''),
  },
  'package-declaration': {
    fields: [field('qualifiedName', 'com.example.app', { required: true, rule: 'qualifiedName' })], source: v => `package ${text(v, 'qualifiedName')};\n`,
  },
  'import-single': {
    fields: [field('qualifiedName', 'java.util.List', { required: true, rule: 'qualifiedName' }), toggle('isStatic', false)],
    source: v => `import ${yes(v, 'isStatic') ? 'static ' : ''}${text(v, 'qualifiedName')};\n`,
  },
  'import-wildcard': {
    fields: [field('qualifiedName', 'java.util', { required: true, rule: 'qualifiedName' }), toggle('isStatic', false)],
    source: v => `import ${yes(v, 'isStatic') ? 'static ' : ''}${text(v, 'qualifiedName')}.*;\n`,
  },
  'single-line-comment': { fields: [field('text', 'comentário', { rule: 'singleLine' })], source: v => `//${s(v, 'text') ? ' ' + s(v, 'text') : ''}\n` },
  'block-comment': { fields: [code('text', 'comentário')].map(f => ({ ...f, rule: 'comment' as const })), source: v => comment('/*', s(v, 'text')) },
  'javadoc': { fields: [code('text', 'descrição')].map(f => ({ ...f, rule: 'comment' as const })), source: v => comment('/**', s(v, 'text')) },
  'blank-line': { fields: [field('count', '1', { kind: 'number', rule: 'lineCount', required: true })], source: v => '\n'.repeat(Number(text(v, 'count'))) },
} satisfies Record<string, ComponentDefinition>

export type LibraryComponentId = keyof typeof componentDefinitions
export function componentDefinition(id: LibraryComponentId): ComponentDefinition { return componentDefinitions[id] }
export interface CreateComponentRequest extends InsertionDestination { componentId: LibraryComponentId }
export function isLibraryComponentId(value: unknown): value is LibraryComponentId {
  return typeof value === 'string' && Object.hasOwn(componentDefinitions, value)
}
export function initialAttributes(id: LibraryComponentId): AttributeValues {
  return Object.fromEntries(componentDefinitions[id].fields.map(f => [f.id, f.initial]))
}
export function fieldEnabled(field: AttributeField, values: AttributeValues) { return !field.enabledBy || yes(values, field.enabledBy) }

const keywords = new Set(('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null _').split(' '))
export function isJavaIdentifier(value: string) {
  return /^[$\p{L}\p{Nl}\p{Sc}\p{Pc}][$\p{L}\p{Nl}\p{Sc}\p{Pc}\p{Mn}\p{Mc}\p{Nd}\p{Cf}]*$/u.test(value) && !keywords.has(value)
}
export type AttributeError = 'required' | 'identifier' | 'qualifiedName' | 'commentEnd' | 'singleLine' | 'lineCount' | 'tryHandler'
/** Basic form validation only; no claim of Java parsing, type checking or compilation. */
export function validateAttributes(id: LibraryComponentId, values: AttributeValues): Record<string, AttributeError> {
  const errors: Record<string, AttributeError> = {}
  for (const field of componentDefinition(id).fields) {
    if (!fieldEnabled(field, values)) continue
    const value = text(values, field.id)
    if (field.required && !value) { errors[field.id] = 'required'; continue }
    if (field.rule === 'singleLine' && /[\r\n]/.test(s(values, field.id))) { errors[field.id] = 'singleLine'; continue }
    if (!value) continue
    if (field.rule === 'identifier' || field.rule === 'typeName') {
      if (!isJavaIdentifier(value) || (field.rule === 'typeName' && ['var', 'yield', 'record', 'sealed', 'permits'].includes(value))) errors[field.id] = 'identifier'
    } else if (field.rule === 'qualifiedName' && !value.split('.').every(isJavaIdentifier)) errors[field.id] = 'qualifiedName'
    else if (field.rule === 'comment' && value.includes('*/')) errors[field.id] = 'commentEnd'
    else if (field.rule === 'lineCount' && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 1000)) errors[field.id] = 'lineCount'
  }
  if (id === 'try-catch' && !yes(values, 'withCatch') && !yes(values, 'withFinally') && !text(values, 'resources')) errors.resources = 'tryHandler'
  return errors
}
export function buildComponentSource(id: LibraryComponentId, values: AttributeValues): string {
  if (Object.keys(validateAttributes(id, values)).length) throw new Error('Invalid component attributes')
  return componentDefinitions[id].source(values)
}

/** Show the actual proposal even with incomplete fields; never allocate an invalid blank-line count. */
export function previewComponentSource(id: LibraryComponentId, values: AttributeValues): string {
  if (id === 'blank-line' && validateAttributes(id, values).count) return ''
  return componentDefinition(id).source(values)
}

export interface CreationDraft { values: AttributeValues; manualSource: string | null }
export type CreationDraftAction = { type: 'attribute'; id: string; value: string | boolean } | { type: 'code'; source: string }
export function initialCreationDraft(id: LibraryComponentId, overrides: AttributeValues = {}): CreationDraft { return { values: { ...initialAttributes(id), ...overrides }, manualSource: null } }
/** Once code is edited, even Undo cannot re-enable fields for this proposal. */
export function reduceCreationDraft(draft: CreationDraft, action: CreationDraftAction): CreationDraft {
  if (action.type === 'code') return { ...draft, manualSource: action.source }
  if (draft.manualSource !== null) return draft
  return { ...draft, values: { ...draft.values, [action.id]: action.value } }
}
