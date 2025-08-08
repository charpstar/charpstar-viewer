// src/components/Modals/ReferenceMeshesModal.tsx

import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Mesh {
  name: string;
  tags: string[];
}

interface MeshAssignment {
  defaultMaterial: string;
  variants: Array<{ name: string; material: string }>;
}

interface ReferenceMeshesModalProps {
  isOpen: boolean;
  onClose: () => void;
  meshes: string[];
  currentMeshes: Mesh[];
  currentAssignments: { [key: string]: MeshAssignment };
  onApply: (meshes: Mesh[], meshAssignments: { [key: string]: MeshAssignment }) => void;
}

export default function ReferenceMeshesModal({
  isOpen,
  onClose,
  meshes,
  currentMeshes,
  currentAssignments,
  onApply
}: ReferenceMeshesModalProps) {
  const [selectedMeshes, setSelectedMeshes] = useState<Set<string>>(new Set());
  const [checkedMeshes, setCheckedMeshes] = useState<Set<string>>(new Set());
  const [tagInput, setTagInput] = useState('');
  const [meshTags, setMeshTags] = useState<{ [key: string]: string[] }>({});
  const [searchTerm, setSearchTerm] = useState('');
  const lastClickedIndex = useRef<number | null>(null);

  // Initialize state when modal opens
  useEffect(() => {
    if (isOpen) {
      // Initialize checked meshes with ones that already exist in currentMeshes
      const existingMeshes = new Set(currentMeshes.map(m => m.name));
      setCheckedMeshes(existingMeshes);

      // Initialize mesh tags
      const initialTags: { [key: string]: string[] } = {};
      currentMeshes.forEach(mesh => {
        initialTags[mesh.name] = mesh.tags;
      });
      setMeshTags(initialTags);
      
      // Clear selections
      setSelectedMeshes(new Set());
      setSearchTerm('');
    }
  }, [isOpen, currentMeshes]);

  const handleRowSelect = (mesh: string, index: number, event: React.MouseEvent) => {
    event.preventDefault();
    
    if (event.shiftKey && lastClickedIndex.current !== null) {
      const start = Math.min(index, lastClickedIndex.current);
      const end = Math.max(index, lastClickedIndex.current);
      
      setSelectedMeshes(prev => {
        const newSet = new Set(prev);
        for (let i = start; i <= end; i++) {
          newSet.add(meshes[i]);
        }
        return newSet;
      });
    } else if (event.ctrlKey || event.metaKey) {
      setSelectedMeshes(prev => {
        const newSet = new Set(prev);
        if (newSet.has(mesh)) {
          newSet.delete(mesh);
          if (index === lastClickedIndex.current) {
            lastClickedIndex.current = null;
          }
        } else {
          newSet.add(mesh);
          lastClickedIndex.current = index;
        }
        return newSet;
      });
    } else {
      setSelectedMeshes(new Set([mesh]));
      lastClickedIndex.current = index;
    }
  };

  const handleCheckboxChange = (mesh: string, event: React.MouseEvent) => {
    event.stopPropagation();
    
    const anySelectedChecked = Array.from(selectedMeshes).some(m => checkedMeshes.has(m));
    
    setCheckedMeshes(prev => {
      const newSet = new Set(prev);
      
      selectedMeshes.forEach(selectedMesh => {
        if (anySelectedChecked) {
          newSet.delete(selectedMesh);
        } else {
          newSet.add(selectedMesh);
        }
      });
      
      return newSet;
    });
  };

  const getCheckboxState = (mesh: string, isSelected: boolean) => {
    if (!isSelected) {
      return {
        checked: checkedMeshes.has(mesh),
        disabled: true
      };
    }

    if (selectedMeshes.size > 1) {
      const selectedCheckedCount = Array.from(selectedMeshes)
        .filter(m => checkedMeshes.has(m)).length;
      
      if (selectedCheckedCount === 0) {
        return { checked: false, disabled: false };
      } else if (selectedCheckedCount === selectedMeshes.size) {
        return { checked: true, disabled: false };
      } else {
        return { checked: "indeterminate" as const, disabled: false };
      }
    }

    return {
      checked: checkedMeshes.has(mesh),
      disabled: false
    };
  };

  const handleAddTag = () => {
    if (tagInput.trim() && selectedMeshes.size > 0) {
      setMeshTags(prev => {
        const newTags = { ...prev };
        selectedMeshes.forEach(mesh => {
          if (!newTags[mesh]) newTags[mesh] = [];
          if (!newTags[mesh].includes(tagInput.trim())) {
            newTags[mesh] = [...newTags[mesh], tagInput.trim()];
          }
        });
        return newTags;
      });
      setTagInput('');
    }
  };

  const handleRemoveTag = (mesh: string, tagToRemove: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setMeshTags(prev => ({
      ...prev,
      [mesh]: prev[mesh].filter(tag => tag !== tagToRemove)
    }));
  };

  const handleApply = () => {
    // Prepare updated meshes array
    const updatedMeshes: Mesh[] = Array.from(checkedMeshes).map(meshName => ({
      name: meshName,
      tags: meshTags[meshName] || []
    }));

    // Prepare updated mesh assignments
    const updatedAssignments: { [key: string]: MeshAssignment } = {};
    
    // For each checked mesh
    checkedMeshes.forEach(mesh => {
      // If the mesh already has assignments, keep them
      if (currentAssignments[mesh]) {
        updatedAssignments[mesh] = currentAssignments[mesh];
      } else {
        // Otherwise, create default empty assignment
        updatedAssignments[mesh] = {
          defaultMaterial: '',
          variants: []
        };
      }
    });

    onApply(updatedMeshes, updatedAssignments);
    onClose();
  };

  const filteredMeshes = meshes.filter(mesh =>
    mesh.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (meshTags[mesh]?.some(tag => 
      tag.toLowerCase().includes(searchTerm.toLowerCase())
    ))
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Reference Meshes</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <Input
            placeholder="Search meshes or tags..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <ScrollArea className="h-[400px] border rounded-lg p-4">
            {filteredMeshes.map((mesh, index) => {
              const isExisting = currentMeshes.some(m => m.name === mesh);
              const tags = meshTags[mesh] || [];
              const isSelected = selectedMeshes.has(mesh);
              const checkboxState = getCheckboxState(mesh, isSelected);

              return (
                <div
                  key={mesh}
                  onClick={(e) => handleRowSelect(mesh, index, e)}
                  className={cn(
                    "flex items-center space-x-2 p-2 rounded cursor-pointer transition-colors",
                    isSelected && "bg-blue-100 dark:bg-blue-900/20",
                    "hover:bg-gray-50 dark:hover:bg-gray-800/50",
                    "select-none"
                  )}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center"
                  >
                    <Checkbox
                      checked={checkboxState.checked}
                      disabled={checkboxState.disabled}
                      onClick={(e) => {
                        if (!checkboxState.disabled) {
                          handleCheckboxChange(mesh, e as unknown as React.MouseEvent);
                        }
                      }}
                      className={cn(
                        "transition-opacity",
                        checkboxState.disabled && "opacity-50"
                      )}
                    />
                  </div>
                  <div className="flex-1">
                    <span className="font-medium">
                      {mesh}
                      {isExisting && (
                        <Badge variant="secondary" className="ml-2">
                          Existing
                        </Badge>
                      )}
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {tags.map(tag => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className={cn(
                            "cursor-pointer transition-opacity",
                            !isSelected && "opacity-50"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isSelected) {
                              handleRemoveTag(mesh, tag, e);
                            }
                          }}
                        >
                          {tag} {isSelected && "×"}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </ScrollArea>
        </div>

        <DialogFooter>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">
              {selectedMeshes.size} selected, {checkedMeshes.size} to be added
            </span>
            <Button onClick={onClose} variant="outline">Cancel</Button>
            <Button onClick={handleApply}>Apply Changes</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}