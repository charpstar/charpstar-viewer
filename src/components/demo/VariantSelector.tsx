// src/components/demo/VariantSelector.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Check, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface VariantSelectorProps {
  modelViewerRef: React.RefObject<any>;
  modelName: string;
}

const VariantSelector: React.FC<VariantSelectorProps> = ({ 
  modelViewerRef,
  modelName
}) => {
  const [variants, setVariants] = useState<string[]>([]);
  const [currentVariant, setCurrentVariant] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  // Track if we're on the initial page load
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Load variants whenever the model changes
  useEffect(() => {
    const fetchVariants = () => {
      if (!modelViewerRef.current) return false;
      
      try {
        // Get available variants
        const availableVariants = modelViewerRef.current.availableVariants || [];
        
        if (Array.isArray(availableVariants) && availableVariants.length > 0) {
          setVariants(availableVariants);
          
          // If it's the initial page load, don't select a variant
          // Otherwise, get the current variant from model-viewer
          if (isInitialLoad) {
            setCurrentVariant(null);
          } else {
            const currentVariantName = modelViewerRef.current.variantName;
            setCurrentVariant(currentVariantName);
          }
          
          setLoading(false);
          return true;
        } else {
          setVariants([]);
          setCurrentVariant(null);
          setLoading(false);
          return false;
        }
      } catch (error) {
        console.error('Error fetching variants:', error);
        setVariants([]);
        setCurrentVariant(null);
        setLoading(false);
        return false;
      }
    };
    
    // Reset loading state when model changes
    setLoading(true);
    
    // Try immediately
    const foundVariants = fetchVariants();
    
    // If no variants found immediately, set up polling for a short time
    // This helps because model-viewer might not have fully loaded
    if (!foundVariants) {
      let attempts = 0;
      const maxAttempts = 10;
      
      intervalRef.current = setInterval(() => {
        attempts++;
        
        if (fetchVariants() || attempts >= maxAttempts) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setLoading(false);
        }
      }, 300);
      
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }
  }, [modelViewerRef, modelName, isInitialLoad]);
  
  // Set isInitialLoad to false after component mounts
  useEffect(() => {
    if (isInitialLoad) {
      setIsInitialLoad(false);
    }
  }, [isInitialLoad]);
  
  // Listen for variant changes in model-viewer
  useEffect(() => {
    const handleVariantChange = () => {
      if (!modelViewerRef.current) return;
      
      try {
        const currentVariantName = modelViewerRef.current.variantName;
        setCurrentVariant(currentVariantName);
      } catch (error) {
        console.error('Error getting current variant:', error);
      }
    };
    
    // Set up a mutation observer to detect variant changes
    if (modelViewerRef.current) {
      // Check for variant changes every 300ms (a simple approach)
      const intervalId = setInterval(handleVariantChange, 300);
      
      return () => {
        clearInterval(intervalId);
      };
    }
  }, [modelViewerRef]);
  
  // Select a variant
  const handleSelectVariant = (variantName: string) => {
    if (!modelViewerRef.current) return;
    
    try {
      modelViewerRef.current.variantName = variantName;
      setCurrentVariant(variantName);
    } catch (error) {
      console.error('Error selecting variant:', error);
    }
  };

  // Filter variants based on search query
  const filteredVariants = searchQuery
    ? variants.filter(variant => 
        variant.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : variants;

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  // Clear search
  const clearSearch = () => {
    setSearchQuery('');
  };
  
  // If loading or no variants available
  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-pulse text-gray-400">Loading variants...</div>
      </div>
    );
  }
  
  if (variants.length === 0) {
    return (
      <div className="text-center p-4 text-gray-500">
        No material variants available for this model
      </div>
    );
  }
  
  return (
    <div className="space-y-2 pb-4">
      {/* Search box */}
      <div className="relative mb-3">
        <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
          <Search size={16} className="text-gray-400" />
        </div>
        <Input
          type="text"
          placeholder="Search variants..."
          value={searchQuery}
          onChange={handleSearchChange}
          className="pl-8 pr-8 py-1 h-8 text-sm bg-gray-50 border-gray-200 focus:ring-blue-500 focus:border-blue-500"
        />
        {searchQuery && (
          <button
            onClick={clearSearch}
            className="absolute inset-y-0 right-0 pr-2 flex items-center text-gray-400 hover:text-gray-600"
          >
            <span className="text-xs">✕</span>
          </button>
        )}
      </div>
      
      {/* Variants count */}
      <div className="text-xs text-gray-500 mb-2">
        {filteredVariants.length === variants.length 
          ? `${variants.length} variants available` 
          : `Showing ${filteredVariants.length} of ${variants.length} variants`
        }
      </div>
      
      {/* Variants list */}
      <div className="grid grid-cols-1 gap-2 max-h-96 overflow">
        {filteredVariants.length === 0 ? (
          <div className="text-gray-500 text-xs italic p-2 text-center">
            No variants match your search
          </div>
        ) : (
          filteredVariants.map((variant, index) => (
            <div 
              key={index}
              className={`p-2 cursor-pointer border rounded-sm ${
                currentVariant === variant 
                  ? 'bg-blue-50 border-blue-200' 
                  : 'bg-white border-gray-200 hover:bg-gray-50'
              }`}
              onClick={() => handleSelectVariant(variant)}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm truncate">{variant}</div>
                {currentVariant === variant && (
                  <div className="text-xs text-blue-600 ml-1">✓</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default VariantSelector;