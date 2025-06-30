// src/app/[client]/page.tsx
'use client';

import { useParams } from 'next/navigation';
import { clients, isValidClient } from '@/config/clientConfig';
import { useState, useEffect, useRef } from 'react';
import SimpleLayout from '@/components/layout/SimpleLayout';
import Header from '@/components/layout/Header';
import SaveProgressOverlay from '@/components/SaveProgressOverlay';
import SavePasswordDialog from '@/components/SavePasswordDialog';
import ModelChangeWarningDialog from '@/components/ModelChangeWarningDialog';
import InputLocker from '@/components/InputLocker';
import { notFound } from 'next/navigation';

export default function ClientPage() {
  const params = useParams();
  const clientName = params.client as string;
  
  // Validate client
  if (!isValidClient(clientName)) {
    notFound();
  }

  const clientConfig = clients[clientName];
  
  const [modelStructure, setModelStructure] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const modelViewerRef = useRef<any>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [currentModelUrl, setCurrentModelUrl] = useState<string>(clientConfig?.modelUrl || '');
  const [currentModelName, setCurrentModelName] = useState<string>(() => {
    // Extract model name from initial URL
    if (clientConfig?.modelUrl) {
      return clientConfig.modelUrl.split('/').pop() || '';
    }
    return '';
  });
  
  // Save progress state
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveMessage, setSaveMessage] = useState("Preparing to save changes...");
  
  // Password dialog state
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);

  // Model change warning dialog state
  const [isModelWarningOpen, setIsModelWarningOpen] = useState(false);
  const [pendingModelChange, setPendingModelChange] = useState<{url: string, name: string} | null>(null);
  
  // Global cache-busting timestamp to force fresh loads of all models after saves
  const [globalCacheTimestamp, setGlobalCacheTimestamp] = useState<number | null>(null);

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

  // Handler for model change from selector - shows warning first
  const handleModelChange = (modelUrl: string, modelName: string) => {
    // If this is the same model, no need to warn
    if (modelUrl === currentModelUrl) {
      return;
    }
    
    // Store the pending change and show warning dialog
    setPendingModelChange({ url: modelUrl, name: modelName });
    setIsModelWarningOpen(true);
  };

  // Handler for confirming model change after warning
  const handleConfirmModelChange = () => {
    if (pendingModelChange) {
      console.log('Model changed to:', pendingModelChange.name, pendingModelChange.url);
      
      // If we have a global cache timestamp, apply it to the new model URL too
      let finalUrl = pendingModelChange.url;
      if (globalCacheTimestamp) {
        const baseUrl = finalUrl.split('?')[0];
        finalUrl = `${baseUrl}?v=${globalCacheTimestamp}`;
      }
      
      setCurrentModelUrl(finalUrl);
      setCurrentModelName(pendingModelChange.name);
      
      // Reset model-related state
      setModelLoaded(false);
      setModelStructure(null);
      setSelectedNode(null);
    }
    
    // Close dialog and clear pending change
    setIsModelWarningOpen(false);
    setPendingModelChange(null);
  };

  // Handler for canceling model change
  const handleCancelModelChange = () => {
    setIsModelWarningOpen(false);
    setPendingModelChange(null);
  };

  // Function to refresh the model after successful save
  const refreshModel = () => {
    console.log('Refreshing model to show saved changes...');
    
    // Set global cache timestamp to bust cache for ALL models
    const timestamp = Date.now();
    setGlobalCacheTimestamp(timestamp);
    
    // Add a cache-busting timestamp parameter to force a fresh load
    const baseUrl = currentModelUrl.split('?')[0]; // Remove any existing parameters
    const refreshedUrl = `${baseUrl}?v=${timestamp}`;
    
    // Update the model URL to trigger a refresh
    setCurrentModelUrl(refreshedUrl);
    
    // Reset model-related state to ensure proper reload
    setModelLoaded(false);
    setModelStructure(null);
    setSelectedNode(null);
  };

  // Enhanced handleSave function with password confirmation
  const handleSave = async () => {
    setIsPasswordDialogOpen(true);
  };

  // New function to handle the actual save after password confirmation
  const handleConfirmedSave = async () => {
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
      
      // Use the complete GLTF from saveGLTF (it already includes everything!)
      console.log('Using complete GLTF from saveGLTF...');
      let gltfData = null;
      
      if (resourceData.gltf && typeof resourceData.gltf === 'string') {
        gltfData = resourceData.gltf;
        console.log('Using complete GLTF from saveGLTF:', gltfData.length, 'characters');
      } else {
        console.error('No complete GLTF data returned from saveGLTF');
      }
      
      // Debug what we got back
      console.log('saveGLTF returned:', {
        hasMaterials: !!resourceData.materials,
        hasTextures: !!resourceData.textures,
        hasImages: !!resourceData.images,
        materialsCount: resourceData.materials?.length,
        texturesCount: resourceData.textures?.length,
        imagesCount: resourceData.images?.length,
        hasGltfData: !!gltfData
      });
      
      setSaveProgress(20);
      setSaveMessage("Uploading material changes...");
      
      // Track upload results
      const uploadResults = {
        materials: false,
        gltf: false,
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
          setSaveProgress(40);
          setSaveMessage("Materials uploaded successfully...");
        } else {
          const errorData = await materialsResponse.json();
          console.error(`Failed to upload materials: ${errorData.error || materialsResponse.statusText}`);
          setSaveMessage("Error saving materials. Please try again.");
        }
      } else {
        console.warn('No materials data available to upload');
        setSaveProgress(40);
      }

      // Upload complete GLTF file to Uploads folder
      if (gltfData) {
        console.log('Uploading complete GLTF file...');
        setSaveMessage("Uploading complete model file...");
        
        // Generate counter-based filename: 0001-Day-Month-Year-TimeinMinutes
        let savedGltfFilename = '';
        try {
          // Get existing files to determine next counter
          const listResponse = await fetch(`/api/list-uploads?client=${clientName}`);
          if (listResponse.ok) {
            const listData = await listResponse.json();
            const existingFiles = listData.files || [];
            
            // Find highest counter from existing files matching pattern
            let highestCounter = 0;
            const counterPattern = /^(\d{4})-\d{2}-\d{2}-\d{4}-\d{4}\.gltf$/;
            
            existingFiles.forEach((filename: string) => {
              const match = filename.match(counterPattern);
              if (match) {
                const counter = parseInt(match[1], 10);
                if (counter > highestCounter) {
                  highestCounter = counter;
                }
              }
            });
            
            // Generate next counter (padded to 4 digits)
            const nextCounter = (highestCounter + 1).toString().padStart(4, '0');
            
            // Generate timestamp parts
            const now = new Date();
            const day = now.getDate().toString().padStart(2, '0');
            const month = (now.getMonth() + 1).toString().padStart(2, '0');
            const year = now.getFullYear();
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            
            savedGltfFilename = `${nextCounter}-${day}-${month}-${year}-${hours}${minutes}.gltf`;
          } else {
            // Fallback to basic counter if API fails
            savedGltfFilename = `0001-${new Date().toISOString().split('T')[0]}-0000.gltf`;
          }
        } catch (error) {
          console.error('Error generating counter-based filename:', error);
          // Fallback to basic naming
          savedGltfFilename = `0001-${new Date().toISOString().split('T')[0]}-0000.gltf`;
        }
        
        console.log('Generated filename:', savedGltfFilename);
        
        const gltfResponse = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            data: gltfData,
            filename: savedGltfFilename,
            client: clientName,
            targetFolder: 'Uploads' // Specify uploads folder
          })
        });

        if (gltfResponse.ok) {
          const result = await gltfResponse.json();
          console.log('GLTF saved successfully:', result.fileUrl);
          uploadResults.gltf = true;
          setSaveProgress(65);
          setSaveMessage("Complete model uploaded successfully...");
        } else {
          const errorData = await gltfResponse.json();
          console.error(`Failed to upload GLTF: ${errorData.error || gltfResponse.statusText}`);
          setSaveMessage("Warning: Failed to save complete model file.");
        }
      } else {
        console.warn('No GLTF data available to upload');
        setSaveProgress(65);
      }
      
      // Process textures data if needed
      if (resourceData.textures) {
        setSaveMessage("Processing textures...");
        setSaveProgress(75);
        // Process textures data here
        uploadResults.textures = true;
      }
      
      // Process images data if needed
      if (resourceData.images) {
        setSaveMessage("Processing images...");
        setSaveProgress(85);
        // Process images data here
        uploadResults.images = true;
      }
      
      // Final processing
      setSaveProgress(95);
      setSaveMessage("Finalizing changes...");
      
      // Add a small delay to show progress completion
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check overall success and provide feedback
      const successCount = Object.values(uploadResults).filter(Boolean).length;
      
      // Calculate total expected uploads (materials + gltf + any other resources)
      let expectedUploads = 0;
      if (resourceData.materials) expectedUploads++;
      if (gltfData) expectedUploads++;
      if (resourceData.textures) expectedUploads++;
      if (resourceData.images) expectedUploads++;
      
      if (successCount === expectedUploads && expectedUploads > 0) {
        console.log('All files saved successfully!');
        setSaveProgress(100);
        setSaveMessage("Materials and model saved successfully!");
        
        // Update message to indicate model refresh
        setTimeout(() => {
          setSaveMessage("Refreshing model to show changes...");
          refreshModel();
        }, 800); // Small delay to show success message first
        
        // Keep success message visible briefly before hiding overlay
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else if (successCount > 0) {
        console.log(`${successCount}/${expectedUploads} files saved successfully`);
        setSaveProgress(100);
        setSaveMessage(`Partially completed: ${successCount}/${expectedUploads} resources saved.`);
        
        // Update message to indicate model refresh
        setTimeout(() => {
          setSaveMessage("Refreshing model to show changes...");
          refreshModel();
        }, 1000); // Longer delay for partial success message
        
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
      
    } catch (error: unknown) {
      console.error('Error saving resources:', error);
      setSaveProgress(100);
      
      // Fix for TypeScript error - properly type check the error
      let errorMessage = "Unknown error occurred";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object' && 'message' in error) {
        errorMessage = String(error.message);
      }
      
      setSaveMessage(`Error: ${errorMessage}`);
      
      // Keep error message visible
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Reset the UI state
      setIsSaving(false);
      setSaveProgress(0);
    }
  };

  // Handle password confirmation
  const handlePasswordConfirm = (password: string) => {
    const isCorrect = password === clientConfig.livePassword;
    if (isCorrect) {
      setIsPasswordDialogOpen(false);
      handleConfirmedSave();
    }
    return isCorrect; // Return whether the password was correct
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Save Progress Overlay */}
      <SaveProgressOverlay 
        isVisible={isSaving} 
        progress={saveProgress} 
        message={saveMessage}
      />
      
      {/* Password Confirmation Dialog */}
      <SavePasswordDialog
        isOpen={isPasswordDialogOpen}
        onClose={() => setIsPasswordDialogOpen(false)}
        onConfirm={handlePasswordConfirm}
      />
      
      {/* Model Change Warning Dialog */}
      <ModelChangeWarningDialog
        isOpen={isModelWarningOpen}
        newModelName={pendingModelChange?.name || ''}
        onConfirm={handleConfirmModelChange}
        onCancel={handleCancelModelChange}
      />
      
      {/* Input Locker - Blocks all user interaction when saving */}
      <InputLocker isLocked={isSaving} />
      
      <div className="flex-none">
        <Header 
          modelViewerRef={modelViewerRef}
          onSave={handleSave}
          isSaving={isSaving}
          onModelChange={handleModelChange}
          currentModel={currentModelName}
          cacheTimestamp={globalCacheTimestamp}
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
          clientModelUrl={currentModelUrl} // Dynamic model URL
        />
      </div>
    </div>
  );
}