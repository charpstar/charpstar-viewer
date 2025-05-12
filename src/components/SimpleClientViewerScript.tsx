// src/components/SimpleClientViewerScript.tsx
'use client';

import React from 'react';
import Script from 'next/script';
import { useParams } from 'next/navigation';

const SimpleClientViewerScript = () => {
  const params = useParams();
  const clientName = params?.client as string;
  
  // Use Sweef viewer for SweefV2 client, model-viewer for all others
  const scriptSrc = clientName === 'SweefV2' 
    ? '/sweef-viewer-13.js' 
    : '/model-viewer.js';

  return (
    <Script 
      src={scriptSrc} 
      strategy="beforeInteractive" 
      type="module"
    />
  );
};

export default SimpleClientViewerScript;