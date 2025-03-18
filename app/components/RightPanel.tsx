// app/components/RightPanel.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import MaterialProperties from './MaterialProperties';
import MaterialVariants from './MaterialVariants';
import ResizablePanel from './ResizablePanel';

interface RightPanelProps {
  selectedNode: any | null;
  modelViewerRef: React.RefObject<any>;
}

const RightPanel: React.FC<RightPanelProps> = ({ 
  selectedNode,
  modelViewerRef
}) => {
  const [variantChangeCount, setVariantChangeCount] = useState(0);
  const [variantsPanelSize, setVariantsPanelSize] = useState(40); // Initial size as percentage
  
  // Calculate properties panel size based on variants panel size
  const propertiesPanelSize = 100 - variantsPanelSize;

  // Handler for variant change
  const handleVariantChange = useCallback(() => {
    // Force re-render of the MaterialProperties component
    setVariantChangeCount(prev => prev + 1);
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Main content container with fixed height */}
      <div className="flex h-full">
        {/* Variants section */}
        <ResizablePanel
          direction="horizontal"
          initialSize={variantsPanelSize}
          minSize={20}
          maxSize={60}
          onResize={setVariantsPanelSize}
          className="pr-3 border-r border-gray-200 h-full flex flex-col"
        >
          <h3 className="text-sm font-medium mb-4 shrink-0">Variants</h3>
          <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent flex-grow">
            <MaterialVariants 
              modelViewerRef={modelViewerRef} 
              onVariantChange={handleVariantChange}
            />
          </div>
        </ResizablePanel>
        
        {/* Material properties section */}
        <div className="pl-4 h-full flex flex-col" style={{ width: `${propertiesPanelSize}%` }}>
          <h3 className="text-sm font-medium mb-4 shrink-0">Material Properties</h3>
          
          {selectedNode ? (
            <>
              <div className="mb-2 text-xs text-blue-600 shrink-0">Selected: {selectedNode.name} ({selectedNode.type})</div>
              <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent flex-grow">
                <MaterialProperties 
                  key={`material-${selectedNode.uuid}-${variantChangeCount}`}
                  selectedNode={selectedNode} 
                  modelViewerRef={modelViewerRef}
                />
              </div>
            </>
          ) : (
            <div className="text-gray-600 text-xs">Select a mesh to view its material properties.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RightPanel;