// app/components/MaterialVariants.tsx
'use client';

import { useState, useEffect, useRef } from 'react';

interface MaterialVariantsProps {
  modelViewerRef: React.RefObject<any>;
  onVariantChange?: () => void;
}

const MaterialVariants: React.FC<MaterialVariantsProps> = ({ 
  modelViewerRef,
  onVariantChange 
}) => {
  const [variants, setVariants] = useState<string[]>([]);
  const [currentVariant, setCurrentVariant] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const hasMountedRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // More robust variant fetching with polling
  const fetchVariants = () => {
    if (!modelViewerRef.current) {
      setLoading(true);
      return false;
    }

    try {
      // Get available variants from the model-viewer
      const availableVariants = modelViewerRef.current.availableVariants || [];
      const variantsList = Array.isArray(availableVariants) ? availableVariants : [];
      
      // Get the currently selected variant if any
      const currentVariantName = modelViewerRef.current.variantName;
      
      // Only update if there's a change
      if (
        JSON.stringify(variantsList) !== JSON.stringify(variants) || 
        currentVariantName !== currentVariant
      ) {
        setVariants(variantsList);
        setCurrentVariant(currentVariantName || null);
      }
      
      setLoading(false);
      
      // Return true if variants are found
      return variantsList.length > 0;
    } catch (error) {
      console.error('Error fetching material variants:', error);
      setVariants([]);
      setCurrentVariant(null);
      setLoading(false);
      return false;
    }
  };

  // Set up polling for variants
  useEffect(() => {
    // Fetch immediately on mount
    if (!hasMountedRef.current) {
      fetchVariants();
      hasMountedRef.current = true;
    }
    
    // Set up polling interval (check every 500ms)
    intervalRef.current = setInterval(() => {
      const hasVariants = fetchVariants();
      
      // Once we've found variants, we can stop polling
      if (hasVariants && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }, 500);
    
    // Add a load event listener as a backup
    const modelViewer = modelViewerRef.current;
    if (modelViewer) {
      modelViewer.addEventListener('load', fetchVariants);
    }
    
    return () => {
      // Clean up interval and event listener
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      
      if (modelViewer) {
        modelViewer.removeEventListener('load', fetchVariants);
      }
      
      hasMountedRef.current = false;
    };
  }, [modelViewerRef]);

  // Function to select a variant
  const selectVariant = (variantName: string) => {
    if (modelViewerRef.current) {
      try {
        // Apply the variant
        modelViewerRef.current.variantName = variantName;
        setCurrentVariant(variantName);
        
        // Wait a moment for the variant to be applied before notifying parent
        setTimeout(() => {
          if (onVariantChange) {
            onVariantChange();
          }
        }, 100);
      } catch (error) {
        console.error('Error selecting variant:', error);
      }
    }
  };

  // If there are no variants or still loading, show appropriate message
  if (variants.length === 0) {
    return (
      <div className="text-gray-600 text-xs">
        {loading ? 'Loading variants...' : 'No material variants available for this model.'}
      </div>
    );
  }

  return (
    <div className="space-y-2 pb-4">
      <div className="grid grid-cols-1 gap-2">
        {variants.map((variant, index) => (
          <div 
            key={index}
            className={`p-2 cursor-pointer border rounded-sm ${
              currentVariant === variant 
                ? 'bg-blue-50 border-blue-200' 
                : 'bg-white border-gray-200 hover:bg-gray-50'
            }`}
            onClick={() => selectVariant(variant)}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm truncate">{variant}</div>
              {currentVariant === variant && (
                <div className="text-xs text-blue-600 ml-1">✓</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MaterialVariants;