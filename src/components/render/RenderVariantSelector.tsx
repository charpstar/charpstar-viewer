'use client';

import React, { useState, useEffect } from 'react';
import { Check, Search, X, CheckSquare, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RenderVariantSelectorProps {
  modelViewerRef: React.RefObject<any>;
  modelName: string;
  selectedVariants: string[];
  onSelectionChange: (selected: string[]) => void;
}

const RenderVariantSelector: React.FC<RenderVariantSelectorProps> = ({ 
  modelViewerRef,
  modelName,
  selectedVariants,
  onSelectionChange
}) => {
  const [variants, setVariants] = useState<string[]>([]);
  const [currentVariant, setCurrentVariant] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Variant fetching with proper modelViewerRef waiting
  useEffect(() => {
    const fetchVariants = () => {
      if (!modelViewerRef.current) return false;
      
      try {
        // Check if model is loaded using the loaded property
        if (!modelViewerRef.current.loaded) return false;
        
        const availableVariants = modelViewerRef.current.availableVariants || [];
        if (Array.isArray(availableVariants) && availableVariants.length > 0) {
          setVariants(availableVariants);
          const currentVariantName = modelViewerRef.current.variantName || null;
          setCurrentVariant(currentVariantName);
        } else {
          setVariants([]);
          setCurrentVariant(null);
        }
        setLoading(false);
        return true;
      } catch (error) {
        console.error('Error fetching variants:', error);
        setVariants([]);
        setCurrentVariant(null);
        setLoading(false);
        return false;
      }
    };
    
    // Reset when model changes
    setLoading(true);
    setVariants([]);
    setCurrentVariant(null);
    onSelectionChange([]); // Clear selections when model changes
    
    let pollForRefInterval: NodeJS.Timeout | null = null;
    let eventListenersAttached = false;
    
    const setupEventListeners = () => {
      if (!modelViewerRef.current || eventListenersAttached) return;
      
      eventListenersAttached = true;
      
      const modelViewer = modelViewerRef.current;
      
      const handleModelLoad = () => {
        setTimeout(() => {
          fetchVariants();
        }, 1000);
      };
      
      const handleVariantChange = () => {
        if (modelViewerRef.current?.loaded) {
          const currentVariantName = modelViewerRef.current.variantName || null;
          setCurrentVariant(currentVariantName);
        }
      };
      
      // Add event listeners
      modelViewer.addEventListener('load', handleModelLoad);
      modelViewer.addEventListener('variant-applied', handleVariantChange);
      
      // Try immediately if model is already loaded
      if (modelViewer.loaded) {
        setTimeout(() => {
          fetchVariants();
        }, 500);
      }
      
      // Return cleanup function
      return () => {
        modelViewer.removeEventListener('load', handleModelLoad);
        modelViewer.removeEventListener('variant-applied', handleVariantChange);
      };
    };
    
    // Wait for modelViewerRef to be populated
    const waitForModelViewerRef = () => {
      if (modelViewerRef.current) {
        if (pollForRefInterval) clearInterval(pollForRefInterval);
        const cleanup = setupEventListeners();
        return cleanup;
      }
      
      return null;
    };
    
    // Try immediately
    const cleanup = waitForModelViewerRef();
    if (cleanup) return cleanup;
    
    // If not found, poll every 100ms for up to 5 seconds
    let pollCount = 0;
    pollForRefInterval = setInterval(() => {
      pollCount++;
      
      const cleanup = waitForModelViewerRef();
      if (cleanup) {
        return; // setupEventListeners will clear the interval
      }
      
      if (pollCount >= 50) {
        if (pollForRefInterval) clearInterval(pollForRefInterval);
        setLoading(false);
      }
    }, 100);
    
    // Cleanup function
    return () => {
      if (pollForRefInterval) clearInterval(pollForRefInterval);
    };
  }, [modelName]);
  
  // Handle variant selection for viewing
  const handleViewVariant = (variantName: string) => {
    if (!modelViewerRef.current) return;
    
    try {
      modelViewerRef.current.variantName = variantName;
      setCurrentVariant(variantName);
    } catch (error) {
      console.error('Error selecting variant:', error);
    }
  };

  // Handle variant checkbox toggle
  const handleToggleVariant = (variantName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const isSelected = selectedVariants.includes(variantName);
    if (isSelected) {
      onSelectionChange(selectedVariants.filter(v => v !== variantName));
    } else {
      onSelectionChange([...selectedVariants, variantName]);
    }
  };

  // Select all variants
  const handleSelectAll = () => {
    onSelectionChange([...filteredVariants]);
  };

  // Clear all selections
  const handleClearAll = () => {
    onSelectionChange([]);
  };

  // SIMPLE filtering - no complex patterns
  const filteredVariants = searchQuery
    ? variants.filter(variant => 
        variant.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : variants;
  
  const selectedCount = selectedVariants.length;
  const allFilteredSelected = filteredVariants.length > 0 && 
    filteredVariants.every(v => selectedVariants.includes(v));
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-gray-400 text-sm">Loading variants...</div>
      </div>
    );
  }
  
  if (variants.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-center text-gray-500">
        <div>
          <div className="text-sm mb-1">No material variants found</div>
          <div className="text-xs text-gray-400">
            This model doesn't have material variants configured
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col space-y-3">
      {/* Search input - only show if there are enough variants */}
      {variants.length > 5 && (
        <div className="relative flex-shrink-0">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search variants..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-8 py-1 h-8 text-sm bg-gray-50 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Selection Controls */}
      <div className="flex-shrink-0 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="text-gray-500">
            {filteredVariants.length === variants.length 
              ? `${variants.length} variants` 
              : `${filteredVariants.length} of ${variants.length}`
            }
          </div>
          <div className={`font-semibold ${selectedCount > 0 ? 'text-black' : 'text-gray-400'}`}>
            {selectedCount} selected
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectAll}
            disabled={allFilteredSelected || filteredVariants.length === 0}
            className="flex-1 h-7 text-xs"
          >
            Select All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            disabled={selectedCount === 0}
            className="flex-1 h-7 text-xs"
          >
            Clear
          </Button>
        </div>
      </div>

      {/* Variant List - FULL HEIGHT with proper overflow */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-2">
          {filteredVariants.length === 0 ? (
            <div className="text-gray-500 text-xs italic p-2 text-center">
              No variants match "{searchQuery}"
            </div>
          ) : (
            filteredVariants.map((variant) => {
              const isSelected = selectedVariants.includes(variant);
              const isCurrentlyViewing = currentVariant === variant;
              
              return (
                <div 
                  key={variant}
                  className={`group p-2 cursor-pointer border rounded transition-all ${
                    isCurrentlyViewing
                      ? 'bg-black text-white border-black shadow-sm' 
                      : isSelected
                        ? 'bg-gray-100 border-gray-300 hover:bg-gray-200'
                        : 'bg-white border-gray-200 hover:bg-gray-50'
                  }`}
                  onClick={() => handleViewVariant(variant)}
                >
                  <div className="flex items-center gap-2">
                    {/* Checkbox */}
                    <div 
                      className="flex-shrink-0"
                      onClick={(e) => handleToggleVariant(variant, e)}
                    >
                      {isSelected ? (
                        <CheckSquare className={`w-4 h-4 ${isCurrentlyViewing ? 'text-white' : 'text-black'}`} />
                      ) : (
                        <Square className={`w-4 h-4 ${isCurrentlyViewing ? 'text-white' : 'text-gray-400 group-hover:text-gray-600'}`} />
                      )}
                    </div>
                    
                    {/* Variant Name */}
                    <div className="flex-1 text-sm truncate font-medium">
                      {variant}
                    </div>
                    
                    {/* Currently Viewing Indicator */}
                    {isCurrentlyViewing && (
                      <Check className="w-4 h-4 text-white flex-shrink-0" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default RenderVariantSelector;

