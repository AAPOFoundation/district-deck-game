// W20: resolve actual moving boot meshes, rather than static berth holders.
import * as THREE from 'three';

export const W22_HULL_LIMIT = 48;
export function nearestHullContacts(rows, camera, limit = W22_HULL_LIMIT) {
  const distance = h => (h.x - camera.x) ** 2 + (h.z - camera.z) ** 2;
  return rows.slice().sort((a, b) => distance(a) - distance(b)).slice(0, Math.min(W22_HULL_LIMIT, Math.max(0, limit)));
}

export class HullSitRegistry {
  constructor(port) {
    this.port = port;
    this.meshes = [];
    this.previous = new Map();
    this.live = [];
    this.point = new THREE.Vector3();
    port.traverse(mesh => {
      if (mesh.isMesh && /(?:^|:)hull:boot$/.test(mesh.name)) {
        this.meshes.push(mesh);
        this.previous.set(mesh, { x: 0, z: 0, time: NaN, speed: 0, heading: 0, halfLen: 0, halfBeam: 0 });
      }
    });
  }
  sample(time) {
    const hulls = this.live;
    hulls.length = 0;
    for (const mesh of this.meshes) {
      let visible = true, attached = false;
      for (let p = mesh; p; p = p.parent) { visible &&= p.visible; attached ||= p === this.port; }
      if (!visible || !attached) continue;
      mesh.updateWorldMatrix(true, false);
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const b = mesh.geometry.boundingBox, e = mesh.matrixWorld.elements;
      this.point.set((b.min.x + b.max.x) * .5, 0, (b.min.z + b.max.z) * .5).applyMatrix4(mesh.matrixWorld);
      const previous = this.previous.get(mesh);
      const dt = previous ? time - previous.time : 0;
      const speed = dt > 0 && dt < 1 ? Math.min(8, Math.hypot(this.point.x - previous.x, this.point.z - previous.z) / dt) : 0;
      const row = previous;
      row.x = this.point.x; row.z = this.point.z; row.time = time; row.speed = speed;
      row.heading = Math.atan2(e[2], e[0]);
      row.halfLen = (b.max.x - b.min.x) * .5 * Math.hypot(e[0], e[1], e[2]);
      row.halfBeam = (b.max.z - b.min.z) * .5 * Math.hypot(e[8], e[9], e[10]);
      hulls.push(row);
    }
    return hulls;
  }
}

// A compact late-composite field. Existing W19 lace gating is untouched.
// Shadow is sun-offset 0.7 m with a 2.5 m soft falloff. Foam ends at 2.7 m.
export const W20_HULL_GAIN = { value: 1 };
export const W20_SHORE_GAIN = { value: 1 };

export const HULL_SIT_GLSL = /* glsl */ `
  uniform float uW20Hull;
  vec3 ddW20HullSit(vec2 xz, vec2 sun) {
    vec3 field = vec3(0.0);
    vec2 boundDelta = xz - uHullContactBound.xy;
    float reach = uHullContactBound.z + 5.0;
    if (dot(boundDelta,boundDelta) > reach*reach || uW20Hull < 0.001) return field;
    for (int i = 0; i < DD_HULL_CONTACT_N; i++) {
      if (float(i) >= uHullContactCount) break;
      vec4 H = uHullContactHull[i];
      vec4 S = uHullContactSpan[i];
      vec2 d = xz - H.xy;
      vec2 p = vec2(dot(d, H.zw), dot(d, vec2(-H.w, H.z)));
      if (abs(p.x) > S.x + 5.0 || abs(p.y) > S.y + 4.0) continue;
      // Rounded transom and narrowing bow, measured in metres, not UVs.
      float end = smoothstep(0.25, 1.0, abs(p.x) / S.x);
      float beam = S.y * (1.0 - 0.86 * end);
      float gap = max(abs(p.y) - beam, abs(p.x) - S.x);
      vec2 sd = d + sun * 0.7;
      vec2 sp = vec2(dot(sd,H.zw), dot(sd,vec2(-H.w,H.z)));
      float se = smoothstep(0.25,1.0,abs(sp.x)/S.x);
      float sg = max(abs(sp.y)-S.y*(1.0-0.86*se),abs(sp.x)-S.x);
      // Soft footprint extends 0.9 m leeward in the prevailing world wind.
      vec2 lee = d - vec2(0.72, 0.54);
      vec2 ep = vec2(dot(lee,H.zw),dot(lee,vec2(-H.w,H.z)));
      float ellipse = length(ep / (S.xy + vec2(1.0, 1.8)));
      field.x = max(field.x, max(1.0-smoothstep(0.0,2.5,sg),
        1.0-smoothstep(0.78,1.28,ellipse)));
      float skirt = smoothstep(-0.12,0.18,gap)*(1.0-smoothstep(0.25,2.7,gap));
      field.y = max(field.y, skirt * mix(0.30,0.85,end));
      float ahead = p.x-S.x;
      float bowGap = abs(ahead - (1.1 - abs(p.y)*0.7));
      float bow = (1.0-smoothstep(0.16,0.65,bowGap))
        * (1.0-smoothstep(0.6,3.0,abs(p.y)))
        * smoothstep(-1.5,-0.6,ahead) * (1.0-smoothstep(1.2,1.8,ahead));
      field.z = max(field.z,bow*S.w);
    }
    return field * uW20Hull;
  }
`;
