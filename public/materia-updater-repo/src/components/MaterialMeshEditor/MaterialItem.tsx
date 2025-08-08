// src/components/MaterialMeshEditor/MaterialItem.tsx

import React from 'react';
import { Edit2, X, ChevronUp, ChevronDown, Tag, Plus, Minus } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import TagList from '@/components/ui/tag-list';
import { cn } from "@/lib/utils";

interface MaterialItemProps {
  material: { name: string; tags: string[] };
  index: number;
  totalItems: number;
  onEditTags: (name: string) => void;
  onRenameMaterial: (name: string) => void;
  onRemoveMaterial: (name: string) => void;
  onMoveMaterial: (index: number, direction: 'up' | 'down') => void;
  onRemoveTag: (materialName: string, tag: string) => void;
  provided: any;
  isAutoSortEnabled: boolean;
  
  // Multi-select props
  isSelected: boolean;
  onSelect: (materialName: string, index: number, event: React.MouseEvent) => void;
  onCheckboxChange: (materialName: string, event: React.MouseEvent) => void;
  checkboxState: {
    checked: boolean | 'indeterminate';
    disabled: boolean;
  };
  
  // Bulk operations
  selectedCount: number;
  onBulkAddTags: () => void;
  onBulkRemoveTags: () => void;
}

const MaterialItem: React.FC<MaterialItemProps> = ({ 
  material,
  index,
  totalItems,
  onEditTags,
  onRenameMaterial,
  onRemoveMaterial,
  onMoveMaterial,
  onRemoveTag,
  provided,
  isAutoSortEnabled,
  isSelected,
  onSelect,
  onCheckboxChange,
  checkboxState,
  selectedCount,
  onBulkAddTags,
  onBulkRemoveTags
}) => {
  const isMultipleSelected = selectedCount > 1;

  return (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      {...provided.dragHandleProps}
      onClick={(e) => onSelect(material.name, index, e)}
      className={cn(
        "group flex justify-between items-center p-4",
        "bg-white dark:bg-gray-800",
        "rounded-lg border border-gray-200 dark:border-gray-700",
        "shadow-sm hover:shadow-md transition-all duration-200",
        "relative overflow-hidden cursor-pointer",
        "select-none", // Prevent text selection
        !isAutoSortEnabled && "cursor-grab active:cursor-grabbing",
        isAutoSortEnabled && "cursor-pointer",
        "before:absolute before:inset-y-0 before:left-0 before:w-1",
        "before:bg-gray-200 dark:before:bg-gray-700",
        "before:group-hover:bg-blue-500 before:transition-colors",
        isSelected && [
          "bg-blue-50 dark:bg-blue-950/30",
          "border-blue-300 dark:border-blue-700",
          "before:bg-blue-500"
        ],
        provided.isDragging && [
          "shadow-lg",
          "z-50",
          "!transform-none",
          "opacity-95",
          "[&_*]:pointer-events-none"
        ]
      )}
    >
      <div className="flex items-center flex-1 min-w-0 gap-3">
        {/* Checkbox for multi-select */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex items-center"
        >
          <Checkbox
            checked={checkboxState.checked}
            disabled={checkboxState.disabled}
            onClick={(e) => {
              if (!checkboxState.disabled) {
                onCheckboxChange(material.name, e as unknown as React.MouseEvent);
              }
            }}
            className={cn(
              "transition-opacity",
              checkboxState.disabled && "opacity-50"
            )}
          />
        </div>

        <div className="flex flex-col min-w-0 flex-1">
          <span className="font-medium text-gray-900 dark:text-gray-100 truncate select-text">
            {material.name}
          </span>
          <TagList 
            tags={material.tags}
            onRemoveTag={(tag) => onRemoveTag(material.name, tag)}
            className="mt-1"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 ml-4">
        {/* Move Buttons - Only show if not auto-sorted */}
        {!isAutoSortEnabled && (
          <div className="flex flex-col mr-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveMaterial(index, 'up');
                  }}
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1"
                  disabled={index === 0}
                >
                  <ChevronUp className={cn(
                    "h-4 w-4 transition-colors",
                    index === 0 ? "text-gray-300" : "text-gray-600 hover:text-gray-900"
                  )} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Move Up</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveMaterial(index, 'down');
                  }}
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1"
                  disabled={index === totalItems - 1}
                >
                  <ChevronDown className={cn(
                    "h-4 w-4 transition-colors",
                    index === totalItems - 1 ? "text-gray-300" : "text-gray-600 hover:text-gray-900"
                  )} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Move Down</TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          {isMultipleSelected ? (
            // Bulk operation buttons
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onBulkAddTags();
                    }}
                    variant="ghost"
                    size="sm"
                    className="text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Add Tags to Selected ({selectedCount})</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onBulkRemoveTags();
                    }}
                    variant="ghost"
                    size="sm"
                    className="text-orange-500 hover:text-orange-700 hover:bg-orange-50"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remove Tags from Selected ({selectedCount})</TooltipContent>
              </Tooltip>
            </>
          ) : (
            // Individual operation buttons
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditTags(material.name);
                    }}
                    variant="ghost"
                    size="sm"
                    className="text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                  >
                    <Tag className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit Tags</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onRenameMaterial(material.name);
                    }}
                    variant="ghost"
                    size="sm"
                    className="text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Rename Material</TooltipContent>
              </Tooltip>
            </>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveMaterial(material.name);
                }}
                variant="ghost"
                size="sm"
                className="text-red-500 hover:text-red-700 hover:bg-red-50"
              >
                <X className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove Material</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

export default MaterialItem;