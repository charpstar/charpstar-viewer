// src/components/layout/Header.tsx
"use client";

import React from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Download, PanelLeft, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { Model } from "flexlayout-react";

interface HeaderProps {
  modelViewerRef: React.RefObject<any>;
  layoutModel: Model | null;
  onExportGLB: () => void;
  onExportGLTF: () => void;
  onExportUSDZ: () => void;
  onEnvironmentChange: (type: "v5" | "v6" | "synsam") => void;
  activeEnvironment: "v5" | "v6" | "synsam" | null;
  visiblePanels: {
    scene: boolean;
    materials: boolean;
    variants: boolean;
  };
  onTogglePanel: (panel: "scene" | "materials" | "variants") => void;
  exposure: number;
  onExposureChange: (value: number) => void;
  toneMapping: string;
  onToneMappingChange: (value: string) => void;
}

const Header: React.FC<HeaderProps> = ({
  modelViewerRef,
  layoutModel,
  onExportGLB,
  onExportGLTF,
  onExportUSDZ,
  onEnvironmentChange,
  activeEnvironment,
  visiblePanels,
  onTogglePanel,
  exposure,
  onExposureChange,
  toneMapping,
  onToneMappingChange,
}) => {
  // Handle panel toggle with immediate UI feedback
  const handlePanelToggle = (panel: "scene" | "materials" | "variants") => {
    // Call the toggle function from props
    onTogglePanel(panel);
  };

  return (
    <header className="h-14 bg-[#FAFAFA] text-[#111827] flex items-center justify-between px-4 border-b border-gray-200 shadow-sm w-full">
      <div className="flex items-center">
        <Image src="/logo.svg" alt="Charpstar Logo" width={100} height={30} />
      </div>

      <div className="flex items-center space-x-4">
        {/* Panel Toggle Dropdown Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="text-xs h-8">
              <PanelLeft size={14} className="mr-1" />
              Panels
              <ChevronsUpDown size={14} className="ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuLabel>Toggle Panels</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={visiblePanels.scene}
              onCheckedChange={() => handlePanelToggle("scene")}
            >
              Scene Hierarchy
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={visiblePanels.materials}
              onCheckedChange={() => handlePanelToggle("materials")}
            >
              Material Properties
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={visiblePanels.variants}
              onCheckedChange={() => handlePanelToggle("variants")}
            >
              Material Variants
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Environment Toggles */}
        <div className="flex space-x-2 border-x px-4">
          <Button
            variant={activeEnvironment === "v5" ? "default" : "outline"}
            size="sm"
            onClick={() => onEnvironmentChange("v5")}
            className="text-xs h-8"
          >
            V5 Tester
          </Button>
          <Button
            variant={activeEnvironment === "v6" ? "default" : "outline"}
            size="sm"
            onClick={() => onEnvironmentChange("v6")}
            className="text-xs h-8"
          >
            V6 ACES Tester
          </Button>
          <Button
            variant={activeEnvironment === "synsam" ? "default" : "outline"}
            size="sm"
            onClick={() => onEnvironmentChange("synsam")}
            className="text-xs h-8"
          >
            Synsam Tester
          </Button>
        </div>

        {/* Environment Controls - Only show for V5/V6 */}
        {(activeEnvironment === "v5" || activeEnvironment === "v6") && (
          <div className="flex items-center space-x-4 border-x px-4">
            {/* Exposure Slider */}
            <div className="flex items-center space-x-2">
              <label className="text-xs font-medium">Exposure:</label>
              <div className="w-20">
                <Slider
                  value={[exposure]}
                  onValueChange={(value) => onExposureChange(value[0])}
                  min={0.1}
                  max={3.0}
                  step={0.1}
                  className="w-full"
                />
              </div>
              <span className="text-xs w-8 text-right">
                {exposure.toFixed(1)}
              </span>
            </div>

            {/* Tone Mapping Dropdown */}
            <div className="flex items-center space-x-2">
              <label className="text-xs font-medium">Tone Mapping:</label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 min-w-20"
                  >
                    {toneMapping.charAt(0).toUpperCase() + toneMapping.slice(1)}
                    <ChevronsUpDown size={14} className="ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Tone Mapping</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup
                    value={toneMapping}
                    onValueChange={onToneMappingChange}
                  >
                    <DropdownMenuRadioItem value="neutral">
                      Neutral
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="aces">
                      ACES
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="agx">
                      AgX
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="cineon">
                      Cineon
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="reinhard">
                      Reinhard
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="linear">
                      Linear
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="none">
                      None
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}

        {/* Export Buttons */}
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onExportGLB}
            className="text-xs h-8"
          >
            <Download size={14} className="mr-1" />
            GLB
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onExportGLTF}
            className="text-xs h-8"
          >
            <Download size={14} className="mr-1" />
            GLTF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onExportUSDZ}
            className="text-xs h-8"
          >
            <Download size={14} className="mr-1" />
            USDZ
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;
