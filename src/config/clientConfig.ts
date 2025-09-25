// src/config/clientConfig.ts

// Comprehensive client configuration interface
export interface ClientConfig {
  // Basic info
  name: string;
  description?: string;
  
  // URLs and paths
  hdrPath: string;
  resourcesPath: string;
  
  // Security
  livePassword: string;
  
  // Model viewer display settings
  exposure: number;
  toneMapping: string;
  
  // BunnyCDN specific paths
  bunnyCdn: {
    modelPath: string;         
    imagesPath: string;        
    referencePath: string;     
    backupsPath: string;       
    publicBaseUrl: string;     
  };
}

// Default configuration to use as fallback
const DEFAULT_CONFIG: ClientConfig = {
  name: "Default",
  description: "Default Configuration",
  hdrPath: "https://cdn.charpstar.net/HDR/default.hdr",
  resourcesPath: "",
  livePassword: "",
  exposure: 1.0,
  toneMapping: "neutral",
  bunnyCdn: {
    modelPath: "Client-Editor/Default",
    imagesPath: "Client-Editor/Default/images",
    referencePath: "Client-Editor/Default/reference/reference.gltf",
    backupsPath: "Client-Editor/Default/reference/backup",
    publicBaseUrl: "https://cdn.charpstar.net"
  }
};

// Client-specific configurations
export const clients: Record<string, ClientConfig> = {
  Artwood: {
    name: "Artwood",
    description: "Artwood Editor",
    hdrPath: "https://cdn.charpstar.net/Demos/HDR_Furniture.hdr",
    resourcesPath: "Artwood",
    livePassword: "artwood2024",
    exposure: 1.5,
    toneMapping: "aces",
    bunnyCdn: {
      modelPath: "Client-Editor/Artwood",
      imagesPath: "Client-Editor/Artwood/images",
      referencePath: "Client-Editor/Artwood/reference/reference.gltf",
      backupsPath: "Client-Editor/Artwood/reference/backup",
      publicBaseUrl: "https://cdn.charpstar.net"
    }
  },
  Sweef: {
    name: "Sweef",
    description: "Sweef Editor",
    hdrPath: "https://sweef.charpstar.net/HDR/Sweef-HDR.hdr",
    resourcesPath: "Sweef",
    livePassword: "sweef2024",
    exposure: 1.4,
    toneMapping: "aces",
    bunnyCdn: {
      modelPath: "Client-Editor/Sweef",
      imagesPath: "Client-Editor/Sweef/images",
      referencePath: "Client-Editor/Sweef/reference/reference.gltf",
      backupsPath: "Client-Editor/Sweef/reference/backup",
      publicBaseUrl: "https://cdn.charpstar.net"
    }
  },
  Georgesmith: {
    name: "Georgesmith",
    description: "GeorgeSmith Editor",
    hdrPath: "https://cdn.charpstar.net/Demos/HDR_Furniture.hdr",
    resourcesPath: "Georgesmith",
    livePassword: "gs2024",
    exposure: 1.2,
    toneMapping: "commerce",
    bunnyCdn: {
      modelPath: "Client-Editor/Georgesmith",
      imagesPath: "Client-Editor/Georgesmith/images",
      referencePath: "Client-Editor/Georgesmith/reference/reference.gltf",
      backupsPath: "Client-Editor/Georgesmith/reference/backup",
      publicBaseUrl: "https://cdn.charpstar.net"
    }
  },
  NordicNest: {
    name: "NordicNest",
    description: "NordicNest Editor",
    hdrPath: "https://cdn.charpstar.net/Demos/HDR_Furniture.hdr",
    resourcesPath: "NordicNest",
    livePassword: "ns2024",
    exposure: 1.2,
    toneMapping: "aces",
    bunnyCdn: {
      modelPath: "Client-Editor/NordicNest",
      imagesPath: "Client-Editor/NordicNest/images",
      referencePath: "Client-Editor/NordicNest/reference/reference.gltf",
      backupsPath: "Client-Editor/NordicNest/reference/backup",
      publicBaseUrl: "https://cdn.charpstar.net"
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