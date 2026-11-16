'use client'
import { useEffect, useState } from 'react'
import { AlertTriangle, Code2, Monitor } from 'lucide-react'
import { useI18n } from '@/lib/i18n/locale-provider'
import type { IdeStatus } from '@/lib/services/project-presence'
import { Badge } from '@/components/ui/badge'
export function useProjectPresence() {
  const [status, setStatus] = useState<IdeStatus | null>(null)
  useEffect(() => {
    let active = true, busy = false
    const refresh = async () => {
      if (busy) return; busy = true
      try { const response = await fetch('/api/lusiad/projects/presence', { cache: 'no-store', signal: AbortSignal.timeout(8000) }); const value = await response.json(); if (active) setStatus(response.ok && value.status === 'ok' ? value : null) } catch { if (active) setStatus(null) } finally { busy = false }
    }
    void refresh(); const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 10000); window.addEventListener('focus', refresh)
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [])
  return status
}
export function ProjectPresenceBadge({ status, projectId }: { status: IdeStatus | null; projectId: number }) {
  const { t } = useI18n(), row = status?.projects.find(p => p.projectId === projectId)
  return <span data-testid="project-presence" data-ide-open={row?.ideOpen ?? 'unknown'} data-web-open={row?.webOpen ?? 'unknown'} className="mt-2 flex flex-wrap gap-1">
    {!row && <span className="text-xs text-muted-foreground">{t('projects.presenceUnavailable')}</span>}
    {row?.ideOpen && <Badge variant="secondary"><Code2 className="size-3" />IntelliJ</Badge>}
    {row?.webOpen && <Badge variant="secondary"><Monitor className="size-3" />Lusiad</Badge>}
    {row && !row.directoryExists && <Badge variant="destructive"><AlertTriangle className="size-3" />{t('projects.directoryMissing')}</Badge>}
  </span>
}
