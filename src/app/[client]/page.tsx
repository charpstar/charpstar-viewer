// src/app/[client]/page.tsx
'use client';

import { useParams } from 'next/navigation';
import { clients, isValidClient } from '@/config/clients';
import { useState, useEffect, useRef } from 'react';
import { Model } from 'flexlayout-react';
import FlexLayout from '@/components/layout/FlexLayout';
import Header from '@/components/layout/Header';
import { notFound } from 'next/navigation';
import 'flexlayout-react/style/dark.css';
import '@/styles/flexlayout-custom.css';

export default function ClientPage() {
  const params = useParams();
  const clientName = params.client as string;
  
  const [modelStructure, setModelStructure] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [activeEnvironment, setActiveEnvironment] = useState<'v5' | 'v6' | null>('v6');
  const [layoutModel, setLayoutModel] = useState<Model | null>(null);
  const [visiblePanels, setVisiblePanels] = useState({
    scene: true,
    materials: true,
    variants: true
  });
  const modelViewerRef = useRef<any>(null);

  // Validate client
  if (!isValidClient(clientName)) {
    notFound();
  }

  const clientConfig = clients[clientName];

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

  // Set up model viewer reference
  useEffect(() => {
    const setupModelViewer = () => {
      const modelViewer = document.getElementById('model-viewer');
      if (modelViewer) {
        modelViewerRef.current = modelViewer;
        
        if (modelViewer.getAttribute('src')) {
          fetchModelStructure();
        }
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

    return () => {
      observer.disconnect();
    };
  }, []);

  // Handler for variant change
  const handleVariantChange = () => {
    console.log('Variant changed, updating material view');
    fetchModelStructure();
  };

  // Handler for node selection
  const handleNodeSelect = (node: any) => {
    setSelectedNode(node);
  };

  // Improved panel visibility toggle
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

  // Handle save functionality

// Simplified handleSave function for page.tsx
const handleSave = async () => {
  if (!modelViewerRef.current?.saveGLTF) {
    console.error('saveGLTF method not available');
    return;
  }

  try {
    // Get the materials data from saveGLTF
    const materialsData = await modelViewerRef.current.saveGLTF();
    
    // Always use 'materials.json' as the filename
    const filename = 'materials.json';
    
    console.log('Saving materials.json file...');
    
    // Upload to Bunny CDN
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: materialsData,
        filename: filename
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to upload file: ${errorData.error || response.statusText}`);
    }
    
    const result = await response.json();
    
    // Show success message
    console.log('Materials saved successfully:', result.fileUrl);
    
    // Optional: Add a visual notification of success
    // For example, you could set a state variable to show a toast notification
    
  } catch (error) {
    console.error('Error saving materials:', error);
    
    // Optional: Add a visual notification of error
    // For example, you could set a state variable to show an error toast
  }
};

  return (
    <div className="layout-container">
      <div className="header-container">
        <Header 
          modelViewerRef={modelViewerRef}
          layoutModel={layoutModel}
          onSave={handleSave}
          onEnvironmentChange={handleEnvironmentChange}
          activeEnvironment={activeEnvironment}
          visiblePanels={visiblePanels}
          onTogglePanel={handleTogglePanel}
        />
      </div>
      
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
          clientModelUrl={clientConfig.modelUrl}
        />
      </div>
    </div>
  );
}