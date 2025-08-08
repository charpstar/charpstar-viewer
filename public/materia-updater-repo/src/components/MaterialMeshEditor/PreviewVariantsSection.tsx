// src/components/MaterialMeshEditor/PreviewVariantsSection.tsx

import React, { useMemo } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, FolderOpen, Package } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MeshAssignment, MeshGroup } from '@/gltf/gltfTypes';

interface PreviewVariantsSectionProps {
  meshAssignments: { [key: string]: MeshAssignment };
  meshGroups?: { [key: string]: MeshGroup };
  materials: Array<{ name: string; tags: string[] }>;
}

interface VariantInfo {
  name: string;
  materialsUsed: Set<string>;
  affectedMeshes: Array<{
    name: string;
    isFromGroup: boolean;
    groupName?: string;
    groupId?: string;
  }>;
  affectedGroups: Set<string>;
}

const PreviewVariantsSection: React.FC<PreviewVariantsSectionProps> = ({
  meshAssignments,
  meshGroups = {},
  materials,
}) => {
  const variantAnalysis = useMemo(() => {
    const variants = new Map<string, VariantInfo>();
    const allVariantNames = new Set<string>();
    const variantFirstAppearance = new Map<string, number>();
    let appearanceCounter = 0;

    // First pass: Process ALL regular mesh assignments
    console.log('Processing regular mesh assignments:', Object.keys(meshAssignments));
    Object.entries(meshAssignments).forEach(([meshName, assignment]) => {
      console.log(`Regular mesh ${meshName} has variants:`, assignment.variants.map(v => `${v.name} -> ${v.material}`));
      
      assignment.variants.forEach((variant, index) => {
        allVariantNames.add(variant.name);
        
        // Track first appearance for sorting
        if (!variantFirstAppearance.has(variant.name)) {
          variantFirstAppearance.set(variant.name, appearanceCounter++);
        }
        
        if (!variants.has(variant.name)) {
          variants.set(variant.name, {
            name: variant.name,
            materialsUsed: new Set(),
            affectedMeshes: [],
            affectedGroups: new Set()
          });
        }
        
        const variantInfo = variants.get(variant.name)!;
        variantInfo.materialsUsed.add(variant.material);
        
        // Add this mesh as a regular mesh (never replace these)
        variantInfo.affectedMeshes.push({
          name: meshName,
          isFromGroup: false
        });
        
        console.log(`Added regular mesh ${meshName} to variant ${variant.name}`);
      });
    });

    // Second pass: Process ALL group mesh assignments (add as additional)
    console.log('Processing group mesh assignments:', Object.keys(meshGroups));
    Object.entries(meshGroups).forEach(([groupId, group]) => {
      console.log(`Group ${group.name} has meshes:`, Object.keys(group.meshes));
      
      Object.entries(group.meshes).forEach(([meshName, assignment]) => {
        console.log(`Group mesh ${meshName} has variants:`, assignment.variants.map(v => v.name));
        
        assignment.variants.forEach((variant, index) => {
          allVariantNames.add(variant.name);
          
          // Track first appearance for sorting
          if (!variantFirstAppearance.has(variant.name)) {
            variantFirstAppearance.set(variant.name, appearanceCounter++);
          }
          
          if (!variants.has(variant.name)) {
            variants.set(variant.name, {
              name: variant.name,
              materialsUsed: new Set(),
              affectedMeshes: [],
              affectedGroups: new Set()
            });
          }
          
          const variantInfo = variants.get(variant.name)!;
          variantInfo.materialsUsed.add(variant.material);
          variantInfo.affectedGroups.add(group.name);
          
          // Always add group mesh as additional (never replace regular meshes)
          variantInfo.affectedMeshes.push({
            name: meshName,
            isFromGroup: true,
            groupName: group.name,
            groupId
          });
        });
      });
    });

    console.log('Final variants found:', Array.from(allVariantNames));
    console.log('Variants map:', variants);

    // Sort variants by their first appearance across all sources
    const sortedVariants = Array.from(allVariantNames).sort((a, b) => {
      const appearanceA = variantFirstAppearance.get(a) ?? Number.MAX_SAFE_INTEGER;
      const appearanceB = variantFirstAppearance.get(b) ?? Number.MAX_SAFE_INTEGER;
      
      if (appearanceA !== appearanceB) {
        return appearanceA - appearanceB;
      }
      
      // Fallback to alphabetical if appearances are equal
      return a.localeCompare(b);
    });

    return {
      variants: sortedVariants,
      variantInfoMap: variants,
      totalMeshes: Object.keys(meshAssignments).length + 
        Object.values(meshGroups).reduce((acc, group) => acc + Object.keys(group.meshes).length, 0),
      totalGroups: Object.keys(meshGroups).length
    };
  }, [meshAssignments, meshGroups]);

  const getMaterialTags = (materialName: string) => {
    return materials.find(m => m.name === materialName)?.tags || [];
  };

  if (variantAnalysis.totalMeshes === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No mesh assignments found. Add some meshes and variants to see the preview.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="border-none shadow-none bg-transparent">
      <CardContent className="p-0">
        <div className="space-y-4">
          {/* Summary Stats */}
          <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-500" />
              <span className="text-sm font-medium">
                {variantAnalysis.variants.length} Variants
              </span>
            </div>
            <div className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-green-500" />
              <span className="text-sm font-medium">
                {variantAnalysis.totalGroups} Groups
              </span>
            </div>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-purple-500" />
              <span className="text-sm font-medium">
                {variantAnalysis.totalMeshes} Total Meshes
              </span>
            </div>
          </div>

          {/* Variants Table */}
          <ScrollArea className="h-[calc(100vh-20rem)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Variant Name</TableHead>
                  <TableHead className="w-[150px]">Affected Groups</TableHead>
                  <TableHead className="w-[250px]">Affected Meshes</TableHead>
                  <TableHead>Materials Used</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variantAnalysis.variants.map((variantName) => {
                  const variantInfo = variantAnalysis.variantInfoMap.get(variantName)!;
                  const materials = Array.from(variantInfo.materialsUsed);
                  const groupsArray = Array.from(variantInfo.affectedGroups);

                  return (
                    <TableRow key={variantName}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-blue-500" />
                          {variantName}
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {groupsArray.length > 0 ? (
                            groupsArray.map((groupName) => (
                              <Badge
                                key={groupName}
                                variant="secondary"
                                className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-100 text-xs"
                              >
                                <FolderOpen className="h-3 w-3 mr-1" />
                                {groupName}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-gray-500 italic">No groups</span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="space-y-2">
                          {/* Regular Meshes */}
                          {variantInfo.affectedMeshes.filter(mesh => !mesh.isFromGroup).length > 0 && (
                            <div>
                              <div className="text-xs font-medium text-gray-500 mb-1">Regular Assignments:</div>
                              <div className="flex flex-wrap gap-1">
                                {variantInfo.affectedMeshes
                                  .filter(mesh => !mesh.isFromGroup)
                                  .map((mesh, index) => (
                                    <Badge
                                      key={`regular-${mesh.name}-${index}`}
                                      variant="secondary"
                                      className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 text-xs"
                                      title="Direct assignment"
                                    >
                                      {mesh.name}
                                    </Badge>
                                  ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Group Meshes */}
                          {variantInfo.affectedMeshes.filter(mesh => mesh.isFromGroup).length > 0 && (
                            <div>
                              <div className="text-xs font-medium text-gray-500 mb-1">Group Assignments:</div>
                              <div className="flex flex-wrap gap-1">
                                {variantInfo.affectedMeshes
                                  .filter(mesh => mesh.isFromGroup)
                                  .map((mesh, index) => (
                                    <Badge
                                      key={`group-${mesh.name}-${index}`}
                                      variant="default"
                                      className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-100 text-xs"
                                      title={`From group: ${mesh.groupName}`}
                                    >
                                      <FolderOpen className="h-3 w-3 mr-1" />
                                      {mesh.name}
                                    </Badge>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="space-y-1">
                          {materials.map((material) => (
                            <div key={material} className="flex flex-wrap gap-1 items-center">
                              <span className="text-sm font-medium">{material}</span>
                              {getMaterialTags(material).map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="outline"
                                  className="text-xs"
                                >
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>

          {/* Legend */}
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <h4 className="text-sm font-medium mb-2">Legend:</h4>
            <div className="flex flex-wrap gap-4 text-xs">
              <div className="flex items-center gap-1">
                <Badge variant="default" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-100">
                  <FolderOpen className="h-3 w-3 mr-1" />
                  Group Mesh
                </Badge>
                <span className="text-gray-600">Mesh from group assignment</span>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="secondary" className="bg-gray-100 text-gray-700">
                  Direct Mesh
                </Badge>
                <span className="text-gray-600">Direct mesh assignment</span>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="secondary" className="bg-green-100 text-green-700">
                  <FolderOpen className="h-3 w-3 mr-1" />
                  Group
                </Badge>
                <span className="text-gray-600">Mesh group</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PreviewVariantsSection;