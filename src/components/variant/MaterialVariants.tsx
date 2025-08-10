// src/components/variant/MaterialVariants.tsx
'use client';

import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface MaterialVariantsProps {
  modelViewerRef: React.RefObject<any>;
  onVariantChange?: () => void;
  selectedNode?: any | null;
}

const MaterialVariants: React.FC<MaterialVariantsProps> = ({ 
  modelViewerRef,
  onVariantChange,
  selectedNode 
}) => {
  const [variants, setVariants] = useState<string[]>([]);
  const [currentVariant, setCurrentVariant] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Variant fetching with proper modelViewerRef waiting (same pattern as VariantSelector)
  useEffect(() => {
    const fetchVariants = () => {
      if (!modelViewerRef.current || !modelViewerRef.current.loaded) return false;
      const availableVariants = modelViewerRef.current.availableVariants || [];
      setVariants(Array.isArray(availableVariants) ? availableVariants : []);
      setCurrentVariant(modelViewerRef.current.variantName || null);
      setLoading(false);
      return true;
    };
    
    // Reset when model changes
    setLoading(true);
    setVariants([]);
    setCurrentVariant(null);
    
    // Minimal listeners without polling
    const modelViewer = modelViewerRef.current;
    if (!modelViewer) return;
    const onLoad = () => fetchVariants();
    const onVariant = () => setCurrentVariant(modelViewerRef.current?.variantName || null);
    modelViewer.addEventListener('load', onLoad);
    modelViewer.addEventListener('variant-applied', onVariant);
    if (modelViewer.loaded) fetchVariants();
    return () => {
      modelViewer.removeEventListener('load', onLoad);
      modelViewer.removeEventListener('variant-applied', onVariant);
    };
  }, []);

  // Function to select a variant
  const selectVariant = (variantName: string) => {
    if (modelViewerRef.current) {
      try {
        // Apply the variant
        modelViewerRef.current.variantName = variantName;
        setCurrentVariant(variantName);
        if (typeof modelViewerRef.current.requestRender === 'function') {
          modelViewerRef.current.requestRender();
        }
        onVariantChange?.();
      } catch (error) {
        // no-op
      }
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
              onClick={() => selectVariant(variant)}
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

export default MaterialVariants;