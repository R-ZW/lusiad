import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { buildExternalLineDiff } from '../src/lib/services/external-sync/external-line-diff.ts'
import { changedEntries, GIT_STAGE_PATHSPEC, type SnapshotEntry } from '../src/lib/services/external-sync/external-sync.model.ts'

function entry(path: string, text: string | null): SnapshotEntry {
  const content = text === null ? null : Buffer.from(text)
  return {
    path,
    kind: content === null ? 'directory' : 'file',
    content,
    sha256: createHash('sha256').update(content ?? Buffer.alloc(0)).digest('hex'),
  }
}

test('external line diff preserves Java edits without blank phantom lines', () => {
  const added = buildExternalLineDiff('', 'class Calculator {}\n')
  assert.deepEqual(added.filter((line) => line.kind !== 'context'), [
    { kind: 'added', text: 'class Calculator {}' },
  ])
  const edited = buildExternalLineDiff('int total = 1;\nreturn total;', 'int total = 2;\nreturn total;')
  assert.deepEqual(edited.filter((line) => line.kind !== 'context'), [
    { kind: 'added', text: 'int total = 2;' },
    { kind: 'deleted', text: 'int total = 1;' },
  ])
})

test('snapshot comparison detects additions, deletion, modification and stable revisions', () => {
  const before = new Map<string, SnapshotEntry>([
    ['src', entry('src', null)],
    ['src/A.java', entry('src/A.java', 'class A {}')],
    ['notes.txt', entry('notes.txt', 'old')],
  ])
  const after = new Map<string, SnapshotEntry>([
    ['src', entry('src', null)],
    ['src/A.java', entry('src/A.java', 'class A { int x; }')],
    ['src/B.java', entry('src/B.java', 'class B {}')],
  ])
  const changes = changedEntries(before, after)
  assert.deepEqual(changes.map(({ path, type, isJava }) => ({ path, type, isJava })), [
    { path: 'notes.txt', type: 'deleted', isJava: false },
    { path: 'src/A.java', type: 'modified', isJava: true },
    { path: 'src/B.java', type: 'added', isJava: true },
  ])
  assert.equal(changes[1].revision, changedEntries(before, after)[1].revision)
  assert.notEqual(changes[1].revision, changedEntries(after, before)[1].revision)
})

test('new parent directory is selected through its affected child', () => {
  const before = new Map<string, SnapshotEntry>()
  const after = new Map<string, SnapshotEntry>([
    ['pkg', entry('pkg', null)],
    ['pkg/C.java', entry('pkg/C.java', 'class C {}')],
  ])
  assert.deepEqual(changedEntries(before, after).map((change) => change.path), ['pkg/C.java'])
  assert.deepEqual(changedEntries(before, after, true).map((change) => change.path), ['pkg', 'pkg/C.java'])
})

test('Git staging excludes generated folders while including source changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lusiad-stage-'))
  try {
    execFileSync('git', ['init', '-q', root])
    await mkdir(join(root, 'src'))
    await mkdir(join(root, '.idea'))
    await mkdir(join(root, 'target'))
    await mkdir(join(root, '.lusiad-backup-fixture'))
    await mkdir(join(root, '.lusiad-sync-fixture'))
    await writeFile(join(root, '.lusiad-backup-fixture', 'Original.java'), 'recovery copy')
    await writeFile(join(root, '.lusiad-sync-fixture', '0.before'), 'synchronization recovery copy')
    await writeFile(join(root, 'src', 'A.java'), 'class A {}')
    await writeFile(join(root, '.idea', 'workspace.xml'), '<workspace/>')
    await writeFile(join(root, 'target', 'A.class'), 'binary')
    execFileSync('git', ['-C', root, 'add', ...GIT_STAGE_PATHSPEC])
    const staged = execFileSync('git', ['-C', root, 'diff', '--cached', '--name-only'], { encoding: 'utf8' }).trim().split(/\r?\n/)
    assert.deepEqual(staged, ['src/A.java'])
  } finally {
    const absoluteRoot = resolve(root)
    if (!absoluteRoot.startsWith(`${resolve(tmpdir())}${sep}`) || !absoluteRoot.split(sep).at(-1)?.startsWith('lusiad-stage-')) {
      throw new Error('Unsafe temporary directory')
    }
    await rm(absoluteRoot, { recursive: true, force: true })
  }
})
