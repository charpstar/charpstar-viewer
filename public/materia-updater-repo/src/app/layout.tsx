// src/app/layout.tsx

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import ErrorBoundary from "@/components/ErrorBoundary";
import Providers from "@/components/Providers";
import "./globals.css";
import { StrictMode } from 'react';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Material Updater",
  description: "Batch update materials from reference GLTF to target GLTF files.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <StrictMode>
          <ErrorBoundary>
            <Providers>
              {children}
            </Providers>
          </ErrorBoundary>
        </StrictMode>
      </body>
    </html>
  );
}