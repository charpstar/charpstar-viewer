// src/config/clients.ts
export interface ClientConfig {
  name: string;
  modelUrl: string;
  description?: string;
}

export const clients: Record<string, ClientConfig> = {
  Artwood: {
    name: "1",
    modelUrl: "https://cdn.charpstar.net/Client-Editor/Artwood/Art1.gltf",
    description: "Artwood Editor"
  },
  SweefV2: {
    name: "1",
    modelUrl: "https://cdn.charpstar.net/Client-Editor/SweefV2/TIG-2.gltf",
    description: "Sweef Editor"
  }
 
};

export const isValidClient = (clientName: string): boolean => {
  return Object.keys(clients).includes(clientName);
};