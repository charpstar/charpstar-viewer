// src/types/hotspots.ts

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Hotspot {
  id: string;
  position: Vector3; // 3D world position in model coordinates
  comment: string;
  timestamp: Date;
  visible: boolean;
}

export interface HotspotState {
  hotspots: Hotspot[];
  selectedHotspotId: string | null;
  isAddingHotspot: boolean;
} 