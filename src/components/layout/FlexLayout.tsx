// src/components/layout/FlexLayout.tsx
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Layout,
  Model,
  TabNode,
  IJsonModel,
  Actions,
  Action,
  DockLocation,
} from "flexlayout-react";
import "flexlayout-react/style/dark.css";
import "@/styles/flexlayout-custom.css";
import StructureTree from "../scene/StructureTree";
import ModelStatisticsCard from "../scene/ModelStatisticsCard";
import MaterialProperties from "../material/MaterialProperties";
import MaterialVariants from "../variant/MaterialVariants";
import ModelViewer from "../ModelViewer";
import ViewerControls from "../ViewerControls";
import HotspotManager from "../hotspots/HotspotManager";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { Hotspot, Vector3 } from "@/types/hotspots";

// Define panel configuration for easier management
const PANEL_CONFIG = {
  scene: {
    tabsetId: "scene-panel",
    tabId: "scene-tab",
    component: "scene",
    name: "Scene",
    dockLocation: DockLocation.LEFT,
    targetId: "viewer-panel",
  },
  materials: {
    tabsetId: "materials-panel",
    tabId: "materials-tab",
    component: "materials",
    name: "Materials",
    dockLocation: DockLocation.RIGHT,
    targetId: "viewer-panel",
  },
  variants: {
    tabsetId: "variants-panel",
    tabId: "variants-tab",
    component: "variants",
    name: "Variants",
    dockLocation: DockLocation.RIGHT,
    targetId: "viewer-panel",
  },
  comments: {
    tabsetId: "comments-panel",
    tabId: "comments-tab",
    component: "comments",
    name: "Comments",
    dockLocation: DockLocation.RIGHT,
    targetId: "viewer-panel",
  },
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
    enableEdgeDock: true,
  },
  borders: [],
  layout: {
    type: "row",
    weight: 100,
    children: [
      {
        type: "tabset",
        weight: 15,
        id: "scene-panel",
        children: [
          {
            type: "tab",
            name: "Scene",
            component: "scene",
            id: "scene-tab",
            enableClose: false, // Disable close button
            enablePopout: true,
          },
        ],
      },
      {
        type: "tabset",
        weight: 70,
        id: "viewer-panel",
        children: [
          {
            type: "tab",
            name: "3D Viewer",
            component: "viewer",
            id: "viewer-tab",
            enableClose: false, // Disable close button
            enablePopout: true,
          },
        ],
      },
      {
        type: "row",
        weight: 15,
        children: [
          {
            type: "tabset",
            weight: 33,
            id: "materials-panel",
            children: [
              {
                type: "tab",
                name: "Materials",
                component: "materials",
                id: "materials-tab",
                enableClose: false, // Disable close button
                enablePopout: true,
              },
            ],
          },
          {
            type: "tabset",
            weight: 33,
            id: "variants-panel",
            children: [
              {
                type: "tab",
                name: "Variants",
                component: "variants",
                id: "variants-tab",
                enableClose: false, // Disable close button
                enablePopout: true,
              },
            ],
          },
          {
            type: "tabset",
            weight: 34,
            id: "comments-panel",
            children: [
              {
                type: "tab",
                name: "Comments",
                component: "comments",
                id: "comments-tab",
                enableClose: false, // Disable close button
                enablePopout: true,
              },
            ],
          },
        ],
      },
    ],
  },
};

interface FlexLayoutProps {
  modelStructure: any;
  selectedNode: any;
  modelViewerRef: React.RefObject<any>;
  onNodeSelect: (node: any) => void;
  onModelLoaded: () => void;
  onVariantChange: () => void;
  activeEnvironment: "v5" | "v6" | "synsam" | null;
  exposure: number;
  onExposureChange: (value: number) => void;
  toneMapping: string;
  onToneMappingChange: (value: string) => void;
  hotspots: Hotspot[];
  selectedHotspotId: string | null;
  isAddingHotspot: boolean;
  onHotspotCreate: (position: Vector3) => void;
  onHotspotSelect: (hotspotId: string | null) => void;
  onHotspotUpdate: (hotspotId: string, comment: string) => void;
  onHotspotDelete: (hotspotId: string) => void;
  onHotspotToggleVisibility: (hotspotId: string) => void;
  onToggleAddMode: () => void;
}

// Simple hook to replace useLayoutPersistence
const useLayout = (defaultLayout: IJsonModel) => {
  const [model, setModel] = useState<Model | null>(null);

  // Just load the default layout on mount, no persistence
  useEffect(() => {
    try {
      // Always use the default layout
      setModel(Model.fromJson(defaultLayout));
      console.log("Default layout loaded");
    } catch (e) {
      console.error("Failed to load default layout", e);
    }
  }, [defaultLayout]);

  // Function to reset to default layout (for UI reset button)
  const resetLayout = () => {
    try {
      setModel(Model.fromJson(defaultLayout));
      console.log("Layout reset to default");
    } catch (e) {
      console.error("Failed to reset layout", e);
    }
  };

  return {
    model,
    resetLayout,
  };
};

const FlexLayout: React.FC<FlexLayoutProps> = ({
  modelStructure,
  selectedNode,
  modelViewerRef,
  onNodeSelect,
  onModelLoaded,
  onVariantChange,
  activeEnvironment,
  exposure,
  onExposureChange,
  toneMapping,
  onToneMappingChange,
  hotspots,
  selectedHotspotId,
  isAddingHotspot,
  onHotspotCreate,
  onHotspotSelect,
  onHotspotUpdate,
  onHotspotDelete,
  onHotspotToggleVisibility,
  onToggleAddMode,
}) => {
  const layoutRef = useRef<Layout>(null);
  const { model, resetLayout } = useLayout(initialJson);
  const [resizing, setResizing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [variantChangeCounter, setVariantChangeCounter] = useState(0); // Add this state

  const handleVariantChange = () => {
    console.log("Variant changed, updating material panel");
    // Increment the counter to force MaterialProperties to re-render
    setVariantChangeCounter((prev) => prev + 1);
    // Also call the parent's onVariantChange if it exists
    if (onVariantChange) {
      onVariantChange();
    }
  };

  // Simplified model change handler
  const handleModelChange = useCallback((newModel: Model, action: Action) => {
    // Simply update the parent component with the new model
    // Log other actions but don't try to fix them
    if (
      action.type === "FlexLayout_MoveNode" ||
      action.type === "FlexLayout_AddNode" ||
      action.type === "FlexLayout_PopoutTab" ||
      action.type === "FlexLayout_PopoutTabset"
    ) {
      console.log(`Layout action: ${action.type}`);
    }
  }, []);

  // Define the components that will be used in the layout
  const factory = (node: TabNode) => {
    const component = node.getComponent();

    switch (component) {
      case "scene":
        return (
          <div className="h-full flex flex-col bg-[#FAFAFA]">
            <div className="flex-shrink-0 p-4 pb-2">
              <h3 className="text-sm font-medium">Scene Hierarchy</h3>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {modelStructure ? (
                <StructureTree
                  node={modelStructure}
                  onNodeSelect={onNodeSelect}
                  selectedNode={selectedNode}
                />
              ) : (
                <p className="text-gray-600 text-xs">
                  No model loaded or structure data not available.
                </p>
              )}
            </div>
          </div>
        );

      case "viewer":
        return (
          <div
            className={`h-full bg-[#EFEFEF] relative ${
              resizing ? "pointer-events-none" : ""
            }`}
          >
            <ModelViewer 
              onModelLoaded={onModelLoaded}
              {...({
                hotspots,
                isAddingHotspot,
                onHotspotCreate,
                selectedHotspotId,
                onHotspotSelect,
              } as any)}
            />
            <ModelStatisticsCard
              modelViewerRef={modelViewerRef}
              modelStructure={modelStructure}
            />
            <ViewerControls
              activeEnvironment={activeEnvironment}
              exposure={exposure}
              onExposureChange={onExposureChange}
              toneMapping={toneMapping}
              onToneMappingChange={onToneMappingChange}
            />
          </div>
        );

      case "materials":
        return (
          <div className="h-full flex flex-col bg-[#FAFAFA]">
            <div className="flex-shrink-0 p-4 pb-2">
              <h3 className="text-sm font-medium mb-2">Material Properties</h3>
              {selectedNode && (
                <div className="text-xs text-gray-600">
                  Selected: {selectedNode.name} ({selectedNode.type})
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {selectedNode ? (
                <MaterialProperties
                  selectedNode={selectedNode}
                  modelViewerRef={modelViewerRef}
                  variantChangeCounter={variantChangeCounter} // Pass the counter
                />
              ) : (
                <div className="text-gray-600 text-xs">
                  Select a mesh to view its material properties.
                </div>
              )}
            </div>
          </div>
        );

      case "variants":
        return (
          <div className="h-full flex flex-col bg-[#FAFAFA]">
            <div className="flex-shrink-0 p-4 pb-2">
              <h3 className="text-sm font-medium">Variants</h3>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <MaterialVariants
                modelViewerRef={modelViewerRef}
                onVariantChange={handleVariantChange} // Use local handler
                selectedNode={selectedNode} // Pass selectedNode
              />
            </div>
          </div>
        );

      case "comments":
        return (
          <div className="h-full flex flex-col bg-[#FAFAFA]">
            <HotspotManager
              hotspots={hotspots}
              selectedHotspotId={selectedHotspotId}
              onHotspotSelect={onHotspotSelect}
              onHotspotUpdate={onHotspotUpdate}
              onHotspotDelete={onHotspotDelete}
              onHotspotToggleVisibility={onHotspotToggleVisibility}
              isAddingHotspot={isAddingHotspot}
              onToggleAddMode={onToggleAddMode}
            />
          </div>
        );

      default:
        return <div>Unknown component: {component}</div>;
    }
  };

  // Apply custom styling to match rounded theme
  const customStyle = {
    "--color-text": "var(--text)",
    "--color-background": "var(--background)",
    "--color-base": "var(--background)",
    "--color-1": "var(--sidebar)",
    "--color-2": "var(--sidebar)",
    "--color-3": "var(--sidebar-border)",
    "--color-4": "var(--viewer)",
    "--color-5": "var(--sidebar-border)",
    "--color-6": "var(--flex-accent)",
    "--color-drag1": "rgba(100, 116, 139, 0.3)",
    "--color-drag2": "rgba(100, 116, 139, 0.5)",
    "--color-drag1-border": "var(--flex-accent)",
    "--color-drag2-border": "var(--flex-accent)",
    "--font-family": "var(--font-jost), sans-serif",
    "--border-radius": "0.375rem",
    "--border-radius-tabset": "0.375rem",
    "--border-radius-tab": "0.25rem",
  } as React.CSSProperties;

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
        onClick={resetLayout}
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
