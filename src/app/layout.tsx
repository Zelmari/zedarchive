import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { productName } from '@/config/product-identity'
import './globals.css'

export const metadata: Metadata = {
  title: productName,
  description: 'Track the things you watch and read.',
}

type RootLayoutProps = {
  children: ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
