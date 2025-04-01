// components/ModelViewer.js
'use client';

import { useState, useEffect, useRef } from 'react';

const ModelViewer = ({ onModelLoaded, clientModelUrl }) => {
  const [modelSrc, setModelSrc] = useState(clientModelUrl || null);
  const [isClient, setIsClient] = useState(false);
  const fileNameRef = useRef('model');
  const modelLoadedRef = useRef(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Update modelSrc when clientModelUrl changes
  useEffect(() => {
    if (clientModelUrl) {
      setModelSrc(clientModelUrl);
    }
  }, [clientModelUrl]);

  // Effect to handle model load event
  useEffect(() => {
    if (!isClient || !modelSrc) return;

    const modelViewer = document.getElementById('model-viewer');
    if (modelViewer) {
      const handleLoad = () => {
        console.log('Model loaded');
        
        // Store references
        window.modelViewerElement = modelViewer;
        window.currentFileName = fileNameRef.current;
        
        // Set a small delay to ensure the model is fully processed
        setTimeout(() => {
          if (onModelLoaded && !modelLoadedRef.current) {
            modelLoadedRef.current = true;
            onModelLoaded();
          }
        }, 100);
      };
      
      modelViewer.addEventListener('load', handleLoad);
      
      // If it's a client model, trigger the load handler immediately
      if (clientModelUrl) {
        handleLoad();
      }
      
      return () => {
        modelViewer.removeEventListener('load', handleLoad);
        modelLoadedRef.current = false;
      };
    }
  }, [isClient, modelSrc, onModelLoaded, clientModelUrl]);

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
      e.currentTarget.classList.add('bg-[#EFEFEF]');
    }
  };

  const handleDragLeave = (e) => {
    if (!clientModelUrl) {
      e.preventDefault();
      e.currentTarget.classList.remove('bg-[#EFEFEF]');
    }
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className="w-full h-full flex items-center justify-center transition-colors duration-200"
    >
      <div className="w-full h-full flex items-center justify-center">
        {isClient && modelSrc && (
          <model-viewer
            src={modelSrc}
            alt="A 3D model"
            id="model-viewer"
            disable-pan
            shadow-intensity="0.5"
            environment-image="https://cdn.charpstar.net/Demos/HDR_Furniture.hdr"
            exposure="1.5"
            tone-mapping="aces"
            shadow-softness="1"
            style={{ width: '100%', height: '100%' }}
            camera-controls
          ></model-viewer>
        )}
        
        {!modelSrc && !clientModelUrl && (
          <div className="text-center">
            <p className="text-gray-600 text-sm mb-2">
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