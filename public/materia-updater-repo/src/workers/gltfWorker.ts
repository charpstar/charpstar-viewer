// src/workers/gltfWorker.ts

import { updateMaterials, exportIndividualVariants } from '../gltf/MaterialUpdater';
import { GltfData, MaterialData } from '../gltf/gltfTypes';

self.onmessage = async (e: MessageEvent) => {
  const { 
    referenceData, 
    targetData, 
    model, 
    reorderTextures, 
    materialData, 
    processingMode, 
    fileName,
    refFileName,
    targetFileName
  } = e.data;

  try {
    const reportProgress = (progress: number) => {
      self.postMessage({ type: 'progress', progress });
    };

    let result;
    if (processingMode === 'update') {
      result = await updateMaterials(
        referenceData,
        targetData,
        model,
        reorderTextures,
        materialData,
        refFileName,
        targetFileName,
        reportProgress
      );
    } else if (processingMode === 'export') {
      result = await exportIndividualVariants(
        targetData,
        fileName,
        model,
        reorderTextures,
        materialData,
        reportProgress
      );
    }
    
    self.postMessage({ type: 'complete', result });
  } catch (error) {
    self.postMessage({ 
      type: 'error', 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
};