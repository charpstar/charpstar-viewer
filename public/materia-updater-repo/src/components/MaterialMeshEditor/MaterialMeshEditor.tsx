// src/components/MaterialMeshEditor/MaterialMeshEditor.tsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import InputDialog from '../Dialogs/InputDialog';
import MaterialsSection from './MaterialsSection';
import MeshAssignmentsSection from './MeshAssignmentsSection';
import MaterialSortDialog from '../Dialogs/MaterialSortDialog';
import DuplicateMaterialDialog from '../Dialogs/DuplicateMaterialDialog';
import BulkTagModal from '../Dialogs/BulkTagModal';
import { MaterialData, Material, MeshAssignment, MeshGroup, Variant, TagSortState } from '@/gltf/gltfTypes';
import { ScrollArea } from '../ui/scroll-area';
import PreviewVariantsSection from './PreviewVariantsSection';
import ExtractVariantsButton from './ExtractVariantsButton';

interface MaterialMeshEditorProps {
  data: MaterialData;
  onSave: (data: MaterialData) => void;
  onUpdate: (data: MaterialData) => void;
}

const ITEMS_PER_PAGE = 7;

const MaterialMeshEditor: React.FC<MaterialMeshEditorProps> = ({ 
  data, 
  onSave,
  onUpdate
}) => {
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [meshAssignments, setMeshAssignments] = useState<{[key: string]: MeshAssignment}>({});
  const [meshGroups, setMeshGroups] = useState<{[key: string]: MeshGroup}>({});
  const [expandedMeshes, setExpandedMeshes] = useState<Set<string>>(new Set());
  const [allTags, setAllTags] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isAutoSortEnabled, setIsAutoSortEnabled] = useState(
    data.sortSettings?.autoSortEnabled ?? false
  );

  const [isAddMaterialDialogOpen, setIsAddMaterialDialogOpen] = useState(false);
  const [isAddMeshDialogOpen, setIsAddMeshDialogOpen] = useState(false);
  const [isAddGroupDialogOpen, setIsAddGroupDialogOpen] = useState(false);
  const [isAddMeshToGroupDialogOpen, setIsAddMeshToGroupDialogOpen] = useState(false);
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);
  const [newMaterialTags, setNewMaterialTags] = useState<string>('');
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);
  const [isSortDialogOpen, setIsSortDialogOpen] = useState(false);
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
  const [currentItemToRename, setCurrentItemToRename] = useState<string | null>(null);
  const [currentItemToTag, setCurrentItemToTag] = useState<string | null>(null);
  const [renameType, setRenameType] = useState<'mesh' | 'group' | 'groupMesh' | 'material'>('mesh');
  const [duplicateMaterials, setDuplicateMaterials] = useState<Array<{
    name: string;
    existingTags: string[];
    newTags: string[];
  }>>([]);

  const [isBulkTagModalOpen, setIsBulkTagModalOpen] = useState(false);
  const [bulkTagMode, setBulkTagMode] = useState<'add' | 'remove'>('add');
  const [selectedMaterialsForBulk, setSelectedMaterialsForBulk] = useState<string[]>([]);

  const safeUpdate = useCallback((updatedData: MaterialData) => {
    if (onUpdate) {
      onUpdate(updatedData);
    }
  }, [onUpdate]);

  const updateAllTags = useCallback((materials: Material[]) => {
    const tags = new Set<string>();
    materials.forEach(material => material.tags.forEach(tag => tags.add(tag)));
    setAllTags(Array.from(tags));
  }, []);

  // Remove the auto-loading from localStorage in this useEffect
  useEffect(() => {
    try {
      if (data) {
        setMaterials(data.materials || []);
        setMeshAssignments(data.meshAssignments || {});
        setMeshGroups(data.meshGroups || {});
        updateAllTags(data.materials || []);
        setIsAutoSortEnabled(data.sortSettings?.autoSortEnabled ?? false);
      } else {
        setMaterials([]);
        setMeshAssignments({});
        setMeshGroups({});
        setAllTags([]);
        setIsAutoSortEnabled(false);
        setActiveSection(null);
        setExpandedMeshes(new Set());
      }
    } catch (error) {
      console.error('Error setting initial state:', error);
    }
  }, [data, updateAllTags]);

  // Group management functions
  const handleAddGroup = useCallback(() => {
    setIsAddGroupDialogOpen(true);
  }, []);

  const handleAddGroupSubmit = useCallback((groupName: string) => {
    if (groupName.trim()) {
      const groupId = `group_${Date.now()}`;
      const newGroup: MeshGroup = {
        id: groupId,
        name: groupName.trim(),
        filenames: [],
        meshes: {},
        isExpanded: false
      };

      setMeshGroups(prev => {
        const newGroups = {
          ...prev,
          [groupId]: newGroup
        };

        const updatedData = {
          ...data,
          materials,
          meshAssignments,
          meshGroups: newGroups
        };
        safeUpdate(updatedData);

        return newGroups;
      });
    }
    setIsAddGroupDialogOpen(false);
  }, [data, materials, meshAssignments, safeUpdate]);

  const handleToggleGroup = useCallback((groupId: string) => {
    setMeshGroups(prev => {
      const newGroups = {
        ...prev,
        [groupId]: {
          ...prev[groupId],
          isExpanded: !prev[groupId].isExpanded
        }
      };

      const updatedData = {
        ...data,
        materials,
        meshAssignments,
        meshGroups: newGroups
      };
      safeUpdate(updatedData);

      return newGroups;
    });
  }, [data, materials, meshAssignments, safeUpdate]);

  const handleRenameGroup = useCallback((groupId: string) => {
    setCurrentItemToRename(groupId);
    setRenameType('group');
    setIsRenameDialogOpen(true);
  }, []);

  const handleRemoveGroup = useCallback((groupId: string) => {
    setMeshGroups(prev => {
      const newGroups = { ...prev };
      delete newGroups[groupId];

      const updatedData = {
        ...data,
        materials,
        meshAssignments,
        meshGroups: newGroups
      };
      safeUpdate(updatedData);

      return newGroups;
    });
  }, [data, materials, meshAssignments, safeUpdate]);

  const handleSetGroupFilenames = useCallback((groupId: string, filenames: string[]) => {
    setMeshGroups(prev => {
      const newGroups = {
        ...prev,
        [groupId]: {
          ...prev[groupId],
          filenames
        }
      };

      const updatedData = {
        ...data,
        materials,
        meshAssignments,
        meshGroups: newGroups
      };
      safeUpdate(updatedData);

      return newGroups;
    });
  }, [data, materials, meshAssignments, safeUpdate]);

  const handleAddMeshToGroup = useCallback((groupId: string) => {
    setCurrentGroupId(groupId);
    setIsAddMeshToGroupDialogOpen(true);
  }, []);

  const handleAddMeshToGroupSubmit = useCallback((meshName: string) => {
    if (meshName.trim() && currentGroupId) {
      setMeshGroups(prev => {
        const newGroups = {
          ...prev,
          [currentGroupId]: {
            ...prev[currentGroupId],
            meshes: {
              ...prev[currentGroupId].meshes,
              [meshName.trim()]: { defaultMaterial: '', variants: [] }
            }
          }
        };

        const updatedData = {
          ...data,
          materials,
          meshAssignments,
          meshGroups: newGroups
        };
        safeUpdate(updatedData);

        return newGroups;
      });
    }
    setIsAddMeshToGroupDialogOpen(false);
    setCurrentGroupId(null);
  }, [currentGroupId, data, materials, meshAssignments, safeUpdate]);

  // Group mesh management
  const handleGroupAssignmentChange = useCallback((groupId: string, meshName: string, field: "defaultMaterial" | "variants", value: string | undefined) => {
    setMeshGroups(prev => {
      const newGroups = {
        ...prev,
        [groupId]: {
          ...prev[groupId],
          meshes: {
            ...prev[groupId].meshes,
            [meshName]: {
              ...prev[groupId].meshes[meshName],
              [field]: value || ''
            }
          }
        }
      };

      const updatedData = {
        ...data,
        materials,
        meshAssignments,
        meshGroups: newGroups
      };
      safeUpdate(updatedData);

      return newGroups;
    });
  }, [data, materials, meshAssignments, safeUpdate]);

  const handleGroupVariantChange = useCallback((groupId: string, meshName: string, index: number, field: "name" | "material", value: string | undefined) => {
    setMeshGroups(prev => {
      const newGroups = {
        ...prev,
        [groupId]: {
          ...prev[groupId],
          meshes: {
            ...prev[groupId].meshes,
            [meshName]: {
              ...prev[groupId].meshes[meshName],
              variants: prev[groupId].meshes[meshName].variants.map((v, i) => 
                i === index ? { ...v, [field]: value || '' } : v
              )
            }
          }
        }
      };

      const updatedData = {
        ...data,
        materials,
        meshAssignments,
        meshGroups: newGroups
      };
      safeUpdate(updatedData);

      return newGroups;
    });
  }, [data, materials, meshAssignments, safeUpdate]);

  const handleRemoveVariantFromGroup = useCallback((groupId: string, meshName: string, index: number) => {
    setMeshGroups(prev => {
      const newGroups = {
        ...prev,
        [groupId]: {
          ...prev[groupId],
          meshes: {
            ...prev[groupId].meshes,
            [meshName]: {
              ...prev[groupId].meshes[meshName],
              variants: prev[groupId].meshes[meshName].variants.filter((_, i) => i !== index)
            }
          }
        }
      };

      const updatedData = {
        ...data,
        materials,
        meshAssignments,
        meshGroups: newGroups
      };
      safeUpdate(updatedData);

      return newGroups;
    });
  }, [data, materials, meshAssignments, safeUpdate]);

  const handleAddVariantToGroup = useCallback((groupId: string, meshName: string) => {
    setMeshGroups(prev => {
      const newGroups = {
        ...prev,
        [groupId]: {
          ...prev[groupId],
          meshes: {
            ...prev[groupId].meshes,
            [meshName]: {
              ...prev[groupId].meshes[meshName],
              variants: [...prev[groupId].meshes[meshName].variants, { name: '', material: '' }]
            }
          }
        }
      };

      const updatedData = {
        ...data,
        materials,
        meshAssignments,
        meshGroups: newGroups
      };
      safeUpdate(updatedData);

      return newGroups;
    });
  }, [data, materials, meshAssignments, safeUpdate]);

  const handleRemoveMeshFromGroup = useCallback((groupId: string, meshName: string) => {
    setMeshGroups(prev => {
      const newGroups = {
        ...prev,
        [groupId]: {
          ...prev[groupId],
          meshes: Object.fromEntries(
            Object.entries(prev[groupId].meshes).filter(([name]) => name !== meshName)
          )
        }
      };

      const updatedData = {
        ...data,
        materials,
        meshAssignments,
        meshGroups: newGroups
      };
      safeUpdate(updatedData);

      return newGroups;
    });
  }, [data, materials, meshAssignments, safeUpdate]);

  const handleRenameMeshInGroup = useCallback((groupId: string, meshName: string) => {
    setCurrentItemToRename(`${groupId}:${meshName}`);
    setRenameType('groupMesh');
    setIsRenameDialogOpen(true);
  }, []);

  const handleGroupAutoTagChange = useCallback((groupId: string, meshName: string, enabled: boolean, tag?: string, selectedMaterials?: string[], excludedMaterials?: string[]) => {
    setMeshGroups(prev => {
      const newGroups = {
        ...prev,
        [groupId]: {
          ...prev[groupId],
          meshes: {
            ...prev[groupId].meshes,
            [meshName]: {
              ...prev[groupId].meshes[meshName],
              autoTag: enabled ? { 
                enabled, 
                tag: tag || prev[groupId].meshes[meshName]?.autoTag?.tag || '',
                selectedMaterials: selectedMaterials || prev[groupId].meshes[meshName]?.autoTag?.selectedMaterials,
                excludedMaterials: excludedMaterials || prev[groupId].meshes[meshName]?.autoTag?.excludedMaterials
              } : undefined
            }
          }
        }
      };

      // Apply material filtering logic for groups too
      if (enabled && tag) {
        const allTaggedMaterials = materials.filter(m => m.tags.includes(tag));
        
        let materialsToUse: typeof materials;
        if (selectedMaterials && selectedMaterials.length > 0) {
          materialsToUse = allTaggedMaterials.filter(m => selectedMaterials.includes(m.name));
        } else if (excludedMaterials && excludedMaterials.length > 0) {
          materialsToUse = allTaggedMaterials.filter(m => !excludedMaterials.includes(m.name));
        } else {
          materialsToUse = allTaggedMaterials;
        }
        
        if (materialsToUse.length > 0) {
          newGroups[groupId].meshes[meshName].variants = materialsToUse.map(m => ({ 
            name: m.name, 
            material: m.name 
          }));
        }
      }

      const updatedData = {
        ...data,
        materials,
        meshAssignments,
        meshGroups: newGroups
      };
      safeUpdate(updatedData);

      return newGroups;
    });
  }, [data, materials, meshAssignments, safeUpdate]);

  const handleGroupAutoAssignTag = useCallback((groupId: string, meshName: string, selectedTag: string) => {
    const taggedMaterials = materials.filter(m => m.tags.includes(selectedTag));
    if (taggedMaterials.length > 0) {
      setMeshGroups(prev => {
        const newGroups = {
          ...prev,
          [groupId]: {
            ...prev[groupId],
            meshes: {
              ...prev[groupId].meshes,
              [meshName]: {
                ...prev[groupId].meshes[meshName],
                defaultMaterial: taggedMaterials[0].name,
                variants: taggedMaterials.map(m => ({ name: m.name, material: m.name }))
              }
            }
          }
        };

        const updatedData = {
          ...data,
          materials,
          meshAssignments,
          meshGroups: newGroups
        };
        safeUpdate(updatedData);

        return newGroups;
      });
    }
  }, [materials, data, meshAssignments, safeUpdate]);

  const handleMoveGroup = useCallback((fromIndex: number, direction: 'up' | 'down') => {
    const groupEntries = Object.entries(meshGroups);
    const toIndex = fromIndex + (direction === 'up' ? -1 : 1);
    
    if (toIndex < 0 || toIndex >= groupEntries.length) return;

    [groupEntries[fromIndex], groupEntries[toIndex]] = 
    [groupEntries[toIndex], groupEntries[fromIndex]];
    
    const newGroups = Object.fromEntries(groupEntries);

    setMeshGroups(newGroups);

    const updatedData = {
      ...data,
      materials,
      meshAssignments,
      meshGroups: newGroups
    };
    safeUpdate(updatedData);
  }, [meshGroups, data, materials, meshAssignments, safeUpdate]);

  const canMoveGroup = useCallback((index: number, direction: 'up' | 'down'): boolean => {
    const groupCount = Object.keys(meshGroups).length;
    if (direction === 'up') {
      return index > 0;
    } else {
      return index < groupCount - 1;
    }
  }, [meshGroups]);

  const handleBulkEditTags = useCallback((materialNames: string[]) => {
    setSelectedMaterialsForBulk(materialNames);
    setBulkTagMode('add');
    setIsBulkTagModalOpen(true);
  }, []);

  const handleBulkRemoveTags = useCallback((materialNames: string[], availableTags: string[]) => {
    setSelectedMaterialsForBulk(materialNames);
    setBulkTagMode('remove');
    setIsBulkTagModalOpen(true);
  }, []);

  const autoTagAssignments = useMemo(() => {
    return Object.entries(meshAssignments).filter(([_, assignment]) => 
      assignment.autoTag?.enabled && assignment.autoTag.tag
    );
  }, [meshAssignments]);

  // Modified effect to handle auto-tag updates more efficiently
  useEffect(() => {
    if (!materials.length) return;
  
    const autoTaggedMeshes = autoTagAssignments.filter(([_, assignment]) => 
      assignment.autoTag?.enabled && assignment.autoTag.tag
    );
  
    if (autoTaggedMeshes.length === 0) return;
  
    const updates: { [key: string]: typeof meshAssignments[string] } = {};
    let hasChanges = false;
  
    autoTaggedMeshes.forEach(([meshName, assignment]) => {
      const tag = assignment.autoTag?.tag;
      if (!tag) return;
  
      // Get all materials with the tag
      const allTaggedMaterials = materials.filter(m => m.tags.includes(tag));
      
      // Apply filtering based on selected/excluded materials
      let materialsToUse: typeof materials;
      if (assignment.autoTag?.selectedMaterials && assignment.autoTag.selectedMaterials.length > 0) {
        // Use only selected materials
        materialsToUse = allTaggedMaterials.filter(m => 
          assignment.autoTag?.selectedMaterials?.includes(m.name)
        );
      } else if (assignment.autoTag?.excludedMaterials && assignment.autoTag.excludedMaterials.length > 0) {
        // Use all materials except excluded ones
        materialsToUse = allTaggedMaterials.filter(m => 
          !assignment.autoTag?.excludedMaterials?.includes(m.name)
        );
      } else {
        // Use all materials with the tag (default behavior)
        materialsToUse = allTaggedMaterials;
      }
      
      if (materialsToUse.length === 0) return;
  
      const newVariants = materialsToUse.map(m => ({ 
        name: m.name, 
        material: m.name 
      }));
  
      if (JSON.stringify(assignment.variants) !== JSON.stringify(newVariants)) {
        hasChanges = true;
        updates[meshName] = {
          ...assignment,
          variants: newVariants
        };
      }
    });
  
    if (hasChanges) {
      setMeshAssignments(prev => ({
        ...prev,
        ...updates
      }));
  
      const updatedData = {
        ...data,
        materials,
        meshAssignments: {
          ...meshAssignments,
          ...updates
        }
      };
  
      // Batch update using requestAnimationFrame
      requestAnimationFrame(() => {
        safeUpdate(updatedData);
      });
    }
  }, [materials, autoTagAssignments, data, safeUpdate, meshAssignments]);

  useEffect(() => {
    try {
      setMaterials(data.materials || []);
      setMeshAssignments(data.meshAssignments || {});
      updateAllTags(data.materials || []);
    } catch (error) {
      console.error('Error setting initial state:', error);
    }
  }, [data, updateAllTags]);

  useEffect(() => {
    setIsAutoSortEnabled(data.sortSettings?.autoSortEnabled ?? false);
  }, [data.sortSettings?.autoSortEnabled]);

  const sortMaterialsByCurrentSettings = useCallback((materialsToSort: Material[]) => {
    if (!data.sortSettings?.tagStates) return materialsToSort;

    const enabledTags = data.sortSettings.tagStates
      .filter(tag => tag.enabled)
      .sort((a, b) => a.order - b.order)
      .map(tag => tag.name);

    const isUntaggedEnabled = data.sortSettings.tagStates
      .find(t => t.name === 'Untagged')?.enabled ?? true;

    const materialGroups = new Map<string, Material[]>();
    enabledTags.forEach(tag => materialGroups.set(tag, []));
    materialGroups.set('untagged', []);
    materialGroups.set('remaining', []);

    materialsToSort.forEach(material => {
      if (material.tags.length === 0) {
        materialGroups.get('untagged')?.push(material);
        return;
      }

      let assigned = false;
      for (const tag of enabledTags) {
        if (material.tags.includes(tag)) {
          materialGroups.get(tag)?.push(material);
          assigned = true;
          break;
        }
      }

      if (!assigned) {
        materialGroups.get('remaining')?.push(material);
      }
    });

    enabledTags.forEach(tag => {
      const group = materialGroups.get(tag);
      if (group) {
        materialGroups.set(tag, group.sort((a, b) => a.name.localeCompare(b.name)));
      }
    });

    if (isUntaggedEnabled) {
      const untaggedGroup = materialGroups.get('untagged');
      if (untaggedGroup) {
        materialGroups.set('untagged', untaggedGroup.sort((a, b) => a.name.localeCompare(b.name)));
      }
    }

    const sortedMaterials: Material[] = [];
    enabledTags.forEach(tag => {
      sortedMaterials.push(...(materialGroups.get(tag) || []));
    });
    if (isUntaggedEnabled) {
      sortedMaterials.push(...(materialGroups.get('untagged') || []));
    }
    sortedMaterials.push(...(materialGroups.get('remaining') || []));

    return sortedMaterials;
  }, [data.sortSettings?.tagStates]);

  const handleAutoTagChange = useCallback((meshName: string, enabled: boolean, tag?: string, selectedMaterials?: string[], excludedMaterials?: string[]) => {
    setMeshAssignments(prev => {
      const currentAssignment = prev[meshName];
      
      const newAssignment = {
        ...currentAssignment,
        autoTag: enabled ? { 
          enabled, 
          tag: tag || currentAssignment?.autoTag?.tag || '',
          selectedMaterials: selectedMaterials || currentAssignment?.autoTag?.selectedMaterials,
          excludedMaterials: excludedMaterials || currentAssignment?.autoTag?.excludedMaterials
        } : undefined
      };

      if (enabled && tag) {
        // Get all materials with the tag
        const allTaggedMaterials = materials.filter(m => m.tags.includes(tag));
        
        // Use selectedMaterials if provided, otherwise use all tagged materials minus excluded ones
        let materialsToUse: typeof materials;
        if (selectedMaterials && selectedMaterials.length > 0) {
          materialsToUse = allTaggedMaterials.filter(m => selectedMaterials.includes(m.name));
        } else if (excludedMaterials && excludedMaterials.length > 0) {
          materialsToUse = allTaggedMaterials.filter(m => !excludedMaterials.includes(m.name));
        } else {
          materialsToUse = allTaggedMaterials;
        }
        
        if (materialsToUse.length > 0) {
          newAssignment.variants = materialsToUse.map(m => ({ 
            name: m.name, 
            material: m.name 
          }));
        }
      }

      const newAssignments = {
        ...prev,
        [meshName]: newAssignment
      };

      const updatedData = {
        ...data,
        materials,
        meshAssignments: newAssignments,
        meshGroups
      };
      
      requestAnimationFrame(() => {
        safeUpdate(updatedData);
      });

      return newAssignments;
    });
  }, [data, materials, meshGroups, safeUpdate]);

  const handleMaterialOrderChange = useCallback((result: any) => {
    if (!result.destination) return;

    setMaterials(prevMaterials => {
      const items = Array.from(prevMaterials);
      const [reorderedItem] = items.splice(result.source.index, 1);
      items.splice(result.destination.index, 0, reorderedItem);

      const finalMaterials = isAutoSortEnabled 
        ? sortMaterialsByCurrentSettings(items)
        : items;

      const updatedData = {
        ...data,
        materials: finalMaterials
      };
      onUpdate(updatedData);

      return finalMaterials;
    });
  }, [data, isAutoSortEnabled, sortMaterialsByCurrentSettings, onUpdate]);

  const handleAddMaterialsClick = useCallback(() => {
    setIsAddMaterialDialogOpen(true);
  }, []);

  const handleAddMeshClick = useCallback(() => {
    setIsAddMeshDialogOpen(true);
  }, []);

  const handleAddMaterialSubmit = useCallback((materialNames: string) => {
    const newMaterialNames = materialNames.split(',').map(m => m.trim()).filter(m => m);
    
    const newMaterials = newMaterialNames.map(name => ({
      name,
      tags: newMaterialTags.split(',').map(t => t.trim()).filter(t => t)
    }));

    const duplicates = newMaterials.filter(newMat => 
      materials.some(existingMat => existingMat.name === newMat.name)
    ).map(dupMat => ({
      name: dupMat.name,
      existingTags: materials.find(m => m.name === dupMat.name)?.tags || [],
      newTags: dupMat.tags
    }));

    if (duplicates.length > 0) {
      setDuplicateMaterials(duplicates);
      setIsDuplicateDialogOpen(true);
    } else {
      setMaterials(prevMaterials => {
        const combinedMaterials = [...prevMaterials, ...newMaterials];
        const sortedMaterials = isAutoSortEnabled 
          ? sortMaterialsByCurrentSettings(combinedMaterials)
          : combinedMaterials;

        const updatedData = {
          ...data,
          materials: sortedMaterials
        };
        safeUpdate(updatedData);
        updateAllTags(sortedMaterials);
        return sortedMaterials;
      });
    }

    setIsAddMaterialDialogOpen(false);
    setNewMaterialTags('');
  }, [materials, newMaterialTags, data, safeUpdate, updateAllTags, isAutoSortEnabled, sortMaterialsByCurrentSettings]);

  const handleAddMeshSubmit = useCallback((meshName: string) => {
    if (meshName && !meshAssignments[meshName]) {
      setMeshAssignments(prev => {
        const newAssignments = {
          ...prev,
          [meshName]: { defaultMaterial: '', variants: [] }
        };

        const updatedData = {
          ...data,
          materials,
          meshAssignments: newAssignments
        };
        safeUpdate(updatedData);

        return newAssignments;
      });
    }
    setIsAddMeshDialogOpen(false);
  }, [meshAssignments, data, materials, safeUpdate]);

  const handleDuplicateConfirm = useCallback((keepBoth: boolean) => {
    setIsDuplicateDialogOpen(false);
    
    if (keepBoth) {
      const newMaterials = duplicateMaterials.map(dupMat => ({
        name: `${dupMat.name}_1`,
        tags: dupMat.newTags
      }));
      
      setMaterials(prev => {
        const updated = [...prev, ...newMaterials];
        updateAllTags(updated);
        return updated;
      });
    } else {
      setMaterials(prev => {
        const updated = prev.map(material => {
          const duplicate = duplicateMaterials.find(dup => dup.name === material.name);
          if (duplicate) {
            return {
              ...material,
              tags: duplicate.newTags
            };
          }
          return material;
        });
        updateAllTags(updated);
        return updated;
      });
    }
  }, [duplicateMaterials, updateAllTags]);

  const handleSortMaterials = useCallback((sortedMaterials: Material[], sortSettings: TagSortState[]) => {
    const updatedData: MaterialData = {
      ...data,
      materials: sortedMaterials,
      sortSettings: {
        tagStates: sortSettings,
        timestamp: Date.now(),
        autoSortEnabled: isAutoSortEnabled
      }
    };
    
    onUpdate(updatedData);
    setMaterials(sortedMaterials);
  }, [data, isAutoSortEnabled, onUpdate]);

  const updateMaterialsWithSort = useCallback((updatedMaterials: Material[]) => {
    const finalMaterials = isAutoSortEnabled && data.sortSettings?.tagStates
      ? sortMaterialsByCurrentSettings(updatedMaterials)
      : updatedMaterials;

    setMaterials(finalMaterials);
    const updatedData = {
      ...data,
      materials: finalMaterials
    };
    onUpdate(updatedData);
  }, [data, onUpdate, isAutoSortEnabled, sortMaterialsByCurrentSettings]);

  const handleBulkTagConfirm = useCallback((selectedTags: string[], action: 'add' | 'remove') => {
    const updatedMaterials = materials.map(material => {
      if (selectedMaterialsForBulk.includes(material.name)) {
        let newTags = [...material.tags];
        
        if (action === 'add') {
          // Add new tags, avoiding duplicates
          selectedTags.forEach(tag => {
            if (!newTags.includes(tag)) {
              newTags.push(tag);
            }
          });
        } else {
          // Remove specified tags
          newTags = newTags.filter(tag => !selectedTags.includes(tag));
        }
        
        return { ...material, tags: newTags };
      }
      return material;
    });

    updateAllTags(updatedMaterials);
    updateMaterialsWithSort(updatedMaterials);

    setIsBulkTagModalOpen(false);
    setSelectedMaterialsForBulk([]);
  }, [materials, selectedMaterialsForBulk, updateAllTags, updateMaterialsWithSort]);

  const handleRemoveMaterial = useCallback((materialName: string) => {
    setMaterials(prevMaterials => {
      const filteredMaterials = prevMaterials.filter(m => m.name !== materialName);
      updateMaterialsWithSort(filteredMaterials);
      updateAllTags(filteredMaterials);
      return filteredMaterials;
    });

    setMeshAssignments(prev => {
      const newAssignments = { ...prev };
      Object.keys(newAssignments).forEach(meshName => {
        if (newAssignments[meshName].defaultMaterial === materialName) {
          newAssignments[meshName].defaultMaterial = '';
        }
        newAssignments[meshName].variants = newAssignments[meshName].variants
          .filter(v => v.material !== materialName);
      });
      return newAssignments;
    });
  }, [updateMaterialsWithSort, updateAllTags]);

  const handleMoveMaterial = useCallback((index: number, direction: 'up' | 'down') => {
    setMaterials(prevMaterials => {
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      
      if (newIndex < 0 || newIndex >= prevMaterials.length) {
        return prevMaterials;
      }
      
      const newMaterials = [...prevMaterials];
      const [movedItem] = newMaterials.splice(index, 1);
      newMaterials.splice(newIndex, 0, movedItem);
      
      const finalMaterials = isAutoSortEnabled 
        ? sortMaterialsByCurrentSettings(newMaterials)
        : newMaterials;
      
      const updatedData: MaterialData = {
        ...data,
        materials: finalMaterials
      };
      safeUpdate(updatedData);
      
      return finalMaterials;
    });
  }, [data, safeUpdate, isAutoSortEnabled, sortMaterialsByCurrentSettings]);

  const handleEditTags = useCallback((materialName: string) => {
    setCurrentItemToTag(materialName);
    setIsTagDialogOpen(true);
  }, []);

  const handleTagSubmit = useCallback((newTags: string) => {
    if (currentItemToTag) {
      const tagList = newTags.split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);
  
      setMaterials(prevMaterials => {
        const updatedMaterials = prevMaterials.map(m =>
          m.name === currentItemToTag ? { ...m, tags: tagList } : m
        );
        
        updateAllTags(updatedMaterials);
        updateMaterialsWithSort(updatedMaterials);
        return updatedMaterials;
      });
    }
    setCurrentItemToTag(null);
    setIsTagDialogOpen(false);
  }, [currentItemToTag, updateMaterialsWithSort, updateAllTags]);

  const handleAutoSortToggle = useCallback((enabled: boolean) => {
    setIsAutoSortEnabled(enabled);
    
    const updatedData: MaterialData = {
      ...data,
      sortSettings: {
        ...(data.sortSettings || { tagStates: [], timestamp: Date.now() }),
        autoSortEnabled: enabled
      }
    };
    
    if (enabled && updatedData.sortSettings?.tagStates) {
      updatedData.materials = sortMaterialsByCurrentSettings([...materials]);
    }
    
    onUpdate(updatedData);
  }, [data, materials, sortMaterialsByCurrentSettings, onUpdate]);

  const handleAutoAssignTag = useCallback((meshName: string, selectedTag: string) => {
    const taggedMaterials = materials.filter(m => m.tags.includes(selectedTag));
    if (taggedMaterials.length > 0) {
      setMeshAssignments(prev => ({
        ...prev,
        [meshName]: {
          ...prev[meshName],
          defaultMaterial: taggedMaterials[0].name,
          variants: taggedMaterials.map(m => ({ name: m.name, material: m.name }))
        }
      }));
    }
  }, [materials]);

  const uniqueTags = useMemo(() => {
    const tags = new Set<string>();
    materials.forEach(material => {
      material.tags.forEach(tag => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [materials]);

  const handleRenameMaterial = useCallback((materialName: string) => {
    setCurrentItemToRename(materialName);
    setRenameType('material'); // Add this line
    setIsRenameDialogOpen(true);
  }, []);

  const handleRenameMaterialSubmit = useCallback((newName: string) => {
    if (currentItemToRename && newName && newName !== currentItemToRename) {
      setMaterials(prevMaterials => {
        const updatedMaterials = prevMaterials.map(m =>
          m.name === currentItemToRename ? { ...m, name: newName } : m
        );
        
        const sortedMaterials = isAutoSortEnabled 
          ? sortMaterialsByCurrentSettings(updatedMaterials)
          : updatedMaterials;
  
        const newMeshAssignments = { ...meshAssignments };
        Object.keys(newMeshAssignments).forEach(meshName => {
          const assignment = newMeshAssignments[meshName];
          if (assignment.defaultMaterial === currentItemToRename) {
            assignment.defaultMaterial = newName;
          }
          assignment.variants = assignment.variants.map(variant => ({
            ...variant,
            material: variant.material === currentItemToRename ? newName : variant.material
          }));
        });
        setMeshAssignments(newMeshAssignments);
  
        const updatedData: MaterialData = {
          ...data,
          materials: sortedMaterials,
          meshAssignments: newMeshAssignments
        };
        onUpdate(updatedData);
  
        return sortedMaterials;
      });
    }
    setCurrentItemToRename(null);
    setIsRenameDialogOpen(false);
  }, [currentItemToRename, isAutoSortEnabled, sortMaterialsByCurrentSettings, meshAssignments, data, onUpdate]);

  const handleRenameMesh = useCallback((meshName: string) => {
    setCurrentItemToRename(meshName);
    setIsRenameDialogOpen(true);
  }, []);

  const handleRenameSubmit = useCallback((newName: string) => {
    if (!currentItemToRename || !newName.trim()) {
      setCurrentItemToRename(null);
      setIsRenameDialogOpen(false);
      return;
    }

    if (renameType === 'group') {
      setMeshGroups(prev => {
        const newGroups = {
          ...prev,
          [currentItemToRename]: {
            ...prev[currentItemToRename],
            name: newName.trim()
          }
        };

        const updatedData = {
          ...data,
          materials,
          meshAssignments,
          meshGroups: newGroups
        };
        safeUpdate(updatedData);

        return newGroups;
      });
    } else if (renameType === 'groupMesh') {
      const [groupId, oldMeshName] = currentItemToRename.split(':');
      setMeshGroups(prev => {
        const group = prev[groupId];
        const meshAssignment = group.meshes[oldMeshName];
        
        const newMeshes = { ...group.meshes };
        delete newMeshes[oldMeshName];
        newMeshes[newName.trim()] = meshAssignment;

        const newGroups = {
          ...prev,
          [groupId]: {
            ...group,
            meshes: newMeshes
          }
        };

        const updatedData = {
          ...data,
          materials,
          meshAssignments,
          meshGroups: newGroups
        };
        safeUpdate(updatedData);

        return newGroups;
      });
    }

    setCurrentItemToRename(null);
    setIsRenameDialogOpen(false);
  }, [currentItemToRename, renameType, data, materials, meshAssignments, meshGroups, safeUpdate]);

  const getAllMeshAssignmentsForPreview = useCallback(() => {
    // Return the raw mesh assignments without any group priority logic
    // This is for preview purposes only - we want to see everything
    return meshAssignments;
  }, [meshAssignments]);

  const handleAssignmentChange = useCallback((meshName: string, field: "defaultMaterial" | "variants", value: string | undefined) => {
    setMeshAssignments(prev => {
      const newAssignments = {
        ...prev,
        [meshName]: {
          ...prev[meshName],
          [field]: value || ''
        }
      };

      const updatedData: MaterialData = {
        ...data,
        materials: materials,
        meshAssignments: newAssignments
      };
      
      safeUpdate(updatedData);
      return newAssignments;
    });
  }, [data, materials, safeUpdate]);

  const handleAddMesh = () => {
    const newMeshName = prompt('Enter new mesh name:');
    if (newMeshName && !meshAssignments[newMeshName]) {
      setMeshAssignments(prev => ({
        ...prev,
        [newMeshName]: { defaultMaterial: '', variants: [] }
      }));
    }
  };

  const handleRemoveMesh = useCallback((meshName: string) => {
    setMeshAssignments(prev => {
      const newAssignments = { ...prev };
      delete newAssignments[meshName];

      const updatedData = {
        ...data,
        materials,
        meshAssignments: newAssignments
      };
      safeUpdate(updatedData);

      return newAssignments;
    });
  }, [data, materials, safeUpdate]);

  // Removed the debounced variant change handler - now handled in MeshItem
  const handleVariantChange = useCallback((meshName: string, index: number, field: "name" | "material", value: string | undefined) => {
    setMeshAssignments(prev => {
      const newAssignments = {
        ...prev,
        [meshName]: {
          ...prev[meshName],
          variants: prev[meshName].variants.map((v, i) => 
            i === index ? { ...v, [field]: value || '' } : v
          )
        }
      };

      const updatedData: MaterialData = {
        ...data,
        materials: materials,
        meshAssignments: newAssignments
      };

      safeUpdate(updatedData);
      return newAssignments;
    });
  }, [data, materials, safeUpdate]);

  const handleRemoveVariant = useCallback((meshName: string, index: number) => {
    setMeshAssignments(prev => {
      const newAssignments = {
        ...prev,
        [meshName]: {
          ...prev[meshName],
          variants: prev[meshName].variants.filter((_, i) => i !== index)
        }
      };

      const updatedData: MaterialData = {
        ...data,
        materials: materials,
        meshAssignments: newAssignments
      };

      safeUpdate(updatedData);
      return newAssignments;
    });
  }, [data, materials, safeUpdate]);

  const handleAddVariant = useCallback((meshName: string) => {
    setMeshAssignments(prev => {
      const newAssignments = {
        ...prev,
        [meshName]: {
          ...prev[meshName],
          variants: [...prev[meshName].variants, { name: '', material: '' }]
        }
      };

      const updatedData: MaterialData = {
        ...data,
        materials: materials,
        meshAssignments: newAssignments
      };

      safeUpdate(updatedData);
      return newAssignments;
    });
  }, [data, materials, safeUpdate]);

  const toggleMeshExpansion = (meshName: string) => {
    setExpandedMeshes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(meshName)) {
        newSet.delete(meshName);
      } else {
        newSet.add(meshName);
      }
      return newSet;
    });
  };

  const meshItems = Object.entries(meshAssignments);
  const totalPages = Math.ceil(meshItems.length / ITEMS_PER_PAGE);

  const handleMeshOrderChange = useCallback((result: any) => {
    if (!result.destination) return;

    const allItems = Object.entries(meshAssignments);
    const sourceIndex = (currentPage - 1) * ITEMS_PER_PAGE + result.source.index;
    const destinationIndex = (currentPage - 1) * ITEMS_PER_PAGE + result.destination.index;

    if (Math.floor(sourceIndex / ITEMS_PER_PAGE) !== Math.floor(destinationIndex / ITEMS_PER_PAGE)) {
      return;
    }

    const [reorderedItem] = allItems.splice(sourceIndex, 1);
    allItems.splice(destinationIndex, 0, reorderedItem);

    const newAssignments = allItems.reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {} as typeof meshAssignments);

    setMeshAssignments(newAssignments);

    const updatedData: MaterialData = {
      ...data,
      materials,
      meshAssignments: newAssignments
    };
    onUpdate(updatedData);
  }, [meshAssignments, materials, data, onUpdate, currentPage]);

  const handleMoveMesh = useCallback((fromIndex: number, direction: 'up' | 'down') => {
    const allItems = Object.entries(meshAssignments);
    const actualFromIndex = (currentPage - 1) * ITEMS_PER_PAGE + fromIndex;
    const actualToIndex = actualFromIndex + (direction === 'up' ? -1 : 1);
    
    if (actualToIndex < 0 || actualToIndex >= allItems.length) return;

    const newPage = Math.floor(actualToIndex / ITEMS_PER_PAGE) + 1;
    if (newPage !== currentPage) {
      setCurrentPage(newPage);
    }

    [allItems[actualFromIndex], allItems[actualToIndex]] = 
    [allItems[actualToIndex], allItems[actualFromIndex]];
    
    const newAssignments = allItems.reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {} as typeof meshAssignments);

    setMeshAssignments(newAssignments);

    const updatedData: MaterialData = {
      ...data,
      materials,
      meshAssignments: newAssignments
    };
    onUpdate(updatedData);
  }, [meshAssignments, materials, data, onUpdate, currentPage]);

  const canMove = useCallback((index: number, direction: 'up' | 'down'): boolean => {
    const actualIndex = (currentPage - 1) * ITEMS_PER_PAGE + index;
    if (direction === 'up') {
      return actualIndex > 0;
    } else {
      return actualIndex < Object.keys(meshAssignments).length - 1;
    }
  }, [currentPage, meshAssignments]);

  const handleRemoveTag = useCallback((materialName: string, tagToRemove: string) => {
    setMaterials(prevMaterials => {
      const updatedMaterials = prevMaterials.map(m =>
        m.name === materialName
          ? { ...m, tags: m.tags.filter(tag => tag !== tagToRemove) }
          : m
      );

      const sortedMaterials = isAutoSortEnabled 
        ? sortMaterialsByCurrentSettings(updatedMaterials)
        : updatedMaterials;

      updateAllTags(sortedMaterials);

      const updatedData = {
        ...data,
        materials: sortedMaterials,
        sortSettings: {
          ...(data.sortSettings || { tagStates: [], timestamp: Date.now() }),
          autoSortEnabled: isAutoSortEnabled
        }
      };
      onUpdate(updatedData);

      return sortedMaterials;
    });
  }, [data, onUpdate, updateAllTags, isAutoSortEnabled, sortMaterialsByCurrentSettings]);

  const handleSave = useCallback((updatedData: MaterialData) => {
    if (onSave) {
      onSave(updatedData);
    }
  }, [onSave]);

  const renderMaterialsSection = () => (
    <MaterialsSection
      materials={materials}
      onDragEnd={handleMaterialOrderChange}
      onAddMaterials={handleAddMaterialsClick}
      onEditTags={handleEditTags}
      onRenameMaterial={handleRenameMaterial}
      onRemoveMaterial={handleRemoveMaterial}
      onMoveMaterial={handleMoveMaterial}
      onRemoveTag={handleRemoveTag}
      isAutoSortEnabled={isAutoSortEnabled}
      onBulkEditTags={handleBulkEditTags}
      onBulkRemoveTags={handleBulkRemoveTags}
    />
  );

  return (
    <div className="flex flex-col h-full p-4">
      <div className="flex items-center justify-between mb-4 pb-4 border-b">
        <div className="flex space-x-2">
          <Button
            onClick={() => setActiveSection('materials')}
            variant={activeSection === 'materials' ? "default" : "outline"}
            size="sm"
            className="w-32"
          >
            Materials
          </Button>
          <Button
            onClick={() => setActiveSection('meshes')}
            variant={activeSection === 'meshes' ? "default" : "outline"}
            size="sm"
            className="w-32"
          >
            Mesh Assignments
          </Button>
          <Button
            onClick={() => setActiveSection('variants')}
            variant={activeSection === 'variants' ? "default" : "outline"}
            size="sm"
            className="w-32"
          >
            Preview Variants
          </Button>
        </div>

        <div className="flex items-center gap-4">
          {activeSection === 'materials' && (
            <>
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger>
                    <Switch
                      checked={isAutoSortEnabled}
                      onCheckedChange={handleAutoSortToggle}
                      className="data-[state=checked]:bg-blue-500"
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    Auto-sort materials based on tag settings
                  </TooltipContent>
                </Tooltip>
                <span className="text-sm text-gray-500">Auto-sort</span>
              </div>
              <Button 
                onClick={() => setIsSortDialogOpen(true)}
                size="sm"
                variant="outline"
              >
                Sort Materials
              </Button>
            </>
          )}
          {activeSection === 'variants' && (
            <ExtractVariantsButton 
              meshAssignments={getAllMeshAssignmentsForPreview()}
              variant="default"
            />
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 h-[calc(100vh-12rem)] pr-4">
        <div className="h-full">
          {activeSection === 'materials' && renderMaterialsSection()}
          {activeSection === 'meshes' && (
            <MeshAssignmentsSection
              meshItems={meshItems.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)}
              meshGroups={meshGroups}
              materials={materials}
              expandedMeshes={expandedMeshes}
              onToggleMeshExpansion={toggleMeshExpansion}
              onRenameMesh={handleRenameMesh}
              onRemoveMesh={handleRemoveMesh}
              onAutoAssignTag={handleAutoAssignTag}
              onAssignmentChange={handleAssignmentChange}
              onVariantChange={handleVariantChange}
              onRemoveVariant={handleRemoveVariant}
              onAddVariant={handleAddVariant}
              onAddMesh={handleAddMeshClick}
              onAddGroup={handleAddGroup}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              onDragEnd={handleMeshOrderChange}
              onMoveMesh={handleMoveMesh}
              canMove={canMove}
              totalItems={Object.keys(meshAssignments).length}
              availableTags={uniqueTags}
              onAutoTagChange={handleAutoTagChange}
              onToggleGroup={handleToggleGroup}
              onRenameGroup={handleRenameGroup}
              onRemoveGroup={handleRemoveGroup}
              onSetGroupFilenames={handleSetGroupFilenames}
              onAddMeshToGroup={handleAddMeshToGroup}
              onGroupAssignmentChange={handleGroupAssignmentChange}
              onGroupVariantChange={handleGroupVariantChange}
              onRemoveVariantFromGroup={handleRemoveVariantFromGroup}
              onAddVariantToGroup={handleAddVariantToGroup}
              onRemoveMeshFromGroup={handleRemoveMeshFromGroup}
              onRenameMeshInGroup={handleRenameMeshInGroup}
              onGroupAutoTagChange={handleGroupAutoTagChange}
              onGroupAutoAssignTag={handleGroupAutoAssignTag}
              onMoveGroup={handleMoveGroup}
              canMoveGroup={canMoveGroup}
            />
          )}
          {activeSection === 'variants' && (
            <PreviewVariantsSection
              meshAssignments={getAllMeshAssignmentsForPreview()}
              meshGroups={meshGroups}
              materials={materials}
            />
          )}
        </div>
      </ScrollArea>

      <InputDialog
        isOpen={isAddMaterialDialogOpen}
        onClose={() => setIsAddMaterialDialogOpen(false)}
        onSubmit={handleAddMaterialSubmit}
        title="Add Materials"
        description="Enter material names (comma-separated)"
      />

      <InputDialog
        isOpen={isAddGroupDialogOpen}
        onClose={() => setIsAddGroupDialogOpen(false)}
        onSubmit={handleAddGroupSubmit}
        title="Add Group"
        description="Enter group name"
      />

      <InputDialog
        isOpen={isAddMeshToGroupDialogOpen}
        onClose={() => setIsAddMeshToGroupDialogOpen(false)}
        onSubmit={handleAddMeshToGroupSubmit}
        title="Add Mesh to Group"
        description="Enter mesh name"
      />

      <MaterialSortDialog
        isOpen={isSortDialogOpen}
        onClose={() => setIsSortDialogOpen(false)}
        materials={materials}
        onApplySort={handleSortMaterials}
        currentData={data}
      />

      <DuplicateMaterialDialog
        isOpen={isDuplicateDialogOpen}
        onClose={() => setIsDuplicateDialogOpen(false)}
        onConfirm={() => {}}
        duplicateMaterials={duplicateMaterials}
      />

      <InputDialog
        isOpen={isRenameDialogOpen}
        onClose={() => {
          setIsRenameDialogOpen(false);
          setCurrentItemToRename(null);
        }}
        onSubmit={renameType === 'material' ? handleRenameMaterialSubmit : handleRenameSubmit}
        title={`Rename ${renameType === 'group' ? 'Group' : renameType === 'groupMesh' ? 'Mesh' : renameType === 'material' ? 'Material' : 'Item'}`}
        initialValue={
          renameType === 'group' && currentItemToRename ? 
            meshGroups[currentItemToRename]?.name || '' :
          renameType === 'groupMesh' && currentItemToRename ?
            currentItemToRename.split(':')[1] || '' :
          currentItemToRename || ''
        }
      />
      
      <InputDialog
        isOpen={isTagDialogOpen}
        onClose={() => {
          setIsTagDialogOpen(false);
          setCurrentItemToTag(null);
        }}
        onSubmit={handleTagSubmit}
        title="Edit Tags"
        type="tags"
        initialValue={
          currentItemToTag 
            ? materials.find(m => m.name === currentItemToTag)?.tags.join(', ') || ''
            : ''
        }
        placeholder="Add tags"
      />

      <InputDialog
        isOpen={isAddMeshDialogOpen}
        onClose={() => setIsAddMeshDialogOpen(false)}
        onSubmit={handleAddMeshSubmit}
        title="Add Mesh"
        description="Enter mesh name"
      />

      <BulkTagModal
        isOpen={isBulkTagModalOpen}
        onClose={() => {
          setIsBulkTagModalOpen(false);
          setSelectedMaterialsForBulk([]);
        }}
        onConfirm={handleBulkTagConfirm}
        materialNames={selectedMaterialsForBulk}
        materials={materials}
        mode={bulkTagMode}
      />
    </div>
  );
};

export default MaterialMeshEditor;