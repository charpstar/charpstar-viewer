// src/components/MaterialMeshEditor/MeshGroupItem.tsx

import React, { useState } from 'react';
import { 
  GripVertical, 
  ChevronDown, 
  ChevronRight, 
  ChevronUp, 
  X, 
  Plus,
  FolderOpen,
  Settings,
  Edit2
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import MeshItem from './MeshItem';
import SetFilenamesModal from '../Dialogs/SetFilenamesModal';
import { MeshGroup } from '@/gltf/gltfTypes';

interface MeshGroupItemProps {
  group: MeshGroup;
  materials: Array<{ name: string; tags: string[] }>; // Updated to include tags
  onToggle: (groupId: string) => void;
  onRename: (groupId: string) => void;
  onRemove: (groupId: string) => void;
  onSetFilenames: (groupId: string, filenames: string[]) => void;
  onAddMeshToGroup: (groupId: string) => void;
  onAssignmentChange: (groupId: string, meshName: string, field: "defaultMaterial" | "variants", value: string | undefined) => void;
  onVariantChange: (groupId: string, meshName: string, index: number, field: "name" | "material", value: string | undefined) => void;
  onRemoveVariant: (groupId: string, meshName: string, index: number) => void;
  onAddVariant: (groupId: string, meshName: string) => void;
  onRemoveMeshFromGroup: (groupId: string, meshName: string) => void;
  onRenameMeshInGroup: (groupId: string, meshName: string) => void;
  provided: any;
  index: number;
  totalItems: number;
  onMove: (index: number, direction: 'up' | 'down') => void;
  canMove: (index: number, direction: 'up' | 'down') => boolean;
  availableTags: string[];
  onAutoTagChange: (groupId: string, meshName: string, enabled: boolean, tag?: string, selectedMaterials?: string[], excludedMaterials?: string[]) => void; // Updated
  onAutoAssignTag: (groupId: string, meshName: string, tag: string) => void;
  expandedMeshes: Set<string>;
  onToggleMeshExpansion: (meshName: string) => void;
}

const MeshGroupItem: React.FC<MeshGroupItemProps> = ({ 
  group,
  materials,
  onToggle,
  onRename,
  onRemove,
  onSetFilenames,
  onAddMeshToGroup,
  onAssignmentChange,
  onVariantChange,
  onRemoveVariant,
  onAddVariant,
  onRemoveMeshFromGroup,
  onRenameMeshInGroup,
  provided,
  index,
  totalItems,
  onMove,
  canMove,
  availableTags,
  onAutoTagChange,
  onAutoAssignTag,
  expandedMeshes,
  onToggleMeshExpansion
}) => {
  const [isFilenamesModalOpen, setIsFilenamesModalOpen] = useState(false);
  
  const meshCount = Object.keys(group.meshes).length;
  const filenameCount = group.filenames.length;

  return (
    <>
      <Card 
        ref={provided.innerRef}
        {...provided.attributes}
        className={cn(
          "group transition-all duration-200",
          "border-blue-200 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-950/20",
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
                  "hover:bg-blue-100 dark:hover:bg-blue-800",
                  "transition-colors duration-200",
                  "touch-none select-none",
                  provided.isDragging && "cursor-grabbing"
                )}
                style={{
                  touchAction: 'none'
                }}
              >
                <GripVertical className="h-5 w-5 text-blue-400" />
              </div>
              
              <Button
                onClick={() => onToggle(group.id)}
                variant="ghost"
                size="sm"
                className="p-1 hover:bg-blue-100 dark:hover:bg-blue-800"
              >
                {group.isExpanded ? 
                  <ChevronDown className="h-5 w-5 text-blue-500" /> : 
                  <ChevronRight className="h-5 w-5 text-blue-500" />
                }
              </Button>

              <FolderOpen className="h-5 w-5 text-blue-500" />
              
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <h5 className="font-medium text-lg text-blue-900 dark:text-blue-100">
                    {group.name}
                  </h5>
                  <Badge variant="outline" className="text-xs bg-blue-100 text-blue-700 border-blue-300">
                    GROUP
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-blue-600 dark:text-blue-400">
                  <span>{meshCount} meshes</span>
                  <span>•</span>
                  <span>{filenameCount} filenames</span>
                </div>
              </div>
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
                        !canMove(index, 'up') ? "text-gray-300" : "text-blue-600 hover:text-blue-900"
                      )} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Move Group Up</TooltipContent>
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
                        !canMove(index, 'down') ? "text-gray-300" : "text-blue-600 hover:text-blue-900"
                      )} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Move Group Down</TooltipContent>
                </Tooltip>
              </div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={() => setIsFilenamesModalOpen(true)}
                    variant="outline" 
                    size="sm"
                    className="hover:bg-blue-100 dark:hover:bg-blue-800"
                  >
                    <Settings className="h-4 w-4 text-blue-500" />
                    Set Filenames
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Configure filenames for this group</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={() => onRename(group.id)} 
                    variant="outline" 
                    size="sm"
                    className="hover:bg-blue-100 dark:hover:bg-blue-800"
                  >
                    <Edit2 className="h-4 w-4 text-blue-500" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Rename group</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={() => onRemove(group.id)}
                    variant="outline" 
                    size="sm"
                    className="hover:bg-red-50 dark:hover:bg-red-900"
                  >
                    <X className="h-4 w-4 text-red-500" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remove group</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </CardHeader>

        {group.isExpanded && (
          <CardContent className="space-y-4">
            {/* Group Meshes */}
            <div className="space-y-3">
              {Object.entries(group.meshes).map(([meshName, assignment]) => (
                <div key={meshName} className="pl-4 border-l-2 border-blue-200 dark:border-blue-800">
                  <MeshItem
                    meshName={meshName}
                    assignment={assignment}
                    materials={materials}
                    expanded={expandedMeshes.has(`${group.id}_${meshName}`)}
                    onToggle={() => onToggleMeshExpansion(`${group.id}_${meshName}`)}
                    onRename={() => onRenameMeshInGroup(group.id, meshName)}
                    onRemove={() => onRemoveMeshFromGroup(group.id, meshName)}
                    onAutoAssign={(_, tag) => onAutoAssignTag(group.id, meshName, tag)}
                    onAssignmentChange={(_, field, value) => onAssignmentChange(group.id, meshName, field, value)}
                    onVariantChange={(_, index, field, value) => onVariantChange(group.id, meshName, index, field, value)}
                    onRemoveVariant={(_, index) => onRemoveVariant(group.id, meshName, index)}
                    onAddVariant={() => onAddVariant(group.id, meshName)}
                    provided={{
                      innerRef: () => {},
                      attributes: {},
                      dragHandleProps: {},
                      isDragging: false
                    }}
                    index={0}
                    totalItems={1}
                    onMove={() => {}}
                    canMove={() => false}
                    availableTags={availableTags}
                    onAutoTagChange={(_, enabled, tag) => onAutoTagChange(group.id, meshName, enabled, tag)}
                  />
                </div>
              ))}
            </div>

            {/* Add Mesh to Group Button */}
            <Button
              onClick={() => onAddMeshToGroup(group.id)}
              variant="outline"
              size="sm"
              className="w-full hover:bg-blue-50 dark:hover:bg-blue-900"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Mesh to Group
            </Button>
          </CardContent>
        )}
      </Card>

      <SetFilenamesModal
        isOpen={isFilenamesModalOpen}
        onClose={() => setIsFilenamesModalOpen(false)}
        onSubmit={(filenames) => onSetFilenames(group.id, filenames)}
        initialFilenames={group.filenames}
        groupName={group.name}
      />
    </>
  );
};

export default MeshGroupItem;