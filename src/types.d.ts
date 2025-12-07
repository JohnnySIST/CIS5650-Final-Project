declare module '*.wgsl' {
  const shader: string;
  export default shader;
}

declare module "*.wgsl?raw" {
  const content: string;
  export default content;
}