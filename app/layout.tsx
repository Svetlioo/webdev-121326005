import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Geist_Mono, Inter } from 'next/font/google';
import { cn } from '@/lib/utils';
import './globals.css';

// Inter, not Geist: Geist's Cyrillic "б" reads as "6", and "221б" must not look like "2216".
const sans = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-sans' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Седмично разписание · ТУ София',
  description: 'Седмичното разписание на ТУ София, четимо и с търсене.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="bg" className={cn('font-sans antialiased', sans.variable, mono.variable)}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
