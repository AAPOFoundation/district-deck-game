// Registry leaf: safe to import before the landmark loader or placement module.
export const SOUTHERN_CROSS_MODELS = Object.freeze([
  Object.freeze({ id: 'southern-cross', url: './assets/models/landmarks/southern-cross.glb', source: 'landmark-blender' }),
  Object.freeze({ id: 'southern-cross-far', switch: 'southern-cross', url: './assets/models/landmarks/southern-cross-lod1.glb', source: 'landmark-blender', lod: 1 }),
]);
