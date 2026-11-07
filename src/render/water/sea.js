// @ts-check
/**
 * The open-sea surface (TASTE-BIBLE section 6, amended by the round-one gate, ruling 1).
 *
 * Two things stay apart here, because merging them is what drew the corrugated-iron sea:
 *
 *   SHAPE      three directional swell trains times a drifting amplitude envelope. Coarse,
 *              vertex-displaced in `outer-ocean.js` and re-evaluated analytically per pixel
 *              (`ddSeaSwellGrad`) so the 19-31 m shading is not aliased by the mesh. It feeds
 *              the diffuse, Fresnel and sky-mirror colour.
 *   SPARKLE    a 0.35-0.7 m detail field that feeds the specular lobe ONLY. It never reaches
 *              the diffuse, refraction or Fresnel colour, so it cannot print a net on the
 *              water. It gathers on sun-facing crest flanks and is gone by 600 m.
 *
 * Every number comes from `WATER_LAW` (law.js). The rain response is `WATER_LAW.rainSea`.
 */
import { WATER_LAW } from './law.js';
import { ddValueNoise } from './contract.js';
import { surfEnvelopeAt, surfEnvelopeGlsl, surfTrainsGlsl, SWELL_WANDER, SWELL_WANDER_TUNE, SWELL_FAR_MIX, SWELL_FAR_MIX_TUNE, SWELL_FAR_TUNE, SWELL_FAR_TUNE_P, SWELL_FAR_BREAK, SWELL_FAR_BREAK_P } from './surf.js';

/**
 * taste-r1 (W20-A): the whitecap patch shape. The patches no longer lie at one angle and one length (the open sea read as diagonal rain): the angle off the crest
 * line spreads to +-`spread` radians (was 0.22), the length runs `lenMin` to `lenMax` metres with the share of long ones set by the power `skew` (many short, few long;
 * was 1.2 to 3.6 m with a power of 2), and each patch keeps `smear` of its brightness at its tail, so it trails a faint smear on the lee side (the side its head is not on).
 * `gain` 0 restores the wave nineteen shape.
 */
export const WHITECAP_SHAPE = Object.freeze({ gain: 1, spread: 0.45, lenMin: 0.8, lenMax: 6.0, skew: 3.0, smear: 0.60 });
/**
 * taste-r1 (W21-B): whitecaps as foam. `tone` is the share of the foam token a patch composites at (aqua.js), `feather` the share of the patch width over which each edge fades (was 0.14),
 * `nearKeep` the share of patches kept within `nearM` metres of the camera (all kept by `farM`), `lifeMin`/`lifeMax` seconds of a patch's life (was 2 to 5) and `drift` metres a patch travels with its crest
 * over that life. `gain` 0 restores wave twenty's patches.
 */
export const WHITECAP_FOAM = Object.freeze({ gain: 1, tone: 0.84, feather: 0.33, nearKeep: 0.5, nearM: 200, farM: 260, lifeMin: 2.0, lifeMax: 4.0, drift: 1.2 });
/**
 * taste-r1 (W22-C): whitecaps as lace. The breaker channel of the foam pack (the surf rows' lace, red) breaks each patch: holes in its body, a torn leading edge, and a trailing
 * smear that thins into separate streaks; the long patches stretch to 4 to 1 along their crest. `gain` 0 restores wave twenty-one's patches, `hole` the share of the body the lace can open, `tileM` the lace tile in metres,
 * `streak` the share of the tail that is streaks, `long` the length-to-width ratio of the longest patches.
 */
// taste-r1 (W22 review): held at 0. The lace broke the patches into small streaked specks (count at station 21 fell from about 20 to 8) and did not read as lace.
export const WHITECAP_LACE = Object.freeze({ gain: 0, hole: 0.7, tileM: 3.2, streak: 0.8, long: 4.0 });
const WF = (a, b) => (a + (b - a) * WHITECAP_FOAM.gain).toFixed(3);
const WC = (a, b) => (a + (b - a) * WHITECAP_SHAPE.gain).toFixed(3);


/**
 * CPU twin of `ddSeaEnvelope`: the swell amplitude multiplier at a shore-frame point.
 * taste-r1 (W14-A): the expression lives in `water/surf.js` (`surfEnvelopeAt`) so the sea and the
 * swash read one envelope. Two octaves of value noise (90 m and 220 m features) now drifting ONSHORE
 * at `WATER_LAW.waves.envelope.drift` (3.0 m/s, the speed of a swell group), mapped to 0.45-1.0 so the
 * swell arrives in groups. `gain` is the rain factor (1.3).
 */
export function swellEnvelopeAt(along, front, t, gain = 1) {
  return surfEnvelopeAt(along, front, t, gain);
}

const SHADE = WATER_LAW.waves.ocean.shadeTrains;
const SHADE_G = 9.81;
const SHADE_ITEMS = SHADE.items.map((it) => {
  const heading = ((WATER_LAW.waves.prevailingDeg + it.headingDeg) * Math.PI) / 180;
  const k = (Math.PI * 2) / it.len;
  const omega = Math.sqrt(SHADE_G * k);
  return Object.freeze({ k, omega, cg: (0.5 * omega) / k, dx: Math.sin(heading), dy: Math.cos(heading), slope: it.slope, crestM: it.crestM, travelM: it.travelM, seed: it.seed });
});
const shadeSmooth = (e0, e1, x) => { const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };

/**
 * taste-r1 (W17-A): CPU twin of `ddSeaShadeGrad`. Slope (d/d along, d/d front) of the shade-only components at a shore-frame point, before the
 * shore fade and the gain. Each component is a plane wave at its own deep-water speed, with its own slow phase wander and a group envelope in
 * its own frame (noise thresholded between `envLo` and `envHi`, floored at `envMin`). It never feeds a height.
 */
export function seaShadeGradAt(along, front, t) {
  let gx = 0;
  let gy = 0;
  for (const c of SHADE_ITEMS) {
    const pos = c.dx * along + c.dy * front;
    const cr = -c.dy * along + c.dx * front;
    const n = ddValueNoise(cr / c.crestM + 5.3 * c.seed, (pos + t * c.cg) / c.travelM + 2.9 * c.seed);
    const en = SHADE.envMin + (1 - SHADE.envMin) * shadeSmooth(SHADE.envLo, SHADE.envHi, n);
    const wob = SHADE.wanderRad * (2 * ddValueNoise(along / SHADE.wanderM + 3.7 * c.seed, front / SHADE.wanderM + 6.1 * c.seed) - 1)
      + SHADE.wander2Rad * (2 * ddValueNoise(along / SHADE.wander2M + 1.7 * c.seed + 9, front / SHADE.wander2M + 2.3 * c.seed + 4) - 1);
    const a = c.slope * en * Math.cos(c.k * pos + c.omega * t + wob);
    gx += c.dx * a;
    gy += c.dy * a;
  }
  return [gx, gy];
}

/** The shore fade of the shade-only components: 0 inside `fadeFrom` metres of the shore, 1 from `fadeTo`. */
export function seaShadeFadeAt(shoreDistance) {
  return shadeSmooth(SHADE.fadeFrom, SHADE.fadeTo, shoreDistance);
}

/**
 * Rain state of the sea from the cloud cover: [rain, envelope gain, glint weight, roughness add].
 * The game's `rain` sky state runs at cloud 0.8 and `heavy-rain` at 1, so the ruling's full
 * numbers (roughness +0.12, glint weight 35%, envelope 1.3x, whitecaps 2%) apply from 0.8 up.
 */
export function seaRainState(cloud) {
  const r = Math.min(1, Math.max(0, (Number(cloud) || 0) / 0.8));
  const s = WATER_LAW.rainSea;
  return [r, 1 + (s.swellEnvelope - 1) * r, 1 + (s.glintWeight - 1) * r, s.roughnessAdd * r];
}

/** GLSL shared by the vertex and fragment stages: the uniform block and the envelope. */
export function seaEnvelopeGlsl() {
  return /* glsl */ `
    #ifndef DD_SEA_ENVELOPE
    #define DD_SEA_ENVELOPE
    // x rain 0..1, y swell envelope gain, z glint weight, w roughness added in rain.
    uniform vec4 uSea;
    ${surfEnvelopeGlsl()}
    float ddSeaEnvelope(float along, float front, float t) {
      return ddSurfEnvelope(along, front, t) * uSea.y;
    }
    #endif
  `;
}

/**
 * GLSL for the fragment stage. Needs `uBayDir/Len/Amp/Omega[bayN]`, `uWaveScale`, `uSea`,
 * `ddValueNoise`, `ddHash21` and `seaEnvelopeGlsl()` declared above it.
 */
export function seaFragmentGlsl(bayN) {
  const sp = WATER_LAW.sparkle;
  const fl = (v) => v.toFixed(6);
  const n = SHADE_ITEMS.length;
  const F = SWELL_FAR_MIX_TUNE;
  const G = SWELL_FAR_TUNE_P;
  // taste-r1 (W29): SWELL_FAR_BREAK (water/surf.js). B is null with the switch off, and then every value below is wave twenty-eight's and the shader text is unchanged.
  const B = SWELL_FAR_BREAK > 0 ? SWELL_FAR_BREAK_P : null;
  const lullScaleV = B ? B.lullScale : G.lullScale;
  const lullLoV = B ? B.lullLo : G.lullLo;
  const lullHiV = B ? B.lullHi : G.lullHi;
  const shadeConsts = `const vec2 DD_SH_D[${n}] = vec2[${n}](${SHADE_ITEMS.map((c) => `vec2(${fl(c.dx)}, ${fl(c.dy)})`).join(', ')});
    const vec4 DD_SH_E[${n}] = vec4[${n}](${SHADE_ITEMS.map((c) => `vec4(${c.crestM.toFixed(1)}, ${c.travelM.toFixed(1)}, ${c.seed.toFixed(1)}, ${fl(c.cg)})`).join(', ')});
    const vec2 DD_SH_KW[${n}] = vec2[${n}](${SHADE_ITEMS.map((c) => `vec2(${fl(c.k)}, ${fl(c.omega)})`).join(', ')});
    const float DD_SH_S[${n}] = float[${n}](${SHADE_ITEMS.map((c) => c.slope.toFixed(5)).join(', ')});`;
  return /* glsl */ `
    uniform sampler2D uFleckPack; // foam pack (coast-textures.js), fleck channel in G
    uniform float uFleckReady;    // 0 until the pack has loaded
    // Slope of the three-train swell on the shore frame: (d height / d along, d height / d front).
    // Same trains, phases and envelope as the vertex stage; \`live\` is its depth and shore fade.
    ${surfTrainsGlsl()}
    vec2 ddSeaSwellGrad(float along, float front, float t, float live, float bed, float envN, float S, float a) {
      float env = envN * uSea.y;
      // taste-r1 (W15-A1): the vertex stage's per-train wander and group amplitude (water/surf.js; 0 inside 120 m of the shore).
      vec3 trainPh;
      vec3 trainEn;
      ddSurfTrains(along, front, t, trainPh, trainEn);
      // The vertex stage's sand clearance: summed crest at most 0.39 of the drawn bed depth.
      // W14-A: shoaling. Extra phase E_i(S), gain and the table depth in the cap, all from the one table (water/surf.js).
      vec4 kk = ddSurfK(S);
      vec4 ee = ddSurfE(S);
      float gain = mix(1.0, kk.x, a);
      float crestSum = 0.0;
      for (int i = 0; i < ${bayN}; i++) crestSum += uBayAmp[i] * uWaveScale * live * env * gain * trainEn[i];
      float bedCap = min(1.0, 0.39 * max(mix(bed, min(kk.w, bed), a), 0.0) / max(crestSum, 1e-3));
      float crestWob = sin(along * 0.019 + 0.6) * 4.2 + sin(along * 0.047 + 1.9) * 1.8;
      vec2 g = vec2(0.0);
      for (int i = 0; i < ${bayN}; i++) {
        vec2 D = uBayDir[i];
        float k = 6.28318530718 / max(uBayLen[i], 4.0);
        float phi = k * (D.x * along + D.y * (front + crestWob * 0.35)) + uBayOmega[i] * t + a * ee[i] + trainPh[i];
        g += D * (uBayAmp[i] * uWaveScale * live * env * gain * bedCap * trainEn[i] * k * cos(phi));
      }
      return g;
    }
${SWELL_WANDER > 0 ? `
    // taste-r1 (W26-A): SWELL_WANDER. The slope of the same three trains, phases and envelope as ddSeaSwellGrad, each weighed by its shade weight (water/surf.js
    // SWELL_WANDER_TUNE.shadeW), for the swell SHADE only: the carrier keeps the lead and the other two stay at about two fifths of its slope, so the crossing trains
    // stop drawing a diamond lattice. The height, the normal, the glint and the flecks keep ddSeaSwellGrad. trainPh and trainEn come from ddSurfTrains (the caller has them).
    vec2 ddSeaSwellShade(float along, float front, float t, float live, float bed, float envN, float S, float a, vec3 trainPh, vec3 trainEn${SWELL_FAR_MIX > 0 ? ', float farK' : ''}${SWELL_FAR_TUNE > 0 ? ', float farK2' : ''}) {
      const float shadeW[3] = float[3](${SWELL_WANDER_TUNE.shadeW.map((v) => v.toFixed(3)).join(', ')});
${SWELL_FAR_MIX > 0 ? `      const float farPhRad[3] = float[3](${F.phRad.map((v) => v.toFixed(2)).join(', ')});
      const float farPhM[3] = float[3](${F.phM.map((v) => v.toFixed(1)).join(', ')});
      const float farLullM[3] = float[3](${F.lullM.map((v) => v.toFixed(1)).join(', ')});
      const float farLullT[3] = float[3](${F.lullTravelM.map((v) => v.toFixed(1)).join(', ')});
${SWELL_FAR_TUNE > 0 ? `      const float farPh2Rad[3] = float[3](${G.phRad.map((v) => v.toFixed(2)).join(', ')});
      const float farPh2M[3] = float[3](${G.phM.map((v) => v.toFixed(1)).join(', ')});
${B ? `      const float farBrkPh[3] = float[3](${B.groupPh.map((v) => v.toFixed(2)).join(', ')});
` : ''}` : ''}` : ''}      float env = envN * uSea.y;
      vec4 kk = ddSurfK(S);
      vec4 ee = ddSurfE(S);
      float gain = mix(1.0, kk.x, a);
      float crestSum = 0.0;
      for (int i = 0; i < ${bayN}; i++) crestSum += uBayAmp[i] * uWaveScale * live * env * gain * trainEn[i];
      float bedCap = min(1.0, 0.39 * max(mix(bed, min(kk.w, bed), a), 0.0) / max(crestSum, 1e-3));
      float crestWob = sin(along * 0.019 + 0.6) * 4.2 + sin(along * 0.047 + 1.9) * 1.8;
      vec2 g = vec2(0.0);
${B ? `      // taste-r1 (W29): SWELL_FAR_BREAK. The carrier's group frame, shared by the three trains: one calm cell grid, one phase offset per cell.
      vec2 bD0 = uBayDir[0];
      float bK0 = 6.28318530718 / max(uBayLen[0], 4.0);
      float bPos0 = bD0.x * along + bD0.y * front + t * 0.5 * uBayOmega[0] / bK0;
      float bCr0 = -bD0.y * along + bD0.x * front;
      float bSc = mix(1.0, ${lullScaleV.toFixed(2)}, farK2);
      vec2 bCell = vec2(bCr0 / (farLullM[0] * bSc), bPos0 / (farLullT[0] * bSc));
      float bLull = ddValueNoise(bCell + vec2(1.7, 4.1));
      // The offset below is one constant per cell (fronts stay straight and parallel inside a group). The cell grid is bent by a slow noise so the edges are not ruled lines. The offset steps only on a cell edge, and every train's lull envelope is forced to 0 on the edge (a calm gap of \`seamW\` of a cell each side), so the step is in the gap. The gap is fully on (bGap) before the offset starts (bKey).
      vec2 bW = bCell + ${B.warp.toFixed(2)} * (vec2(ddValueNoise(bCell * 0.55 + vec2(3.3, 8.1)), ddValueNoise(bCell * 0.55 + vec2(9.7, 1.9))) - 0.5);
      vec2 bId = floor(bW);
      vec2 bFr = bW - bId;
      float bEdge = min(min(bFr.x, 1.0 - bFr.x), min(bFr.y, 1.0 - bFr.y));
      float bKey = smoothstep(0.3, 1.0, farK2);
      float bGap = mix(1.0, smoothstep(0.0, ${B.seamW.toFixed(2)}, bEdge), smoothstep(0.0, 0.3, farK2));
` : ''}      for (int i = 0; i < ${bayN}; i++) {
        vec2 D = uBayDir[i];
        float k = 6.28318530718 / max(uBayLen[i], 4.0);
        float phi = k * (D.x * along + D.y * (front + crestWob * 0.35)) + uBayOmega[i] * t + a * ee[i] + trainPh[i];
${SWELL_FAR_MIX > 0 ? `        // taste-r1 (W27): SWELL_FAR_MIX (water/surf.js). Far from the camera (farK 0 to 1) the shade only: one more phase noise per train, and a set-and-lull envelope in the train's own frame (the group runs at half the phase speed).
        float farPos = D.x * along + D.y * front + t * 0.5 * uBayOmega[i] / k;
        float farCr = -D.y * along + D.x * front;
${SWELL_FAR_TUNE > 0 ? `        float lullSc = mix(1.0, ${lullScaleV.toFixed(2)}, farK2);
        float lullN = ddValueNoise(vec2(farCr / (farLullM[i] * lullSc) + 5.3 * float(i) + 1.7, farPos / (farLullT[i] * lullSc) + 2.9 * float(i) + 4.1));${B ? `
        lullN = mix(lullN, bLull, ${B.lullShare.toFixed(2)} * farK2);` : ''}` : `        float lullN = ddValueNoise(vec2(farCr / farLullM[i] + 5.3 * float(i) + 1.7, farPos / farLullT[i] + 2.9 * float(i) + 4.1));`}
${SWELL_FAR_TUNE > 0 ? `        float lullFloor = mix(${F.lullMin.toFixed(2)}, ${G.lullMin.toFixed(2)}, farK2);
        float lullEn = mix(1.0, lullFloor + (1.0 - lullFloor) * smoothstep(mix(${F.lullLo.toFixed(2)}, ${lullLoV.toFixed(2)}, farK2), mix(${F.lullHi.toFixed(2)}, ${lullHiV.toFixed(2)}, farK2), lullN), farK);
${B ? `        lullEn *= bGap;
` : ''}        phi += farK2 * farPh2Rad[i] * (2.0 * ddValueNoise(vec2(along, front) / farPh2M[i] + vec2(7.7, 2.3) * float(i + 1)) - 1.0);
${B ? `        phi += bKey * farBrkPh[i] * (2.0 * ddHash21(bId + vec2(11.0, 7.0) * float(i + 1)) - 1.0);
` : ''}` : `        float lullEn = mix(1.0, ${F.lullMin.toFixed(2)} + ${(1 - F.lullMin).toFixed(2)} * smoothstep(${F.lullLo.toFixed(2)}, ${F.lullHi.toFixed(2)}, lullN), farK);
`}        phi += farK * farPhRad[i] * (2.0 * ddValueNoise(vec2(along, front) / farPhM[i] + vec2(4.1, 9.7) * float(i + 1)) - 1.0);
        g += D * (lullEn * shadeW[i] * uBayAmp[i] * uWaveScale * live * env * gain * bedCap * trainEn[i] * k * cos(phi));
` : `        g += D * (shadeW[i] * uBayAmp[i] * uWaveScale * live * env * gain * bedCap * trainEn[i] * k * cos(phi));
`}      }
      return g;
    }
` : ''}
    // taste-r1 (W17-A): the shade-only components (WATER_LAW.waves.ocean.shadeTrains). Slope only, never a height: aqua.js adds it to the slope
    // that feeds the swell shade and to nothing else. Each is a plane wave at its deep-water speed with a slow phase wander and a group envelope in
    // its own frame. The caller multiplies by the shore fade, the rain gain and uShadeGain. Twin: seaShadeGradAt.
    ${shadeConsts}
    vec2 ddSeaShadeGrad(float along, float front, float t) {
      vec2 g = vec2(0.0);
      for (int i = 0; i < ${SHADE_ITEMS.length}; i++) {
        vec2 D = DD_SH_D[i];
        vec4 E = DD_SH_E[i];
        float pos = D.x * along + D.y * front;
        float cr = -D.y * along + D.x * front;
        float n = ddValueNoise(vec2(cr / E.x + E.z * 5.3, (pos + t * E.w) / E.y + E.z * 2.9));
        float en = ${SHADE.envMin.toFixed(2)} + ${(1 - SHADE.envMin).toFixed(2)} * smoothstep(${SHADE.envLo.toFixed(2)}, ${SHADE.envHi.toFixed(2)}, n);
        float wob = ${SHADE.wanderRad.toFixed(2)} * (2.0 * ddValueNoise(vec2(along, front) / ${SHADE.wanderM.toFixed(1)} + vec2(3.7, 6.1) * E.z) - 1.0)
          + ${SHADE.wander2Rad.toFixed(2)} * (2.0 * ddValueNoise(vec2(along, front) / ${SHADE.wander2M.toFixed(1)} + vec2(1.7, 2.3) * E.z + vec2(9.0, 4.0)) - 1.0);
        g += D * (DD_SH_S[i] * en * cos(DD_SH_KW[i].x * pos + DD_SH_KW[i].y * t + wob));
      }
      return g;
    }

    // taste-r1 (W14-A fix): whitecaps are sparse, irregular and gathered where a gust passes.
    // ddSeaGust: a slow low-frequency mask (62 m and 140 m octaves, drifting 0.6 m/s with the wind); \`lo\` and \`hi\` place the
    // threshold, so about a fifth of the open sea sits under a gust in clear sky and about a third in rain.
    float ddSeaGust(vec2 p, float t, float lo, float hi) {
      vec2 q = p + vec2(50.0, -10.0) + t * vec2(0.5, 0.3);
      float n = 0.6 * ddValueNoise(q / 140.0 + vec2(7.7, 2.3)) + 0.4 * ddValueNoise(q / 62.0 + vec2(31.1, 11.9));
      return smoothstep(lo, hi, n);
    }
    // taste-r1 (W15-A1) ddSeaFleckPack: whitecaps cut from the fleck channel of the foam pack (coast-textures.js, green). The old
    // ddSeaFleck drew one wedge repeated on a cell grid, so every fleck was the same and they stood in diagonal rows. Now:
    //   WHERE   a hashed grid of 5.5 m cells, turned 23.7 degrees off the crest frame, one candidate per cell and cycle with its
    //           centre anywhere in the cell; it is kept only where the carrier crest (train 0, with its open-sea wander) lies
    //           0.3 to 17 m behind it, the back of the crest, and only inside a gust patch (ddSeaGust). No row, no column.
    //   WHAT    one of the 30 streaks measured out of the pack (centre, axis, length, width below), cut at its own axis, mirrored
    //           at random, turned up to 25 degrees off the crest line, 2 to 7 m long (short ones commoner) and 3.2 to 5.5 times
    //           as long as wide, so no two are alike. The pack's own soft torn edge is the fleck's edge.
    //   WHEN    2 to 5 s of life per cycle, fading in over 0.4 s and out over the last 40%, then a gap of 0.6 to 3.4 s and a new
    //           fleck (new place, new streak) in the same cell. Time is uTime only.
    // foot is the pixel footprint in metres; the fetch is a textureLod so the fleck blurs with distance instead of aliasing.
    // ph0 is the open-sea wander of the carrier (ddSurfTrains), so flecks sit on the crest that is drawn.
    // The 30 streaks of the pack: (centre u, centre v, axis angle, length) and width, all in tile units.
    const vec4 DD_FLECK_A[30] = vec4[30](
      vec4(0.1283, 0.0895, 0.4002, 0.2913), vec4(0.3554, 0.7778, 0.5511, 0.2057), vec4(0.9810, 0.7187, 0.5028, 0.2005),
      vec4(0.5867, 0.0690, 0.5745, 0.2048), vec4(0.5094, 0.5118, 0.5337, 0.1832), vec4(0.7725, 0.1931, 0.5371, 0.1939),
      vec4(0.0481, 0.2494, 0.5008, 0.2073), vec4(0.7937, 0.8745, 0.6327, 0.1621), vec4(0.4007, 0.2626, 0.5696, 0.1815),
      vec4(0.0157, 0.4824, 0.5070, 0.1654), vec4(0.2319, 0.3445, 0.5299, 0.1742), vec4(0.2074, 0.5794, 0.5750, 0.1593),
      vec4(0.2465, 0.9863, 0.5871, 0.1571), vec4(0.6803, 0.4008, 0.5680, 0.1511), vec4(0.6054, 0.9442, 0.5783, 0.1494),
      vec4(0.0908, 0.6551, 0.7780, 0.1493), vec4(0.6858, 0.7027, 0.5191, 0.1189), vec4(0.1464, 0.8436, 0.5733, 0.1452),
      vec4(0.0535, 0.9151, 0.5456, 0.1219), vec4(0.8851, 0.1088, 0.5559, 0.1116), vec4(0.0517, 0.3524, 0.5136, 0.1136),
      vec4(0.8149, 0.3423, 0.4986, 0.1068), vec4(0.4579, 0.6667, 0.5474, 0.1122), vec4(0.3048, 0.5097, 0.5366, 0.0935),
      vec4(0.5864, 0.2029, 0.5352, 0.0918), vec4(0.7290, 0.5732, 0.5870, 0.0915), vec4(0.8771, 0.5349, 0.4739, 0.1057),
      vec4(0.4462, 0.3858, 0.5428, 0.0878), vec4(0.8438, 0.0117, 0.6664, 0.0796), vec4(0.3549, 0.9103, 0.5756, 0.0845)
    );
    const float DD_FLECK_W[30] = float[30](0.0708, 0.0315, 0.0322, 0.0336, 0.0328, 0.0395, 0.0301, 0.0301, 0.0301, 0.0353, 0.0296, 0.0344, 0.0271, 0.0261, 0.0268, 0.0339, 0.0271, 0.0280, 0.0215, 0.0228, 0.0226, 0.0237, 0.0214, 0.0220, 0.0208, 0.0217, 0.0194, 0.0215, 0.0224, 0.0202);
    float ddSeaFleckPack(float along, float front, float t, float foot, float gust, float dense, float ph0, float camD) {
      if (gust <= 0.0 || uFleckReady <= 0.0) return 0.0;
      vec2 D = uBayDir[0];
      float len = max(uBayLen[0], 4.0);
      float k = 6.28318530718 / len;
      vec2 T = vec2(-D.y, D.x);
      vec2 N2 = vec2(D.x, D.y);
      const float CELL = 3.2;
      const mat2 R = mat2(0.91590, -0.40140, 0.40140, 0.91590);
      vec2 p = vec2(along, front);
      vec2 ci = floor((R * p) / CELL);
      float acc = 0.0;
      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          vec2 c = ci + vec2(float(i), float(j));
          float hL = ddHash21(c + vec2(41.0, 3.3));
          float hP = ddHash21(c + vec2(8.8, 19.1));
          float hO = ddHash21(c + vec2(29.0, 6.0));
          float life = mix(${WHITECAP_FOAM.lifeMin.toFixed(1)}, ${WF(5.0, WHITECAP_FOAM.lifeMax)}, hL);
          float period = life + mix(0.6, 3.4, hP);
          float tc = t + hO * period * 17.0;
          float cyc = floor(tc / period);
          float age = tc - cyc * period;
          if (age > life) continue;
          vec2 key = c + vec2(cyc * 13.7, cyc * 5.3);
          if (ddHash21(key + vec2(3.1, 7.7)) > dense * gust) continue;
          if (ddHash21(key + vec2(91.0, 14.0)) > mix(1.0, ${WF(1.0, WHITECAP_FOAM.nearKeep)}, 1.0 - smoothstep(${WHITECAP_FOAM.nearM.toFixed(1)}, ${WHITECAP_FOAM.farM.toFixed(1)}, camD))) continue; // taste-r1 (W21-B): half the patches near the camera
          vec2 cen = transpose(R) * ((c + vec2(ddHash21(key + vec2(13.3, 1.9)), ddHash21(key + vec2(5.7, 23.1)))) * CELL);
          float phiC = k * (D.x * cen.x + D.y * (cen.y + (sin(cen.x * 0.019 + 0.6) * 4.2 + sin(cen.x * 0.047 + 1.9) * 1.8) * 0.35)) + uBayOmega[0] * t + ph0;
          float behind = fract((phiC - 1.5707963) / 6.28318530718) * len;
          float zone = smoothstep(0.3, 1.2, behind) * (1.0 - smoothstep(15.0, 19.0, behind));
          if (zone <= 0.0) continue;
          float hs = ddHash21(key + vec2(2.0, 31.0));
          float flen = mix(${WC(1.2, WHITECAP_SHAPE.lenMin)}, ${WC(3.6, WHITECAP_SHAPE.lenMax)}, pow(hs, ${WC(2.0, WHITECAP_SHAPE.skew)})); // taste-r1 (W19 review): smaller; at 1.6 to 5.5 m the patches read as floating debris at twice the size
          float fwidRatio = mix(2.0, 3.6, ddHash21(key + vec2(17.0, 9.0)));
          fwidRatio = mix(fwidRatio, max(fwidRatio, ${WHITECAP_LACE.long.toFixed(2)}), ${WHITECAP_LACE.gain.toFixed(2)} * smoothstep(0.35, 0.8, hs)); // taste-r1 (W22-C): the long ones reach 4 to 1
          float fwid = flen / fwidRatio;
          float ang = (ddHash21(key + vec2(61.0, 4.0)) * 2.0 - 1.0) * ${WC(0.22, WHITECAP_SHAPE.spread)} + (ddValueNoise(vec2(cen.x / 37.0 + 3.0, cen.y / 53.0 + 8.0)) - 0.5) * 0.5 * ${WHITECAP_SHAPE.gain.toFixed(2)};
          vec2 Tdir = vec2(cos(ang), sin(ang)); // taste-r1 (W19-C2): p is (along, front), so the crest runs along p.x
          vec2 d = p - cen - D * ${WHITECAP_FOAM.drift.toFixed(2)} * ${WHITECAP_FOAM.gain.toFixed(2)} * (age / life - 0.5); // taste-r1 (W21-B): the patch drifts with its crest
          float l = dot(d, Tdir) * (ddHash21(key + vec2(9.0, 71.0)) < 0.5 ? -1.0 : 1.0);
          float w = dot(d, vec2(-Tdir.y, Tdir.x)) * (ddHash21(key + vec2(77.0, 2.0)) < 0.5 ? -1.0 : 1.0);
          float s = l / (flen * 1.25) + 0.5;
          float r = w / (fwid * 1.6) + 0.5;
          if (s <= 0.0 || s >= 1.0 || r <= 0.0 || r >= 1.0) continue;
          int idx = int(floor(ddHash21(key + vec2(23.0, 47.0)) * 30.0));
          vec4 A = DD_FLECK_A[idx];
          float Wd = DD_FLECK_W[idx];
          float shift = (ddHash21(key + vec2(35.0, 12.0)) - 0.5) * 0.18 * A.w;
          vec2 loc = vec2((s - 0.5) * A.w * 1.25 + shift, (r - 0.5) * Wd * 1.6);
          float ca = cos(A.z);
          float sa = sin(A.z);
          vec2 uv = A.xy + vec2(loc.x * ca - loc.y * sa, loc.x * sa + loc.y * ca);
          float texPerM = A.w * 512.0 / flen;
          float lod = max(0.0, log2(max(foot * texPerM, 1.0)));
          // taste-r1 (W19-C2): the torn lace core at its own sharpness, no extra blur.
          float mCore = smoothstep(0.10, 0.75, textureLod(uFleckPack, uv, lod).g);
          // Soft torn edge: a wider, blurred read of the same streak (three mips up) feeds a half-strength halo around the core.
          float mHalo = smoothstep(0.05, 0.6, textureLod(uFleckPack, uv, lod + 3.0).g);
          float m = max(mCore, 0.33 * mHalo);
          // taste-r1 (W19-C): a streak is broken along its length by a slow noise, so no two whitecaps are the same oval and the edge frays.
          // taste-r1 (W19-C2): holes torn across the width as well as along the length (two noises, crossed), so a patch is ragged.
          float hn = ddHash21(key + vec2(5.0, 88.0));
          m *= 0.12 + 0.88 * smoothstep(0.34, 0.58, ddValueNoise(vec2(l * 0.95 + hn * 61.0, w * 2.4 + ddHash21(key + vec2(44.0, 6.0)) * 37.0)));
          m *= 0.35 + 0.65 * smoothstep(0.30, 0.55, ddValueNoise(vec2(w * 1.9 + hn * 17.0, l * 0.6 + 53.0)));
          // taste-r1 (W22-C): lace. The body is opened by the breaker channel in patch metres; the head (toward the crest) is torn, the tail turns into streaks (the same channel stretched along the patch).
          if (${WHITECAP_LACE.gain.toFixed(2)} > 0.0) {
            float tailS = dot(d, Tdir) / (flen * 1.25) + 0.5;
            vec2 loff = vec2(ddHash21(key + vec2(12.0, 3.0)), ddHash21(key + vec2(3.0, 12.0))) * 7.0;
            float lod2 = max(0.0, log2(max(foot * 512.0 / ${WHITECAP_LACE.tileM.toFixed(2)}, 1.0)));
            float laceB = smoothstep(0.16, 0.60, textureLod(uFleckPack, vec2(l, w) / ${WHITECAP_LACE.tileM.toFixed(2)} + loff, lod2 + 1.0).r);
            float laceS = smoothstep(0.20, 0.62, textureLod(uFleckPack, vec2(l / ${(WHITECAP_LACE.tileM * 6).toFixed(2)}, w / ${(WHITECAP_LACE.tileM * 0.6).toFixed(2)}) + loff.yx, lod2 + 0.5).r);
            float tailW = smoothstep(0.35, 0.95, tailS);
            float headW = 1.0 - smoothstep(0.0, 0.35, tailS);
            float laceK = mix(laceB, laceS, ${WHITECAP_LACE.streak.toFixed(2)} * tailW);
            laceK = mix(laceK, laceK * (0.35 + 0.65 * laceB), headW);
            m *= mix(1.0, laceK, ${(WHITECAP_LACE.hole * WHITECAP_LACE.gain).toFixed(2)});
          }
          float fe = ${WF(0.14, WHITECAP_FOAM.feather)}; // taste-r1 (W21-B): feather over a third of the patch width
          float edge = smoothstep(0.0, fe, s) * (1.0 - smoothstep(1.0 - fe, 1.0, s)) * smoothstep(0.0, fe, r) * (1.0 - smoothstep(1.0 - fe, 1.0, r));
          float live = smoothstep(0.0, ${WF(0.4, 0.25)} * life, age) * (1.0 - smoothstep(${WF(0.6, 0.5)} * life, life, age));
          live *= 0.55 + 0.45 * sin(3.14159265 * clamp(age / life, 0.0, 1.0));
          float bright = mix(0.45, 0.80, ddHash21(key + vec2(67.0, 29.0)));
          // taste-r1 (W20-A): the smear. Along the patch's own unmirrored axis the brightness falls from the head (toward the crest) to the tail by ${WHITECAP_SHAPE.smear.toFixed(2)} x gain.
          float tailK = 1.0 - ${(WHITECAP_SHAPE.smear * WHITECAP_SHAPE.gain).toFixed(2)} * smoothstep(0.30, 1.0, dot(d, Tdir) / (flen * 1.25) + 0.5);
          bright *= tailK;
          acc = max(acc, m * edge * live * zone * bright);
        }
      }
      return acc;
    }
    // Specular micro-structure. A sparse jittered field of ${sp.cellM.toFixed(2)} m cells advected with the swell,
    // twinkling at ${sp.hz.toFixed(1)} Hz. Returns 0..1 glint centrality (0 in the troughs); the caller
    // turns it into roughness ${sp.roughness.trough.toFixed(2)} (trough) to ${sp.roughness.glint.toFixed(2)} (glint centre) and adds it to the specular lobe only.
    // \`size\` scales the speck radius (1 at the far field, ${sp.nearSize.toFixed(2)} inside 60 m: see WATER_LAW.sparkle.near*).
    float ddSeaSparkle(vec2 p, float t, vec2 advect, float gather, float density, float size) {
      vec2 q = (p - advect * t) / ${sp.cellM.toFixed(3)};
      vec2 id = floor(q);
      vec2 f = fract(q);
      float h = ddHash21(id + vec2(17.0, 3.0));
      float on = step(h, density * mix(0.05, 1.0, gather));
      vec2 centre = vec2(0.30) + 0.40 * vec2(ddHash21(id + vec2(5.0, 29.0)), ddHash21(id + vec2(41.0, 7.0)));
      float d = length(f - centre) / (0.30 * max(size, 0.2));
      float spot = 1.0 - smoothstep(0.30, 1.0, d);
      float tw = 0.5 + 0.5 * sin(6.28318530718 * ${sp.hz.toFixed(2)} * t + 6.28318530718 * h);
      return on * spot * mix(0.55, 1.0, tw);
    }
  `;
}

export default { swellEnvelopeAt, seaShadeGradAt, seaShadeFadeAt, seaRainState, seaEnvelopeGlsl, seaFragmentGlsl };
