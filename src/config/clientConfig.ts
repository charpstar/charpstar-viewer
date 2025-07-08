// src/config/clientConfig.ts

// Comprehensive client configuration interface
export interface ClientConfig {
  // Basic info
  name: string;
  description?: string;

  // URLs and paths
  modelUrl: string;
  hdrPath: string;
  scriptPath: string;
  resourcesPath: string;

  // Security
  livePassword: string;

  // Model viewer display settings
  exposure: number;
  toneMapping: string;

  // BunnyCDN specific paths
  bunnyCdn: {
    basePath: string;
    resourcesFolder: string;
    imagesFolder: string;
  };
}

// Default configuration to use as fallback
const DEFAULT_CONFIG: ClientConfig = {
  name: "Default",
  description: "Default Configuration",
  modelUrl: "",
  hdrPath: "https://cdn.charpstar.net/HDR/default.hdr",
  scriptPath: "/model-viewer.js",
  resourcesPath: "",
  livePassword: "",
  exposure: 1.0,
  toneMapping: "neutral",
  bunnyCdn: {
    basePath: "Client-Editor/Default",
    resourcesFolder: "resources",
    imagesFolder: "images",
  },
};

// Client-specific configurations
export const clients: Record<string, ClientConfig> = {
  SweefV2: {
    name: "SweevV2",
    description: "Sweef Editor",
    modelUrl: "https://cdn.charpstar.net/Client-Editor/SweefV2/TIG-2.gltf",
    hdrPath: "https://sweef.charpstar.net/HDR/Sweef-HDR.hdr",
    scriptPath: "/sweef-viewer-13.js",
    resourcesPath: "SweefV2",
    livePassword: "sweef2024",
    exposure: 1.4,
    toneMapping: "auto",
    bunnyCdn: {
      basePath: "Client-Editor/SweefV2",
      resourcesFolder: "resources",
      imagesFolder: "images",
    },
  },
  Artwood: {
    name: "Artwood",
    description: "Artwood Editor",
    modelUrl:
      "https://cdn.charpstar.net/Client-Editor/Artwood/7844-4401-2.gltf",
    hdrPath: "https://cdn.charpstar.net/Demos/HDR_Furniture.hdr",
    scriptPath: "/model-viewer.js",
    resourcesPath: "Artwood",
    livePassword: "artwood2024",
    exposure: 1.5,
    toneMapping: "aces",
    bunnyCdn: {
      basePath: "Client-Editor/Artwood",
      resourcesFolder: "resources",
      imagesFolder: "images",
    },
  },
  GS: {
    name: "GeorgeSmith",
    description: "GeorgeSmith Editor",
    modelUrl: "https://cdn.charpstar.net/GeorgeSmith/Editor/C001M.gltf",
    hdrPath: "https://cdn.charpstar.net/Demos/HDR_Furniture.hdr",
    scriptPath: "/model-viewer.js",
    resourcesPath: "GSmith",
    livePassword: "GSmith2024",
    exposure: 1.2,
    toneMapping: "aces",
    bunnyCdn: {
      basePath: "GeorgeSmith/Editor",
      resourcesFolder: "resources",
      imagesFolder: "images",
    },
  },
};

// Helper function to get client configuration
export const getClientConfig = (clientName: string): ClientConfig => {
  return clients[clientName] || DEFAULT_CONFIG;
};

// Helper function to get the default client name
export const getDefaultClientName = (): string => {
  return Object.keys(clients)[0] || "SweefV2";
};

// Helper to check if a client should use the Sweef viewer
export const usesSweefViewer = (clientName: string): boolean => {
  return getClientConfig(clientName).scriptPath === "/sweef-viewer-13.js";
};

// Helper to check if a client is valid
export const isValidClient = (clientName: string): boolean => {
  return Object.keys(clients).includes(clientName);
};
