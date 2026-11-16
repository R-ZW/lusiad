/** IntelliJ PSI and Document offsets both refer to text with LF line separators. */
export function normalizePsiSource(source: string): string {
  return source.replace(/\r\n?/g, "\n")
}
