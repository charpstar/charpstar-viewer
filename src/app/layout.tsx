// app/layout.tsx

import './globals.css';
import { Jost } from 'next/font/google';
import { ReactNode } from 'react';

const jost = Jost({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-jost'
});

export const metadata = {
  title: 'CharpstAR 3D Generator',
  description: 'Transform your images into stunning 3D models with AI',
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className={`${jost.className} text-[14px]`}>
        {children}
      </body>
    </html>
  );
}