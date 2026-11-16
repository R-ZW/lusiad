import type { FileNode, Track, Commit, Change, ExternalChange, StagedFile } from './types'

export const mockFileTree: FileNode[] = [
  {
    id: '1',
    name: 'src',
    type: 'folder',
    children: [
      {
        id: '2',
        name: 'models',
        type: 'folder',
        children: [
          { id: '3', name: 'Matrix.java', type: 'file', extension: 'java' },
          { id: '4', name: 'Vector.java', type: 'file', extension: 'java' },
          { id: '5', name: 'Transform.java', type: 'file', extension: 'java' },
        ],
      },
      {
        id: '6',
        name: 'controllers',
        type: 'folder',
        children: [
          { id: '7', name: 'MainController.java', type: 'file', extension: 'java' },
          { id: '8', name: 'DataController.java', type: 'file', extension: 'java' },
        ],
      },
      {
        id: '9',
        name: 'utils',
        type: 'folder',
        children: [
          { id: '10', name: 'Helper.java', type: 'file', extension: 'java' },
          { id: '11', name: 'config.xml', type: 'file', extension: 'xml' },
        ],
      },
    ],
  },
  {
    id: '12',
    name: 'tests',
    type: 'folder',
    children: [
      { id: '13', name: 'MatrixTest.java', type: 'file', extension: 'java' },
      { id: '14', name: 'VectorTest.java', type: 'file', extension: 'java' },
    ],
  },
  {
    id: '15',
    name: 'README.md',
    type: 'file',
    extension: 'md',
  },
]

const mockNow = new Date("2024-01-15T12:00:00.000Z")
const hourAgo = new Date(mockNow.getTime() - 3600000)
const dayAgo = new Date(mockNow.getTime() - 86400000)
const twoDaysAgo = new Date(mockNow.getTime() - 172800000)

export const mockChanges: Change[] = [
  {
    id: 'c1',
    title: 'Add in Matrix.java',
    description: 'For loop modified into print() method',
    timestamp: hourAgo,
    type: 'modified',
    fileName: 'Matrix.java',
  },
  {
    id: 'c2',
    title: 'Create Vector.java',
    description: 'New vector class with basic operations',
    timestamp: hourAgo,
    type: 'added',
    fileName: 'Vector.java',
  },
  {
    id: 'c3',
    title: 'Delete OldHelper.java',
    description: 'Removed deprecated helper class',
    timestamp: dayAgo,
    type: 'deleted',
    fileName: 'OldHelper.java',
  },
]

export const mockUncommittedChanges: Change[] = [
  {
    id: 'uc1',
    title: 'Modify Transform.java',
    description: 'Added rotation method',
    timestamp: hourAgo,
    type: 'modified',
    fileName: 'Transform.java',
  },
  {
    id: 'uc2',
    title: 'Create NewClass.java',
    description: 'New utility class',
    timestamp: mockNow,
    type: 'added',
    fileName: 'NewClass.java',
  },
]

export const mockCommits: Commit[] = [
  {
    id: 'commit-1',
    title: 'Implement matrix operations',
    description: 'Added multiplication and transpose methods',
    timestamp: hourAgo,
    trackId: 'track-1',
    trackName: 'main',
    changes: mockChanges.slice(0, 2),
  },
  {
    id: 'commit-2',
    title: 'Refactor helper classes',
    description: 'Cleaned up deprecated code',
    timestamp: dayAgo,
    trackId: 'track-1',
    trackName: 'main',
    changes: [mockChanges[2]],
  },
  {
    id: 'commit-3',
    title: 'Add vector support',
    timestamp: twoDaysAgo,
    trackId: 'track-2',
    trackName: 'feature/vectors',
    changes: [],
  },
]

export const mockTracks: Track[] = [
  {
    id: 'track-1',
    name: 'main',
    color: '#4ade80',
    lastCommitDate: hourAgo,
    commits: mockCommits.filter((c) => c.trackId === 'track-1'),
  },
  {
    id: 'track-2',
    name: 'feature/vectors',
    color: '#60a5fa',
    parentTrackId: 'track-1',
    lastCommitDate: twoDaysAgo,
    commits: mockCommits.filter((c) => c.trackId === 'track-2'),
  },
  {
    id: 'track-3',
    name: 'feature/transforms',
    color: '#f59e0b',
    parentTrackId: 'track-1',
    lastCommitDate: dayAgo,
    commits: [],
  },
]

export const mockExternalChanges: ExternalChange[] = [
  {
    id: 'ext-1',
    fileName: 'Matrix.java',
    type: 'modified',
    detectedAt: hourAgo,
    diff: '- public void print() {\n+ public void display() {',
  },
  {
    id: 'ext-2',
    fileName: 'Config.xml',
    type: 'added',
    detectedAt: mockNow,
  },
]

export const mockStagedFiles: StagedFile[] = [
  { id: 's1', fileName: 'NewClass.java', status: 'created', path: 'src/models/' },
  { id: 's2', fileName: 'Transform.java', status: 'modified', path: 'src/models/' },
  { id: 's3', fileName: 'OldUtil.java', status: 'deleted', path: 'src/utils/' },
]
