// District Deck V3.03 Batch 5 — one composable instanced decal system.
// Selection, ownership, intel, works and event forecasts are independent entries in the
// plan. Rendering one never deletes another, and the supplied core state is read-only.

import * as THREE from 'three';
import { rivalColours } from './rival-hue.js';
import { TILE } from '../core/grid.js';
import { createCityFringeMaterial } from './materials.js';

/** Halo thickness, metres. */
export const SITE_HALO_BAND = 0.46;
/** How far the outer halo steps onto the footpath past the lot line. */
export const SITE_HALO_OVERLAP = 0.42;
/** Inner plinth rim, still a hair over the kerb. */
export const SITE_RIM_OVERLAP = 0.14;
/** Sit just above the 0.16 m footpath slab. */
const HALO_Y = 0.185;
const HALO_THICK = 0.05;

export function siteFootprintMetres(parcel) {
  const fp = parcel?.groundFootprint;
  const fx = Array.isArray(fp) ? (fp[0] || 1) : 1;
  const fz = Array.isArray(fp) ? (fp[1] || 1) : 1;
  return { w: fx * TILE, d: fz * TILE };
}

function haloOverlapFor(item) {
  if (item.state === 'owned' || item.state === 'owned-rival' || item.state === 'auction') {
    return (item.order === 0 || item.scale > 1.08) ? SITE_HALO_OVERLAP : SITE_RIM_OVERLAP;
  }
  return Math.max(0.10, SITE_RIM_OVERLAP * Math.min(1, item.scale ?? 1));
}

/**
 * Four ground-plane bars that trace the parcel rectangle, overlapping the
 * pavement by `haloOverlapFor`. Lengths are world metres; the shared mesh is
 * a unit box scaled to each bar.
 */
export function siteHaloEdges(parcel, item = {}) {
  const { w, d } = siteFootprintMetres(parcel);
  const overlap = haloOverlapFor(item);
  const band = SITE_HALO_BAND;
  const outerW = w + overlap * 2;
  const outerD = d + overlap * 2;
  const cx = parcel.centre.x;
  const cz = parcel.centre.z;
  const y = HALO_Y;
  const midZ = (outerD - band) / 2;
  const midX = (outerW - band) / 2;
  const spanZ = Math.max(band, outerD - 2 * band);
  return Object.freeze([
    Object.freeze({ x: cx, y, z: cz + midZ, sx: outerW, sy: HALO_THICK, sz: band }),
    Object.freeze({ x: cx, y, z: cz - midZ, sx: outerW, sy: HALO_THICK, sz: band }),
    Object.freeze({ x: cx + midX, y, z: cz, sx: band, sy: HALO_THICK, sz: spanZ }),
    Object.freeze({ x: cx - midX, y, z: cz, sx: band, sy: HALO_THICK, sz: spanZ }),
  ]);
}

export const BOARD_LENSES = Object.freeze(['ownership', 'corridor', 'amenity', 'risk']);
export const BOARD_LENS_EVENT = 'district-deck:lens-change';

export const OVERLAY_RENDER_BUDGET = Object.freeze({
  drawCalls: 4,
  triangles: 12_000,
});

// Monopoly Plus board markers: player gold and rival plum must never confuse,
// and auction reads as premium "sale today" brass — not candy neon bloom.
// Amenity / corridor stay demoted so architecture remains primary under those lenses.
export const COLOURS = Object.freeze({
  // Player: bright Monopoly-house gold. Rival: plum — no amber bias.
  owned: '#f5c230',
  get 'owned-rival'() { return rivalColours().mark; },
  corridor: '#c4a66a',
  surveyed: '#e8e4d8',
  'insured-fire': '#c07068',
  'insured-flood': '#5a8aaa',
  'insured-both': '#8a6a7a',
  squatted: '#7a5a8a',
  renovation: '#e0a84a',
  construction: '#d49840',
  // Auction: deeper brass-gavel gold — reads "sale today", never confusable with player house gold.
  auction: '#c99410',
  flood: '#5a92b0',
  fire: '#c87868',
  arrears: '#b87868',
  macro: '#8a78b0',
  'amenity-positive': '#5a7a62',
  'amenity-negative': '#8a6a5c',
  'risk-uncertain': '#b8985a',
  'risk-flood': '#5a92b0',
});

function geometryTriangles(geometry) {
  return geometry.index
    ? geometry.index.count / 3
    : geometry.attributes.position.count / 3;
}

function eventIsVisible(event) {
  return event
    && event.status !== 'resolved'
    && event.status !== 'cancelled'
    && event.forecast?.decal;
}

function entry(parcelId, state, channel, colour, order, scale = 1) {
  return Object.freeze({ parcelId, state, channel, colour, order, scale });
}

/**
 * Pure plan used by both the runtime and acceptance tests. It deliberately exposes the
 * semantic state name so visual coverage can be audited without sampling pixels.
 */
export function parcelDecalPlan(city, state, lens = null, viewerSeatId = 'P1') {
  const composite = lens === null;
  if (!composite && !BOARD_LENSES.includes(lens)) throw new RangeError(`Unknown board lens: ${lens}`);
  const plan = [];
  const owned = Object.keys(state.holdings ?? {}).sort();
  const ownedSet = new Set(owned);
  for (const parcelId of [...city.order].sort()) {
    const parcel = city.parcels[parcelId];
    const holding = state.holdings?.[parcelId] ?? null;
    const status = state.parcelStatus?.[parcelId] ?? {};
    const intel = state.intel?.parcels?.[parcelId] ?? null;
    if ((composite || lens === 'ownership') && holding) {
      // Player gold plinth ring vs rival plum — proud enough for street-oblique.
      const yours = (holding.ownerSeatId ?? 'P1') === viewerSeatId
        || holding.owner === 'player';
      plan.push(entry(
        parcelId,
        yours ? 'owned' : 'owned-rival',
        'ground',
        yours ? COLOURS.owned : COLOURS['owned-rival'],
        1,
        yours ? 1.0 : 0.88,
      ));
      // Outer halo so owned lots read as board tokens at hero-wide.
      plan.push(entry(
        parcelId,
        yours ? 'owned' : 'owned-rival',
        'ground',
        yours ? COLOURS.owned : COLOURS['owned-rival'],
        0,
        yours ? 1.18 : 1.05,
      ));
    }
    if (
      (composite || lens === 'corridor')
      && !holding
      && (city.adjacency[parcelId] ?? []).some((id) => ownedSet.has(id))
    ) {
      plan.push(entry(parcelId, 'corridor', 'ground', COLOURS.corridor, 2, 0.62));
    }
    if (lens === 'amenity' && parcel.amenityValueBp !== 0) {
      const positive = parcel.amenityValueBp > 0;
      plan.push(entry(
        parcelId,
        positive ? 'amenity-positive' : 'amenity-negative',
        'ground',
        COLOURS[positive ? 'amenity-positive' : 'amenity-negative'],
        2,
        // Compact rings only under the amenity lens — never candy full-footprint washes.
        Math.min(0.88, 0.42 + Math.abs(parcel.amenityValueBp) / 5500),
      ));
    }
    if (composite && intel) {
      plan.push(entry(parcelId, 'surveyed', 'tick', COLOURS.surveyed, 3, 0.88));
    }
    if (lens === 'risk' && !intel) {
      plan.push(entry(parcelId, 'risk-uncertain', 'tick', COLOURS['risk-uncertain'], 3, 0.82));
    }
    if (lens === 'risk' && city.eventExposure?.[parcelId]?.lowLying) {
      plan.push(entry(parcelId, 'risk-flood', 'ground', COLOURS['risk-flood'], 4, 0.72));
    }
    if ((composite || lens === 'risk') && holding?.insurance?.fire && holding.insurance.flood) {
      plan.push(entry(parcelId, 'insured-both', 'pin', COLOURS['insured-both'], 4, 0.86));
    } else if ((composite || lens === 'risk') && holding?.insurance?.fire) {
      plan.push(entry(parcelId, 'insured-fire', 'pin', COLOURS['insured-fire'], 4, 0.82));
    } else if ((composite || lens === 'risk') && holding?.insurance?.flood) {
      plan.push(entry(parcelId, 'insured-flood', 'pin', COLOURS['insured-flood'], 4, 0.82));
    }
    if ((composite || lens === 'risk') && status.occupancy === 'squatted') {
      plan.push(entry(parcelId, 'squatted', 'tick', COLOURS.squatted, 5, 1));
    }
    if ((composite || lens === 'risk') && holding?.renovation) {
      plan.push(entry(parcelId, 'renovation', 'tick', COLOURS.renovation, 6, 1.08));
    }
    if ((composite || lens === 'risk') && holding?.construction) {
      plan.push(entry(parcelId, 'construction', 'tick', COLOURS.construction, 6, 1.18));
    }
  }

  for (const eventId of [...(state.events?.order ?? [])].sort()) {
    const event = state.events.byId[eventId];
    if (!eventIsVisible(event)) continue;
    for (const parcelId of [...event.anchorIds].sort()) {
      if (!city.parcels[parcelId]) continue;
      if (event.type === 'auction') {
        // Triple-channel "sale today": brass ring + pin + hotel tick. Proud, not candy-bloated.
        plan.push(entry(parcelId, 'auction', 'ground', COLOURS.auction, 10, 1.16));
        plan.push(entry(parcelId, 'auction', 'pin', COLOURS.auction, 11, 1.28));
        plan.push(entry(parcelId, 'auction', 'tick', COLOURS.auction, 10, 1.18));
      } else if ((composite || lens === 'risk') && event.type === 'flash-flood') {
        plan.push(entry(parcelId, 'flood', 'ground', COLOURS.flood, 10, 1.04));
      } else if ((composite || lens === 'risk') && event.type === 'fire') {
        plan.push(entry(parcelId, 'fire', 'pin', COLOURS.fire, 11, 1));
      } else if ((composite || lens === 'risk') && event.type === 'tenant-arrears') {
        plan.push(entry(parcelId, 'arrears', 'pin', COLOURS.arrears, 11, 0.82));
      } else if (composite || lens === 'risk') {
        // Downturn, interest and materials forecasts are board-wide macro surfaces.
        plan.push(entry(parcelId, 'macro', 'ground', COLOURS.macro, 9, 0.58));
      }
    }
  }
  return Object.freeze(plan.sort((left, right) =>
    left.order - right.order
    || left.parcelId.localeCompare(right.parcelId)
    || left.state.localeCompare(right.state)));
}

function instanced(geometry, material, capacity, name) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, capacity));
  mesh.name = name;
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.renderOrder = 6;
  return mesh;
}

export class EventOverlayLayer {
  constructor(city) {
    this.city = city;
    this.root = new THREE.Group();
    this.root.name = 'v303:event-overlays';
    this.plan = [];
    this.activeLens = 'ownership';
    this.lastState = null;
    this.reducedMotion = false;
    const capacity = Math.max(1, city.order.length * 12);

    // Rectangular site frame (Monopoly property border): four bars, one draw.
    // Instance scale stretches a unit box to each edge; colour is ownership/auction.
    const groundGeometry = new THREE.BoxGeometry(1, 1, 1);
    const groundMaterial = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.ground = instanced(
      groundGeometry,
      groundMaterial,
      capacity * 4,
      'v303:decals:ground',
    );
    // Owner colour reaches both diffuse lighting and emission through instanceColor.
    // Through the city material factory, so no raw constructor is added (style-raw-constructor-ratchet).
    const ownershipMaterial = createCityFringeMaterial('#ffffff', {
      roughness: 0.6, metalness: 0,
      emissive: '#ffffff', emissiveIntensity: 0.25,
      transparent: false, opacity: 1, depthWrite: true, depthTest: true,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }, 'ownership-decal');
    ownershipMaterial.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )\n totalEmissiveRadiance *= vColor.rgb;\n#endif');
    };
    ownershipMaterial.customProgramCacheKey = () => 'p10b-ownership-emissive-v1';
    this.ownership = instanced(new THREE.BoxGeometry(1, 1, 1), ownershipMaterial,
      capacity * 4, 'v303:decals:ownership');
    this.ownership.castShadow = false;
    // Sale / hazard pins — short cone that clears façade clutter without eave collision.
    this.pin = instanced(
      new THREE.ConeGeometry(0.40, 1.82, 8),
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.90,
        depthTest: true,
        depthWrite: false,
      }),
      capacity,
      'v303:decals:pins',
    );
    // Hotel-bar ticks: thicker slab so they survive street-oblique foreshortening.
    this.tick = instanced(
      new THREE.BoxGeometry(2.55, 0.28, 0.52),
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        depthTest: true,
      }),
      capacity,
      'v303:decals:ticks',
    );
    // The ownership outline joins the scene only while a lot is owned, so an unowned board (the opening) carries no
    // extra mesh, material or triangles (style-budget-ratchet).
    this.root.add(this.ground, this.tick, this.pin);
    this._onLensChange = (event) => {
      const lens = event.detail?.lens;
      if (!BOARD_LENSES.includes(lens) || lens === this.activeLens) return;
      this.activeLens = lens;
      if (this.lastState) this.syncState(this.lastState);
    };
    globalThis.window?.addEventListener(BOARD_LENS_EVENT, this._onLensChange);
  }

  syncState(state, viewerSeatId = 'P1') {
    this.lastState = state;
    this.viewerSeatId = viewerSeatId;
    this.plan = parcelDecalPlan(this.city, state, this.activeLens, viewerSeatId);
    const isOwnedGround = ({ channel, state }) => channel === 'ground'
      && (state === 'owned' || state === 'owned-rival');
    const byChannel = {
      ground: this.plan.filter((item) => item.channel === 'ground' && !isOwnedGround(item)),
      ownership: this.plan.filter(isOwnedGround),
      pin: this.plan.filter(({ channel }) => channel === 'pin'),
      tick: this.plan.filter(({ channel }) => channel === 'tick'),
    };
    // Removed owner pins/ticks preceded auction markers. Keep their former index offset
    // so removing an ownership symbol does not rotate or lift an unrelated sale marker.
    const ownerMarkerOffset = byChannel.ownership.filter(({ state, order }) => state === 'owned' && order === 0).length;
    const colour = new THREE.Color();
    for (const [channel, mesh] of [
      ['ground', this.ground],
      ['ownership', this.ownership],
      ['pin', this.pin],
      ['tick', this.tick],
    ]) {
      const items = byChannel[channel];
      const identity = new THREE.Quaternion();
      let writeAt = 0;
      items.forEach((item, index) => {
        const parcel = this.city.parcels[item.parcelId];
        const markerIndex = index + (channel === 'pin' || channel === 'tick' ? ownerMarkerOffset : 0);
        const hashAngle = ((markerIndex * 7) % 16) * Math.PI / 8;
        const colourAt = colour.set(item.colour);
        if (channel === 'ground' || channel === 'ownership') {
          for (const edge of siteHaloEdges(parcel, item)) {
            mesh.setMatrixAt(writeAt, new THREE.Matrix4().compose(
              new THREE.Vector3(edge.x, edge.y, edge.z),
              identity,
              new THREE.Vector3(edge.sx, edge.sy, edge.sz),
            ));
            mesh.setColorAt(writeAt, colourAt);
            writeAt += 1;
          }
          return;
        }
        const position = new THREE.Vector3(parcel.centre.x, 0.50, parcel.centre.z);
        const rotation = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          hashAngle,
        );
        let scale;
        if (channel === 'pin') {
          // Auction pin sits proud of the crowd; hazard pins stay below eave line.
          const auctionPin = item.state === 'auction';
          position.y = (auctionPin ? 2.55 : 2.05) + (markerIndex % 3) * 0.14;
          rotation.multiply(new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 0, 1),
            Math.PI,
          ));
          const pinScale = Math.min(auctionPin ? 0.92 : 0.78, item.scale * (auctionPin ? 0.70 : 0.58));
          scale = new THREE.Vector3(pinScale, pinScale * (auctionPin ? 1.12 : 1), pinScale);
        } else {
          // Corner hotel bar — offset past façade so street-oblique still catches it.
          const offset = 3.15 + (item.order % 3) * 0.48;
          position.x += Math.cos(hashAngle) * offset;
          position.z += Math.sin(hashAngle) * offset;
          position.y = item.state === 'auction' ? 0.62 : 0.52;
          const tickHeight = item.state === 'auction' ? 1.35 : 1;
          scale = new THREE.Vector3(item.scale, tickHeight, item.scale);
        }
        mesh.setMatrixAt(writeAt, new THREE.Matrix4().compose(position, rotation, scale));
        mesh.setColorAt(writeAt, colourAt);
        writeAt += 1;
      });
      mesh.count = writeAt;
      if (mesh === this.ownership) {
        if (writeAt > 0 && mesh.parent !== this.root) this.root.add(mesh);
        else if (writeAt === 0 && mesh.parent === this.root) this.root.remove(mesh);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  update(elapsed) {
    // Non-ownership ground markers retain their gentle breath; owner outlines stay opaque.
    // Reduced motion holds the steady premium read. No per-parcel timers enter core state.
    this.ground.material.opacity = this.reducedMotion
      ? 0.78
      : 0.74 + Math.sin(elapsed * 1.25) * 0.05;
    // Sale pin breathes slightly faster so "auction today" catches the eye without bloom.
    this.pin.material.opacity = this.reducedMotion
      ? 0.90
      : 0.84 + Math.sin(elapsed * 2.1) * 0.08;
  }

  setReducedMotion(on) {
    this.reducedMotion = Boolean(on);
    if (this.reducedMotion) {
      this.ground.material.opacity = 0.78;
      this.pin.material.opacity = 0.90;
    }
  }

  stats() {
    const meshes = [this.ground, this.ownership, this.pin, this.tick];
    return {
      drawCalls: meshes.filter(({ count }) => count > 0).length,
      triangles: Math.round(meshes.reduce(
        (sum, mesh) => sum + geometryTriangles(mesh.geometry) * mesh.count,
        0,
      )),
      instances: this.plan.length,
      states: [...new Set(this.plan.map(({ state }) => state))].sort(),
    };
  }

  dispose() {
    globalThis.window?.removeEventListener(BOARD_LENS_EVENT, this._onLensChange);
    for (const mesh of [this.ground, this.ownership, this.pin, this.tick]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}

export function assertOverlayRenderBudget(stats) {
  if (stats.drawCalls > OVERLAY_RENDER_BUDGET.drawCalls) {
    throw new Error(`overlay draw budget exceeded: ${stats.drawCalls}`);
  }
  if (stats.triangles > OVERLAY_RENDER_BUDGET.triangles) {
    throw new Error(`overlay triangle budget exceeded: ${stats.triangles}`);
  }
  return stats;
}
