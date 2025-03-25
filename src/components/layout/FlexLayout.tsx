// src/components/layout/FlexLayout.tsx
'use client';

import React, { useRef, useCallback, useState } from 'react';
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

// Define a simplified version with only supported attributes
const initialJson: IJsonModel = {
  global: {
    tabEnableClose: true,
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
            enableClose: true
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
            enableClose: true
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
                enableClose: true
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
                enableClose: true
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
  onTogglePanel
}) => {
  const layoutRef = useRef<Layout>(null);
  const { model, saveLayout, resetLayout } = useLayoutPersistence(initialJson);
  const [resizing, setResizing] = useState(false);

  // Manual approach for toggling panels
  const togglePanel = useCallback((panelType: 'scene' | 'materials' | 'variants', visible: boolean) => {
    if (!model) return;
    
    let panelId, tabId, component, name, targetId, dockLocation;
    
    // Configure panel properties
    if (panelType === 'scene') {
      panelId = 'scene-panel';
      tabId = 'scene-tab';
      component = 'scene';
      name = 'Scene';
      targetId = 'viewer-panel';
      dockLocation = DockLocation.LEFT;
    } else if (panelType === 'materials') {
      panelId = 'materials-panel';
      tabId = 'materials-tab';
      component = 'materials';
      name = 'Materials';
      targetId = 'viewer-panel';
      dockLocation = DockLocation.RIGHT;
    } else { // variants
      panelId = 'variants-panel';
      tabId = 'variants-tab';
      component = 'variants';
      name = 'Variants';
      targetId = 'viewer-panel';
      dockLocation = DockLocation.RIGHT;
    }
    
    // Check if panel exists
    const panelExists = model.getNodeById(panelId) !== undefined;
    
    if (visible && !panelExists) {
      // Create panel
      try {
        // Create tabset with child tab
        const tabsetJson = {
          type: 'tabset',
          id: panelId,
          weight: 15,
          children: [
            {
              type: 'tab',
              name: name,
              component: component,
              id: tabId,
              enableClose: true
            }
          ]
        };
        
        // Add the panel
        model.doAction(Actions.addNode(tabsetJson, targetId, dockLocation, -1));
      } catch (error) {
        console.error(`Error creating panel ${panelId}:`, error);
      }
    } else if (!visible && panelExists) {
      // Hide panel
      try {
        // Simply close the panel using a custom action
        const panelNode = model.getNodeById(panelId);
        if (panelNode) {
          // Use a manual approach since we don't have deleteNode/closeTab
          // First select one of the available tabs to focus on it
          const viewerNode = model.getNodeById('viewer-panel');
          if (viewerNode) {
            model.doAction({
              type: "FlexLayout_SelectTab",
              data: { tabsetId: 'viewer-panel', tabId: 'viewer-tab' }
            } as any);
          }
          
          // Then remove the panel
          model.doAction({
            type: "FlexLayout_DeleteTab",
            data: { tabsetId: panelId }
          } as any);
        }
      } catch (error) {
        console.error(`Error hiding panel ${panelId}:`, error);
      }
    }
  }, [model]);
  
  // Apply panel visibility changes
  React.useEffect(() => {
    if (!model) return;
    
    // Update each panel's visibility
    togglePanel('scene', visiblePanels.scene);
    togglePanel('materials', visiblePanels.materials);
    togglePanel('variants', visiblePanels.variants);
  }, [visiblePanels, model, togglePanel]);

  // Handle layout changes
  const handleModelChange = useCallback((newModel: Model, action: Action) => {
    saveLayout(newModel);
    onLayoutModelUpdate(newModel);
  }, [saveLayout, onLayoutModelUpdate]);
  
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
            <ModelViewer onModelLoaded={onModelLoaded} />
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
              onVariantChange={onVariantChange}
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

  // Handle actions
  const handleAction = (action: Action) => {
    // Detect specific tab close actions
    if (action.type === "FlexLayout_DeleteTab") {
      const tabsetId = action.data?.tabsetId;
      
      // Update panel visibility state based on which panel was closed
      if (tabsetId === 'scene-panel') {
        setTimeout(() => onTogglePanel('scene'), 0);
      } else if (tabsetId === 'materials-panel') {
        setTimeout(() => onTogglePanel('materials'), 0);
      } else if (tabsetId === 'variants-panel') {
        setTimeout(() => onTogglePanel('variants'), 0);
      }
    }
    
    // Allow the action
    return action;
  };

  // Add a layout reset button
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
        onAction={handleAction}
        realtimeResize={true}
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