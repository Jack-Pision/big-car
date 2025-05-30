import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Tehom AI',
  description: 'A modern chatbot interface for AI study assistance',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full antialiased">
        {children}
      </body>
    </html>
  )
} 