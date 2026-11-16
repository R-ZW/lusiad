'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const FloatingContext = createContext<{ host: HTMLDivElement | null; setHost: (host: HTMLDivElement | null) => void } | null>(null)

/** A shared layout, not a shared lifecycle: collapsing/closing never stops a tool. */
export function FloatingToolsProvider({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  return <FloatingContext.Provider value={{ host, setHost }}>{children}</FloatingContext.Provider>
}

export function FloatingToolsHost() {
  const context = useContext(FloatingContext)
  return <div ref={context?.setHost} data-testid="floating-tools" className="ui-floating-tools" />
}

export function FloatingTool({ children }: { children: ReactNode }) {
  const context = useContext(FloatingContext)
  return context?.host ? createPortal(<div className="ui-floating-tool">{children}</div>, context.host) : null
}
