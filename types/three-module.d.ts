// Type shim for runtime-loaded local Three.js ESM at /three.module.js
// We re-export typings from the npm 'three' package so TS can infer types.
declare module '/three.module.js' {
  export * from 'three'; 
}


