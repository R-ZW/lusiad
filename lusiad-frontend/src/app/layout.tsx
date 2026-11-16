import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { Analytics } from '@vercel/analytics/next'
import { LocaleProvider } from '@/lib/i18n/locale-provider'
import { getServerI18n } from '@/lib/i18n/server'
import { loadRuntimeConfig } from '@/lib/config/runtime-config'
import { loadOperationalConfig } from '@/lib/config/operational-config'
import { Toaster } from '@/components/ui/toaster'
import { ThemeProvider } from '@/components/theme-provider'
import { SharedPreferencesBridge } from '@/components/shared-preferences-bridge'
import { TutorialProvider } from '@/components/tutorials/tutorial-provider'
import { DEFAULT_PALETTE, PALETTE_BOOTSTRAP, paletteVariables } from '@/lib/appearance'
import type { CSSProperties } from 'react'
import './globals.css'

const geist = localFont({
  src: './fonts/geist-latin.woff2',
  variable: '--font-geist',
  display: 'swap',
})

const geistMono = localFont({
  src: './fonts/geist-mono-latin.woff2',
  variable: '--font-geist-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Lusiad',
  description: 'Change tracking tool for Model-Driven Engineering',
  icons: {
    icon: { url: '/icon.svg', type: 'image/svg+xml' },
    apple: '/apple-icon.png',
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const { locale, t } = await getServerI18n()
  const environment = loadRuntimeConfig()

  return (
    <html lang={locale} suppressHydrationWarning style={paletteVariables(DEFAULT_PALETTE) as CSSProperties}>
      <body data-environment={environment.profile} data-test-run={environment.test?.runId} className={`${geist.variable} ${geistMono.variable} font-sans antialiased`}>
        <script dangerouslySetInnerHTML={{ __html: PALETTE_BOOTSTRAP }} />
        {environment.test && <div data-testid="test-environment" role="status" className="pointer-events-none fixed right-3 top-1 z-[250] rounded border border-amber-500 bg-background px-2 py-0.5 text-[10px] text-foreground">
          {t('environment.test')} · {environment.test.runId.slice(0, 8)}
        </div>}
        <ThemeProvider><LocaleProvider initialLocale={locale}><TutorialProvider><SharedPreferencesBridge />{children}<Toaster /></TutorialProvider></LocaleProvider></ThemeProvider>
        {!environment.test && process.env.NODE_ENV === 'production' && loadOperationalConfig().analyticsEnabled && <Analytics />}
      </body>
    </html>
  )
}
