'use client';

import { useParams } from 'next/navigation';
import { clients, isValidClient } from '@/config/clientConfig';
import { useState, useRef, useEffect } from 'react';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, RefreshCw, FolderOpen, Eye, Palette } from 'lucide-react';
import Header from '@/components/layout/Header';
import ModelViewer from '@/components/ModelViewer';
import VariantSelector from '@/components/demo/VariantSelector';
import CompactModelStats from '@/components/demo/ModelStats';
import CameraControlsPanel from '@/components/demo/CameraControlsPanel';

import DeleteModelDialog from '@/components/DeleteModelDialog';
import { Search, X } from 'lucide-react';
import SimpleUploadDialog from '@/components/SimpleUploadDialog';

// Force a render on the <model-viewer> element by nudging a numeric property
function forceModelViewerRender(modelViewerEl: any) {
  try {
    if (typeof modelViewerEl.requestUpdate === 'function') {
      modelViewerEl.requestUpdate();
    }
    const original = Number(modelViewerEl.exposure ?? 1.0);
    const epsilon = 1e-6;
    const next = original + epsilon;
    modelViewerEl.exposure = next;
    requestAnimationFrame(() => {
      try { modelViewerEl.exposure = original; } catch {}
    });
  } catch {}
}

interface ModelFile {
  filename: string;
  size: number;
  lastModified: string;
}

export default function ManageModelsPage() {
  const params = useParams();
  const clientName = params.client as string;
  
  // Validate client
  if (!isValidClient(clientName)) {
    notFound();
  }

  const clientConfig = clients[clientName];
  
  // State management  
  const [existingModels, setExistingModels] = useState<ModelFile[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [deletingFiles, setDeletingFiles] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteDialog, setDeleteDialog] = useState<{isOpen: boolean, modelName: string} | null>(null);

  // Model viewing state (from demo page)
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [currentModelUrl, setCurrentModelUrl] = useState<string | null>(null);
  const [modelLoadError, setModelLoadError] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const modelViewerRef = useRef<any>(null);
  const [sceneMeshNames, setSceneMeshNames] = useState<string[]>([]);
  const [meshVisibility, setMeshVisibility] = useState<Record<string, boolean>>({});

  // Upload dialog state
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);

  // Model viewing functions (from demo page)
  const getModelUrl = (filename: string) => {
    const base = clientConfig.bunnyCdn.publicBaseUrl.replace(/\/$/, '');
    const modelRoot = clientConfig.bunnyCdn.modelPath.replace(/\/$/, '');
    return `${base}/${modelRoot}/${filename}`;
  };

  // Load existing models - SIMPLE function, no unnecessary useCallback
  const loadExistingModels = async (autoSelectFirst = false) => {
    setIsLoadingModels(true);
    try {
      const response = await fetch(`/api/list-models?client=${clientName}`);
      if (response.ok) {
        const data = await response.json();
        const models = data.models || [];
        setExistingModels(models);
        
        // Auto-select first model on initial load
        if (autoSelectFirst && models.length > 0) {
          const firstModel = models[0].filename;
          setSelectedModel(firstModel);
          setCurrentModelUrl(getModelUrl(firstModel));
          setModelLoadError(false);
        }
      } else {
        console.error('Failed to load existing models');
        setExistingModels([]);
      }
    } catch (error) {
      console.error('Error loading existing models:', error);
      setExistingModels([]);
    } finally {
      setIsLoadingModels(false);
    }
  };

  // Load models on component mount with auto-select - SIMPLE useEffect
  useEffect(() => {
    const tryRestore = () => {
      try {
        const key = `charpstar:lastSelectedModel:${clientName}`;
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw) as { filename?: string } | null;
          const filename = parsed?.filename;
          if (filename) {
            setSelectedModel(filename);
            setCurrentModelUrl(getModelUrl(filename));
            setModelLoadError(false);
            return true;
          }
        }
      } catch {}
      return false;
    };
    const restored = tryRestore();
    loadExistingModels(!restored);
  }, []);

  // Show delete confirmation dialog
  const showDeleteDialog = (filename: string) => {
    setDeleteDialog({ isOpen: true, modelName: filename });
  };

  // Delete existing model
  const handleDeleteModel = async () => {
    if (!deleteDialog) return;
    
    const filename = deleteDialog.modelName;
    setDeletingFiles(prev => new Set([...prev, filename]));

    try {
      const response = await fetch('/api/delete-model', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename,
          client: clientName,
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Delete failed');
      }

      // Refresh the models list
      await loadExistingModels();
    } catch (error) {
      console.error('Error deleting model:', error);
      throw error; // Re-throw to be handled by the dialog
    } finally {
      setDeletingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(filename);
        return newSet;
      });
    }
  };

  // SIMPLE function - no useCallback needed
  const handleSelectModel = (filename: string) => {
    // Don't reload if the same model is already selected
    if (selectedModel === filename) {
      return;
    }
    
    setSelectedModel(filename);
    setCurrentModelUrl(getModelUrl(filename));
    setModelLoadError(false);
    setIsModelLoading(true);
    try {
      const key = `charpstar:lastSelectedModel:${clientName}`;
      localStorage.setItem(key, JSON.stringify({ filename }));
    } catch {}
  };

  // SIMPLE function - no useCallback needed  
  const handleModelLoaded = () => {
    setIsModelLoading(false);
    // Capture the initialized model-viewer reference
    if (window.modelViewerElement) {
      modelViewerRef.current = window.modelViewerElement;
    }
    try {
      const mv = modelViewerRef.current as any;
      if (!mv) return;
      // Helper to apply current visibility map to all meshes
      const applyVisibility = (visibilityMap: Record<string, boolean>) => {
        try {
          // Ensure accessors are present
          const sceneSymbol = Object.getOwnPropertySymbols(mv).find((s: any) => {
            try { const v: any = (mv as any)[s as any]; return v && (v.model || v.scene); } catch { return false; }
          });
          const container: any = sceneSymbol ? (mv as any)[sceneSymbol as any] : null;
          const root = container?.scene || container?.model;
          if (!root) return;
          root.traverse((obj: any) => {
            if (!obj?.isMesh) return;
            const nm = typeof obj.name === 'string' && obj.name.length > 0 ? obj.name : '(unnamed)';
            const shouldBeVisible = visibilityMap[nm] !== false; // default true
            if (obj.visible !== shouldBeVisible) {
              obj.visible = shouldBeVisible;
            }
          });
          try { const sc = typeof mv.getScene === 'function' ? mv.getScene() : null; if (sc) sc.isDirty = true; } catch {}
          mv.requestRender?.();
          forceModelViewerRender(mv);
        } catch {}
      };
      const collect = () => {
        try {
          // access three scene via initializer side effect
          const sym = Object.getOwnPropertySymbols(mv).find((s: any) => {
            try { return (mv as any)[s]?.scene || (mv as any)[s]?.model; } catch { return false; }
          });
          const container: any = sym ? (mv as any)[sym as any] : null;
          const root = container?.scene || container?.model;
          if (!root) return;
          const names: string[] = [];
          root.traverse((obj: any) => { if (obj?.isMesh) names.push(obj.name || '(unnamed)'); });
          const unique = Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
          setSceneMeshNames(unique);
          // Initialize or merge visibility map; default only one visible per numeric-suffix group
          setMeshVisibility(prev => {
            const disabledCfg = clientConfig.defaultDisabledMeshes;
            const groups: Record<string, string[]> = {};
            const groupKey = (nm: string) => {
              const m = nm.match(/^(.*)_\d+(?:mm|cm|m)?$/i);
              return m ? m[1] : nm;
            };
            unique.forEach(nm => {
              const key = groupKey(nm);
              if (!groups[key]) groups[key] = [];
              groups[key].push(nm);
            });
            const next: Record<string, boolean> = {};
            Object.entries(groups).forEach(([_, group]) => {
              const sorted = [...group].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
              const defaultVisible = sorted[0];
              group.forEach(nm => {
                if (prev.hasOwnProperty(nm)) { next[nm] = prev[nm]; return; }
                if (disabledCfg && disabledCfg.patterns.some(p => nm.startsWith(p))) {
                  next[nm] = disabledCfg.except.includes(nm);
                } else {
                  next[nm] = nm === defaultVisible;
                }
              });
            });
            // Apply immediately
            applyVisibility(next);
            return next;
          });
        } catch {}
      };
      mv.addEventListener?.('load', collect);
      if (mv.loaded) collect();
    } catch {}
  };

  // SIMPLE functions - no useCallback needed
  const handleModelError = () => {
    setModelLoadError(true);
    setIsModelLoading(false);
  };

  const openUploadDialog = () => {
    setIsUploadDialogOpen(true);
  };

  const closeUploadDialog = () => {
    setIsUploadDialogOpen(false);
  };

  // PRECOMPUTE display names once to avoid regex on every render
  const modelsWithDisplayNames = existingModels.map(model => ({
    ...model,
    displayName: model.filename.replace(/\.(gltf|glb)$/i, '')
  }));

  // SIMPLE filtering with precomputed display names
  let displayModels = modelsWithDisplayNames;
  
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    displayModels = modelsWithDisplayNames.filter(model => 
      model.displayName.toLowerCase().includes(query)
    );
  }

  // SIMPLE grouping by display name
  const groupedModels: Record<string, typeof displayModels> = {};
  displayModels.forEach(model => {
    const firstLetter = model.displayName[0]?.toUpperCase() || '#';
    const key = /[A-Z]/.test(firstLetter) ? firstLetter : '#';
    if (!groupedModels[key]) {
      groupedModels[key] = [];
    }
    groupedModels[key].push(model);
  });

  const sortedGroups = Object.keys(groupedModels).sort().map(key => ({
    letter: key,
    models: groupedModels[key].sort((a, b) => a.displayName.localeCompare(b.displayName))
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Delete Confirmation Dialog */}
      {deleteDialog && (
        <DeleteModelDialog
          isOpen={deleteDialog.isOpen}
          onClose={() => setDeleteDialog(null)}
          onConfirm={handleDeleteModel}
          modelName={deleteDialog.modelName}
          isDeleting={deletingFiles.has(deleteDialog.modelName)}
        />
      )}

      {/* Header */}
      <Header 
        onRefreshModels={() => loadExistingModels(false)} 
        onUploadModels={openUploadDialog}
      />
      
      <div className="flex h-[calc(100vh-56px)]">
        {/* Left Sidebar - Existing Models */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200 flex-shrink-0">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center mb-3">
              <FolderOpen className="w-5 h-5 mr-2" />
              Existing Models
            </h2>
            
            {/* SIMPLE Search Bar - plain HTML input */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 h-9 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            
            <p className="text-sm text-gray-600">
              {searchQuery 
                ? `${displayModels.length} of ${existingModels.length} models`
                : `${existingModels.length} models in base folder`
              }
            </p>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {isLoadingModels ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                <span className="ml-2 text-gray-500">Loading models...</span>
              </div>
            ) : displayModels.length === 0 ? (
              <div className="text-center py-8 text-gray-500 px-4">
                {searchQuery ? (
                  <>
                    <p className="text-sm">No models match "{searchQuery}"</p>
                    <p className="text-xs text-gray-400">Try a different search term</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm">No models found</p>
                    <p className="text-xs text-gray-400">Upload your first model to get started</p>
                  </>
                )}
              </div>
            ) : (
              <div className="p-2">
                {sortedGroups.map(({ letter, models }) => (
                  <div key={letter} className="mb-4">
                    {/* Group Header */}
                    <div className="sticky top-0 bg-white/95 backdrop-blur-sm px-2 py-1 mb-2 border-b border-gray-100">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {letter} ({models.length})
                      </h3>
                    </div>
                    
                    {/* Models in Group */}
                    <div className="space-y-1">
                      {models.map((model) => (
                          <div 
                            key={model.filename}
                            className={`flex items-center justify-between p-2 rounded-md border transition-colors group ${
                              selectedModel === model.filename
                                ? 'bg-blue-50 border-blue-200 shadow-sm cursor-default'
                                : 'bg-gray-50 border-gray-200 hover:border-gray-300 cursor-pointer'
                            }`}
                            onClick={() => handleSelectModel(model.filename)}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center">
                                <p className={`text-sm font-medium truncate ${
                                  selectedModel === model.filename ? 'text-blue-900' : 'text-gray-900'
                                }`} title={model.filename}>
                                  {model.displayName}
                                </p>
                              {selectedModel === model.filename && (
                                <Eye className="w-3 h-3 ml-2 text-blue-600 flex-shrink-0" />
                              )}
                            </div>
                            <p className="text-xs text-gray-400">
                              {new Date(model.lastModified).toLocaleDateString()}
                            </p>
                          </div>
                          
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              showDeleteDialog(model.filename);
                            }}
                            disabled={deletingFiles.has(model.filename)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-red-600 hover:text-red-800 hover:bg-red-50 h-7 w-7 p-0 cursor-pointer hover:scale-110 transition-all duration-200"
                          >
                            {deletingFiles.has(model.filename) ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center - 3D Viewer */}
        <div className="flex-1 p-4 bg-white flex flex-col">
          <div className="h-full rounded-lg overflow-hidden shadow-md bg-[#F8F9FA] flex items-center justify-center relative">
            {selectedModel ? (
              <>
                <ModelViewer 
                  clientModelUrl={currentModelUrl}
                  onModelLoaded={handleModelLoaded}
                />

                {/* Loading indicator (skeleton overlay) */}
                {/* Remove custom progress indicator; rely on model-viewer's built-in progress bar */}
                
                {/* Compact Stats Panel positioned in the top-right corner of the viewer */}
                {!modelLoadError && !isModelLoading && (
                  <CompactModelStats
                    modelViewerRef={modelViewerRef}
                    modelName={selectedModel.replace(/\.(gltf|glb)$/i, '')}
                  />
                )}
                
                {/* Camera Controls Panel positioned at the bottom of the viewer */}
                {!modelLoadError && !isModelLoading && (
                  <CameraControlsPanel
                    modelViewerRef={modelViewerRef}
                  />
                )}

                {sceneMeshNames.length > 0 && (
                  <div className="absolute bottom-4 right-4 bg-white rounded-lg border border-gray-200 shadow-lg w-80 max-h-56 overflow-auto">
                    <div className="px-3 pt-2 pb-2 border-b border-gray-100 flex items-center justify-between">
                      <div className="text-sm font-semibold text-gray-900">Scene Meshes</div>
                      <div className="text-xs text-gray-500">{sceneMeshNames.length}</div>
                    </div>
                    <div className="px-3 py-2 text-xs text-gray-800 space-y-1">
                      {sceneMeshNames.map((nm) => (
                        <label key={nm} className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            className="cursor-pointer"
                            checked={meshVisibility[nm] !== false}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setMeshVisibility(prev => {
                                const next = { ...prev, [nm]: checked } as Record<string, boolean>;
                                // Apply immediately to the scene
                                try {
                                  const mv = modelViewerRef.current as any;
                                  if (mv) {
                                    const sceneSymbol = Object.getOwnPropertySymbols(mv).find((s: any) => {
                                      try { const v: any = (mv as any)[s as any]; return v && (v.model || v.scene); } catch { return false; }
                                    });
                                    const container: any = sceneSymbol ? (mv as any)[sceneSymbol as any] : null;
                                    const root = container?.scene || container?.model;
                                    if (root) {
                                      root.traverse((obj: any) => {
                                        if (!obj?.isMesh) return;
                                        const name = typeof obj.name === 'string' && obj.name.length > 0 ? obj.name : '(unnamed)';
                                        const visible = next[name] !== false;
                                        if (obj.visible !== visible) obj.visible = visible;
                                      });
                                  try { const sc = typeof mv.getScene === 'function' ? mv.getScene() : null; if (sc) sc.isDirty = true; } catch {}
                                  mv.requestRender?.();
                                  forceModelViewerRender(mv);
                                    }
                                  }
                                } catch {}
                                return next;
                              });
                            }}
                          />
                          <span className="truncate" title={nm}>{nm}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                
                {modelLoadError && (
                  <div className="absolute inset-0 bg-gray-100 bg-opacity-80 flex flex-col items-center justify-center">
                    <div className="text-red-500 mb-2">Error loading model</div>
                    <div className="text-gray-600 text-sm mb-4">
                      The model might not be available or corrupted
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setModelLoadError(false)}
                      className="flex items-center"
                    >
                      <RefreshCw size={14} className="mr-2" />
                      Try Again
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-gray-500 text-center p-8">
                <Eye className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  Select a Model to Preview
                </h3>
                <p className="text-gray-500 max-w-md">
                  Choose any model from the sidebar to view it in 3D, check statistics, and explore material variants.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Variants */}
        <div className="w-80 border-l border-gray-200 bg-white flex flex-col">
          {selectedModel ? (
            /* Model selected - Show variant selector */
            <>
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center space-x-2">
                  <Palette size={16} className="text-gray-600" />
                  <h3 className="text-sm font-medium text-gray-800">Material Variants</h3>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {modelsWithDisplayNames.find(m => m.filename === selectedModel)?.displayName || selectedModel}
                </p>
              </div>
              
              <div className="flex-1 p-4 overflow-y-auto">
                {!modelLoadError ? (
                  <VariantSelector 
                    modelViewerRef={modelViewerRef}
                    modelName={selectedModel}
                    enableSecondary={clientName === 'Sweef'}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <Palette size={32} className="text-gray-300 mb-3" />
                    <p className="text-sm text-gray-400">
                      Cannot load variants
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Model failed to load
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* No model selected - Empty state */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <Palette size={48} className="text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-700 mb-2">
                Material Variants
              </h3>
              <p className="text-sm text-gray-500 max-w-xs">
                Select a model from the sidebar to explore its material variants and customization options.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Simple Upload Dialog */}
      <SimpleUploadDialog
        isOpen={isUploadDialogOpen}
        onClose={closeUploadDialog}
        clientName={clientName}
        onSuccess={() => loadExistingModels(false)}
      />
    </div>
  );
}