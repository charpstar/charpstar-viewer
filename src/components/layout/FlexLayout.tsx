// src/components/layout/FlexLayout.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Layout, 
  Model, 
  TabNode, 
  IJsonModel, 
  Actions,
  Action,
  DockLocation
} from 'flexlayout-react';
import 'flexlayout-react/style/dark.css';
import '@/styles/flexlayout-custom.css';
import StructureTree from '../scene/StructureTree';
import MaterialProperties from '../material/MaterialProperties';
import MaterialVariants from '../variant/MaterialVariants';
import ModelViewer from '../ModelViewer';
import { useLayoutPersistence } from '@/hooks/useLayoutPersistence';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';

// Define panel configuration for easier management
const PANEL_CONFIG = {
  'scene': { 
    tabsetId: 'scene-panel', 
    tabId: 'scene-tab', 
    component: 'scene', 
    name: 'Scene',
    dockLocation: DockLocation.LEFT,
    targetId: 'viewer-panel'
  },
  'materials': { 
    tabsetId: 'materials-panel', 
    tabId: 'materials-tab', 
    component: 'materials', 
    name: 'Materials',
    dockLocation: DockLocation.RIGHT,
    targetId: 'viewer-panel'
  },
  'variants': { 
    tabsetId: 'variants-panel', 
    tabId: 'variants-tab', 
    component: 'variants', 
    name: 'Variants',
    dockLocation: DockLocation.RIGHT,
    targetId: 'viewer-panel'
  }
};

// Define a simplified version with only supported attributes
// Using the correct popout properties according to documentation
const initialJson: IJsonModel = {
  global: {
    tabEnableClose: false, // Disable close buttons globally
    tabEnablePopout: true, // Enable popout globally
    splitterSize: 4,
    tabSetMinHeight: 100,
    tabSetMinWidth: 100,
    enableEdgeDock: true
  },
  borders: [],
  layout: {
    type: 'row',
    weight: 100,
    children: [
      {
        type: 'tabset',
        weight: 15,
        id: 'scene-panel',
        children: [
          {
            type: 'tab',
            name: 'Scene',
            component: 'scene',
            id: 'scene-tab',
            enableClose: false, // Disable close button
            enablePopout: true
          }
        ]
      },
      {
        type: 'tabset',
        weight: 70,
        id: 'viewer-panel',
        children: [
          {
            type: 'tab',
            name: '3D Viewer',
            component: 'viewer',
            id: 'viewer-tab',
            enableClose: false, // Disable close button
            enablePopout: true
          }
        ]
      },
      {
        type: 'row',
        weight: 15,
        children: [
          {
            type: 'tabset',
            weight: 50,
            id: 'materials-panel',
            children: [
              {
                type: 'tab',
                name: 'Materials',
                component: 'materials',
                id: 'materials-tab',
                enableClose: false, // Disable close button
                enablePopout: true
              }
            ]
          },
          {
            type: 'tabset',
            weight: 50,
            id: 'variants-panel',
            children: [
              {
                type: 'tab',
                name: 'Variants',
                component: 'variants',
                id: 'variants-tab',
                enableClose: false, // Disable close button
                enablePopout: true
              }
            ]
          }
        ]
      }
    ]
  }
};

interface FlexLayoutProps {
  modelStructure: any;
  selectedNode: any;
  modelViewerRef: React.RefObject<any>;
  onNodeSelect: (node: any) => void;
  onModelLoaded: () => void;
  onVariantChange: () => void;
  visiblePanels: {
    scene: boolean;
    materials: boolean;
    variants: boolean;
  };
  onLayoutModelUpdate: (model: Model) => void;
  onTogglePanel: (panel: 'scene' | 'materials' | 'variants') => void;
  clientModelUrl?: string;
}

const FlexLayout: React.FC<FlexLayoutProps> = ({
  modelStructure,
  selectedNode,
  modelViewerRef,
  onNodeSelect,
  onModelLoaded,
  onVariantChange,
  visiblePanels,
  onLayoutModelUpdate,
  onTogglePanel,
  clientModelUrl
}) => {
  const layoutRef = useRef<Layout>(null);
  const { model, saveLayout, resetLayout } = useLayoutPersistence(initialJson);
  const [resizing, setResizing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [variantChangeCounter, setVariantChangeCounter] = useState(0);

  // Function to show a specific panel
  const showPanel = useCallback((panelType: 'scene' | 'materials' | 'variants') => {
    if (!model) return;
    
    const { tabsetId, tabId, component, name, dockLocation, targetId } = PANEL_CONFIG[panelType];
    
    try {
      // Check if panel already exists
      const existingPanel = model.getNodeById(tabsetId);
      if (existingPanel) {
        // Panel already exists, no need to recreate
        return;
      }
      
      // Create a new panel using the proper configuration
      const tabsetJson = {
        type: 'tabset',
        id: tabsetId,
        weight: 15,
        children: [
          {
            type: 'tab',
            name: name,
            component: component,
            id: tabId,
            enableClose: false, // Disable close button
            enablePopout: true
          }
        ]
      };
      
      // Add the panel using FlexLayout's built-in action
      model.doAction(Actions.addNode(tabsetJson, targetId, dockLocation, -1));
    } catch (error) {
      console.error(`Error creating panel ${tabsetId}:`, error);
    }
  }, [model]);

  // Improved function to hide a specific panel
  const hidePanel = useCallback((panelType: 'scene' | 'materials' | 'variants') => {
    if (!model) return;
    
    const { tabsetId } = PANEL_CONFIG[panelType];
    
    try {
      // Get the node by ID
      const panelNode = model.getNodeById(tabsetId);
      if (panelNode) {
        // Check if it's a TabSetNode with children
        const tabsetNode = panelNode;
        if (tabsetNode.getType() === "tabset" && tabsetNode.getChildren().length > 0) {
          // Instead of deleting the tabset, we'll find its parent
          const parentNode = tabsetNode.getParent();
          if (parentNode) {
            // Remove the tabset from its parent
            model.doAction(Actions.deleteTabset(tabsetId));
          }
        }
      }
    } catch (error) {
      console.error(`Error hiding panel ${tabsetId}:`, error);
    }
  }, [model]);

  // Update panel visibility based on props
  useEffect(() => {
    if (!model || !isInitialized) return;
    
    Object.entries(visiblePanels).forEach(([panel, isVisible]) => {
      const panelType = panel as 'scene' | 'materials' | 'variants';
      const { tabsetId } = PANEL_CONFIG[panelType];
      const panelExists = model.getNodeById(tabsetId) !== undefined;
      
      if (isVisible && !panelExists) {
        showPanel(panelType);
      } else if (!isVisible && panelExists) {
        hidePanel(panelType);
      }
    });
  }, [visiblePanels, model, showPanel, hidePanel, isInitialized]);

  // Initialize panels after model is loaded
  useEffect(() => {
    if (model && !isInitialized) {
      setIsInitialized(true);
      
      // Initial setup for panel visibility
      Object.entries(visiblePanels).forEach(([panel, isVisible]) => {
        const panelType = panel as 'scene' | 'materials' | 'variants';
        const { tabsetId } = PANEL_CONFIG[panelType];
        const panelExists = model.getNodeById(tabsetId) !== undefined;
        
        // If a panel should be visible but doesn't exist, create it
        if (isVisible && !panelExists) {
          showPanel(panelType);
        } 
        // If a panel should not be visible but exists, hide it
        else if (!isVisible && panelExists) {
          hidePanel(panelType);
        }
      });
    }
  }, [model, isInitialized, visiblePanels, showPanel, hidePanel]);

  const handleVariantChange = () => {
    console.log('Variant changed, updating material panel');
    // Increment the counter to force MaterialProperties to re-render
    setVariantChangeCounter(prev => prev + 1);
    // Also call the parent's onVariantChange if it exists
    if (onVariantChange) {
      onVariantChange();
    }
  };

  // Monitor layout for tab close events (keeping this even though tabs can't be closed now)
  const handleModelChange = useCallback((newModel: Model, action: Action) => {
    // Save the layout
    saveLayout(newModel);
    onLayoutModelUpdate(newModel);
    
    // Check for tab deletion actions
    if (action.type === "FlexLayout_DeleteTab") {
      const { tabId } = action.data;
      
      // Find which panel this tab belongs to
      Object.entries(PANEL_CONFIG).forEach(([panelType, config]) => {
        if (config.tabId === tabId) {
          // Update the visibility state in the parent component
          onTogglePanel(panelType as 'scene' | 'materials' | 'variants');
        }
      });
    }
    
    // Also check for tabset deletion actions (this is needed for proper tracking)
    if (action.type === "FlexLayout_DeleteTabset") {
      const { tabsetId } = action.data;
      
      // Find which panel this tabset belongs to
      Object.entries(PANEL_CONFIG).forEach(([panelType, config]) => {
        if (config.tabsetId === tabsetId) {
          // Update the visibility state in the parent component
          onTogglePanel(panelType as 'scene' | 'materials' | 'variants');
        }
      });
    }

    // Check for popout actions
    if (action.type === "FlexLayout_PopoutTab" || action.type === "FlexLayout_PopoutTabset") {
      console.log("Tab/Tabset popped out:", action);
    }
  }, [saveLayout, onLayoutModelUpdate, onTogglePanel]);
  
  // Define the components that will be used in the layout
  const factory = (node: TabNode) => {
    const component = node.getComponent();
    
    switch (component) {
      case 'scene':
        return (
          <div className="h-full p-4 bg-[#FAFAFA] overflow-auto">
            <h3 className="text-sm font-medium mb-4">Scene Hierarchy</h3>
            {modelStructure ? (
              <StructureTree 
                node={modelStructure} 
                onNodeSelect={onNodeSelect}
                selectedNode={selectedNode}
              />
            ) : (
              <p className="text-gray-600 text-xs px-4">
                No model loaded or structure data not available.
              </p>
            )}
          </div>
        );
        
      case 'viewer':
        return (
          <div className={`h-full bg-[#EFEFEF] ${resizing ? 'pointer-events-none' : ''}`}>
            <ModelViewer 
              onModelLoaded={onModelLoaded}
              clientModelUrl={clientModelUrl}
            />
          </div>
        );
        
        case 'materials':
          return (
            <div className="h-full p-4 bg-[#FAFAFA] overflow-auto">
              <h3 className="text-sm font-medium mb-4">Material Properties</h3>
              {selectedNode ? (
                <>
                  <div className="mb-2 text-xs text-gray-600">Selected: {selectedNode.name} ({selectedNode.type})</div>
                  <MaterialProperties 
                    selectedNode={selectedNode} 
                    modelViewerRef={modelViewerRef}
                    variantChangeCounter={variantChangeCounter}
                  />
                </>
              ) : (
                <div className="text-gray-600 text-xs">Select a mesh to view its material properties.</div>
              )}
            </div>
          );
          
        case 'variants':
          return (
            <div className="h-full p-4 bg-[#FAFAFA] overflow-auto">
              <h3 className="text-sm font-medium mb-4">Variants</h3>
              <MaterialVariants 
                modelViewerRef={modelViewerRef} 
                onVariantChange={handleVariantChange}
                selectedNode={selectedNode}
              />
            </div>
          );
        
      default:
        return <div>Unknown component: {component}</div>;
    }
  };

  // Apply custom styling to match rounded theme
  const customStyle = {
    '--color-text': 'var(--text)',
    '--color-background': 'var(--background)',
    '--color-base': 'var(--background)',
    '--color-1': 'var(--sidebar)',
    '--color-2': 'var(--sidebar)',
    '--color-3': 'var(--sidebar-border)',
    '--color-4': 'var(--viewer)',
    '--color-5': 'var(--sidebar-border)',
    '--color-6': 'var(--flex-accent)',
    '--color-drag1': 'rgba(100, 116, 139, 0.3)',
    '--color-drag2': 'rgba(100, 116, 139, 0.5)',
    '--color-drag1-border': 'var(--flex-accent)',
    '--color-drag2-border': 'var(--flex-accent)',
    '--font-family': 'var(--font-jost), sans-serif',
    '--border-radius': '0.375rem',
    '--border-radius-tabset': '0.375rem',
    '--border-radius-tab': '0.25rem'
  } as React.CSSProperties;

  // Handle layout reset
  const handleResetLayout = () => {
    resetLayout();
  };

  if (!model) {
    return <div>Loading layout...</div>;
  }

  return (
    <div className="h-full" style={customStyle}>
      <Layout
        ref={layoutRef}
        model={model}
        factory={factory}
        onModelChange={handleModelChange}
        realtimeResize={true}
        popoutURL="/popout.html" 
      />
      <Button 
        onClick={handleResetLayout}
        variant="outline"
        size="sm"
        className="absolute bottom-4 right-4 bg-white/80 text-xs opacity-70 hover:opacity-100 transition-opacity"
        title="Reset layout to default"
      >
        <RotateCcw size={14} className="mr-1" />
        Reset Layout
      </Button>
    </div>
  );
};

export default FlexLayout;