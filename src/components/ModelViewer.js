// components/ModelViewer.js
'use client';

import { useState, useEffect, useRef } from 'react';
import { initializeModelViewer } from '@/utils/modelViewerInitializer';
import { useParams } from 'next/navigation';
import { getClientConfig } from '@/config/clientConfig';

const ModelViewer = ({ onModelLoaded, clientModelUrl }) => {
  const params = useParams();
  const clientName = params?.client;
  const [modelSrc, setModelSrc] = useState(clientModelUrl || null);
  const [isClient, setIsClient] = useState(false);
  const [moduleReady, setModuleReady] = useState(false);
  const fileNameRef = useRef('model');
  const modelLoadedRef = useRef(false);
  const modelViewerElementRef = useRef(null);

  // Get the client configuration
  const clientConfig = getClientConfig(clientName);
  const environmentImage = clientConfig.hdrPath;
  const exposure = clientConfig.exposure || 1.0;
  const toneMapping = clientConfig.toneMapping || 'neutral';

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Ensure the same module build as materials page is loaded (no clientConfig script)
  function ensureModelViewerModuleLoaded() {
    return new Promise((resolve, reject) => {
      if (typeof window !== 'undefined' && window.customElements?.get?.('model-viewer')) {
        resolve();
        return;
      }

      // Ensure import map for 'three'
      const existingImportMap = document.querySelector('script[type="importmap"][data-loader="mv-importmap"]');
      if (!existingImportMap) {
        const importMap = document.createElement('script');
        importMap.type = 'importmap';
        importMap.setAttribute('data-loader', 'mv-importmap');
        importMap.textContent = JSON.stringify({
          imports: {
            three: '/three.module.js'
          }
        });
        document.head.appendChild(importMap);
      }

      // Load module version of model-viewer (no bundled three)
      const existing = document.querySelector('script[type="module"][data-loader="model-viewer-module"]');
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Failed to load model-viewer module')));
        return;
      }

      const script = document.createElement('script');
      script.type = 'module';
      script.src = '/model-viewer-module.js';
      script.setAttribute('data-loader', 'model-viewer-module');
      script.addEventListener('load', () => resolve());
      script.addEventListener('error', () => reject(new Error('Failed to load model-viewer module')));
      document.head.appendChild(script);
    });
  }

  useEffect(() => {
    if (!isClient) return;
    let cancelled = false;
    ensureModelViewerModuleLoaded()
      .then(() => { if (!cancelled) setModuleReady(true); })
      .catch(() => { if (!cancelled) setModuleReady(false); });
    return () => { cancelled = true; };
  }, [isClient]);

  // Update modelSrc when clientModelUrl changes
  useEffect(() => {
    if (clientModelUrl) {
      setModelSrc(clientModelUrl);
    }
  }, [clientModelUrl]);

  // Effect to handle model load event
  useEffect(() => {
    if (!isClient || !moduleReady || !modelSrc) return;

    const modelViewer = document.getElementById('model-viewer');
    if (modelViewer) {
      const handleLoad = () => {
        // Store references
        window.modelViewerElement = modelViewer;
        window.currentFileName = fileNameRef.current;
        
        // Initialize our custom model viewer functions
        modelViewerElementRef.current = initializeModelViewer(modelViewer);
        
        if (onModelLoaded && !modelLoadedRef.current) {
          modelLoadedRef.current = true;
          onModelLoaded();
        }
      };
      
      modelViewer.addEventListener('load', handleLoad);
      
      // For client models, we should NOT trigger the load handler immediately
      // but rather wait for the actual 'load' event from the model-viewer
      
      return () => {
        modelViewer.removeEventListener('load', handleLoad);
        modelLoadedRef.current = false;
      };
    }
  }, [isClient, moduleReady, modelSrc, onModelLoaded]);

  // Only enable drag and drop if no client model URL is provided
  const handleDrop = (e) => {
    if (clientModelUrl) return; // Disable drag & drop when client model is specified
    
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'model/gltf-binary' || file.name.endsWith('.glb') || file.name.endsWith('.gltf'))) {
      const originalFileName = file.name.replace(/\.[^/.]+$/, "");
      fileNameRef.current = originalFileName;
      modelLoadedRef.current = false;
      
      const url = URL.createObjectURL(file);
      setModelSrc(url);
    } else {
      alert('Please drag and drop a valid .glb or .gltf file.');
    }
  };

  const handleDragOver = (e) => {
    if (!clientModelUrl) {
      e.preventDefault();
    }
  };

  const handleDragLeave = (e) => {
    if (!clientModelUrl) {
      e.preventDefault();
    }
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className="w-full h-full flex items-center justify-center transition-colors duration-200 rounded-md bg-[#F8F9FA]"
    >
      <div className="w-full h-full flex items-center justify-center">
        {isClient && moduleReady && modelSrc && (
          <model-viewer
            src={modelSrc}
            alt="A 3D model"
            id="model-viewer"
            disable-pan
            interaction-prompt = "none"
            shadow-intensity="0.6"
            shadow-softness="0.9"
            environment-image={environmentImage}
            exposure={exposure}
            tone-mapping={toneMapping}
            camera-orbit="0deg 75deg auto"
            style={{ width: '100%', height: '100%', borderRadius: '0.5rem' }}
            camera-controls
          ></model-viewer>
        )}
        
        {!modelSrc && !clientModelUrl && (
          <div className="text-center p-6 rounded-lg border-2 border-dashed border-gray-300 bg-white">
            <p className="text-gray-600 text-sm mb-3">
              Drag and drop a <strong>.glb</strong> or <strong>.gltf</strong> file here to view it.
            </p>
            <p className="text-gray-500 text-xs">
              The model structure will be displayed in the left panel once loaded.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ModelViewer;