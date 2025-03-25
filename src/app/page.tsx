// src/app/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { Model } from 'flexlayout-react';
import FlexLayout from '@/components/layout/FlexLayout';
import Header from '@/components/layout/Header';
import 'flexlayout-react/style/dark.css';
import '@/styles/flexlayout-custom.css';

export default function Home() {
  const [modelStructure, setModelStructure] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [activeEnvironment, setActiveEnvironment] = useState<'v5' | 'v6' | null>('v6'); // Set v6 as default
  const [layoutModel, setLayoutModel] = useState<Model | null>(null);
  const [visiblePanels, setVisiblePanels] = useState({
    scene: true,
    materials: true,
    variants: true
  });
  const modelViewerRef = useRef<any>(null);

  // Handler for node selection
  const handleNodeSelect = (node: any) => {
    console.log('Home component received selected node:', node.name, node.type);
    setSelectedNode(node);
  };

  // Panel visibility toggle
  const handleTogglePanel = (panel: 'scene' | 'materials' | 'variants') => {
    setVisiblePanels(prev => ({
      ...prev,
      [panel]: !prev[panel]
    }));
  };

  // Handle layout model updates
  const handleLayoutModelUpdate = (model: Model) => {
    setLayoutModel(model);
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

  // Environment tester functions
  const handleEnvironmentChange = (env: 'v5' | 'v6') => {
    if (modelViewerRef.current) {
      if (env === 'v5') {
        modelViewerRef.current.environmentImage = "https://cdn.charpstar.net/Demos/warm.hdr";
        modelViewerRef.current.exposure = "1.3";
        modelViewerRef.current.toneMapping = "commerce";
      } else {
        modelViewerRef.current.environmentImage = "https://cdn.charpstar.net/Demos/HDR_Furniture.hdr";
        modelViewerRef.current.exposure = "1.5";
        modelViewerRef.current.toneMapping = "aces";
      }
      
      setActiveEnvironment(env);
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
        
        // Apply the current environment settings
        handleEnvironmentChange(activeEnvironment || 'v6');
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
  }, [activeEnvironment]);

  // Handler for variant change
  const handleVariantChange = () => {
    console.log('Variant changed, updating material view');
    // This will trigger a re-render of material properties
  };

  return (
    <div className="layout-container">
      {/* Header - with explicit z-index to ensure it's above the layout */}
      <div className="header-container">
        <Header 
          modelViewerRef={modelViewerRef}
          layoutModel={layoutModel}
          onExportGLB={handleExportGLB}
          onExportGLTF={handleExportGLTF}
          onExportUSDZ={handleExportUSDZ}
          onEnvironmentChange={handleEnvironmentChange}
          activeEnvironment={activeEnvironment}
          visiblePanels={visiblePanels}
          onTogglePanel={handleTogglePanel}
        />
      </div>
      
      {/* Main Area with FlexLayout */}
      <div className="main-container">
        <FlexLayout
          modelStructure={modelStructure}
          selectedNode={selectedNode}
          modelViewerRef={modelViewerRef}
          onNodeSelect={handleNodeSelect}
          onModelLoaded={fetchModelStructure}
          onVariantChange={handleVariantChange}
          visiblePanels={visiblePanels}
          onLayoutModelUpdate={handleLayoutModelUpdate}
          onTogglePanel={handleTogglePanel}
        />
      </div>
    </div>
  );
}