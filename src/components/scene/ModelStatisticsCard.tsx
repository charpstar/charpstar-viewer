"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, BarChart3 } from "lucide-react";

interface ModelStatisticsCardProps {
  modelViewerRef?: React.RefObject<any>;
  modelStructure?: any;
}

interface ModelStats {
  triangles: number;
  vertices: number;
  meshes: number;
  materials: number;
  variants: number;
  doubleSided: number;
  textureQuality: string;
  aoStatus: string;
  transformations: string;
}

const ModelStatisticsCard: React.FC<ModelStatisticsCardProps> = ({
  modelViewerRef,
  modelStructure,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [stats, setStats] = useState<ModelStats>({
    triangles: 0,
    vertices: 0,
    meshes: 0,
    materials: 0,
    variants: 0,
    doubleSided: 0,
    textureQuality: "N/A",
    aoStatus: "Missing",
    transformations: "None",
  });

  // Helper function to count nodes recursively
  const countNodes = (node: any, type: string): number => {
    if (!node) return 0;

    let count = node.type === type ? 1 : 0;

    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        count += countNodes(child, type);
      }
    }

    return count;
  };

  // Enhanced function to extract geometry statistics
  const extractGeometryStats = (): {
    triangles: number;
    vertices: number;
    doubleSided: number;
  } => {
    if (!modelViewerRef?.current) {
      return { triangles: 0, vertices: 0, doubleSided: 0 };
    }

    let totalTriangles = 0;
    let totalVertices = 0;
    let doubleSidedCount = 0;

    try {
      // The model.traverse method doesn't work with model-viewer's model object
      // Use the UUID-based method directly since it's more reliable
      return extractGeometryFromUUIDs();
    } catch (error) {
      console.error("Error extracting geometry stats:", error);
      // Fallback to UUID-based extraction
      return extractGeometryFromUUIDs();
    }
  };

  // Alternative method: use the getObjectByUuid method with model structure
  const extractGeometryFromUUIDs = (): {
    triangles: number;
    vertices: number;
    doubleSided: number;
  } => {
    if (
      !modelStructure ||
      !modelViewerRef?.current ||
      typeof modelViewerRef.current.getObjectByUuid !== "function"
    ) {
      return { triangles: 0, vertices: 0, doubleSided: 0 };
    }

    let totalTriangles = 0;
    let totalVertices = 0;
    let doubleSidedCount = 0;

    const traverseStructure = (node: any) => {
      if (node.type === "Mesh" && node.uuid) {
        try {
          const object = modelViewerRef.current.getObjectByUuid(node.uuid);
          if (object && object.geometry) {
            const geometry = object.geometry;

            // Count vertices
            if (geometry.attributes && geometry.attributes.position) {
              const positionCount = geometry.attributes.position.count;
              totalVertices += positionCount;
            }

            // Count triangles
            if (geometry.index) {
              // Indexed geometry
              const triangleCount = geometry.index.count / 3;
              totalTriangles += triangleCount;
            } else if (geometry.attributes && geometry.attributes.position) {
              // Non-indexed geometry
              const triangleCount = geometry.attributes.position.count / 3;
              totalTriangles += triangleCount;
            }

            // Check if material is double-sided
            if (object.material) {
              if (Array.isArray(object.material)) {
                object.material.forEach((mat: any) => {
                  if (mat.side === 2) doubleSidedCount++;
                });
              } else {
                if (object.material.side === 2) doubleSidedCount++;
              }
            }
          }
        } catch (error) {
          console.error(`Error getting object with UUID ${node.uuid}:`, error);
        }
      }

      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          traverseStructure(child);
        }
      }
    };

    traverseStructure(modelStructure);

    return {
      triangles: Math.floor(totalTriangles),
      vertices: totalVertices,
      doubleSided: doubleSidedCount,
    };
  };

  // Extract material variants count
  const extractVariantsCount = (): number => {
    if (!modelViewerRef?.current) return 0;

    try {
      // Try to get variants from the model viewer
      const variants = modelViewerRef.current.availableVariants;
      if (variants && Array.isArray(variants)) {
        return variants.length;
      }

      // Alternative method: check if variantName property exists
      if (modelViewerRef.current.variantName !== undefined) {
        // If variantName exists, there's at least one variant
        return 1;
      }
    } catch (error) {
      console.error("Error extracting variants count:", error);
    }

    return 0;
  };

  // Analyze texture quality across all materials
  const analyzeTextureQuality = (): string => {
    if (
      !modelStructure ||
      !modelViewerRef?.current ||
      typeof modelViewerRef.current.getObjectByUuid !== "function"
    ) {
      return "N/A";
    }

    const textureSizes = new Set<number>();
    let hasTextures = false;

    const traverseForTextures = (node: any) => {
      if (node.type === "Mesh" && node.uuid) {
        try {
          const object = modelViewerRef.current.getObjectByUuid(node.uuid);
          if (object && object.material) {
            const materials = Array.isArray(object.material)
              ? object.material
              : [object.material];

            materials.forEach((material: any) => {
              // Check various texture maps
              const textureMaps = [
                "map",
                "normalMap",
                "roughnessMap",
                "metalnessMap",
                "aoMap",
                "alphaMap",
              ];

              textureMaps.forEach((mapType) => {
                const texture = material[mapType];
                if (texture && texture.image) {
                  hasTextures = true;
                  const maxSize = Math.max(
                    texture.image.width || 0,
                    texture.image.height || 0
                  );
                  textureSizes.add(maxSize);
                }
              });
            });
          }
        } catch (error) {
          // Continue with other nodes
        }
      }

      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          traverseForTextures(child);
        }
      }
    };

    traverseForTextures(modelStructure);

    if (!hasTextures) return "No Textures";

    const sizes = Array.from(textureSizes).sort((a, b) => b - a);
    const maxSize = sizes[0];

    // Determine quality based on largest texture
    if (maxSize >= 4096) return "4K+";
    if (maxSize >= 2048) return "2K";
    if (maxSize >= 1024) return "1K";
    if (maxSize >= 512) return "512px";
    return `${maxSize}px`;
  };

  // Check AO status across all materials
  const analyzeAOStatus = (): string => {
    if (
      !modelStructure ||
      !modelViewerRef?.current ||
      typeof modelViewerRef.current.getObjectByUuid !== "function"
    ) {
      return "Unknown";
    }

    let totalMaterials = 0;
    let materialsWithAO = 0;

    const traverseForAO = (node: any) => {
      if (node.type === "Mesh" && node.uuid) {
        try {
          const object = modelViewerRef.current.getObjectByUuid(node.uuid);
          if (object && object.material) {
            const materials = Array.isArray(object.material)
              ? object.material
              : [object.material];

            materials.forEach((material: any) => {
              totalMaterials++;
              if (material.aoMap) {
                materialsWithAO++;
              }
            });
          }
        } catch (error) {
          // Continue with other nodes
        }
      }

      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          traverseForAO(child);
        }
      }
    };

    traverseForAO(modelStructure);

    if (totalMaterials === 0) return "Unknown";
    if (materialsWithAO === 0) return "Missing";
    if (materialsWithAO === totalMaterials) return "Present";
    return `Partial (${materialsWithAO}/${totalMaterials})`;
  };

  // Check for transformations applied to objects
  const analyzeTransformations = (): string => {
    if (
      !modelStructure ||
      !modelViewerRef?.current ||
      typeof modelViewerRef.current.getObjectByUuid !== "function"
    ) {
      return "Unknown";
    }

    let hasRotation = false;
    let hasScale = false;
    let hasTranslation = false;
    let objectCount = 0;

    const traverseForTransforms = (node: any) => {
      if (node.uuid) {
        try {
          const object = modelViewerRef.current.getObjectByUuid(node.uuid);
          if (object) {
            objectCount++;

            // Check rotation (quaternion)
            if (
              object.quaternion &&
              (Math.abs(object.quaternion.x) > 0.001 ||
                Math.abs(object.quaternion.y) > 0.001 ||
                Math.abs(object.quaternion.z) > 0.001 ||
                Math.abs(object.quaternion.w - 1) > 0.001)
            ) {
              hasRotation = true;
            }

            // Check scale
            if (
              object.scale &&
              (Math.abs(object.scale.x - 1) > 0.001 ||
                Math.abs(object.scale.y - 1) > 0.001 ||
                Math.abs(object.scale.z - 1) > 0.001)
            ) {
              hasScale = true;
            }

            // Check translation
            if (
              object.position &&
              (Math.abs(object.position.x) > 0.001 ||
                Math.abs(object.position.y) > 0.001 ||
                Math.abs(object.position.z) > 0.001)
            ) {
              hasTranslation = true;
            }
          }
        } catch (error) {
          console.error(`Error analyzing transforms for ${node.uuid}:`, error);
        }
      }

      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          traverseForTransforms(child);
        }
      }
    };

    traverseForTransforms(modelStructure);

    if (objectCount === 0) return "Unknown";

    const transforms = [];
    if (hasRotation) transforms.push("Rotation");
    if (hasScale) transforms.push("Scale");
    if (hasTranslation) transforms.push("Translation");

    if (transforms.length === 0) return "None";
    return transforms.join(", ");
  };

  // Update statistics when model structure changes
  useEffect(() => {
    if (!modelStructure && !modelViewerRef?.current) {
      setStats({
        triangles: 0,
        vertices: 0,
        meshes: 0,
        materials: 0,
        variants: 0,
        doubleSided: 0,
        textureQuality: "N/A",
        aoStatus: "Missing",
        transformations: "None",
      });
      return;
    }

    // Add a small delay to ensure the model is fully loaded
    const updateStats = () => {
      try {
        // Count meshes from structure if available
        const meshCount = modelStructure
          ? countNodes(modelStructure, "Mesh")
          : 0;

        // Extract geometry statistics
        const geometryStats = extractGeometryStats();

        // Extract variants count
        const variantsCount = extractVariantsCount();

        // Count unique materials by traversing the model structure
        const materialNames = new Set<string>();
        if (modelStructure) {
          const countMaterials = (node: any) => {
            if (node.type === "Mesh" && node.material) {
              materialNames.add(node.material);
            }
            if (node.children && Array.isArray(node.children)) {
              for (const child of node.children) {
                countMaterials(child);
              }
            }
          };
          countMaterials(modelStructure);
        }

        // Analyze additional properties
        const textureQuality = analyzeTextureQuality();
        const aoStatus = analyzeAOStatus();
        const transformations = analyzeTransformations();

        setStats({
          triangles: geometryStats.triangles,
          vertices: geometryStats.vertices,
          meshes: meshCount,
          materials: materialNames.size,
          variants: variantsCount,
          doubleSided: geometryStats.doubleSided,
          textureQuality,
          aoStatus,
          transformations,
        });
      } catch (error) {
        console.error("Error calculating model statistics:", error);
      }
    };

    // Update immediately
    updateStats();

    // Also update after a short delay to catch late-loading data
    const timeoutId = setTimeout(updateStats, 1000);

    return () => clearTimeout(timeoutId);
  }, [modelStructure, modelViewerRef]);

  // Format numbers with commas
  const formatNumber = (num: number): string => {
    return num.toLocaleString();
  };

  return (
    <div className="absolute top-4 left-4 z-10 bg-white rounded-lg shadow-lg border border-gray-200 min-w-[240px]">
      {/* Header */}
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 rounded-t-lg"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center">
          <BarChart3 size={16} className="mr-2 text-blue-600" />
          <span className="text-sm font-medium text-gray-700">
            Model Statistics
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp size={16} className="text-gray-500" />
        ) : (
          <ChevronDown size={16} className="text-gray-500" />
        )}
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-2 h-2 bg-gray-400 rounded-full mr-2"></div>
              <span className="text-gray-600">Triangles:</span>
            </div>
            <span className="font-medium">{formatNumber(stats.triangles)}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-2 h-2 bg-gray-400 rounded-full mr-2"></div>
              <span className="text-gray-600">Vertices:</span>
            </div>
            <span className="font-medium">{formatNumber(stats.vertices)}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-2 h-2 bg-gray-400 rounded-full mr-2"></div>
              <span className="text-gray-600">Meshes:</span>
            </div>
            <span className="font-medium">{stats.meshes}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-2 h-2 bg-gray-400 rounded-full mr-2"></div>
              <span className="text-gray-600">Materials:</span>
            </div>
            <span className="font-medium">{stats.materials}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-2 h-2 bg-gray-400 rounded-full mr-2"></div>
              <span className="text-gray-600">Variants:</span>
            </div>
            <span className="font-medium">{stats.variants}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
              <span className="text-gray-600">Double Sided:</span>
            </div>
            <span className="font-medium">{stats.doubleSided}</span>
          </div>

          <div className="border-t border-gray-200 my-2"></div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-2 h-2 bg-purple-500 rounded-full mr-2"></div>
              <span className="text-gray-600">Texture Quality:</span>
            </div>
            <span className="font-medium">{stats.textureQuality}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div
                className={`w-2 h-2 rounded-full mr-2 ${
                  stats.aoStatus === "Present"
                    ? "bg-green-500"
                    : stats.aoStatus === "Missing"
                    ? "bg-red-500"
                    : "bg-orange-500"
                }`}
              ></div>
              <span className="text-gray-600">AO Maps:</span>
            </div>
            <span className="font-medium">{stats.aoStatus}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div
                className={`w-2 h-2 rounded-full mr-2 ${
                  stats.transformations === "None"
                    ? "bg-gray-400"
                    : "bg-blue-500"
                }`}
              ></div>
              <span className="text-gray-600">Transforms:</span>
            </div>
            <div className="text-right">
              {stats.transformations === "None" ? (
                <span className="font-medium text-xs text-gray-500">
                  Default Position
                </span>
              ) : (
                <div className="flex flex-wrap gap-1 justify-end">
                  {stats.transformations.split(", ").map((transform, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800"
                    >
                      {transform === "Rotation" && "🔄 Rotated"}
                      {transform === "Scale" && "📏 Resized"}
                      {transform === "Translation" && "📍 Moved"}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelStatisticsCard;
