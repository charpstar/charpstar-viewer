// src/app/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import Header from '@/components/layout/Header';
import SimpleLayout from '@/components/layout/SimpleLayout';

export default function Home() {
  const [modelStructure, setModelStructure] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const modelViewerRef = useRef<any>(null);

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
    const setupModelViewer = () => {
      const modelViewer = document.querySelector('model-viewer');
      if (modelViewer) {
        modelViewerRef.current = modelViewer;
        
        if (modelViewer.getAttribute('src')) {
          fetchModelStructure();
        }
        
        modelViewer.addEventListener('load', fetchModelStructure);
      }
    };

    setupModelViewer();

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

    observer.observe(document.body, { childList: true, subtree: true });

    // Add window resize event for responsive layout
    const handleResize = () => {
      if (modelViewerRef.current && typeof modelViewerRef.current.requestRender === 'function') {
        modelViewerRef.current.requestRender();
      }
    };
    
    window.addEventListener('resize', handleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
      if (modelViewerRef.current) {
        modelViewerRef.current.removeEventListener('load', fetchModelStructure);
      }
    };
  }, []);

  // Handler for variant change
  const handleVariantChange = () => {
    console.log('Variant changed, updating material view');
    // This will trigger a re-render of material properties
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex-none">
        <Header 
          modelViewerRef={modelViewerRef}
          onExportGLB={handleExportGLB}
          onExportGLTF={handleExportGLTF}
          onExportUSDZ={handleExportUSDZ}
        />
      </div>
      
      {/* Main Area with SimpleLayout */}
      <div className="flex-1 overflow-hidden">
       <SimpleLayout
  modelStructure={modelStructure}
  selectedNode={selectedNode}
  modelViewerRef={modelViewerRef}
  onNodeSelect={handleNodeSelect}
  onModelLoaded={fetchModelStructure}
  onVariantChange={handleVariantChange}
/>
      </div>
    </div>
  );
}