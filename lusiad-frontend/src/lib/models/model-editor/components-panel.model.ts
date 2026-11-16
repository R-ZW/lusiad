import type { LibraryDragPayload } from './model-editor-dnd.model.ts'
import { buildComponentSource, initialAttributes, type LibraryComponentId } from './component-creation.model.ts'
import { en, ptBR, type MessageKey } from '../../i18n/messages.ts'

export type ComponentContext = 'declaration' | 'member' | 'constructor' | 'statement' | 'loop' | 'break' | 'yield' | 'organization' | 'any'
export interface LibrarySnippet {
  id: LibraryComponentId; label: string; formalName: string; content: string; categoryId: string
  context: ComponentContext; aliases: string
}
export interface LibrarySnippetCategory { id: string; label: string; icon: string }
export interface LibrarySnippetGroup { category: LibrarySnippetCategory; snippets: LibrarySnippet[] }
type Entry = [LibraryComponentId, string, string, string?, ComponentContext?]
const group = (id: string, label: string, icon: string, context: ComponentContext, entries: Entry[]): LibrarySnippetGroup => ({
  category: { id, label, icon },
  snippets: entries.map(([componentId, label, formalName, aliases = '', override]) => ({
    id: componentId, label, formalName, aliases, categoryId: id, context: override ?? context,
    content: buildComponentSource(componentId, initialAttributes(componentId)),
  })),
})

// Source/defaults belong to the shared creation contract; the catalogue only organizes them.
const GROUPS = [
  group('declarations', 'Tipos', 'blocks', 'declaration', [
    ['class-declaration', 'Classe', 'Class Declaration'],
    ['interface-declaration', 'Interface', 'Interface Declaration'],
    ['enum-declaration', 'Enum', 'Enum Declaration'],
    ['record-declaration', 'Record', 'Record Declaration'],
    ['annotation-declaration', 'Declaração de anotação', 'Annotation Declaration', '@interface annotation'],
  ]),
  group('members', 'Membros', 'layers3', 'member', [
    ['field-declaration', 'Atributo', 'Field Declaration'],
    ['constructor-declaration', 'Construtor', 'Constructor Declaration', 'constructor', 'constructor'],
    ['method-declaration', 'Método', 'Method Declaration'],
    ['static-initializer', 'Inicializador estático', 'Static Initializer', 'static initializer'],
    ['instance-initializer', 'Inicializador de instância', 'Instance Initializer', 'instance initializer'],
  ]),
  group('statements', 'Instruções', 'file-code', 'statement', [
    ['variable-declaration', 'Variável local', 'Variable Declaration'],
    ['method-call', 'Chamada de método', 'Expression Statement', 'call invocation chamada'],
    ['expression-statement', 'Expressão / atribuição', 'Expression Statement', 'assignment atribuição incremento decremento ++ -- ='],
  ]),
  group('control-flow', 'Condições e controle', 'route', 'statement', [
    ['if-else', 'If / else', 'If Statement'],
    ['switch-case', 'Switch / case', 'Switch Statement', 'switch expression return yield'],
    ['synchronized-statement', 'Synchronized', 'Synchronized Statement', 'synchronized lock monitor sincronização'],
    ['assert-statement', 'Assert', 'Assert Statement', 'assert assertion asserção'],
  ]),
  group('loops', 'Laços', 'rotate-ccw', 'statement', [
    ['for-loop', 'For', 'For Statement'],
    ['foreach-loop', 'For-each', 'Foreach Statement', 'foreach enhanced for iterável iterable'],
    ['while-loop', 'While', 'While Statement'],
    ['do-while-loop', 'Do / while', 'Do While Statement'],
  ]),
  group('jumps', 'Retorno e desvios', 'corner-up-left', 'statement', [
    ['return-statement', 'Return', 'Return Statement'],
    ['break-statement', 'Break', 'Break Statement', 'break label rótulo', 'break'],
    ['continue-statement', 'Continue', 'Continue Statement', 'continue label rótulo', 'loop'],
    ['yield-statement', 'Yield', 'Yield Statement', 'yield switch expression', 'yield'],
  ]),
  group('exceptions', 'Exceções', 'shield-alert', 'statement', [
    ['try-catch', 'Try / catch / finally', 'Try Statement', 'try catch finally resources recursos AutoCloseable'],
    ['throw-statement', 'Throw', 'Throw Statement'],
  ]),
  group('organization', 'Pacotes e imports', 'package-open', 'organization', [
    ['package-declaration', 'Pacote', 'Package Declaration'],
    ['import-single', 'Import', 'Import Declaration'],
    ['import-wildcard', 'Import wildcard', 'Import Declaration'],
  ]),
  group('documentation', 'Comentários e espaçamento', 'message-square-more', 'any', [
    ['single-line-comment', 'Comentário de linha', 'Line Comment'],
    ['block-comment', 'Comentário de bloco', 'Block Comment'],
    ['javadoc', 'Javadoc', 'Javadoc'],
    ['blank-line', 'Linha em branco', 'Whitespace Line'],
  ]),
]

export function listLibrarySnippetsModel(): LibrarySnippetGroup[] { return GROUPS }
export function libraryComponentContext(id: LibraryComponentId): ComponentContext {
  return GROUPS.flatMap(group => group.snippets).find(item => item.id === id)!.context
}
const normalized = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
/** Search both UI languages, Java spellings and aliases without changing the catalogue order. */
export function filterLibrarySnippetsModel(query: string): LibrarySnippetGroup[] {
  const terms = normalized(query).trim().split(/\s+/).filter(Boolean)
  if (!terms.length) return GROUPS
  return GROUPS.map(group => ({ ...group, snippets: group.snippets.filter(item => {
    const label = `library.snippet.${item.id}` as MessageKey, category = `library.category.${group.category.id}` as MessageKey
    const searchable = normalized([item.id, item.label, item.formalName, item.aliases, item.content, ptBR[label], en[label], ptBR[category], en[category]].join(' '))
    return terms.every(term => searchable.includes(term))
  }) })).filter(group => group.snippets.length)
}
export function buildLibraryDragPayloadModel(snippet: LibrarySnippet): LibraryDragPayload {
  return { id: snippet.id, label: snippet.label, formalName: snippet.formalName, content: snippet.content }
}
