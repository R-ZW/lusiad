import { translate, translatePlural, type AppLocale } from './core.ts'
import type { MessageKey } from './messages.ts'
import type { Change } from '@/lib/types'
import { readChangeMetadata, type ChangeElement, type ChangeSide } from '../models/change-history/change-metadata.ts'

function elementText(element: ChangeElement, locale: AppLocale): string {
  const label = translate(locale, `changeFacts.element.${element.kind}` as MessageKey)
  return element.name ? `${label} ${element.name}` : label
}
function location(side: ChangeSide, locale: AppLocale): string {
  const context = side.context.map(e => elementText(e, locale)).join(' → ')
  const lines = side.range ? translate(locale, side.range.startLine === side.range.endLine ? 'changeFacts.line' : 'changeFacts.lines',
    { start: side.range.startLine, end: side.range.endLine }) : null
  const unresolved = !side.range && !['file', 'directory'].includes(side.element.kind) ? translate(locale, 'changeFacts.unresolved') : null
  return [side.path, context, lines, unresolved].filter(Boolean).join(' · ')
}

/** One renderer for history, details and reference selection. */
export function generatedChangeText(body: unknown, locale: AppLocale): { title: string; description: string; fileName: string } | null {
  const metadata = readChangeMetadata(body)
  if (!metadata) return null
  if (metadata.kind === 'external') {
    const files = metadata.files ?? []
    const counts = (['added', 'modified', 'deleted'] as const).map(kind =>
      translatePlural(locale, `changeFacts.files.${kind}`, files.filter(f => f.kind === kind).length))
    return { title: translate(locale, 'sync.bundleTitle'), fileName: translate(locale, 'sync.project'),
      description: [translatePlural(locale, 'changeFacts.accepted', files.length), counts.join(' · '),
        ...files.map(f => `${translate(locale, `changeFacts.fileAction.${f.kind}`)}: ${f.path}`)].join('\n') }
  }
  const selected = metadata.after ?? metadata.before!
  const action = metadata.action.split('_').at(-1)!
  const difference = metadata.differences.length === 1 ? metadata.differences[0] : null
  const label = difference ? translate(locale, `changeFacts.difference.${difference.field}`) : translate(locale, `changeFacts.action.${action}` as MessageKey)
  const navigation = body && typeof body === 'object' && 'navigation' in body ? (body as { navigation?: { direction?: string } }).navigation : undefined
  const prefix = navigation?.direction === 'undo' ? translate(locale, 'undo.undo') : navigation?.direction === 'redo' ? translate(locale, 'undo.redo') : ''
  const title = (prefix ? prefix + ': ' : '') + translate(locale, 'changeFacts.title', { action: label, element: elementText(selected.element, locale) })
  const parts: string[] = []
  if (metadata.before) parts.push(translate(locale, 'changeFacts.before', { location: location(metadata.before, locale) }))
  if (metadata.after) parts.push(translate(locale, 'changeFacts.after', { location: location(metadata.after, locale) }))
  for (const d of metadata.differences) parts.push(translate(locale, 'changeFacts.values', {
    field: translate(locale, `changeFacts.difference.${d.field}`), before: d.before, after: d.after,
  }))
  return { title, description: parts.join('\n'), fileName: selected.path.split('/').at(-1) ?? selected.path }
}

/** No legacy conversion: records without valid presentation facts retain their literal text. */
export function localizeGeneratedChange(change: Change, locale: AppLocale): Change {
  const metadata = readChangeMetadata(change.reqBody)
  if (!metadata || metadata.action !== change.changeType) return change
  const text = generatedChangeText(change.reqBody, locale)!
  const userDescription = change.userDescription ?? change.description
  return { ...change, ...text, userDescription, description: [text.description, userDescription].filter(Boolean).join('\n') }
}
