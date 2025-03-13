'use client';

import { useState, useEffect, useRef } from 'react';
import ModelViewer from './components/ModelViewer';
import StructureTree from './components/StructureTree';
import RightPanel from './components/RightPanel';
import Image from 'next/image';

export default function Home() {
  const [modelStructure, setModelStructure] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const modelViewerRef = useRef<any>(null); // Reference to the model-viewer element

  // Handler for node selection
  const handleNodeSelect = (node: any) => {
    console.log('Home component received selected node:', node.name, node.type);
    setSelectedNode(node);
  };

  // Export functions
  const handleExportGLB = () => {
    if (modelViewerRef.current && typeof modelViewerRef.current.exportGLB === 'function') {
      console.log('Exporting GLB...');
      modelViewerRef.current.exportGLB();
    } else {
      console.error('exportGLB method not available on model viewer');
    }
  };

  const handleExportGLTF = () => {
    if (modelViewerRef.current && typeof modelViewerRef.current.exportGLTF === 'function') {
      console.log('Exporting GLTF...');
      modelViewerRef.current.exportGLTF();
    } else {
      console.error('exportGLTF method not available on model viewer');
    }
  };

  const handleExportUSDZ = () => {
    if (modelViewerRef.current && typeof modelViewerRef.current.exportUSDZ === 'function') {
      console.log('Exporting USDZ...');
      modelViewerRef.current.exportUSDZ();
    } else {
      console.error('exportUSDZ method not available on model viewer');
    }
  };

  // Function to fetch the model structure
  const fetchModelStructure = () => {
    // Make sure the viewer is loaded and our method exists
    if (modelViewerRef.current && typeof modelViewerRef.current.getModelStructure === 'function') {
      try {
        const structure = modelViewerRef.current.getModelStructure();
        console.log('Model structure loaded:', structure);
        setModelStructure(structure);
      } catch (error) {
        console.error('Error fetching model structure:', error);
      }
    } else {
      console.warn('modelViewer or getModelStructure method not available');
    }
  };

  // Set up a MutationObserver to detect when model-viewer element is loaded
  useEffect(() => {
    // Check for existing model-viewer
    const setupModelViewer = () => {
      const modelViewer = document.querySelector('model-viewer');
      if (modelViewer) {
        modelViewerRef.current = modelViewer;
        
        // Check if a model is already loaded
        if (modelViewer.getAttribute('src')) {
          fetchModelStructure();
        }
        
        // Listen for model load events
        modelViewer.addEventListener('load', fetchModelStructure);
      }
    };

    // Initial setup
    setupModelViewer();

    // MutationObserver to detect when model-viewer is added to DOM 
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length) {
          const modelViewer = document.querySelector('model-viewer');
          if (modelViewer && !modelViewerRef.current) {
            setupModelViewer();
          }
        }
      });
    });

    // Start observing the document body for changes
    observer.observe(document.body, { childList: true, subtree: true });

    // Cleanup function
    return () => {
      observer.disconnect();
      if (modelViewerRef.current) {
        modelViewerRef.current.removeEventListener('load', fetchModelStructure);
      }
    };
  }, []);

  return (
    <div className="h-screen flex flex-col">
      {/* Header (3.5% height - reduced by 30%) */}
      <header className="h-[3.5%] bg-[#FAFAFA] text-[#111827] flex items-center justify-between pl-4 pr-4 border-b border-gray-200">
        <div className="flex items-center">
          <Image
            src="/logo.svg"
            alt="Charpstar Logo"
            width={100}
            height={30}
          />
        </div>
        
        <div className="flex space-x-2">
          <button 
            className="bg-gray-200 hover:bg-gray-300 text-xs px-3 py-1 rounded-sm"
            onClick={handleExportGLB}
          >
            Export GLB
          </button>
          <button 
            className="bg-gray-200 hover:bg-gray-300 text-xs px-3 py-1 rounded-sm"
            onClick={handleExportGLTF}
          >
            Export GLTF
          </button>
          <button 
            className="bg-gray-200 hover:bg-gray-300 text-xs px-3 py-1 rounded-sm"
            onClick={handleExportUSDZ}
          >
            Export USDZ
          </button>
        </div>
      </header>
      
      {/* Main Area (96.5% height - increased to compensate for header) */}
      <main className="h-[96.5%] flex">
        {/* Column 1: Model Structure (15% width) */}
        <aside className="w-[15%] bg-[#FAFAFA] border-r border-gray-200 overflow-y-auto flex flex-col">
          
          {/* Render the model structure */}
          <div className="flex-grow overflow-y-auto py-4">
            {modelStructure ? (
              <StructureTree 
                node={modelStructure} 
                onNodeSelect={handleNodeSelect}
                selectedNode={selectedNode}
              />
            ) : (
              <p className="text-gray-600 text-xs px-4">
                No model loaded or structure data not available.
              </p>
            )}
          </div>
        </aside>
        
        {/* Column 2: 3D Viewer (70% width) */}
        <section className="w-[70%] bg-[#EFEFEF] p-4">
          <ModelViewer onModelLoaded={fetchModelStructure} />
        </section>
        
        {/* Column 3: Properties & Materials (15% width) */}
        <aside className="w-[15%] bg-[#FAFAFA] p-4 border-l border-gray-200">
          <RightPanel 
            selectedNode={selectedNode} 
            modelViewerRef={modelViewerRef}
          />
        </aside>
      </main>
    </div>
  );
}