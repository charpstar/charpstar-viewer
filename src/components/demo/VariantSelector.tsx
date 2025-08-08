import React, { useState, useEffect } from 'react';
import { Check, Search, X } from 'lucide-react';

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
  
  // SIMPLE variant selection
  const handleSelectVariant = (variantName: string) => {
    if (!modelViewerRef.current) return;
    
    try {
      modelViewerRef.current.variantName = variantName;
      setCurrentVariant(variantName);
    } catch (error) {
      console.error('Error selecting variant:', error);
    }
  };

  // SIMPLE filtering - no complex patterns
  const filteredVariants = searchQuery
    ? variants.filter(variant => 
        variant.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : variants;
  
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
            className="w-full pl-8 pr-8 py-1 h-8 text-sm bg-gray-50 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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

      {/* Variants count */}
      <div className="text-xs text-gray-500 flex-shrink-0">
        {filteredVariants.length === variants.length 
          ? `${variants.length} variants available` 
          : `Showing ${filteredVariants.length} of ${variants.length} variants`
        }
      </div>

      {/* Variant List - FULL HEIGHT with proper overflow */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-2">
          {filteredVariants.length === 0 ? (
            <div className="text-gray-500 text-xs italic p-2 text-center">
              No variants match "{searchQuery}"
            </div>
          ) : (
            filteredVariants.map((variant) => (
              <div 
                key={variant}
                className={`p-2 cursor-pointer border rounded transition-colors ${
                  currentVariant === variant 
                    ? 'bg-blue-50 border-blue-200' 
                    : 'bg-white border-gray-200 hover:bg-gray-50'
                }`}
                onClick={() => handleSelectVariant(variant)}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm truncate font-medium">{variant}</div>
                  {currentVariant === variant && (
                    <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default VariantSelector;