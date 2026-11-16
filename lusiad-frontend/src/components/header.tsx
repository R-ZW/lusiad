"use client"

import Image from 'next/image'
import Link from 'next/link'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/lib/i18n/locale-provider'
import { SettingsDialog, type ProjectSettingsProps } from '@/components/settings-dialog'
import { TutorialButton } from '@/components/tutorials/tutorial-provider'

interface HeaderProps extends ProjectSettingsProps {
  projectDescription?: string | null
}

export function Header({ projectId, projectName, projectDescription, ...settingsProps }: HeaderProps) {
  const { t } = useI18n()
  const brand = <>
    <Image src="/icon.svg" alt="" width={32} height={32} unoptimized className="shrink-0" />
    <span className="text-sm font-semibold text-foreground">Lusiad</span>
  </>

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {projectId !== undefined
          ? <Link data-testid="home-link" href="/" aria-label={t('navigation.backToProjects')} title={t('navigation.backToProjects')}
            className="inline-flex shrink-0 items-center gap-2 rounded-md underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{brand}</Link>
          : <div className="flex shrink-0 items-center gap-2">{brand}</div>}

        {projectName && <div className="flex min-w-0 flex-1 justify-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <span data-testid="header-project-name" tabIndex={0} className="max-w-[min(55vw,680px)] truncate text-center text-xs text-muted-foreground">
                {projectName}
              </span>
            </TooltipTrigger>
            <TooltipContent data-testid="header-project-description" side="bottom" sideOffset={8} className="max-w-sm whitespace-pre-wrap break-words">
              {projectDescription?.trim() || t('common.noDescription')}
            </TooltipContent>
          </Tooltip>
        </div>}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <SettingsDialog {...settingsProps} projectId={projectId} projectName={projectName} />
        <TutorialButton tutorial={projectId === undefined ? 'projects' : 'workspace'} />
      </div>
    </header>
  )
}
