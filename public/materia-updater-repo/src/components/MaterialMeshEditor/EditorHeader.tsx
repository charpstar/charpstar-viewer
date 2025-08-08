// src/components/MaterialMeshEditor/EditorHeader.tsx

import React from 'react';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Edit3, Shapes } from 'lucide-react';

interface EditorHeaderProps {
  activeSection: string | null;
  onSectionChange: (section: string) => void;
}

const EditorHeader: React.FC<EditorHeaderProps> = ({ 
  activeSection, 
  onSectionChange 
}) => {
  return (
    <div className="space-y-4">
      <h3 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
        Material and Mesh Editor
      </h3>
      <div className="flex space-x-4">
        <Button
          onClick={() => onSectionChange('materials')}
          variant={activeSection === 'materials' ? "default" : "outline"}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-6",
            activeSection === 'materials' 
              ? "shadow-md" 
              : "hover:bg-gray-50 dark:hover:bg-gray-800"
          )}
        >
          <Edit3 className="w-4 h-4" />
          <span>Materials</span>
        </Button>
        <Button
          onClick={() => onSectionChange('meshes')}
          variant={activeSection === 'meshes' ? "default" : "outline"}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-6",
            activeSection === 'meshes' 
              ? "shadow-md" 
              : "hover:bg-gray-50 dark:hover:bg-gray-800"
          )}
        >
          <Shapes className="w-4 h-4" />
          <span>Mesh Assignments</span>
        </Button>
      </div>
    </div>
  );
};

export default EditorHeader;