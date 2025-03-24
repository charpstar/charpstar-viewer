// types/model-viewer.d.ts

// Define the custom element
declare namespace JSX {
  interface IntrinsicElements {
    'model-viewer': React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        src?: string;
        alt?: string;
        'camera-controls'?: boolean;
        'auto-rotate'?: boolean;
        id?: string;
        style?: React.CSSProperties;
      },
      HTMLElement
    >;
  }
}