/// <reference types="vite/client" />

declare module "*.svg" {
  const src: string;
  export default src;
}

declare module "*.yaml?raw" {
  const source: string;
  export default source;
}
