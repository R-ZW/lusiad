import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { entry, same, reviewedSnapshot, planEntries, encodePlan, decodePlan, ownSnapshot, type SyncPlan } from '../src/lib/services/external-sync/sync-plan.ts'
import { snapshotProject, applyDiskPlan, compensateDiskPlan, cleanupDiskPlan } from '../src/lib/services/external-sync/sync-disk.ts'
import { changedEntries } from '../src/lib/services/external-sync/external-sync.model.ts'

const file = (path: string, text: string) => entry(path, 'file', Buffer.from(text))
const dir = (path: string) => entry(path, 'directory', null)
const snapshot = (...values: ReturnType<typeof entry>[]) => new Map(values.map(v => [v.path, v]))
const choices = (a: ReturnType<typeof snapshot>, b: ReturnType<typeof snapshot>, keep: (path: string) => boolean) => changedEntries(a, b).map(c => ({ ...c, keep: keep(c.path) }))

test('review validates the entire revision and preserves selected files/empty folders regardless of order', () => {
  const before = snapshot(file('Old.java', 'old'), dir('gone'), file('gone/Gone.java', 'removed'))
  const after = snapshot(file('Old.java', 'changed'), dir('pkg'), file('pkg/New.java', 'new Ω\r\n'), dir('empty'))
  const desired = reviewedSnapshot(before, after, choices(before, after, p => p !== 'Old.java').reverse())
  assert.deepEqual([...desired.keys()].sort(), ['Old.java', 'empty', 'pkg', 'pkg/New.java'])
  assert.equal(desired.get('Old.java')?.content?.toString(), 'old')
  assert.throws(() => reviewedSnapshot(before, after, [...choices(before, after, () => true), ...choices(before, after, () => true)]), /sync_revision_conflict/)
  const newer = snapshot(...after.values(), file('another.txt', 'arrived during review'))
  assert.throws(() => reviewedSnapshot(before, newer, choices(before, after, () => true)), /sync_revision_conflict/)
})

test('file/directory replacement and own mutation acknowledgement are structural, not a disk re-read', () => {
  const before = snapshot(file('pkg', 'old'))
  const after = snapshot(dir('pkg'), file('pkg/New.java', 'new'))
  const desired = reviewedSnapshot(before, after, choices(before, after, () => true))
  assert.equal(desired.get('pkg')?.kind, 'directory')
  const rejected = reviewedSnapshot(before, after, choices(before, after, () => false))
  assert.ok(same(rejected.get('pkg'), before.get('pkg')))
  const old = snapshot(dir('src'), file('src/A.java', 'known bytes'))
  const own = ownSnapshot(old, { kind: 'directory', source: 'src', destination: 'renamed' })
  const actual = snapshot(dir('renamed'), file('renamed/A.java', 'external race'))
  assert.deepEqual(changedEntries(own, actual).map(c => c.path), ['renamed/A.java'])
  assert.deepEqual(ownSnapshot(old, { kind: 'directory', source: 'src', destination: 'src' }), old)
})

async function lab(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'lusiad-sync-'))
  try { await run(root) } finally {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && root.split(sep).at(-1)!.startsWith('lusiad-sync-'))
    await rm(root, { recursive: true, force: true })
  }
}
const plan = (root: string, before: ReturnType<typeof snapshot>, after: ReturnType<typeof snapshot>): SyncPlan => ({ version: 1, id: randomUUID(), projectId: 1, root, kind: 'review', bundleId: null, entries: planEntries(after, before, after) })

test('disk review is resumable from a reserved original and never touches unrelated new content', () => lab(async root => {
  await writeFile(join(root, 'A.java'), 'external Ω\r\n')
  const before = await snapshotProject(root), after = snapshot(file('A.java', 'known\n'))
  const p = decodePlan(encodePlan(plan(root, before, after)), 1, root)
  await mkdir(join(root, `.lusiad-sync-${p.id}`))
  await rename(join(root, 'A.java'), join(root, `.lusiad-sync-${p.id}`, '0.before'))
  await writeFile(join(root, 'New.java'), 'arrived after review')
  await applyDiskPlan(p); await applyDiskPlan(p)
  assert.equal(await readFile(join(root, 'A.java'), 'utf8'), 'known\n')
  assert.equal(await readFile(join(root, 'New.java'), 'utf8'), 'arrived after review')
  assert.deepEqual([...await snapshotProject(root)].map(([p]) => p).sort(), ['A.java', 'New.java'])
  await cleanupDiskPlan(p)
}))

test('compensation restores an interrupted replacement and preserves a third state', () => lab(async root => {
  await writeFile(join(root, 'A.java'), 'original external')
  const before = await snapshotProject(root), after = snapshot(file('A.java', 'known'))
  const p = plan(root, before, after)
  await mkdir(join(root, `.lusiad-sync-${p.id}`)); await rename(join(root, 'A.java'), join(root, `.lusiad-sync-${p.id}`, '0.before'))
  await compensateDiskPlan(p)
  assert.equal(await readFile(join(root, 'A.java'), 'utf8'), 'original external')
  await cleanupDiskPlan(p)
  const next = plan(root, before, after)
  await applyDiskPlan(next)
  await writeFile(join(root, 'A.java'), 'new external after publication')
  await compensateDiskPlan(next)
  assert.equal(await readFile(join(root, 'A.java'), 'utf8'), 'new external after publication')
  // The external writer also changed the hard-linked staging inode. Retain it
  // rather than deleting an unknown postimage as though it were our own bytes.
  await assert.rejects(() => cleanupDiskPlan(next), /sync_recovery_conflict/)
}))

test('disk type replacement/rejection is ordered and refuses unreviewed children', () => lab(async root => {
  await mkdir(join(root, 'pkg')); await writeFile(join(root, 'pkg', 'A.java'), 'original')
  const before = await snapshotProject(root), after = snapshot(file('pkg', 'replacement'))
  const p = plan(root, before, after)
  await applyDiskPlan(p)
  assert.equal(await readFile(join(root, 'pkg'), 'utf8'), 'replacement')
  await compensateDiskPlan(p)
  assert.equal(await readFile(join(root, 'pkg', 'A.java'), 'utf8'), 'original')
  const next = plan(root, before, after)
  await writeFile(join(root, 'pkg', 'new.txt'), 'do not remove')
  await assert.rejects(() => applyDiskPlan(next))
  await compensateDiskPlan(next)
  assert.equal(await readFile(join(root, 'pkg', 'new.txt'), 'utf8'), 'do not remove')
}))

test('Windows case-only rename can be accepted and cancelled without aliasing two files', { skip: process.platform !== 'win32' }, () => lab(async root => {
  await mkdir(join(root, 'src')); await writeFile(join(root, 'src', 'A.java'), 'original')
  const baseline = await snapshotProject(root)
  await rename(join(root, 'src'), join(root, 'src-intermediate')); await rename(join(root, 'src-intermediate'), join(root, 'Src'))
  const current = await snapshotProject(root)
  const desired = reviewedSnapshot(baseline, current, choices(baseline, current, () => true))
  const accepted: SyncPlan = { version: 1, id: randomUUID(), projectId: 1, root, kind: 'review', bundleId: null, entries: planEntries(baseline, current, desired) }
  await applyDiskPlan(accepted)
  assert.ok((await snapshotProject(root)).has('Src/A.java'))
  const cancelled: SyncPlan = { ...accepted, id: randomUUID(), kind: 'discard', entries: planEntries(desired, current, baseline) }
  await applyDiskPlan(cancelled)
  assert.ok((await snapshotProject(root)).has('src/A.java'))
  assert.equal(await readFile(join(root, 'src', 'A.java'), 'utf8'), 'original')
  await cleanupDiskPlan(cancelled)
}))
