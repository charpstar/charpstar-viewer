// src/components/layout/SimpleLayout.tsx
'use client';

import React, { useState } from 'react';
import ModelViewer from '../ModelViewer';
import StructureTree from '../scene/StructureTree';
import MaterialProperties from '../material/MaterialProperties';
import MaterialVariants from '../variant/MaterialVariants';
import { Layers, Box, Palette } from 'lucide-react';

interface SimpleLayoutProps {
  modelStructure: any;
  selectedNode: any;
  modelViewerRef: React.RefObject<any>;
  onNodeSelect: (node: any) => void;
  onModelLoaded: () => void;
  onVariantChange: () => void;
  clientModelUrl?: string;
}

const SimpleLayout: React.FC<SimpleLayoutProps> = ({
  modelStructure,
  selectedNode,
  modelViewerRef,
  onNodeSelect,
  onModelLoaded,
  onVariantChange,
  clientModelUrl
}) => {
  const [variantChangeCounter, setVariantChangeCounter] = useState(0);

  // Handler for variant changes to force re-render of material panel
  const handleVariantChange = () => {
    setVariantChangeCounter(prev => prev + 1);
    onVariantChange?.();
  };

  return (
    <div className="flex h-full bg-gray-50">
      {/* Left panel - Scene */}
      <div className="w-64 bg-white shadow-md overflow-hidden flex flex-col">
        <div className="bg-gray-100 p-3 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <Layers size={18} className="text-gray-600" />
            <h3 className="text-sm font-medium text-gray-800">Scene Hierarchy</h3>
          </div>
        </div>
        <div className="p-3 flex-1 overflow-auto">
          {modelStructure ? (
            <StructureTree 
              node={modelStructure} 
              onNodeSelect={onNodeSelect}
              selectedNode={selectedNode}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-gray-400 text-xs mt-4">
                No model structure available
              </p>
              <p className="text-gray-400 text-xs mt-2">
                Upload a model or select an object
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Center panel - 3D Viewer */}
      <div className="flex-1 bg-white shadow-md overflow-hidden">
        <ModelViewer 
          onModelLoaded={onModelLoaded}
          clientModelUrl={clientModelUrl}
        />
      </div>

      {/* Right side panels container */}
      <div className="flex mr-2">
        {/* Variant panel */}
        <div className="w-64 bg-white shadow-md overflow-hidden flex flex-col">
          <div className="bg-gray-100 p-3 border-b border-gray-200">
            <div className="flex items-center space-x-2">
              <Box size={18} className="text-gray-600" />
              <h3 className="text-sm font-medium text-gray-800">Variants</h3>
            </div>
          </div>
          <div className="p-3 flex-1 overflow-auto">
            <MaterialVariants 
              modelViewerRef={modelViewerRef} 
              onVariantChange={handleVariantChange}
              selectedNode={selectedNode}
            />
          </div>
        </div>

        {/* Material panel */}
        <div className="w-80 bg-white shadow-md ml-2 overflow-hidden flex flex-col">
          <div className="bg-gray-100 p-3 border-b border-gray-200">
            <div className="flex items-center space-x-2">
              <Palette size={18} className="text-gray-600" />
              <h3 className="text-sm font-medium text-gray-800">Material Properties</h3>
            </div>
          </div>
          <div className="p-3 flex-1 overflow-auto">
            {selectedNode ? (
              <>
                <div className="mb-3 text-xs bg-gray-50 p-2 rounded-md border border-gray-200">
                  <span className="text-gray-500">Selected:</span> <span className="font-medium text-gray-700">{selectedNode.name}</span> 
                  <span className="text-gray-400 text-xs ml-1">({selectedNode.type})</span>
                </div>
                <MaterialProperties 
                  selectedNode={selectedNode} 
                  modelViewerRef={modelViewerRef}
                  variantChangeCounter={variantChangeCounter}
                />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <Palette size={24} className="text-gray-300 mb-2" />
                <p className="text-gray-400 text-xs">
                  Select a mesh to view its material properties
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimpleLayout;