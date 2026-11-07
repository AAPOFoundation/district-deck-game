// District Deck V3.10 — W2-NATURE sky dome (grounding round).
//
// Always-visible gradient dome: darker horizon band into the table edge, soft multi-band
// clouds, sun disc, driven by solarProfile / timeOfDay from lighting.js. Coexists with
// LightingRig's PMREM (this mesh is the camera sky; the bake remains the reflection
// authority). Presentation only — no sim state, no network, no Math.random.

import * as THREE from 'three';
import { solarProfile, sunDirection } from './lighting.js';
import { TASTE_RAIN } from './taste-tokens.js';

const SKY_VERT = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldDir = normalize(world.xyz - cameraPosition);
    // Force the dome to the far plane so depth never fights board geometry.
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    clip.z = clip.w;
    gl_Position = clip;
  }
`;

const SKY_FRAG = /* glsl */ `
  precision highp float;

  varying vec3 vWorldDir;

  uniform vec3 uSkyColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uGroundColor;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uSunAngular;
  uniform float uWarmth;
  uniform float uTime;
  uniform float uCloudAmount;
  uniform bool uAnimateClouds;
  uniform float uOvercast;
  uniform vec3 uRainZenith;
  uniform vec3 uRainHorizon;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.07;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vWorldDir);
    float up = dir.y;

    // Hero R10: readable blue zenith + warm horizon, then a hard fall into the dark table.
    // Prior milky/grey void came from thick haze + weak cloud structure at ToD 0.42.
    float horizon = 1.0 - smoothstep(-0.02, 0.32, up);
    float horizonSoft = 1.0 - smoothstep(-0.04, 0.52, up);
    // Everything below ~eye height collapses to the studio table colour.
    float ground = 1.0 - smoothstep(-0.18, 0.02, up);
    float tableFall = 1.0 - smoothstep(-0.55, -0.05, up);

    // Slight zenith saturation lift so AgX does not grey the dome into studio void.
    vec3 col = uSkyColor * vec3(0.96, 1.02, 1.08);
    // Primary warm horizon wash — restrained so zenith stays sky, not amber milk.
    col = mix(col, uHorizonColor, pow(horizon, 1.25) * 0.78);
    // Thin atmospheric band only; no near-white secondary haze.
    vec3 hazeCol = mix(uHorizonColor, uSkyColor * 1.22, 0.42);
    col = mix(col, hazeCol, pow(horizonSoft, 1.85) * 0.26);
    // Below-horizon band: hazy distant land, not a studio table.
    vec3 tableCol = mix(uHorizonColor, uGroundColor, 0.40);
    col = mix(col, tableCol, ground);
    col = mix(col, tableCol * 0.85, tableFall * 0.85);

    // Circumsolar glow + hard disc sized from solarProfile.sunAngularSize.
    vec3 sunD = normalize(uSunDir);
    float align = max(0.0, dot(dir, sunD));
    float glow = pow(align, 14.0) * (2.2 + uWarmth * 3.0);
    float glowWide = pow(align, 4.8) * (0.36 + uWarmth * 0.48);
    float disc = smoothstep(cos(uSunAngular * 3.6), cos(uSunAngular * 0.42), align);
    // Suppress sun contribution under the horizon so the table stays dark.
    float skyGate = smoothstep(-0.04, 0.08, up);
    col += uSunColor * (glow + glowWide) * skyGate * (1.0 - uOvercast);
    col += uSunColor * disc * (10.0 + uWarmth * 6.0) * skyGate * (1.0 - uOvercast);

    // Structured multi-band clouds — denser rows + mid wisps + upper puffs (not soft haze).
    // Frozen under reduced motion.
    if (uCloudAmount > 0.001 && up > -0.02) {
      float t = uAnimateClouds ? uTime * 0.010 : 0.0;
      float az = atan(dir.z, dir.x);

      // Band layer: stretched along azimuth, compressed in elevation → soft cloud rows.
      vec2 bandUv = vec2(az * 1.25 + t * 0.55, up * 4.6 + t * 0.12);
      float bands = fbm(bandUv * vec2(1.05, 1.85));
      bands = smoothstep(0.30, 0.66, bands);

      // Secondary wispy layer at a different phase / scale.
      vec2 wispUv = vec2(az * 0.78 - t * 0.35, up * 2.9 + 1.3);
      float wisps = fbm(wispUv * 2.05 + 3.1);
      wisps = smoothstep(0.38, 0.74, wisps);

      // Projected dome clouds for upper sky fill (less banded).
      vec2 cuv = normalize(dir.xz + 1e-4) * (1.05 / max(0.14, up + 0.2));
      cuv += vec2(t * 0.8, t * 0.3);
      float puffs = fbm(cuv * 1.45);
      puffs = smoothstep(0.40, 0.74, puffs);
      // Third structural layer: broken cumulus clumps.
      float clumps = fbm(cuv * 2.4 + vec2(2.7, -1.4));
      clumps = smoothstep(0.48, 0.78, clumps);

      float elevGate = smoothstep(0.02, 0.14, up) * (1.0 - smoothstep(0.55, 0.92, up));
      float lowGate = smoothstep(0.02, 0.10, up) * (1.0 - smoothstep(0.28, 0.55, up));
      float midGate = smoothstep(0.08, 0.22, up) * (1.0 - smoothstep(0.45, 0.75, up));
      float highGate = smoothstep(0.18, 0.35, up) * (1.0 - smoothstep(0.62, 0.92, up));

      float clouds = 0.0;
      clouds += bands * lowGate * 1.05;
      clouds += wisps * midGate * 0.72;
      clouds += puffs * elevGate * 0.58;
      clouds += clumps * highGate * 0.42;
      clouds *= uCloudAmount;
      clouds = clamp(clouds, 0.0, 1.0);

      vec3 cloudCol = mix(
        mix(uHorizonColor, vec3(0.96, 0.94, 0.90), 0.45),
        vec3(0.99, 0.98, 0.96),
        0.34 + uWarmth * 0.24
      );
      // Warm under-light on cloud bottoms near the sun (readable even at low warmth).
      float sunSide = pow(max(0.0, align), 3.5);
      float warmFloor = max(uWarmth, 0.18);
      cloudCol = mix(cloudCol, uSunColor * 0.9 + cloudCol * 0.35, sunSide * 0.42 * warmFloor);

      col = mix(col, cloudCol, clouds * 0.84 * skyGate);
    }

    // Rain sky (TASTE_RAIN): the whole dome above the table band takes the grey gradient, so no
    // blue zenith, no peach horizon and no cloud rows survive. Below the horizon the table stays.
    if (uOvercast > 0.0) {
      vec3 rainSky = mix(uRainHorizon, uRainZenith, smoothstep(0.02, 0.75, up));
      col = mix(col, rainSky, uOvercast * (1.0 - ground));
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * Visible sky dome. Call setTimeOfDay / setProfile whenever the lighting rig does.
 */
export class SkyDome {
  /**
   * @param {THREE.Scene} scene
   * @param {{x:number,z:number}} extent
   * @param {{
   *   quality?: string,
   *   reducedMotion?: boolean,
   *   timeOfDay?: number,
   *   radius?: number,
   * }} [options]
   */
  constructor(scene, extent, {
    quality = 'high',
    reducedMotion = false,
    timeOfDay = 0.865,
    radius = null,
  } = {}) {
    this.scene = scene;
    this.extent = extent;
    this.quality = quality;
    this.reducedMotion = reducedMotion;
    this.timeOfDay = timeOfDay;
    this._elapsed = 0;
    this._sunDir = new THREE.Vector3();

    const board = Math.max(extent.x, extent.z);
    // Large enough that every orbit / frame-all pose still sees dome, never clear-colour void.
    this.radius = radius ?? board * 4.0;

    const segs = quality === 'low' ? 20 : 40;
    this.geometry = new THREE.SphereGeometry(this.radius, segs, segs / 2);
    // Invert so we see the inner surface; keep camera at board centre of mass.
    this.geometry.scale(-1, 1, 1);

    this.uniforms = {
      uSkyColor: { value: new THREE.Color() },
      uHorizonColor: { value: new THREE.Color() },
      uGroundColor: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0.4, 0.7, 0.3) },
      uSunAngular: { value: 0.012 },
      uWarmth: { value: 0.3 },
      uTime: { value: 0 },
      // Hero R10: structured cloud amount so ToD 0.42 plate is not a flat grey void.
      uCloudAmount: { value: quality === 'low' ? 0.38 : quality === 'medium' ? 0.62 : 0.82 },
      uAnimateClouds: { value: !reducedMotion },
      // W4-C: rain sky. 0 = the dry dome, 1 = TASTE_RAIN's grey gradient with no sun disc or glow.
      uOvercast: { value: 0 },
      uRainZenith: { value: new THREE.Color(TASTE_RAIN.skyZenith) },
      uRainHorizon: { value: new THREE.Color(TASTE_RAIN.skyHorizon) },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: this.uniforms,
      side: THREE.FrontSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'nature:sky';
    this.mesh.frustumCulled = false;
    // Always behind every board/table surface.
    this.mesh.renderOrder = -100;
    // Anchor over the board centre so the far-plane trick stays centred.
    this.mesh.position.set(extent.x / 2, 0, extent.z / 2);
    this.mesh.matrixAutoUpdate = true;

    // Dome replaces flat background; fog still sinks the far table edge.
    this._previousBackground = scene.background;
    scene.background = null;
    scene.add(this.mesh);

    this.setTimeOfDay(timeOfDay);
  }

  setTimeOfDay(t) {
    this.timeOfDay = Math.min(1, Math.max(0, t));
    return this.setProfile(solarProfile(this.timeOfDay));
  }

  /**
   * @param {ReturnType<typeof solarProfile>} profile
   * @param {THREE.Vector3} [sunDir]
   */
  setProfile(profile, sunDir = null) {
    if (!profile) return profile;
    this.profile = profile;
    this.uniforms.uSkyColor.value.copy(profile.skyColor);
    this.uniforms.uHorizonColor.value.copy(profile.horizonColor);
    this.uniforms.uGroundColor.value.copy(profile.groundColor);
    this.uniforms.uSunColor.value.copy(profile.keyColor);
    this.uniforms.uSunAngular.value = profile.sunAngularSize;
    this.uniforms.uWarmth.value = profile.warmth;
    if (sunDir) {
      this.uniforms.uSunDir.value.copy(sunDir).normalize();
    } else {
      sunDirection(profile, this._sunDir);
      this.uniforms.uSunDir.value.copy(this._sunDir);
    }
    return profile;
  }

  /** 0 clear, 1 rain or heavy rain: the dome becomes the grey rain gradient and the sun disc goes. */
  setOvercast(amount) {
    const a = Math.min(1, Math.max(0, Number(amount) || 0));
    if (this.uniforms) this.uniforms.uOvercast.value = a;
    return a;
  }

  setReducedMotion(on) {
    this.reducedMotion = on;
    this.uniforms.uAnimateClouds.value = !on;
    if (on) this.uniforms.uTime.value = this._elapsed;
  }

  update(dt, elapsed) {
    this._elapsed = elapsed;
    if (this.reducedMotion) return;
    this.uniforms.uTime.value = elapsed;
  }

  dispose() {
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    if (this.scene && this._previousBackground !== undefined) {
      this.scene.background = this._previousBackground;
    }
    this.geometry?.dispose();
    this.material?.dispose();
    this.geometry = null;
    this.material = null;
    this.mesh = null;
    this.uniforms = null;
  }
}
