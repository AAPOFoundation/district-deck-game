// District Deck V3.33 — block-core layer.
// Owns the 16 × 16 m centre of every city block. The public reserve stays in board.js.

import * as THREE from 'three';
import {
  CORE_TYPES, createCorePalette, CoreContext, instanceModel, placementAt,
} from './kit.js';
import { CoreToys } from './toys.js';
import { buildPlayground } from './types/playground.js';
import { buildSewerage } from './types/sewerage.js';
import { buildPocketPark } from './types/pocket-park.js';
import { buildCommunityGarden } from './types/community-garden.js';
import { buildWorksYard } from './types/works-yard.js';
import { buildLanewayCourt } from './types/laneway-court.js';
// V3.70 L5 — six block centres that each carry a mechanic.
// V3.71 lane I — `car-park` is restored with a builder of its own; the migration alias
// that drew it as a mobility hub is retired. See types/car-park.js.
import { buildCarPark } from './types/car-park.js';
import { buildSubstation } from './types/substation.js';
import { buildStormwaterBasin } from './types/stormwater-basin.js';
import { buildBrigadeBay } from './types/brigade-bay.js';
import { buildMobilityHub } from './types/mobility-hub.js';
import { buildMarketHall } from './types/market-hall.js';
import { buildDistrictEnergy } from './types/district-energy.js';

const BUILDERS = Object.freeze({
  playground: buildPlayground,
  'sewerage-plant': buildSewerage,
  'pocket-park': buildPocketPark,
  'community-garden': buildCommunityGarden,
  'works-yard': buildWorksYard,
  'laneway-court': buildLanewayCourt,
  substation: buildSubstation,
  'stormwater-basin': buildStormwaterBasin,
  'brigade-bay': buildBrigadeBay,
  'mobility-hub': buildMobilityHub,
  'market-hall': buildMarketHall,
  'district-energy': buildDistrictEnergy,
  /**
   * V3.71 lane I — THE MIGRATION ALIAS IS RETIRED.
   *
   * Until this round this key read `'car-park': buildMobilityHub`, so the three blocks
   * seed 0 draws as car parks (`core-1-0`, `core-3-0`, `core-2-2`) rendered as mobility
   * hubs. The r1 critic's objection to that stands and is now closed the other way: the id
   * has its own AAA builder, so the live board shows a car park where the weight table
   * says car park. `CORE_USE_WEIGHTS` needs no edit for this — the roster retirement it
   * was written for is reversed.
   */
  'car-park': buildCarPark,
});

export class BlockCoreLayer {
  constructor(board) {
    this.board = board;
    this.root = new THREE.Group();
    this.root.name = 'block-cores';
    board.root.add(this.root);
    this.palette = createCorePalette(board.materials);
    this.toys = new CoreToys(board, this.palette);
    this.stats = { cores: 0, variants: 0, toys: 0, suppressed: 0 };
    this._build();
  }

  _build() {
    // V3.71 lane A. `city.coreSuppressedBlocks` names the blocks where an oversized civic — the
    // town hall, the university — stands through the block centre. Measured on seed 0 before this
    // filter: the town hall's mesh overlapped `core-3-3` (playground) by 5.58 m in Z and 15.66 m
    // in X, and the university overlapped `core-3-0` (sewerage plant) by the same. The cores stay
    // in `city.blockCores` because they are display-route nodes; only the MESH is skipped here.
    // Toys are spawned inside the group loop below, so a suppressed core spawns none — nothing is
    // left floating where its building used to be.
    //
    // `?coresuppress=0` draws them anyway. It exists so the BEFORE state stays measurable on the
    // same tree — `mvp/tests/v371-landmark-overhang.mjs --before` uses it, and without it a
    // before/after comparison has to straddle two builds of a shared checkout that nine sessions
    // are editing. It mirrors the existing `?cores=0` escape hatch in `board.js:519`.
    const params = typeof location !== 'undefined'
      ? new URLSearchParams(location.search)
      : null;
    const suppressionOff = params?.get('coresuppress') === '0';
    const suppressed = suppressionOff
      ? new Set()
      : new Set(this.board.city.coreSuppressedBlocks ?? []);
    const cores = (this.board.city.blockCores ?? [])
      .filter((core) => core.useId !== 'reserve-rotunda')
      .filter((core) => !suppressed.has(`${core.bx},${core.bz}`));
    this.stats.suppressed = suppressed.size;
    const groups = new Map();
    for (const core of cores) {
      const key = `${core.useId}:${core.variant | 0}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(core);
    }
    this.stats.variants = groups.size;
    this.stats.cores = cores.length;

    for (const [key, list] of groups) {
      const [useId, variantStr] = key.split(':');
      const builder = BUILDERS[useId];
      if (!builder) continue;
      const ctx = new CoreContext(this.palette, Number(variantStr));
      builder(ctx);
      const model = ctx.toModel();
      const placements = list.map((core) => placementAt(core.centre.x, 0, core.centre.z, 0));
      const { group } = instanceModel(model, placements, { castShadow: true, receiveShadow: true });
      group.name = `block-core:${useId}:v${variantStr}`;
      this.root.add(group);
      this.board.stats.instances += placements.length;

      for (const core of list) {
        for (const spec of model.toys) this.toys.spawn(core, spec);
      }
    }
    this.stats.toys = this.toys.items.length;
  }

  tap(key) {
    return this.toys.tap(key);
  }

  step(dt) {
    this.toys.step(dt);
  }
}

export { CORE_TYPES, BUILDERS };
