import type { Metadata } from 'next';
import Script from 'next/script';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin', 'cyrillic'],
});

export const metadata: Metadata = {
  title: 'Request Tracker',
  description: 'Система трекинга запросов',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`}>
        <Providers>{children}</Providers>
        {/* impeccable-live-start */}
        <Script src="http://localhost:8400/live.js" strategy="afterInteractive" />
        {/* impeccable-live-end */}
</body>
    </html>
  );
}
