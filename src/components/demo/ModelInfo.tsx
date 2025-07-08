// src/components/demo/ModelInfo.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';

interface ModelInfoProps {
  model: string;
  modelViewerRef: React.RefObject<any>;
}

// Helper function to parse model name with extended information
const parseModelDetails = (filename: string) => {
  // Remove file extension
  const name = filename.replace('.gltf', '');
  
  // Extract category prefix (first part before the dash)
  const categoryMatch = name.match(/^([A-Z]+)/);
  const category = categoryMatch ? categoryMatch[0] : 'OTHER';
  
  // Create a more readable display name
  let displayName = name;
  
  // Remove common suffixes for cleaner display
  displayName = displayName

  return {
    fullName: name,
    category,
    displayName,
  };
};

const ModelInfo: React.FC<ModelInfoProps> = ({ model, modelViewerRef }) => {
  const [variants, setVariants] = useState<string[]>([]);
  const [currentVariant, setCurrentVariant] = useState<string | null>(null);
  const [showVariantDropdown, setShowVariantDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Get the display name for the model
  const { displayName } = parseModelDetails(model);
  
  // Handle clicks outside of the dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowVariantDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // Load variants whenever the model or modelViewerRef changes
  useEffect(() => {
    const fetchVariants = () => {
      if (!modelViewerRef.current) return;
      
      try {
        // Get available variants
        const availableVariants = modelViewerRef.current.availableVariants || [];
        if (Array.isArray(availableVariants) && availableVariants.length > 0) {
          setVariants(availableVariants);
          
          // Get current variant
          const currentVariantName = modelViewerRef.current.variantName;
          setCurrentVariant(currentVariantName || availableVariants[0]);
        } else {
          setVariants([]);
          setCurrentVariant(null);
        }
      } catch (error) {
        console.error('Error fetching variants:', error);
        setVariants([]);
        setCurrentVariant(null);
      }
    };
    
    // Try immediately
    fetchVariants();
    
    // Set up an interval to poll until we get variants (model might still be loading)
    const intervalId = setInterval(() => {
      if (variants.length > 0) {
        clearInterval(intervalId);
      } else {
        fetchVariants();
      }
    }, 500);
    
    // Clean up
    return () => {
      clearInterval(intervalId);
    };
  }, [model, modelViewerRef, variants.length]);
  
  // Select a variant
  const handleSelectVariant = (variantName: string) => {
    if (!modelViewerRef.current) return;
    
    try {
      modelViewerRef.current.variantName = variantName;
      setCurrentVariant(variantName);
      setShowVariantDropdown(false);
    } catch (error) {
      console.error('Error selecting variant:', error);
    }
  };
  
  // Toggle dropdown
  const toggleVariantDropdown = () => {
    setShowVariantDropdown(prev => !prev);
  };
  
  return (
    <div className="p-4 bg-white rounded-lg shadow-sm border border-gray-100" ref={containerRef}>
      <h2 className="text-lg font-medium text-gray-800 truncate mb-4">{displayName}</h2>
      
      {variants.length > 0 ? (
        <div className="relative">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-gray-700">
              Material Variants
            </div>
            <div className="text-xs text-gray-500">
              {variants.length} {variants.length === 1 ? 'option' : 'options'}
            </div>
          </div>
          
          <Button
            variant="outline"
            onClick={toggleVariantDropdown}
            className="flex items-center justify-between w-full"
          >
            <span className="truncate text-sm">
              {currentVariant ? (
                <span>
                  <span className="font-medium text-gray-800">Variant:</span>{' '}
                  {currentVariant.length > 25 
                    ? currentVariant.substring(0, 22) + '...' 
                    : currentVariant}
                </span>
              ) : 'Select variant'}
            </span>
            <ChevronDown size={14} className="ml-2 flex-shrink-0" />
          </Button>
          
          {/* Fixed position dropdown that appears at the top of the container */}
          {showVariantDropdown && (
            <div className="fixed z-50 bg-white rounded-md shadow-lg border border-gray-200 w-64 max-h-80 overflow-y-auto"
                 style={{
                   top: containerRef.current ? 
                     window.scrollY + containerRef.current.getBoundingClientRect().top + 40 : 'auto',
                   left: containerRef.current ? 
                     window.scrollX + containerRef.current.getBoundingClientRect().left + 10 : 'auto',
                 }}>
              <div className="py-1">
                {variants.map((variant) => (
                  <button
                    key={variant}
                    onClick={() => handleSelectVariant(variant)}
                    className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                      currentVariant === variant
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-gray-700'
                    }`}
                  >
                    {variant}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          <div className="mt-3 text-xs text-gray-500">
            Select a variant to view different material options for this model
          </div>
        </div>
      ) : (
        <div className="text-sm text-gray-500">
          No material variants available for this model
        </div>
      )}
    </div>
  );
};

export default ModelInfo;