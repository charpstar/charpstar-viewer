// app/page.tsx
'use client'; // Mark this as a Client Component

import { useState, useEffect } from 'react';
import ModelViewer from './components/ModelViewer';
import StructureTree from './components/StructureTree';
import Image from 'next/image';

export default function Home() {
  const [modelStructure, setModelStructure] = useState<any>(null);

  // Fetch the model structure when the model is loaded
  useEffect(() => {
    const fetchModelStructure = () => {
      const structure = (window as any).modelViewer.getModelStructure();
      setModelStructure(structure);
    };

    // Listen for model load events
    const modelViewer = document.querySelector('model-viewer');
    if (modelViewer) {
      modelViewer.addEventListener('load', fetchModelStructure);
    }

    // Cleanup
    return () => {
      if (modelViewer) {
        modelViewer.removeEventListener('load', fetchModelStructure);
      }
    };
  }, []);

  return (
    <div className="h-screen flex flex-col">
      {/* Header (5% height) */}
      <header className="h-[5%] bg-[#FAFAFA] text-[#111827] flex items-center justify-start shadow-sm pl-4">
        <div className="flex items-center">
          <Image
            src="/logo.svg"
            alt="Charpstar Logo"
            width={120}
            height={40}
          />
        </div>
      </header>

      {/* Main Area (95% height) */}
      <main className="h-[95%] flex">
        {/* Column 1: Model Structure (15% width) */}
        <aside className="w-[15%] bg-[#FAFAFA] p-4 border-r border-gray-200 shadow-sm overflow-y-auto">
          <h2 className="text-[#111827] font-semibold">Model Structure</h2>
          {/* Render the model structure */}
          {modelStructure ? (
            <StructureTree node={modelStructure} />
          ) : (
            <p className="text-gray-600 text-sm mt-2">No model loaded.</p>
          )}
        </aside>

        {/* Column 2: 3D Viewer (70% width) */}
        <section className="w-[70%] bg-[#EFEFEF] p-4 shadow-inner">
          <ModelViewer />
        </section>

        {/* Column 3: Model Properties & Materials (15% width) */}
        <aside className="w-[15%] bg-[#FAFAFA] p-4 border-l border-gray-200 shadow-sm">
          <h2 className="text-[#111827] font-semibold">Properties & Materials</h2>
          {/* Placeholder for properties and materials */}
          <div className="mt-4 text-gray-600">(Properties and materials will go here)</div>
        </aside>
      </main>
    </div>
  );
}