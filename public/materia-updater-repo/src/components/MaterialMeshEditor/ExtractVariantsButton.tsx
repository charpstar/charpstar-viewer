// src/components/MaterialMeshEditor/ExtractVariantsButton.tsx

import React from 'react';
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Download } from 'lucide-react';
import { MeshAssignment } from '@/gltf/gltfTypes';

interface ExtractVariantsButtonProps {
  meshAssignments: { [key: string]: MeshAssignment };
  variant?: "outline" | "default" | "destructive" | "secondary" | "ghost" | "link";
}

const ExtractVariantsButton: React.FC<ExtractVariantsButtonProps> = ({ 
  meshAssignments,
  variant = "default"
}) => {
  const handleExtract = () => {
    let output = '';
    
    Object.entries(meshAssignments).forEach(([meshName, assignment]) => {
      const sortedVariants = [...assignment.variants]
        .sort((a, b) => a.name.localeCompare(b.name));
      
      sortedVariants.forEach(variant => {
        output += `<option value="${variant.name}">${variant.name}</option>\n`;
      });
      
      output += '\n';
    });

    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'variants.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button 
          onClick={handleExtract}
          variant={variant}
          size="sm"
        >
          <Download className="h-4 w-4 mr-2" />
          Extract Variants
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        Extract variants to CSV for HTML
      </TooltipContent>
    </Tooltip>
  );
};

export default ExtractVariantsButton;