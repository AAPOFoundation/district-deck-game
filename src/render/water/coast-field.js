// @ts-check
/**
 * water/coast-field.js (W14-A, DESIGN section 3, F3): the true distance to the drawn shore.
 *
 * `front` (the L-shaped distance the ocean shader has) is not the distance to the shore on the
 * hinterland diagonals, round the wrap corners or round the Apostles. This bakes the real one, from
 * the physical bed (`uBedDepth` bytes, F2): land is bed <= 0, the shore line is the linear zero
 * crossing of the bed between a land texel and a water texel, and a two-pass 8-point chamfer
 * transform carries the distance out to the water. No three.js import; CPU only; deterministic.
 *
 * RGBA8, the same grid as `uDepthMap`:
 *   R  shore distance S, `S = 224 * R^2` metres (the table's own span)
 *   G  distance inland, `32 * G^2` metres
 *   B  coast class: 0 beach shelf, 0.5 natural, 1 wall or quay
 *   A  vertex shoaling weight, 1 within 150 m of the board, 0 beyond 220 m
 * `sampleCoastField` reads the same bytes the way a LinearFilter sampler does, so the CPU twins of
 * the swell see what the GPU sees.
 */

export const COAST_FIELD = Object.freeze({
  sSpan: 224,
  inlandSpan: 32,
  weightFrom: 150,
  weightTo: 220,
  blur: 2,
  blurAbove: 4,
});

const SQRT2 = Math.SQRT2;

const smooth01 = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Two-pass 8-point chamfer transform in place. `d` holds seeds (metres) or Infinity; `step` is the texel size. */
function chamfer(d, size, step) {
  const diag = step * SQRT2;
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      const k = j * size + i;
      let v = d[k];
      if (i > 0 && d[k - 1] + step < v) v = d[k - 1] + step;
      if (j > 0) {
        const up = k - size;
        if (d[up] + step < v) v = d[up] + step;
        if (i > 0 && d[up - 1] + diag < v) v = d[up - 1] + diag;
        if (i < size - 1 && d[up + 1] + diag < v) v = d[up + 1] + diag;
      }
      d[k] = v;
    }
  }
  for (let j = size - 1; j >= 0; j -= 1) {
    for (let i = size - 1; i >= 0; i -= 1) {
      const k = j * size + i;
      let v = d[k];
      if (i < size - 1 && d[k + 1] + step < v) v = d[k + 1] + step;
      if (j < size - 1) {
        const dn = k + size;
        if (d[dn] + step < v) v = d[dn] + step;
        if (i < size - 1 && d[dn + 1] + diag < v) v = d[dn + 1] + diag;
        if (i > 0 && d[dn - 1] + diag < v) v = d[dn - 1] + diag;
      }
      d[k] = v;
    }
  }
}

/**
 * @param {{ bedDepth: Float32Array, size: number, span: number, originX: number, originZ: number,
 *   classify?: (x: number, z: number) => number, boardDistance?: (x: number, z: number) => number }} args
 */
export function bakeCoastField({ bedDepth, size, span, originX, originZ, classBytes = null, classify = () => 0.5, boardDistance = () => 0 }) {
  const step = span / size;
  const n = size * size;
  const dWater = new Float32Array(n).fill(Infinity);
  const dLand = new Float32Array(n).fill(Infinity);
  const isLand = (k) => bedDepth[k] <= 0;
  const nb = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      const k = j * size + i;
      const here = bedDepth[k];
      for (let q = 0; q < 4; q += 1) {
        const ii = i + nb[q][0];
        const jj = j + nb[q][1];
        if (ii < 0 || jj < 0 || ii >= size || jj >= size) continue;
        const o = jj * size + ii;
        const there = bedDepth[o];
        if (here > 0 && there <= 0) {
          // The shore line sits `frac` of the way from this water texel toward its land neighbour.
          const frac = here / Math.max(here - there, 1e-9);
          const dist = frac * step;
          if (dist < dWater[k]) dWater[k] = dist;
        } else if (here <= 0 && there > 0) {
          const frac = -here / Math.max(there - here, 1e-9);
          const dist = frac * step;
          if (dist < dLand[k]) dLand[k] = dist;
        }
      }
    }
  }
  chamfer(dWater, size, step);
  chamfer(dLand, size, step);
  // Blur S where it is over a few metres, so the medial axis of a headland is not a kink.
  /** @type {Float32Array} */
  let S = new Float32Array(n);
  for (let k = 0; k < n; k += 1) S[k] = isLand(k) ? 0 : Math.min(dWater[k], COAST_FIELD.sSpan * 1.5);
  for (let pass = 0; pass < COAST_FIELD.blur; pass += 1) {
    const next = new Float32Array(S);
    for (let j = 1; j < size - 1; j += 1) {
      for (let i = 1; i < size - 1; i += 1) {
        const k = j * size + i;
        if (isLand(k) || S[k] <= COAST_FIELD.blurAbove) continue;
        let sum = 0;
        let cnt = 0;
        for (let b = -1; b <= 1; b += 1) {
          for (let a = -1; a <= 1; a += 1) {
            const o = k + b * size + a;
            if (isLand(o)) continue;
            sum += S[o];
            cnt += 1;
          }
        }
        next[k] = cnt ? sum / cnt : S[k];
      }
    }
    S = next;
  }
  const data = new Uint8Array(n * 4);
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      const k = j * size + i;
      const x = originX + ((i + 0.5) / size) * span;
      const z = originZ + ((j + 0.5) / size) * span;
      const o = k * 4;
      const s = isLand(k) ? 0 : S[k];
      const inland = isLand(k) ? Math.min(dLand[k], COAST_FIELD.inlandSpan * 1.5) : 0;
      data[o] = Math.round(Math.min(1, Math.sqrt(Math.max(s, 0) / COAST_FIELD.sSpan)) * 255);
      data[o + 1] = Math.round(Math.min(1, Math.sqrt(Math.max(inland, 0) / COAST_FIELD.inlandSpan)) * 255);
      data[o + 2] = classBytes ? classBytes[k] : Math.round(Math.min(1, Math.max(0, classify(x, z))) * 255);
      const outside = boardDistance(x, z);
      data[o + 3] = Math.round((1 - smooth01(COAST_FIELD.weightFrom, COAST_FIELD.weightTo, outside)) * 255);
    }
  }
  return { data, size, span, originX, originZ };
}

/** Bilinear read of the baked bytes, as a LinearFilter sampler does it. Returns S metres, the vertex weight and the class. */
export function sampleCoastField(bake, x, z) {
  const { data, size, span, originX, originZ } = bake;
  const fx = Math.min(size - 1, Math.max(0, ((x - originX) / span) * size - 0.5));
  const fz = Math.min(size - 1, Math.max(0, ((z - originZ) / span) * size - 0.5));
  const i0 = Math.min(size - 2, Math.floor(fx));
  const j0 = Math.min(size - 2, Math.floor(fz));
  const tx = fx - i0;
  const tz = fz - j0;
  const at = (i, j, c) => data[(j * size + i) * 4 + c] / 255;
  const lerp = (c) => {
    const a = at(i0, j0, c) + (at(i0 + 1, j0, c) - at(i0, j0, c)) * tx;
    const b = at(i0, j0 + 1, c) + (at(i0 + 1, j0 + 1, c) - at(i0, j0 + 1, c)) * tx;
    return a + (b - a) * tz;
  };
  const r = lerp(0);
  return { S: COAST_FIELD.sSpan * r * r, weight: lerp(3), cls: lerp(2), inland: COAST_FIELD.inlandSpan * lerp(1) ** 2 };
}

export default { COAST_FIELD, bakeCoastField, sampleCoastField };
