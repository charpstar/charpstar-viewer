// global declaration for <model-viewer> so JSX recognizes it everywhere
declare namespace JSX {
  interface IntrinsicElements {
    'model-viewer': React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        src?: string;
        alt?: string;
        id?: string;
        style?: React.CSSProperties;
        'camera-controls'?: boolean;
        'auto-rotate'?: boolean;
        'disable-pan'?: boolean;
        'environment-image'?: string;
        'exposure'?: string | number;
        'tone-mapping'?: 'neutral' | 'aces' | (string & {});
        'shadow-intensity'?: string | number;
        'interaction-prompt'?: 'auto' | 'none' | 'when-focused' | (string & {});
      },
      HTMLElement
    >;
  }
}


