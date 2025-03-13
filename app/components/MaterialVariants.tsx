// app/components/MaterialVariants.tsx
'use client';

import { useState, useEffect } from 'react';

interface MaterialVariantsProps {
  modelViewerRef: React.RefObject<any>;
}

const MaterialVariants: React.FC<MaterialVariantsProps> = ({ modelViewerRef }) => {
  const [variants, setVariants] = useState<string[]>([]);
  const [currentVariant, setCurrentVariant] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch available variants when the component mounts or modelViewer changes
  useEffect(() => {
    const fetchVariants = () => {
      setLoading(true);
      
      if (modelViewerRef.current) {
        try {
          // Get available variants from the model-viewer
          const availableVariants = modelViewerRef.current.availableVariants || [];
          setVariants(availableVariants);
          
          // Get the currently selected variant if any
          const currentVariant = modelViewerRef.current.variantName;
          setCurrentVariant(currentVariant || null);
          
          setLoading(false);
        } catch (error) {
          console.error('Error fetching material variants:', error);
          setVariants([]);
          setCurrentVariant(null);
          setLoading(false);
        }
      } else {
        setVariants([]);
        setCurrentVariant(null);
        setLoading(false);
      }
    };

    fetchVariants();
    
    // Add a listener for model load to update variants
    const modelViewer = modelViewerRef.current;
    if (modelViewer) {
      modelViewer.addEventListener('load', fetchVariants);
      
      return () => {
        modelViewer.removeEventListener('load', fetchVariants);
      };
    }
  }, [modelViewerRef]);

  // Function to select a variant
  const selectVariant = (variantName: string) => {
    if (modelViewerRef.current) {
      try {
        // Apply the variant
        modelViewerRef.current.variantName = variantName;
        setCurrentVariant(variantName);
      } catch (error) {
        console.error('Error selecting variant:', error);
      }
    }
  };

  if (loading) {
    return <div className="text-gray-600 text-xs">Loading variants...</div>;
  }

  if (variants.length === 0) {
    return (
      <div className="text-gray-600 text-xs">
        No material variants available for this model.
        <p className="mt-2">
          Material variants allow different material configurations to be defined in a single model file.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm font-medium">Available Material Variants</div>
      
      <div className="space-y-2">
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
              <div className="text-sm">{variant}</div>
              {currentVariant === variant && (
                <div className="text-xs text-blue-600">Active</div>
              )}
            </div>
          </div>
        ))}
      </div>
      
      <div className="text-xs text-gray-500 mt-4 pt-4 border-t border-gray-200">
        Click on a variant to apply it to the model.
      </div>
    </div>
  );
};

export default MaterialVariants;