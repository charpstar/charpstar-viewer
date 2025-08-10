'use client';

import { useParams } from 'next/navigation';
import { clients, isValidClient } from '@/config/clientConfig';
import { useState, useRef, useEffect, useCallback } from 'react';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Save, RefreshCw, Palette, Upload, Trash2, Edit } from 'lucide-react';
import Header from '@/components/layout/Header';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import DebouncedColorPicker from '@/components/material/DebouncedColorPicker';
import { SliderWithInput } from '@/components/ui/slider-with-input';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
// Material interface for the editor
interface Material {
  name: string;
  baseColor: [number, number, number, number];
  metallicFactor: number;
  roughnessFactor: number;
  emissiveFactor: [number, number, number];
  normalScale: number;
  occlusionStrength: number;
  baseColorTexture?: string;
  metallicRoughnessTexture?: string;
  normalTexture?: string;
  occlusionTexture?: string;
  emissiveTexture?: string;
  sheenFactor?: number; // legacy UI alias
  sheenTexture?: string; // legacy UI alias
  sheenRoughnessFactor?: number;
  sheenRoughnessTexture?: string;
  sheenColor?: [number, number, number];
  sheenColorTexture?: string;
}

interface ReferenceGltf {
  materials: Material[];
  textures: any[];
  images: any[];
  lastModified: string;
}

// Load model-viewer script
function ensureModelViewerLoaded(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && (window as any).customElements?.get?.('model-viewer')) {
      resolve();
      return;
    }
    
    const existing = document.querySelector('script[data-loader="model-viewer"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load model-viewer')));
      return;
    }

    const script = document.createElement('script');
    script.type = 'module';
    script.src = '/model-viewer-max.js';
    script.setAttribute('data-loader', 'model-viewer');
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('Failed to load model-viewer')));
    document.head.appendChild(script);
  });
}

export default function MaterialEditorPage() {
  const params = useParams();
  const clientName = params.client as string;
  
  // Validate client
  if (!isValidClient(clientName)) {
    notFound();
  }

  const clientConfig = clients[clientName];
  
  // State management
  const [referenceGltf, setReferenceGltf] = useState<ReferenceGltf | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [editedMaterial, setEditedMaterial] = useState<Material | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingMaterial, setIsAddingMaterial] = useState(false);
  const [newMaterialName, setNewMaterialName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [texturePicker, setTexturePicker] = useState<{open: boolean; slot: keyof Material | null; search: string}>({open:false, slot:null, search:''});
  const [deleteDialog, setDeleteDialog] = useState<{open:boolean; name:string}|null>(null);
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: 'success'|'error'}>>([]);
  const addToast = useCallback((message: string, type: 'success'|'error' = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const modelViewerRef = useRef<any>(null);

  // Load reference GLTF data
  const loadReferenceGltf = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/reference-gltf?client=${clientName}`);
      if (!response.ok) throw new Error('Failed to load reference GLTF');
      const data = await response.json();
      setReferenceGltf(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reference GLTF');
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize model-viewer and load data
  useEffect(() => {
    ensureModelViewerLoaded()
      .then(() => loadReferenceGltf())
      .catch((err) => setError(err.message));
  }, [clientName]);

  // Apply full material spec through model-viewer helper (ensures textures & correct material type)
  const updateCubeMaterial = useCallback(async (material: Material) => {
    const mv = modelViewerRef.current as any;
    if (!mv) return;

    // Build absolute URLs for textures if needed
    const withUrls = (key?: string) => {
      if (!key) return undefined;
      if (key.startsWith('http://') || key.startsWith('https://') || key.startsWith('/')) return key;
      // Assume BunnyCDN images path
      return `https://cdn.charpstar.net/Client-Editor/${clientName}/images/${key}`;
    };

    const spec = {
      ...material,
      baseColorTexture: withUrls(material.baseColorTexture),
      metallicRoughnessTexture: withUrls(material.metallicRoughnessTexture),
      normalTexture: withUrls(material.normalTexture),
      occlusionTexture: withUrls(material.occlusionTexture),
      emissiveTexture: withUrls(material.emissiveTexture),
      sheenRoughnessTexture: withUrls(material.sheenRoughnessTexture || material.sheenTexture),
      sheenColorTexture: withUrls(material.sheenColorTexture),
    } as any;

    try {
      if (typeof mv.applyCubeMaterialFromSpec === 'function') {
        await mv.applyCubeMaterialFromSpec(spec);
      } else {
        // Fallback to property-only update if helper not present
        const root = mv.getScene();
        const cube = root?.children?.[0];
        const mat = cube?.material;
        if (mat) {
          if (material.baseColor) {
            mat.color.setRGB(material.baseColor[0], material.baseColor[1], material.baseColor[2]);
            mat.opacity = material.baseColor[3];
            mat.transparent = material.baseColor[3] < 1;
          }
          if (typeof material.metallicFactor === 'number') mat.metalness = material.metallicFactor;
          if (typeof material.roughnessFactor === 'number') mat.roughness = material.roughnessFactor;
          if (material.emissiveFactor) mat.emissive.setRGB(material.emissiveFactor[0], material.emissiveFactor[1], material.emissiveFactor[2]);
          if (typeof material.normalScale === 'number' && mat.normalScale) mat.normalScale.set(material.normalScale, material.normalScale);
        }
      }
      mv.refreshViewer();
    } catch (error) {
      console.warn('Failed to apply material spec:', error);
    }
  }, [clientName]);

  // Handle material selection
  const handleMaterialSelect = useCallback((material: Material) => {
    // Ensure all required properties exist with defaults
    const materialWithDefaults = {
      name: material.name || 'Unnamed Material',
      baseColor: material.baseColor || [0.8, 0.8, 0.8, 1.0],
      metallicFactor: material.metallicFactor ?? 0,
      roughnessFactor: material.roughnessFactor ?? 0.5,
      emissiveFactor: material.emissiveFactor || [0, 0, 0],
      normalScale: material.normalScale ?? 1,
      occlusionStrength: material.occlusionStrength ?? 1,
      baseColorTexture: material.baseColorTexture,
      metallicRoughnessTexture: material.metallicRoughnessTexture,
      normalTexture: material.normalTexture,
      occlusionTexture: material.occlusionTexture,
      emissiveTexture: material.emissiveTexture,
      // Sheen fields from reader (support full names and legacy)
      sheenRoughnessFactor: (material as any).sheenRoughnessFactor ?? (material as any).sheenFactor ?? 0,
      sheenRoughnessTexture: (material as any).sheenRoughnessTexture ?? (material as any).sheenTexture,
      sheenColor: (material as any).sheenColor || [1, 1, 1],
      sheenColorTexture: (material as any).sheenColorTexture,
    };
    
    setSelectedMaterial(materialWithDefaults);
    setEditedMaterial(materialWithDefaults);
    updateCubeMaterial(materialWithDefaults);
  }, [updateCubeMaterial]);

  // Handle material property changes
  const handleMaterialChange = useCallback((property: string, value: any) => {
    setEditedMaterial(prev => {
      if (!prev) return prev;
      const updated = { ...prev, [property]: value };
      updateCubeMaterial(updated);
      return updated;
    });
  }, [updateCubeMaterial]);

  // Save ALL materials (staged) – single upload
  const saveAllMaterials = async () => {
    if (!referenceGltf) return;
    setIsSaving(true);
    try {
      // Ensure editedMaterial is reflected in the staged list
      let stagedMaterials = referenceGltf.materials;
      if (editedMaterial) {
        stagedMaterials = referenceGltf.materials.map(m => m.name === editedMaterial.name ? editedMaterial : m);
      }

      const response = await fetch('/api/save-materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client: clientName, materials: stagedMaterials })
      });
      if (!response.ok) throw new Error('Failed to save materials');

      // Reload reference data to reflect server state
      await loadReferenceGltf();
      addToast('Materials saved successfully', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save materials');
      addToast('Failed to save materials', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Add new material
  const addNewMaterial = () => {
    if (!newMaterialName.trim() || !referenceGltf) return;
    const newMaterial: Material = {
      name: newMaterialName,
      baseColor: [0.8, 0.8, 0.8, 1.0],
      metallicFactor: 0.0,
      roughnessFactor: 0.5,
      emissiveFactor: [0, 0, 0],
      normalScale: 1.0,
      occlusionStrength: 1.0,
    };
    setReferenceGltf(prev => prev ? { ...prev, materials: [...prev.materials, newMaterial] } : prev);
    setNewMaterialName('');
    setIsAddingMaterial(false);
    setSelectedMaterial(newMaterial);
    setEditedMaterial({ ...newMaterial });
  };

  // Delete material
  const deleteMaterial = (materialName: string) => {
    if (!referenceGltf) return;
    const updatedMaterials = referenceGltf.materials.filter(mat => mat.name !== materialName);
    setReferenceGltf({ ...referenceGltf, materials: updatedMaterials });
    if (selectedMaterial?.name === materialName) {
      setSelectedMaterial(null);
      setEditedMaterial(null);
    }
  };

  // Simple filtered materials
  const filteredMaterials = referenceGltf?.materials.filter(m => 
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  // Compact map slot that mirrors the color swatch UX
  const MapSlot: React.FC<{ texture?: string; onPick: () => void; onRemove: () => void; alt: string }> = ({ texture, onPick, onRemove, alt }) => (
    <div className="relative w-6 h-6 rounded overflow-hidden group border border-gray-300 bg-white">
      {texture ? (
        <>
          <img
            src={`https://cdn.charpstar.net/Client-Editor/${clientName}/images/${texture}`}
            alt={alt}
            className="object-cover w-full h-full"
          />
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${alt}`}
            className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/55 text-white"
            title="Remove"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onPick}
          className="w-full h-full flex items-center justify-center text-gray-400 hover:text-gray-600"
          aria-label={`Pick ${alt}`}
          title="Add"
        >
          <Upload className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading material editor...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 mb-4">Error: {error}</div>
          <Button onClick={loadReferenceGltf} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header 
        onRefreshModels={loadReferenceGltf}
        onUploadModels={() => {}}
        onSave={saveAllMaterials}
        isSaving={isSaving}
      />
      
      <div className="flex h-[calc(100vh-48px)]">
        {/* Left Sidebar - Material List */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col min-h-0">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                <Palette className="w-5 h-5 mr-2" />
                Materials
              </h2>
              <Dialog open={isAddingMaterial} onOpenChange={setIsAddingMaterial}>
                <DialogTrigger asChild>
                  <Button size="sm" className="flex items-center">
                    <Plus className="w-4 h-4 mr-1" />
                    Add
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Material</DialogTitle>
                    <DialogDescription>
                      Create a new material for the reference GLTF
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <Input
                      placeholder="Material name"
                      value={newMaterialName}
                      onChange={(e) => setNewMaterialName(e.target.value)}
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddingMaterial(false)}>
                      Cancel
                    </Button>
                    <Button onClick={addNewMaterial} disabled={!newMaterialName.trim() || isSaving}>
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Add Material
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            
            <Input
              placeholder="Search materials..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mb-3"
            />
            
            <p className="text-sm text-gray-600">
              {filteredMaterials.length} material{filteredMaterials.length !== 1 ? 's' : ''}
            </p>
          </div>
          
          <div className="flex-1 p-2 space-y-2 overflow-y-auto">
            {filteredMaterials.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p className="text-sm">No materials found</p>
              </div>
            ) : (
              filteredMaterials.map((material) => (
                <Card
                  key={material.name}
                                      className={`group cursor-pointer transition-colors ${
                      selectedMaterial?.name === material.name
                        ? 'border-blue-500 bg-blue-50'
                        : 'hover:border-gray-300'
                    }`}
                  onClick={() => handleMaterialSelect(material)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-sm text-gray-900">{material.name}</h4>
                        <div className="flex items-center space-x-2 mt-1">
                          <div
                            className="w-4 h-4 rounded border border-gray-300"
                            style={{
                              backgroundColor: `rgb(${Math.round(material.baseColor[0] * 255)}, ${Math.round(material.baseColor[1] * 255)}, ${Math.round(material.baseColor[2] * 255)})`
                            }}
                          />
                          <span className="text-xs text-gray-500">
                            M: {material.metallicFactor.toFixed(1)} R: {material.roughnessFactor.toFixed(1)}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteDialog({open:true, name: material.name});
                        }}
                        className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* Center - Simple Cube Preview */}
        <div className="flex-1 p-4 bg-white flex flex-col">
          <div className="h-full rounded-lg overflow-hidden shadow-md bg-[#F8F9FA] flex items-center justify-center relative">
            {selectedMaterial || editedMaterial ? (
              <>
                {/* @ts-ignore - model-viewer custom element */}
                <model-viewer
                  ref={modelViewerRef}
                  src="/Cube.glb"
                  alt="Material preview cube"
                  style={{ width: '100%', height: '100%' }}
                  camera-controls
                  disable-pan
                  shadow-intensity="0"
                  environment-image="https://sweef.charpstar.net/HDR/Sweef-HDR.hdr"
                  exposure="1.2"
                  tone-mapping="neutral"
                />
                
                {/* Material Info Overlay */}
                <div className="absolute top-4 left-4 bg-white bg-opacity-90 rounded-lg p-3 shadow-sm">
                  <h4 className="font-medium text-gray-900 mb-1">
                    {(editedMaterial || selectedMaterial)?.name}
                  </h4>
                  <div className="text-xs text-gray-600 space-y-1">
                    <div>Metallic: {((editedMaterial || selectedMaterial)?.metallicFactor || 0).toFixed(2)}</div>
                    <div>Roughness: {((editedMaterial || selectedMaterial)?.roughnessFactor || 0).toFixed(2)}</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-gray-500 text-center p-8">
                <Palette className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  Material Preview
                </h3>
                <p className="text-gray-500 max-w-md">
                  Select or create a material to see a live preview on this cube.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Material Properties */}
        <div id="material-sidebar" className="w-80 border-l border-gray-200 bg-white flex flex-col">
          {selectedMaterial ? (
            <>
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">{selectedMaterial.name}</h3>
                  {/* Save All moved to header */}
                </div>
                <p className="text-sm text-gray-600 mt-1">Material Properties</p>
              </div>
              
              {editedMaterial && (
                <div className="flex-1 overflow-y-scroll px-4 py-6 space-y-4 scrollbar-hide"
                     style={{ 
                       scrollbarWidth: 'none', 
                       msOverflowStyle: 'none' 
                     }}>

                  <div className="rounded-md bg-neutral-50 p-3 space-y-2 shadow-inner">
                  {/* Group: Base Color */}
                  <div className="rounded-md bg-neutral-100/60 p-2 space-y-2">
                  {/* Base Color */}
                   <div className="space-y-2 pb-3 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">Base Color</span>
                      <DebouncedColorPicker
                        value={`#${Math.round(editedMaterial.baseColor[0] * 255).toString(16).padStart(2, '0')}${Math.round(editedMaterial.baseColor[1] * 255).toString(16).padStart(2, '0')}${Math.round(editedMaterial.baseColor[2] * 255).toString(16).padStart(2, '0')}`}
                        onChange={(hex) => {
                          if (!hex || typeof hex !== 'string' || hex.length < 7) return;
                          try {
                            const r = parseInt(hex.slice(1, 3), 16) / 255;
                            const g = parseInt(hex.slice(3, 5), 16) / 255;
                            const b = parseInt(hex.slice(5, 7), 16) / 255;
                            handleMaterialChange('baseColor', [r, g, b, editedMaterial.baseColor[3]]);
                          } catch {}
                        }}
                      />
                    </div>
                  </div>

                  {/* Base Color Map */}
                   <div className="space-y-2 pb-3 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">Base Color Map</span>
                      <MapSlot
                        texture={editedMaterial.baseColorTexture}
                        alt="base color"
                        onPick={()=>setTexturePicker({open:true, slot:'baseColorTexture', search:''})}
                        onRemove={()=>handleMaterialChange('baseColorTexture', undefined)}
                      />
                    </div>
                  </div>
                  </div>

                {/* Group: Roughness & Metalness */}
                <div className="rounded-md bg-neutral-100/60 p-2 space-y-2">
                {/* Roughness */}
                 <div className="space-y-2 pb-3 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">Roughness</span>
                    <span className="text-sm text-gray-600">{Math.round(editedMaterial.roughnessFactor * 100)}%</span>
                  </div>
                    <SliderWithInput 
                    className="w-full"
                    sliderWidth="w-full"
                    showValue={false}
                    value={editedMaterial.roughnessFactor} 
                      onChange={(v)=>handleMaterialChange('roughnessFactor', v)} 
                    min={0} max={1} step={0.01} 
                  />
                </div>

                  {/* Roughness Map */}
                   <div className="space-y-2 pb-3 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">Roughness Map</span>
                      <MapSlot
                        texture={editedMaterial.metallicRoughnessTexture}
                        alt="roughness map"
                        onPick={()=>setTexturePicker({open:true, slot:'metallicRoughnessTexture', search:''})}
                        onRemove={()=>handleMaterialChange('metallicRoughnessTexture', undefined)}
                      />
                    </div>
                  </div>

                {/* Metalness */}
                 <div className="space-y-2 pb-3 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">Metalness</span>
                    <span className="text-sm text-gray-600">{Math.round(editedMaterial.metallicFactor * 100)}%</span>
                  </div>
                    <SliderWithInput 
                    className="w-full"
                    sliderWidth="w-full"
                    showValue={false}
                    value={editedMaterial.metallicFactor} 
                      onChange={(v)=>handleMaterialChange('metallicFactor', v)} 
                    min={0} max={1} step={0.01} 
                  />
                </div>

                  {/* Metallic Map */}
                   <div className="space-y-2 pb-3 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">Metallic Map</span>
                      <MapSlot
                        texture={editedMaterial.metallicRoughnessTexture}
                        alt="metallic map"
                        onPick={()=>setTexturePicker({open:true, slot:'metallicRoughnessTexture', search:''})}
                        onRemove={()=>handleMaterialChange('metallicRoughnessTexture', undefined)}
                      />
                    </div>
                  </div>
                  </div>

                  {/* Group: Occlusion & Normal */}
                  <div className="rounded-md bg-neutral-100/60 p-2 space-y-2">
                  {/* Occlusion Strength */}
                         <div className="space-y-2 pb-3 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">Occlusion Strength</span>
                      <span className="text-sm text-gray-600">{Math.round(editedMaterial.occlusionStrength * 100)}%</span>
                    </div>
                      <SliderWithInput 
                      className="w-full"
                      sliderWidth="w-full"
                      showValue={false}
                      value={editedMaterial.occlusionStrength} 
                        onChange={(v)=>handleMaterialChange('occlusionStrength', v)} 
                      min={0} max={1} step={0.01} 
                    />
                  </div>

                  {/* Normal factor */}
                         <div className="space-y-2 pb-3 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">Normal factor</span>
                      <span className="text-sm text-gray-600">{Math.round(editedMaterial.normalScale * 100)}%</span>
                    </div>
                      <SliderWithInput 
                      className="w-full"
                      sliderWidth="w-full"
                      showValue={false}
                      value={editedMaterial.normalScale} 
                        onChange={(v)=>handleMaterialChange('normalScale', v)} 
                      min={0} max={2} step={0.01} 
                    />
                  </div>

                  {/* Normal Map (texture) */}
                   <div className="space-y-2 pb-3 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">Normal Map</span>
                      <MapSlot
                        texture={editedMaterial.normalTexture}
                        alt="normal map"
                        onPick={()=>setTexturePicker({open:true, slot:'normalTexture', search:''})}
                        onRemove={()=>handleMaterialChange('normalTexture', undefined)}
                      />
                    </div>
                  </div>
                  </div>
                  </div>

                  {/* Advanced options */}
                  <div className="space-y-2">
                    <div 
                      className="flex items-center justify-between cursor-pointer py-2"
                      onClick={()=>setShowAdvanced(v=>!v)}
                    >
                      <span className="text-sm font-medium text-gray-900">Advanced options</span>
                      <svg className={`w-4 h-4 text-gray-400 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                    
                    {showAdvanced && (
                      <div className="space-y-4 rounded-md bg-neutral-50 p-3 shadow-inner">
                        
                        {/* Opacity (moved to Advanced) */}
                   <div className="space-y-2 pb-3 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">Opacity</span>
                            <span className="text-sm text-gray-600">{Math.round((editedMaterial.baseColor?.[3] ?? 1) * 100)}%</span>
                          </div>
                          <SliderWithInput 
                            className="w-full"
                            sliderWidth="w-full"
                            showValue={false}
                            value={editedMaterial.baseColor?.[3] ?? 1} 
                            onChange={(v)=>{
                              const [r,g,b] = editedMaterial.baseColor;
                              handleMaterialChange('baseColor', [r,g,b, v]);
                            }} 
                            min={0} max={1} step={0.01} 
                          />
                        </div>

                        {/* Sheen Roughness */}
                   <div className="space-y-2 pb-3 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">Sheen Roughness</span>
                            <span className="text-sm text-gray-600">{Math.round((editedMaterial.sheenRoughnessFactor ?? editedMaterial.sheenFactor ?? 0) * 100)}%</span>
                          </div>
                          <SliderWithInput 
                            className="w-full"
                            sliderWidth="w-full"
                            showValue={false}
                            value={editedMaterial.sheenRoughnessFactor ?? editedMaterial.sheenFactor ?? 0} 
                            onChange={(v)=>handleMaterialChange('sheenRoughnessFactor', v)} 
                            min={0} max={1} step={0.01} 
                          />
                        </div>

                        {/* Sheen Roughness Map */}
                        <div className="space-y-2 pb-3 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">Sheen Roughness Map</span>
                            <MapSlot
                              texture={editedMaterial.sheenRoughnessTexture || editedMaterial.sheenTexture}
                              alt="sheen roughness map"
                              onPick={()=>setTexturePicker({open:true, slot:'sheenRoughnessTexture' as any, search:''})}
                              onRemove={()=>handleMaterialChange('sheenRoughnessTexture', undefined)}
                            />
                          </div>
                        </div>

                        {/* Sheen Color */}
                         <div className="space-y-2 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">Sheen Color</span>
                            <DebouncedColorPicker
                              value={`#${Math.round((editedMaterial.sheenColor?.[0] ?? 1) * 255).toString(16).padStart(2, '0')}${Math.round((editedMaterial.sheenColor?.[1] ?? 1) * 255).toString(16).padStart(2, '0')}${Math.round((editedMaterial.sheenColor?.[2] ?? 1) * 255).toString(16).padStart(2, '0')}`}
                              onChange={(hex) => {
                                if (!hex || typeof hex !== 'string' || hex.length < 7) return;
                                try {
                                  const r = parseInt(hex.slice(1, 3), 16) / 255;
                                  const g = parseInt(hex.slice(3, 5), 16) / 255;
                                  const b = parseInt(hex.slice(5, 7), 16) / 255;
                                  handleMaterialChange('sheenColor', [r, g, b]);
                                } catch {}
                              }}
                            />
                          </div>
                        </div>

                        {/* Sheen Color Map */}
                         <div className="space-y-2 pb-3 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">Sheen Color Map</span>
                            <MapSlot
                              texture={editedMaterial.sheenColorTexture}
                              alt="sheen color map"
                              onPick={()=>setTexturePicker({open:true, slot:'sheenColorTexture' as any, search:''})}
                              onRemove={()=>handleMaterialChange('sheenColorTexture', undefined)}
                            />
                          </div>
                        </div>

                      </div>
                    )}
                  </div>

                    {/* Note */}
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <p className="text-xs text-blue-800"><strong>Note:</strong> Texture files should be uploaded to your BunnyCDN images folder first. This interface currently allows you to reference existing textures.</p>
                    </div>
                  
                </div>
              )}


            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <Edit className="w-12 h-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-700 mb-2">
                Select Material
              </h3>
              <p className="text-sm text-gray-500 max-w-xs">
                Choose a material from the sidebar to edit its properties and preview changes in real-time.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Texture Library Picker */}
      {texturePicker.open && referenceGltf && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setTexturePicker({open:false, slot:null, search:''})}>
          <div className="bg-white rounded-lg shadow-lg w-[720px] max-w-[90vw] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Pick a texture</h3>
              <button className="text-gray-500 text-sm" onClick={() => setTexturePicker({open:false, slot:null, search:''})}>Close</button>
            </div>
            <div className="mb-3">
              <Input placeholder="Search textures..." value={texturePicker.search} onChange={(e)=> setTexturePicker(prev=>({...prev, search: e.target.value}))} />
            </div>
            <div className="grid grid-cols-4 gap-3 max-h-[60vh] overflow-auto">
              {referenceGltf.images
                .filter(img => {
                  const q = texturePicker.search.trim().toLowerCase();
                  if (!q) return true;
                  const key = (img.uri || img.name || '').toLowerCase();
                  return key.includes(q);
                })
                .map((img, idx) => {
                  const uri = (img.uri || img.name || `Image_${idx}`);
                  const clean = uri.startsWith('images/') ? uri.substring(7) : uri;
                  const src = `https://cdn.charpstar.net/Client-Editor/${clientName}/images/${clean}`;
                  return (
                    <button key={idx} className="border rounded p-2 hover:border-blue-500 text-left" onClick={() => {
                      if (!texturePicker.slot) return;
                      handleMaterialChange(texturePicker.slot, clean);
                      setTexturePicker({open:false, slot:null, search:''});
                    }}>
                      {/* Use plain img to avoid Next Image domain config */}
                      <img src={src} alt={clean} className="w-full h-24 object-cover rounded mb-2" />
                      <div className="text-xs truncate">{clean}</div>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Delete material confirm */}
      {deleteDialog && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setDeleteDialog(null)}>
          <div className="bg-white rounded-lg shadow-lg w-96 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Material</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete <strong>"{deleteDialog.name}"</strong>?
              This will remove the material from the staged list. Click Save All to persist the change.
            </p>
            <div className="flex justify-end space-x-3">
              <Button variant="outline" onClick={() => setDeleteDialog(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => {
                deleteMaterial(deleteDialog.name);
                setDeleteDialog(null);
              }}>
                Delete Material
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`px-4 py-2 rounded-lg shadow-lg text-white ${
                toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

