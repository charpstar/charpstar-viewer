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
} from "@/components/ui/dropdown-menu";
import { Model } from "flexlayout-react";

interface HeaderProps {
  modelViewerRef: React.RefObject<any>;
  layoutModel: Model | null;
  onExportGLB: () => void;
  onExportGLTF: () => void;
  onExportUSDZ: () => void;
  onEnvironmentChange: (type: "v5" | "v6") => void;
  activeEnvironment: "v5" | "v6" | null;
  onSynsamMode: () => void;
}

const Header: React.FC<HeaderProps> = ({
  modelViewerRef,
  layoutModel,
  onExportGLB,
  onExportGLTF,
  onExportUSDZ,
  onEnvironmentChange,
  activeEnvironment,
  onSynsamMode,
}) => {
  return (
    <header className="h-14 bg-[#FAFAFA] text-[#111827] flex items-center justify-between px-4 border-b border-gray-200 shadow-sm w-full">
      <div className="flex items-center">
        <Image src="/logo.svg" alt="Charpstar Logo" width={100} height={30} />
      </div>

      <div className="flex items-center space-x-4">
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
            variant={activeEnvironment === null ? "default" : "outline"}
            size="sm"
            onClick={onSynsamMode}
            className="text-xs h-8"
          >
            Synsam
          </Button>
        </div>

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
