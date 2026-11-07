// Voxel cargo props for desks whose good has no painted world-cargo GLB.
// GLB set mirrors world-map.js CARGO_GLB_GOODS (desk pip loader) and
// WORLD_CARGO_GLB_GOODS in world-deliveries.js.

export const DESK_CARGO_GLB_GOODS = Object.freeze([
  'oil', 'food', 'chips', 'robots', 'people', 'tourists', 'credit',
  'biotech', 'timber', 'fittings', 'modular', 'furniture', 'tiles', 'asylum',
  'coffee', 'copper', 'cocoa', 'lng', 'autos', 'wine', 'gold',
  'marble', 'beer', 'warships', 'compute', 'starlink', 'alien',
  'machinery', 'turbines',
  'quartz', 'iron', 'lithium', 'rare-earth', 'titanium', 'cobalt',
  'steel', 'nickel', 'graphite', 'aluminium', 'ceramics', 'platinum',
  'silicon', 'pulp', 'castings', 'windings', 'magnets', 'uranium',
  'ancient-biotech',
]);

export const DESK_VOXEL_CARGO_GOODS = Object.freeze([
  'iron', 'lithium', 'rare-earth', 'titanium', 'cobalt',
  'steel', 'nickel', 'graphite', 'aluminium', 'ceramics', 'platinum',
  'ink', 'milk-powder', 'beef', 'education', 'bibles', 'paper',
  'pig-iron', 'bauxite', 'alumina', 'quartz', 'silicon', 'polysilicon',
  'wafer', 'die', 'kaolin', 'magnets', 'windings', 'motors', 'frames',
  'castings', 'materials', 'pulp',
  'ancient-biotech',
  'uranium',
]);

export const BESPOKE_VOXEL_CARGO_GOODS = Object.freeze([
  'rare-earth', 'iron', 'lithium', 'graphite', 'cobalt', 'quartz',
  'ancient-biotech', 'wafer', 'pulp', 'uranium',
]);

const GLB_SET = new Set(DESK_CARGO_GLB_GOODS);
const VOXEL_SET = new Set(DESK_VOXEL_CARGO_GOODS);

export function deskNeedsVoxelCargo(good) {
  return VOXEL_SET.has(good);
}

/** Stacked crates vs ore-heap. Minerals heap; processed goods crate. */
export function deskCargoKind(good) {
  if (
    good === 'iron' || good === 'lithium' || good === 'rare-earth'
    || good === 'titanium' || good === 'cobalt' || good === 'nickel'
    || good === 'graphite' || good === 'platinum' || good === 'aluminium'
    || good === 'bauxite' || good === 'quartz' || good === 'kaolin'
    || good === 'uranium'
  ) return 'ore-heap';
  return 'crate-stack';
}

/**
 * Desk pip branch used by world-map.js addGoodPip:
 *   GLB template if the good has a painted cargo GLB
 *   else voxel if the good is in DESK_VOXEL_CARGO_GOODS
 *   else a generic token box.
 */
export function deskCargoPropBranch(good) {
  if (GLB_SET.has(good)) return 'glb';
  if (VOXEL_SET.has(good)) return 'voxel';
  return 'generic';
}

function box(sx, sy, sz, px, py, pz, color) {
  const part = { sx, sy, sz, px, py, pz };
  if (color != null) part.color = color;
  return Object.freeze(part);
}

function freezeParts(parts) {
  return Object.freeze(parts.map((part) => Object.freeze(part)));
}

function genericHeap() {
  return freezeParts([
    box(0.10, 0.024, 0.082, 0, 0.014, 0),
    box(0.072, 0.022, 0.058, 0.012, 0.032, 0.008),
    box(0.048, 0.018, 0.038, -0.014, 0.046, -0.008),
    box(0.036, 0.016, 0.030, 0.022, 0.028, -0.02),
    box(0.028, 0.014, 0.024, -0.028, 0.022, 0.018),
    box(0.022, 0.012, 0.020, 0.004, 0.056, 0.004),
  ]);
}

function genericCrates() {
  return freezeParts([
    box(0.078, 0.008, 0.056, 0, 0.004, 0),
    box(0.034, 0.028, 0.034, -0.02, 0.022, -0.01),
    box(0.034, 0.028, 0.034, 0.02, 0.022, 0.01),
    box(0.034, 0.028, 0.034, 0.018, 0.022, -0.014),
    box(0.034, 0.028, 0.034, -0.016, 0.022, 0.014),
    box(0.032, 0.026, 0.032, 0.0, 0.048, -0.002),
    box(0.030, 0.024, 0.030, 0.004, 0.048, 0.016),
  ]);
}

function rareEarthPit() {
  return freezeParts([
    box(0.12, 0.012, 0.10, 0, 0.006, 0, 0x6a5a3a),
    box(0.092, 0.012, 0.076, -0.004, 0.016, 0.004, 0x5a6a3a),
    box(0.068, 0.012, 0.056, -0.006, 0.026, 0.006, 0x3a7a5a),
    box(0.046, 0.012, 0.038, -0.008, 0.036, 0.008, 0x2a5a3a),
    box(0.028, 0.010, 0.024, -0.01, 0.044, 0.01, 0x4a3a22),
    box(0.048, 0.008, 0.016, 0.042, 0.010, 0.02, 0x8a7a5a),
    box(0.036, 0.008, 0.014, 0.028, 0.020, 0.012, 0x8a7a5a),
    box(0.024, 0.008, 0.012, 0.014, 0.030, 0.006, 0x8a7a5a),
    box(0.034, 0.016, 0.028, -0.05, 0.012, -0.03, 0x6a4a2a),
    box(0.022, 0.012, 0.018, -0.044, 0.022, -0.026, 0x5a3a1a),
    box(0.018, 0.022, 0.016, 0.05, 0.016, -0.028, 0x6a6a72),
    box(0.020, 0.010, 0.012, 0.036, 0.018, 0.018, 0x8a4a2a),
    box(0.008, 0.010, 0.010, 0.048, 0.018, 0.018, 0x3a4a5a),
  ]);
}

function ironStockpile() {
  return freezeParts([
    box(0.10, 0.022, 0.08, 0, 0.012, 0, 0x8a4a2a),
    box(0.07, 0.018, 0.054, 0.012, 0.028, 0.006, 0x6a3218),
    box(0.044, 0.016, 0.034, -0.01, 0.040, -0.008, 0x4a2210),
    box(0.12, 0.006, 0.014, 0.01, 0.022, -0.04, 0x5a5a52),
    box(0.008, 0.018, 0.008, -0.04, 0.012, -0.04, 0x4a4a44),
    box(0.008, 0.018, 0.008, 0.06, 0.012, -0.04, 0x4a4a44),
    box(0.022, 0.024, 0.022, 0.07, 0.018, -0.038, 0x6a5a3a),
    box(0.036, 0.014, 0.028, -0.05, 0.010, 0.03, 0x7a3a1a),
  ]);
}

function lithiumPits() {
  return freezeParts([
    box(0.09, 0.014, 0.07, 0, 0.008, 0, 0x6a7a6a),
    box(0.06, 0.014, 0.048, -0.006, 0.018, 0.004, 0x8aa0b4),
    box(0.036, 0.012, 0.030, -0.008, 0.028, 0.006, 0xb8c8d4),
    box(0.04, 0.008, 0.032, 0.04, 0.008, -0.03, 0xc8d4dc),
    box(0.032, 0.008, 0.028, 0.05, 0.008, 0.02, 0xd0dce4),
    box(0.028, 0.006, 0.036, -0.05, 0.006, -0.02, 0x6a9aaa),
    box(0.016, 0.020, 0.014, 0.055, 0.014, -0.01, 0x7a7a82),
  ]);
}

function graphiteBenches() {
  return freezeParts([
    box(0.10, 0.014, 0.04, -0.01, 0.008, -0.02, 0x2a2a2e),
    box(0.08, 0.014, 0.036, 0.01, 0.018, 0.0, 0x1a1a1e),
    box(0.06, 0.014, 0.032, -0.006, 0.028, 0.016, 0x3a3a42),
    box(0.022, 0.018, 0.018, 0.04, 0.014, -0.03, 0x2a2a32),
    box(0.022, 0.018, 0.018, 0.05, 0.014, -0.012, 0x22222a),
    box(0.022, 0.018, 0.018, 0.045, 0.030, -0.02, 0x2a2a2e),
    box(0.04, 0.006, 0.028, 0.046, 0.038, -0.02, 0x5a5a52),
    box(0.006, 0.024, 0.006, 0.03, 0.016, -0.03, 0x4a4a44),
    box(0.006, 0.024, 0.006, 0.062, 0.016, -0.01, 0x4a4a44),
  ]);
}

function cobaltBenches() {
  return freezeParts([
    box(0.10, 0.012, 0.08, 0, 0.006, 0, 0x4a3a22),
    box(0.074, 0.012, 0.06, -0.006, 0.016, 0.004, 0x3a4a6a),
    box(0.05, 0.012, 0.042, -0.008, 0.026, 0.006, 0x2a4a8a),
    box(0.032, 0.010, 0.028, -0.01, 0.034, 0.008, 0x1a3a6a),
    box(0.04, 0.006, 0.036, 0.04, 0.006, -0.03, 0x3a8aaa),
    box(0.028, 0.006, 0.04, 0.05, 0.006, 0.02, 0x2a6a8a),
    box(0.018, 0.022, 0.016, 0.055, 0.016, -0.008, 0x6a6a72),
    box(0.024, 0.014, 0.020, -0.05, 0.010, -0.03, 0x5a3a2a),
  ]);
}

function quartzDune() {
  return freezeParts([
    box(0.11, 0.020, 0.08, -0.01, 0.010, 0.0, 0xc8c0b4),
    box(0.07, 0.018, 0.054, 0.02, 0.024, 0.008, 0xd8d0c4),
    box(0.044, 0.014, 0.036, 0.0, 0.034, -0.006, 0xe8e0d4),
    box(0.036, 0.010, 0.06, 0.05, 0.008, -0.03, 0xb8d0d8),
    box(0.04, 0.012, 0.022, 0.048, 0.016, -0.02, 0x6a6a72),
    box(0.012, 0.018, 0.012, 0.042, 0.024, -0.02, 0x5a5a62),
    box(0.048, 0.006, 0.008, 0.02, 0.022, -0.01, 0x8a8a92),
    box(0.010, 0.010, 0.010, -0.01, 0.028, 0.0, 0x7a7a82),
  ]);
}

function ancientBiotechRack() {
  return freezeParts([
    box(0.08, 0.008, 0.05, 0, 0.004, 0, 0x6a6a72),
    box(0.006, 0.05, 0.006, -0.034, 0.030, -0.02, 0x8a8a92),
    box(0.006, 0.05, 0.006, 0.034, 0.030, -0.02, 0x8a8a92),
    box(0.006, 0.05, 0.006, -0.034, 0.030, 0.02, 0x8a8a92),
    box(0.006, 0.05, 0.006, 0.034, 0.030, 0.02, 0x8a8a92),
    box(0.072, 0.004, 0.044, 0, 0.022, 0, 0x7a7a82),
    box(0.072, 0.004, 0.044, 0, 0.042, 0, 0x7a7a82),
    box(0.010, 0.028, 0.010, -0.02, 0.036, -0.008, 0xb8d4dc),
    box(0.010, 0.028, 0.010, 0.0, 0.036, -0.008, 0xd8a24a),
    box(0.010, 0.028, 0.010, 0.02, 0.036, -0.008, 0x3a8a8a),
    box(0.010, 0.028, 0.010, -0.02, 0.016, 0.008, 0x4aa0a8),
    box(0.010, 0.028, 0.010, 0.0, 0.016, 0.008, 0xc8b06a),
    box(0.010, 0.028, 0.010, 0.02, 0.016, 0.008, 0xa8c8d0),
    box(0.016, 0.012, 0.016, 0.05, 0.010, 0.02, 0x5a7a6a),
  ]);
}

function waferRack() {
  return freezeParts([
    box(0.07, 0.008, 0.05, 0, 0.004, 0, 0x4a4a52),
    box(0.006, 0.048, 0.006, -0.03, 0.028, -0.018, 0x6a6a72),
    box(0.006, 0.048, 0.006, 0.03, 0.028, -0.018, 0x6a6a72),
    box(0.006, 0.048, 0.006, -0.03, 0.028, 0.018, 0x6a6a72),
    box(0.006, 0.048, 0.006, 0.03, 0.028, 0.018, 0x6a6a72),
    box(0.056, 0.004, 0.04, 0, 0.016, 0, 0x3a4a5a),
    box(0.056, 0.004, 0.04, 0, 0.030, 0, 0x3a4a5a),
    box(0.056, 0.004, 0.04, 0, 0.044, 0, 0x3a4a5a),
    box(0.036, 0.002, 0.036, 0, 0.020, 0, 0x8aa0b4),
    box(0.036, 0.002, 0.036, 0, 0.034, 0, 0x9ab0c4),
    box(0.036, 0.002, 0.036, 0, 0.048, 0, 0x7a90a4),
    box(0.018, 0.022, 0.016, 0.05, 0.016, 0.01, 0x3a4a5a),
  ]);
}

function uraniumTerrace() {
  return freezeParts([
    box(0.12, 0.012, 0.10, 0, 0.006, 0, 0x6a5a32),
    box(0.092, 0.012, 0.076, -0.004, 0.016, 0.004, 0x8a7a3a),
    box(0.068, 0.012, 0.056, -0.006, 0.026, 0.006, 0xc4b45a),
    box(0.046, 0.012, 0.038, -0.008, 0.036, 0.008, 0xd8d46a),
    box(0.028, 0.010, 0.024, -0.01, 0.044, 0.01, 0x8aaa3a),
    box(0.048, 0.008, 0.016, 0.042, 0.010, 0.02, 0x8a7a5a),
    box(0.036, 0.008, 0.014, 0.028, 0.020, 0.012, 0x8a7a5a),
    box(0.024, 0.008, 0.012, 0.014, 0.030, 0.006, 0x8a7a5a),
    box(0.034, 0.016, 0.028, -0.05, 0.012, -0.03, 0x5a4a22),
    box(0.022, 0.018, 0.016, 0.05, 0.016, -0.028, 0x6a6a72),
    box(0.020, 0.010, 0.012, 0.036, 0.018, 0.018, 0xc4b45a),
    box(0.016, 0.022, 0.016, 0.055, 0.018, 0.008, 0x4a4a52),
  ]);
}

function pulpRack() {
  return freezeParts([
    box(0.08, 0.008, 0.05, 0, 0.004, 0, 0x6a5a48),
    box(0.032, 0.022, 0.028, -0.022, 0.016, -0.008, 0xc8bca8),
    box(0.032, 0.022, 0.028, 0.022, 0.016, -0.008, 0xb8ac98),
    box(0.032, 0.022, 0.028, -0.022, 0.016, 0.016, 0xd0c4b0),
    box(0.032, 0.022, 0.028, 0.022, 0.016, 0.016, 0xc0b49a),
    box(0.032, 0.022, 0.028, 0.0, 0.038, 0.004, 0xc8bca8),
    box(0.04, 0.018, 0.04, 0.055, 0.014, -0.01, 0x8a9aaa),
    box(0.028, 0.008, 0.028, 0.055, 0.026, -0.01, 0xd8d0c4),
    box(0.006, 0.028, 0.006, -0.038, 0.018, -0.022, 0x6a6a62),
    box(0.006, 0.028, 0.006, 0.038, 0.018, 0.022, 0x6a6a62),
  ]);
}

const BESPOKE_BUILDERS = Object.freeze({
  'rare-earth': rareEarthPit,
  iron: ironStockpile,
  lithium: lithiumPits,
  graphite: graphiteBenches,
  cobalt: cobaltBenches,
  quartz: quartzDune,
  'ancient-biotech': ancientBiotechRack,
  wafer: waferRack,
  pulp: pulpRack,
  uranium: uraniumTerrace,
});

export function voxelCargoParts(good) {
  const builder = BESPOKE_BUILDERS[good];
  if (builder) return builder();
  return deskCargoKind(good) === 'ore-heap' ? genericHeap() : genericCrates();
}

function tintMaterial(material, color) {
  if (color == null || typeof material?.clone !== 'function') return material;
  const next = material.clone();
  if (next.color && typeof next.color.setHex === 'function') next.color.setHex(color);
  return next;
}

export function addVoxelCargoProp(THREE, parent, good, material, unitBox) {
  const group = new THREE.Group();
  group.name = `${good} voxel cargo`;
  const parts = [];
  for (const spec of voxelCargoParts(good)) {
    const mesh = new THREE.Mesh(unitBox, tintMaterial(material, spec.color));
    mesh.scale.set(spec.sx, spec.sy, spec.sz);
    mesh.position.set(spec.px, spec.py, spec.pz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.baseColor = mesh.material?.color?.clone
      ? mesh.material.color.clone()
      : material?.color?.clone?.() ?? null;
    group.add(mesh);
    parts.push(mesh);
  }
  parent.add(group);
  return { group, parts };
}
