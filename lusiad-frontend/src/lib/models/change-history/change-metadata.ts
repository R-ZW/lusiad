/** Presentation facts in req_body.changeMetadata; independent of replay's recordVersion. */
export const elementKinds = [
  'class', 'interface', 'enum', 'record', 'annotation', 'method', 'constructor', 'field', 'variable',
  'parameter', 'enumConstant', 'return', 'throw', 'if', 'then', 'else', 'switch', 'case', 'default',
  'for', 'foreach', 'while', 'do', 'try', 'comment', 'javadoc', 'package', 'import', 'call',
  'break', 'continue', 'yield', 'assert', 'synchronized', 'staticInitializer', 'instanceInitializer',
  'identifier', 'block', 'expression', 'statement', 'whitespace', 'fragment', 'elements', 'file', 'directory',
] as const
export type ElementKind = typeof elementKinds[number]
export const changeActions = ['create', 'update', 'move', 'delete', 'file_create', 'file_rename', 'file_move', 'file_delete',
  'dir_create', 'dir_rename', 'dir_move', 'dir_delete', 'external_bundle'] as const
export type ChangeAction = typeof changeActions[number]
export const differenceFields = ['name', 'type', 'signature', 'condition', 'expression'] as const
export interface ChangeElement { kind: ElementKind; name: string | null }
export interface ChangeLocation {
  start: number; end: number; startLine: number; endLine: number; startColumn: number; endColumn: number
}
export interface ChangeSide {
  path: string; range: ChangeLocation | null; element: ChangeElement; context: ChangeElement[]
}
export interface BundleEntry { path: string; kind: 'added' | 'modified' | 'deleted'; beforeKind: string | null; afterKind: string | null }
export interface ChangeMetadata {
  version: 1; action: ChangeAction; kind: 'code' | 'file' | 'directory' | 'external'
  before: ChangeSide | null; after: ChangeSide | null
  differences: Array<{ field: typeof differenceFields[number]; before: string; after: string }>
  files?: BundleEntry[]
}

function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function element(value: unknown): value is ChangeElement {
  return object(value) && elementKinds.includes(value.kind as ElementKind) && (value.name === null || typeof value.name === 'string')
}
function location(value: unknown): value is ChangeLocation {
  if (!object(value)) return false
  for (const key of ['start', 'end', 'startLine', 'endLine', 'startColumn', 'endColumn']) {
    if (!Number.isSafeInteger(value[key]) || Number(value[key]) < (key === 'start' || key === 'end' ? 0 : 1)) return false
  }
  return Number(value.end) >= Number(value.start) && Number(value.endLine) >= Number(value.startLine)
}
function side(value: unknown): value is ChangeSide {
  return object(value) && typeof value.path === 'string' && !!value.path && (value.range === null || location(value.range))
    && element(value.element) && Array.isArray(value.context) && value.context.every(element)
}

/** Unknown/invalid facts never become a confident semantic description. No legacy phrase parsing. */
export function readChangeMetadata(body: unknown): ChangeMetadata | null {
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { return null } }
  if (!object(body) || !object(body.changeMetadata)) return null
  const m = body.changeMetadata
  if (m.version !== 1 || !changeActions.includes(m.action as ChangeAction)
    || !['code', 'file', 'directory', 'external'].includes(String(m.kind))
    || !(m.before === null || side(m.before)) || !(m.after === null || side(m.after))
    || !Array.isArray(m.differences) || m.differences.length > 1 || (m.action !== 'update' && m.differences.length !== 0) || !m.differences.every(d => object(d)
      && differenceFields.includes(d.field as typeof differenceFields[number]) && typeof d.before === 'string' && typeof d.after === 'string')) return null
  if (m.kind === 'external') {
    if (m.action !== 'external_bundle' || m.before !== null || m.after !== null || !Array.isArray(m.files)
      || !m.files.every(f => object(f) && typeof f.path === 'string' && !!f.path
        && ['added', 'modified', 'deleted'].includes(String(f.kind))
        && (f.beforeKind === null || ['file', 'directory'].includes(String(f.beforeKind)))
        && (f.afterKind === null || ['file', 'directory'].includes(String(f.afterKind))))) return null
  } else {
    if (m.before === null && m.after === null) return null
    if (m.kind === 'code' ? !['create', 'update', 'move', 'delete'].includes(String(m.action))
      : !String(m.action).startsWith(m.kind === 'file' ? 'file_' : 'dir_')) return null
    const action = String(m.action).split('_').at(-1)
    if (action === 'create' && (m.before !== null || m.after === null)
      || action === 'delete' && (m.after !== null || m.before === null)
      || ['update', 'rename', 'move'].includes(action ?? '') && (m.before === null || m.after === null)) return null
  }
  return m as unknown as ChangeMetadata
}

/** Cumulative accepted bundle, rebuilt after net-zero entries are removed in the same SQL transaction. */
export function bundleMetadata(files: BundleEntry[]): ChangeMetadata {
  return { version: 1, action: 'external_bundle', kind: 'external', before: null, after: null, differences: [],
    files: files.map(f => ({ ...f })) }
}
