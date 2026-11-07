// Authored ledger silhouettes sampled into a small, deterministic voxel field.

export const VIEW = Object.freeze({ w: 200, h: 110 });
export const VOXEL_GRID = Object.freeze({ columns: 160, rows: 96 });
export const MAP_SCALE = 0.15;
export const VOXEL_HEIGHT = 0.17;
export const LAND_INSTANCE_LIMIT = 24000;

/** Caricature Australia. Port Phillip is subtracted as an open south-east basin. */
export const AUSTRALIA_D = `M68 42 L74 26 L90 16 L106 8 L118 4 L124 14 L116 24
L128 30 L148 28 L164 40 L174 52 L176 64 L172 76 L164 86 L154 90
L148 84 L144 80 L140 82 L142 88 L128 90 L110 92 L88 90 L72 80
L64 64 L64 48 Z`;

export const PORT_PHILLIP_D = `M145 94 L142 89 L143 83 L146 78 L150 73 L155 71
L160 72 L164 76 L165 81 L162 86 L161 92 L157 95 L153 91 L149 95 Z`;

export const TASMANIA_D = `M136 101 L142 96 L149 94 L152 98 L158 94 L166 97
L168 102 L163 104 L160 109 L153 107 L147 110 L140 106 L142 103 Z`;

// A one-layer colour stain: concave, asymmetric, and deliberately chewed.
const OUTBACK_STAIN_D = `M73 43 L81 42 L79 37 L88 34 L94 36 L101 31 L108 35
L116 33 L115 40 L123 43 L119 48 L125 53 L119 57 L121 63 L112 62
L108 69 L101 66 L95 71 L88 66 L80 68 L82 61 L74 59 L78 53 L71 50 Z`;

// The only raised interior patch is the compact, angular Ballarat goldfield.
const GOLDFIELDS_D = `M127 61 L130 55 L136 54 L141 58 L140 63 L136 67
L131 66 L128 64 Z`;

const CELL_CHART_X = VIEW.w / VOXEL_GRID.columns;
const CELL_CHART_Y = VIEW.h / VOXEL_GRID.rows;

export function chartCellCentre(column, row) {
  return {
    x: (column + 0.5) * CELL_CHART_X,
    y: (row + 0.5) * CELL_CHART_Y,
  };
}

export const VOXEL_CELL = Object.freeze({
  x: CELL_CHART_X * MAP_SCALE,
  z: CELL_CHART_Y * MAP_SCALE,
});

function cellNoise(column, row) {
  let value = Math.imul(column + 17, 0x9e3779b1) ^ Math.imul(row + 31, 0x85ebca6b);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return (value >>> 0) / 0xffffffff;
}

function cellKey(column, row) {
  return (row * VOXEL_GRID.columns) + column;
}

export function chartToWorld(point, elevation = 0) {
  return {
    x: (point.x - (VIEW.w / 2)) * MAP_SCALE,
    y: elevation,
    z: (point.y - (VIEW.h / 2)) * MAP_SCALE,
  };
}

export function landLayersAt(raster, point) {
  const column = Math.floor(point.x / CELL_CHART_X);
  const row = Math.floor(point.y / CELL_CHART_Y);
  if (column < 0 || column >= VOXEL_GRID.columns || row < 0 || row >= VOXEL_GRID.rows) {
    return 0;
  }
  return raster.layersByCell.get(cellKey(column, row)) ?? 0;
}

/**
 * Sample each chart cell at its centre. Every returned item is one cube layer,
 * ready for a single InstancedMesh; elevated areas add a second cube.
 */
export function rasterizeLandVoxels() {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context || typeof Path2D === 'undefined') {
    throw new Error('The voxel ledger requires Canvas Path2D support.');
  }

  const australia = new Path2D(AUSTRALIA_D);
  const portPhillip = new Path2D(PORT_PHILLIP_D);
  const tasmania = new Path2D(TASMANIA_D);
  const outbackStain = new Path2D(OUTBACK_STAIN_D);
  const goldfields = new Path2D(GOLDFIELDS_D);
  const layersByCell = new Map();
  const voxels = [];
  let occupiedCells = 0;

  for (let row = 0; row < VOXEL_GRID.rows; row += 1) {
    const chartY = (row + 0.5) * CELL_CHART_Y;
    for (let column = 0; column < VOXEL_GRID.columns; column += 1) {
      const chartX = (column + 0.5) * CELL_CHART_X;
      const onMainland = context.isPointInPath(australia, chartX, chartY)
        && !context.isPointInPath(portPhillip, chartX, chartY);
      const onTasmania = context.isPointInPath(tasmania, chartX, chartY);
      if (!onMainland && !onTasmania) continue;

      let region = onTasmania ? 'tasmania' : 'mainland';
      let layers = 1;
      if (onMainland && context.isPointInPath(goldfields, chartX, chartY)) {
        region = 'goldfields';
        layers = 2;
      } else if (onMainland && context.isPointInPath(outbackStain, chartX, chartY)) {
        region = 'outback';
      }

      occupiedCells += 1;
      layersByCell.set(cellKey(column, row), layers);
      const world = chartToWorld({ x: chartX, y: chartY });
      for (let level = 0; level < layers; level += 1) {
        voxels.push({
          x: world.x,
          y: (level + 0.5) * VOXEL_HEIGHT,
          z: world.z,
          level,
          region,
          shade: cellNoise(column, row),
        });
      }
    }
  }

  if (voxels.length > LAND_INSTANCE_LIMIT) {
    throw new RangeError(`Land voxel budget exceeded: ${voxels.length}/${LAND_INSTANCE_LIMIT}.`);
  }

  return {
    voxels,
    occupiedCells,
    layersByCell,
    columns: VOXEL_GRID.columns,
    rows: VOXEL_GRID.rows,
  };
}

export function landHeightAt(raster, point) {
  const originColumn = Math.max(0, Math.min(
    VOXEL_GRID.columns - 1,
    Math.floor(point.x / CELL_CHART_X),
  ));
  const originRow = Math.max(0, Math.min(
    VOXEL_GRID.rows - 1,
    Math.floor(point.y / CELL_CHART_Y),
  ));

  // Coastal catalog coordinates can sit between sampled cells. Search a very
  // small ring so their ferrules remain on the authored land silhouette.
  for (let radius = 0; radius <= 2; radius += 1) {
    for (let row = originRow - radius; row <= originRow + radius; row += 1) {
      for (let column = originColumn - radius; column <= originColumn + radius; column += 1) {
        if (column < 0 || column >= VOXEL_GRID.columns || row < 0 || row >= VOXEL_GRID.rows) continue;
        const layers = raster.layersByCell.get(cellKey(column, row));
        if (layers) return layers * VOXEL_HEIGHT;
      }
    }
  }
  return VOXEL_HEIGHT;
}
