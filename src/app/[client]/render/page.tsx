'use client';

import { useParams } from 'next/navigation';
import { clients, isValidClient } from '@/config/clientConfig';
import { useState, useRef, useEffect } from 'react';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, FolderOpen, Eye, Palette } from 'lucide-react';
import Header from '@/components/layout/Header';
import ModelViewer from '@/components/ModelViewer';
import ModularViewer from '@/components/ModularViewer';
import RenderVariantSelector from '@/components/render/RenderVariantSelector';
import RenderOptionsPanel from '@/components/render/RenderOptionsPanel';
import CollapsibleRenderQueue from '@/components/render/CollapsibleRenderQueue';
import { Search, X } from 'lucide-react';

interface ModelFile {
  filename: string;
  size: number;
  lastModified: string;
}

export default function RenderPage() {
  const params = useParams();
  const clientName = (params?.client as string) || '';
  
  if (!isValidClient(clientName)) {
    return notFound();
  }

  const clientConfig = clients[clientName as keyof typeof clients];
  
  // State
  const [existingModels, setExistingModels] = useState<ModelFile[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [currentModelUrl, setCurrentModelUrl] = useState<string | null>(null);
  const [modelLoadError, setModelLoadError] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState<string[]>([]);
  const modelViewerRef = useRef<any>(null);
  const [isHeaderDownloading, setIsHeaderDownloading] = useState(false);
  
  // Modular configurator state
  const [activeTab, setActiveTab] = useState<'models' | 'modular'>('models');
  const [modularConfig, setModularConfig] = useState<'mammuten' | 'hajen' | 'kamelen' | 'dromedaren' | 'bjornen' | 'mammuten-hfc' | null>(null);
  const [modularViewerReady, setModularViewerReady] = useState(false);
  const modularViewerRef = useRef<any>(null);

  // Get model URL
  const getModelUrl = (filename: string) => {
    const base = clientConfig.bunnyCdn.publicBaseUrl.replace(/\/$/, '');
    const modelRoot = clientConfig.bunnyCdn.modelPath.replace(/\/$/, '');
    return `${base}/${modelRoot}/${filename}`;
  };

  // Load existing models
  const loadExistingModels = async (autoSelectFirst = false) => {
    setIsLoadingModels(true);
    try {
      const response = await fetch(`/api/list-models?client=${clientName}`);
      if (response.ok) {
        const data = await response.json();
        const models = data.models || [];
        setExistingModels(models);
        
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

  // Load models on mount
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

  // Handle model selection
  const handleSelectModel = (filename: string) => {
    if (selectedModel === filename) return;
    
    setSelectedModel(filename);
    setCurrentModelUrl(getModelUrl(filename));
    setModelLoadError(false);
    setIsModelLoading(true);
    setSelectedVariants([]); // Clear variant selections when model changes
    try {
      const key = `charpstar:lastSelectedModel:${clientName}`;
      localStorage.setItem(key, JSON.stringify({ filename }));
    } catch {}
  };

  // Handle model loaded
  const handleModelLoaded = () => {
    setIsModelLoading(false);
    if (window.modelViewerElement) {
      modelViewerRef.current = window.modelViewerElement;
    }
  };

  // Header GLB export (client-side snapshot of current viewer)
  const handleHeaderDownloadGlb = async () => {
    const viewer: any = modelViewerRef?.current;
    if (!viewer || typeof viewer.exportScene !== 'function') {
      alert('Export not available: model-viewer exportScene() missing.');
      return;
    }
    try {
      setIsHeaderDownloading(true);
      const blob: Blob = await viewer.exportScene({ binary: true, onlyVisible: true, includeCustomExtensions: true });
      const base = selectedModel ? selectedModel.replace(/\.(gltf|glb)$/i, '') : 'model';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${base}-export.glb`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Header export failed:', e);
      alert('Failed to export GLB from viewer.');
    } finally {
      setIsHeaderDownloading(false);
    }
  };

  // Filter and group models
  const modelsWithDisplayNames = existingModels.map((m) => ({
    ...m,
    displayName: m.filename.replace(/\.(gltf|glb)$/i, ''),
  }));

  const displayModels = searchQuery
    ? modelsWithDisplayNames.filter((m) =>
        m.displayName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : modelsWithDisplayNames;

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

  // Modular configurator config mapping
  const modularConfigData = {
    'mammuten': {
      src: 'MAM',
      parts: ['MAM-1', 'MAM-15', 'MAM-C45', 'MAM-C90', 'MAM-AL', 'MAM-AR', 'MAM-CHL15', 'MAM-FOOT', 'MAM-DIV15', 'MAM-ENDR', 'MAM-ENDL']
    },
    'hajen': {
      src: 'HAJ',
      parts: ['HAJ-1', 'HAJ-15', 'HAJ-E1', 'HAJ-1E', 'HAJ-15C', 'HAJ-C15', 'HAJ-FOOT', 'HAJ-ENDR', 'HAJ-ENDL']
    },
    'kamelen': {
      src: 'KAM',
      parts: ['KAM-AL-15', 'KAM-15', 'KAM-1', 'KAM-FOOT', 'KAM-15-AR', 'KAM-FOOT1', 'KAM-C90']
    },
    'dromedaren': {
      src: 'DRO',
      parts: ['DRO-2', 'DRO-3', 'DRO-4', 'DRO-5', 'DRO-AL', 'DRO-AR', 'DRO-C', 'DRO-P2X2', 'DRO-P2X3']
    },
    'bjornen': {
      src: 'BJO',
      parts: [
        'BJO_M-2',
        'BJO_M-3',
        'BJO_M-FOOT',
        'BJO_M-15',
        'BJO_M-DIV',
        'BJO_M-ARM_S',
        'BJO_M-COV',
        'BJO_M-CHL',
        'BJO_M-ARM_H-BLA',
        'BJO_M-ARM_H-WAL',
        'BJO_M-ARM_H-WOO',
      ],
    },
    'mammuten-hfc': {
      src: 'MAM-HFC',
      parts: ['MAM_HFC-15', 'MAM_HFC-1', 'MAM_HFC-C90', 'MAM-C1-HFC', 'MAM_HFC-AL', 'MAM_HFC-AR', 'MAM_HFC-CHL']
    }
  };

  // Modular configurator handlers
  const handleSelectModularConfig = (config: 'mammuten' | 'hajen' | 'kamelen' | 'dromedaren' | 'bjornen' | 'mammuten-hfc') => {
    setModularConfig(config);
    setSelectedModel(null); // Clear regular model
    setCurrentModelUrl(null);
    setModularViewerReady(false);
    setSelectedVariants([]); // Clear variant selections when switching configs
  };

  const handleAddModularPart = (partCode: string) => {
    const viewer = modularViewerRef.current;
    if (viewer && typeof viewer.addModularModel === 'function') {
      viewer.addModularModel(partCode);
    } else {
      console.warn('Modular viewer not ready or addModularModel method not available');
    }
  };

  // Handle tab switching - clear viewer state
  const handleTabChange = (tab: 'models' | 'modular') => {
    setActiveTab(tab);
    if (tab === 'models') {
      setModularConfig(null);
      setModularViewerReady(false);
    } else {
      setSelectedModel(null);
      setCurrentModelUrl(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header 
        modelViewerRef={modelViewerRef}
        titlePrefix="Rendering"
        onExportGLB={handleHeaderDownloadGlb}
        isSaving={isHeaderDownloading}
      />
      
      <div className="flex h-[calc(100vh-56px)]">
        {/* Left Sidebar - Model Selection with Tabs */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
          {/* Tab Navigation */}
          <div className="border-b border-gray-200">
            <div className="flex">
              <button 
                onClick={() => handleTabChange('models')}
                className={`${clientConfig.features?.modularConfigurator ? 'flex-1' : 'w-full'} px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'models' 
                    ? 'border-b-2 border-black text-black bg-gray-50' 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                Models
              </button>
              {clientConfig.features?.modularConfigurator && (
                <button 
                  onClick={() => handleTabChange('modular')}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'modular' 
                      ? 'border-b-2 border-black text-black bg-gray-50' 
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Modular Config
                </button>
              )}
            </div>
          </div>

          {/* Models Tab Content */}
          {activeTab === 'models' && (
            <>
              <div className="p-4 border-b border-gray-200 flex-shrink-0">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center mb-3">
                  <FolderOpen className="w-5 h-5 mr-2" />
                  Select Model
                </h2>
                
                <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 h-9 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
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
                : `${existingModels.length} models`
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
                    <p className="text-xs text-gray-400">Upload models to get started</p>
                  </>
                )}
              </div>
            ) : (
              <div className="p-2">
                {sortedGroups.map(({ letter, models }) => (
                  <div key={letter} className="mb-4">
                    <div className="sticky top-0 bg-white/95 backdrop-blur-sm px-2 py-1 mb-2 border-b border-gray-100">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {letter} ({models.length})
                      </h3>
                    </div>
                    
                    <div className="space-y-1">
                      {models.map((model) => (
                        <div 
                          key={model.filename}
                          className={`flex items-center justify-between p-2 rounded-md border transition-colors cursor-pointer ${
                            selectedModel === model.filename
                              ? 'bg-black text-white border-black shadow-sm'
                              : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                          }`}
                          onClick={() => handleSelectModel(model.filename)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center">
                              <p className={`text-sm font-medium truncate ${
                                selectedModel === model.filename ? 'text-white' : 'text-gray-900'
                              }`} title={model.filename}>
                                {model.displayName}
                              </p>
                              {selectedModel === model.filename && (
                                <Eye className="w-3 h-3 ml-2 text-white flex-shrink-0" />
                              )}
                            </div>
                            <p className={`text-xs ${
                              selectedModel === model.filename ? 'text-gray-300' : 'text-gray-400'
                            }`}>
                              {new Date(model.lastModified).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          </>
          )}

          {/* Modular Config Tab Content */}
          {activeTab === 'modular' && clientConfig.features?.modularConfigurator && (
            <>
              <div className="p-4 border-b border-gray-200 flex-shrink-0">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center mb-3">
                  <Palette className="w-5 h-5 mr-2" />
                  Modular Configurators
                </h2>
              </div>

              <div className="flex-1 overflow-auto">
                <div className="p-4 space-y-2">
                  <button
                    onClick={() => handleSelectModularConfig('mammuten')}
                    className={`w-full px-4 py-3 text-left rounded-md border transition-colors ${
                      modularConfig === 'mammuten'
                        ? 'bg-black text-white border-black shadow-sm'
                        : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium">Mammuten</div>
                  </button>
                  
                  <button
                    onClick={() => handleSelectModularConfig('hajen')}
                    className={`w-full px-4 py-3 text-left rounded-md border transition-colors ${
                      modularConfig === 'hajen'
                        ? 'bg-black text-white border-black shadow-sm'
                        : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium">Hajen</div>
                  </button>
                  
                  <button
                    onClick={() => handleSelectModularConfig('kamelen')}
                    className={`w-full px-4 py-3 text-left rounded-md border transition-colors ${
                      modularConfig === 'kamelen'
                        ? 'bg-black text-white border-black shadow-sm'
                        : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium">Kamelen</div>
                  </button>
                  
                  <button
                    onClick={() => handleSelectModularConfig('dromedaren')}
                    className={`w-full px-4 py-3 text-left rounded-md border transition-colors ${
                      modularConfig === 'dromedaren'
                        ? 'bg-black text-white border-black shadow-sm'
                        : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium">Dromedaren</div>
                  </button>
                  
                  <button
                    onClick={() => handleSelectModularConfig('bjornen')}
                    className={`w-full px-4 py-3 text-left rounded-md border transition-colors ${
                      modularConfig === 'bjornen'
                        ? 'bg-black text-white border-black shadow-sm'
                        : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium">Bjornen</div>
                  </button>
                  
                  <button
                    onClick={() => handleSelectModularConfig('mammuten-hfc')}
                    className={`w-full px-4 py-3 text-left rounded-md border transition-colors ${
                      modularConfig === 'mammuten-hfc'
                        ? 'bg-black text-white border-black shadow-sm'
                        : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium">Mammuten HFC</div>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Center - 3D Viewer (60%) and Render Panel (40%) */}
        <div className="flex-1 flex flex-col">
          {/* 3D Viewer - 60% height - NO PADDING */}
          <div className="h-[60%] bg-white border-b border-gray-200">
            <div className="h-full bg-[#F8F9FA] flex items-center justify-center relative">
              {/* Regular Model Viewer */}
              {activeTab === 'models' && selectedModel && (
                <>
                  <ModelViewer 
                    clientModelUrl={currentModelUrl}
                    onModelLoaded={handleModelLoaded}
                  />

                  {isModelLoading && (
                    <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center">
                      <div className="text-center">
                        <Loader2 className="w-8 h-8 text-black animate-spin mx-auto mb-2" />
                        <div className="text-sm text-gray-600">Loading model...</div>
                      </div>
                    </div>
                  )}
                  
                  {modelLoadError && (
                    <div className="absolute inset-0 bg-gray-100 bg-opacity-80 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-red-500 mb-2">Error loading model</div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setModelLoadError(false)}
                        >
                          Try Again
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Modular Viewer */}
              {activeTab === 'modular' && modularConfig && modularConfigData[modularConfig] && (
                <>
                  <ModularViewer 
                    key={modularConfig} // Force remount when config changes
                    src={modularConfigData[modularConfig].src}
                    onViewerReady={(viewer) => {
                      modularViewerRef.current = viewer;
                      setModularViewerReady(true);
                    }}
                  />

                  {/* Modular Part Buttons */}
                  {modularViewerReady && (
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-10 max-h-[80%] overflow-y-auto">
                      {modularConfigData[modularConfig].parts.map(part => (
                        <button
                          key={part}
                          onClick={() => handleAddModularPart(part)}
                          className="px-3 py-2 bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-50 hover:border-gray-400 text-xs font-medium transition-colors whitespace-nowrap"
                          title={`Add ${part}`}
                        >
                          {part}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Empty State */}
              {((activeTab === 'models' && !selectedModel) || (activeTab === 'modular' && !modularConfig)) && (
                <div className="text-gray-400 text-center">
                  <Eye className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <h3 className="text-lg font-medium text-gray-700 mb-2">
                    {activeTab === 'models' ? 'Select a Model' : 'Select a Configuration'}
                  </h3>
                  <p className="text-sm text-gray-500 max-w-xs">
                    {activeTab === 'models' 
                      ? 'Choose a model from the sidebar to preview and configure render settings'
                      : 'Choose a modular configuration from the sidebar to start building'
                    }
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Render Panel - 40% height */}
          <div className="h-[40%] bg-gray-50">
            <RenderOptionsPanel
              modelViewerRef={modelViewerRef}
              modelFilename={selectedModel}
              selectedVariants={selectedVariants}
              isModularMode={activeTab === 'modular'}
              modularViewerRef={modularViewerRef}
              modularConfig={modularConfig}
            />
          </div>
        </div>

        {/* Right Panel - Variant Selector */}
        <div className="w-80 border-l border-gray-200 bg-white flex flex-col">
          {(activeTab === 'models' && selectedModel) || (activeTab === 'modular' && modularConfig) ? (
            <>
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center space-x-2">
                  <Palette size={16} className="text-gray-600" />
                  <h3 className="text-sm font-medium text-gray-800">Material Variants</h3>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {activeTab === 'modular' 
                    ? modularConfig 
                    : (modelsWithDisplayNames.find(m => m.filename === selectedModel)?.displayName || selectedModel)
                  }
                </p>
              </div>
              
              <div className="flex-1 p-4 overflow-y-auto">
                {(activeTab === 'models' && selectedModel && !modelLoadError) || (activeTab === 'modular' && modularConfig && modularViewerReady) ? (
                  <RenderVariantSelector 
                    modelViewerRef={activeTab === 'modular' ? modularViewerRef : modelViewerRef}
                    modelName={(activeTab === 'modular' ? modularConfig : selectedModel) || ''}
                    selectedVariants={selectedVariants}
                    onSelectionChange={setSelectedVariants}
                    isModularMode={activeTab === 'modular'}
                    enableSecondary={clientName === 'Sweef' && activeTab === 'models'}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <Palette size={32} className="text-gray-300 mb-3" />
                    <p className="text-sm text-gray-400">
                      {activeTab === 'models' && modelLoadError 
                        ? 'Cannot load variants' 
                        : activeTab === 'modular' && !modularViewerReady
                        ? 'Loading modular viewer...'
                        : 'Select a model or configuration'}
                    </p>
                    {activeTab === 'models' && modelLoadError && (
                      <p className="text-xs text-gray-400 mt-1">Model failed to load</p>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <Palette size={48} className="text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-700 mb-2">
                Material Variants
              </h3>
              <p className="text-sm text-gray-500 max-w-xs">
                Select a model from the sidebar to explore its material variants
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Collapsible Queue - Bottom Right */}
      <CollapsibleRenderQueue clientName={clientName} />
    </div>
  );
}
