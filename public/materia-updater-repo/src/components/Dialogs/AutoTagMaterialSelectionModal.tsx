// src/components/Dialogs/AutoTagMaterialSelectionModal.tsx

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Tag, CheckCircle2 } from 'lucide-react';
import { cn } from "@/lib/utils";

interface Material {
  name: string;
  tags: string[];
}

interface AutoTagMaterialSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedMaterials: string[], excludedMaterials: string[]) => void;
  tag: string;
  materials: Material[];
  initialSelectedMaterials?: string[];
  initialExcludedMaterials?: string[];
}

export default function AutoTagMaterialSelectionModal({
  isOpen,
  onClose,
  onConfirm,
  tag,
  materials,
  initialSelectedMaterials = [],
  initialExcludedMaterials = []
}: AutoTagMaterialSelectionModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMaterials, setSelectedMaterials] = useState<Set<string>>(new Set());
  const [excludedMaterials, setExcludedMaterials] = useState<Set<string>>(new Set());

  // Get materials that have the selected tag
  const taggedMaterials = materials.filter(material => 
    material.tags.includes(tag)
  );

  const filteredMaterials = taggedMaterials.filter(material =>
    material.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Initialize selection state
  useEffect(() => {
    if (!isOpen) return;
    
    // Use a ref to prevent infinite loops
    const currentTaggedMaterials = materials.filter(material => 
      material.tags.includes(tag)
    );
    
    if (initialSelectedMaterials.length > 0) {
      setSelectedMaterials(new Set(initialSelectedMaterials));
      setExcludedMaterials(new Set(initialExcludedMaterials));
    } else {
      // Default: select all materials with the tag, exclude none
      const allTaggedMaterialNames = currentTaggedMaterials.map(m => m.name);
      setSelectedMaterials(new Set(allTaggedMaterialNames));
      setExcludedMaterials(new Set(initialExcludedMaterials));
    }
    setSearchTerm('');
  }, [isOpen, tag, materials.length, initialSelectedMaterials.join(','), initialExcludedMaterials.join(',')]);

  const handleMaterialToggle = (materialName: string) => {
    setSelectedMaterials(prev => {
      const newSet = new Set(prev);
      if (newSet.has(materialName)) {
        newSet.delete(materialName);
        // Add to excluded materials
        setExcludedMaterials(excludedPrev => new Set([...Array.from(excludedPrev), materialName]));
      } else {
        newSet.add(materialName);
        // Remove from excluded materials
        setExcludedMaterials(excludedPrev => {
          const newExcludedSet = new Set(excludedPrev);
          newExcludedSet.delete(materialName);
          return newExcludedSet;
        });
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    const allMaterialNames = taggedMaterials.map(m => m.name);
    setSelectedMaterials(new Set(allMaterialNames));
    setExcludedMaterials(new Set());
  };

  const handleDeselectAll = () => {
    setSelectedMaterials(new Set());
    setExcludedMaterials(new Set(taggedMaterials.map(m => m.name)));
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selectedMaterials), Array.from(excludedMaterials));
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-blue-500" />
            Configure AutoTag Materials for &ldquo;{tag}&rdquo;
          </DialogTitle>
          <DialogDescription>
            Select which materials with the &ldquo;{tag}&rdquo; tag should be included in auto-assignment. 
            Unchecked materials will be excluded from automatic assignment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search materials..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Selection Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {selectedMaterials.size} of {taggedMaterials.length} selected
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                disabled={selectedMaterials.size === taggedMaterials.length}
              >
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeselectAll}
                disabled={selectedMaterials.size === 0}
              >
                Deselect All
              </Button>
            </div>
          </div>

          {/* Materials List */}
          <ScrollArea className="h-[400px] border rounded-lg p-4">
            <div className="space-y-2">
              {filteredMaterials.length > 0 ? (
                filteredMaterials.map((material) => {
                  const isSelected = selectedMaterials.has(material.name);
                  
                  return (
                    <div
                      key={material.name}
                      className={cn(
                        "flex items-center space-x-3 p-3 rounded-lg border transition-colors",
                        isSelected 
                          ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800" 
                          : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700",
                        "hover:bg-opacity-80 cursor-pointer"
                      )}
                      onClick={() => handleMaterialToggle(material.name)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onChange={() => handleMaterialToggle(material.name)}
                        className="pointer-events-none"
                      />
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {material.name}
                          </span>
                          {!isSelected && (
                            <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
                              Excluded
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex flex-wrap gap-1 mt-1">
                          {material.tags.map(materialTag => (
                            <Badge
                              key={materialTag}
                              variant={materialTag === tag ? "default" : "secondary"}
                              className={cn(
                                "text-xs",
                                materialTag === tag && "bg-blue-500 text-white"
                              )}
                            >
                              {materialTag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center text-gray-500 py-8">
                  {searchTerm ? (
                    <>No materials found matching &ldquo;{searchTerm}&rdquo;</>
                  ) : (
                    <>No materials found with tag &ldquo;{tag}&rdquo;</>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Summary */}
          {taggedMaterials.length > 0 && (
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                <div className="flex justify-between">
                  <span>Total materials with &ldquo;{tag}&rdquo; tag:</span>
                  <span className="font-medium">{taggedMaterials.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Selected for auto-assignment:</span>
                  <span className="font-medium text-green-600">{selectedMaterials.size}</span>
                </div>
                <div className="flex justify-between">
                  <span>Excluded from auto-assignment:</span>
                  <span className="font-medium text-orange-600">{excludedMaterials.size}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <div className="flex items-center gap-2">
            <Button onClick={handleCancel} variant="outline">
              Cancel
            </Button>
            <Button 
              onClick={handleConfirm}
              disabled={selectedMaterials.size === 0}
            >
              Apply Selection
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}