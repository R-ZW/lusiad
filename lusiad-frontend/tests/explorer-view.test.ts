import assert from 'node:assert/strict'
import test from 'node:test'
import { explorerView, relativeEntryPath, visibleEntries } from '../src/lib/models/file-explorer/explorer-view.ts'
import type { FileNode } from '../src/lib/types.ts'
const tree: FileNode[] = [
  { id: 'f10', name: 'A10.java', type: 'file', path: 'D:/repo/A10.java' },
  { id: 'src', name: 'src', type: 'folder', path: 'D:/repo/src', children: [
    { id: 'main', name: 'Main.java', type: 'file', path: 'D:/repo/src/Main.java' },
    { id: 'doc', name: 'Árvore.txt', type: 'file', path: 'D:/repo/src/Árvore.txt' },
  ] },
  { id: 'f2', name: 'A2.java', type: 'file', path: 'D:/repo/A2.java' },
]
test('folder-first natural ordering never mutates the source tree', () => {
  const before = JSON.stringify(tree), view = explorerView(tree, '', 'pt-BR', 'D:/repo')
  assert.deepEqual(view.nodes.map(n => n.id), ['src', 'f2', 'f10'])
  assert.deepEqual([view.fileCount, view.folderCount], [4, 1])
  assert.equal(JSON.stringify(tree), before)
  assert.equal(view.index.get('src'), tree[1])
})
test('search preserves ancestors and opens result paths without changing manual expansion', () => {
  const view = explorerView(tree, 'ARVORE', 'pt-BR', 'D:/repo')
  assert.deepEqual(view.nodes.map(n => n.id), ['src'])
  assert.deepEqual(view.nodes[0].children?.map(n => n.id), ['doc'])
  assert.equal(view.matches, 1)
  assert.equal(view.parents.get('doc'), 'src')
  assert.deepEqual(visibleEntries(view.nodes, view.autoExpanded).map(n => n.id), ['src', 'doc'])
  assert.equal(explorerView(tree, 'not present', 'en', 'D:/repo').nodes.length, 0)
})
test('display paths handle Windows roots/case, UNC, POSIX case and root itself', () => {
  assert.equal(relativeEntryPath('D:\\repo', 'd:/REPO/src/Main.java'), 'src/Main.java')
  assert.equal(relativeEntryPath('D:/', 'd:/Main.java'), 'Main.java')
  assert.equal(relativeEntryPath('\\\\host\\share', '//HOST/share/Main.java'), 'Main.java')
  assert.equal(relativeEntryPath('/repo', '/REPO/A.java'), '/REPO/A.java')
  assert.equal(relativeEntryPath('/repo', '/repo'), '')
  assert.equal(relativeEntryPath('/', '/A.java'), 'A.java')
})
