// src/components/MaterialMeshEditor/MeshAssignmentsSection.tsx

import React, { useState, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, ChevronLeft, ChevronRight, FolderPlus, Search, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import MeshItem from './MeshItem';
import MeshGroupItem from './MeshGroupItem';
import { MeshGroup } from '@/gltf/gltfTypes';

interface MeshAssignmentsSectionProps {
  meshItems: [string, { defaultMaterial: string; variants: Array<{ name: string; material: string }> }][];
  meshGroups: { [groupId: string]: MeshGroup };
  materials: Array<{ name: string; tags: string[] }>; // Fixed: Added tags property
  expandedMeshes: Set<string>;
  onToggleMeshExpansion: (meshName: string) => void;
  onRenameMesh: (meshName: string) => void;
  onRemoveMesh: (meshName: string) => void;
  onAutoAssignTag: (meshName: string, tag: string) => void;
  onAssignmentChange: (meshName: string, field: "defaultMaterial" | "variants", value: string | undefined) => void;
  onVariantChange: (meshName: string, index: number, field: "name" | "material", value: string | undefined) => void;
  onRemoveVariant: (meshName: string, index: number) => void;
  onAddVariant: (meshName: string) => void;
  onAddMesh: () => void;
  onAddGroup: () => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  onDragEnd: (result: any) => void;
  onMoveMesh: (fromIndex: number, direction: 'up' | 'down') => void;
  canMove: (index: number, direction: 'up' | 'down') => boolean;
  totalItems: number;
  availableTags: string[];
  onAutoTagChange: (meshName: string, enabled: boolean, tag?: string, selectedMaterials?: string[], excludedMaterials?: string[]) => void; // Fixed: Added new parameters
  
  // Group-specific handlers
  onToggleGroup: (groupId: string) => void;
  onRenameGroup: (groupId: string) => void;
  onRemoveGroup: (groupId: string) => void;
  onSetGroupFilenames: (groupId: string, filenames: string[]) => void;
  onAddMeshToGroup: (groupId: string) => void;
  onGroupAssignmentChange: (groupId: string, meshName: string, field: "defaultMaterial" | "variants", value: string | undefined) => void;
  onGroupVariantChange: (groupId: string, meshName: string, index: number, field: "name" | "material", value: string | undefined) => void;
  onRemoveVariantFromGroup: (groupId: string, meshName: string, index: number) => void;
  onAddVariantToGroup: (groupId: string, meshName: string) => void;
  onRemoveMeshFromGroup: (groupId: string, meshName: string) => void;
  onRenameMeshInGroup: (groupId: string, meshName: string) => void;
  onGroupAutoTagChange: (groupId: string, meshName: string, enabled: boolean, tag?: string, selectedMaterials?: string[], excludedMaterials?: string[]) => void; // Fixed: Added new parameters
  onGroupAutoAssignTag: (groupId: string, meshName: string, tag: string) => void;
  onMoveGroup: (fromIndex: number, direction: 'up' | 'down') => void;
  canMoveGroup: (index: number, direction: 'up' | 'down') => boolean;
}

const MeshAssignmentsSection: React.FC<MeshAssignmentsSectionProps> = ({
  meshItems,
  meshGroups,
  materials,
  expandedMeshes,
  onToggleMeshExpansion,
  onRenameMesh,
  onRemoveMesh,
  onAutoAssignTag,
  onAssignmentChange,
  onVariantChange,
  onRemoveVariant,
  onAddVariant,
  onAddMesh,
  onAddGroup,
  currentPage,
  totalPages,
  onPageChange,
  onDragEnd,
  onMoveMesh,
  canMove,
  totalItems,
  availableTags,
  onAutoTagChange,
  onToggleGroup,
  onRenameGroup,
  onRemoveGroup,
  onSetGroupFilenames,
  onAddMeshToGroup,
  onGroupAssignmentChange,
  onGroupVariantChange,
  onRemoveVariantFromGroup,
  onAddVariantToGroup,
  onRemoveMeshFromGroup,
  onRenameMeshInGroup,
  onGroupAutoTagChange,
  onGroupAutoAssignTag,
  onMoveGroup,
  canMoveGroup,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Filter groups and meshes based on search term (top layer only)
  const filteredGroups = useMemo(() => {
    if (!searchTerm.trim()) return Object.values(meshGroups);
    
    const lowerSearchTerm = searchTerm.toLowerCase();
    return Object.values(meshGroups).filter(group => {
      // Check group name
      if (group.name.toLowerCase().includes(lowerSearchTerm)) return true;
      
      // Check group filenames
      return group.filenames.some(filename => filename.toLowerCase().includes(lowerSearchTerm));
    });
  }, [meshGroups, searchTerm]);

  const filteredMeshItems = useMemo(() => {
    if (!searchTerm.trim()) return meshItems;
    
    const lowerSearchTerm = searchTerm.toLowerCase();
    return meshItems.filter(([meshName]) => {
      // Only check mesh name (top layer)
      return meshName.toLowerCase().includes(lowerSearchTerm);
    });
  }, [meshItems, searchTerm]);

  const groupCount = filteredGroups.length;
  const meshCount = filteredMeshItems.length;
  const totalFilteredMeshCount = meshCount + filteredGroups.reduce((acc, group) => acc + Object.keys(group.meshes).length, 0);

  const clearSearch = () => setSearchTerm('');

  return (
    <div className="space-y-6">
      <Card className="border-none shadow-none bg-transparent">
        <CardHeader className="px-0">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl text-gray-900 dark:text-gray-100">
                Mesh Assignments
              </CardTitle>
              <CardDescription>
                Configure material assignments for each mesh and organize them into groups. 
                Groups can be associated with specific filenames for targeted processing.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-sm">
                {groupCount} groups
              </Badge>
              <Badge variant="secondary" className="text-sm">
                {totalFilteredMeshCount} total meshes
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search groups (by name/filenames) or meshes (by name)..."
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
                  Found {totalFilteredMeshCount} meshes in {groupCount} groups
                </span>
                {(filteredGroups.length === 0 && filteredMeshItems.length === 0) && (
                  <Badge variant="outline" className="text-amber-600 border-amber-300">
                    No results
                  </Badge>
                )}
              </div>
            )}

            {/* Filtered Mesh Groups */}
            {filteredGroups.map((group, index) => (
              <MeshGroupItem
                key={group.id}
                group={group}
                materials={materials}
                onToggle={onToggleGroup}
                onRename={onRenameGroup}
                onRemove={onRemoveGroup}
                onSetFilenames={onSetGroupFilenames}
                onAddMeshToGroup={onAddMeshToGroup}
                onAssignmentChange={onGroupAssignmentChange}
                onVariantChange={onGroupVariantChange}
                onRemoveVariant={onRemoveVariantFromGroup}
                onAddVariant={onAddVariantToGroup}
                onRemoveMeshFromGroup={onRemoveMeshFromGroup}
                onRenameMeshInGroup={onRenameMeshInGroup}
                provided={{
                  innerRef: () => {},
                  attributes: {},
                  dragHandleProps: {},
                  isDragging: false
                }}
                index={index}
                totalItems={groupCount}
                onMove={onMoveGroup}
                canMove={canMoveGroup}
                availableTags={availableTags}
                onAutoTagChange={onGroupAutoTagChange}
                onAutoAssignTag={onGroupAutoAssignTag}
                expandedMeshes={expandedMeshes}
                onToggleMeshExpansion={onToggleMeshExpansion}
              />
            ))}

            {/* Regular Meshes (Filtered) */}
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="meshes">
                {(provided) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className="space-y-4"
                  >
                    {filteredMeshItems.map(([meshName, assignment], index) => (
                      <Draggable 
                        key={meshName} 
                        draggableId={meshName} 
                        index={index}
                      >
                        {(provided) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                          >
                            <MeshItem
                              meshName={meshName}
                              assignment={assignment}
                              materials={materials}
                              expanded={expandedMeshes.has(meshName)}
                              onToggle={onToggleMeshExpansion}
                              onRename={onRenameMesh}
                              onRemove={onRemoveMesh}
                              onAutoAssign={onAutoAssignTag}
                              onAssignmentChange={onAssignmentChange}
                              onVariantChange={onVariantChange}
                              onRemoveVariant={onRemoveVariant}
                              onAddVariant={onAddVariant}
                              provided={provided}
                              index={index}
                              totalItems={totalItems}
                              onMove={onMoveMesh}
                              canMove={canMove}
                              availableTags={availableTags}
                              onAutoTagChange={onAutoTagChange}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>

            {/* Pagination - Hide when searching */}
            {!searchTerm && totalPages > 1 && (
              <div className="flex justify-between items-center mt-6">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() => onPageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      variant="outline"
                      size="sm"
                    >
                      <ChevronLeft className="h-4 w-4 mr-2" />
                      Previous
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Previous page</TooltipContent>
                </Tooltip>

                <span className="text-sm text-gray-500">
                  Page {currentPage} of {totalPages}
                </span>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() => onPageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      variant="outline"
                      size="sm"
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Next page</TooltipContent>
                </Tooltip>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                onClick={onAddGroup}
                variant="outline"
                className="flex-1 hover:bg-blue-50 dark:hover:bg-blue-900 border-blue-200 dark:border-blue-800"
              >
                <FolderPlus size={16} className="mr-2 text-blue-500" /> 
                Add Group
              </Button>
              
              <Button
                onClick={onAddMesh}
                variant="outline"
                className="flex-1 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <Plus size={16} className="mr-2" /> 
                Add Mesh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MeshAssignmentsSection;