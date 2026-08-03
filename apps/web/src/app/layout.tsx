import type { Metadata } from 'next';
import '@fontsource-variable/inter/wght.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Wayo',
  description: 'Согласование запросов и маршруты',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
