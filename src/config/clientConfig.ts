// src/config/clientConfig.ts

// Comprehensive client configuration interface
export interface ClientConfig {
  // Basic info
  name: string;
  description?: string;
  
  // URLs and paths
  modelUrl: string;
  hdrPath: string;
  resourcesPath: string;
  
  // Security
  livePassword: string;
  
  // Model viewer display settings
  exposure: number;
  toneMapping: string;
  
  // BunnyCDN specific paths
  bunnyCdn: {
    basePath: string;          
    imagesFolder: string;      
  };
}

// Default configuration to use as fallback
const DEFAULT_CONFIG: ClientConfig = {
  name: "Default",
  description: "Default Configuration",
  modelUrl: "",
  hdrPath: "https://cdn.charpstar.net/HDR/default.hdr",
  resourcesPath: "",
  livePassword: "",
  exposure: 1.0,
  toneMapping: "neutral",
  bunnyCdn: {
    basePath: "Client-Editor/Default",
    imagesFolder: "images"
  }
};

// Client-specific configurations
export const clients: Record<string, ClientConfig> = {
  Artwood: {
    name: "Artwood",
    description: "Artwood Editor",
    modelUrl: "https://cdn.charpstar.net/Client-Editor/Artwood/7844-4401-2.gltf",
    hdrPath: "https://cdn.charpstar.net/Demos/HDR_Furniture.hdr",
    resourcesPath: "Artwood",
    livePassword: "artwood2024",
    exposure: 1.5,
    toneMapping: "aces",
    bunnyCdn: {
      basePath: "Client-Editor/Artwood",
      imagesFolder: "images"
    }
  },
  Sweef: {
    name: "Sweef",
    description: "Sweef Editor",
    modelUrl: "https://cdn.charpstar.net/Client-Editor/Sweef/TIG-2.gltf",
    hdrPath: "https://sweef.charpstar.net/HDR/Sweef-HDR.hdr",
    resourcesPath: "Sweef",
    livePassword: "sweef2024",
    exposure: 1.4,
    toneMapping: "aces",
    bunnyCdn: {
      basePath: "Client-Editor/Sweef",
      imagesFolder: "images"
    }
  },
};

// Helper function to get client configuration
export const getClientConfig = (clientName: string): ClientConfig => {
  return clients[clientName] || DEFAULT_CONFIG;
};

// Helper function to get the default client name
export const getDefaultClientName = (): string => {
  return Object.keys(clients)[0] || 'SweefV2';
};


// Helper to check if a client is valid
export const isValidClient = (clientName: string): boolean => {
  return Object.keys(clients).includes(clientName);
}; 