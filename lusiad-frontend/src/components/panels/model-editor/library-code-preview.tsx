"use client"

import { useMemo } from 'react'
import { javaLanguage } from '@codemirror/lang-java'
import { classHighlighter, highlightTree } from '@lezer/highlight'

/** Static highlighting with CodeMirror's Java grammar; no editor instance or diagnostics. */
export function LibraryCodePreview({ code, label }: { code: string; label: string }) {
  const segments = useMemo(() => {
    const parts: { from: number; to: number; className?: string }[] = []
    let offset = 0
    highlightTree(javaLanguage.parser.parse(code), classHighlighter, (from, to, className) => {
      if (from > offset) parts.push({ from: offset, to: from })
      parts.push({ from, to, className })
      offset = to
    })
    if (offset < code.length) parts.push({ from: offset, to: code.length })
    return parts
  }, [code])
  return <pre data-testid="library-component-code" aria-label={label} className="library-code pointer-events-none mt-1 min-h-8 min-w-0 select-none whitespace-pre-wrap break-words rounded-md px-2.5 py-1.5 font-mono text-[11px] leading-relaxed">
    <code>{segments.map(segment => <span key={segment.from} className={segment.className}>{code.slice(segment.from, segment.to)}</span>)}</code>
  </pre>
}
