import { createHash } from 'node:crypto'

export const EXTERNAL_SYNC_IGNORED_NAMES = ['.git', '.idea', '.next', '.vscode', 'node_modules', 'build', 'dist', 'out', 'target'] as const
export const GIT_STAGE_PATHSPEC = [
  '-A', '--', '.', ':(exclude,glob)**/.*',
  ':(exclude,glob)**/.lusiad-backup-*/**', ':(exclude,glob)**/.lusiad-stage-*/**',
  ':(exclude,glob)**/.lusiad-sync-*/**',
  ...EXTERNAL_SYNC_IGNORED_NAMES.filter((name) => name !== '.git').map((name) => `:(exclude,glob)**/${name}/**`),
]

export type EntryKind = 'file' | 'directory'
export type ChangeKind = 'added' | 'modified' | 'deleted'

export interface SnapshotEntry {
  path: string
  kind: EntryKind
  content: Buffer | null
  sha256: string
}

export interface ExternalSyncChange {
  path: string
  type: ChangeKind
  entryKind: EntryKind
  revision: string
  isJava: boolean
}

export function changedEntries(
  before: Map<string, SnapshotEntry>,
  after: Map<string, SnapshotEntry>,
  includeDirectories = false
): ExternalSyncChange[] {
  const changes: ExternalSyncChange[] = []
  for (const path of new Set([...before.keys(), ...after.keys()])) {
    const oldEntry = before.get(path)
    const newEntry = after.get(path)
    if (oldEntry?.kind === newEntry?.kind && oldEntry?.sha256 === newEntry?.sha256) continue
    const type: ChangeKind = !oldEntry ? 'added' : !newEntry ? 'deleted' : 'modified'
    const revision = createHash('sha256').update(
      `${oldEntry?.kind ?? 'none'}:${oldEntry?.sha256 ?? ''}:${newEntry?.kind ?? 'none'}:${newEntry?.sha256 ?? ''}`
    ).digest('hex')
    changes.push({
      path,
      type,
      entryKind: newEntry?.kind ?? oldEntry?.kind ?? 'file',
      revision,
      isJava: path.toLowerCase().endsWith('.java') && (newEntry?.kind ?? oldEntry?.kind) === 'file',
    })
  }
  // A parent folder follows the selection of its affected files.
  return changes.filter((change) => includeDirectories || change.entryKind !== 'directory'
    || !changes.some((other) => other.entryKind === 'file' && other.path.startsWith(`${change.path}/`)))
    .sort((a, b) => a.path.localeCompare(b.path))
}
