"use client"

import { TutorialButton } from '@/components/tutorials/tutorial-provider'

import { useId, useMemo, useRef, useState } from "react"
import { Blocks, CornerUpLeft, FileCode, GripVertical, Layers3, MessageSquareMore, PackageOpen, Pin, Route, RotateCcw, Search, ShieldAlert, X } from "lucide-react"
import { useComponentsPanelInteractions } from "./components-panel.interactions"
import { LibraryCodePreview } from "./library-code-preview"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/feedback"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n/locale-provider"
import type { MessageKey } from "@/lib/i18n/messages"
import { filterLibrarySnippetsModel, type LibrarySnippet, type LibrarySnippetGroup } from "@/lib/models/model-editor/components-panel.model"

const CATEGORY_ICONS = {
  blocks: Blocks, layers3: Layers3, route: Route, "rotate-ccw": RotateCcw, "file-code": FileCode,
  "shield-alert": ShieldAlert, "package-open": PackageOpen, "message-square-more": MessageSquareMore, "corner-up-left": CornerUpLeft,
} as const

function ComponentCard({ snippet, pinned, ready, source, onFavorite, onDragStart }: {
  snippet: LibrarySnippet; pinned: boolean; ready: boolean; source: 'catalogue' | 'favorites'
  onFavorite: () => void; onDragStart: (event: React.DragEvent<HTMLDivElement>, snippet: LibrarySnippet) => void
}) {
  const { t } = useI18n()
  const contextId = useId()
  const label = t(`library.snippet.${snippet.id}` as MessageKey)
  const context = t(`library.context.${snippet.context}` as MessageKey)
  const favoriteLabel = t(pinned ? 'library.unpin' : 'library.pin', { name: label })

  return <div data-testid="library-component" data-component-id={snippet.id} data-library-source={source} data-favorite={pinned}
    role="group" aria-label={label} aria-describedby={contextId} draggable
    onDragStart={event => {
      if (event.target instanceof Element && event.target.closest('[data-library-action]')) {
        event.preventDefault()
        return
      }
      onDragStart(event, snippet)
    }}
    className="min-w-0 cursor-grab rounded-lg border border-border bg-background p-2 shadow-xs transition-colors hover:border-muted-foreground/50 active:cursor-grabbing">
    <span id={contextId} hidden>{context}</span>
    <div className="flex items-center gap-2">
      <GripVertical aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span title={context} className="min-w-0 flex-1 break-words text-xs font-semibold leading-tight">{label}</span>
      <Button data-testid="library-favorite" data-library-action="true" type="button" variant="ghost" size="icon" draggable={false}
        disabled={!ready} aria-label={favoriteLabel} aria-pressed={pinned} title={favoriteLabel} onClick={onFavorite}
        className={cn('size-8 shrink-0 text-muted-foreground hover:text-foreground', pinned && 'text-foreground')}>
        <Pin aria-hidden="true" className={cn('size-4', pinned && 'fill-current')} />
      </Button>
    </div>
    <LibraryCodePreview code={snippet.content} label={t('creation.code')} />
  </div>
}

function CategoryLabel({ group }: { group: LibrarySnippetGroup }) {
  const { t } = useI18n()
  const Icon = CATEGORY_ICONS[group.category.icon as keyof typeof CATEGORY_ICONS] ?? Blocks

  return <>
    <span aria-hidden="true" className="shrink-0 text-muted-foreground"><Icon className="size-4" /></span>
    <span className="min-w-0 flex-1 break-words text-left">{t(`library.category.${group.category.id}` as MessageKey)}</span>
    <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">{group.snippets.length}</span>
  </>
}

export function ComponentsPanel() {
  const { t } = useI18n()
  const { groups: catalogue, handleDragStart, favoriteIds, favoritesReady, toggleFavorite } = useComponentsPanelInteractions()
  const [scope, setScope] = useState('catalogue')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState('')
  const searchInput = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const favoritesTab = useRef<HTMLButtonElement>(null)
  const searching = !!query.trim()
  const groups = useMemo(() => searching ? filterLibrarySnippetsModel(query) : catalogue, [catalogue, query, searching])
  const matches = groups.flatMap(group => group.snippets)
  const favorites = favoriteIds.flatMap(id => matches.filter(snippet => snippet.id === id))

  const search = (value: string) => {
    setQuery(value)
    list.current?.scrollTo(0, 0)
  }

  const clearSearch = () => {
    search('')
    searchInput.current?.focus()
  }

  const card = (snippet: LibrarySnippet, source: 'catalogue' | 'favorites') => {
    const pinned = favoriteIds.includes(snippet.id)
    return <ComponentCard key={snippet.id} snippet={snippet} source={source} pinned={pinned} ready={favoritesReady}
      onFavorite={() => {
        toggleFavorite(snippet.id)
        if (source === 'favorites' && pinned) favoritesTab.current?.focus()
      }}
      onDragStart={handleDragStart} />
  }

  return <aside data-testid="library" aria-label={t('editor.library')} data-favorites-ready={favoritesReady}
    className="h-full min-h-0 bg-background">
    <Tabs value={scope} onValueChange={value => {
      setScope(value)
      list.current?.scrollTo(0, 0)
    }} className="h-full min-h-0 gap-0">
      <header data-testid="library-header" className="shrink-0 space-y-2 border-b border-border bg-muted/35 p-2.5">
        <div className="flex items-center gap-1"><TabsList aria-label={t('editor.library')} className="grid min-w-0 flex-1 grid-cols-2 overflow-hidden">
          <TabsTrigger value="catalogue" data-testid="library-catalogue-tab" className="min-w-0 px-1 text-xs">
            <Blocks aria-hidden="true" className="size-3.5" /><span className="truncate">{t('library.catalogue')}</span>
          </TabsTrigger>
          <TabsTrigger ref={favoritesTab} value="favorites" data-testid="library-favorites-tab" className="min-w-0 px-1 text-xs">
            <Pin aria-hidden="true" className="size-3.5" /><span className="truncate">{t('library.favorites')}</span>
            <span data-testid="library-favorites-count" className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {favoritesReady ? favoriteIds.length : '—'}
            </span>
          </TabsTrigger>
        </TabsList><TutorialButton tutorial="library" /></div>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input ref={searchInput} data-testid="library-search" aria-label={t('library.search')} placeholder={t('library.search')} value={query}
            onChange={event => search(event.target.value)} onKeyDown={event => {
              if (event.key === 'Escape' && query) {
                event.preventDefault()
                event.stopPropagation()
                clearSearch()
              }
            }} className="h-9 bg-background pl-8 pr-8 text-xs" />
          {query && <Button type="button" variant="ghost" size="icon" data-testid="library-search-clear" aria-label={t('library.clearSearch')}
            onClick={clearSearch} className="absolute inset-y-0 right-0 size-9"><X className="size-4" /></Button>}
        </div>
      </header>
      <div ref={list} data-testid="library-list" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2.5">
        <TabsContent value="catalogue" className="focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          {!groups.length ? <EmptyState data-testid="library-empty" icon={<Search />} className="text-xs">{t('library.noResults')}</EmptyState>
            : searching ? <div className="space-y-4">
              {groups.map(group => <section key={group.category.id} data-category-id={group.category.id}>
                <h3 className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold"><CategoryLabel group={group} /></h3>
                <div className="space-y-2">{group.snippets.map(snippet => card(snippet, 'catalogue'))}</div>
              </section>)}
            </div> : <Accordion type="single" collapsible value={expanded} onValueChange={setExpanded}>
              {catalogue.map(group => {
                const help = t(`library.categoryHelp.${group.category.id}` as MessageKey)
                return <AccordionItem data-category-id={group.category.id} key={group.category.id} value={group.category.id}>
                  <AccordionTrigger title={help} aria-description={help}
                    className="items-center gap-2 px-2 py-2.5 text-xs font-semibold hover:bg-muted/50 hover:no-underline data-[state=open]:bg-muted/40 [&>svg]:translate-y-0">
                    <CategoryLabel group={group} />
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 py-2">{group.snippets.map(snippet => card(snippet, 'catalogue'))}</AccordionContent>
                </AccordionItem>
              })}
            </Accordion>}
        </TabsContent>
        <TabsContent value="favorites" data-category-id="favorites" className="space-y-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          {!favoritesReady ? <p role="status" className="px-2 py-3 text-center text-xs text-muted-foreground">{t('common.loading')}</p>
            : !favoriteIds.length ? <EmptyState data-testid="library-favorites-empty" icon={<Pin />} className="text-xs">
              <p className="font-medium text-foreground">{t('library.noFavorites')}</p>
              <p>{t('library.favoritesHelp')}</p>
            </EmptyState> : !favorites.length ? <EmptyState data-testid="library-empty" icon={<Search />} className="text-xs">{t('library.noResults')}</EmptyState>
              : favorites.map(snippet => card(snippet, 'favorites'))}
        </TabsContent>
      </div>
    </Tabs>
  </aside>
}
