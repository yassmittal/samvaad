import type { Metadata, Viewport } from 'next';
import { Anek_Devanagari } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

// One family for Devanagari and Latin, so Hindi and English captions sit together (D-022).
const anekFont = Anek_Devanagari({
  subsets: ['devanagari', 'latin'],
  variable: '--font-anek',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Samvaad',
  description: 'Speak your language. Hear theirs. A live two-way speech translator.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The page background, stone-50, in each mode (globals.css, D-017).
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafaf9' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0a09' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={anekFont.variable}>
      <body>{children}</body>
    </html>
  );
}
