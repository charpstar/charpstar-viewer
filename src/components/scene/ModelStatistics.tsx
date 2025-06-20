"use client";

import { useState, useEffect } from "react";

interface ModelStatisticsProps {
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
}

const ModelStatistics: React.FC<ModelStatisticsProps> = ({
  modelViewerRef,
  modelStructure,
}) => {
  const [stats, setStats] = useState<ModelStats>({
    triangles: 0,
    vertices: 0,
    meshes: 0,
    materials: 0,
    variants: 0,
    doubleSided: 0,
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

  // Helper function to extract geometry statistics from model viewer
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
      // Access the Three.js scene from model-viewer
      const scene = modelViewerRef.current.model;
      if (!scene) {
        console.log("No model scene found");
        return { triangles: 0, vertices: 0, doubleSided: 0 };
      }

      // Traverse the scene to count geometry
      scene.traverse((object: any) => {
        if (object.isMesh && object.geometry) {
          const geometry = object.geometry;

          // Count vertices
          if (geometry.attributes && geometry.attributes.position) {
            const positionCount = geometry.attributes.position.count;
            totalVertices += positionCount;
          }

          // Count triangles
          if (geometry.index) {
            // Indexed geometry
            totalTriangles += geometry.index.count / 3;
          } else if (geometry.attributes && geometry.attributes.position) {
            // Non-indexed geometry
            totalTriangles += geometry.attributes.position.count / 3;
          }

          // Check if material is double-sided
          if (object.material && object.material.side === 2) {
            // THREE.DoubleSide = 2
            doubleSidedCount++;
          }
        }
      });
    } catch (error) {
      console.error("Error extracting geometry stats:", error);
    }

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
    } catch (error) {
      console.error("Error extracting variants count:", error);
    }

    return 0;
  };

  // Update statistics when model structure changes
  useEffect(() => {
    if (!modelStructure) {
      setStats({
        triangles: 0,
        vertices: 0,
        meshes: 0,
        materials: 0,
        variants: 0,
        doubleSided: 0,
      });
      return;
    }

    try {
      // Count meshes and materials from structure
      const meshCount = countNodes(modelStructure, "Mesh");

      // Extract geometry statistics
      const geometryStats = extractGeometryStats();

      // Extract variants count
      const variantsCount = extractVariantsCount();

      // Count unique materials by traversing the model structure
      const materialNames = new Set<string>();
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

      setStats({
        triangles: geometryStats.triangles,
        vertices: geometryStats.vertices,
        meshes: meshCount,
        materials: materialNames.size,
        variants: variantsCount,
        doubleSided: geometryStats.doubleSided,
      });
    } catch (error) {
      console.error("Error calculating model statistics:", error);
    }
  }, [modelStructure, modelViewerRef]);

  // Format numbers with commas
  const formatNumber = (num: number): string => {
    return num.toLocaleString();
  };

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-gray-700 mb-3">
        Model Statistics
      </div>

      <div className="space-y-2 text-xs">
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
      </div>
    </div>
  );
};

export default ModelStatistics;
