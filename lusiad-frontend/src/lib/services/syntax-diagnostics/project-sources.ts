import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { containedPath, assertSeparateRoots, relativeContained } from '../contained-paths.ts'
import { EXTERNAL_SYNC_IGNORED_NAMES } from '../external-sync/external-sync.model.ts'

export interface SyntaxFile { file: string; revision: string }
export interface SourceFailure { file: string; code: 'read' | 'path' }
export interface SyntaxCatalog { files: SyntaxFile[]; failures: SourceFailure[]; revision: string }
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const ignored = (name: string) => name.startsWith('.') || (EXTERNAL_SYNC_IGNORED_NAMES as readonly string[]).includes(name)

/** Same source policy as synchronization. Never follow descendant links or read preview roots. */
export async function readSyntaxSource(root: string, file: string): Promise<string> {
  const relative = relativeContained(root, file)
  if (!relative.endsWith('.java') && !relative.toLowerCase().endsWith('.java')) throw new Error('Java source required')
  if (relative.split('/').some(ignored)) throw new Error('Source excluded by project policy')
  const bytes = await readFile(containedPath(root, relative))
  // Document/PSI coordinates use LF. Decode strictly; invalid bytes are a read failure, never clean Java.
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes).replace(/\r\n?/g, '\n')
}
export const syntaxRevision = hash

export async function catalogSyntaxSources(root: string, temporaryRoot: string): Promise<SyntaxCatalog> {
  assertSeparateRoots(root, temporaryRoot)
  const files: SyntaxFile[] = [], failures: SourceFailure[] = []
  async function walk(folder: string) {
    let entries
    try { entries = await readdir(containedPath(root, folder, true), { withFileTypes: true }) }
    catch { failures.push({ file: folder || '.', code: 'read' }); return }
    for (const entry of entries) {
      if (ignored(entry.name)) continue
      const file = folder ? `${folder}/${entry.name}` : entry.name
      if (entry.isSymbolicLink()) { failures.push({ file, code: 'path' }); continue }
      if (entry.isDirectory()) await walk(file)
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.java')) {
        try { files.push({ file, revision: hash(await readSyntaxSource(root, file)) }) }
        catch { failures.push({ file, code: 'read' }) }
      }
    }
  }
  await walk('')
  files.sort((a, b) => a.file.localeCompare(b.file)); failures.sort((a, b) => a.file.localeCompare(b.file))
  return { files, failures, revision: hash(JSON.stringify({ files, failures })) }
}
