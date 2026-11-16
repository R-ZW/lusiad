import type { FileNode } from '../../types.ts'

export function relativeEntryPath(root: string, path?: string): string {
  const base = root.replaceAll('\\', '/').replace(/\/+$/, ''), file = (path ?? '').replaceAll('\\', '/')
  const compare = (value: string) => /^(?:[a-z]:[\\/]|[\\/]{2})/i.test(root) ? value.toLowerCase() : value
  return compare(file) === compare(base) ? '' : compare(file).startsWith(compare(base) + '/') ? file.slice(base.length + 1) : file
}

/** Presentation only: original IDs/paths and input arrays are never mutated. */
export function explorerView(files: FileNode[], query: string, locale: string, root: string) {
  const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean)
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' })
  const autoExpanded = new Set<string>(), parents = new Map<string, string>(), index = new Map<string, FileNode>()
  let fileCount = 0, folderCount = 0, matches = 0
  function walk(nodes: FileNode[], parent?: string, inherited = false): FileNode[] {
    const result: FileNode[] = []
    for (const node of nodes) {
      index.set(node.id, node); if (parent) parents.set(node.id, parent)
      if (node.type === 'folder') folderCount++; else fileCount++
      const text = normalize(node.name + '\n' + relativeEntryPath(root, node.path))
      const match = terms.length > 0 && terms.every(term => text.includes(term))
      if (match) matches++
      const children = walk(node.children ?? [], node.id, inherited || match)
      if (!terms.length || match || inherited || children.length) {
        if (terms.length && node.type === 'folder') autoExpanded.add(node.id)
        result.push({ ...node, ...(node.children ? { children } : {}) })
      }
    }
    return result.sort((a, b) => Number(b.type === 'folder') - Number(a.type === 'folder') || collator.compare(a.name, b.name) || a.id.localeCompare(b.id))
  }
  return { nodes: walk(files), autoExpanded, parents, index, fileCount, folderCount, matches }
}

export function visibleEntries(nodes: FileNode[], expanded: Set<string>): FileNode[] {
  return nodes.flatMap(node => [node, ...(node.type === 'folder' && expanded.has(node.id) ? visibleEntries(node.children ?? [], expanded) : [])])
}
