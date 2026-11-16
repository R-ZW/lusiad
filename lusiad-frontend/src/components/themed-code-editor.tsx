'use client'

import { useSyncExternalStore, type ComponentProps } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { useTheme } from 'next-themes'

const subscribe = () => () => {}
/** Theme reconfiguration preserves the existing editor/draft; it never keys/remounts on theme. */
export function ThemedCodeEditor(props: ComponentProps<typeof CodeMirror>) {
  const { resolvedTheme } = useTheme()
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false)
  const mode = hydrated && resolvedTheme === 'dark' ? 'dark' : 'light'
  return <CodeMirror {...props} theme={mode} data-color-mode={mode} />
}
