// src/components/SimpleClientViewerScript.tsx
'use client';

import React from 'react';
import Script from 'next/script';
import { useParams, usePathname } from 'next/navigation';
import { getClientConfig } from '@/config/clientConfig';

const SimpleClientViewerScript = () => {
  const params = useParams();
  const clientName = params?.client as string;
  const pathname = usePathname();
  
  // Get the appropriate script for this client
  const scriptSrc = getClientConfig(clientName).scriptPath;

  // Skip loading client viewer scripts on materials and manage pages to avoid conflicts
  if (typeof pathname === 'string' && (pathname.includes('/materials') || pathname.includes('/manage'))) {
    return null;
  }

  return (
    <Script 
      src={scriptSrc} 
      strategy="beforeInteractive" 
      type="module"
    />
  );
};

export default SimpleClientViewerScript;