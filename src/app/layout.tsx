import './globals.css';
import { Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import dynamic from 'next/dynamic';
import type { Metadata } from 'next'

const inter = Inter({ subsets: ['latin'] });

// Dynamically load CacheDebug component with no SSR to avoid localStorage errors
const CacheDebug = dynamic(
  () => import('@/components/Debug/CacheDebug'),
  { ssr: false }
);

// Dynamically load PanelLayoutEffect with no SSR to handle panel resize
const PanelLayoutEffect = dynamic(
  () => import('@/components/ResizablePanel/PanelLayoutEffect'),
  { ssr: false }
);

export const metadata: Metadata = {
  title: 'Tehom AI',
  description: 'A modern chatbot interface for AI study assistance',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full antialiased">
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 3000,
          }}
        />
        {children}
        <Analytics />
        <SpeedInsights />
        <CacheDebug />
        <PanelLayoutEffect />
      </body>
    </html>
  );
} 