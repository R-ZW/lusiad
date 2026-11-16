'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronsUpDown, GitBranch, GitCommitHorizontal, Hash, History, Loader2, Tag, Funnel, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { searchComparisonOptionsController } from '@/controllers/model-comparison/model-comparison.controller'
import { useI18n } from '@/lib/i18n/locale-provider'
import { generatedChangeText } from '@/lib/i18n/change-text'
import { directComparisonOption, matchesComparisonOption, type ComparisonFilter, type ComparisonOption } from '@/lib/services/model-comparison/comparison-reference.model'
import { cn } from '@/lib/utils'

const filters: ComparisonFilter[] = ['all', 'commit', 'change', 'branch', 'tag']
const icons = { commit: GitCommitHorizontal, change: History, branch: GitBranch, tag: Tag, version: Tag, sha: Hash, empty: History }

function ReferenceText({ option, compact = false }: { option: ComparisonOption; compact?: boolean }) {
  const { t, dateTime, changeTextLocale } = useI18n()
  const label = option.kind === 'change' ? generatedChangeText(option.changeBody, changeTextLocale)?.title ?? option.label : option.label
  const id = option.value.slice(option.value.indexOf(':') + 1)
  const kind = t(`comparison.refKind.${option.kind}`)
  const target = option.targetRef ? directComparisonOption(option.targetRef) : null
  const details = [
    option.kind === 'commit' || option.kind === 'change' ? `${kind} #${id}` : kind,
    option.commitId ? `${t('comparison.refKind.commit')} #${option.commitId}` : '',
    target ? `${t(`comparison.refKind.${target.kind}`)} #${target.value.slice(target.value.indexOf(':') + 1)}` : '',
    option.branchName,
    option.sha && option.kind !== 'change' ? option.sha.slice(0, 8) : '',
    option.timestamp ? dateTime(option.timestamp) : '',
  ].filter(Boolean).join(' · ')
  const subtitle = [kind, option.branchName, option.sha && option.kind !== 'change' ? option.sha.slice(0, 8) : '', option.timestamp ? dateTime(option.timestamp) : ''].filter(Boolean).join(' · ')
  const external = option.changeType === 'external_bundle' && option.commitId ? t('comparison.externalCommitHint', { commitId: option.commitId }) : ''
  const title = [label, details, external].filter(Boolean).join('\n')
  return <span className="min-w-0 flex-1 text-left" title={title}>
    <span className="flex min-w-0 items-center gap-1.5"><span className="block min-w-0 flex-1 truncate text-xs font-medium">{option.kind === 'empty' ? t('comparison.emptyState') : label}</span>
      {compact && external && <span className="shrink-0 diff-text-modified"><RefreshCw className="size-3" /><span className="sr-only">{external}</span></span>}
    </span>
    {!compact && <span className="block truncate text-[10px] text-muted-foreground">{subtitle}</span>}
    {!compact && external && <span className="block whitespace-normal text-xs diff-text-modified">{external}</span>}
  </span>
}

export function ReferencePicker({ projectId, label, value, onChange, disabled, side, compact = false }: {
  projectId: number; label: string; value: string; onChange: (value: string) => void; disabled?: boolean; side: 'base' | 'target'; compact?: boolean
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<ComparisonFilter>('all')
  const [options, setOptions] = useState<ComparisonOption[]>([])
  const [selected, setSelected] = useState<ComparisonOption | null>(null)
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const requestId = useRef(0)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const id = ++requestId.current
    setLoading(true)
    setOptions([])
    setNextOffset(null)
    setError(false)
    const timer = window.setTimeout(() => {
      void searchComparisonOptionsController(projectId, { query, kind })
        .then((page) => {
          if (cancelled || requestId.current !== id) return
          setOptions(page.options)
          setNextOffset(page.nextOffset)
        })
        .catch(() => { if (!cancelled && requestId.current === id) setError(true) })
        .finally(() => { if (!cancelled && requestId.current === id) setLoading(false) })
    }, query ? 250 : 0)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [open, query, kind, projectId, retry])

  // References selected from the history may be older than the first search page.
  useEffect(() => {
    if (!value || value === 'empty' || (selected?.value === value && (selected.kind !== 'change' || selected.changeType))) return
    let cancelled = false
    void searchComparisonOptionsController(projectId, { query: value })
      .then((page) => { if (!cancelled) setSelected(page.options.find((option) => option.value === value) ?? null) })
      .catch(() => { /* The reference itself remains usable if its label cannot be loaded. */ })
    return () => { cancelled = true }
  }, [projectId, value, selected?.value, selected?.kind, selected?.changeType])

  const current = selected?.value === value ? selected : directComparisonOption(value)
  const direct = directComparisonOption(query)
  const emptyOption: ComparisonOption = { value: 'empty', kind: 'empty', label: t('comparison.emptyState') }
  const Icon = icons[current?.kind ?? 'empty']
  const select = (option: ComparisonOption) => {
    setSelected(option)
    onChange(option.value)
    requestId.current++
    setOpen(false)
    setQuery('')
  }
  const loadMore = async () => {
    if (nextOffset === null || loading) return
    const id = requestId.current
    setLoading(true)
    setError(false)
    try {
      const page = await searchComparisonOptionsController(projectId, { query, kind, offset: nextOffset })
      if (id !== requestId.current) return
      setOptions((previous) => [...previous, ...page.options.filter((option) => !previous.some((item) => item.value === option.value))])
      setNextOffset(page.nextOffset)
    } catch {
      if (id === requestId.current) setError(true)
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }

  return <div className={cn('min-w-0 flex-1', compact ? 'flex items-center gap-2' : 'space-y-1')}>
    <span className={cn('text-[11px] font-medium text-muted-foreground', compact && 'w-9 shrink-0')}>{label}</span>
    <Popover open={open} onOpenChange={(next) => { if (!next) requestId.current++; setOpen(next) }}>
      <PopoverTrigger asChild>
        <Button data-testid="reference-picker" data-side={side} data-reference={value} type="button" variant="outline" role="combobox" aria-expanded={open}
          aria-label={`${label}: ${current?.kind === 'empty' ? t('comparison.emptyState') : current?.label || value || t('comparison.chooseSaved')}`}
          disabled={disabled} className={cn('min-w-0 w-full justify-start gap-2 px-2.5', compact ? 'h-8 min-h-8 flex-1 py-1' : 'h-auto min-h-12 py-2')}>
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {current ? <ReferenceText option={current} compact={compact} /> : <span className="flex-1 truncate text-left text-xs text-muted-foreground">{value || t('comparison.chooseSaved')}</span>}
          <ChevronsUpDown className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent data-testid="reference-options" data-side={side} aria-busy={loading} align="start" side="left" className="z-(--ui-menu) p-0" style={{ width: 'min(420px, calc(100vw - 2rem))' }}>
        <Command shouldFilter={false}>
          <div className="flex items-center gap-1 border-b bg-muted/50 pr-2 dark:bg-black/15">
            <div className="min-w-0 flex-1 [&_[data-slot=command-input-wrapper]]:border-0">
              <CommandInput data-testid="reference-search" value={query} onValueChange={(next) => { requestId.current++; setQuery(next) }} maxLength={200}
                className="h-9 text-xs" placeholder={t('comparison.searchReferences')} aria-label={t('comparison.searchReferences')} />
            </div>
            <DropdownMenu><DropdownMenuTrigger asChild>
              <Button data-testid="reference-filters" type="button" variant={kind === 'all' ? 'outline' : 'secondary'} size="icon" className="relative size-7 shrink-0"
                title={`${t('comparison.filterReferences')}: ${t(`comparison.filter.${kind}`)}`} aria-label={t('comparison.filterReferences')} aria-pressed={kind !== 'all'}>
                <Funnel className="size-3.5" />{kind !== 'all' && <span className="absolute right-1 top-1 size-1 rounded-full bg-primary" />}
              </Button>
            </DropdownMenuTrigger><DropdownMenuContent data-testid="reference-filter-menu" align="end">
              <DropdownMenuRadioGroup value={kind} onValueChange={next => { requestId.current++; setKind(next as ComparisonFilter) }}>
                {filters.map(filter => <DropdownMenuRadioItem data-testid="reference-filter" data-kind={filter} key={filter} value={filter}>{t(`comparison.filter.${filter}`)}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent></DropdownMenu>
          </div>
          <CommandList className="max-h-[min(360px,55vh)]" label={t('comparison.referenceResults')}>
            <CommandGroup>
              {options.map((option) => {
                const OptionIcon = icons[option.kind]
                return <CommandItem data-testid="reference-option" data-reference={option.value} key={option.value} value={option.value} onSelect={() => select(option)} className="gap-2 py-2">
                  <OptionIcon className="h-3.5 w-3.5" /><ReferenceText option={option} />
                  <Check className={cn('h-3.5 w-3.5 shrink-0', option.value === value ? 'opacity-100' : 'opacity-0')} />
                </CommandItem>
              })}
            </CommandGroup>
            {loading && <p role="status" className="flex items-center justify-center gap-2 p-4 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />{t('comparison.searchingReferences')}</p>}
            {!loading && !error && options.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">{t('comparison.noReferences')}</p>}
            {error && <div className="p-3 text-center text-xs"><p role="alert" className="mb-2 text-destructive">{t('comparison.searchError')}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => nextOffset !== null ? void loadMore() : setRetry((previous) => previous + 1)}>{t('comparison.retrySearch')}</Button></div>}
            {!loading && !error && nextOffset !== null && <Button type="button" variant="ghost" size="sm" className="w-full"
              data-testid="reference-more" onClick={() => void loadMore()}>{t('comparison.loadMoreReferences')}</Button>}
            <CommandSeparator />
            <CommandGroup>
              {direct && direct.kind !== 'empty' && !options.some((option) => option.value === direct.value) &&
                <CommandItem data-testid="reference-option" data-reference={direct.value} value={`direct:${direct.value}`} onSelect={() => select(direct)} className="text-xs">
                  <Hash className="h-3.5 w-3.5" />{t('comparison.useReference')} <code className="truncate">{direct.value}</code>
                </CommandItem>}
              {matchesComparisonOption(emptyOption, query) && <CommandItem data-testid="reference-option" data-reference="empty" value="empty" onSelect={() => select(emptyOption)} className="text-xs">
                <History className="h-3.5 w-3.5" />{t('comparison.emptyState')}
              </CommandItem>}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  </div>
}
