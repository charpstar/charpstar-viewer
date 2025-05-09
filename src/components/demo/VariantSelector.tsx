// src/components/demo/VariantSelector.tsx
import React, { useState, useEffect } from 'react';
import { Check } from 'lucide-react';

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
  // Track if we're on the initial page load
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  
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
      
      const intervalId = setInterval(() => {
        attempts++;
        
        if (fetchVariants() || attempts >= maxAttempts) {
          clearInterval(intervalId);
          setLoading(false);
        }
      }, 300);
      
      return () => {
        clearInterval(intervalId);
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
    <div className="space-y-3">
      {variants.length > 0 && (
        <p className="text-xs text-gray-500">
          {variants.length} {variants.length === 1 ? 'variant' : 'variants'} available
        </p>
      )}
      
      <div className="space-y-2">
        {variants.map((variant) => (
          <div 
            key={variant}
            className={`border rounded-md ${
              currentVariant === variant 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-200 hover:border-gray-300'
            } transition-colors duration-150 cursor-pointer`}
            onClick={() => handleSelectVariant(variant)}
          >
            <div className="flex items-center p-2">
              <div className="flex-1">
                <div className="text-xs">{variant}</div>
              </div>
              
              {currentVariant === variant && (
                <div className="flex-shrink-0">
                  <Check size={14} className="text-blue-600" />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default VariantSelector;