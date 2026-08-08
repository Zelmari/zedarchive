import type { Metadata } from 'next'
import localFont from 'next/font/local'
import type { ReactNode } from 'react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { productName } from '@/config/product-identity'
import './globals.css'

const instrumentSerif = localFont({
  src: './fonts/instrument-serif-regular.woff2',
  variable: '--font-instrument-serif',
  weight: '400',
  style: 'normal',
  display: 'swap',
})

const ibmPlexMono = localFont({
  src: [
    {
      path: './fonts/ibm-plex-mono-regular-latin1.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: './fonts/ibm-plex-mono-medium-latin1.woff2',
      weight: '500',
      style: 'normal',
    },
  ],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: productName,
  description: 'Track the things you watch and read.',
}

// The session-aware header reads request headers on every route, so the whole
// application is explicitly dynamic. Declaring it here stops the build from
// attempting static prerenders that would throw Next.js control errors into
// the header's outage handling. Accepted in decision 019.
export const dynamic = 'force-dynamic'

type RootLayoutProps = {
  children: ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      className={`${instrumentSerif.variable} ${ibmPlexMono.variable}`}
      lang="en"
    >
      <body>
        <a className="za-skip-link" href="#main-content">
          Skip to main content
        </a>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  )
}
