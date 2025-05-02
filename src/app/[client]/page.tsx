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
            filename: 'materials.json'
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
      
      // Upload textures.json if available
      if (resourceData.textures) {
        console.log('Uploading textures.json...');
        const texturesResponse = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            data: resourceData.textures,
            filename: 'textures.json'
          })
        });

        if (texturesResponse.ok) {
          const result = await texturesResponse.json();
          console.log('Textures saved successfully:', result.fileUrl);
          uploadResults.textures = true;
        } else {
          const errorData = await texturesResponse.json();
          console.error(`Failed to upload textures: ${errorData.error || texturesResponse.statusText}`);
        }
      } else {
        console.warn('No textures data available to upload');
      }
      
      // Upload images.json if available
      if (resourceData.images) {
        console.log('Uploading images.json...');
        const imagesResponse = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            data: resourceData.images,
            filename: 'images.json'
          })
        });

        if (imagesResponse.ok) {
          const result = await imagesResponse.json();
          console.log('Images saved successfully:', result.fileUrl);
          uploadResults.images = true;
        } else {
          const errorData = await imagesResponse.json();
          console.error(`Failed to upload images: ${errorData.error || imagesResponse.statusText}`);
        }
      } else {
        console.warn('No images data available to upload');
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
  onModelLoaded={fetchModelStructure}
  onVariantChange={handleVariantChange}
  clientModelUrl={clientConfig?.modelUrl} // Only in client page
/>
      </div>
    </div>
  );
}