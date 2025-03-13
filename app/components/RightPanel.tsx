// app/components/RightPanel.tsx
'use client';

import { useState } from 'react';
import MaterialProperties from './MaterialProperties';
import MaterialVariants from './MaterialVariants';

interface RightPanelProps {
  selectedNode: any | null;
  modelViewerRef: React.RefObject<any>;
}

const RightPanel: React.FC<RightPanelProps> = ({ selectedNode, modelViewerRef }) => {
  const [activeTab, setActiveTab] = useState<'materials' | 'variants'>('materials');

  return (
    <div className="h-[96.5%] flex flex-col">
      {/* Tab buttons - fixed at top */}
      <div className="flex border-b border-gray-200 mb-3 shrink-0">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            activeTab === 'materials'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
          onClick={() => setActiveTab('materials')}
        >
          Materials
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            activeTab === 'variants'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
          onClick={() => setActiveTab('variants')}
        >
          Variants
        </button>
      </div>

      {/* Tab content - scrollable area */}
      <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
        {activeTab === 'materials' && (
          <>
            {selectedNode ? (
              <>
                <div className="mb-2 text-xs text-blue-600">Selected: {selectedNode.name} ({selectedNode.type})</div>
                <MaterialProperties 
                  selectedNode={selectedNode} 
                  modelViewerRef={modelViewerRef}
                />
              </>
            ) : (
              <div className="text-gray-600 text-xs">Select a mesh to view its material properties.</div>
            )}
          </>
        )}

        {activeTab === 'variants' && (
          <MaterialVariants 
            modelViewerRef={modelViewerRef} 
          />
        )}
      </div>
    </div>
  );
};

export default RightPanel;