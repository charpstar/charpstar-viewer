// app/components/StructureTree.tsx
'use client'; // Mark this as a Client Component

import { useState } from 'react';

interface StructureTreeProps {
  node: {
    name: string;
    type: string;
    children?: any[];
  };
}

const StructureTree = ({ node }: StructureTreeProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="pl-4">
      {/* Node Name and Expand/Collapse Button */}
      <div
        className="flex items-center cursor-pointer hover:bg-gray-100 p-1 rounded"
        onClick={toggleExpand}
      >
        <span className="mr-2">
          {node.children && node.children.length > 0 ? (
            isExpanded ? '▼' : '▶'
          ) : (
            '•'
          )}
        </span>
        <span className="text-sm">
          {node.name} ({node.type})
        </span>
      </div>

      {/* Render Children if Expanded */}
      {isExpanded && node.children && (
        <div className="pl-4">
          {node.children.map((child, index) => (
            <StructureTree key={index} node={child} />
          ))}
        </div>
      )}
    </div>
  );
};

export default StructureTree;