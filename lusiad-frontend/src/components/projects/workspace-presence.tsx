'use client'
import { useEffect } from 'react'
export function WorkspacePresence({ projectId }: { projectId: number }) {
  useEffect(() => {
    let tabId = crypto.randomUUID()
    const url = '/api/lusiad/projects/presence'
    let busy = false, active = true
    const ping = async () => {
      if (busy || !active) return; busy = true
      try { await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, tabId }), signal: AbortSignal.timeout(5000) }) } catch { /* The project UI owns API error reporting; an expired lease never claims the tab is open. */ } finally { busy = false }
    }
    const release = () => { navigator.sendBeacon(url, new Blob([JSON.stringify({ projectId, tabId, close: true })], { type: 'application/json' })) }
    const restored = (event: PageTransitionEvent) => { if (event.persisted) { tabId = crypto.randomUUID(); void ping() } }
    void ping(); const timer = setInterval(ping, 15000)
    window.addEventListener('pagehide', release); window.addEventListener('focus', ping); window.addEventListener('pageshow', restored)
    return () => { active = false; clearInterval(timer); window.removeEventListener('pagehide', release); window.removeEventListener('focus', ping); window.removeEventListener('pageshow', restored); release() }
  }, [projectId])
  return null
}
