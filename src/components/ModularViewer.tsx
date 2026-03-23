/// <reference path="../types/global.d.ts" />
'use client';

import { useEffect, useRef, useState } from 'react';

const SWEEF_VIEWER_CDN = 'https://sweef.charpstar.net/Scripts/sweef-viewer-13.js';
const VIEWER_TAG = 'modular-viewer';
/** Exact line at end of CDN bundle — renamed so it does not clash with app <model-viewer>. */
const CDN_DEFINE_LINE = "customElements.define('model-viewer', ModelViewerElement);";

interface ModularViewerProps {
  onViewerReady?: (viewer: any) => void;
  src?: string;
}

export default function ModularViewer({ onViewerReady, src }: ModularViewerProps) {
  const viewerRef = useRef<any>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // Avoid loading two different model-viewer implementations at once on this page
    const existingScript = document.querySelector('script[data-loader="model-viewer-module"]');
    if (existingScript) {
      existingScript.remove();
    }

    const existingImportMap = document.querySelector('script[type="importmap"][data-loader="mv-importmap"]');
    if (existingImportMap) {
      existingImportMap.remove();
    }

    let cancelled = false;

    const notifyReady = () => {
      if (cancelled) return;
      setScriptReady(true);
      setTimeout(() => {
        if (viewerRef.current) {
          onViewerReady?.(viewerRef.current);
        }
      }, 100);
    };

    const alreadyDefined =
      typeof window !== 'undefined' && (window as any)?.customElements?.get?.(VIEWER_TAG);

    if (alreadyDefined) {
      notifyReady();
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const response = await fetch(SWEEF_VIEWER_CDN);
        if (!response.ok) {
          throw new Error(`Failed to fetch Sweef viewer: ${response.status} ${response.statusText}`);
        }
        let scriptContent = await response.text();
        const replacement = `customElements.define('${VIEWER_TAG}', ModelViewerElement);`;
        if (scriptContent.includes(CDN_DEFINE_LINE)) {
          scriptContent = scriptContent.replace(CDN_DEFINE_LINE, replacement);
        } else {
          console.warn(
            'ModularViewer: CDN script no longer contains expected customElements.define line; may register as model-viewer and clash.',
          );
        }

        if (cancelled) return;

        const blob = new Blob([scriptContent], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        blobUrlRef.current = blobUrl;

        const script = document.createElement('script');
        script.type = 'module';
        script.src = blobUrl;
        script.setAttribute('data-loader', 'sweef-modular-viewer');
        script.onload = () => notifyReady();
        script.onerror = () => {
          console.error('Failed to execute Sweef modular viewer script');
          if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
          }
        };
        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          blobUrlRef.current = null;
          return;
        }
        document.head.appendChild(script);
      } catch (e) {
        console.error('ModularViewer: CDN load error:', e);
      }
    })();

    return () => {
      cancelled = true;
      const sweefScript = document.querySelector('script[data-loader="sweef-modular-viewer"]');
      if (sweefScript?.parentNode) {
        sweefScript.parentNode.removeChild(sweefScript);
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [onViewerReady]);

  return (
    // @ts-ignore - modular-viewer is registered from modified CDN bundle
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
      <div className="cmv-progress-container" style={{ visibility: 'hidden' }}>
        <div className="cmv-progress" style={{ width: '100%' }}></div>
      </div>

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
