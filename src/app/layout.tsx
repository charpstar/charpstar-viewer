// app/layout.tsx

import './globals.css';
import { Jost } from 'next/font/google';
import { ReactNode } from 'react';
import SimpleClientViewerScript from '@/components/SimpleClientViewerScript';

const jost = Jost({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-jost'
});

export const metadata = {
  title: 'Charpstar 3D Editor',
  description: 'A 3D drag-and-drop viewer using Next.js',
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className={`${jost.className} text-[14px]`}>
        {/* Load the appropriate viewer script based on client */}
        <SimpleClientViewerScript />
        {children}
      </body>
    </html>
  );
}