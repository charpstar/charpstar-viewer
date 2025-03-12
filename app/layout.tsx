// app/layout.tsx
import './globals.css';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import { ReactNode } from 'react';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Charpstar 3D Viewer',
  description: 'A 3D drag-and-drop viewer using Next.js',
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* Include your custom model-viewer.js */}
        <Script src="/model-viewer.js" strategy="beforeInteractive" type="module" />
        {children}
      </body>
    </html>
  );
}