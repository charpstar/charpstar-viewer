// app/components/ModelViewer.tsx
'use client'; // Mark this as a Client Component
import { useState, useEffect, DragEvent } from 'react';

const ModelViewer = () => {
  const [modelSrc, setModelSrc] = useState<string | null>(null); // No default model
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true); // Set to true only on the client side
  }, []);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'model/gltf-binary' || file.name.endsWith('.glb') || file.name.endsWith('.gltf'))) {
      const url = URL.createObjectURL(file);
      setModelSrc(url);
    } else {
      alert('Please drag and drop a valid .glb or .gltf file.');
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className="w-full h-full flex items-center justify-center"
    >
      <div className="w-full h-full flex items-center justify-center">
        {/* Render <model-viewer> only if a model is loaded */}
        {isClient && modelSrc && (
          <model-viewer
            src={modelSrc}
            alt="A 3D model"
            style={{ width: '100%', height: '100%' }}
            camera-controls
            auto-rotate
          ></model-viewer>
        )}
        {/* Show a message if no model is loaded */}
        {!modelSrc && (
          <p className="text-gray-600 text-lg text-center">
            Drag and drop a <strong>.glb</strong> or <strong>.gltf</strong> file here to view it.
          </p>
        )}
      </div>
    </div>
  );
};

export default ModelViewer;