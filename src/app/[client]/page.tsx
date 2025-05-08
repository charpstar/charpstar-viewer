// src/app/[client]/page.tsx
'use client';

import { useParams } from 'next/navigation';
import { clients, isValidClient } from '@/config/clients';
import { useState, useEffect, useRef } from 'react';
import SimpleLayout from '@/components/layout/SimpleLayout';
import Header from '@/components/layout/Header';
import SaveProgressOverlay from '@/components/SaveProgressOverlay';
import InputLocker from '@/components/InputLocker';
import { notFound } from 'next/navigation';

export default function ClientPage() {
  const params = useParams();
  const clientName = params.client as string;
  
  const [modelStructure, setModelStructure] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const modelViewerRef = useRef<any>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  
  // Save progress state
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveMessage, setSaveMessage] = useState("Preparing to save changes...");

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

  // Enhanced handleSave function with progress tracking
  const handleSave = async () => {
    if (!modelViewerRef.current?.saveGLTF) {
      console.error('saveGLTF method not available');
      return;
    }

    try {
      // Start saving process - show overlay and lock UI
      setIsSaving(true);
      setSaveProgress(10);
      setSaveMessage("Preparing materials data...");

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
      
      setSaveProgress(30);
      setSaveMessage("Uploading material changes...");
      
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
          setSaveProgress(60);
          setSaveMessage("Processing materials...");
        } else {
          const errorData = await materialsResponse.json();
          console.error(`Failed to upload materials: ${errorData.error || materialsResponse.statusText}`);
          setSaveMessage("Error saving materials. Please try again.");
        }
      } else {
        console.warn('No materials data available to upload');
        setSaveProgress(60);
      }
      
      // Process textures data if needed
      if (resourceData.textures) {
        setSaveMessage("Processing textures...");
        setSaveProgress(70);
        // Process textures data here
        uploadResults.textures = true;
      }
      
      // Process images data if needed
      if (resourceData.images) {
        setSaveMessage("Processing images...");
        setSaveProgress(80);
        // Process images data here
        uploadResults.images = true;
      }
      
      // Final processing
      setSaveProgress(90);
      setSaveMessage("Finalizing changes...");
      
      // Add a small delay to show progress completion
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check overall success and provide feedback
      const successCount = Object.values(uploadResults).filter(Boolean).length;
      const totalCount = Object.keys(uploadResults).filter(key => !!resourceData[key]).length;
      
      if (successCount === totalCount) {
        console.log('All files saved successfully!');
        setSaveProgress(100);
        setSaveMessage("Changes saved successfully!");
        
        // Keep success message visible briefly before hiding overlay
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else if (successCount > 0) {
        console.log(`${successCount}/${totalCount} files saved successfully`);
        setSaveProgress(100);
        setSaveMessage(`Partially completed: ${successCount}/${totalCount} resources saved.`);
        
        // Keep partial success message visible briefly
        await new Promise(resolve => setTimeout(resolve, 1500));
      } else {
        console.error('Failed to save any files');
        setSaveProgress(100);
        setSaveMessage("Failed to save changes. Please try again.");
        
        // Keep error message visible longer
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Reset the UI state
      setIsSaving(false);
      setSaveProgress(0);
      
    } catch (error) {
      console.error('Error saving resources:', error);
      setSaveProgress(100);
      setSaveMessage(`Error: ${error.message || "Unknown error occurred"}`);
      
      // Keep error message visible
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Reset the UI state
      setIsSaving(false);
      setSaveProgress(0);
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Save Progress Overlay */}
      <SaveProgressOverlay 
        isVisible={isSaving} 
        progress={saveProgress} 
        message={saveMessage}
      />
      
      {/* Input Locker - Blocks all user interaction when saving */}
      <InputLocker isLocked={isSaving} />
      
      <div className="flex-none">
        <Header 
          modelViewerRef={modelViewerRef}
          onSave={handleSave}
          isSaving={isSaving}
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