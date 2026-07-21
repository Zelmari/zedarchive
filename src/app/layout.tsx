import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { SiteHeader } from '@/components/site-header'
import { productName } from '@/config/product-identity'
import './globals.css'

export const metadata: Metadata = {
  title: productName,
  description: 'Track the things you watch and read.',
}

// The session-aware header reads request headers on every route, so the whole
// application is explicitly dynamic. Declaring it here stops the build from
// attempting static prerenders that would throw Next.js control errors into
// the header's outage handling. Accepted in decision 019.
export const dynamic = 'force-dynamic'

const skipLinkClassName =
  'sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:border focus:border-gray-300 focus:bg-white focus:px-3 focus:py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

type RootLayoutProps = {
  children: ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <a className={skipLinkClassName} href="#main-content">
          Skip to main content
        </a>
        <SiteHeader />
        {children}
      </body>
    </html>
  )
}
