// Material class key shared by the QA lineup and the albedo-gain switch.
// The map JSON lives here; the QA scripts and tests import it from this path.
// so existing imports stay the same object.
import MATERIAL_CLASS_MAP from './material-class-map.json' with { type: 'json' };

export { MATERIAL_CLASS_MAP };

// Class names for the switch. The map's `classes` array, not material-classes.js:
// the vehicle-pilot gate forbids that module outside the pilots.
const ALBEDO_GAIN_CLASSES = new Set(MATERIAL_CLASS_MAP.classes);
const ALBEDO_GAIN_GROUPS = new Set(MATERIAL_CLASS_MAP.groups ?? []);

// className if it is in the table, else family if it is, else unknown:<tag>, else raw.
// Sand, foliage and water are not a share: they are dropped before unknown.
// Building vs vehicle is the census entry id, stamped as userData.censusKind.
// painted_metal is the family of both, so the family cannot separate them.
export function keyMaterial(material, map = MATERIAL_CLASS_MAP) {
  const name = material?.name || '';
  const className = material?.userData?.className, family = material?.userData?.family;
  const hasClass = className != null && className !== '', hasFamily = family != null && family !== '';
  let keyed;
  if (hasClass && map.className && Object.hasOwn(map.className, className))
    keyed = { class: map.className[className], source: 'className', name };
  else if (!hasClass && hasFamily && (map.outOfScope ?? []).includes(family))
    keyed = { class: null, source: 'out-of-scope', name, excluded: true };
  else if (hasFamily && map.family && Object.hasOwn(map.family, family))
    keyed = { class: map.family[family], source: 'family', name };
  else if (hasClass) keyed = { class: 'unknown', source: 'unknown:' + className, name };
  else if (hasFamily) keyed = { class: 'unknown', source: 'unknown:' + family, name };
  else keyed = { class: 'raw', source: 'raw', name };
  if (keyed.excluded || material?.userData?.censusKind !== 'building') return keyed;

  const variant = String(material?.userData?.variant ?? '');
  const slotText = String(material?.userData?.slot ?? material?.userData?.schemeSlot ?? '');
  const bar = variant.lastIndexOf('|');
  const slot = (bar >= 0 ? variant.slice(bar + 1) : slotText).toLowerCase();
  const hay = name + '\n' + variant + '\n' + String(material?.userData?.role ?? '');
  const token = words => new RegExp('(?:^|[^a-z0-9])(?:' + words + ')(?=$|[^a-z0-9])', 'i');
  const named = words => token(words).test(hay) || token(words).test(slot);
  const paint = (role, roleBy) => ({ ...keyed, class: role, role, roleBy, keyedClass: keyed.class });

  // Ruling 69: legacy-ao is painted steel only. Concrete, render and glass keep their class.
  if (keyed.class !== 'painted-steel') return keyed;
  if (slot === 'shadow' || slot === 'recess') return paint('legacy-ao', 'slot');
  if (named('shadow|recess')) return paint('legacy-ao', 'name');
  const hexes = new Set((map?.schemeShadow ?? []).map(hex => String(hex).replace('#', '').toLowerCase()));
  const colours = [];
  if (typeof material?.color?.getHexString === 'function') colours.push(material.color.getHexString());
  if (typeof material?.userData?.colorHex === 'string') colours.push(material.userData.colorHex);
  const authored = material?.userData?.citySurfaceFinish?.authoredSrgb;
  if (typeof authored === 'string') colours.push(authored);
  if (colours.some(hex => hexes.has(String(hex).replace('#', '').toLowerCase()))) return paint('legacy-ao', 'colour');
  // Gutter, downpipe, spout and flashing are trim even when the name also says roof.
  if (named('gutter|downpipe|spout|flashing')) return paint('metal-trim', 'name');
  if (slot === 'roof' || slot === 'roof-deck') return paint('metal-roof-sheet', 'slot');
  if (named('roof|sheet|cladding')) return paint('metal-roof-sheet', 'name');
  if (named('joinery|frame|window|door|mullion')) return paint('metal-joinery', 'name');
  if (named('fence|rail|balustrade|iron|railing')) return paint('metal-railing', 'name');
  if (named('trim|cornice|fascia')) return paint('metal-trim', 'name');
  return paint('metal-fallback', 'fallback');
}

/** One record per material slot. A multi-material mesh is not one class. */
export function keyMeshMaterials(mesh, map = MATERIAL_CLASS_MAP) {
  const list = Array.isArray(mesh?.material) ? mesh.material : [mesh?.material];
  return list.map((material, materialIndex) => ({ materialIndex, ...keyMaterial(material, map) }));
}

const VALUE_MIN = 0.5;
const VALUE_MAX = 2;
const SAT_MIN = 0;
const SAT_MAX = 2;
const PLAIN_NUMBER = /^\d+(?:\.\d+)?$/;

/** `?albedoGain=<name>:<v>,<s>;...` Names are the map's `classes` plus `groups`.
 *  v is [0.5, 2], s is [0, 2]. Any bad entry ignores the whole switch. Absent is null. */
export function parseAlbedoGain(search) {
  const raw = new URLSearchParams(search || '').get('albedoGain');
  if (raw == null || raw.trim() === '') return null;
  const gain = {};
  for (const entry of raw.split(';')) {
    const trimmed = entry.trim();
    if (!trimmed) return null;
    const colon = trimmed.indexOf(':');
    if (colon <= 0) return null;
    const className = trimmed.slice(0, colon).trim();
    const parts = trimmed.slice(colon + 1).split(',');
    if (parts.length !== 2) return null;
    const valueText = parts[0].trim();
    const satText = parts[1].trim();
    if (!PLAIN_NUMBER.test(valueText) || !PLAIN_NUMBER.test(satText)) return null;
    if ((!ALBEDO_GAIN_CLASSES.has(className) && !ALBEDO_GAIN_GROUPS.has(className)) || Object.hasOwn(gain, className)) return null;
    const v = Number(valueText);
    const s = Number(satText);
    if (v < VALUE_MIN || v > VALUE_MAX || s < SAT_MIN || s > SAT_MAX) return null;
    gain[className] = Object.freeze({ v, s });
  }
  return Object.freeze(gain);
}

// Rec.709 luminance. Saturation moves toward that grey; value scales after; both clamp to [0, 1].
const REC709 = [0.2126, 0.7152, 0.0722];

function glslFloat(n) {
  const text = String(n);
  return text.includes('.') || /[eE]/.test(text) ? text : `${text}.0`;
}

function albedoGainChunk(value, saturation) {
  return [
    '{',
    `vec3 p15AlbedoLuma = vec3(dot(diffuseColor.rgb, vec3(${REC709.join(', ')})));`,
    `diffuseColor.rgb = clamp(mix(p15AlbedoLuma, diffuseColor.rgb, ${glslFloat(saturation)}) * ${glslFloat(value)}, 0.0, 1.0);`,
    '}',
  ].join('\n');
}

function gainToken(value, saturation) {
  return `p15-albedo-gain:${glslFloat(value)},${glslFloat(saturation)}`;
}

function skipSpace(source, index) {
  let i = index;
  while (source[i] === ' ' || source[i] === '\t' || source[i] === '\n' || source[i] === '\r') i += 1;
  return i;
}

function assignmentOperator(source, index) {
  if (source.startsWith('*=', index) || source.startsWith('+=', index)
    || source.startsWith('-=', index) || source.startsWith('/=', index)) return true;
  return source[index] === '=' && source[index + 1] !== '=';
}

function isIdentChar(ch) {
  return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch === '_';
}

function keywordAt(source, index, word) {
  if (!source.startsWith(word, index)) return false;
  if (index > 0 && isIdentChar(source[index - 1])) return false;
  const after = source[index + word.length];
  return !after || !isIdentChar(after);
}

function skipGap(source, index) {
  let i = index;
  while (i < source.length) {
    const ch = source[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      const nl = source.indexOf('\n', i);
      i = nl < 0 ? source.length : nl + 1;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end < 0 ? source.length : end + 2;
      continue;
    }
    break;
  }
  return i;
}

function isDiffuseWrite(source, index) {
  if (!source.startsWith('diffuseColor', index)) return false;
  if (index > 0 && isIdentChar(source[index - 1])) return false;
  let i = skipSpace(source, index + 'diffuseColor'.length);
  if (source.startsWith('.rgb', i)) i = skipSpace(source, i + 4);
  else if (source[i] === '.') return false;
  return assignmentOperator(source, i);
}

// Where the grass chunk goes, counted from void main. A write inside a conditional
// belongs to that conditional's top-level statement, so the chunk lands after the
// statement closes (depth 1) and before the next top-level #include. A write before
// color_fragment does not count: that include still multiplies the diffuse. No later
// write keeps the chunk on the include. No include and no write returns null.
function grassGainInsertAt(source) {
  const mainAt = source.search(/void\s+main\s*\(/);
  if (mainAt < 0) return null;
  const open = source.indexOf('{', mainAt);
  if (open < 0) return null;
  const marker = '#include <color_fragment>';
  const colorAt = source.indexOf(marker);
  const afterColor = colorAt < 0 ? -1 : colorAt + marker.length;
  let i = open + 1;
  let depth = 1;
  let stmtWrites = false;
  let lastEnd = null;
  while (i < source.length && depth > 0) {
    if (source[i] === '/' && source[i + 1] === '/') {
      const nl = source.indexOf('\n', i);
      i = nl < 0 ? source.length : nl + 1;
      continue;
    }
    if (source[i] === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end < 0 ? source.length : end + 2;
      continue;
    }
    if (depth === 1 && source[i] === '#') {
      const nl = source.indexOf('\n', i);
      i = nl < 0 ? source.length : nl + 1;
      continue;
    }
    if (source[i] === '{') {
      depth += 1;
      i += 1;
      continue;
    }
    if (source[i] === '}') {
      depth -= 1;
      i += 1;
      if (depth === 1 && !keywordAt(source, skipGap(source, i), 'else')) {
        if (stmtWrites && (afterColor < 0 || i > afterColor)) lastEnd = i;
        stmtWrites = false;
      }
      continue;
    }
    if (source[i] === ';' && depth === 1) {
      i += 1;
      if (stmtWrites && (afterColor < 0 || i > afterColor)) lastEnd = i;
      stmtWrites = false;
      continue;
    }
    if (isDiffuseWrite(source, i)) stmtWrites = true;
    i += 1;
  }
  if (afterColor >= 0 && (lastEnd == null || lastEnd <= afterColor)) return afterColor;
  return lastEnd;
}

function injectGrassGain(source, chunk) {
  if (!source) return null;
  const at = grassGainInsertAt(source);
  if (at == null) return null;
  const marker = '#include <color_fragment>';
  const colorAt = source.indexOf(marker);
  if (colorAt >= 0 && at === colorAt + marker.length) return source.replace(marker, `${marker}\n${chunk}`);
  return `${source.slice(0, at)}\n${chunk}${source.slice(at)}`;
}

function currentSearch() {
  if (typeof location !== 'undefined' && location && typeof location.search === 'string') return location.search;
  return '';
}

// Identity only. Material.clone JSON-copies userData and drops onBeforeCompile, so a
// userData flag on the source would make the clone look finished and skip the hook.
const hookedMaterials = new WeakSet();
let albedoGainLogged = false;

// Once, and only when the switch parsed. The page reads the line at load; the
// report is how a live frame counts hooked materials per class.
function noteAlbedoGain(gain) {
  if (!albedoGainLogged) {
    albedoGainLogged = true;
    console.log('albedoGain', JSON.stringify(gain));
  }
  const page = globalThis.window;
  if (!page) return;
  const host = page.__districtDeck || (page.__districtDeck = {});
  host.albedoGainReport = albedoGainReport;
}

const gainByMaterial = new WeakMap();
// Strong only until dispose. A swap must not leave the old material in the report.
const gainedMaterials = new Set();

function rememberGain(material, record) {
  hookedMaterials.add(material);
  gainByMaterial.set(material, record);
  gainedMaterials.add(material);
  const forget = () => {
    gainedMaterials.delete(material);
    material.removeEventListener('dispose', forget);
  };
  material.addEventListener('dispose', forget);
}

/** Hook listed classes once. An absent or rejected switch returns before the graph is walked. */
export function applyAlbedoGain(root, search = currentSearch()) {
  const gain = parseAlbedoGain(search);
  if (gain) noteAlbedoGain(gain);
  if (!gain || !root || typeof root.traverse !== 'function') return null;
  root.traverse((object) => {
    if (!object?.isMesh) return;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      if (!material?.isMaterial || hookedMaterials.has(material)) continue;
      // A grass tag wins before the class lookup, so out-of-scope foliage stays foliage.
      const grass = material.userData?.albedoGroup === 'grass';
      const keyed = grass ? null : keyMaterial(material);
      const gainName = grass ? 'grass' : keyed.class;
      const spec = gainName ? gain[gainName] : null;
      if (!spec) continue;
      const previousCompile = material.onBeforeCompile;
      const previousKey = material.customProgramCacheKey;
      // Three's default key stringifies the current onBeforeCompile. Read it before this
      // hook replaces that function. Any other key is called when the program key is read.
      const inheritedKey = Object.getPrototypeOf(material).customProgramCacheKey;
      const inheritedUpstream = previousKey === inheritedKey && typeof previousKey === 'function'
        ? String(previousKey.call(material) ?? '')
        : null;
      const chunk = albedoGainChunk(spec.v, spec.s);
      const token = gainToken(spec.v, spec.s);
      material.onBeforeCompile = function p15AlbedoGainCompile(shader, renderer) {
        if (typeof previousCompile === 'function') previousCompile.call(this, shader, renderer);
        // color_fragment multiplies instance and vertex colour into diffuseColor.
        // The carriageway's painted tile assigns diffuseColor before this include,
        // so a chunk placed after map_fragment is replaced. Follow the include.
        const source = shader?.fragmentShader;
        if (!source) return;
        // Classes stay on the include. Grass follows a later diffuse write when
        // the shader has one, so the gain is the final albedo.
        const patched = grass
          ? injectGrassGain(source, chunk)
          : (source.includes('#include <color_fragment>')
            ? source.replace('#include <color_fragment>', `#include <color_fragment>\n${chunk}`)
            : null);
        if (!patched) return;
        shader.fragmentShader = patched;
      };
      material.customProgramCacheKey = function p15AlbedoGainCacheKey() {
        const upstream = inheritedUpstream !== null
          ? inheritedUpstream
          : (typeof previousKey === 'function' ? String(previousKey.call(this) ?? '') : '');
        return `${upstream}|${token}`;
      };
      material.needsUpdate = true;
      rememberGain(material, Object.freeze({ className: gainName, v: spec.v, s: spec.s }));
    }
  });
  return gain;
}

function srgbToLinear(encoded) {
  return encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
}

function packTexels(data, width, height) {
  const count = width * height;
  if (!data || typeof data.length !== 'number' || !Number.isInteger(count) || count <= 0) {
    return { reason: 'unreadable image data' };
  }
  const components = data.length / count;
  if (components !== 3 && components !== 4) return { reason: 'unreadable image data' };
  return { data, count, components };
}

function isDrawableImage(image) {
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) return true;
  if (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement) return true;
  return typeof image.getContext === 'function';
}

// OffscreenCanvas in a worker or a browser, else a 2D canvas. Neither exists under plain node.
function canvas2d(width, height) {
  if (typeof OffscreenCanvas === 'function') {
    const context = new OffscreenCanvas(width, height).getContext('2d');
    return context ? { context } : { reason: 'no 2d context' };
  }
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    return context ? { context } : { reason: 'no 2d context' };
  }
  return { reason: 'no canvas' };
}

function readDrawable(image) {
  const width = image.width | 0;
  const height = image.height | 0;
  if (width <= 0 || height <= 0) return { reason: 'empty image' };
  if (typeof image.getContext === 'function') {
    try {
      const pixels = image.getContext('2d')?.getImageData(0, 0, width, height);
      if (!pixels?.data) return { reason: 'no 2d context' };
      return packTexels(pixels.data, pixels.width, pixels.height);
    } catch {
      return { reason: 'unreadable image' };
    }
  }
  const canvas = canvas2d(width, height);
  if (!canvas.context) return { reason: canvas.reason };
  try {
    canvas.context.drawImage(image, 0, 0, width, height);
    const pixels = canvas.context.getImageData(0, 0, width, height);
    if (!pixels?.data) return { reason: 'unreadable image' };
    return packTexels(pixels.data, pixels.width, pixels.height);
  } catch {
    return { reason: 'unreadable image' };
  }
}

function readTexels(texture) {
  const image = texture?.image ?? texture?.source?.data;
  if (!image) return { reason: 'no image' };
  if (image.data && image.width && image.height) return packTexels(image.data, image.width, image.height);
  if (isDrawableImage(image)) return readDrawable(image);
  return { reason: 'unreadable image data' };
}

function gainedPeak(rgb, value, saturation) {
  const y = rgb[0] * REC709[0] + rgb[1] * REC709[1] + rgb[2] * REC709[2];
  let peak = 0;
  for (const channel of rgb) {
    const sample = Math.min(1, Math.max(0, (y + (channel - y) * saturation) * value));
    if (sample > peak) peak = sample;
  }
  return peak;
}

// Nearest rank: the smallest sample at or above 99% of the texels.
function percentile99(samples) {
  const sorted = Array.from(samples).sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.99) - 1));
  return sorted[index];
}

function mapPercentile(material, spec) {
  const image = readTexels(material.map);
  if (!image?.data) return { p99: null, reason: image?.reason ?? 'unreadable image data' };
  const bytes = image.data instanceof Uint8Array || image.data instanceof Uint8ClampedArray;
  const srgb = material.map.colorSpace === 'srgb';
  const tint = material.color ? [material.color.r, material.color.g, material.color.b] : [1, 1, 1];
  const peaks = new Float64Array(image.count);
  for (let i = 0; i < image.count; i += 1) {
    const offset = i * image.components;
    let rgb = [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
    if (bytes) rgb = rgb.map(channel => channel / 255);
    if (srgb) rgb = rgb.map(srgbToLinear);
    peaks[i] = gainedPeak(rgb.map((channel, index) => channel * tint[index]), spec.v, spec.s);
  }
  return { p99: percentile99(peaks), reason: null };
}

/** Per class, the materials hooked, and each map's 99th-percentile texel value after gain.
 *  Value is the max linear channel. Unreadable image data is p99 null plus a reason. */
export function albedoGainReport() {
  const byClass = {};
  for (const material of gainedMaterials) {
    const spec = gainByMaterial.get(material);
    if (!spec?.className) continue;
    const row = byClass[spec.className] ??= { materials: [], maps: [] };
    if (row.materials.includes(material)) continue;
    row.materials.push(material);
    if (material.map) {
      const measured = mapPercentile(material, spec);
      row.maps.push({ material, p99: measured.p99, reason: measured.reason });
    }
  }
  return byClass;
}
