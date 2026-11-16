'use client'

import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronRight, ChevronDown, ChevronsUpDown, ChevronsDownUp, Folder, FolderOpen, FileCode, File, Lock, Plus, FolderPlus, Trash2, Search, X, Check, Pencil, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TutorialButton } from '@/components/tutorials/tutorial-provider'
import { Input } from '@/components/ui/input'
import { Feedback, EmptyState } from '@/components/ui/feedback'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'
import type { FileMutation } from '@/lib/models/model-editor/workspace-paths'
import { pathKey } from '@/lib/models/model-editor/workspace-paths'
import { javaBaseName, completeJavaName, validJavaBaseName } from '@/lib/models/file-explorer/file-kind'
import { revealFileController } from '@/controllers/file-explorer/file-preview.controller'
import { unwrapBackendAction } from '@/lib/services/backend-action-result'
import type { MutationGate } from '@/lib/models/model-editor/editor-session'
import type { FileNode } from '@/lib/types'
import { explorerView, relativeEntryPath, visibleEntries } from '@/lib/models/file-explorer/explorer-view'
import { useFileExplorerInteractions } from './file-explorer.interactions'
import { useI18n } from '@/lib/i18n/locale-provider'
import { toast } from '@/hooks/use-toast'

type HighlightTone = 'create' | 'delete' | 'rename' | 'move'
const HIGHLIGHT_TONE_CLASSES: Record<HighlightTone, string> = {
  create: 'diff-line diff-added', delete: 'diff-line diff-removed', rename: 'diff-line diff-moved', move: 'diff-line diff-moved',
}
interface FileExplorerProps {
  projectId: number; files: FileNode[]; repositoryPath: string; highlightedPath?: string | null
  highlightTone?: HighlightTone | null; readOnly?: boolean; onDoubleClick?: (node: FileNode) => void
  mutationGate?: MutationGate; onWorkingChange?: (busy: boolean) => void; onBackgroundError?: (message: string | null) => void
  onTreeChanged?: (mutation?: FileMutation) => Promise<void> | void
}

/** Explicit confirmation; blur never publishes a path mutation. */
function NameForm({ initial = '', kind, disabled, cancel, submit }: {
  initial?: string; kind: 'file' | 'folder' | 'rename'; disabled: boolean; cancel: () => void; submit: (name: string) => Promise<void>
}) {
  const { t } = useI18n()
  const [name, setName] = useState(initial)
  const suffixId = useId()
  const invalidJava = kind === 'file' && Boolean(name.trim()) && !validJavaBaseName(name)
  return <form className="flex min-w-0 flex-wrap items-center gap-1" onSubmit={event => { event.preventDefault(); if (!disabled && name.trim() && !invalidJava) void submit(kind === 'file' ? completeJavaName(name) : name) }}
    onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape' && !disabled) { event.preventDefault(); cancel() } }}>
    <div className="relative min-w-0 flex-1">
      <Input autoFocus data-testid={kind === 'rename' ? 'file-rename-input' : 'file-create-input'} aria-label={t(kind === 'rename' ? 'explorer.rename' : kind === 'file' ? 'explorer.newFile' : 'explorer.newFolder')}
        value={name} disabled={disabled} aria-invalid={invalidJava || undefined} aria-describedby={kind === 'file' ? suffixId : undefined} onChange={event => setName(kind === 'file' ? javaBaseName(event.target.value) : event.target.value)} className={cn('h-8 w-full text-sm', kind === 'file' && 'pr-14')} required
        placeholder={t(kind === 'rename' ? 'common.name' : kind === 'folder' ? 'explorer.newFolderPlaceholder' : 'explorer.javaBasePlaceholder')} />
      {kind === 'file' && <span id={suffixId} data-testid="file-create-suffix" className="pointer-events-none absolute inset-y-0 right-2 flex items-center border-l pl-2 font-mono text-xs text-muted-foreground">.java</span>}
    </div>
    <Button data-testid={kind === 'rename' ? 'file-rename-confirm' : 'file-create-confirm'} type="submit" variant="ghost" size="icon" className="size-8 shrink-0" disabled={disabled || !name.trim() || invalidJava} aria-label={t('common.confirm')} title={t('common.confirm')}><Check /></Button>
    <Button data-testid={kind === 'rename' ? 'file-rename-cancel' : 'file-create-cancel'} type="button" variant="ghost" size="icon" className="size-8 shrink-0" disabled={disabled} onClick={cancel} aria-label={t('common.cancel')} title={t('common.cancel')}><X /></Button>
    {invalidJava && <p data-testid="file-name-error" role="status" className="w-full text-xs text-destructive">{t('explorer.javaBaseHelp')}</p>}
  </form>
}

export function FileExplorer({ projectId, files, repositoryPath, highlightedPath, highlightTone, readOnly = false,
  onDoubleClick, onTreeChanged, mutationGate, onWorkingChange, onBackgroundError }: FileExplorerProps) {
  const { t, locale } = useI18n()
  const controls = useFileExplorerInteractions({ projectId, repositoryPath, files, readOnly, mutationGate, onWorkingChange, onBackgroundError, onTreeChanged, onOpenFile: onDoubleClick })
  const { selected, expanded, creating, isWorking, error, setSelected, toggleExpand, handleStartCreate, handleCancelCreate, handleSubmitCreate,
    handleDeleteSelected, handleRenameNode, handleDropNode, handleDoubleClickNode } = controls
  const [query, setQuery] = useState(''), [renaming, setRenaming] = useState<FileNode | null>(null), [deleting, setDeleting] = useState<FileNode | null>(null)
  const [nativeBusy, setNativeBusy] = useState(false)
  async function reveal(path: string) {
    if (nativeBusy) return
    setNativeBusy(true)
    try {
      const result = unwrapBackendAction(await revealFileController(projectId, path))
      toast({ duration: 4500, description: <span data-testid="file-native-status">{t(result.mode === 'parent' ? 'explorer.nativeParent' : 'explorer.nativeRequested')}</span> })
    } catch (error) {
      toast({ variant: 'destructive', duration: 6000, description: <span data-testid="file-native-status">{error instanceof Error ? error.message : t('explorer.nativeError')}</span> })
    }
    finally { setNativeBusy(false) }
  }
  async function copyRootPath() {
    try {
      await navigator.clipboard.writeText(repositoryPath)
      toast({ duration: 4500, description: <span data-testid="files-path-copy-status">{t('explorer.pathCopied')}</span> })
    } catch {
      toast({ variant: 'destructive', duration: 6000, description: <span data-testid="files-path-copy-status">{t('explorer.pathCopyError')}</span> })
    }
  }

  const [focused, setFocused] = useState<string | null>(null), [dropId, setDropId] = useState<string | null>(null)
  const treeRef = useRef<HTMLDivElement>(null), searchRef = useRef<HTMLInputElement>(null)
  const view = useMemo(() => explorerView(files, query, locale, repositoryPath), [files, query, locale, repositoryPath])
  useEffect(() => { if (renaming && !view.index.has(renaming.id)) setRenaming(null) }, [view.index, renaming])
  const openFolders = useMemo(() => new Set([...expanded, ...view.autoExpanded]), [expanded, view.autoExpanded])
  const visible = useMemo(() => visibleEntries(view.nodes, openFolders), [view.nodes, openFolders])
  const visibleSelected = selected && visible.some(node => node.id === selected.id) ? selected : null
  useEffect(() => { if (selected && !visibleSelected) setSelected(null) }, [selected, visibleSelected, setSelected])
  const highlighted = [...view.index.values()].find(node => node.path && highlightedPath && pathKey(node.path) === pathKey(highlightedPath))?.id
  const selectedId = selected?.id
  const rootName = repositoryPath.replaceAll('\\', '/').replace(/\/+$/, '').split('/').at(-1) || t('explorer.ui.root')
  const canMutate = !readOnly && !isWorking
  const editing = Boolean(creating || renaming)
  const focusId = visible.some(node => node.id === focused) ? focused : visible[0]?.id
  const rootNode: FileNode = { id: repositoryPath, path: repositoryPath, name: rootName, type: 'folder' }
  function clearSearch() { setQuery(''); searchRef.current?.focus() }
  function startCreate(kind: 'file' | 'folder', context?: FileNode | null) {
    if (!canMutate || editing) return
    setQuery(''); handleStartCreate(kind, context === undefined ? visibleSelected : context)
  }
  function startRename(node: FileNode) { if (canMutate && !editing) { controls.clearError(); setSelected(node); setRenaming(node) } }
  function askDelete(node: FileNode) { if (canMutate && !editing) { controls.clearError(); setSelected(node); setDeleting(node) } }
  function focusNode(id?: string) {
    if (!id) return
    const button = [...(treeRef.current?.querySelectorAll<HTMLButtonElement>('[data-testid=file-open]') ?? [])].find(el => el.dataset.entryId === id)
    button?.focus(); if (button) setSelected(view.index.get(id) ?? null)
  }
  function navigate(event: KeyboardEvent, node: FileNode) {
    if (editing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const index = visible.findIndex(item => item.id === node.id)
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); focusNode(visible[index + 1]?.id); break
      case 'ArrowUp': event.preventDefault(); focusNode(visible[index - 1]?.id); break
      case 'Home': event.preventDefault(); focusNode(visible[0]?.id); break
      case 'End': event.preventDefault(); focusNode(visible.at(-1)?.id); break
      case 'ArrowRight': event.preventDefault(); if (node.type === 'folder') { if (!openFolders.has(node.id)) toggleExpand(node.id); else focusNode(node.children?.[0]?.id) } break
      case 'ArrowLeft': event.preventDefault(); if (node.type === 'folder' && openFolders.has(node.id) && !query.trim()) toggleExpand(node.id); else focusNode(view.parents.get(node.id)); break
      case 'Enter': event.preventDefault(); if (node.type === 'folder') toggleExpand(node.id); else handleDoubleClickNode(node); break
      case 'F2': event.preventDefault(); startRename(node); break
      case 'Delete': event.preventDefault(); askDelete(node); break
    }
  }
  const dragAllowed = (event: DragEvent) => canMutate && !editing && event.dataTransfer.types.includes('application/x-file-node')
  function dragOver(event: DragEvent, id: string) { if (dragAllowed(event)) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; setDropId(id) } }
  async function drop(event: DragEvent, target: FileNode) {
    if (!dragAllowed(event)) return
    event.preventDefault(); event.stopPropagation(); setDropId(null)
    let source: FileNode | undefined
    try {
      const payload = JSON.parse(event.dataTransfer.getData('application/x-file-node'))
      source = typeof payload.id === 'string' ? view.index.get(payload.id) : undefined
      if (!source?.path || typeof payload.path !== 'string' || pathKey(source.path) !== pathKey(payload.path)) return
    } catch { return }
    if (source.id !== target.id) await handleDropNode(source, target)
  }
  function tool(id: string, label: string, icon: ReactNode, action: () => void, disabled = false) {
    return <Button key={id} data-testid={id} variant="ghost" size="icon" className="size-8 shrink-0" title={label} aria-label={label} onClick={action} disabled={disabled}>{icon}</Button>
  }
  // Both entry points use the same actions and permission checks.
  function entryActions(node: FileNode, context = false) {
    const Item = context ? ContextMenuItem : DropdownMenuItem
    const Separator = context ? ContextMenuSeparator : DropdownMenuSeparator
    const folder = node.type === 'folder'
    return <>
      <Item data-testid="file-reveal" disabled={!node.path || nativeBusy} onSelect={() => { if (node.path) void reveal(node.path) }}><FolderOpen />{t(folder ? 'explorer.nativeFolder' : 'explorer.nativeFile')}</Item>
      {!readOnly && folder && <><Item onSelect={() => startCreate('file', node)}><Plus />{t('explorer.newFile')}</Item><Item onSelect={() => startCreate('folder', node)}><FolderPlus />{t('explorer.newFolder')}</Item><Separator /></>}
      {!folder && <Item onSelect={() => handleDoubleClickNode(node)}><FileCode />{t('explorer.ui.open')}</Item>}
      {!readOnly && <><Item data-testid="file-action-rename" onSelect={() => startRename(node)}><Pencil />{t('explorer.rename')}</Item>
      <Item data-testid="file-action-delete" className="text-destructive" onSelect={() => askDelete(node)}><Trash2 />{t('explorer.delete')}</Item></>}
    </>
  }
  function renderNodes(nodes: FileNode[], level = 0): ReactNode {
    return nodes.map(node => {
      const folder = node.type === 'folder', open = openFolders.has(node.id), active = selectedId === node.id, marked = highlighted === node.id
      const path = relativeEntryPath(repositoryPath, node.path) || node.name
      const original = view.index.get(node.id) ?? node
      return <div key={node.id}>
        <ContextMenu onOpenChange={open => { if (open) setSelected(original) }}>
        <ContextMenuTrigger asChild disabled={isWorking || editing || nativeBusy}>
        <div data-testid="file-entry" data-file-path={node.path?.replaceAll('\\', '/')} data-relative-path={path} data-file-kind={node.type}
          data-selected={active} data-highlighted={marked} data-expanded={open} data-drag-over={dropId === node.id}
          draggable={canMutate && !editing} onDragStart={event => {
            if (!canMutate || editing) { event.preventDefault(); return }
            event.dataTransfer.setData('application/x-file-node', JSON.stringify({ id: node.id, path: node.path })); event.dataTransfer.effectAllowed = 'move'
          }} onDragEnd={() => setDropId(null)} onDragOver={event => dragOver(event, node.id)} onDragLeave={() => setDropId(null)} onDrop={event => { void drop(event, original) }}
          className={cn('group flex min-w-0 items-center rounded-md border border-transparent pr-1 hover:bg-accent/40',
            active && 'border-primary/25 bg-accent', marked && (highlightTone ? HIGHLIGHT_TONE_CLASSES[highlightTone] : 'bg-accent/60'), dropId === node.id && 'outline outline-1 outline-dashed outline-primary')}
          style={{ paddingLeft: `${level * 14 + 4}px` }}>
          {folder ? <button type="button" data-testid="folder-toggle" aria-label={t(open ? 'explorer.ui.collapse' : 'explorer.ui.expand', { name: node.name })} aria-expanded={open} disabled={editing} onClick={() => toggleExpand(node.id)} className="flex size-6 shrink-0 items-center justify-center rounded-sm hover:bg-accent">{open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</button> : <span className="w-6 shrink-0" />}
          {renaming?.id === node.id ? <div className="min-w-0 flex-1 py-1"><NameForm key={node.id} kind="rename" initial={renaming.name} disabled={!canMutate}
            cancel={() => setRenaming(null)} submit={async name => { if (await handleRenameNode(original, name)) setRenaming(null) }} /></div> : <button type="button" data-testid="file-open" data-entry-id={node.id}
            tabIndex={focusId === node.id ? 0 : -1} onFocus={() => setFocused(node.id)} onKeyDown={event => navigate(event, node)}
            onClick={() => setSelected(original)} onDoubleClick={() => { if (folder) { if (!editing) toggleExpand(node.id) } else handleDoubleClickNode(original) }}
            aria-label={path} aria-expanded={folder ? open : undefined} aria-current={active ? 'true' : undefined} title={path}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-sm py-2 text-left text-sm">
            {folder ? open ? <FolderOpen className="size-4 shrink-0 text-muted-foreground" /> : <Folder className="size-4 shrink-0 text-muted-foreground" /> : node.extension?.toLowerCase() === 'java' ? <FileCode className="size-4 shrink-0" /> : <File className="size-4 shrink-0 text-muted-foreground" />}
            <span className="truncate">{node.name}</span>
          </button>}
          {readOnly && <Lock aria-label={t('explorer.ui.readOnly')} className="mx-1 size-3 shrink-0 text-muted-foreground" />}
          {!renaming && <DropdownMenu>
            <DropdownMenuTrigger asChild><Button data-testid="file-actions" variant="ghost" size="icon" className="size-7 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100" disabled={isWorking || editing || nativeBusy} aria-label={t('explorer.ui.actions', { name: node.name })}><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" onCloseAutoFocus={event => { if (editing || deleting) event.preventDefault() }}>{entryActions(original)}</DropdownMenuContent>
          </DropdownMenu>}
        </div>
        </ContextMenuTrigger>
        <ContextMenuContent data-testid="file-context-menu" aria-label={t('explorer.ui.actions', { name: node.name })} onCloseAutoFocus={event => { if (editing || deleting) event.preventDefault() }}>{entryActions(original, true)}</ContextMenuContent>
        </ContextMenu>
        {folder && open && renderNodes(node.children ?? [], level + 1)}
      </div>
    })
  }
  return <div data-testid="file-explorer" data-readonly={readOnly} aria-busy={isWorking} onDrop={event => event.preventDefault()}
    onClick={event => {
      const target = event.target
      if (!(target instanceof Element) || !event.currentTarget.contains(target) ||
          target.closest('[data-testid=file-entry], button, a, input, textarea, form, [role=menu]')) return
      setSelected(null); setFocused(null)
      treeRef.current?.focus({ preventScroll: true })
    }} className="flex h-full min-h-0 flex-col bg-background">
    <header data-testid="files-header" className="flex shrink-0 items-center gap-1 border-b bg-muted/50 px-2 py-0.5 dark:bg-black/15">
      <div data-testid="files-name-bar" className="flex min-w-0 flex-1 items-center gap-1">
        {tool('files-reveal-root', t('explorer.nativeFolder'), <FolderOpen />, () => { void reveal(repositoryPath) }, nativeBusy || isWorking)}
        <button type="button" data-testid="files-root" title={repositoryPath} aria-label={t('explorer.copyPath', { name: rootName })} onClick={() => { void copyRootPath() }} onDragOver={event => dragOver(event, rootNode.id)} onDragLeave={() => setDropId(null)} onDrop={event => { void drop(event, rootNode) }}
          className={cn('min-w-0 flex-1 cursor-pointer bg-transparent px-1 py-1 text-left text-xs font-medium focus-visible:outline focus-visible:outline-1 focus-visible:outline-ring', dropId === rootNode.id && 'outline outline-1 outline-dashed outline-primary')}><span className="block truncate">{rootName}</span></button>
      </div>
      <div data-testid="files-operations" className="flex shrink-0 items-center">
        {!readOnly && <>{tool('file-create', t('explorer.newFile'), <Plus />, () => startCreate('file'), !canMutate || editing)}{tool('folder-create', t('explorer.newFolder'), <FolderPlus />, () => startCreate('folder'), !canMutate || editing)}{tool('file-rename', t('explorer.rename'), <Pencil />, () => { if (visibleSelected) startRename(visibleSelected) }, !visibleSelected || !canMutate || editing)}{tool('file-delete', t('explorer.delete'), <Trash2 />, () => { if (visibleSelected) askDelete(visibleSelected) }, !visibleSelected || !canMutate || editing)}</>}
        {readOnly && <span className="flex items-center gap-1 rounded border px-2 py-1 text-xs text-muted-foreground" title={t('explorer.ui.lockedHelp')}><Lock className="size-3" />{t('explorer.ui.readOnly')}</span>}
      </div>
      <TutorialButton tutorial="files" />
    </header>
    {creating && <div className="shrink-0 space-y-2 border-b bg-muted/20 p-3"><p data-testid="file-create-destination" className="break-all text-xs text-muted-foreground">{t('explorer.ui.destination', { path: relativeEntryPath(repositoryPath, creating.parentPath) || t('explorer.ui.root') })}</p>
      <NameForm key={creating.parentPath + creating.type} kind={creating.type} disabled={!canMutate} cancel={handleCancelCreate} submit={handleSubmitCreate} /></div>}
    {error && !deleting && <Feedback data-testid="file-error" tone="error" className="m-3 max-h-36 shrink-0 overflow-auto text-xs">{error}</Feedback>}
    <nav data-testid="files-tree" ref={treeRef} tabIndex={-1} aria-label={t('drawers.fileExplorer')} className="min-h-0 flex-1 overflow-auto px-2 py-2">
      {renderNodes(view.nodes)}
      {!view.nodes.length && <EmptyState className="px-3 py-8 text-xs" icon={<Folder />}><p>{t(query.trim() ? 'explorer.ui.noMatches' : 'explorer.empty')}</p>{query && <Button variant="outline" size="sm" onClick={clearSearch}>{t('projects.overview.clearSearch')}</Button>}</EmptyState>}
    </nav>
    <footer data-testid="files-search-tools" className="flex shrink-0 items-center gap-1 border-t bg-muted/50 px-3 py-2 dark:bg-black/15">
      <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input data-testid="files-search" ref={searchRef} value={query} disabled={editing} onChange={event => setQuery(event.target.value)} aria-label={t('explorer.ui.search')} className="h-8 pl-7 pr-8 text-sm" />
        {query && <Button data-testid="files-search-clear" variant="ghost" size="icon" className="absolute right-0 top-0 size-8" onClick={clearSearch} aria-label={t('projects.overview.clearSearch')} disabled={editing}><X /></Button>}</div>
      {tool('files-expand-all', t('explorer.expandAll'), <ChevronsUpDown />, () => controls.handleExpandAll(files), editing)}
      {tool('files-collapse-all', t('explorer.collapseAll'), <ChevronsDownUp />, controls.handleCollapseAll, editing || Boolean(query.trim()))}
    </footer>
    <Dialog open={Boolean(deleting)} onOpenChange={open => { if (!open && !isWorking) setDeleting(null) }}><DialogContent data-testid="file-delete-dialog" showCloseButton={!isWorking}>
      <DialogHeader><DialogTitle>{t('explorer.ui.deleteTitle')}</DialogTitle><DialogDescription>{t(deleting?.type === 'folder' ? 'explorer.ui.deleteFolder' : 'explorer.ui.deleteFile')}</DialogDescription></DialogHeader>
      <p className="break-all rounded-md border bg-muted/30 p-3 font-mono text-xs">{deleting?.path && relativeEntryPath(repositoryPath, deleting.path)}</p>
      {error && <Feedback data-testid="file-delete-error" tone="error">{error}</Feedback>}
      <DialogFooter><Button variant="outline" data-testid="file-delete-cancel" disabled={isWorking} onClick={() => setDeleting(null)}>{t('common.cancel')}</Button><Button variant="destructive" data-testid="file-delete-confirm" disabled={!canMutate || !deleting} onClick={() => { if (deleting) void handleDeleteSelected(deleting).then(ok => { if (ok) setDeleting(null) }) }}>{t('explorer.delete')}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>
}
