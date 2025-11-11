/// <reference path="../types/global.d.ts" />
'use client';

import { useEffect, useRef, useState } from 'react';

interface ModularViewerProps {
  onViewerReady?: (viewer: any) => void;
  src?: string;
}

export default function ModularViewer({ onViewerReady, src }: ModularViewerProps) {
  const viewerRef = useRef<any>(null);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    // Unload existing model-viewer script
    const existingScript = document.querySelector('script[data-loader="model-viewer-module"]');
    if (existingScript) {
      existingScript.remove();
    }
    
    // Remove import map
    const existingImportMap = document.querySelector('script[type="importmap"][data-loader="mv-importmap"]');
    if (existingImportMap) {
      existingImportMap.remove();
    }

    // Check if modular-viewer custom element is already defined
    const alreadyDefined = (typeof window !== 'undefined') && (window as any)?.customElements?.get?.('modular-viewer');
    
    if (!alreadyDefined) {
      // Load Sweef modular configurator script as ES6 module (local platform build)
      const script = document.createElement('script');
      script.type = 'module'; // CRITICAL: Load as ES6 module to support export statements
      script.src = '/sweef-viewer-13-platform.js';
      script.setAttribute('data-loader', 'sweef-modular-viewer');
      script.onload = () => {
        setScriptReady(true);
        // Wait a bit for custom element to be registered
        setTimeout(() => {
          if (viewerRef.current) {
            onViewerReady?.(viewerRef.current);
          }
        }, 100);
      };
      script.onerror = () => {
        console.error('Failed to load Sweef modular viewer script');
      };
      document.head.appendChild(script);
    } else {
      // Custom element already registered, just mark as ready
      setScriptReady(true);
      setTimeout(() => {
        if (viewerRef.current) {
          onViewerReady?.(viewerRef.current);
        }
      }, 100);
    }

    return () => {
      // Cleanup on unmount - only remove script if we added it
      if (!alreadyDefined) {
        const sweefScript = document.querySelector('script[data-loader="sweef-modular-viewer"]');
        if (sweefScript) {
          sweefScript.remove();
        }
      }
    };
  }, [onViewerReady]);

  return (
    // @ts-ignore - modular-viewer is a custom element loaded dynamically
    <modular-viewer
      ref={viewerRef}
      id="sweefModularViewer"
      src={src || ''}
      shadow-intensity="0.6"
      shadow-softness="1"
      min-field-of-view="40deg"
      max-field-of-view="40deg"
      camera-orbit="0deg 75deg 100%"
      camera-controls=""
      disable-pan=""
      environment-image="https://sweef.charpstar.net/HDR/Sweef-HDR.hdr"
      ar-status="not-presenting"
      style={{ width: '100%', height: '100%' }}
    >
      <div 
        className="cmv-initial-text-container" 
        id="cmv-initialText" 
        style={{ display: 'none', visibility: 'hidden' }}
      >
        Pick a model
      </div>
      {/* @ts-ignore */}
    </modular-viewer>
  );
}

