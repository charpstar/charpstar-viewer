// app/components/ModelViewer.tsx
'use client';

import { useState, useEffect, DragEvent, useRef } from 'react';

interface ModelViewerProps {
  onModelLoaded?: () => void;
}

const ModelViewer: React.FC<ModelViewerProps> = ({ onModelLoaded }) => {
  const [modelSrc, setModelSrc] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const fileNameRef = useRef<string>('model');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsClient(true); // Set to true only on the client side
  }, []);

  // Effect to create and manage the model-viewer element
  useEffect(() => {
    if (!isClient || !containerRef.current) return;

    // Clear previous content
    containerRef.current.innerHTML = '';
    
    if (modelSrc) {
      // Create the model-viewer element programmatically
      const modelViewer = document.createElement('model-viewer');
      modelViewer.setAttribute('src', modelSrc);
      modelViewer.setAttribute('alt', 'A 3D model');
      modelViewer.setAttribute('id', 'model-viewer');
      modelViewer.setAttribute('camera-controls', '');
      modelViewer.setAttribute('auto-rotate', '');
      modelViewer.style.width = '100%';
      modelViewer.style.height = '100%';
      
      // Append to container
      containerRef.current.appendChild(modelViewer);
      
      // Set up load handler
      const handleLoad = () => {
        console.log('Model loaded');
        
        // Store references
        window.modelViewerElement = modelViewer;
        window.currentFileName = fileNameRef.current;
        
        console.log('Stored filename in global variable:', fileNameRef.current);
        
        if (onModelLoaded) {
          setTimeout(onModelLoaded, 100);
        }
      };
      
      modelViewer.addEventListener('load', handleLoad);
    }
  }, [isClient, modelSrc, onModelLoaded]);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'model/gltf-binary' || file.name.endsWith('.glb') || file.name.endsWith('.gltf'))) {
      // Store the original filename without extension
      const originalFileName = file.name.replace(/\.[^/.]+$/, "");
      fileNameRef.current = originalFileName;
      
      console.log('File dropped - storing filename:', originalFileName);
      
      const url = URL.createObjectURL(file);
      setModelSrc(url);
    } else {
      alert('Please drag and drop a valid .glb or .gltf file.');
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.classList.add('bg-[#EFEFEF]');
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.classList.remove('bg-[#EFEFEF]');
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className="w-full h-full flex items-center justify-center transition-colors duration-200"
    >
      <div className="w-full h-full flex items-center justify-center">
        {/* Container for the programmatically created model-viewer */}
        <div ref={containerRef} className="w-full h-full"></div>
        
        {/* Show a message if no model is loaded */}
        {!modelSrc && (
          <div className="text-center absolute">
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