// src/components/demo/ClientDemoPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { clients, isValidClient } from '@/config/clients';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ChevronDown, ChevronRight, LayoutGrid, List, Eye, RefreshCw, Palette } from 'lucide-react';
import Header from '@/components/layout/Header';
import VariantSelector from '@/components/demo/VariantSelector';
import ModelViewer from '@/components/ModelViewer'; // Import your existing ModelViewer component
import { notFound } from 'next/navigation';

// Helper function to parse model name and extract category
const parseModelName = (filename: string) => {
  // Remove file extension
  const name = filename.replace('.gltf', '');
  
  // Extract category prefix (first part before the dash or number)
  const match = name.match(/^([A-Z]+)/);
  const category = match ? match[0] : 'OTHER';
  
  // Create a more readable display name
  let displayName = name;
  
  // Remove common suffixes for cleaner display
  displayName = displayName
    .replace(/-LC$/, '') // Left Corner suffix
    .replace(/-RI$/, '') // Right Interior suffix
    .replace(/-L-CHL$/, '') // Left Chaise Lounge suffix
    .replace(/-L-WOL$/, '') // Left Wood Leg suffix
    .replace(/-PL-L-CHL$/, '') // Platform Left Chaise Lounge suffix
    .replace(/-PL-L-WOL$/, '') // Platform Left Wood Leg suffix
    .replace(/-R-L-CHL$/, '') // Right Left Chaise Lounge suffix
    .replace(/-R-L-WOL$/, ''); // Right Left Wood Leg suffix
  
  return {
    fullName: name,
    category,
    displayName,
  };
};

// Group models by category
const groupModelsByCategory = (models: string[]) => {
  const grouped: Record<string, string[]> = {};
  
  models.forEach(model => {
    const { category } = parseModelName(model);
    
    if (!grouped[category]) {
      grouped[category] = [];
    }
    
    grouped[category].push(model);
  });
  
  // Sort categories alphabetically
  return Object.keys(grouped)
    .sort()
    .reduce((result: Record<string, string[]>, key) => {
      result[key] = grouped[key].sort();
      return result;
    }, {});
};

export default function ClientDemoPage() {
  const params = useParams();
  const clientName = params?.client as string || '';
  const modelViewerRef = useRef<any>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [modelList, setModelList] = useState<string[]>([]);
  const [groupedModels, setGroupedModels] = useState<Record<string, string[]>>({});
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'list' or 'grid'
  const [modelLoadError, setModelLoadError] = useState(false);
  const [currentModelUrl, setCurrentModelUrl] = useState<string | null>(null);
  
  // Validate client
  if (!isValidClient(clientName)) {
    notFound();
  }

  const clientConfig = clients[clientName];
  
  // Load model list
  useEffect(() => {
    // For demo purposes, we'll use the paste.txt content
    // In production, this would be an API call to fetch models list
    const fetchModels = async () => {
      try {
        setIsLoading(true);
        
        // This would be replaced with an actual API call
        const response = await fetch('/api/models?client=' + clientName);
        const models = await response.json();
        
        setModelList(models);
        
        // Group models by category
        const grouped = groupModelsByCategory(models);
        setGroupedModels(grouped);
        
        // Auto-expand categories with few items
        const initialExpanded: Record<string, boolean> = {};
        Object.keys(grouped).forEach(category => {
          initialExpanded[category] = grouped[category].length <= 10;
        });
        setExpandedCategories(initialExpanded);
        
        // Select first model by default
        if (models.length > 0) {
          setSelectedModel(models[0]);
          setCurrentModelUrl(getModelUrl(models[0]));
        }
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching models:', error);
        setIsLoading(false);
      }
    };
    
    fetchModels();
  }, [clientName]);
  
  // Toggle category expansion
  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };
  
  // Select a model to view
  const handleSelectModel = (model: string) => {
    setSelectedModel(model);
    setCurrentModelUrl(getModelUrl(model));
    setModelLoadError(false);
  };
  
  // Handle search
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  // Clear search
  const handleClearSearch = () => {
    setSearchQuery('');
  };
  
  // Handle model load error
  const handleModelError = () => {
    setModelLoadError(true);
  };
  
  // Filter models based on search query
  const filteredCategories = searchQuery 
    ? Object.keys(groupedModels).reduce((filtered: Record<string, string[]>, category) => {
        const matchingModels = groupedModels[category].filter(model => 
          model.toLowerCase().includes(searchQuery.toLowerCase())
        );
        
        if (matchingModels.length > 0) {
          filtered[category] = matchingModels;
        }
        
        return filtered;
      }, {})
    : groupedModels;
  
  // Get model URL
  const getModelUrl = (modelName: string) => {
    // This would be replaced with actual URL construction
    const baseUrl = clientConfig.modelUrl.split('/');
    baseUrl.pop(); // Remove the file name
    return `${baseUrl.join('/')}/${modelName}`;
  };
  
  // Model categories stats
  const categoryCount = Object.keys(filteredCategories).length;
  const totalModelCount = Object.values(filteredCategories)
    .reduce((count, models) => count + models.length, 0);
  
  // Handle model loaded event
  const handleModelLoaded = () => {
    console.log('Model loaded callback received');
    
    // After the model loads, store a reference to the model-viewer element
    setTimeout(() => {
      const modelViewer = document.getElementById('model-viewer');
      if (modelViewer && !modelViewerRef.current) {
        modelViewerRef.current = modelViewer;
        console.log('Stored model-viewer reference');
      }
    }, 100);
  };
  
  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB]">
      <div className="flex-none">
        <Header 
          modelViewerRef={modelViewerRef}
          title={`${clientName} Catalog`}
        />
      </div>
      
     <div className="flex flex-1 overflow-hidden">
        {/* Left side - Model navigation */}
        <div className="w-1/5 border-r border-gray-200 bg-white shadow-inner flex flex-col">
          {/* Search and Filter Controls */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-800">Model Catalog</h2>
              <div className="flex space-x-2">
                <Button 
                  variant={viewMode === 'list' ? 'default' : 'outline'} 
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="h-8 w-8 p-0"
                >
                  <List size={16} />
                </Button>
                <Button 
                  variant={viewMode === 'grid' ? 'default' : 'outline'} 
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className="h-8 w-8 p-0"
                >
                  <LayoutGrid size={16} />
                </Button>
              </div>
            </div>
            
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
              <Input
                type="text"
                placeholder="Search models..."
                value={searchQuery}
                onChange={handleSearch}
                className="pl-8 pr-8 py-2 text-sm"
              />
              {searchQuery && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <span className="text-xs">✕</span>
                </button>
              )}
              {searchQuery && (
                <div className="text-xs text-gray-500 mt-1">
                  Found {totalModelCount} models in {categoryCount} categories
                </div>
              )}
            </div>
          </div>
          
          {/* Model List */}
          <div className="flex-1 overflow-y-auto scrollbar-none">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-gray-500">Loading models...</div>
              </div>
            ) : (
              viewMode === 'list' ? (
                <div className="divide-y divide-gray-100">
                  {Object.keys(filteredCategories).length === 0 ? (
                    <div className="p-4 text-center text-gray-500">
                      No models found for "{searchQuery}"
                    </div>
                  ) : (
                    Object.keys(filteredCategories).map(category => (
                      <div key={category} className="border-b border-gray-100">
                        <div 
                          className="flex items-center p-3 bg-gray-200 cursor-pointer hover:bg-gray-300"
                          onClick={() => toggleCategory(category)}
                        >
                          {expandedCategories[category] ? (
                            <ChevronDown size={16} className="text-gray-700 mr-2" />
                          ) : (
                            <ChevronRight size={16} className="text-gray-700 mr-2" />
                          )}
                          <span className="font-semibold text-gray-800">{category}</span>
                          <span className="ml-2 text-xs font-medium text-gray-600">
                            ({filteredCategories[category].length})
                          </span>
                        </div>
                        
                        {expandedCategories[category] && (
                          <div className="bg-white">
                            {filteredCategories[category].map(model => (
                              <div 
                                key={model}
                                className={`px-8 py-2 cursor-pointer hover:bg-blue-50 flex items-center justify-between ${
                                  selectedModel === model ? 'bg-blue-50 text-blue-700' : ''
                                }`}
                                onClick={() => handleSelectModel(model)}
                              >
                                <div className="text-sm truncate">
                                  {parseModelName(model).displayName}
                                </div>
                                {selectedModel === model && (
                                  <Eye size={14} className="text-blue-600 ml-2" />
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="p-4 grid grid-cols-2 gap-3">
                  {Object.keys(filteredCategories).length === 0 ? (
                    <div className="col-span-2 p-4 text-center text-gray-500">
                      No models found for "{searchQuery}"
                    </div>
                  ) : (
                    Object.keys(filteredCategories).map(category => (
                      <div key={category} className="col-span-2 mb-4">
                        <div 
                          className="flex items-center p-2 bg-gray-100 cursor-pointer hover:bg-gray-200"
                          onClick={() => toggleCategory(category)}
                        >
                          {expandedCategories[category] ? (
                            <ChevronDown size={16} className="text-gray-700 mr-2" />
                          ) : (
                            <ChevronRight size={16} className="text-gray-700 mr-2" />
                          )}
                          <span className="font-semibold text-gray-800">{category}</span>
                          <span className="ml-2 text-xs font-medium text-gray-600">
                            ({filteredCategories[category].length})
                          </span>
                        </div>
                        
                        {expandedCategories[category] && (
                          <div className="grid grid-cols-2 gap-2 p-2 border border-gray-100 rounded-b-lg">
                            {filteredCategories[category].map(model => (
                              <div 
                                key={model}
                                className={`p-2 cursor-pointer hover:bg-blue-50 rounded border ${
                                  selectedModel === model ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                                }`}
                                onClick={() => handleSelectModel(model)}
                              >
                                <div className="text-xs text-center truncate">
                                  {parseModelName(model).displayName}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )
            )}
          </div>
        </div>
        
        {/* Center - 3D Viewer */}
        <div className="flex-1 p-4 bg-white">
          <div className="h-full rounded-lg overflow-hidden shadow-md bg-[#F8F9FA] flex items-center justify-center relative">
            {selectedModel ? (
              <>
                <ModelViewer 
                  clientModelUrl={currentModelUrl}
                  onModelLoaded={handleModelLoaded}
                />
                
                {modelLoadError && (
                  <div className="absolute inset-0 bg-gray-100 bg-opacity-80 flex flex-col items-center justify-center">
                    <div className="text-red-500 mb-2">Error loading model</div>
                    <div className="text-gray-600 text-sm mb-4">
                      The model might not be available in this location
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
                {isLoading ? "Loading models..." : "Select a model to view"}
              </div>
            )}
          </div>
        </div>
        
        {/* Right side - Variants panel */}
        <div className="w-1/8 border-l border-gray-200 bg-white shadow-inner flex flex-col">
          <div className="p-3 border-b border-gray-200">
            <div className="flex items-center space-x-2">
              <Palette size={16} className="text-gray-600" />
              <h3 className="text-sm font-medium text-gray-800">Material Variants</h3>
            </div>
          </div>
          
          <div className="flex-1 p-3 overflow-y-auto scrollbar-thin">
            {selectedModel && !modelLoadError ? (
              <VariantSelector 
                modelViewerRef={modelViewerRef}
                modelName={parseModelName(selectedModel).displayName}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Palette size={24} className="text-gray-300 mb-2" />
                <p className="text-gray-400 text-sm">
                  {isLoading 
                    ? "Loading..." 
                    : modelLoadError 
                      ? "Cannot load variants for this model" 
                      : "Select a model to view available variants"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}