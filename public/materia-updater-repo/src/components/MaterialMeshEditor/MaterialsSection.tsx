// src/components/MaterialMeshEditor/MaterialsSection.tsx

import React, { useState, useRef, useMemo } from 'react';
// Note: react-beautiful-dnd should be installed for drag and drop functionality
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import MaterialItem from './MaterialItem';
import { Plus, Search, X } from 'lucide-react';
import { Card } from "@/components/ui/card";
import { Material } from '@/gltf/gltfTypes';
import { cn } from '@/lib/utils';

interface MaterialsSectionProps {
  materials: Material[];
  onDragEnd: (result: any) => void;
  onAddMaterials: () => void;
  onEditTags: (name: string) => void;
  onRenameMaterial: (name: string) => void;
  onRemoveMaterial: (name: string) => void;
  onMoveMaterial: (index: number, direction: 'up' | 'down') => void;
  onRemoveTag: (materialName: string, tag: string) => void;
  isAutoSortEnabled: boolean;
  
  // Multi-select props
  onBulkEditTags: (materialNames: string[]) => void;
  onBulkRemoveTags: (materialNames: string[], tags: string[]) => void;
}

const MaterialsSection: React.FC<MaterialsSectionProps> = ({
  materials,
  onDragEnd,
  onAddMaterials,
  onEditTags,
  onRenameMaterial,
  onRemoveMaterial,
  onMoveMaterial,
  onRemoveTag,
  isAutoSortEnabled,
  onBulkEditTags,
  onBulkRemoveTags
}) => {
  const [selectedMaterials, setSelectedMaterials] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const lastClickedIndex = useRef<number | null>(null);

  // Filter materials based on search term
  const filteredMaterials = useMemo(() => {
    if (!searchTerm.trim()) return materials;
    
    const lowerSearchTerm = searchTerm.toLowerCase();
    return materials.filter(material => {
      // Check material name
      if (material.name.toLowerCase().includes(lowerSearchTerm)) return true;
      
      // Check tags
      return material.tags.some(tag => tag.toLowerCase().includes(lowerSearchTerm));
    });
  }, [materials, searchTerm]);

  const clearSearch = () => setSearchTerm('');

  const handleMaterialSelect = (materialName: string, index: number, event: React.MouseEvent) => {
    event.preventDefault();
    
    if (event.shiftKey && lastClickedIndex.current !== null) {
      // Shift-click: select range
      const start = Math.min(index, lastClickedIndex.current);
      const end = Math.max(index, lastClickedIndex.current);
      
      setSelectedMaterials(prev => {
        const newSet = new Set(Array.from(prev));
        for (let i = start; i <= end; i++) {
          newSet.add(filteredMaterials[i].name);
        }
        return newSet;
      });
    } else if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd-click: toggle individual selection
      setSelectedMaterials(prev => {
        const newSet = new Set(Array.from(prev));
        if (newSet.has(materialName)) {
          newSet.delete(materialName);
          if (index === lastClickedIndex.current) {
            lastClickedIndex.current = null;
          }
        } else {
          newSet.add(materialName);
          lastClickedIndex.current = index;
        }
        return newSet;
      });
    } else {
      // Regular click: select only this item
      setSelectedMaterials(new Set([materialName]));
      lastClickedIndex.current = index;
    }
  };

  const handleCheckboxChange = (materialName: string, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (selectedMaterials.size <= 1) {
      // Single item or no selection - just toggle this item
      setSelectedMaterials(prev => {
        const newSet = new Set(Array.from(prev));
        if (newSet.has(materialName)) {
          newSet.delete(materialName);
        } else {
          newSet.add(materialName);
        }
        return newSet;
      });
    } else {
      // Multiple items selected - check if any selected materials are checked
      const anySelectedChecked = selectedMaterials.has(materialName);
      
      setSelectedMaterials(prev => {
        const newSet = new Set(Array.from(prev));
        
        if (anySelectedChecked) {
          // If this material is selected and checked, uncheck all selected
          Array.from(selectedMaterials).forEach(selectedMaterial => {
            newSet.delete(selectedMaterial);
          });
        } else {
          // If this material is selected but not checked, check all selected
          Array.from(selectedMaterials).forEach(selectedMaterial => {
            newSet.add(selectedMaterial);
          });
        }
        
        return newSet;
      });
    }
  };

  const getCheckboxState = (materialName: string, isSelected: boolean) => {
    if (!isSelected) {
      return {
        checked: false,
        disabled: true
      };
    }

    if (selectedMaterials.size > 1) {
      // For multiple selection, show the state based on whether this material is in selectedMaterials
      return {
        checked: selectedMaterials.has(materialName),
        disabled: false
      };
    }

    return {
      checked: selectedMaterials.has(materialName),
      disabled: false
    };
  };

  const handleBulkEditTags = () => {
    if (selectedMaterials.size > 0) {
      onBulkEditTags(Array.from(selectedMaterials));
    }
  };

  const handleBulkRemoveTags = () => {
    if (selectedMaterials.size > 0) {
      // Get all unique tags from selected materials
      const allTags = new Set<string>();
      materials.forEach(material => {
        if (selectedMaterials.has(material.name)) {
          material.tags.forEach(tag => allTags.add(tag));
        }
      });
      
      if (allTags.size > 0) {
        onBulkRemoveTags(Array.from(selectedMaterials), Array.from(allTags));
      }
    }
  };

  const clearSelection = () => {
    setSelectedMaterials(new Set());
    lastClickedIndex.current = null;
  };

  return (
    <Card className="p-6 bg-gray-50 dark:bg-gray-900 border-none shadow-none">
      <div className="space-y-6">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search materials by name or tags..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-10"
          />
          {searchTerm && (
            <Button
              onClick={clearSearch}
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 hover:bg-gray-100"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Search Results Info */}
        {searchTerm && (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span>
              Found {filteredMaterials.length} of {materials.length} materials
            </span>
            {filteredMaterials.length === 0 && (
              <Badge variant="outline" className="text-amber-600 border-amber-300">
                No results
              </Badge>
            )}
          </div>
        )}

        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="materials" isDropDisabled={isAutoSortEnabled || searchTerm.length > 0}>
            {(provided) => (
              <ul 
                {...provided.droppableProps} 
                ref={provided.innerRef} 
                className="space-y-3 min-h-[200px]"
              >
                {filteredMaterials.map((material, index) => {
                  const isSelected = selectedMaterials.has(material.name);
                  const checkboxState = getCheckboxState(material.name, isSelected);
                  
                  return (
                    <Draggable 
                      key={material.name} 
                      draggableId={material.name} 
                      index={index}
                      isDragDisabled={isAutoSortEnabled || searchTerm.length > 0}
                    >
                      {(provided) => (
                        <MaterialItem
                          material={material}
                          index={index}
                          totalItems={filteredMaterials.length}
                          onEditTags={onEditTags}
                          onRenameMaterial={onRenameMaterial}
                          onRemoveMaterial={onRemoveMaterial}
                          onMoveMaterial={onMoveMaterial}
                          onRemoveTag={onRemoveTag}
                          provided={provided}
                          isAutoSortEnabled={isAutoSortEnabled}
                          isSelected={isSelected}
                          onSelect={handleMaterialSelect}
                          onCheckboxChange={handleCheckboxChange}
                          checkboxState={checkboxState}
                          selectedCount={selectedMaterials.size}
                          onBulkAddTags={handleBulkEditTags}
                          onBulkRemoveTags={handleBulkRemoveTags}
                        />
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </ul>
            )}
          </Droppable>
        </DragDropContext>

        <Button 
          onClick={onAddMaterials}
          variant="outline"
          className="w-full bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Materials
        </Button>

        {/* Help Text */}
        <div className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 p-3 rounded-lg">
          <div className="space-y-1">
            <div><strong>Selection:</strong> Click to select, Ctrl/Cmd+Click for multi-select, Shift+Click for range selection</div>
            <div><strong>Bulk Operations:</strong> When multiple materials are selected, tag and rename buttons change to bulk operations</div>
            <div><strong>Search:</strong> Search filters by material name and tags. Drag & drop is disabled while searching.</div>
            {selectedMaterials.size > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-300 dark:border-gray-600">
                <div className="flex items-center justify-between">
                  <Badge variant="default" className="bg-blue-500">
                    {selectedMaterials.size} selected
                  </Badge>
                  <Button
                    onClick={clearSelection}
                    variant="ghost"
                    size="sm"
                    className="text-gray-500 h-6 px-2"
                  >
                    Clear
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default MaterialsSection;