// V4.0 Wave P1 — world-rendering polish constants.
// Render-only. No simulation state. Numbers are the source of truth for tests.

import * as THREE from 'three';

/** GTAO + contact-shadow + baked footing. Applied in post.js / scene.js / kits. */
export const P1_GROUNDING = Object.freeze({
  aoIntensity: 2.90,
  aoRadiusNear: 0.42,
  // R8: retain crease reach; a full-resolution receiver gate limits its application.
  aoRadiusFar: 2.05,
  aoApplyStrength: 0.88,
  contactDarkness: 0.56,
  contactLength: 3.65,
  contactDecalOpacity: 0.66,
  contactTextureCentre: 0.76,
  footingBandH: 0.038,
  footingOverhang: 0.62,
  kerbAoWidth: 0.22,
  pedestrianContactOpacity: 0.34,
  globeBlobOpacity: 0.42,
  globeBlobRadius: 0.055,
  /** Extra spread past the mesh footprint so the blob reads as a contact, not a sticker. */
  contactPad: 1.14,
  /** World-Y of decal planes. Above the pavement, below the first kerb lip. */
  contactY: 0.028,
  vehicleContactOpacity: 0.49,
  propContactWidth: 1.05,
});

/**
 * Linear distance fog. BEFORE scene.js: near = extent.x * 3.2, far = extent.x * 6.5,
 * colour `#6a8aaa` then overwritten by lighting.js to ~linear (0.0038, 0.0036, 0.0044).
 * That pair never reached the 272 m board (near ~870 m, camera far 2000).
 */
export const P1_FOG = Object.freeze({
  nearMul: 0.34,
  farMul: 1.22,
  r: 0.155,
  g: 0.138,
  b: 0.118,
  horizonMix: 0.16,
});

/** R9 city grade atmosphere: view-space metres; energy-limited warm-grey haze. */
export const R9_ATMOS = Object.freeze({
  nearM: 90,
  cityFarM: 180,
  boardFarM: 450,
  cityHaze: 0.18,
  boardHaze: 0.25,
  hazeTint: Object.freeze([0.62, 0.59, 0.54]),
  hazeLumaLift: 1.08,
  saturation: 0.92,
  nearSaturation: 1.0,
  nearContrast: 1.005,
  shoulderStart: 0.80,
  shoulderRange: 0.20,
  keyRGB: Object.freeze([1.08, 1.0, 0.94]),
  fillRGB: Object.freeze([0.98, 1.0, 1.04]),
});

/** Shift light chroma while preserving its linear Rec.709 energy. */
export function r9LightColor(source, rgb, target) {
  const luma = c => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
  const energy = luma(source);
  target.copy(source);
  target.r *= rgb[0]; target.g *= rgb[1]; target.b *= rgb[2];
  return target.multiplyScalar(energy / Math.max(luma(target), 1e-8));
}

/**
 * P16 L1 layered aerial perspective. Distances are metres behind the live fog-near datum,
 * which follows the camera focus plane in scene.js: the near city therefore stays ungraded at
 * board-wide while the hinterland separates into mid and far bands. The short blend shoulders
 * prevent a visible contour at 120 / 300 m without changing either authored plateau.
 */
export const P1_AERIAL = Object.freeze({
  nearEndM: 120,
  midFullM: 150,
  farStartM: 300,
  farFullM: 360,
  midSaturation: 0.92,
  farSaturation: 0.80,
  midLumaLift: 1.04,
  farLumaLift: 1.10,
  midCoolShift: 0.03,
  farCoolShift: 0.08,
  /** Roof height fades the atmospheric response, keeping silhouettes and local relief crisp. */
  crispHeightStartM: 3,
  crispHeightFullM: 24,
  roofResponse: 0.62,
});

/** Highlight clamp applied in MaterialLibrary._create. Does not retexture families. */
export const P1_HIGHLIGHT = Object.freeze({
  minRoughnessOpaque: 0.20,
  minRoughnessGlass: 0.12,
  maxClearcoat: 0.22,
  maxEnvBase: 1.18,
  /**
   * Day-glass sky-catch floor. Lanes pass envBase 0.12–0.42 on panes; without a
   * floor those become unlit holes. Ceiling `maxEnvBase` still holds the top.
   */
  minEnvGlass: 1.10,
  specularIntensity: 0.62,
});

/**
 * V4.9 Lane F — grungy Monopoly Plus register (tone down the mud).
 * Derived from mvp/_reviews/aaa-loop/grunge-refs/REGISTER.md before this
 * object was wired. Wear is structure (seams, streaks, edge lift), not a
 * global brown multiply. P1_HIGHLIGHT clamps stay the create-time law.
 */
export const P4_GRUNGE = Object.freeze({
  saturation: 1.24,
  saturationArc: 0.02,
  contrast: 1.36,
  contrastWarmth: 0.04,
  shadowTint: Object.freeze([0.90, 0.97, 1.08]),
  shadowTintWarmth: 0.015,
  highlightTint: Object.freeze([1.06, 1.01, 0.94]),
  highlightTintWarmth: 0.04,
  midtoneSatBoost: 0.08,
  pivot: 0.380,
  toe: Object.freeze([0.995, 1.000, 1.008]),
  /** Display-referred shadow floor. Was a hardcoded 0.012; contrast 1.36 clipped it to void. */
  lift: 0.055,
  vignette: 0.22,
  grainAmount: 0.010,
  grimeAmount: 0.14,
  edgeWear: 0.16,
  roofStreak: 0.18,
  specularBreakup: 0.22,
  aoMapIntensity: 0.94,
  satMin: 1.08,
  satMax: 1.32,
  contrastMin: 1.15,
  contrastMax: 1.45,
});

/**
 * Focal light (city LightingRig solarProfile).
 * BEFORE (t any): keyIntensity 2.65+arc*1.7, fill 0.55+arc*0.35,
 * rim 0.18+warmth*0.12, keyWarmthFloor 0.16, contrast 1.18+warmth*0.04,
 * FILL_NEUTRALISE 0.82.
 */
export const P1_LIGHT = Object.freeze({
  keyIntensityBase: 2.95,
  keyIntensityArc: 1.90,
  /** Sky/ground floor so shade never reaches pure black. See LightingRig.skyFloor. */
  // P16 (2026-09-03): a floor 0.42 / fill 0.58 trial was measured and REVERTED. The same
  // p10/p60 ground statistic reads 0.46–0.50 on our port frames and 0.29–0.34 on the
  // Monopoly Plus stills — the reference's shadows are darker than ours, so the critic's
  // "black" reads were the asphalt albedo and missing shadows, not the floor. See
  // P13-PORT-LOGISTICS-PLAN.md 2026-09-03 23:50Z.
  // P19 X3 keeps L1 intensities. Midtones move through playMidtoneLift / `?exposure=`.
  // A 0.33 / 0.50 trial lifted whole-frame p10/p60 from 0.28 to 0.40 (outside the
  // MP 0.29–0.34 ± 0.03 band). Chroma (fillSkyMix, warm ground) is unchanged.
  skyFloorIntensity: 0.30,
  fillIntensityBase: 0.46,
  fillIntensityArc: 0.28,
  rimIntensityBase: 0.36,
  rimIntensityWarmth: 0.18,
  keyWarmthFloor: 0.22,
  keyWarmthHorizon: 0.14,
  fillNeutralise: 0.68,
  /** Luma-preserving move back toward the sky hue; intensities above remain untouched. */
  fillSkyMix: 0.30,
  contrastBase: 1.36,
  contrastWarmth: 0.04,
  gradeExposure: 1.06,
  /** P19 X3 midtone lift on BASE_EXPOSURE. Overridden by `?exposure=`. */
  playMidtoneLift: 1.12,
  bounceIntensityBase: 0.38,
  bounceIntensityArc: 0.22,
});

/** P23 daylight key: warm sun, crisp PCF and cool, restrained shade fill. */
export const P23_LIGHT_PHOTO = Object.freeze({
  elevation: 42 * Math.PI / 180,
  azimuth: 100 * Math.PI / 180,
  keyGain: 1.04,
  keyRGB: Object.freeze([1.08 * 1.12, 1.0, 0.94 * 0.90]),
  shadowFringe: Object.freeze([32, 80, 96, 32]), // west/east/north/south metres
  shadowHeight: Object.freeze([-12, 96]),
  shadowTexelMax: 248 / 2048,
  // PERF-CSM: preserve the 90m near density; the board-prism map covers the rest.
  shadowCascades: 2,
  shadowCascadeEnds: Object.freeze([90]),
  shadowCascadeFar: 1500,
  shadowCascadeMapSize: 1024,
  photoHazeNearM: 90,
  photoHazeFarM: 150,
  photoHazeLift: 0.32, // linear lift; measured in display luma after sRGB encoding
  photoHazeDesaturation: 0.34,
  // Display-luma anchors: retain shaded brick detail while opening the near range.
  toneInput: Object.freeze([0, 12, 28, 50, 95, 196, 255]),
  toneOutput: Object.freeze([0, 16, 24, 36, 90, 236, 248]),
  toneSaturation: 1.28,
  toneGreenSaturationMax: 0.45,
  toneHighlightMax: 0.975,
  shadowNearRadius: 0.25,
  fillGain: 0.90,
  skyGain: 0.90,
  fillRGB: Object.freeze([0.90, 0.98, 1.18]),
  hemisphereGroundRGB: Object.freeze([1.12, 1.00, 0.82]),
  hemisphereGroundGain: 2.0,
  wallNormalMax: 0.30,
  wallAoFloor: 0.40,
  shadowRadius: 0.55,
  shadowIntensity: 0.73,
  shadowBias: -0.00012,
  shadowNormalBias: 0.035,
});

/** Surface-authoring ranges. Tint is a value offset applied from the parcel seed. */
export const P1_SURFACE = Object.freeze({
  moduleTintRange: 0.09,
  ridgeCapH: 0.13,
  ridgeCapW: 0.30,
  skylightKerbH: 0.20,
  ventShaftH: 0.42,
  patinaBandH: 0.018,
});

/** Globe ocean + coast. Water was MeshStandard 0x17374c roughness 0.55 metalness 0.12. */
export const P1_OCEAN = Object.freeze({
  color: 0x246a86,
  roughness: 0.42,
  metalness: 0.16,
  foamColor: 0xd5e0d6,
  beachColor: 0xcbb892,
  foamHeight: 0.0025,
  foamLimit: 12000,
  coastMix: 0.55,
});

/**
 * Globe lamp stack. BEFORE: hemi 0xd5e0ee/0x121820 @ 1.28, ambient 0x6a7a8c @ 0.5,
 * key 0xe8eef6 @ 2.05 from (4,7,3). No fill, no rim.
 */
export const P1_GLOBE_LIGHT = Object.freeze({
  hemiSky: 0xe2d4be,
  hemiGround: 0x1a242c,
  hemiIntensity: 0.92,
  ambient: 0x3e4a56,
  ambientIntensity: 0.26,
  keyColor: 0xf3d7a8,
  keyIntensity: 2.48,
  keyPosition: Object.freeze([5.2, 4.4, 3.6]),
  fillColor: 0x6a8498,
  fillIntensity: 0.58,
  fillPosition: Object.freeze([-3.4, 2.8, -2.2]),
  rimColor: 0xdcc8a4,
  rimIntensity: 0.44,
  rimPosition: Object.freeze([-4.6, 1.6, 5.0]),
});

export const P1_RAIL_TYPE = Object.freeze({
  type1: '11px',
  type2: '12px',
  type3: '14px',
});

/** World-metre disc size for a footprint. Monotonic in width and depth. */
export function contactDiscScale(width, depth) {
  const pad = P1_GROUNDING.contactPad;
  const w = Math.max(0, Number(width) || 0);
  const d = Math.max(0, Number(depth) || 0);
  return {
    x: Math.max(0.18, w * pad),
    z: Math.max(0.18, d * pad),
  };
}

export function fogRangeForExtent(extent) {
  const span = Math.max(Number(extent?.x) || 272, Number(extent?.z) || 272);
  return {
    near: span * P1_FOG.nearMul,
    far: span * P1_FOG.farMul,
  };
}

let _contactTexture = null;
let _contactGeometry = null;
const _contactMaterials = new Map();

export function sharedContactShadowTexture() {
  if (_contactTexture) return _contactTexture;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const mid = (size - 1) * 0.5;
  const centre = P1_GROUNDING.contactTextureCentre;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - mid) / mid;
      const dy = (y - mid) / mid;
      const r = Math.sqrt(dx * dx + dy * dy);
      const core = Math.max(0, 1 - r);
      const alpha = Math.pow(core, 1.65) * centre;
      const i = (y * size + x) * 4;
      data[i] = 8;
      data[i + 1] = 6;
      data[i + 2] = 4;
      data[i + 3] = Math.round(Math.min(1, alpha) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  _contactTexture = texture;
  return texture;
}

export function sharedContactGeometry() {
  if (_contactGeometry) return _contactGeometry;
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.userData.p1Shared = true;
  _contactGeometry = geometry;
  return geometry;
}

export function makeContactMaterial(opacity = P1_GROUNDING.contactDecalOpacity) {
  const key = String(opacity);
  if (_contactMaterials.has(key)) return _contactMaterials.get(key);
  const material = new THREE.MeshBasicMaterial({
    map: sharedContactShadowTexture(),
    transparent: true,
    depthWrite: false,
    depthTest: true,
    opacity,
    fog: true,
  });
  material.userData.p1Shared = true;
  _contactMaterials.set(key, material);
  return material;
}

export function attachContactBlob(parent, width, depth, {
  localY = P1_GROUNDING.contactY,
  opacity = P1_GROUNDING.vehicleContactOpacity,
} = {}) {
  const scale = contactDiscScale(width, depth);
  const mesh = new THREE.Mesh(sharedContactGeometry(), makeContactMaterial(opacity));
  mesh.name = 'p1-contact-blob';
  mesh.position.y = localY;
  mesh.scale.set(scale.x, 1, scale.z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  parent.add(mesh);
  return mesh;
}
