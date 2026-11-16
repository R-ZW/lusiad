/** Client preferences only; no project, SQL, operational configuration or source changes. */
export const PALETTE_STORAGE_KEY = 'lusiad-block-palette'
export const THEME_STORAGE_KEY = 'lusiad-theme-mode'
export const BLOCK_GROUPS = ['file', 'types', 'methods', 'fields', 'variables', 'conditionals', 'loops', 'switch', 'exceptions', 'calls', 'returns', 'jumps', 'comments', 'blocks'] as const
export type BlockGroup = typeof BLOCK_GROUPS[number]
export type PalettePreset = 'classic' | 'soft' | 'monochrome' | 'custom'
export type BlockColors = Record<BlockGroup, string>
export interface PalettePreference { version: 1; preset: PalettePreset; custom: Partial<BlockColors> }
export const PRESET_COLORS: Record<Exclude<PalettePreset, 'custom'>, BlockColors> = {
  classic: { file: '#64748b', types: '#3b82f6', methods: '#10b981', fields: '#06b6d4', variables: '#14b8a6', conditionals: '#f59e0b', loops: '#f97316', switch: '#a855f7', exceptions: '#f43f5e', calls: '#6366f1', returns: '#ec4899', jumps: '#8b5cf6', comments: '#84a45a', blocks: '#94a3b8' },
  soft: { file: '#9ca3af', types: '#93c5fd', methods: '#6ee7b7', fields: '#67e8f9', variables: '#5eead4', conditionals: '#fcd34d', loops: '#fdba74', switch: '#d8b4fe', exceptions: '#fda4af', calls: '#a5b4fc', returns: '#f9a8d4', jumps: '#c4b5fd', comments: '#bef264', blocks: '#cbd5e1' },
  monochrome: Object.fromEntries(BLOCK_GROUPS.map(group => [group, '#808080'])) as BlockColors,
}
export const DEFAULT_PALETTE: PalettePreference = { version: 1, preset: 'classic', custom: {} }
export const validColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
export function parsePalette(raw: string | null): PalettePreference {
  try {
    const data = JSON.parse(raw ?? 'null')
    if (!data || data.version !== 1 || !['classic', 'soft', 'monochrome', 'custom'].includes(data.preset)) return DEFAULT_PALETTE
    const custom: Partial<BlockColors> = {}
    if (data.custom && typeof data.custom === 'object') for (const group of BLOCK_GROUPS) {
      if (validColor(data.custom[group])) custom[group] = data.custom[group].toLowerCase()
    }
    return { version: 1, preset: data.preset, custom }
  } catch { return DEFAULT_PALETTE }
}
export function paletteColors(preference: PalettePreference): BlockColors {
  return preference.preset === 'custom' ? { ...PRESET_COLORS.classic, ...preference.custom } : PRESET_COLORS[preference.preset]
}
export function paletteVariables(preference: PalettePreference): Record<string, string> {
  const colors = paletteColors(preference)
  return Object.fromEntries(BLOCK_GROUPS.map(group => [`--block-${group}-base`, colors[group]]))
}
export function changeBlockColor(preference: PalettePreference, group: BlockGroup, color: string): PalettePreference {
  if (!validColor(color)) return preference
  return { version: 1, preset: 'custom', custom: { ...paletteColors(preference), [group]: color.toLowerCase() } }
}
/** Whitelisted PSI presentation families. Unknown/future types retain a configurable fallback. */
export function blockGroup(type: string): BlockGroup {
  const name = type.replace(/^Psi/, '').replace(/Impl$/, '')
  if (['Class', 'AnonymousClass', 'Record', 'Interface', 'Enum', 'AnnotationType'].includes(name)) return 'types'
  if (['JavaFile', 'PackageStatement', 'ImportStatement', 'ImportStaticStatement', 'ImportList'].includes(name)) return 'file'
  if (['Method', 'Constructor'].includes(name)) return 'methods'
  if (name === 'Field' || name === 'EnumConstant') return 'fields'
  if (['LocalVariable', 'DeclarationStatement', 'Parameter', 'RecordComponent'].includes(name)) return 'variables'
  if (['IfStatement', 'ConditionalExpression'].includes(name)) return 'conditionals'
  if (['WhileStatement', 'ForStatement', 'ForeachStatement', 'DoWhileStatement'].includes(name)) return 'loops'
  if (name.startsWith('Switch') || name === 'YieldStatement') return 'switch'
  if (['TryStatement', 'CatchSection', 'ThrowStatement'].includes(name)) return 'exceptions'
  if (['ExpressionStatement', 'MethodCallExpression', 'NewExpression'].includes(name)) return 'calls'
  if (name === 'ReturnStatement') return 'returns'
  if (['BreakStatement', 'ContinueStatement', 'AssertStatement'].includes(name)) return 'jumps'
  if (name.includes('Comment')) return 'comments'
  return 'blocks'
}
/** Runs before paint. Storage is untrusted; only known CSS properties and hex colors are accepted. */
export const PALETTE_BOOTSTRAP = `(()=>{try{const d=JSON.parse(localStorage.getItem(${JSON.stringify(PALETTE_STORAGE_KEY)})||'null');const p=${JSON.stringify(PRESET_COLORS)};const g=${JSON.stringify(BLOCK_GROUPS)};if(!d||d.version!==1||!['classic','soft','monochrome','custom'].includes(d.preset))return;const b=d.preset==='custom'?p.classic:p[d.preset];for(const k of g){const c=d.preset==='custom'&&d.custom&&/^#[0-9a-f]{6}$/i.test(d.custom[k])?d.custom[k]:b[k];document.documentElement.style.setProperty('--block-'+k+'-base',c)}document.documentElement.dataset.blockPalette=d.preset}catch{}})()`
