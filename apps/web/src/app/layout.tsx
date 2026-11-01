import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
