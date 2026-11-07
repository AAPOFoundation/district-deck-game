// R79 — Streamline Moderne facade finish.
// One owner for final albedo, roughness and normal on the existing wall,
// wallAlt and trim buckets. The original mineral-plaster map is the shared
// MaterialLibrary.beauxPlaster() resource. No second texture and no roof work.

import * as THREE from 'three';
import { readRestyle } from '../style/restyle.js';
import { R72_PLASTER_MEAN, R72_PLASTER_METRES } from './beaux-surfaces-r72.js';

export const R79_VERSION = 'r79-moderne-surfaces-v1';
export const R79_MAP_ATTRIBUTE = 'aR79Map';
export const R79_ROLE_ATTRIBUTE = 'aR79Role';
export const R79_WALL = 0;
export const R79_RIBBON = 1;
export const R79_SPANDREL = 2;
/** Upward wall caps that read as the roof. Keep the inherited wall finish. */
export const R79_LEGACY = 3;
export const R79_SUPPORT_NEAR = 0.02;
export const R79_SUPPORT_FAR = 0.42;
export const R79_CONTACT_LIMIT = 12;
/** Pale ribbons, piers and parapets that share the wall bucket but not the wall field. */
export const R79_PALE_PIECES = Object.freeze([
  'moderne-arc-band',
  'moderne-front-pier',
  'moderne-flank-pier',
  'moderne-parapet-front',
  'moderne-parapet-right',
  'moderne-parapet-left',
  'moderne-parapet-rear',
  'moderne-parapet-arc',
  'parapet-blade',
]);
export const R79_WALL_ROUGH = 0.90;
export const R79_RIBBON_ROUGH = 0.40;
export const R79_SPANDREL_ROUGH = 0.58;
export const R79_NORMAL_GAIN = 0.0015;
export const R79_RETIRED_GRIME = 'render-grime';

const PAINT_ASSIGN = 'diffuseColor.rgb = diffuse * r7bBaseGain * r7bChannels.r/.35;';
const COLOR_ANCHOR = '#include <color_fragment>';
const LIGHTS_ANCHOR = '#include <lights_physical_fragment>';
const MEAN_L = R72_PLASTER_MEAN[0] * 0.2126
  + R72_PLASTER_MEAN[1] * 0.7152
  + R72_PLASTER_MEAN[2] * 0.0722;

const WALL_PREFIX = 'res-wall-walkup-moderne-';
const ALT_PREFIX = 'res-wall-alt-walkup-moderne-';
const TRIM_PREFIX = 'res-trim-walkup-moderne-';

export function moderneSurfaceKind(material) {
  const variant = material?.userData?.variant ?? '';
  if (variant.startsWith(ALT_PREFIX)) return 'spandrel';
  if (variant.startsWith(WALL_PREFIX)) return 'wall';
  if (variant.startsWith(TRIM_PREFIX)) return 'ribbon';
  return null;
}

export function isModerneSurfaceMaterial(material) {
  return moderneSurfaceKind(material) != null;
}

export function moderneRoleForKind(kind) {
  if (kind === 'ribbon') return R79_RIBBON;
  if (kind === 'spandrel') return R79_SPANDREL;
  return R79_WALL;
}

/** Named construction role. Bucket kind is only the fallback for an unnamed piece. */
export function moderneRoleForPiece(name, kind) {
  if (kind === 'spandrel') return R79_SPANDREL;
  if (R79_PALE_PIECES.includes(name) || kind === 'ribbon') return R79_RIBBON;
  return R79_WALL;
}

/** Wall-field lids at the roof plane keep the inherited finish. Not ribbons or spandrels. */
export function moderneVertexRole(pieceRole, y, ny, frame) {
  if (pieceRole === R79_WALL && ny > 0.75 && Number.isFinite(frame?.roofY) && y >= frame.roofY - 0.05) {
    return R79_LEGACY;
  }
  return pieceRole;
}

/**
 * Building-local metres. Curved across is arc length from the front tangent,
 * and the right flank continues that length. Planar front across is x, so the
 * rounded band and its straight continuation share one phase.
 */
export function moderneUnwrap(x, y, z, nx, ny, nz, frame) {
  const dx = x - frame.cx;
  const dz = z - frame.cz;
  const radius = Math.hypot(dx, dz);
  const angle = Math.atan2(dx, dz);
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  const inQuarter = dx >= -0.25 && dz >= -0.25
    && angle >= -0.15 && angle <= Math.PI / 2 + 0.15;
  const nearArc = radius > frame.R * 0.40 && radius < frame.R + 2.4;
  const radial = radius > 1e-4 ? (nx * dx + nz * dz) / radius : 0;
  const curvedSide = inQuarter && nearArc && ay < 0.78 && radial > 0.42;
  const curvedCap = inQuarter && nearArc && ay >= 0.78
    && angle >= -0.05 && angle <= Math.PI / 2 + 0.05;
  if (curvedSide || curvedCap) {
    return [frame.cx + angle * Math.max(radius, 1e-4), y, 1];
  }
  if (nx > 0.35 && ax >= az && z <= frame.cz + 0.3) {
    const equiv = Math.max(frame.R * 0.25, x - frame.cx);
    return [frame.cx + (Math.PI / 2) * equiv + (frame.cz - z), y, 0];
  }
  if (nx < -0.35 && ax >= az) return [z, y, 0];
  if (nz < -0.35 && az >= ax && !inQuarter) return [x, y, 0];
  return [x, y, 0];
}

function ledgeUndersides(frame) {
  const ledges = [];
  for (let i = 0; i < 3; i += 1) {
    const storey = frame.baseY + frame.groundH + frame.upperH * i;
    ledges.push({ y: storey + frame.ribbonSill - 0.86, kind: 'band' });
    ledges.push({ y: storey + frame.ribbonSill - 0.09, kind: 'band' });
  }
  ledges.push({ y: frame.baseY + 0.49, kind: 'band' });
  ledges.push({ y: frame.baseY + frame.awningY, kind: 'awning' });
  ledges.push({ y: frame.roofY + frame.parH, kind: 'coping' });
  return ledges;
}

function ledgeCover(x, z, nx, nz, ny, frame, kind) {
  if (Math.abs(ny) > 0.72) return false;
  const dx = x - frame.cx;
  const dz = z - frame.cz;
  const angle = Math.atan2(dx, dz);
  const inArc = dx > -0.2 && dz > -0.2 && angle > -0.08 && angle < Math.PI / 2 + 0.08;
  const front = nz > 0.4 || (z > frame.frontZ - 0.4 && nx < 0.55 && nz >= -0.05);
  const right = nx > 0.4;
  if (kind === 'coping') return true;
  if (kind === 'awning') return front || inArc || (right && z > frame.cz - 3.4);
  return front || inArc || right;
}

export function moderneContactRecords(frame) {
  if (!frame) return [];
  return ledgeUndersides(frame).map((ledge) => ({
    y: ledge.y,
    kind: ledge.kind === 'awning' ? 1 : ledge.kind === 'coping' ? 2 : 0,
  }));
}

/**
 * Per-fragment ledge support. Height window and face coverage are exact at the
 * sample; they must not be stored on vertices and interpolated.
 */
export function moderneSupportAt(x, y, z, nx, ny, nz, frame) {
  if (!frame) return 0;
  const span = R79_SUPPORT_FAR - R79_SUPPORT_NEAR;
  let age = 0;
  for (const contact of moderneContactRecords(frame)) {
    const below = contact.y - y;
    if (below <= R79_SUPPORT_NEAR || below >= R79_SUPPORT_FAR) continue;
    const kind = contact.kind === 2 ? 'coping' : contact.kind === 1 ? 'awning' : 'band';
    if (!ledgeCover(x, z, nx, nz, ny, frame, kind)) continue;
    const t = 1 - (below - R79_SUPPORT_NEAR) / span;
    age = Math.max(age, t * t);
  }
  return age;
}

function writeModerneAttributes(geometry, frame, roleAt) {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  if (!position || !normal || !frame) return geometry;
  const count = position.count;
  const roles = new Float32Array(count);
  const map = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const unwrap = moderneUnwrap(
      position.getX(i), position.getY(i), position.getZ(i),
      normal.getX(i), normal.getY(i), normal.getZ(i),
      frame,
    );
    map[i * 3] = unwrap[0];
    map[i * 3 + 1] = unwrap[1];
    map[i * 3 + 2] = unwrap[2];
    roles[i] = roleAt(i);
  }
  geometry.setAttribute(R79_ROLE_ATTRIBUTE, new THREE.Float32BufferAttribute(roles, 1));
  geometry.setAttribute(R79_MAP_ATTRIBUTE, new THREE.Float32BufferAttribute(map, 3));
  if (geometry.getAttribute('aR79Age')) geometry.deleteAttribute('aR79Age');
  return geometry;
}

export function moderneAttributesComplete(geometry) {
  const position = geometry?.getAttribute?.('position');
  const role = geometry?.getAttribute?.(R79_ROLE_ATTRIBUTE);
  const map = geometry?.getAttribute?.(R79_MAP_ATTRIBUTE);
  if (!position || !role || !map) return false;
  return role.count === position.count && map.count === position.count
    && role.itemSize === 1 && map.itemSize === 3;
}

/** Named raw part. Role comes from the piece name, not the shared bucket. */
export function authorModernePiece(geometry, material) {
  const frame = material?.userData?.r79Frame;
  const kind = moderneSurfaceKind(material);
  if (!geometry || !frame || !kind) return geometry;
  const pieceRole = moderneRoleForPiece(geometry.name ?? '', kind);
  const position = geometry.getAttribute?.('position');
  const normal = geometry.getAttribute?.('normal');
  return writeModerneAttributes(geometry, frame, (index) => moderneVertexRole(
    pieceRole,
    position?.getY(index) ?? 0,
    normal?.getY(index) ?? 0,
    frame,
  ));
}

/**
 * Finished buckets already carry per-piece roles. Only geometry appended
 * without those attributes gets the bucket fallback. Never rewrite a complete set.
 */
export function authorMissingModerneAttributes(geometry, material) {
  if (!geometry || !isModerneSurfaceMaterial(material)) return geometry;
  if (moderneAttributesComplete(geometry)) {
    if (geometry.getAttribute('aR79Age')) geometry.deleteAttribute('aR79Age');
    return geometry;
  }
  const frame = material?.userData?.r79Frame;
  const role = moderneRoleForKind(moderneSurfaceKind(material));
  return writeModerneAttributes(geometry, frame, () => role);
}

/** Mark the three Moderne buckets and stamp whatever parts already exist. */
export function authorModerneHeritage(ctx, frame) {
  if (ctx?.archetypeId !== 'walkup-moderne' || !frame) return;
  const buckets = [
    ['wall', R79_WALL],
    ['wallAlt', R79_SPANDREL],
    ['trim', R79_RIBBON],
  ];
  const targets = new Set();
  for (const [name] of buckets) {
    const material = ctx.p?.[name];
    if (!material) continue;
    material.userData.r79Frame = frame;
    material.userData.r79FallbackRole = moderneRoleForKind(moderneSurfaceKind(material));
    targets.add(material);
  }
  const stamp = (part) => {
    if (part?.geometry && targets.has(part.material)) {
      authorModernePiece(part.geometry, part.material);
    }
  };
  for (const part of ctx.parts ?? []) stamp(part);
  for (const opening of ctx.openings ?? []) {
    for (const part of opening.parts ?? []) stamp(part);
  }
}

function replaceOnce(source, anchor, body, label) {
  let count = 0;
  let from = 0;
  while (from < source.length) {
    const at = source.indexOf(anchor, from);
    if (at < 0) break;
    count += 1;
    from = at + anchor.length;
  }
  if (count !== 1) throw new Error(`Moderne surface ${label} occurred ${count} times`);
  return source.replace(anchor, body);
}

function meanLiteral() {
  return `vec3(${R72_PLASTER_MEAN.map((v) => v.toFixed(5)).join(', ')})`;
}

function albedoBlock(legacy, gain = null) {
  const gate = legacy
    ? `if (r79Role > 2.5) {
    diffuseColor.rgb = diffuse * r7bBaseGain * r7bChannels.r/.35;
  } else {`
    : '';
  const close = legacy ? '\n}' : '';
  return `// ${R79_VERSION}
{
  vec2 r79Uv = vR79Map.xy / ${R72_PLASTER_METRES.toFixed(1)};
  r79PlasterLin = ${meanLiteral()};
  if (r79PlasterReady > 0.5) {
    r79PlasterLin = r79SrgbToLinear(texture2D(r79PlasterMap, r79Uv).rgb);
  }
  float r79Luma = dot(r79PlasterLin, vec3(0.2126, 0.7152, 0.0722));
  float r79Mineral = clamp(r79Luma / ${MEAN_L.toFixed(5)}, 0.80, 1.20);
  float r79Role = clamp(floor(vR79Role + 0.5), 0.0, ${legacy ? '3.0' : '2.0'});
  r79AgeMask = r79Mask(vR79Local, vR79N);
  ${gate}
  vec3 r79Albedo = diffuse;
  if (r79Role < 0.5) {
    vec3 r79Neutral = diffuse * r79Mineral;
    vec3 r79Warm = diffuse * (r79PlasterLin / ${meanLiteral()}) * r79Mineral;
    r79Albedo = mix(r79Neutral, r79Warm, 0.12);
    r79Albedo *= 1.0 - clamp(r79AgeMask, 0.0, 1.0) * 0.16;
  } else if (r79Role < 1.5) {
    r79Albedo = diffuse * mix(1.0, r79Mineral, 0.05);
  } else {
    float r79Speck = clamp(r79Mineral, 0.94, 1.06);
    r79Albedo = diffuse * mix(1.0, r79Speck, 0.22);
  }
${gain ? `  r79Albedo *= ${gain};\n` : ''}  diffuseColor.rgb = max(r79Albedo, vec3(0.0));${close}
}`;
}

function lightsBlock() {
  return `// ${R79_VERSION}-shade
{
  float r79Role = clamp(floor(vR79Role + 0.5), 0.0, 3.0);
  if (r79Role < 2.5) {
  float r79Rough = r79Role < 0.5 ? ${R79_WALL_ROUGH.toFixed(2)}
    : (r79Role < 1.5 ? ${R79_RIBBON_ROUGH.toFixed(2)} : ${R79_SPANDREL_ROUGH.toFixed(2)});
  if (r79Role < 0.5) r79Rough += clamp(r79AgeMask, 0.0, 1.0) * 0.05;
  roughnessFactor = clamp(r79Rough, 0.04, 1.0);
  normal = nonPerturbedNormal;
  if (r79Fine > 0.5 && r79Role < 0.5) {
    #ifdef USE_NORMALMAP
      float r79H = dot(r79PlasterLin, vec3(0.2126, 0.7152, 0.0722));
      vec2 r79St = vR79Map.xy / ${R72_PLASTER_METRES.toFixed(1)};
      vec2 r79Dx = dFdx(r79St);
      vec2 r79Dy = dFdy(r79St);
      float r79Hx = dFdx(r79H);
      float r79Hy = dFdy(r79H);
      float r79Det = r79Dx.x * r79Dy.y - r79Dx.y * r79Dy.x;
      float r79Hs = abs(r79Det) > 1e-5 ? (r79Hx * r79Dy.y - r79Dx.y * r79Hy) / r79Det : 0.0;
      float r79Ht = abs(r79Det) > 1e-5 ? (r79Dx.x * r79Hy - r79Hx * r79Dy.x) / r79Det : 0.0;
      vec3 r79MapN = normalize(vec3(-r79Hs * ${R79_NORMAL_GAIN.toFixed(4)}, -r79Ht * ${R79_NORMAL_GAIN.toFixed(4)}, 1.0));
      mat3 r79Tbn = getTangentFrame( - vViewPosition, normalize( nonPerturbedNormal ), r79St );
      #ifdef DOUBLE_SIDED
        r79Tbn[0] *= faceDirection;
        r79Tbn[1] *= faceDirection;
      #endif
      normal = normalize(r79Tbn * r79MapN);
    #endif
  }
  }
}
${LIGHTS_ANCHOR}`;
}

/**
 * The owned albedo block assigns diffuseColor and does not read vColor.
 * The single standard color include after it applies instance/vertex tint once.
 */
export function assessR79Tint(fragment, kind) {
  const start = fragment.indexOf(`// ${R79_VERSION}\n`);
  const end = fragment.indexOf(COLOR_ANCHOR, start);
  if (start < 0 || end < 0) throw new Error('Moderne albedo block is not before tint');
  const block = fragment.slice(start, end);
  if (block.includes('vColor')) throw new Error('Moderne albedo block consumes tint');
  if (block.split('diffuseColor.rgb = max(r79Albedo, vec3(0.0));').length - 1 !== 1) {
    throw new Error('Moderne albedo is not a single assignment');
  }
  if (block.includes('diffuse * diffuse')) {
    throw new Error('Moderne albedo squares diffuse');
  }
  if (kind === 'ribbon') {
    if (block.includes('r7bChannels') || block.includes('r7bBaseGain')) {
      throw new Error('Moderne trim references the wall paint');
    }
  } else {
    if (block.split(PAINT_ASSIGN).length - 1 !== 1 || !block.includes('if (r79Role > 2.5)')) {
      throw new Error('Moderne legacy roof cap does not keep one paint assignment');
    }
    const owned = block.split(PAINT_ASSIGN)[1];
    if (owned.includes('r7bChannels') || owned.includes('r7bBaseGain')) {
      throw new Error('Moderne albedo still layers the inherited paint');
    }
  }
  if (block.split('r79SrgbToLinear(').length - 1 !== 1) {
    throw new Error('Moderne plaster decode is not once');
  }
  const colorUses = fragment.split(COLOR_ANCHOR).length - 1;
  if (colorUses !== 1) throw new Error(`Moderne standard tint occurred ${colorUses} times`);
  if (kind === 'ribbon' && fragment.includes(PAINT_ASSIGN)) {
    throw new Error('Moderne trim picked up the wall paint assignment');
  }
  if (kind !== 'ribbon') {
    const outside = fragment.slice(0, start) + fragment.slice(end);
    if (outside.includes(PAINT_ASSIGN)) {
      throw new Error('Moderne wall paint assignment survived outside the owned branch');
    }
    const shadeBlock = fragment.slice(fragment.indexOf(`// ${R79_VERSION}-shade`));
    if (!shadeBlock.includes('if (r79Role < 2.5)')) {
      throw new Error('Moderne legacy cap still overwrites normal and roughness');
    }
  }
  const shade = fragment.indexOf(`// ${R79_VERSION}-shade`);
  if (shade < 0 || !fragment.includes('getTangentFrame( - vViewPosition, normalize( nonPerturbedNormal ), r79St )')) {
    throw new Error('Moderne normal is not the unwrapped tangent frame');
  }
  if (fragment.includes('dFdx(vViewPosition)')) {
    throw new Error('Moderne normal uses a screen basis');
  }
  if (fragment.includes('vR79Age') || fragment.includes('aR79Age')) {
    throw new Error('Moderne support is still a vertex age');
  }
  if (!fragment.includes('r79AgeMask = r79Mask(vR79Local, vR79N)')) {
    throw new Error('Moderne support is not evaluated at the fragment position');
  }
  return true;
}

export function applyModerneSurfaceFinish(material, { quality = 'high', plaster = null } = {}) {
  const kind = moderneSurfaceKind(material);
  if (!kind || material?.userData?.r79ModerneSurface) return material;
  const restyle = readRestyle(globalThis.location?.search ?? '').enabled;
  const gain = restyle ? (kind === 'wall' ? '1.35' : '1.3') : null;
  const role = moderneRoleForKind(kind);
  const fine = quality === 'low' ? 0 : 1;
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  const frame = material.userData?.r79Frame ?? null;
  const contacts = moderneContactRecords(frame);
  const packed = contacts.map((contact) => new THREE.Vector4(
    contact.y,
    contact.kind,
    frame?.cx ?? 0,
    frame?.cz ?? 0,
  ));
  while (packed.length < R79_CONTACT_LIMIT) packed.push(new THREE.Vector4(-1000, -1, 0, 0));
  material.defaultAttributeValues = {
    ...material.defaultAttributeValues,
    [R79_ROLE_ATTRIBUTE]: [role],
    [R79_MAP_ATTRIBUTE]: [0, 0, 0],
  };
  material.userData.r79ModerneSurface = {
    version: R79_VERSION,
    kind,
    role,
    fine,
    owns: ['albedo', 'roughness', 'normal'],
    plaster: plaster?.id ?? null,
    mapAttribute: R79_MAP_ATTRIBUTE,
  };
  material.onBeforeCompile = function onModerneSurface(shader, renderer) {
    if (typeof previous === 'function') previous.call(this, shader, renderer);
    shader.uniforms.r79Fine = { value: fine };
    shader.uniforms.r79PlasterMap = plaster?.map ?? { value: null };
    shader.uniforms.r79PlasterReady = plaster?.ready ?? { value: 0 };
    shader.uniforms.r79ContactCount = { value: contacts.length };
    shader.uniforms.r79Contacts = { value: packed };
    shader.uniforms.r79Frame = { value: new THREE.Vector4(
      frame?.cx ?? 0, frame?.cz ?? 0, frame?.R ?? 0, frame?.frontZ ?? 0,
    ) };
    shader.vertexShader = replaceOnce(
      shader.vertexShader,
      '#include <common>',
      `#include <common>
attribute float ${R79_ROLE_ATTRIBUTE};
attribute vec3 ${R79_MAP_ATTRIBUTE};
varying float vR79Role;
varying vec3 vR79Map;
varying vec3 vR79Local;
varying vec3 vR79N;`,
      'vertex common',
    );
    shader.vertexShader = replaceOnce(
      shader.vertexShader,
      '#include <begin_vertex>',
      `#include <begin_vertex>
vR79Role = ${R79_ROLE_ATTRIBUTE};
vR79Map = ${R79_MAP_ATTRIBUTE};
vR79Local = position;
vR79N = normal;`,
      'vertex begin',
    );
    shader.fragmentShader = replaceOnce(
      shader.fragmentShader,
      '#include <common>',
      `#include <common>
varying float vR79Role;
varying vec3 vR79Map;
varying vec3 vR79Local;
varying vec3 vR79N;
uniform float r79Fine;
uniform sampler2D r79PlasterMap;
uniform float r79PlasterReady;
uniform float r79ContactCount;
uniform vec4 r79Contacts[${R79_CONTACT_LIMIT}];
uniform vec4 r79Frame;
vec3 r79PlasterLin = ${meanLiteral()};
float r79AgeMask = 0.0;
vec3 r79SrgbToLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow(max((c + 0.055) / 1.055, vec3(0.0)), vec3(2.4));
  return mix(lo, hi, step(vec3(0.04045), c));
}
float r79Cover(vec3 p, vec3 n, float kind) {
  if (abs(n.y) > 0.72) return 0.0;
  float dx = p.x - r79Frame.x;
  float dz = p.z - r79Frame.y;
  float angle = atan(dx, dz);
  float inArc = step(-0.2, dx) * step(-0.2, dz) * step(-0.08, angle) * step(angle, ${ (Math.PI / 2 + 0.08).toFixed(6) });
  float front = max(step(0.4, n.z), step(r79Frame.w - 0.40, p.z) * step(n.x, 0.549999) * step(-0.05, n.z));
  float right = step(0.4, n.x);
  if (kind > 1.5) return 1.0;
  if (kind > 0.5) return max(front, max(inArc, right * step(r79Frame.y - 3.4, p.z)));
  return max(front, max(inArc, right));
}
float r79Mask(vec3 p, vec3 n) {
  float age = 0.0;
  for (int i = 0; i < ${R79_CONTACT_LIMIT}; i++) {
    if (float(i) >= r79ContactCount) continue;
    float below = r79Contacts[i].x - p.y;
    if (below <= ${R79_SUPPORT_NEAR.toFixed(2)} || below >= ${R79_SUPPORT_FAR.toFixed(2)}) continue;
    if (r79Cover(p, n, r79Contacts[i].y) < 0.5) continue;
    float t = 1.0 - (below - ${R79_SUPPORT_NEAR.toFixed(2)}) / ${(R79_SUPPORT_FAR - R79_SUPPORT_NEAR).toFixed(2)};
    age = max(age, t * t);
  }
  return age;
}`,
      'fragment common',
    );
    if (shader.fragmentShader.includes(PAINT_ASSIGN)) {
      shader.fragmentShader = replaceOnce(
        shader.fragmentShader,
        PAINT_ASSIGN,
        albedoBlock(true, gain),
        'paint albedo',
      );
    } else {
      shader.fragmentShader = replaceOnce(
        shader.fragmentShader,
        COLOR_ANCHOR,
        `${albedoBlock(false, gain)}\n${COLOR_ANCHOR}`,
        'trim albedo',
      );
    }
    shader.fragmentShader = replaceOnce(
      shader.fragmentShader,
      LIGHTS_ANCHOR,
      lightsBlock(),
      'lights',
    );
  };
  material.customProgramCacheKey = function moderneSurfaceKey() {
    const base = typeof previousKey === 'function' ? previousKey.call(this) : '';
    return `${base}|${R79_VERSION}:${kind}${restyle ? '|r79-restyle' : ''}`;
  };
  if ('needsUpdate' in material) material.needsUpdate = true;
  return material;
}
