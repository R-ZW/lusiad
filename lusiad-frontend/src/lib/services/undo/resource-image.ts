import { createHash } from 'node:crypto'
import { isUtf8 } from 'node:buffer'
import { BackendApiError } from '../backend-response.ts'

export interface ResourceEntry { kind: 'file' | 'directory'; content: string | null }
export interface ResourceImage { roots: string[]; entries: Record<string, ResourceEntry> }
export interface ResourceStates { before: ResourceImage; after: ResourceImage }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const path = (value: unknown): value is string => typeof value === 'string' && !!value && !/^[A-Za-z]:|^[\\/]|[\\\0\r\n]/.test(value)
  && value.split('/').every(part => part && part !== '.' && part !== '..' && part.toLowerCase() !== '.git')
export const withinResource = (name: string, root: string) => name === root || name.startsWith(root + '/')
export function readResourceStates(body: unknown): ResourceStates | null {
  if (!object(body) || !('resources' in body)) return null
  const invalid = (): never => { throw new BackendApiError('History', 'Invalid reversible resource image', 'invalid_response', 422) }
  if (!object(body.resources)) return invalid()
  const states = body.resources
  for (const key of ['before', 'after']) {
    const image = states[key]
    if (!object(image) || !Array.isArray(image.roots) || !image.roots.length || !image.roots.every(path)
      || new Set(image.roots).size !== image.roots.length || !object(image.entries) || Object.keys(image.entries).length > 20000) return invalid()
    let size = 0
    for (const [name, entry] of Object.entries(image.entries)) {
      if (!path(name) || !(image.roots as string[]).some(root => withinResource(name, root)) || !object(entry)) return invalid()
      if (entry.kind === 'directory') { if (entry.content !== null) return invalid() }
      else if (entry.kind === 'file' && typeof entry.content === 'string') {
        const bytes = Buffer.from(entry.content, 'base64'); size += bytes.length
        if (bytes.toString('base64') !== entry.content || size > 64 * 1024 * 1024) return invalid()
      } else return invalid()
    }
  }
  if (JSON.stringify((states.before as unknown as ResourceImage).roots) !== JSON.stringify((states.after as unknown as ResourceImage).roots)) return invalid()
  return states as unknown as ResourceStates
}
export const resourceBytes = (entry: ResourceEntry) => Buffer.from(entry.content ?? '', 'base64')
export const resourceHash = (entry: ResourceEntry) => createHash('sha256').update(resourceBytes(entry)).digest('hex')

/** Complete images include absence. Preserve deleted descendants as explicit negative expectations. */
export function resourcePostimages(expected: Map<string, string | Buffer | null>, states: ResourceStates) {
  for (const [name, content] of expected) {
    if (!states.before.roots.some(root => withinResource(name, root))) continue
    const previous = states.before.entries[name]
    if (content === null) {
      if (previous?.kind === 'file') throw new BackendApiError('History', 'Resource preimage is discontinuous', 'invalid_response', 422)
    } else {
      if (!previous || previous.kind !== 'file') throw new BackendApiError('History', 'Resource preimage is missing', 'invalid_response', 422)
      const actual = resourceBytes(previous), wanted = typeof content === 'string' ? Buffer.from(content) : content
      const sameText = isUtf8(actual) && isUtf8(wanted) && !actual.includes(0) && !wanted.includes(0)
        && actual.toString('utf8').replaceAll('\r\n','\n').replace(/^\ufeff/,'') === wanted.toString('utf8').replaceAll('\r\n','\n').replace(/^\ufeff/,'')
      if (!actual.equals(wanted) && !sameText) throw new BackendApiError('History', 'Resource preimage differs from earlier events', 'invalid_response', 422)
    }
  }
  for (const root of states.after.roots) {
    for (const name of expected.keys()) if (withinResource(name, root)) expected.set(name, null)
    if (!(root in states.after.entries)) expected.set(root, null)
  }
  for (const [name, entry] of Object.entries(states.before.entries)) if (entry.kind === 'file') expected.set(name, null)
  for (const [name, entry] of Object.entries(states.after.entries)) {
    if (entry.kind === 'file') expected.set(name, resourceBytes(entry))
    else expected.delete(name)
  }
}
