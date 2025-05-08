// src/app/[client]/page.tsx
'use client';

import { useParams } from 'next/navigation';
import { clients, isValidClient } from '@/config/clients';
import { useState, useEffect, useRef } from 'react';
import SimpleLayout from '@/components/layout/SimpleLayout';
import Header from '@/components/layout/Header';
import { notFound } from 'next/navigation';

export default function ClientPage() {
  const params = useParams();
  const clientName = params.client as string;
  
  const [modelStructure, setModelStructure] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const modelViewerRef = useRef<any>(null);
  const [modelLoaded, setModelLoaded] = useState(false);

  // Validate client
  if (!isValidClient(clientName)) {
    notFound();
  }

  const clientConfig = clients[clientName];

  // Enhanced function to fetch the model structure with retry logic
  const fetchModelStructure = () => {
    if (modelViewerRef.current && typeof modelViewerRef.current.getModelStructure === 'function') {
      try {
        const structure = modelViewerRef.current.getModelStructure();
        
        if (structure) {
          console.log('Model structure loaded:', structure);
          setModelStructure(structure);
          return true;
        } else {
          console.warn('Model structure is empty or null');
          return false;
        }
      } catch (error) {
        console.error('Error fetching model structure:', error);
        return false;
      }
    } else {
      console.warn('modelViewer or getModelStructure method not available');
      return false;
    }
  };
  
  // Set up retry logic for fetching model structure
  useEffect(() => {
    if (modelLoaded && !modelStructure) {
      console.log('Model loaded but structure not yet available, attempting to fetch...');
      
      // Try immediately first
      if (!fetchModelStructure()) {
        // If first attempt fails, set up a retry mechanism
        const retryAttempts = 5;
        let currentAttempt = 0;
        
        const retryInterval = setInterval(() => {
          currentAttempt++;
          console.log(`Retry attempt ${currentAttempt} of ${retryAttempts}`);
          
          if (fetchModelStructure() || currentAttempt >= retryAttempts) {
            clearInterval(retryInterval);
            
            if (currentAttempt >= retryAttempts && !modelStructure) {
              console.error('Failed to fetch model structure after multiple attempts');
            }
          }
        }, 500); // Try every 500ms
        
        return () => clearInterval(retryInterval);
      }
    }
  }, [modelLoaded, modelStructure]);

  // Set up model viewer reference
  useEffect(() => {
    const setupModelViewer = () => {
      const modelViewer = document.getElementById('model-viewer');
      if (modelViewer) {
        modelViewerRef.current = modelViewer;
        
        if (modelViewer.getAttribute('src')) {
          // We don't call fetchModelStructure here anymore
          // It will be called by the onModelLoaded handler
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

  // Handler for model loaded event
  const handleModelLoaded = () => {
    console.log('Model loaded event received');
    setModelLoaded(true);
    fetchModelStructure();
  };

  // Handler for variant change
  const handleVariantChange = () => {
    console.log('Variant changed, updating material view');
    fetchModelStructure();
  };

  // Handler for node selection
  const handleNodeSelect = (node: any) => {
    setSelectedNode(node);
  };

  // Debugged handleSave function for page.tsx
  const handleSave = async () => {
    if (!modelViewerRef.current?.saveGLTF) {
      console.error('saveGLTF method not available');
      return;
    }

    try {
      // Get all resource data from saveGLTF
      console.log('Calling saveGLTF...');
      const resourceData = await modelViewerRef.current.saveGLTF();
      
      // Debug what we got back
      console.log('saveGLTF returned:', {
        hasMaterials: !!resourceData.materials,
        hasTextures: !!resourceData.textures,
        hasImages: !!resourceData.images,
        materialsCount: resourceData.materials?.length,
        texturesCount: resourceData.textures?.length,
        imagesCount: resourceData.images?.length
      });
      
      // Track upload results
      const uploadResults = {
        materials: false,
        textures: false,
        images: false
      };
      
      // Upload materials.json
      if (resourceData.materials) {
        console.log('Uploading materials.json...');
        const materialsResponse = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            data: resourceData.materials,
            filename: 'materials.json',
            client: clientName // Add client name to request
          })
        });

        if (materialsResponse.ok) {
          const result = await materialsResponse.json();
          console.log('Materials saved successfully:', result.fileUrl);
          uploadResults.materials = true;
        } else {
          const errorData = await materialsResponse.json();
          console.error(`Failed to upload materials: ${errorData.error || materialsResponse.statusText}`);
        }
      } else {
        console.warn('No materials data available to upload');
      }
      
      // Check overall success and provide feedback
      const successCount = Object.values(uploadResults).filter(Boolean).length;
      const totalCount = Object.keys(uploadResults).length;
      
      if (successCount === totalCount) {
        console.log('All files saved successfully!');
        // Here you could add a toast notification or some UI feedback
      } else if (successCount > 0) {
        console.log(`${successCount}/${totalCount} files saved successfully`);
        // Partial success notification
      } else {
        console.error('Failed to save any files');
        // Error notification
      }
      
    } catch (error) {
      console.error('Error saving resources:', error);
      // Error notification
    }
  };

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-none">
        <Header 
          modelViewerRef={modelViewerRef}
          onSave={handleSave}
        />
      </div>
      
      <div className="flex-1 overflow-hidden">
        <SimpleLayout
          modelStructure={modelStructure}
          selectedNode={selectedNode}
          modelViewerRef={modelViewerRef}
          onNodeSelect={handleNodeSelect}
          onModelLoaded={handleModelLoaded}
          onVariantChange={handleVariantChange}
          clientModelUrl={clientConfig?.modelUrl} // Only in client page
        />
      </div>
    </div>
  );
}