export interface PsiNode {
  type: string
  text?: string
  startOffset?: number
  endOffset?: number
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
  children?: PsiNode[]
}

export interface JavaModel {
  revision?: string
  file: string
  tree: PsiNode
}

export interface FileNode {
  id: string
  name: string
  type: 'folder' | 'file'
  extension?: string
  path?: string
  children?: FileNode[]
}

export interface Change {
  userDescription?: string
  stale?: boolean
  preview?: { snapshotId: string; beforeTree: FileNode[]; afterTree: FileNode[] }
  id: string
  title: string
  description: string
  timestamp: Date
  type: 'added' | 'modified' | 'deleted'
  changeType?: string
  scope?: string
  fileName: string
  commitId?: string | null
  reqBody?: unknown
}

export interface Commit {
  id: string
  gitId?: string
  previousId?: string | null
  title: string
  description?: string
  timestamp: Date
  trackId: string
  trackName: string
  changes: Change[]
  isMergeCommit?: boolean
  isNewBranchCommit?: boolean
  restoredFromCommitId?: number | null
  restoredFromChangeId?: number | null
}

export interface Track {
  id: string
  name: string
  color: string
  parentTrackId?: string
  lastCommitDate: Date
  commits: Commit[]
}

export interface ExternalChange {
  id: string
  fileName: string
  type: 'added' | 'modified' | 'deleted'
  detectedAt: Date
  diff?: string
}

export interface StagedFile {
  id: string
  fileName: string
  status: 'created' | 'modified' | 'deleted'
  path: string
}

export type PanelState = 'collapsed' | 'expanded'

export type LoadingState = 'idle' | 'loading' | 'error' | 'success'
