// src/hooks/useLayoutPersistence.ts

import { useState, useEffect } from 'react';
import { Model, IJsonModel } from 'flexlayout-react';

const LAYOUT_STORAGE_KEY = 'charpstar-layout-config';

export const useLayoutPersistence = (defaultLayout: IJsonModel) => {
  const [model, setModel] = useState<Model | null>(null);

  // Load saved layout or use default
  useEffect(() => {
    try {
      const savedLayout = localStorage.getItem(LAYOUT_STORAGE_KEY);
      
      if (savedLayout) {
        // Try to use the saved layout
        try {
          const layoutJson = JSON.parse(savedLayout);
          const loadedModel = Model.fromJson(layoutJson);
          setModel(loadedModel);
        } catch (e) {
          console.error('Failed to load saved layout, using default', e);
          setModel(Model.fromJson(defaultLayout));
        }
      } else {
        // No saved layout, use default
        setModel(Model.fromJson(defaultLayout));
      }
    } catch (e) {
      // Fallback to default layout if localStorage is not available
      console.warn('LocalStorage not available, using default layout');
      setModel(Model.fromJson(defaultLayout));
    }
  }, [defaultLayout]);

  // Function to save the current layout
  const saveLayout = (model: Model) => {
    try {
      const layoutJson = model.toJson();
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layoutJson));
    } catch (e) {
      console.error('Failed to save layout', e);
    }
  };

  // Function to reset to default layout
  const resetLayout = () => {
    try {
      localStorage.removeItem(LAYOUT_STORAGE_KEY);
      setModel(Model.fromJson(defaultLayout));
    } catch (e) {
      console.error('Failed to reset layout', e);
    }
  };

  return { model, saveLayout, resetLayout };
};