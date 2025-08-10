// src/components/demo/CompactModelStats.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Info, Loader, Copy, Layers, Brush, Palette } from 'lucide-react';

interface CompactModelStatsProps {
  modelViewerRef: React.RefObject<any>;
  modelName: string;
}

interface ModelStatistics {
  vertices: number;
  triangles: number;
  meshCount: number;
  materialCount: number;
  doubleSidedCount: number;
  doubleSidedMaterials: string[];
  variantCount: number;
  isLoading: boolean;
}

const formatNumber = (num: number): string => {
  return num.toLocaleString();
};

const CompactModelStats: React.FC<CompactModelStatsProps> = ({ 
  modelViewerRef,
  modelName 
}) => {
  const [stats, setStats] = useState<ModelStatistics>({
    vertices: 0,
    triangles: 0,
    meshCount: 0,
    materialCount: 0,
    doubleSidedCount: 0,
    doubleSidedMaterials: [],
    variantCount: 0,
    isLoading: true
  });
  const [showDoubleSidedDetails, setShowDoubleSidedDetails] = useState(false);
  const lastValidStatsRef = useRef<ModelStatistics | null>(null);
  
  // Minimal stats fetch
  const fetchStats = () => {
    const el: any = modelViewerRef.current || (window as any).modelViewerElement || (document.getElementById('model-viewer') as any);
    if (!el) return;
    const variants = el.availableVariants || [];
    const variantCount = Array.isArray(variants) ? variants.length : 0;
    const get = (fn: any, fallback: any) => (typeof fn === 'function' ? fn.call(el) : fallback);
    const combined = typeof el.getModelStats === 'function' ? el.getModelStats() : null;
    if (combined) {
      const newStats = {
        vertices: combined.vertices || 0,
        triangles: combined.triangles || 0,
        meshCount: combined.meshCount || 0,
        materialCount: combined.materialCount || 0,
        doubleSidedCount: combined.doubleSidedCount || 0,
        doubleSidedMaterials: combined.doubleSidedMaterials || [],
        variantCount,
        isLoading: false,
      };
      lastValidStatsRef.current = newStats;
      setStats(newStats);
      return;
    }
    const poly = get(el.getPolyStats, { vertices: 0, triangles: 0 });
    const meshCount = get(el.totalMeshCount, 0);
    const materialCount = get(el.totalMaterialCount, 0);
    const doubleInfo = get(el.checkForDoubleSided, { count: 0, materials: [] });
    const fallback = {
      vertices: poly.vertices || 0,
      triangles: poly.triangles || 0,
      meshCount: meshCount || 0,
      materialCount: materialCount || 0,
      doubleSidedCount: doubleInfo.count || 0,
      doubleSidedMaterials: doubleInfo.materials || [],
      variantCount,
      isLoading: false,
    };
    lastValidStatsRef.current = fallback;
    setStats(fallback);
  };
  
  // Minimal effect: fetch once per model change
  useEffect(() => {
    setStats(prev => ({ ...prev, isLoading: true }));
    fetchStats();
  }, [modelName]);
  
  // Ensure stats initialize on hard refresh and when variants apply
  useEffect(() => {
    const bind = (element: any) => {
      if (!element) return () => {};
      const onLoad = () => fetchStats();
      const onVariant = () => fetchStats();
      element.addEventListener('load', onLoad);
      element.addEventListener('variant-applied', onVariant);
      if (element.loaded) fetchStats();
      return () => {
        element.removeEventListener('load', onLoad);
        element.removeEventListener('variant-applied', onVariant);
      };
    };
    const el: any = modelViewerRef.current || (window as any).modelViewerElement || (document.getElementById('model-viewer') as any);
    if (el) {
      return bind(el);
    }
    const t = setTimeout(() => {
      const lateEl: any = modelViewerRef.current || (window as any).modelViewerElement || (document.getElementById('model-viewer') as any);
      if (lateEl) {
        bind(lateEl);
      }
    }, 250);
    return () => clearTimeout(t);
  }, []);
  
  const toggleDoubleSidedDetails = () => {
    setShowDoubleSidedDetails(!showDoubleSidedDetails);
  };
  
  // Smaller and more compact panel
  return (
    <div className="absolute top-2 right-2 z-10 bg-white/95 rounded-md shadow-md border border-gray-200 overflow-hidden w-52">
      <div className="flex justify-between items-center px-2 py-1 bg-gray-100 border-b border-gray-200">
        <h3 className="text-xs font-medium text-gray-800 flex items-center">
          <Info size={11} className="mr-1" />
          Model Statistics
        </h3>
      </div>
      
      {stats.isLoading ? (
        <div className="p-2 flex items-center justify-center">
          <Loader size={12} className="animate-spin text-gray-400 mr-1.5" />
          <span className="text-xs text-gray-500">Loading stats...</span>
        </div>
      ) : (
        <div className="text-xs">
          {/* Geometry stats - direct display of triangles and vertices */}
          <div className="px-2 py-1.5 border-b border-gray-200 grid grid-cols-2 gap-x-2 gap-y-1">
            <div className="flex items-center">
              <Copy size={10} className="mr-1.5 text-gray-500" />
              <span className="text-gray-700">Triangles:</span>
            </div>
            <div className="text-right font-medium">
              {formatNumber(stats.triangles)}
            </div>
            
            <div className="flex items-center">
              <div className="w-2.5 h-2.5 mr-1.5 opacity-0"></div>
              <span className="text-gray-700">Vertices:</span>
            </div>
            <div className="text-right font-medium">
              {formatNumber(stats.vertices)}
            </div>
          </div>
          
          {/* Mesh and Material Counts */}
          <div className="px-2 py-1.5 border-b border-gray-200 grid grid-cols-2 gap-x-2 gap-y-1">
            <div className="flex items-center">
              <Layers size={10} className="mr-1.5 text-gray-500" />
              <span className="text-gray-700">Meshes:</span>
            </div>
            <div className="text-right font-medium">
              {formatNumber(stats.meshCount)}
            </div>
            
            <div className="flex items-center">
              <Brush size={10} className="mr-1.5 text-gray-500" />
              <span className="text-gray-700">Materials:</span>
            </div>
            <div className="text-right font-medium">
              {formatNumber(stats.materialCount)}
            </div>
          </div>
          
          {/* Variants Count */}
          <div className="px-2 py-1.5 border-b border-gray-200 grid grid-cols-2 gap-x-2">
            <div className="flex items-center">
              <Palette size={10} className="mr-1.5 text-gray-500" />
              <span className="text-gray-700">Variants:</span>
            </div>
            <div className="text-right font-medium">
              {formatNumber(stats.variantCount)}
            </div>
          </div>
          
          {/* Double Sided Materials */}
          <div className="px-2 py-1.5">
            <div
              className={`flex items-center justify-between ${stats.doubleSidedCount > 0 ? 'cursor-pointer hover:bg-gray-50' : ''}`}
              onClick={stats.doubleSidedCount > 0 ? toggleDoubleSidedDetails : undefined}
            >
              <div className="flex items-center">
                <div className={`w-2 h-2 rounded-full mr-1.5 ${stats.doubleSidedCount > 0 ? 'bg-yellow-400' : 'bg-green-400'}`}></div>
                <span className="text-gray-700">Double Sided:</span>
              </div>
              <span className="font-medium flex items-center">
                {formatNumber(stats.doubleSidedCount)}
                {stats.doubleSidedCount > 0 && (
                  <button className="ml-1 p-0.5">
                    {showDoubleSidedDetails ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="18 15 12 9 6 15"></polyline>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    )}
                  </button>
                )}
              </span>
            </div>
            
            {showDoubleSidedDetails && stats.doubleSidedCount > 0 && (
              <div className="mt-1 text-[10px] max-h-24 overflow-y-auto ml-3.5 bg-gray-50 p-1.5 rounded">
                {stats.doubleSidedMaterials.map((material, index) => (
                  <div key={index} className="text-gray-600 mb-0.5 flex items-center">
                    <span className="w-1 h-1 bg-yellow-400 rounded-full mr-1"></span>
                    <span className="truncate">{material}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CompactModelStats;