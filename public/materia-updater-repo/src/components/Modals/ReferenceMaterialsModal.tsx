// src/components/Modals/ReferenceMaterialsModal.tsx

import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Material {
  name: string;
  tags: string[];
}

interface ReferenceMaterialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMaterials: Material[];
  referenceMaterials: string[];
  onApply: (materials: Material[]) => void;
}

export default function ReferenceMaterialsModal({
  isOpen,
  onClose,
  currentMaterials,
  referenceMaterials,
  onApply
}: ReferenceMaterialsModalProps) {
  const [checkedMaterials, setCheckedMaterials] = useState<Set<string>>(new Set());
  const [selectedMaterials, setSelectedMaterials] = useState<Set<string>>(new Set());
  const [materialTags, setMaterialTags] = useState<{ [key: string]: string[] }>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [tagInput, setTagInput] = useState('');
  const lastClickedIndex = useRef<number | null>(null);

  // Initialize state when modal opens
  useEffect(() => {
    if (isOpen) {
      // Initialize checked materials with ones that already exist in currentMaterials
      const existingMaterials = new Set(currentMaterials.map(m => m.name));
      setCheckedMaterials(existingMaterials);

      // Initialize material tags
      const initialTags: { [key: string]: string[] } = {};
      currentMaterials.forEach(material => {
        initialTags[material.name] = material.tags;
      });
      setMaterialTags(initialTags);
      
      // Clear selections
      setSelectedMaterials(new Set());
    }
  }, [isOpen, currentMaterials]);

  const handleRowSelect = (material: string, index: number, event: React.MouseEvent) => {
    event.preventDefault();
    
    if (event.shiftKey && lastClickedIndex.current !== null) {
      // Get the range of indices between last clicked and current
      const start = Math.min(index, lastClickedIndex.current);
      const end = Math.max(index, lastClickedIndex.current);
      
      setSelectedMaterials(prev => {
        const newSet = new Set(prev);
        // Add all materials in the range
        for (let i = start; i <= end; i++) {
          newSet.add(referenceMaterials[i]);
        }
        return newSet;
      });
    } else if (event.ctrlKey || event.metaKey) {
      // Toggle individual selection for Ctrl/Cmd + Click
      setSelectedMaterials(prev => {
        const newSet = new Set(prev);
        if (newSet.has(material)) {
          newSet.delete(material);
          // If we're deselecting the last clicked item, reset lastClickedIndex
          if (index === lastClickedIndex.current) {
            lastClickedIndex.current = null;
          }
        } else {
          newSet.add(material);
          lastClickedIndex.current = index;
        }
        return newSet;
      });
    } else {
      // Single click selects only this item
      setSelectedMaterials(new Set([material]));
      lastClickedIndex.current = index;
    }
  };

  // Function to get CSS classes for a row based on its state
  const getRowClasses = (material: string, isSelected: boolean) => {
    return cn(
      "flex items-center space-x-2 p-2 rounded cursor-pointer transition-colors",
      isSelected && "bg-blue-100 dark:bg-blue-900/20",
      "hover:bg-gray-50 dark:hover:bg-gray-800/50",
      "select-none" // Prevent text selection while clicking
    );
  };

  const handleCheckboxChange = (material: string, event: React.MouseEvent) => {
    event.stopPropagation();
    
    // Check if any selected materials are currently checked
    const anySelectedChecked = Array.from(selectedMaterials).some(m => checkedMaterials.has(m));
    
    setCheckedMaterials(prev => {
      const newSet = new Set(prev);
      
      // If any selected materials are checked, uncheck all selected
      // If none are checked, check all selected
      selectedMaterials.forEach(selectedMaterial => {
        if (anySelectedChecked) {
          newSet.delete(selectedMaterial);
        } else {
          newSet.add(selectedMaterial);
        }
      });
      
      return newSet;
    });
  };

  const getCheckboxState = (material: string, isSelected: boolean) => {
    if (!isSelected) {
      return {
        checked: checkedMaterials.has(material),
        disabled: true
      };
    }

    // For selected materials, determine if they're part of a group
    if (selectedMaterials.size > 1) {
      // If this material is part of a multi-select, show intermediate state
      // if some but not all selected materials are checked
      const selectedCheckedCount = Array.from(selectedMaterials)
        .filter(m => checkedMaterials.has(m)).length;
      
      if (selectedCheckedCount === 0) {
        return { checked: false, disabled: false };
      } else if (selectedCheckedCount === selectedMaterials.size) {
        return { checked: true, disabled: false };
      } else {
        return { checked: "indeterminate" as const, disabled: false };
      }
    }

    // Single selection
    return {
      checked: checkedMaterials.has(material),
      disabled: false
    };
  };

  const handleAddTag = () => {
    if (tagInput.trim() && selectedMaterials.size > 0) {
      setMaterialTags(prev => {
        const newTags = { ...prev };
        selectedMaterials.forEach(material => {
          if (!newTags[material]) newTags[material] = [];
          if (!newTags[material].includes(tagInput.trim())) {
            newTags[material] = [...newTags[material], tagInput.trim()];
          }
        });
        return newTags;
      });
      setTagInput('');
    }
  };

  const handleRemoveTag = (material: string, tagToRemove: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setMaterialTags(prev => ({
      ...prev,
      [material]: prev[material].filter(tag => tag !== tagToRemove)
    }));
  };

  const handleApply = () => {
    const updatedMaterials: Material[] = [...currentMaterials];
    
    // Remove materials that were unchecked
    const materialsToKeep = new Set(checkedMaterials);
    for (let i = updatedMaterials.length - 1; i >= 0; i--) {
      if (!materialsToKeep.has(updatedMaterials[i].name)) {
        updatedMaterials.splice(i, 1);
      }
    }

    // Add new materials that were checked
    checkedMaterials.forEach(materialName => {
      const existingIndex = updatedMaterials.findIndex(m => m.name === materialName);
      if (existingIndex === -1) {
        updatedMaterials.push({
          name: materialName,
          tags: materialTags[materialName] || []
        });
      } else {
        // Update tags for existing materials
        updatedMaterials[existingIndex].tags = materialTags[materialName] || [];
      }
    });

    onApply(updatedMaterials);
  };

  const filteredMaterials = referenceMaterials.filter(material =>
    material.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (materialTags[material]?.some(tag => 
      tag.toLowerCase().includes(searchTerm.toLowerCase())
    ))
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Reference Materials</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <Input
            placeholder="Search materials or tags..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

        <ScrollArea className="h-[400px] border rounded-lg p-4">
          {filteredMaterials.map((material, index) => {
            const isExisting = currentMaterials.some(m => m.name === material);
            const tags = materialTags[material] || [];
            const isSelected = selectedMaterials.has(material);
            const checkboxState = getCheckboxState(material, isSelected);

            return (
              <div
                key={material}
                onClick={(e) => handleRowSelect(material, index, e)}
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
                        handleCheckboxChange(material, e as unknown as React.MouseEvent);
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
                      {material}
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
                              handleRemoveTag(material, tag, e);
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

          <div className="flex items-center space-x-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder={selectedMaterials.size === 0 ? "Select materials to add tags" : "Enter tag"}
              disabled={selectedMaterials.size === 0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
            />
            <Button 
              onClick={handleAddTag} 
              variant="outline"
              disabled={selectedMaterials.size === 0}
            >
              Add Tag
            </Button>
          </div>
        </div>

        <DialogFooter>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">
              {selectedMaterials.size} selected, {checkedMaterials.size} to be added
            </span>
            <Button onClick={onClose} variant="outline">Cancel</Button>
            <Button onClick={handleApply}>Apply Changes</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}