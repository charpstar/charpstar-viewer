// components/StructureTree.tsx
'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, Box } from 'lucide-react';

// Define types for THREE.js objects
interface Object3D {
  name: string;
  type: string;
  children?: Object3D[];
  uuid: string;
  visible?: boolean;
  // Add other properties as needed
}

interface TreeNodeProps {
  node: Object3D;
  depth?: number;
  onSelectNode?: (node: Object3D) => void;
  selectedNodeId?: string;
}

// Component to render a single node in the tree
const TreeNode: React.FC<TreeNodeProps> = ({ 
  node, 
  depth = 0, 
  onSelectNode,
  selectedNodeId
}) => {
  const [expanded, setExpanded] = useState(depth < 2); // Auto-expand first two levels
  const hasChildren = node.children && node.children.length > 0;
  
  // Get the appropriate icon based on node type
  const getNodeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'group':
        return <Folder size={16} />;
      case 'mesh':
        return <Box size={16} />;
      case 'object3d':
        return <Folder size={16} />;
      default:
        return <Folder size={16} />;
    }
  };

  // Toggle expansion of the node
  const toggleExpand = () => {
    setExpanded(!expanded);
  };

  // Handle node selection
  const handleSelect = () => {
    if (onSelectNode) {
      onSelectNode(node);
    }
  };

  return (
    <div className="w-full select-none">
      <div 
        className={`w-full flex items-center py-1 px-0 hover:bg-gray-200 cursor-pointer ${
          selectedNodeId === node.uuid ? 'bg-[#EFEFEF]' : ''
        }`}
        onClick={handleSelect}
      >
        {/* Use indentation for depth */}
        <div className="flex items-center w-full" style={{ paddingLeft: `${depth * 12 + 4}px` }}>
          {/* Expand/collapse button for nodes with children */}
          {hasChildren ? (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand();
              }}
              className="mr-1 p-1 hover:bg-gray-300"
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="w-6"></span> // Spacer for leaf nodes
          )}
          
          {/* Node icon */}
          <span className="mr-2 text-gray-600">
            {getNodeIcon(node.type)}
          </span>
          
          {/* Node name */}
          <span className="truncate text-sm">
            {node.name || `Unnamed ${node.type}`}
          </span>
          
          {/* Node type (styled to be more subtle) */}
          <span className="ml-2 text-xs text-gray-400 opacity-70">
            ({node.type})
          </span>
        </div>
      </div>

      {/* Render children if expanded */}
      {expanded && hasChildren && (
        <div className="w-full">
          {node.children!.map((child) => (
            <TreeNode 
              key={child.uuid} 
              node={child} 
              depth={depth + 1}
              onSelectNode={onSelectNode}
              selectedNodeId={selectedNodeId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Main StructureTree component
const StructureTree: React.FC<{ 
  node: Object3D;
  onNodeSelect?: (node: Object3D) => void;
  selectedNode?: Object3D | null;
}> = ({ 
  node, 
  onNodeSelect,
  selectedNode 
}) => {
  const handleNodeSelect = (node: Object3D) => {
    console.log('Selecting node:', node.name, node.type, node.uuid);
    if (onNodeSelect) {
      onNodeSelect(node);
    }
  };

  return (
    <div className="w-full">
      {/* Root node */}
      <TreeNode 
        node={node} 
        onSelectNode={handleNodeSelect}
        selectedNodeId={selectedNode?.uuid}
      />
    </div>
  );
};

export default StructureTree;