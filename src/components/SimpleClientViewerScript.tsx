// src/components/SimpleClientViewerScript.tsx
'use client';

import React from 'react';
import Script from 'next/script';
import { useParams } from 'next/navigation';
import { getClientConfig } from '@/config/clientConfig';

const SimpleClientViewerScript = () => {
  const params = useParams();
  const clientName = params?.client as string;
  
  // Get the appropriate script for this client
  const scriptSrc = getClientConfig(clientName).scriptPath;

  return (
    <Script 
      src={scriptSrc} 
      strategy="beforeInteractive" 
      type="module"
    />
  );
};

export default SimpleClientViewerScript;