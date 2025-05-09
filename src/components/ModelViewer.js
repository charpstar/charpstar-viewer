// components/ModelViewer.js
'use client';

import { useState, useEffect, useRef } from 'react';
import { initializeModelViewer } from '@/utils/modelViewerInitializer';

const ModelViewer = ({ onModelLoaded, clientModelUrl }) => {
  const [modelSrc, setModelSrc] = useState(clientModelUrl || null);
  const [isClient, setIsClient] = useState(false);
  const fileNameRef = useRef('model');
  const modelLoadedRef = useRef(false);
  const modelViewerElementRef = useRef(null);

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
        
        // Initialize our custom model viewer functions
        modelViewerElementRef.current = initializeModelViewer(modelViewer);
        
        // Set a small delay to ensure the model is fully processed
        // Increased timeout to ensure model is fully loaded and processed
        setTimeout(() => {
          if (onModelLoaded && !modelLoadedRef.current) {
            console.log('Triggering onModelLoaded callback');
            modelLoadedRef.current = true;
            onModelLoaded();
          }
        }, 500); // Increased from 100ms to 500ms
      };
      
      modelViewer.addEventListener('load', handleLoad);
      
      // For client models, we should NOT trigger the load handler immediately
      // but rather wait for the actual 'load' event from the model-viewer
      
      return () => {
        modelViewer.removeEventListener('load', handleLoad);
        modelLoadedRef.current = false;
      };
    }
  }, [isClient, modelSrc, onModelLoaded]);

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
      className="w-full h-full flex items-center justify-center transition-colors duration-200 rounded-md bg-[#F8F9FA]"
    >
      <div className="w-full h-full flex items-center justify-center">
        {isClient && modelSrc && (
          <model-viewer
            src={modelSrc}
            alt="A 3D model"
            id="model-viewer"
            disable-pan
            shadow-intensity="0"
            environment-image="https://cdn.charpstar.net/Demos/HDR_Furniture.hdr"
            exposure="1.5"
            tone-mapping="aces"
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