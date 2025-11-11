declare module 'draco3dgltf';
declare module '/three.module.js';

// src/types/global.d.ts

// Add model-viewer to the JSX namespace globally
declare namespace JSX {
  interface IntrinsicElements {
    'model-viewer': React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        src?: string;
        alt?: string;
        'camera-controls'?: boolean | "";
        'auto-rotate'?: boolean | "";
        'disable-pan'?: boolean | "";
        'shadow-intensity'?: string;
        'shadow-softness'?: string;
        'environment-image'?: string;
        exposure?: string;
        'tone-mapping'?: string;
        'camera-orbit'?: string;
        'min-field-of-view'?: string;
        'max-field-of-view'?: string;
        'ar-status'?: string;
        id?: string;
        style?: React.CSSProperties;
        ref?: React.RefObject<any>;
        onError?: (event: Event) => void;
      },
      HTMLElement
    >;
  }
}

// Add custom properties to the Window interface
interface Window {
  modelViewerElement?: any;
  currentFileName?: string;
}