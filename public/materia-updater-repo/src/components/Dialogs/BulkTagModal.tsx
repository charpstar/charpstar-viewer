// src/components/Dialogs/BulkTagModal.tsx

import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Plus, Minus, Tag } from 'lucide-react';
import { cn } from "@/lib/utils";

interface BulkTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedTags: string[], action: 'add' | 'remove') => void;
  materialNames: string[];
  materials: Array<{ name: string; tags: string[] }>;
  mode: 'add' | 'remove';
  title?: string;
}

export default function BulkTagModal({
  isOpen,
  onClose,
  onConfirm,
  materialNames,
  materials,
  mode,
  title
}: BulkTagModalProps) {
  const [newTagInput, setNewTagInput] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  // Memoize selected materials to prevent recalculation on every render
  const selectedMaterials = useMemo(() => 
    materials.filter(m => materialNames.includes(m.name)), 
    [materials, materialNames]
  );
  
  // Memoize available tags calculation
  const calculatedAvailableTags = useMemo(() => {
    if (mode === 'add') {
      // For add mode, show all existing tags in the system
      const allTags = new Set<string>();
      materials.forEach(material => {
        material.tags.forEach(tag => allTags.add(tag));
      });
      return Array.from(allTags).sort();
    } else {
      // For remove mode, show only tags that exist in selected materials
      const existingTags = new Set<string>();
      selectedMaterials.forEach(material => {
        material.tags.forEach(tag => existingTags.add(tag));
      });
      return Array.from(existingTags).sort();
    }
  }, [mode, materials, selectedMaterials]);

  useEffect(() => {
    if (!isOpen) {
      setNewTagInput('');
      setSelectedTags(new Set());
      return;
    }

    setAvailableTags(calculatedAvailableTags);
  }, [isOpen, calculatedAvailableTags]);

  const handleAddNewTag = () => {
    if (newTagInput.trim() && mode === 'add') {
      const newTag = newTagInput.trim();
      if (!availableTags.includes(newTag)) {
        setAvailableTags(prev => Array.from(new Set([...prev, newTag])).sort());
      }
      setSelectedTags(prev => new Set([...Array.from(prev), newTag]));
      setNewTagInput('');
    }
  };

  const handleTagToggle = (tag: string) => {
    setSelectedTags(prev => {
      const newSet = new Set(Array.from(prev));
      if (newSet.has(tag)) {
        newSet.delete(tag);
      } else {
        newSet.add(tag);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    setSelectedTags(new Set(Array.from(availableTags)));
  };

  const handleDeselectAll = () => {
    setSelectedTags(new Set());
  };

  const handleConfirm = () => {
    if (selectedTags.size > 0) {
      onConfirm(Array.from(selectedTags), mode);
    }
    onClose();
  };

  const getTagCount = (tag: string) => {
    return selectedMaterials.filter(material => material.tags.includes(tag)).length;
  };

  const modalTitle = title || (mode === 'add' ? 'Add Tags to Materials' : 'Remove Tags from Materials');
  const ActionIcon = mode === 'add' ? Plus : Minus;
  const actionColor = mode === 'add' ? 'blue' : 'orange';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-blue-500" />
            {modalTitle}
          </DialogTitle>
          <DialogDescription>
            {mode === 'add' 
              ? `Select tags to add to ${materialNames.length} selected materials`
              : `Select tags to remove from ${materialNames.length} selected materials`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Selected Materials */}
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Selected Materials ({materialNames.length}):
            </div>
            <div className="flex flex-wrap gap-1">
              {materialNames.map(name => (
                <Badge key={name} variant="secondary" className="text-xs">
                  {name}
                </Badge>
              ))}
            </div>
          </div>

          {/* Add new tag input (only for add mode) */}
          {mode === 'add' && (
            <div className="flex gap-2">
              <Input
                placeholder="Type a new tag name..."
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddNewTag();
                  }
                }}
                className="flex-1"
              />
              <Button
                onClick={handleAddNewTag}
                disabled={!newTagInput.trim()}
                variant="outline"
                className="border-blue-300 hover:bg-blue-50"
              >
                <ActionIcon className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Selection Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="flex items-center gap-1">
                <Tag className="h-3 w-3" />
                {selectedTags.size} of {availableTags.length} selected
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                disabled={selectedTags.size === availableTags.length}
              >
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeselectAll}
                disabled={selectedTags.size === 0}
              >
                Deselect All
              </Button>
            </div>
          </div>

          {/* Available Tags */}
          <ScrollArea className="h-[300px] border rounded-lg p-4">
            <div className="space-y-2">
              {availableTags.length > 0 ? (
                availableTags.map((tag) => {
                  const isSelected = selectedTags.has(tag);
                  const tagCount = getTagCount(tag);
                  
                  return (
                    <div
                      key={tag}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer",
                        isSelected 
                          ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800"
                          : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700",
                        "hover:bg-opacity-80"
                      )}
                      onClick={() => handleTagToggle(tag)}
                    >
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          checked={isSelected}
                          onChange={() => handleTagToggle(tag)}
                          className="pointer-events-none"
                        />
                        
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {tag}
                          </span>
                          {mode === 'remove' && (
                            <Badge variant="outline" className="text-xs">
                              {tagCount}/{materialNames.length} materials
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      {isSelected && (
                        <div className="text-blue-500">
                          <ActionIcon className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-center text-gray-500 py-8">
                  {mode === 'add' 
                    ? "No tags available. Add a new tag above."
                    : "Selected materials have no tags to remove."
                  }
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Summary */}
          {selectedTags.size > 0 && (
            <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
              <div className="text-sm">
                <div className="font-medium mb-2">
                  {mode === 'add' ? 'Tags to add:' : 'Tags to remove:'}
                </div>
                <div className="flex flex-wrap gap-1">
                  {Array.from(selectedTags).map(tag => (
                    <Badge 
                      key={tag} 
                      variant="default" 
                      className="bg-blue-500 text-white"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <div className="flex items-center gap-2">
            <Button onClick={onClose} variant="outline">
              Cancel
            </Button>
            <Button 
              onClick={handleConfirm}
              disabled={selectedTags.size === 0}
              className="bg-blue-500 hover:bg-blue-600 text-white"
            >
              <ActionIcon className="h-4 w-4 mr-2" />
              {mode === 'add' ? 'Add Tags' : 'Remove Tags'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}