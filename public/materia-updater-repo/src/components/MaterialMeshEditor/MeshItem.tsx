// src/components/MaterialMeshEditor/MeshItem.tsx

import React, { useState, useCallback, useRef } from 'react';
import { 
  GripVertical, 
  ChevronDown, 
  ChevronRight, 
  ChevronUp, 
  X, 
  Zap,
  Plus,
  Settings
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import SearchableSelect from '@/components/ui/searchable-select';
import TagSelectionModal from '../Dialogs/TagSelectionModal';
import AutoTagMaterialSelectionModal from '../Dialogs/AutoTagMaterialSelectionModal';
import { cn } from "@/lib/utils";

interface MeshItemProps {
  meshName: string;
  assignment: {
    defaultMaterial: string;
    variants: Array<{ name: string; material: string }>;
    autoTag?: {
      enabled: boolean;
      tag: string;
      selectedMaterials?: string[];
      excludedMaterials?: string[];
    };
  };
  materials: Array<{ name: string; tags: string[] }>;
  expanded: boolean;
  onToggle: (meshName: string) => void;
  onRename: (meshName: string) => void;
  onRemove: (meshName: string) => void;
  onAutoAssign: (meshName: string, tag: string) => void;
  onAutoTagChange: (meshName: string, enabled: boolean, tag?: string, selectedMaterials?: string[], excludedMaterials?: string[]) => void;
  onAssignmentChange: (meshName: string, field: "defaultMaterial" | "variants", value: string | undefined) => void;
  onVariantChange: (meshName: string, index: number, field: "name" | "material", value: string | undefined) => void;
  onRemoveVariant: (meshName: string, index: number) => void;
  onAddVariant: (meshName: string) => void;
  provided: any;
  index: number;
  totalItems: number;
  onMove: (index: number, direction: 'up' | 'down') => void;
  canMove: (index: number, direction: 'up' | 'down') => boolean;
  availableTags: string[];
}

const MeshItem: React.FC<MeshItemProps> = ({ 
  meshName,
  assignment,
  materials,
  expanded,
  onToggle,
  onRename,
  onRemove,
  onAutoAssign,
  onAssignmentChange,
  onVariantChange,
  onRemoveVariant,
  onAddVariant,
  provided,
  index,
  totalItems,
  onMove,
  canMove,
  availableTags,
  onAutoTagChange
}) => {
  const [isTagSelectionOpen, setIsTagSelectionOpen] = useState(false);
  const [isMaterialSelectionOpen, setIsMaterialSelectionOpen] = useState(false);
  const [expandedVariants, setExpandedVariants] = useState(false);
  
  // Local state for input values to avoid slow typing
  const [localVariants, setLocalVariants] = useState(assignment.variants);
  const [localDefaultMaterial, setLocalDefaultMaterial] = useState(assignment.defaultMaterial);
  
  // Timeouts for debouncing
  const variantTimeoutRef = useRef<{ [key: string]: NodeJS.Timeout }>({});
  const defaultMaterialTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update local state when assignment changes from outside
  React.useEffect(() => {
    setLocalVariants(assignment.variants);
    setLocalDefaultMaterial(assignment.defaultMaterial);
  }, [assignment.variants, assignment.defaultMaterial]);

  const autoTagEnabled = assignment.autoTag?.enabled || false;
  const autoTagClass = cn(
    "hover:bg-blue-50 dark:hover:bg-blue-900",
    autoTagEnabled && "bg-blue-100 dark:bg-blue-800"
  );

  const handleAutoTagClick = () => {
    if (autoTagEnabled) {
      onAutoTagChange(meshName, false);
    } else {
      setIsTagSelectionOpen(true);
    }
  };

  const handleMaterialSelectionClick = () => {
    if (assignment.autoTag?.enabled && assignment.autoTag.tag) {
      setIsMaterialSelectionOpen(true);
    }
  };

  const handleDefaultMaterialChange = useCallback((value: string) => {
    setLocalDefaultMaterial(value);
    
    // Clear existing timeout
    if (defaultMaterialTimeoutRef.current) {
      clearTimeout(defaultMaterialTimeoutRef.current);
    }
    
    // Set new timeout
    defaultMaterialTimeoutRef.current = setTimeout(() => {
      onAssignmentChange(meshName, "defaultMaterial", value);
    }, 300);
  }, [meshName, onAssignmentChange]);

  const handleVariantFieldChange = useCallback((index: number, field: "name" | "material", value: string) => {
    // Update local state immediately
    setLocalVariants(prev => prev.map((v, i) => 
      i === index ? { ...v, [field]: value } : v
    ));
    
    const timeoutKey = `${index}-${field}`;
    
    // Clear existing timeout
    if (variantTimeoutRef.current[timeoutKey]) {
      clearTimeout(variantTimeoutRef.current[timeoutKey]);
    }
    
    // Set new timeout
    variantTimeoutRef.current[timeoutKey] = setTimeout(() => {
      onVariantChange(meshName, index, field, value);
      delete variantTimeoutRef.current[timeoutKey];
    }, 300);
  }, [meshName, onVariantChange]);

  const handleRemoveVariantLocal = useCallback((index: number) => {
    // Clear any pending timeouts for this variant
    Object.keys(variantTimeoutRef.current).forEach(key => {
      if (key.startsWith(`${index}-`)) {
        clearTimeout(variantTimeoutRef.current[key]);
        delete variantTimeoutRef.current[key];
      }
    });
    
    onRemoveVariant(meshName, index);
  }, [meshName, onRemoveVariant]);

  const handleAddVariantLocal = useCallback(() => {
    onAddVariant(meshName);
  }, [meshName, onAddVariant]);

  // Cleanup timeouts on unmount
  React.useEffect(() => {
    return () => {
      const timeoutRefs = variantTimeoutRef.current;
      const defaultTimeout = defaultMaterialTimeoutRef.current;
      
      Object.values(timeoutRefs).forEach(timeout => clearTimeout(timeout));
      if (defaultTimeout) {
        clearTimeout(defaultTimeout);
      }
    };
  }, []);

  // Get materials that have the auto tag
  const getTaggedMaterials = () => {
    if (!assignment.autoTag?.tag) return [];
    return materials.filter(material => material.tags.includes(assignment.autoTag!.tag));
  };

  const getSelectedMaterialsCount = () => {
    const taggedMaterials = getTaggedMaterials();
    if (!assignment.autoTag?.selectedMaterials) {
      return taggedMaterials.length; // Default: all materials are selected
    }
    return assignment.autoTag.selectedMaterials.length;
  };

  const getExcludedMaterialsCount = () => {
    return assignment.autoTag?.excludedMaterials?.length || 0;
  };

  return (
    <Card 
      ref={provided.innerRef}
      {...provided.attributes}
      className={cn(
        "group transition-all duration-200",
        "border-gray-200 dark:border-gray-700",
        "relative",
        "transform-gpu",
        provided.isDragging && [
          "shadow-lg",
          "cursor-grabbing",
          "z-50",
          "!transform-none",
          "opacity-95",
          "[&_*]:pointer-events-none"
        ]
      )}
    >
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Drag Handle */}
            <div
              {...provided.dragHandleProps}
              className={cn(
                "flex items-center gap-2 p-2 rounded cursor-grab active:cursor-grabbing",
                "hover:bg-gray-100 dark:hover:bg-gray-800",
                "transition-colors duration-200",
                "touch-none select-none",
                provided.isDragging && "cursor-grabbing"
              )}
              style={{
                touchAction: 'none'
              }}
            >
              <GripVertical className="h-5 w-5 text-gray-400" />
            </div>
            
            <Button
              onClick={() => onToggle(meshName)}
              variant="ghost"
              size="sm"
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {expanded ? 
                <ChevronDown className="h-5 w-5 text-gray-500" /> : 
                <ChevronRight className="h-5 w-5 text-gray-500" />
              }
            </Button>
            <h5 className="font-medium text-lg text-gray-900 dark:text-gray-100">
              {meshName}
            </h5>
            <Badge variant="secondary" className="ml-2">
              {localVariants.length} variants
            </Badge>
            
            {/* AutoTag Status Badge */}
            {autoTagEnabled && assignment.autoTag?.tag && (
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300">
                  <Zap className="h-3 w-3 mr-1" />
                  {assignment.autoTag.tag}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {getSelectedMaterialsCount()}/{getTaggedMaterials().length}
                </Badge>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Move Up/Down Buttons */}
            <div className="flex flex-col mr-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => onMove(index, 'up')}
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1"
                    disabled={!canMove(index, 'up')}
                  >
                    <ChevronUp className={cn(
                      "h-4 w-4 transition-colors",
                      !canMove(index, 'up') ? "text-gray-300" : "text-gray-600 hover:text-gray-900"
                    )} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Move Up</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => onMove(index, 'down')}
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1"
                    disabled={!canMove(index, 'down')}
                  >
                    <ChevronDown className={cn(
                      "h-4 w-4 transition-colors",
                      !canMove(index, 'down') ? "text-gray-300" : "text-gray-600 hover:text-gray-900"
                    )} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Move Down</TooltipContent>
              </Tooltip>
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  onClick={() => onRename(meshName)} 
                  variant="outline" 
                  size="sm"
                  className="hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Rename
                </Button>
              </TooltipTrigger>
              <TooltipContent>Rename mesh</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  onClick={handleAutoTagClick}
                  variant="outline" 
                  size="sm"
                  className={autoTagClass}
                >
                  <Zap className="h-4 w-4 text-blue-500" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {autoTagEnabled 
                  ? `Auto-tagging enabled for variants (${assignment.autoTag?.tag})`
                  : "Enable auto-tagging for variants"
                }
              </TooltipContent>
            </Tooltip>

            {/* Material Selection Button - Only show when auto-tag is enabled */}
            {autoTagEnabled && assignment.autoTag?.tag && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={handleMaterialSelectionClick}
                    variant="outline" 
                    size="sm"
                    className="hover:bg-blue-100 dark:hover:bg-blue-800"
                  >
                    <Settings className="h-4 w-4 text-blue-500" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Configure material selection ({getSelectedMaterialsCount()}/{getTaggedMaterials().length} selected)
                </TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  onClick={() => onRemove(meshName)}
                  variant="outline" 
                  size="sm"
                  className="hover:bg-red-50 dark:hover:bg-red-900"
                >
                  <X className="h-4 w-4 text-red-500" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove mesh</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-6">
          {/* Default Material Section */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Default Material
            </label>
            <SearchableSelect
              value={localDefaultMaterial}
              onValueChange={handleDefaultMaterialChange}
              options={materials}
              placeholder="Select a material"
              className="w-full"
            />
          </div>

          {/* Variants Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Variant Materials
              </label>
              <Button
                onClick={() => setExpandedVariants(!expandedVariants)}
                variant="ghost"
                size="sm"
                className="text-gray-500 hover:text-gray-700"
              >
                {expandedVariants ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>

            {expandedVariants && (
              <Card className="border border-gray-200 dark:border-gray-700">
                <ScrollArea className="h-[300px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40%]">Variant Name</TableHead>
                        <TableHead className="w-[50%]">Material</TableHead>
                        <TableHead className="w-[10%]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {localVariants.map((variant, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Input
                              value={variant.name}
                              onChange={(e) => handleVariantFieldChange(index, "name", e.target.value)}
                              placeholder="Variant name"
                              className="w-full"
                            />
                          </TableCell>
                          <TableCell>
                            <SearchableSelect
                              value={variant.material}
                              onValueChange={(value) => handleVariantFieldChange(index, "material", value || '')}
                              options={materials}
                              placeholder="Select a material"
                            />
                          </TableCell>
                          <TableCell>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  onClick={() => handleRemoveVariantLocal(index)}
                                  variant="ghost"
                                  size="sm"
                                  className="hover:bg-red-50 dark:hover:bg-red-900"
                                >
                                  <X className="h-4 w-4 text-red-500" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Remove variant</TooltipContent>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>

                <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                  <Button
                    onClick={handleAddVariantLocal}
                    variant="outline"
                    size="sm"
                    className="w-full hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Variant
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </CardContent>
      )}

      <TagSelectionModal
        isOpen={isTagSelectionOpen}
        onClose={() => setIsTagSelectionOpen(false)}
        onSelectTag={(tag) => {
          onAutoTagChange(meshName, true, tag);
          setIsTagSelectionOpen(false);
        }}
        tags={availableTags}
        title="Select Auto-Tag"
        description="This mesh will automatically use materials with the selected tag"
      />

      <AutoTagMaterialSelectionModal
        isOpen={isMaterialSelectionOpen}
        onClose={() => setIsMaterialSelectionOpen(false)}
        onConfirm={(selectedMaterials, excludedMaterials) => {
          if (assignment.autoTag?.tag) {
            onAutoTagChange(
              meshName, 
              true, 
              assignment.autoTag.tag, 
              selectedMaterials, 
              excludedMaterials
            );
          }
          setIsMaterialSelectionOpen(false);
        }}
        tag={assignment.autoTag?.tag || ''}
        materials={materials}
        initialSelectedMaterials={assignment.autoTag?.selectedMaterials}
        initialExcludedMaterials={assignment.autoTag?.excludedMaterials}
      />
    </Card>
  );
};

export default MeshItem;