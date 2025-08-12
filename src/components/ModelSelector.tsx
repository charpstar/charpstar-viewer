'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown, Box } from 'lucide-react';
import { getClientConfig } from '@/config/clientConfig';

interface ModelSelectorProps {
  onModelChange: (modelUrl: string, modelName: string) => void;
  currentModel?: string;
  cacheTimestamp?: number | null;
}

// Helper function to parse model name and extract category
const parseModelName = (filename: string) => {
  const name = filename.replace('.gltf', '');
  const match = name.match(/^([A-Z]+)/);
  const category = match ? match[0] : 'OTHER';
  
  return {
    fullName: name,
    category,
    displayName: name,
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
  
  return Object.keys(grouped)
    .sort()
    .reduce((result: Record<string, string[]>, key) => {
      result[key] = grouped[key].sort();
      return result;
    }, {});
};

export default function ModelSelector({ onModelChange, currentModel, cacheTimestamp }: ModelSelectorProps) {
  const params = useParams();
  const clientName = params?.client as string || '';
  
  const [isLoading, setIsLoading] = useState(true);
  const [modelList, setModelList] = useState<string[]>([]);
  const [groupedModels, setGroupedModels] = useState<Record<string, string[]>>({});
  const [selectedModel, setSelectedModel] = useState<string | null>(currentModel || null);

  const clientConfig = getClientConfig(clientName);

  // Sync selectedModel when currentModel prop changes
  useEffect(() => {
    if (currentModel !== selectedModel) {
      setSelectedModel(currentModel || null);
    }
  }, [currentModel]);

  // Load model list
  useEffect(() => {
    const fetchModels = async () => {
      try {
        setIsLoading(true);
        
        const response = await fetch('/api/list-models?client=' + clientName);
        const data = await response.json();
        const models: string[] = Array.isArray(data?.models) ? data.models.map((m: any) => m.filename) : [];

        setModelList(models);
        
        // Group models by category
        const grouped = groupModelsByCategory(models);
        setGroupedModels(grouped);
        
        // If no current model is selected and no currentModel prop, select the first one
        if (!selectedModel && !currentModel && models.length > 0) {
          setSelectedModel(models[0]);
        }
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching models:', error);
        setIsLoading(false);
      }
    };
    
    fetchModels();
  }, [clientName]);

  // Get model URL with cache-busting if needed
  const getModelUrl = (modelName: string) => {
    const baseUrl = clientConfig.modelUrl.split('/');
    baseUrl.pop(); // Remove the file name
    const url = `${baseUrl.join('/')}/${modelName}`;
    
    // Add cache-busting parameter if we have a global timestamp (after a save)
    if (cacheTimestamp) {
      return `${url}?v=${cacheTimestamp}`;
    }
    
    return url;
  };

  // Handle model selection
  const handleModelSelect = (model: string) => {
    setSelectedModel(model);
    const modelUrl = getModelUrl(model);
    onModelChange(modelUrl, model);
  };

  // Get display name for selected model
  const getSelectedModelDisplayName = () => {
    if (!selectedModel) return 'Select Model';
    return parseModelName(selectedModel).displayName;
  };

  return (
    <div className="flex items-center space-x-2">
      <Box size={16} className="text-gray-500" />
      <span className="text-sm text-gray-600 font-medium">Model:</span>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs">
            {isLoading ? 'Loading...' : getSelectedModelDisplayName()}
            <ChevronDown size={14} className="ml-1" />
          </Button>
        </DropdownMenuTrigger>
        
        <DropdownMenuContent align="start" className="w-64 max-h-80 overflow-y-auto">
          <DropdownMenuLabel className="text-xs">Available Models</DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {isLoading ? (
            <DropdownMenuItem disabled className="text-xs">
              Loading models...
            </DropdownMenuItem>
          ) : (
            Object.keys(groupedModels).map(category => (
              <div key={category}>
                <DropdownMenuLabel className="text-xs font-semibold text-gray-800">
                  {category} ({groupedModels[category].length})
                </DropdownMenuLabel>
                {groupedModels[category].map(model => (
                  <DropdownMenuItem
                    key={model}
                    onClick={() => handleModelSelect(model)}
                    className={`text-xs pl-4 ${
                      selectedModel === model ? 'bg-blue-50 text-blue-700' : ''
                    }`}
                  >
                    {parseModelName(model).displayName}
                    {selectedModel === model && (
                      <span className="ml-auto text-blue-600">✓</span>
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
              </div>
            ))
          )}
          
          {!isLoading && modelList.length === 0 && (
            <DropdownMenuItem disabled className="text-xs">
              No models available
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
} 