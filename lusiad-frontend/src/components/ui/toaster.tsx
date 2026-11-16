'use client'

import { usePathname } from 'next/navigation'
import { useI18n } from '@/lib/i18n/locale-provider'
import { useToast } from '@/hooks/use-toast'
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast'

export function Toaster() {
  const { toasts } = useToast()
  const pathname = usePathname()
  const { t } = useI18n()

  return (
    <ToastProvider duration={3500} label={t('interface.notifications')}>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose aria-label={t('common.close')} />
          </Toast>
        )
      })}
      <ToastViewport className={pathname === '/' ? 'left-auto right-0' : undefined} label={t('interface.notifications')} />
    </ToastProvider>
  )
}
