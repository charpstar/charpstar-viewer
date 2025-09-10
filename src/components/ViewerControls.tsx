"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";

interface ViewerControlsProps {
  activeEnvironment: "v5" | "v6" | "synsam" | null;
  exposure: number;
  onExposureChange: (value: number) => void;
  toneMapping: string;
  onToneMappingChange: (value: string) => void;
}

const ViewerControls: React.FC<ViewerControlsProps> = ({
  activeEnvironment,
  exposure,
  onExposureChange,
  toneMapping,
  onToneMappingChange,
}) => {
  // Only show for V5/V6 environments
  if (activeEnvironment !== "v5" && activeEnvironment !== "v6") {
    return null;
  }

  return (
    <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg border p-3 flex flex-col space-y-3 min-w-64 z-10">
      {/* Exposure Slider */}
      <div className="flex items-center space-x-3">
        <label className="text-xs font-medium text-gray-700 min-w-16">
          Exposure:
        </label>
        <div className="flex-1">
          <Slider
            value={[exposure]}
            onValueChange={(value) => onExposureChange(value[0])}
            min={0.1}
            max={3.0}
            step={0.1}
            className="w-full"
          />
        </div>
        <span className="text-xs text-gray-600 min-w-8 text-right">
          {exposure.toFixed(1)}
        </span>
      </div>

      {/* Tone Mapping Dropdown */}
      <div className="flex items-center space-x-3">
        <label className="text-xs font-medium text-gray-700 min-w-16">
          Tone Mapping:
        </label>
        <div className="flex-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 w-full justify-between"
              >
                {toneMapping.charAt(0).toUpperCase() + toneMapping.slice(1)}
                <ChevronsUpDown size={12} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-40">
              <DropdownMenuLabel>Tone Mapping</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={toneMapping}
                onValueChange={onToneMappingChange}
              >
                <DropdownMenuRadioItem value="neutral">
                  Neutral
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="aces">ACES</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="agx">AgX</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="cineon">
                  Cineon
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="reinhard">
                  Reinhard
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="linear">
                  Linear
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="none">None</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
};

export default ViewerControls;
