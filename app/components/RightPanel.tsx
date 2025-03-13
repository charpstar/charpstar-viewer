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
    <div className="flex flex-col h-full">
      {/* Tab buttons */}
      <div className="flex border-b border-gray-200 mb-3">
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

      {/* Tab content */}
      <div className="flex-grow overflow-y-auto">
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