// src/components/Dialogs/MaterialSortDialog.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Material, MaterialData, TagSortState } from '@/gltf/gltfTypes';

interface MaterialSortDialogProps {
  isOpen: boolean;
  onClose: () => void;
  materials: Material[];
  onApplySort: (sortedMaterials: Material[], sortSettings: TagSortState[]) => void;
  currentData: MaterialData;
}

export default function MaterialSortDialog({
  isOpen,
  onClose,
  materials,
  onApplySort,
  currentData
}: MaterialSortDialogProps) {
  const [tagStates, setTagStates] = useState<TagSortState[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [previewMaterials, setPreviewMaterials] = useState<Material[]>([]);

  // Initialize tag states from currentData or create new ones
  useEffect(() => {
    if (isOpen) {
      const uniqueTags = Array.from(new Set(materials.flatMap(m => m.tags)));
      let initialTagStates: TagSortState[] = [];

      if (currentData.sortSettings?.tagStates) {
        // Use existing sort settings
        const savedTagStates = currentData.sortSettings.tagStates;
        const savedTagStateMap = new Map(
          savedTagStates.map(tag => [tag.name, tag])
        );

        // Initialize tags with saved states or defaults for new tags
        initialTagStates = uniqueTags
          .map(tag => ({
            name: tag,
            enabled: savedTagStateMap.get(tag)?.enabled ?? true,
            order: savedTagStateMap.get(tag)?.order ?? uniqueTags.indexOf(tag)
          }));

        // Add any saved tags that still exist
        savedTagStates.forEach(savedTag => {
          if (!initialTagStates.some(t => t.name === savedTag.name) && 
              savedTag.name === 'Untagged') {
            initialTagStates.push(savedTag);
          }
        });
      } else {
        // Create new tag states
        initialTagStates = uniqueTags
          .map((tag, index) => ({
            name: tag,
            enabled: true,
            order: index
          }));
      }

      // Ensure 'Untagged' is always present
      if (!initialTagStates.some(tag => tag.name === 'Untagged')) {
        initialTagStates.push({
          name: 'Untagged',
          enabled: true,
          order: initialTagStates.length
        });
      }

      // Sort by saved order
      initialTagStates.sort((a, b) => a.order - b.order);
      setTagStates(initialTagStates);
      setPreviewMaterials([...materials]);
    }
  }, [isOpen, materials, currentData]);

  const sortMaterialsByTags = useCallback((currentTagStates: TagSortState[]) => {
    // Include all tags in order, not just enabled ones
    const tagOrder = currentTagStates
      .filter(tag => tag.name !== 'Untagged')
      .map(tag => tag.name);
    
    const isUntaggedEnabled = currentTagStates.find(t => t.name === 'Untagged')?.enabled ?? true;
  
    // Create groups for each tag and special groups
    const materialGroups = new Map<string, Material[]>();
    tagOrder.forEach(tag => materialGroups.set(tag, []));
    materialGroups.set('untagged', []);
    materialGroups.set('remaining', []); // For materials that don't match any tag
  
    // Helper function to find the highest priority tag for a material
    const findHighestPriorityTag = (material: Material): string | null => {
      for (const tag of tagOrder) {
        if (material.tags.includes(tag)) {
          return tag;
        }
      }
      return null;
    };
  
    // Distribute materials into groups based on tag priority
    [...materials].forEach(material => {
      if (material.tags.length === 0) {
        materialGroups.get('untagged')?.push(material);
        return;
      }
  
      const highestPriorityTag = findHighestPriorityTag(material);
      if (highestPriorityTag) {
        materialGroups.get(highestPriorityTag)?.push(material);
      } else {
        materialGroups.get('remaining')?.push(material);
      }
    });
  
    // Sort groups based on their enabled state
    tagOrder.forEach(tag => {
      const group = materialGroups.get(tag);
      const tagState = currentTagStates.find(t => t.name === tag);
      
      if (group && tagState?.enabled) {
        // Only sort if the tag is enabled
        materialGroups.set(tag, group.sort((a, b) => a.name.localeCompare(b.name)));
      }
    });
  
    // Handle untagged materials
    const untaggedGroup = materialGroups.get('untagged');
    if (untaggedGroup && isUntaggedEnabled) {
      materialGroups.set('untagged', untaggedGroup.sort((a, b) => a.name.localeCompare(b.name)));
    }
  
    // Build final sorted array maintaining tag priority order
    const result: Material[] = [];
    
    // Add materials according to tag priority
    tagOrder.forEach(tag => {
      const group = materialGroups.get(tag);
      if (group && group.length > 0) {
        result.push(...group);
      }
    });
  
    // Add untagged materials
    const untaggedMaterials = materialGroups.get('untagged') || [];
    if (untaggedMaterials.length > 0) {
      result.push(...untaggedMaterials);
    }
  
    // Add any remaining materials
    const remainingMaterials = materialGroups.get('remaining') || [];
    if (remainingMaterials.length > 0) {
      result.push(...remainingMaterials);
    }
  
    return result;
  }, [materials]);

  useEffect(() => {
    if (tagStates.length > 0) {
      const sorted = sortMaterialsByTags(tagStates);
      setPreviewMaterials(sorted);
    }
  }, [tagStates, sortMaterialsByTags]);

  const handleDragEnd = useCallback((result: any) => {
    if (!result.destination) return;
    
    // Don't allow moving Untagged tag
    const draggedTag = tagStates[result.source.index];
    const targetIndex = result.destination.index;
    if (draggedTag.name === 'Untagged' || tagStates[targetIndex].name === 'Untagged') {
      return;
    }

    setTagStates(prev => {
      const items = Array.from(prev);
      const [reorderedItem] = items.splice(result.source.index, 1);
      items.splice(result.destination.index, 0, reorderedItem);
      
      // Update order values
      return items.map((tag, idx) => ({
        ...tag,
        order: idx
      }));
    });
  }, [tagStates]);

  const toggleTag = (tagName: string) => {
    setTagStates(prev => prev.map(tag =>
      tag.name === tagName ? { ...tag, enabled: !tag.enabled } : tag
    ));
  };

  const moveTag = (index: number, direction: 'up' | 'down') => {
    if (tagStates[index].name === 'Untagged') return;
    
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (newIndex < 0 || newIndex >= tagStates.length) return;
    if (tagStates[newIndex].name === 'Untagged') return;
    
    setTagStates(prev => {
      const newTagStates = [...prev];
      [newTagStates[index], newTagStates[newIndex]] = [newTagStates[newIndex], newTagStates[index]];
      
      // Update order values
      return newTagStates.map((tag, idx) => ({
        ...tag,
        order: idx
      }));
    });
  };

  const handleResetSettings = () => {
    const uniqueTags = Array.from(new Set(materials.flatMap(m => m.tags)));
    const resetTagStates = uniqueTags
      .map((tag, index) => ({
        name: tag,
        enabled: true,
        order: index
      }));
    
    // Add Untagged at the end
    resetTagStates.push({
      name: 'Untagged',
      enabled: true,
      order: resetTagStates.length
    });
    
    setTagStates(resetTagStates);
  };

  const handleApply = () => {
    // Update tag states with current order
    const updatedTagStates = tagStates.map((tag, index) => ({
      ...tag,
      order: index
    }));

    onApplySort(previewMaterials, updatedTagStates);
    onClose();
  };

  const filteredMaterials = previewMaterials.filter(material =>
    material.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    material.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[700px] h-[90vh] my-4">
        <DialogHeader className="pb-4">
          <DialogTitle>Sort Materials by Tag Priority</DialogTitle>
          <DialogDescription>
            Drag tags to reorder their priority or use the arrow buttons. Toggle switches to enable/disable alphabet sorting in the tag.
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="flex-grow pr-4 -mr-4">
          <div className="space-y-6">
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Tag Priority Order</h3>
              <p className="text-sm text-muted-foreground">
                Higher priority tags will be processed first when sorting materials.
              </p>
            </div>

            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="tags">
                {(provided) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className="space-y-2"
                  >
                    {tagStates.map((tag, index) => (
                      <Draggable
                        key={tag.name}
                        draggableId={tag.name}
                        index={index}
                        isDragDisabled={tag.name === 'Untagged'}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={cn(
                              "flex items-center justify-between p-3 rounded-lg border",
                              !tag.enabled && "opacity-50",
                              snapshot.isDragging && "shadow-lg bg-accent",
                              tag.name === 'Untagged' && "cursor-not-allowed"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                {...provided.dragHandleProps}
                                className={cn(
                                  "p-2 rounded cursor-grab active:cursor-grabbing",
                                  "hover:bg-accent",
                                  tag.name === 'Untagged' && "cursor-not-allowed"
                                )}
                              >
                                <svg
                                  width="16"
                                  height="16"
                                  viewBox="0 0 16 16"
                                  fill="none"
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="text-muted-foreground"
                                >
                                  <path d="M4 8C4 8.55228 3.55228 9 3 9C2.44772 9 2 8.55228 2 8C2 7.44772 2.44772 7 3 7C3.55228 7 4 7.44772 4 8Z" fill="currentColor"/>
                                  <path d="M9 8C9 8.55228 8.55228 9 8 9C7.44772 9 7 8.55228 7 8C7 7.44772 7.44772 7 8 7C8.55228 7 9 7.44772 9 8Z" fill="currentColor"/>
                                  <path d="M14 8C14 8.55228 13.5523 9 13 9C12.4477 9 12 8.55228 12 8C12 7.44772 12.4477 7 13 7C13.5523 7 14 7.44772 14 8Z" fill="currentColor"/>
                                  <path d="M4 3C4 3.55228 3.55228 4 3 4C2.44772 4 2 3.55228 2 3C2 2.44772 2.44772 2 3 2C3.55228 2 4 2.44772 4 3Z" fill="currentColor"/>
                                  <path d="M9 3C9 3.55228 8.55228 4 8 4C7.44772 4 7 3.55228 7 3C7 2.44772 7.44772 2 8 2C8.55228 2 9 2.44772 9 3Z" fill="currentColor"/>
                                  <path d="M14 3C14 3.55228 13.5523 4 13 4C12.4477 4 12 3.55228 12 3C12 2.44772 12.4477 2 13 2C13.5523 2 14 2.44772 14 3Z" fill="currentColor"/>
                                  <path d="M4 13C4 13.5523 3.55228 14 3 14C2.44772 14 2 13.5523 2 13C2 12.4477 2.44772 12 3 12C3.55228 12 4 12.4477 4 13Z" fill="currentColor"/>
                                  <path d="M9 13C9 13.5523 8.55228 14 8 14C7.44772 14 7 13.5523 7 13C7 12.4477 7.44772 12 8 12C8.55228 12 9 12.4477 9 13Z" fill="currentColor"/>
                                  <path d="M14 13C14 13.5523 13.5523 14 13 14C12.4477 14 12 13.5523 12 13C12 12.4477 12.4477 12 13 12C13.5523 12 14 12.4477 14 13Z" fill="currentColor"/>
                                </svg>
                              </div>
                              <span className="font-medium">{tag.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {tag.name !== 'Untagged' && (
                                <div className="flex flex-col">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2"
                                    onClick={() => moveTag(index, 'up')}
                                    disabled={index === 0}
                                  >
                                    <ChevronUp className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2"
                                    onClick={() => moveTag(index, 'down')}
                                    disabled={index === tagStates.length - 2}
                                  >
                                    <ChevronDown className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                              <Switch
                                checked={tag.enabled}
                                onCheckedChange={() => toggleTag(tag.name)}
                                className="ml-2"
                              />
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-medium">Preview</h3>
                <Input
                  placeholder="Search materials..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64"
                />
              </div>
              
              <div className="space-y-2">
                {filteredMaterials.map((material, index) => (
                  <div
                    key={material.name}
                    className={cn(
                      "flex flex-col gap-1 p-3 rounded-lg border",
                      "bg-white dark:bg-gray-800"
                    )}
                  >
                    <span className="font-medium">{material.name}</span>
                    <div className="flex flex-wrap gap-1">
                      {material.tags.length === 0 ? (
                        <Badge variant="secondary" className="opacity-50">
                          Untagged
                        </Badge>
                      ) : (
                        material.tags.map(tag => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className={
                              tagStates.find(t => t.name === tag)?.enabled
                                ? 'opacity-100'
                                : 'opacity-50'
                            }
                          >
                            {tag}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="mt-4 flex justify-between items-center">
          <div className="flex gap-2">
            <Button 
              onClick={handleResetSettings} 
              variant="outline" 
              size="sm"
            >
              Reset to Default
            </Button>
          </div>
          <div className="flex gap-2">
            <Button onClick={onClose} variant="outline">
              Cancel
            </Button>
            <Button onClick={handleApply}>
              Apply Order
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}