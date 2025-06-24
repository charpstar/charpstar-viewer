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
        'auto-rotate-delay'?: string;
        'rotation-per-second'?: string;
        'disable-pan'?: boolean | "";
        'camera-orbit'?: string;
        'min-camera-orbit'?: string;
        'max-camera-orbit'?: string;
        'field-of-view'?: string;
        'min-field-of-view'?: string;
        'max-field-of-view'?: string;
        'shadow-intensity'?: string;
        'shadow-softness'?: string;
        'environment-image'?: string;
        exposure?: string;
        'tone-mapping'?: string;
        'ar'?: boolean | "";
        'ar-modes'?: string;
        'camera-target'?: string;
        id?: string;
        style?: React.CSSProperties;
        ref?: React.RefObject<any>;
        onError?: (event: Event) => void;
        onLoad?: (event: Event) => void;
        onProgress?: (event: Event) => void;
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