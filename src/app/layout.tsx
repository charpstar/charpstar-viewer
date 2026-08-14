// app/layout.tsx

import "./globals.css";
import localFont from "next/font/local";
import { ReactNode } from "react";

// Self-hosted so the build has no network dependency on Google Fonts.
// Single variable file covering the 300-600 range the app uses.
const jost = localFont({
  src: "./fonts/Jost-latin-variable.woff2",
  weight: "300 600",
  style: "normal",
  display: "swap",
  variable: "--font-jost",
});

export const metadata = {
  title: "Charpstar 3D Viewer",
  description: "A 3D drag-and-drop viewer using Next.js",
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className={`${jost.className} text-[14px]`}>{children}</body>
    </html>
  );
}
