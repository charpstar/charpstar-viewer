export interface QAAnnotation {
  id: string;
  position: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  text: string;
  severity: "low" | "medium" | "high";
}
