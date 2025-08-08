// src/components/Dialogs/InspectTargetFilesDialog.tsx

import React, { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Search, 
  File, 
  FolderOpen, 
  Package, 
  ArrowUpDown,
  Filter,
  Eye,
  AlertTriangle,
  Plus
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { MaterialData, MeshGroup, MeshAssignment, Material } from '@/gltf/gltfTypes';

interface MeshData {
  name: string;
  assignment: MeshAssignment;
  source: 'direct' | 'group' | 'none';
  groupName?: string;
  groupId?: string;
  exists: boolean; // Whether mesh exists in materialData
  missingMaterials: string[]; // Materials referenced but not in materialData
  inGltf: boolean; // Whether mesh exists in the actual GLTF file
}

interface FileInspectionData {
  fileName: string;
  meshes: MeshData[];
  appliedGroups: Array<{
    id: string;
    name: string;
    meshCount: number;
  }>;
  missingMeshes: string[]; // Meshes found in GLTF but not in materialData
}

interface InspectTargetFilesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  targetFiles: File[];
  materialData: MaterialData;
  onAddMaterial: (materialName: string) => void;
  onAddMesh: (meshName: string) => void;
}

type SortField = 'fileName' | 'meshCount' | 'groupCount' | 'variantCount';
type SortDirection = 'asc' | 'desc';

export default function InspectTargetFilesDialog({
  isOpen,
  onClose,
  targetFiles,
  materialData,
  onAddMaterial,
  onAddMesh
}: InspectTargetFilesDialogProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('fileName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filterBy, setFilterBy] = useState<'all' | 'withGroups' | 'withoutGroups' | 'withIssues'>('all');
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [showOnlyIssues, setShowOnlyIssues] = useState(false);
  const [inspectionDataState, setInspectionDataState] = useState<FileInspectionData[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  // Helper function to check if material exists
  const materialExists = (materialName: string): boolean => {
    if (!materialName) return true; // Empty is considered valid
    return materialData.materials.some(m => m.name === materialName);
  };

  // Helper function to check if mesh exists
  const meshExists = (meshName: string): boolean => {
    return Object.hasOwnProperty.call(materialData.meshAssignments, meshName) ||
           Object.values(materialData.meshGroups || {}).some(group => 
             Object.hasOwnProperty.call(group.meshes, meshName)
           );
  };

  // Helper function to parse GLTF file and extract mesh names
  const parseMeshesFromFile = async (file: File): Promise<string[]> => {
    try {
      const content = await file.text();
      const gltfData = JSON.parse(content);
      
      if (gltfData.meshes && Array.isArray(gltfData.meshes)) {
        return gltfData.meshes.map((mesh: any) => mesh.name).filter(Boolean);
      }
      return [];
    } catch (error) {
      console.error(`Error parsing GLTF file ${file.name}:`, error);
      return [];
    }
  };

  // Helper function to get mesh assignments with group priority
  const getMeshAssignmentsForFile = (fileName: string): { [meshName: string]: MeshAssignment } => {
    const result = { ...materialData.meshAssignments };
    
    // Check if this filename matches any group
    if (materialData.meshGroups) {
      Object.values(materialData.meshGroups).forEach(group => {
        const fileNameWithoutExtension = fileName.replace(/\.(gltf|glb)$/i, '');
        const isMatch = group.filenames.some(groupFilename => {
          const groupFileNameWithoutExtension = groupFilename.replace(/\.(gltf|glb)$/i, '');
          return fileNameWithoutExtension === groupFileNameWithoutExtension ||
                 fileName === groupFilename ||
                 fileNameWithoutExtension.includes(groupFileNameWithoutExtension) ||
                 groupFileNameWithoutExtension.includes(fileNameWithoutExtension);
        });

        if (isMatch) {
          // Add group meshes to the result, they take priority over regular meshes
          Object.entries(group.meshes).forEach(([meshName, assignment]) => {
            result[meshName] = assignment;
          });
        }
      });
    }

    return result;
  };

  // Helper function to get applied groups for a file
  const getAppliedGroupsForFile = (fileName: string): Array<{ id: string; name: string; meshCount: number }> => {
    const appliedGroups: Array<{ id: string; name: string; meshCount: number }> = [];
    
    if (materialData.meshGroups) {
      Object.values(materialData.meshGroups).forEach(group => {
        const fileNameWithoutExtension = fileName.replace(/\.(gltf|glb)$/i, '');
        const isMatch = group.filenames.some(groupFilename => {
          const groupFileNameWithoutExtension = groupFilename.replace(/\.(gltf|glb)$/i, '');
          return fileNameWithoutExtension === groupFileNameWithoutExtension ||
                 fileName === groupFilename ||
                 fileNameWithoutExtension.includes(groupFileNameWithoutExtension) ||
                 groupFileNameWithoutExtension.includes(fileNameWithoutExtension);
        });

        if (isMatch) {
          appliedGroups.push({
            id: group.id,
            name: group.name,
            meshCount: Object.keys(group.meshes).length
          });
        }
      });
    }

    return appliedGroups;
  };

  // Process target files to get inspection data
  const processInspectionData = async (): Promise<FileInspectionData[]> => {
    return Promise.all(targetFiles.map(async (file) => {
      const fileName = file.name;
      
      // Parse GLTF file to get actual meshes
      const actualMeshes = await parseMeshesFromFile(file);
      
      // Get configured mesh assignments for this file
      const meshAssignments = getMeshAssignmentsForFile(fileName);
      const appliedGroups = getAppliedGroupsForFile(fileName);
      
      // Create mesh data combining actual meshes with configurations
      const meshes: MeshData[] = actualMeshes.map(actualMeshName => {
        const assignment = meshAssignments[actualMeshName];
        
        if (!assignment) {
          // Mesh exists in GLTF but has no assignment
          return {
            name: actualMeshName,
            assignment: { defaultMaterial: '', variants: [] },
            source: 'none' as const,
            exists: false, // Not configured in JSON
            missingMaterials: [],
            inGltf: true
          };
        }

        // Determine if this mesh comes from a group or direct assignment
        let source: 'direct' | 'group' = 'direct';
        let groupName: string | undefined;
        let groupId: string | undefined;

        // Check if this mesh is from a group that applies to this file
        if (materialData.meshGroups) {
          for (const group of Object.values(materialData.meshGroups)) {
            const fileNameWithoutExtension = fileName.replace(/\.(gltf|glb)$/i, '');
            const isMatch = group.filenames.some(groupFilename => {
              const groupFileNameWithoutExtension = groupFilename.replace(/\.(gltf|glb)$/i, '');
              return fileNameWithoutExtension === groupFileNameWithoutExtension ||
                     fileName === groupFilename ||
                     fileNameWithoutExtension.includes(groupFileNameWithoutExtension) ||
                     groupFileNameWithoutExtension.includes(fileNameWithoutExtension);
            });

            if (isMatch && group.meshes[actualMeshName]) {
              source = 'group';
              groupName = group.name;
              groupId = group.id;
              break;
            }
          }
        }

        // Check for missing materials
        const missingMaterials: string[] = [];
        if (assignment.defaultMaterial && !materialExists(assignment.defaultMaterial)) {
          missingMaterials.push(assignment.defaultMaterial);
        }
        assignment.variants.forEach(variant => {
          if (variant.material && !materialExists(variant.material)) {
            if (!missingMaterials.includes(variant.material)) {
              missingMaterials.push(variant.material);
            }
          }
        });

        return {
          name: actualMeshName,
          assignment,
          source,
          groupName,
          groupId,
          exists: true, // Configured in JSON
          missingMaterials,
          inGltf: true
        };
      });

      // Also add configured meshes that don't exist in the GLTF file
      Object.entries(meshAssignments).forEach(([configuredMeshName, assignment]) => {
        if (!actualMeshes.includes(configuredMeshName)) {
          // Determine source
          let source: 'direct' | 'group' = 'direct';
          let groupName: string | undefined;
          let groupId: string | undefined;

          if (materialData.meshGroups) {
            for (const group of Object.values(materialData.meshGroups)) {
              const fileNameWithoutExtension = fileName.replace(/\.(gltf|glb)$/i, '');
              const isMatch = group.filenames.some(groupFilename => {
                const groupFileNameWithoutExtension = groupFilename.replace(/\.(gltf|glb)$/i, '');
                return fileNameWithoutExtension === groupFileNameWithoutExtension ||
                       fileName === groupFilename ||
                       fileNameWithoutExtension.includes(groupFileNameWithoutExtension) ||
                       groupFileNameWithoutExtension.includes(fileNameWithoutExtension);
              });

              if (isMatch && group.meshes[configuredMeshName]) {
                source = 'group';
                groupName = group.name;
                groupId = group.id;
                break;
              }
            }
          }

          // Check for missing materials
          const missingMaterials: string[] = [];
          if (assignment.defaultMaterial && !materialExists(assignment.defaultMaterial)) {
            missingMaterials.push(assignment.defaultMaterial);
          }
          assignment.variants.forEach(variant => {
            if (variant.material && !materialExists(variant.material)) {
              if (!missingMaterials.includes(variant.material)) {
                missingMaterials.push(variant.material);
              }
            }
          });

          meshes.push({
            name: configuredMeshName,
            assignment,
            source,
            groupName,
            groupId,
            exists: true, // Configured in JSON
            missingMaterials,
            inGltf: false // Not in GLTF file
          });
        }
      });

      return {
        fileName,
        meshes,
        appliedGroups,
        missingMeshes: [] // We now show this in the mesh data directly
      };
    }));
  };

  // Load inspection data when dependencies change
  useEffect(() => {
    if (isOpen && targetFiles.length > 0) {
      setIsLoadingFiles(true);
      processInspectionData().then(data => {
        setInspectionDataState(data);
        setIsLoadingFiles(false);
      }).catch(error => {
        console.error('Error loading inspection data:', error);
        setIsLoadingFiles(false);
      });
    }
  }, [isOpen, targetFiles, materialData]);

  // Filter and sort data
  const filteredAndSortedData = useMemo(() => {
    let filtered = inspectionDataState.filter(data => {
      // Search filter
      const matchesSearch = searchTerm === '' || 
        data.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        data.meshes.some(mesh => 
          mesh.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          mesh.assignment.defaultMaterial.toLowerCase().includes(searchTerm.toLowerCase()) ||
          mesh.assignment.variants.some(variant => 
            variant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            variant.material.toLowerCase().includes(searchTerm.toLowerCase())
          )
        ) ||
        data.appliedGroups.some(group => 
          group.name.toLowerCase().includes(searchTerm.toLowerCase())
        );

      if (!matchesSearch) return false;

      // Filter by group application
      if (filterBy === 'withGroups') {
        return data.appliedGroups.length > 0;
      } else if (filterBy === 'withoutGroups') {
        return data.appliedGroups.length === 0;
      } else if (filterBy === 'withIssues') {
        return data.meshes.some(mesh => 
          (!mesh.exists && mesh.inGltf) || // Mesh in GLTF but not configured
          (mesh.exists && !mesh.inGltf) || // Mesh configured but not in GLTF
          mesh.missingMaterials.length > 0 // Missing materials
        );
      }

      return true;
    });

    // Apply show only issues filter
    if (showOnlyIssues) {
      filtered = filtered.filter(data =>
        data.meshes.some(mesh => 
          (!mesh.exists && mesh.inGltf) ||
          (mesh.exists && !mesh.inGltf) ||
          mesh.missingMaterials.length > 0
        )
      );
    }

    // Sort data
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'fileName':
          comparison = a.fileName.localeCompare(b.fileName);
          break;
        case 'meshCount':
          comparison = a.meshes.length - b.meshes.length;
          break;
        case 'groupCount':
          comparison = a.appliedGroups.length - b.appliedGroups.length;
          break;
        case 'variantCount':
          const aVariantCount = a.meshes.reduce((sum, mesh) => sum + mesh.assignment.variants.length, 0);
          const bVariantCount = b.meshes.reduce((sum, mesh) => sum + mesh.assignment.variants.length, 0);
          comparison = aVariantCount - bVariantCount;
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [inspectionDataState, searchTerm, sortField, sortDirection, filterBy, showOnlyIssues]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const toggleFileExpansion = (fileName: string) => {
    setExpandedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileName)) {
        newSet.delete(fileName);
      } else {
        newSet.add(fileName);
      }
      return newSet;
    });
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 text-gray-400" />;
    }
    return (
      <ArrowUpDown 
        className={cn(
          "h-4 w-4",
          sortDirection === 'asc' ? "text-blue-500" : "text-blue-500 rotate-180"
        )} 
      />
    );
  };

  // Summary statistics
  const totalMeshes = filteredAndSortedData.reduce((sum, data) => sum + data.meshes.length, 0);
  const totalVariants = filteredAndSortedData.reduce((sum, data) => 
    sum + data.meshes.reduce((meshSum, mesh) => meshSum + mesh.assignment.variants.length, 0), 0
  );
  const filesWithGroups = filteredAndSortedData.filter(data => data.appliedGroups.length > 0).length;
  
  // Issue statistics
  const missingConfigCount = inspectionDataState.reduce((sum, data) => 
    sum + data.meshes.filter(mesh => !mesh.exists && mesh.inGltf).length, 0
  );
  const missingInGltfCount = inspectionDataState.reduce((sum, data) => 
    sum + data.meshes.filter(mesh => mesh.exists && !mesh.inGltf).length, 0
  );
  const missingMaterialCount = new Set(
    inspectionDataState.flatMap(data => 
      data.meshes.flatMap(mesh => mesh.missingMaterials)
    )
  ).size;
  const filesWithIssues = inspectionDataState.filter(data =>
    data.meshes.some(mesh => 
      (!mesh.exists && mesh.inGltf) ||
      (mesh.exists && !mesh.inGltf) ||
      mesh.missingMaterials.length > 0
    )
  ).length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] my-4">
        <DialogHeader className="pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-blue-500" />
            Inspect Target Files
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Loading indicator */}
          {isLoadingFiles && (
            <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                <span className="text-blue-700 dark:text-blue-300">
                  Loading GLTF files and analyzing meshes...
                </span>
              </div>
            </Alert>
          )}

          {/* Issue Alert */}
          {!isLoadingFiles && filesWithIssues > 0 && (
            <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-amber-700 dark:text-amber-300">
                <div className="flex items-center justify-between">
                  <span>
                    Found {missingConfigCount} unconfigured meshes, {missingInGltfCount} missing GLTF meshes, and {missingMaterialCount} missing materials in {filesWithIssues} files.
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowOnlyIssues(!showOnlyIssues)}
                    className="ml-4"
                  >
                    {showOnlyIssues ? 'Show All' : 'Show Issues Only'}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <File className="h-4 w-4 text-blue-500" />
                  Files
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <div className="text-2xl font-bold">{filteredAndSortedData.length}</div>
                <p className="text-xs text-muted-foreground">Target files</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Package className="h-4 w-4 text-green-500" />
                  Meshes
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <div className="text-2xl font-bold">{totalMeshes}</div>
                <p className="text-xs text-muted-foreground">Total meshes</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-purple-500" />
                  Groups
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <div className="text-2xl font-bold">{filesWithGroups}</div>
                <p className="text-xs text-muted-foreground">Files with groups</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ArrowUpDown className="h-4 w-4 text-orange-500" />
                  Variants
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <div className="text-2xl font-bold">{totalVariants}</div>
                <p className="text-xs text-muted-foreground">Total variants</p>
              </CardContent>
            </Card>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search files, meshes, materials, or variants..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={filterBy} onValueChange={(value: typeof filterBy) => setFilterBy(value)}>
              <SelectTrigger className="w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Files</SelectItem>
                <SelectItem value="withGroups">With Groups</SelectItem>
                <SelectItem value="withoutGroups">Without Groups</SelectItem>
                <SelectItem value="withIssues">With Issues</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Files Table */}
          <ScrollArea className="h-[500px] border rounded-lg">
            <Table>
              <TableHeader className="sticky top-0 bg-white dark:bg-gray-800 z-10">
                <TableRow>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                    onClick={() => handleSort('fileName')}
                  >
                    <div className="flex items-center gap-2">
                      File Name
                      {getSortIcon('fileName')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                    onClick={() => handleSort('meshCount')}
                  >
                    <div className="flex items-center gap-2">
                      Meshes
                      {getSortIcon('meshCount')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                    onClick={() => handleSort('groupCount')}
                  >
                    <div className="flex items-center gap-2">
                      Groups
                      {getSortIcon('groupCount')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                    onClick={() => handleSort('variantCount')}
                  >
                    <div className="flex items-center gap-2">
                      Variants
                      {getSortIcon('variantCount')}
                    </div>
                  </TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedData.map((fileData) => {
                  const isExpanded = expandedFiles.has(fileData.fileName);
                  const variantCount = fileData.meshes.reduce((sum, mesh) => sum + mesh.assignment.variants.length, 0);
                  
                  return (
                    <React.Fragment key={fileData.fileName}>
                      <TableRow className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <File className="h-4 w-4 text-blue-500" />
                            <span className="font-medium">{fileData.fileName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {fileData.meshes.length} meshes
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {fileData.appliedGroups.map(group => (
                              <Badge 
                                key={group.id}
                                variant="outline" 
                                className="bg-blue-50 text-blue-700 border-blue-200"
                              >
                                <FolderOpen className="h-3 w-3 mr-1" />
                                {group.name}
                              </Badge>
                            ))}
                            {fileData.appliedGroups.length === 0 && (
                              <span className="text-sm text-gray-500">Direct assignments</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {variantCount} variants
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleFileExpansion(fileData.fileName)}
                          >
                            {isExpanded ? 'Hide' : 'Show'}
                          </Button>
                        </TableCell>
                      </TableRow>

                      {/* Expanded mesh details */}
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={5} className="p-0">
                            <div className="p-4 bg-gray-50 dark:bg-gray-800/50">
                              <div className="space-y-3">
                                <h4 className="font-medium text-sm">Mesh Assignments</h4>
                                <div className="grid gap-3">
                                  {fileData.meshes.map((mesh) => (
                                    <div 
                                      key={mesh.name}
                                      className={cn(
                                        "p-3 rounded-lg border",
                                        mesh.exists && mesh.missingMaterials.length === 0
                                          ? "bg-white dark:bg-gray-800"
                                          : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                                      )}
                                    >
                                      <div className="flex items-start justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                          <Package className={cn(
                                            "h-4 w-4",
                                            mesh.exists ? "text-gray-500" : "text-red-500"
                                          )} />
                                          <span className={cn(
                                            "font-medium",
                                            !mesh.exists && "text-red-700 dark:text-red-300"
                                          )}>
                                            {mesh.name}
                                          </span>
                                          {!mesh.exists && (
                                            <Badge variant="destructive" className="text-xs">
                                              Missing Mesh
                                            </Badge>
                                          )}
                                          {mesh.source === 'group' && (
                                            <Badge variant="outline" className="bg-blue-50 text-blue-700">
                                              <FolderOpen className="h-3 w-3 mr-1" />
                                              {mesh.groupName}
                                            </Badge>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Badge variant={mesh.source === 'group' ? 'default' : 'secondary'}>
                                            {mesh.source === 'group' ? 'Group' : 'Direct'}
                                          </Badge>
                                          {!mesh.exists && (
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => onAddMesh(mesh.name)}
                                              className="h-6 px-2 text-xs"
                                            >
                                              <Plus className="h-3 w-3 mr-1" />
                                              Add Mesh
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                      
                                      <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                          <span className="text-gray-500">Default Material:</span>
                                          <div className="flex items-center gap-2 mt-1">
                                            <span className={cn(
                                              "font-medium",
                                              mesh.assignment.defaultMaterial && 
                                              !materialExists(mesh.assignment.defaultMaterial) &&
                                              "text-red-600 dark:text-red-400"
                                            )}>
                                              {mesh.assignment.defaultMaterial || 'None'}
                                            </span>
                                            {mesh.assignment.defaultMaterial && 
                                             !materialExists(mesh.assignment.defaultMaterial) && (
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => onAddMaterial(mesh.assignment.defaultMaterial)}
                                                className="h-5 px-1 text-xs"
                                              >
                                                <Plus className="h-2 w-2" />
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                        <div>
                                          <span className="text-gray-500">Variants:</span>
                                          <div className="flex flex-wrap gap-1 mt-1">
                                            {mesh.assignment.variants.length > 0 ? (
                                              mesh.assignment.variants.map((variant, idx) => (
                                                <div key={idx} className="flex items-center gap-1">
                                                  <Badge 
                                                    variant={
                                                      materialExists(variant.material) ? "outline" : "destructive"
                                                    }
                                                    className={cn(
                                                      "text-xs",
                                                      !materialExists(variant.material) && 
                                                      "bg-red-100 text-red-700 border-red-300"
                                                    )}
                                                  >
                                                    {variant.name} → {variant.material}
                                                  </Badge>
                                                  {!materialExists(variant.material) && (
                                                    <Button
                                                      variant="outline"
                                                      size="sm"
                                                      onClick={() => onAddMaterial(variant.material)}
                                                      className="h-4 w-4 p-0"
                                                    >
                                                      <Plus className="h-2 w-2" />
                                                    </Button>
                                                  )}
                                                </div>
                                              ))
                                            ) : (
                                              <span className="text-gray-400">No variants</span>
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                    {/* Missing materials summary */}
                                    {mesh.missingMaterials.length > 0 && (
                                      <div className="mt-3 p-2 bg-red-100 dark:bg-red-900/30 rounded border border-red-200 dark:border-red-800">
                                        <div className="flex items-center justify-between">
                                          <span className="text-xs font-medium text-red-700 dark:text-red-300">
                                            Missing Materials: {mesh.missingMaterials.join(', ')}
                                          </span>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                              mesh.missingMaterials.forEach(mat => onAddMaterial(mat));
                                            }}
                                            className="h-5 px-2 text-xs"
                                          >
                                            Add All
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      <DialogFooter>
        <Button onClick={onClose} variant="outline">
          Close
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
    );
}