// District Deck V3.00 — game entry point.
// Wires the deterministic core to the renderer and the HUD. This file holds no rules:
// it selects, dispatches verbs, and repaints.
//
// Solo turn loop (Monopoly-style, immediate apply):
//   1. Select a parcel (or person) on the board.
//   2. Spend one of RULES.actionsPerQuarter actions: acquire / renovate / BUILD placement /
//      survey / walk / hire / … (divest takes no action). Each successful spend decrements
//      state.actionsRemaining immediately and writes a holding or other state change.
//   3. Settle the quarter when ready: rent − opex − interest, Petridis moves, next Q.
// Hotseat / multiplayer still stage seat-action envelopes and commit packets.

import { lobbyRungLabel } from './ui/copy-labels.js';
import * as THREE from 'three';
import { openWorldOverlay } from './core/session-bridge.js';
import { enhanceHelpIntro } from './ui/help-intro.js';
import { applyCityAction, resumeUrlAfterSave, cityPersistencePolicy, prepareCitySession, saveCitySession, previewRestartUrl, runCityCampaignMutation } from './core/city-world-dispatch.js';
import { activeOrder, activeParcel, createCity } from './core/city.js';
import {
  createRun,
  runResult, serialise,
} from './core/state.js';
import { canAcquire, navOf } from './core/economy.js';
import { canPlaceBuilding, siteWorksOverlay } from './core/site-works.js';
import { permitFeeForRung } from './core/planning-permits.js';
import { RULES } from './core/content.js';
import { helpActionAllowance, ordinaryDivestToast } from './ui/sale-presentation.js';

import { clearCityExports, shouldWriteCityExports, writeCityExports } from './core/city-exports.js';
import { advanceWorldOnCitySettle } from './core/world/envelope.js';
import { PROFESSIONAL_PROJECT_CAP } from './core/people.js';
import { DECEASED_ESTATE_ASK_BP } from './core/rates.js';
import { globalTile, fromGlobalTile, parcelId, parseParcelId, TILE, TILES_PER_BLOCK } from './core/grid.js';
import {
  inspectWorldRun, raiseAndStoreForce, WORLD_RUN_KEY, worldStore,
} from './core/world/envelope.js';
import { escapeHtml, signedMoney } from './core/format.js';
import { disclosedRivalTargets } from './core/rival-targets.js';
import { AssetRegistry } from './render/assets.js';
import { applyRivalCss } from './render/rival-hue.js';
import { SceneView, strategicSelectionAfterPick } from './render/scene.js';
import { blockIdAt } from './render/military/units.js';
import { militaryPanelModel, mountMilitaryPanel } from './ui/military-panel.js';
import {
  strategicSelectionAtTile, strategicSelectionKey, strategicSelectionOrder,
} from './render/board.js';
import { furnitureLabel } from './render/furniture-labels.js';
import { impulseConstructionTap } from './render/construction-site.js';
import { ThumbnailMaker } from './render/thumbnails.js';
import { AudioBus } from './render/audio.js';
import { cybercabContext } from './render/vehicles/cybercab.js';
import { CYBERCAB_PRESENTATION_ACTIONS, reduceCybercabPresentation } from './core/cybercab.js';
import { mountAudioSettings } from './ui/audio-settings.js';
import { onlineHelpHtml } from './ui/online-help.js';
import { resumeOnlineSession, mountOnlineSession } from './ui/online-session.js';
import { disposeCybercabPanel } from './ui/cybercab-panel.js';
import { settleButtonState, settleConfirmWarning, Hud } from './ui/hud.js';
import { HotseatController } from './ui/hotseat.js';
import { PropertyCard, personChipName } from './ui/card.js';
import { meetingResultFocus } from './ui/meeting-result-focus.js';
import { ExchangeDesk } from './ui/exchange.js';
import { SuperMarketTd, supermarketOnBoard } from './ui/supermarket-td.js';
import { IceCreamRush } from './ui/ice-cream-rush.js';
import { ScriptLord, remandOnBoard } from './ui/script-lord.js';
// V3.70 L7 — the three block-centre minigames. Each mounts its own stylesheet idempotently
// (resolved-href comparison), so `play.html` needs no change and is left alone — it is dirty in
// two other worktrees.
import { VeggiePatch, communityGardenOnBoard } from './ui/veggie-patch.js';
import { PlaygroundBuilder, playgroundOnBoard } from './ui/playground-builder.js';
import { TownSquare, pocketParkOnBoard } from './ui/townsquare-panel.js';
import { blockCentreGameAt } from './ui/minigame-entry.js';
import { stockExchangeOnBoard } from './core/markets.js';
import { openModal, isModalOpen } from './ui/modal.js';
import { mountDiorama } from './ui/card-voxels.js';
import { SettlementPresenter } from './ui/settlement-presenter.js';
import { SettleNotices, boardCovered } from './ui/forced-sale-notice.js';
import { ConnectorOverlay } from './ui/connectors.js';
import { readLayout, onLayoutChange } from './ui/layout-class.js';
import { refreshBands, bands as cachedBands, roomRect, seatedSheet } from './ui/bands.js';
import { createPhoneFit, classFlipPending } from './ui/phone-fit.js';
import { reserveFitDistance, PHONE_FIT } from './ui/phone-fit.js';
import { CHARACTER_PROFILES } from './core/storyline.js';
import { TOAST_MESSAGES } from './core/copy-upgrades.js';
import { pickMessage as pickVoiceMessage } from './ui/message-choice.js';
import {
  LAST_RUN_KEY,
  browserStore as store,
  createRunStartRecord,
  currentRivalPolicyId,
  seedSelectionFromParams,
} from './ui/landing.js';

const SAVE_KEY = LAST_RUN_KEY;
const UI_PREFS_KEY = 'district-deck-v300';

// One framing table owns every selection path. Parcel focus is deliberately a
// board-context moment: the target is the parcel's ground centre, not its facade.
const SELECTION_FOCUS_DISTANCE = Object.freeze({
  civic: 72,
  parcel: 180,
  person: 52,
  reserve: 96,
});

function applyAction(city, state, action) {
  return applyCityAction(city, state, action, store, {
    ...cityPersistencePolicy(location.search), savedAt: new Date().toISOString(),
  });
}

function selectionFocusDistance(selectionOrKind) {
  const kind = typeof selectionOrKind === 'string'
    ? selectionOrKind
    : selectionOrKind?.kind;
  return SELECTION_FOCUS_DISTANCE[kind] ?? SELECTION_FOCUS_DISTANCE.civic;
}

const params = new URLSearchParams(location.search);
applyRivalCss(document.documentElement.style);
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Board-edge origin + seaward unit for the city's water face. */
function waterEdgeFrame(city) {
  const { x: ex, z: ez } = city.extent;
  const edge = city.waterEdge;
  if (edge === 'west') return { ox: 0, oz: ez / 2, sx: -1, sz: 0, fromSea: 70 };
  if (edge === 'north') return { ox: ex / 2, oz: 0, sx: 0, sz: -1, fromSea: 160 };
  if (edge === 'south') return { ox: ex / 2, oz: ez, sx: 0, sz: 1, fromSea: 20 };
  return { ox: ex, oz: ez / 2, sx: 1, sz: 0, fromSea: 250 };
}

/** Pose the orbit on the swash line (same station as water plate 02-shore-break). */
function frameWaterLook(rig, city, shot = 'shore') {
  const f = waterEdgeFrame(city);
  const seaward = shot === 'surf' ? 62 : shot === 'hero' ? 34 : 46;
  const along = shot === 'surf' ? -18 : 0;
  const ax = -f.sz;
  const az = f.sx;
  const target = {
    x: f.ox + f.sx * seaward + ax * along,
    y: shot === 'surf' ? 0.6 : 0,
    z: f.oz + f.sz * seaward + az * along,
  };
  const D = Math.PI / 180;
  rig.cancelInertia?.();
  rig.programmaticFocus = true;
  rig.target.set(target.x, target.y, target.z);
  rig.distance = shot === 'surf' ? 30 : shot === 'hero' ? 150 : 62;
  rig.azimuth = (f.fromSea + (shot === 'surf' ? 22 : 0)) * D;
  rig.polar = (shot === 'surf' ? 14 : shot === 'hero' ? 34 : 26) * D;
  rig.smoothTarget.copy(rig.target);
  rig.smoothDistance = rig.distance;
  rig.smoothAzimuth = rig.azimuth;
  rig.smoothPolar = rig.polar;
  if (typeof rig._poseCamera === 'function') {
    rig._poseCamera(rig.camera, rig.smoothTarget, rig.smoothAzimuth, rig.smoothPolar, rig.smoothDistance);
  } else {
    rig.update(1);
  }
}

function chooseQuality() {
  const requested = params.get('quality');
  if (requested) return requested;
  const cores = navigator.hardwareConcurrency ?? 4;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  if (coarse && cores <= 6) return 'low';
  if (cores <= 4) return 'medium';
  return 'high';
}

function selectionFor(city, value, state = null) {
  if (!value) return null;
  const normalizedId = String(typeof value === 'object' ? value.id ?? '' : value).toLowerCase().replace(/^a(?=\d{4}$)/, 'A');
  if (!normalizedId) return null;
  const liveParcel = (id) => Boolean(
    city.parcels[id] || (state && activeParcel(city, state, id)),
  );
  if (typeof value === 'object') {
    if (value.kind === 'parcel' && liveParcel(normalizedId)) {
      return { kind: 'parcel', id: normalizedId };
    }
    if (value.kind === 'civic' && city.civicUses.some((civic) => civic.id === normalizedId)) {
      return { kind: 'civic', id: normalizedId };
    }
    if (value.kind === 'reserve' && city.reserve?.id === normalizedId) {
      return { kind: 'reserve', id: normalizedId };
    }
    return null;
  }
  if (liveParcel(normalizedId)) return { kind: 'parcel', id: normalizedId };
  if (city.civicUses.some((civic) => civic.id === normalizedId)) {
    return { kind: 'civic', id: normalizedId };
  }
  if (city.reserve?.id === normalizedId) return { kind: 'reserve', id: normalizedId };
  return null;
}

/** Deterministic review states — framework §6.5. QA never has to grind a run. */
function applyFixture(city, state, name) {
  if (!name) return state;
  let next = structuredClone(state);
  if (name === 'rich') {
    next.cash = RULES.startingCash * 8;
  } else if (name === 'broke') {
    next.cash = 60_000;
  } else if (name === 'empty') {
    // A clean opening with nothing restored — the default run, stated explicitly.
    return next;
  } else if (name === 'endgame') {
    next.cash = RULES.startingCash;
    for (let i = 0; i < 4; i += 1) {
      const id = city.order.find((pid) => canAcquire(city, next, pid).ok);
      if (!id) break;
      next = applyAction(city, next, { type: 'acquire', parcelId: id }).state;
      next.actionsRemaining = RULES.actionsPerQuarter;
    }
    while (next.quarter < next.quarters) {
      next = applyAction(city, next, { type: 'settle' }).state;
    }
  }
  return next;
}

function fastForward(city, state, quarter) {
  let next = state;
  const target = Math.max(1, Math.min(Number(quarter) || 1, state.quarters));
  while (next.quarter < target && next.phase === 'play') {
    next = applyAction(city, next, { type: 'settle' }).state;
  }
  return next;
}

class Game {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('#board');
    this.loader = root.querySelector('.loader');
    this.loaderFill = root.querySelector('.loader__fill');
    this.loaderText = root.querySelector('.loader__text');
    this.overlayHost = root;
    this.selection = null;
    this.tool = null;
    this.buildCatalogId = null;
    this.buildHoverParcelId = null;
    this._suppressBoardPointerUp = false;
    const soundLevel = (name, fallback) => {
      const value = store.get(`${UI_PREFS_KEY}:${name}`);
      return value === null ? fallback : Number(value);
    };
    this.audio = new AudioBus({
      musicVolume: soundLevel('music-volume', 0.35),
      effectsVolume: soundLevel('effects-volume', 0.8),
    });
    this.muted = store.get(`${UI_PREFS_KEY}:muted`) === '1';
    this.settlementPresentingUntil = 0;
    this.inspectedPersonId = null;
    this.inspectedFringeId = null;
    this.disposed = false;
    this.preserveInvalidSave = false;
    this._disposeHelpDioramas = null;
  }

  get selectedId() {
    return this.selection?.id ?? null;
  }

  get selectedParcelId() {
    return this.selection?.kind === 'parcel' ? this.selection.id : null;
  }

  async boot() {
    this.online = await resumeOnlineSession();
    this.seedSelection = seedSelectionFromParams(params);
    this.seed = this.online?.snapshot.seed ?? this.seedSelection.seed;
    this.city = createCity({ seed: this.seed });

    this.registry = new AssetRegistry();
    await this.registry.loadAll((progress, id) => {
      this.loaderFill.style.width = `${Math.round(progress * 100)}%`;
      this.loaderText.textContent = `Building ${id.replace(/-/g, ' ')}`;
    });

    const provenance = this.registry.provenance();
    if (provenance.diagnostics.length) {
      console.warn('[district-deck] asset diagnostics', provenance.diagnostics);
    }
    console.info('[district-deck] asset provenance', provenance.counts);

    this.view = new SceneView(this.canvas, this.city, this.registry, {
      reducedMotion: prefersReducedMotion,
      quality: chooseQuality(),
    });
    // Phone round P1 (L1): the camera fit on the tall and short classes (src/ui/phone-fit.js); inert on wide and with ?phoneHud=0.
    this.phoneFit = createPhoneFit(this.view);
    this.view.phoneFit = this.phoneFit;
    this.view.mischief.setGuard(() => (
      this.state?.phase === 'play'
      && !isModalOpen()
      && performance.now() >= this.settlementPresentingUntil
      && !this.view.rig.isFocusing()
    ));
    // Reuse the existing low-gain reject/impact synthesis; the dust puff (or reduced
    // motion marker) is its visible equivalent.
    this.view.mischief.setImpact(() => this.audio.play('reject'));
    this.view.onCrossingHit = (hit) => {
      if (this.online) return;
      if (!this.state || this.state.phase !== 'play') return;
      if ((this.state.crossingAccidents ?? []).some((row) => row.quarter === this.state.quarter)) {
        return;
      }
      const result = applyAction(this.city, this.state, {
        type: 'crossing-accident',
        x: hit.ped?.x,
        z: hit.ped?.z,
        pedId: hit.ped?.id ?? null,
        vehicleKind: hit.vehicle?.kind ?? 'car',
      });
      if (result.rejected) return;
      this.acceptReducerResult(result, 'crossing-accident');
    };
    this.thumbnails = new ThumbnailMaker(this.view.renderer, this.registry);

    this.state = this.restoreOrCreate();
    // A new run is first saved by its first accepted action (acceptReducerResult), so opening one never overwrites the saved run.
    this.runSaved = Boolean(this.resumedRun);
    this.connectors = new ConnectorOverlay(
      this.root.querySelector('.board-connectors'),
      this.view,
      () => this.state,
      { getBoardRect: () => this.visibleBoardRect() },
    );
    this.settlementPresenter = new SettlementPresenter(this.root, {
      reducedMotion: prefersReducedMotion,
      onDismiss: () => {
        this.settlementPresentingUntil = 0;
        // Phone round P2a (B): on a phone class the camera goes back to the pose it had when Settle was pressed, or to the phone home fit when that pose
        // cannot be had (phone-fit.js returnPose). The wide class and ?phoneHud=0 keep Frame city, as before.
        const heldPose = this._settlePose ?? null;
        this._settlePose = null;
        if (!this.phoneFit?.returnPose(heldPose)) this.view.rig.frameAll();
        this.connectors.invalidate();
        if (this.pendingResult) {
          this.pendingResult = false;
          this.hud.showResult(this.city, this.state, this.overlayHost);
        }
      },
    });
    this.settleNotices = new SettleNotices({
      covered: () => boardCovered({ presenter: this.settlementPresenter }),
      present: (text) => this.hud.toast(text, 'reject', { held: true }),
    });

    this.hud = new Hud(this.root, {
      onVerb: (verb, parcelId, extra = null) => this.dispatch(
        verb,
        parcelId ?? this.selectedParcelId,
        extra,
      ),
      onSettle: () => this.trySettle(),
      onHelp: () => this.showHelp(),
      onRestart: (mode) => this.restart(mode),
      onGoto: (id) => this.selectSafely(id),
      onPairFocus: (id) => this.focusBoardTarget(
        selectionFor(this.city, id, this.state) ?? id,
      ),
      onDistrictFocus: (payload) => this.focusDistrictSignal(payload),
      onPersonGoto: (personId) => {
        if (!this.inspectPerson(personId)) {
          this.hud.toast('That person is no longer on the board.', 'reject');
        }
      },
      onBuildPreview: (catalogId) => {
        if (this.tool === 'demolish') this.disarmDemolishTool({ toast: false });
        this.buildCatalogId = catalogId;
        this.buildHoverParcelId = null;
        this.root.classList.toggle('is-build-tool', Boolean(catalogId));
        this.updateBuildPreview(null);
      },
      onSurfaceChange: () => this.connectors.invalidate(),
    });

    this.card = new PropertyCard(this.root, {
      onAction: (verb, parcelId, extra = null) => {
        if (verb === 'focus') { this.focusSelection(); return; }
        if (verb === 'focus-family-signal') {
          this.focusFamilySignal(extra?.blockIds ?? []);
          return;
        }
        if (verb === 'goto' && parcelId) {
          this.inspectedPersonId = null;
          this.selectSafely(parcelId, { forceFrame: true });
          return;
        }
        this.dispatch(verb, parcelId, extra);
      },
      onClose: (closedSelection) => {
        if (closedSelection?.kind === 'person') {
          this.inspectedPersonId = null;
          if (this.selection) {
            this.card.show(this.city, this.state, this.selection, this.viewerSeatId());
            this.root.classList.add('has-card');
            this.keepSelectionVisible();
          } else {
            this.root.classList.remove('has-card');
          }
          this.connectors.invalidate();
          return;
        }
        if (closedSelection?.kind === 'fringe') {
          this.inspectedFringeId = null;
          if (this.selection) {
            this.card.show(this.city, this.state, this.selection, this.viewerSeatId());
            this.root.classList.add('has-card');
          } else {
            this.root.classList.remove('has-card');
          }
          this.connectors.invalidate();
          return;
        }
        this.select(null);
      },
    });
    this.card.setThumbnailMaker(this.thumbnails);

    // Toasts share the live card seat, including person cards and phone sheets.
    this.hud.getToastCardRect = () => {
      const element = this.card?.element;
      if (!element?.isConnected || element.hidden) return null;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 ? rect : null;
    };
    const toastResize = new ResizeObserver(() => this.hud.placeToasts());
    const toastCardChanges = new MutationObserver(() => this.hud.placeToasts());
    let toastCard = null;
    const placeToasts = () => {
      const element = this.card?.element ?? null;
      if (element !== toastCard) {
        if (toastCard) toastResize.unobserve(toastCard);
        toastCardChanges.disconnect();
        toastCard = element;
        if (element) {
          toastResize.observe(element);
          toastCardChanges.observe(element, { attributes: true, attributeFilter: ['data-sheet', 'style', 'class', 'hidden'] });
        }
      }
      this.hud.placeToasts();
    };
    toastResize.observe(this.root);
    toastResize.observe(this.hud.statusbar);
    new MutationObserver(placeToasts).observe(this.root, { childList: true });
    new MutationObserver(() => this.hud.placeToasts()).observe(this.hud.toasts, { childList: true });
    window.addEventListener('resize', placeToasts);
    window.addEventListener('layoutchange', placeToasts);
    this.root.addEventListener('transitionend', placeToasts);
    this.root.addEventListener('animationend', placeToasts);

    this.selectedUnitId = null;
    this.militaryPanel = mountMilitaryPanel(this.root, {
      getModel: () => militaryPanelModel({
        state: this.state,
        world: (() => {
          if (this.online) return null;
          try {
            const inspected = inspectWorldRun(worldStore.get(WORLD_RUN_KEY));
            return inspected.status === 'valid' ? inspected.world : null;
          } catch {
            return null;
          }
        })(),
        unitsStatus: this.view?.militaryUnits?.status?.()?.units?.length
          ? this.view.militaryUnits.status()
          : { units: this.view?.militaryUnits?.demo?.units ?? this.state?.military?.units ?? [] },
        beat: this.state?.quarter,
      }),
      onSelectUnit: (id) => this.selectUnit(id),
      onMove: (id) => this.selectUnit(id, { order: 'move' }),
      onWatch: (id) => this.selectUnit(id),
    });
    this.view.onMilitaryPanel = (on) => this.militaryPanel?.toggle(on === true ? true : on);
    const hudRender = this.hud.render.bind(this.hud);
    this.hud.render = (city, state, opts) => {
      const cabFocus = document.activeElement?.hasAttribute('data-cybercab-launch');
      hudRender(city, state, opts);
      this.militaryPanel?.sync();
      this.onlineUI?.render();
      if (cabFocus) queueMicrotask(() => {
        if (this.disposed) return;
        [...this.root.querySelectorAll('[data-cybercab-launch]')].find(button=>button.getClientRects().length)?.focus({preventScroll:true});
      });
    };

    this.desk = new ExchangeDesk(this.root, {
      onAction: (action) => this.dispatch(action),
      onSettle: () => this.trySettle(),
      onClose: () => {
        this.root.classList.remove('has-desk');
      },
    });

    this.shop = new SuperMarketTd(this.root, {
      onAction: (action) => this.dispatch(action),
      onClose: () => {
        this.root.classList.remove('has-shop');
      },
    });

    this.rush = new IceCreamRush(this.root, {
      onAction: (action) => this.dispatch(action),
      onClose: () => {
        this.root.classList.remove('has-rush');
      },
      onCue: (name) => this.audio.play(name),
    });

    this.script = new ScriptLord(this.root, {
      onAction: (action) => this.dispatch(action),
      onClose: () => {
        this.root.classList.remove('has-script');
      },
    });

    this.veggie = new VeggiePatch(this.root, {
      onAction: (action) => this.dispatch(action),
      onClose: () => this.root.classList.remove('has-veggie'),
      onCue: (name) => this.audio.play(name),
    });

    this.playground = new PlaygroundBuilder(this.root, {
      onClose: () => this.root.classList.remove('has-playground'),
      onCue: (name) => this.audio.play(name),
    });

    this.square = new TownSquare(this.root, {
      onClose: () => this.root.classList.remove('has-square'),
      onCue: (name) => this.audio.play(name),
    });

    if (this.state.mode === 'hotseat') {
      this.hotseat = new HotseatController(this.root, {
        getState: () => this.state,
        reduce: (input) => applyAction(this.city, this.state, input),
        accept: (result, action) => this.acceptReducerResult(result, 'commit-quarter', action),
        clearSharedPrivate: () => {
          this.card.close();
          this.selection = null;
          this.inspectedPersonId = null;
          this.inspectedFringeId = null;
          this.root.classList.remove('has-card');
          this.hud.toasts.replaceChildren();
          this.hud.actionbar.replaceChildren();
        },
      });
    }

    this.bindInput();
    this.view.rig.frameAll();
    this.view.setReducedMotion(prefersReducedMotion);
    this.view.syncState(this.state, this.viewerSeatId());
    if (params.get('look') === 'street') {
      const residential = new Set([
        'terrace-single', 'cottage-federation', 'terrace-double', 'bungalow-californian',
        'townhouse-row', 'walkup-flats', 'house-modern-skillion',
      ]);
      const holdings = this.state.holdings ?? {};
      const people = this.view.people;
      const humans = [];
      for (const [id, rec] of people?.records ?? []) {
        if (!rec || rec.archetypeId === 'dog' || String(id).startsWith('dog')) continue;
        const pos = people.positionOf(id);
        if (pos) humans.push(pos);
      }
      const street = new Set([
        'cottage-federation', 'bungalow-californian', 'terrace-single',
        'terrace-double', 'house-modern-skillion',
      ]);
      const scored = [];
      for (const id of this.city.order) {
        const parcel = this.city.parcels[id];
        if (!parcel || !residential.has(parcel.archetypeId)) continue;
        if (this.view.board?.staticBuildings && !this.view.board.staticBuildings.has(id)) continue;
        const pos = this.view.worldOf({ kind: 'parcel', id });
        if (!pos) continue;
        let nearest = Infinity;
        let human = null;
        for (const h of humans) {
          const d = (h.x - pos.x) ** 2 + (h.z - pos.z) ** 2;
          if (d < nearest) {
            nearest = d;
            human = h;
          }
        }
        const owned = holdings[id]?.owner === 'player' ? 0 : 1;
        const house = street.has(parcel.archetypeId) ? 0 : 1;
        const reachable = Number.isFinite(nearest) && nearest <= 28 * 28 ? 0 : 1;
        scored.push({ id, pos, nearest, owned, house, human, reachable });
      }
      scored.sort((a, b) => a.reachable - b.reachable || a.owned - b.owned
        || a.house - b.house || a.nearest - b.nearest);
      const pick = scored[0];
      if (pick) {
        const humanDist = Number.isFinite(pick.nearest) ? Math.sqrt(pick.nearest) : 16;
        const distance = Math.max(50, Math.min(66, 42 + humanDist * 0.7));
        const look = pick.human
          ? { x: pick.pos.x * 0.62 + pick.human.x * 0.38, z: pick.pos.z * 0.62 + pick.human.z * 0.38 }
          : pick.pos;
        const rig = this.view.rig;
        rig.focus(look, { distance });
        rig.polar = 30 * Math.PI / 180;
        rig.update(1);
      }
    } else {
      this.view.frameOpeningCity(this.city);
    }
    {
      const lookWater = params.get('look');
      if (lookWater === 'water' || lookWater === 'shore' || lookWater === 'surf' || lookWater === 'hero') {
        const shot = lookWater === 'water' ? 'shore' : lookWater;
        frameWaterLook(this.view.rig, this.city, shot);
      }
    }
    this.hud.render(this.city, this.state, {
      selectedId: this.selectedId,
      viewerSeatId: this.viewerSeatId(),
      tool: this.tool,
      catalogId: this.buildCatalogId,
    });
    if (this.online) {
      this.root.classList.add('online-game');
      this.onlineUI = mountOnlineSession(this);
      this.onlineUI.render();
      this._onlineUnsubscribe = this.online.subscribe(({ snapshot, events = [] }) => {
        if (this.disposed) return;
        this.acceptReducerResult({ state: snapshot.viewState, events: [] }, 'online-update');
        if (events.some(event => event.kind === 'room-quarter-resolved')) {
          this.audio.play('settle');
          this.hud.toast(`Quarter ${snapshot.quarter} · plans resolved. Open View plan for your cash result.`);
        }
      });
      this.online.startPolling({ onError: (error, status) => this.onlineUI?.pollingError(error, status),
        onRecovered: error => this.onlineUI?.pollingRecovered(error) });
    }
    this.hotseat?.showPrivacy(this.state.quarterCommit.resolutionOrder[0]);
    this.view.start(() => this.onFrame());

    this.loader.classList.add('loader--gone');
    setTimeout(() => {
      this.loader.remove();
      document.body.classList.remove('loader-pending');
    }, 400);

    if (this.state.phase === 'result') this.hud.showResult(this.city, this.state, this.overlayHost);
    if (!store.get(`${UI_PREFS_KEY}:seen-help`) && params.get('script') !== '1') this.showHelp();
    if (params.get('desk') === '1') {
      const venue = stockExchangeOnBoard(this.city);
      if (venue) this.openDesk(venue.id);
    }
    if (params.get('shop') === '1') {
      const strip = supermarketOnBoard(this.city);
      if (strip) this.openShop(strip.id);
    }
    if (params.get('rush') === '1') this.openRush();
    if (params.get('garden') === '1') this.openVeggie(params.get('core'));
    if (params.get('playground') === '1') this.openPlayground(params.get('core'));
    if (params.get('square') === '1') this.openSquare(params.get('core'));
    if (params.get('script') === '1') this.openScript();

    // Expose a small handle for automated QA — read-only in practice.
    window.__districtDeck = {
      openWorld: () => {
        if (this.online) {
          this.hud.toast('This online room shares the city. World trade remains in your solo campaign.', 'reject');
          return;
        }
        if (!cityPersistencePolicy(location.search).allowPersistentRepairs) {
          this.hud.toast('World campaign is unavailable in previews.', 'reject');
          return;
        }
        return openWorldOverlay({
          root: this.root, view: this.view, onFrame: () => this.onFrame(),
        });
      },
      snapshot: () => ({
        seed: this.seed,
        quarter: this.state.quarter,
        phase: this.state.phase,
        cash: this.state.cash,
        nav: navOf(this.city, this.state, 'player'),
        rivalNav: navOf(this.city, this.state, 'rival'),
        selected: this.selectedId,
        selection: this.selection,
        parcels: this.city.order.length,
        cores: this.city.blockCores.length,
        reserve: this.city.reserve?.id ?? null,
        waterEdge: this.city.waterEdge,
        wheelDevice: this.view.rig.wheelDevice,
        provenance: provenance.counts,
        diagnostics: provenance.diagnostics,
        drawInfo: this.view.renderer.info.render,
        v303: this.view.v303Stats(),
        documentHidden: document.hidden,
        mischief: this.view.mischief.snapshot(),
      }),
      view: this.view,
      debugPickPerson: (clientX, clientY) => this.view?.peopleDrag?.debugPickPerson?.(
        clientX,
        clientY,
      ) ?? { hit: false, actorIndex: -1, ndc: null },
      frameWater: (shot = 'shore') => frameWaterLook(this.view.rig, this.city, shot),
      city: this.city,
      registry: this.registry,
      resolveSelection: (value) => selectionFor(this.city, value, this.state),
      select: (id) => this.selectSafely(id),
      selectRaw: (id) => this.select(id),
      inspectFringe: (id, focus) => {
        this._fringeFocus = focus ?? null;
        return this.inspectFringe(id);
      },
      keepSelectionVisible: () => this.keepSelectionVisible(),
      visibleBoardRect: () => this.visibleBoardRect(),
      dismissSettlement: () => this.settlementPresenter?.dismiss?.(),
      dispatch: (verb, id, extra = null) => this.dispatch(
        verb,
        id === undefined
          ? this.selectedParcelId
          : (this.city.parcels[id]
            || activeParcel(this.city, this.state, id)
            || this.state.people?.byId?.[id] ? id : null),
        extra,
      ),
      openDesk: (venueId) => this.openDesk(venueId),
      deskOpen: () => this.desk?.open ?? false,
      openShop: (venueId) => this.openShop(venueId),
      shopOpen: () => this.shop?.open ?? false,
      shop: this.shop,
      openRush: () => this.openRush(),
      openVeggie: (coreId) => this.openVeggie(coreId),
      veggieOpen: () => this.veggie?.open ?? false,
      veggie: this.veggie,
      openPlayground: (coreId) => this.openPlayground(coreId),
      playgroundOpen: () => this.playground?.open ?? false,
      playground: this.playground,
      openSquare: (coreId) => this.openSquare(coreId),
      squareOpen: () => this.square?.open ?? false,
      square: this.square,
      rushOpen: () => this.rush?.open ?? false,
      rush: this.rush,
      openScript: () => this.openScript(),
      scriptOpen: () => this.script?.open ?? false,
      script: this.script,
      serialise: () => serialise(this.state),
      getState: () => this.state,
      getCity: () => this.city,
      replaceState: (next) => {
        this.state = next;
        this.disarmSettle();
        this.view.syncState(this.state, this.viewerSeatId());
        this.hud.railPanels.cast = true;
        this.hud.render(this.city, this.state, {
          selectedId: this.selectedId,
          viewerSeatId: this.viewerSeatId(),
          tool: this.tool,
          catalogId: this.buildCatalogId,
        });
      },
      hotseat: this.hotseat ? {
        activeSeatId: () => this.hotseat.activeSeatId,
        reveal: () => this.hotseat.reveal(),
        stage: (action) => this.hotseat.stage(action),
        commit: () => this.hotseat.commit(),
        privacy: () => ({
          activeSeatId: this.hotseat.activeSeatId,
          revealed: this.hotseat.revealed,
          privacyScreen: Boolean(document.querySelector('[data-hotseat-privacy]')),
          privatePanels: [...document.querySelectorAll('[data-hotseat-private]')]
            .map((element) => ({
              seatId: element.dataset.hotseatPrivate,
              text: element.textContent,
            })),
          liveText: [...document.querySelectorAll('[aria-live]')]
            .map((element) => element.textContent).join(' ').trim(),
        }),
      } : null,
      inspectPerson: (id) => this.inspectPerson(id),
      renderStats: () => this.view.v303Stats(),
      mischiefTap: (key) => this.view.mischief.tap(key),
      mischiefSnapshot: () => this.view.mischief.snapshot(),
      focusMischief: (key, distance = 42) => {
        const target = this.view.board.mischiefTargets.find((item) => item.key === key);
        if (target) this.view.rig.focus(target.getPose().position, { distance });
      },
      setReducedMotion: (on) => {
        const reduced = Boolean(on);
        this.view.setReducedMotion(reduced);
        this.settlementPresenter.reducedMotion = reduced;
      },
      dismissSettlement: () => this.settlementPresenter.dismiss(),
      /**
       * Drive frames by hand — background tabs suspend requestAnimationFrame.
       *
       * `elapsed` accumulates ACROSS calls. It used to be `i * dt`, which restarted
       * the clock at zero on every call: a harness looping `step(2)` twenty times
       * advanced the animation clock to 0.05 s and stayed there, so every captured
       * plate showed the same instant. Anything time-driven — waves, foam, swash,
       * traffic, signal lamps — was being reviewed frozen at t ≈ 0.05 s, which is
       * why several rounds of wave work could not see their own animation.
       */
      step: (frames = 30, dt = 0.05) => {
        for (let i = 0; i < frames; i += 1) {
          // Advance every simulation frame but submit only the final WebGL frame. This
          // keeps hidden-tab QA deterministic without paying SwiftShader 260 renders
          // merely to wait out a renderer-local timer.
          this._stepElapsed = (this._stepElapsed ?? 0) + dt;
          this.view.step(dt, this._stepElapsed, () => this.onFrame(), i === frames - 1);
        }
      },
      /** Reset the hand-driven clock so a capture run can start from a known instant. */
      resetStepClock: (seconds = 0) => { this._stepElapsed = seconds; },
      measureFrames: (frames = 60, dt = 1 / 60) => {
        const samples = [];
        for (let i = 0; i < frames; i += 1) {
          const started = performance.now();
          this.view.step(dt, i * dt, () => this.onFrame(), true);
          samples.push(performance.now() - started);
        }
        const ordered = [...samples].sort((a, b) => a - b);
        return {
          frames,
          meanMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
          p95Ms: ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * 0.95))],
          maxMs: ordered.at(-1) ?? 0,
          render: { ...this.view.renderer.info.render },
          v303: this.view.v303Stats(),
        };
      },
      measureV303Frames: (frames = 200, dt = 1 / 60) => {
        const samples = [];
        for (let i = 0; i < frames; i += 1) {
          const started = performance.now();
          this.view.people.update(dt);
          this.view.eventOverlays.update(i * dt);
          this.onFrame();
          samples.push(performance.now() - started);
        }
        const ordered = [...samples].sort((a, b) => a - b);
        return {
          frames,
          meanMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
          p95Ms: ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * 0.95))],
          maxMs: ordered.at(-1) ?? 0,
          v303: this.view.v303Stats(),
        };
      },
      focus: (id) => this.focusBoardTarget(id),
      frameAll: () => this.view.rig.frameAll(),
      resetNorth: () => this.view.rig.resetNorth(),
    };

    this._onPageHide = () => this.dispose();
    window.addEventListener('pagehide', this._onPageHide, { once: true });
    // The renderer's earlier resize listener updates the projection first. Seat
    // the existing selection once after responsive CSS has taken its new layout.
    this._onSelectionResize = () => {
      cancelAnimationFrame(this._selectionResizeFrame);
      this._selectionResizeFrame = requestAnimationFrame(() => {
        this._selectionResizeFrame = null;
        // The ease and the bring-in belong to this frame only. Cleared before the seat, and passed in, so a selection seat in between does not read them.
        const ease = this._sheetSeatEase === true;
        const bring = this._sheetBringIn === true;
        this._sheetSeatEase = false;
        this._sheetBringIn = false;
        if (this.disposed || !this.root.classList.contains('has-card') || !this.view.rig.canAutoFrame()) return;
        // P2b, one seat per fold: while the window is in another layout class than data-layout says (the head script writes it 100 ms after the resize), a
        // seat here would read the previous class's bands, and the layoutchange below seats again from the camera this one left, so the pose would depend on
        // the path. The seat is skipped; the connectors still follow. A resize that flips no class (every desktop resize) seats here, once, as before.
        if (!classFlipPending()) {
          if (this.inspectedPersonId && this.card.element?.dataset.personId === this.inspectedPersonId) {
            const point = this.view.people.positionOf(this.inspectedPersonId);
            if (point) this.framePointInVisibleBoard(point, { kind: 'person', id: this.inspectedPersonId }, this.visibleBoardRect(), true, false, { ease, bring });
          } else if (this.selection && this.card.isOpen(this.selection)) {
            if (ease || bring) this.keepSelectionVisible(undefined, false, { ease, bring });
            else this.keepSelectionVisible();
          }
        }
        this.connectors.invalidate();
      });
    };
    window.addEventListener('resize', this._onSelectionResize);
    // The resize above runs before the head script's debounce (100 ms) writes data-layout, so phoneBoardRect() then reads the previous class's bands and
    // seat. The class's flip seats the selection (the attributes are written before layoutchange is dispatched, so classFlipPending() is false by then).
    this._offLayoutSelection = onLayoutChange(() => this._onSelectionResize());
    // P2c item 1: peek and full are the attribute data-phone-sheet. A player's raise or lower seats through the resize frame above, so a resize in the
    // same frame is the same seat. A new selection's full-to-peek is seated inside the callback, before paint (selectSafely has already seated the full room).
    this._phoneSheetObserver = new MutationObserver((records) => this._onPhoneSheetRecords(records));
    this._phoneSheetObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-phone-sheet'],
      attributeOldValue: true,
    });
  }

  restoreOrCreate() {
    if (this.online) { this.resumedRun = true; return this.online.snapshot.viewState; }
    const fixture = params.get('fixture');
    const quarter = params.get('q');
    const session = prepareCitySession({ search: location.search, seed: this.seed, store });
    this.preserveInvalidSave = session.preserveInvalidSave;
    this.resumedRun = session.resumedRun;
    if (session.resumedRun) return session.state;

    const mode = params.get('mode') === 'hotseat' ? 'hotseat' : 'solo';
    const rivalPolicyId = currentRivalPolicyId(params.get('persona'));
    let state = createRun({ city: this.city, rivalPolicyId, mode, roomEconomyVersion: 2, cybercabEconomyVersion: 2, sellerFeeVersion: 1, cybercabFundingVersion: 1 });
    state.log.push(createRunStartRecord({
      ...this.seedSelection,
      roomEconomyVersion: 2,
      cybercabEconomyVersion: 2,
      sellerFeeVersion: 1,
      cybercabFundingVersion: 1,
      mode,
      seats: state.seats,
    }));
    if (quarter) state = fastForward(this.city, state, quarter);
    if (fixture) state = applyFixture(this.city, state, fixture);
    return state;
  }

  save() {
    if (this.online) return;
    const { saved, reason } = saveCitySession({
      search: location.search,
      state: this.state,
      savedAt: new Date().toISOString(),
      preserveInvalidSave: this.preserveInvalidSave,
      // The old export queue is dropped at this same write, not when Restart is pressed.
      clearExports: !this.runSaved && !this._cityExportsWritten,
      store,
    });
    if (reason) this.hud?.toast(reason, 'reject');
    if (saved === true) {
      const resumeUrl = resumeUrlAfterSave(location.href, this.seed);
      if (resumeUrl && resumeUrl !== location.href) history.replaceState(history.state, '', resumeUrl);
    }
  }

  /** The seat whose perspective the card/HUD/board should currently render — the
   * revealed hotseat seat, or P1 for solo, where there is no second seat to confuse it with. */
  viewerSeatId() {
    return this.online?.seatId ?? this.hotseat?.activeSeatId ?? 'P1';
  }

  armDemolishTool() {
    if (this.tool === 'demolish') {
      this.disarmDemolishTool();
      return;
    }
    this.buildCatalogId = null;
    this.buildHoverParcelId = null;
    this.root.classList.remove('is-build-tool');
    this.tool = 'demolish';
    this.root.classList.add('is-demolish-tool');
    this.view.board.setFootprintGhost(null);
    this.hud.render(this.city, this.state, {
      selectedId: this.selectedId,
      viewerSeatId: this.viewerSeatId(),
      tool: this.tool,
      catalogId: this.buildCatalogId,
    });
    this.hud.toast('Hammer out · 10 strikes · right-click to drop', 'good');
  }

  disarmDemolishTool({ toast = true } = {}) {
    if (this.tool !== 'demolish') return;
    this.tool = null;
    this.root.classList.remove('is-demolish-tool');
    this.view.board.setFootprintGhost(null);
    this.hud.render(this.city, this.state, {
      selectedId: this.selectedId,
      viewerSeatId: this.viewerSeatId(),
      tool: this.tool,
      catalogId: this.buildCatalogId,
    });
    if (toast) this.hud.toast('Hammer down', 'good');
  }

  parcelAtPointer(clientX, clientY) {
    const hit = this.view.pickAt(clientX, clientY);
    const hitId = hit?.kind === 'parcel'
      ? hit.id
      : hit?.parcelId;
    if (hitId && activeParcel(this.city, this.state, hitId)) return hitId;
    const ground = this.groundPointAt(clientX, clientY);
    const groundId = ground ? this.view.board.parcelAt(ground.x, ground.z) : null;
    return groundId && activeParcel(this.city, this.state, groundId) ? groundId : null;
  }

  updateBuildPreview(parcelId = this.buildHoverParcelId) {
    this.hud?.setBuildContext(parcelId);
    const overlay = siteWorksOverlay(
      this.city,
      this.state,
      parcelId,
      this.buildCatalogId,
    );
    if (!overlay) {
      this.view.board.setFootprintGhost(null);
      return;
    }
    const check = canPlaceBuilding(
      this.city,
      this.state,
      parcelId,
      this.buildCatalogId,
    );
    const parcel = activeParcel(this.city, this.state, overlay.parcelId);
    let buildingW = overlay.building.w;
    let buildingD = overlay.building.d;
    if ((parcel.rotation ?? 0) % 180 !== 0) {
      [buildingW, buildingD] = [buildingD, buildingW];
    }
    if (
      (buildingW > overlay.lot.w || buildingD > overlay.lot.d)
      && buildingD <= overlay.lot.w
      && buildingW <= overlay.lot.d
    ) {
      [buildingW, buildingD] = [buildingD, buildingW];
    }
    const slotGhost = Boolean(overlay.slot);
    this.view.board.setFootprintGhost({
      parcelId: overlay.parcelId,
      archetypeId: overlay.archetypeId,
      cx: overlay.centre.x,
      cz: overlay.centre.z,
      lotW: slotGhost ? TILE : overlay.lot.w * TILE,
      lotD: slotGhost ? TILE : overlay.lot.d * TILE,
      bldgW: slotGhost ? TILE : buildingW * TILE,
      bldgD: slotGhost ? TILE : buildingD * TILE,
      fits: Boolean(check.ok),
    });
  }

  bindInput() {
    this._unlockAudio = () => this.audio.unlock();
    this.root.addEventListener('pointerdown', this._unlockAudio, { capture: true });
    this.root.addEventListener('keydown', this._unlockAudio, { capture: true });
    this.root.querySelector('.camera-controls')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-camera]');
      if (!button) return;
      this.audio.unlock();
      const action = button.dataset.camera;
      if (action === 'zoom-in') this.view.rig.zoomBy(0.82);
      if (action === 'zoom-out') this.view.rig.zoomBy(1.22);
      if (action === 'frame') this.view.rig.frameAll();
      if (action === 'north') this.view.rig.resetNorth();
    });

    this.canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 2 || this.tool !== 'demolish') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this._suppressBoardPointerUp = true;
      this.disarmDemolishTool();
    }, true);
    this.canvas.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      if (this.tool === 'demolish') {
        event.stopImmediatePropagation();
        this.disarmDemolishTool();
      }
    }, true);

    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.buildCatalogId || this.tool === 'demolish') return;
      const parcelId = this.parcelAtPointer(event.clientX, event.clientY);
      if (parcelId === this.buildHoverParcelId) return;
      this.buildHoverParcelId = parcelId;
      this.updateBuildPreview(parcelId);
    });
    this.canvas.addEventListener('pointerleave', () => {
      if (!this.buildCatalogId) return;
      this.buildHoverParcelId = null;
      this.updateBuildPreview(null);
    });

    this.canvas.addEventListener('pointerup', (event) => {
      if (event.button === 2 && this._suppressBoardPointerUp) {
        this._suppressBoardPointerUp = false;
        return;
      }
      if (this.settlementPresenter?.isOpen) return;
      this.audio.unlock();
      if (this.view.rig.wasDrag()) return;
      // Capture-phase people-drag already swallowed a committed drop. This is
      // the bubble safety net if stopImmediatePropagation was skipped.
      if (this.view.peopleDrag?.consumePointerUp(event)) return;
      if (this.tool === 'demolish') {
        if (event.button !== 0) return;
        const hit = this.view.pickAt(event.clientX, event.clientY);
        const ground = this.groundPointAt(event.clientX, event.clientY);
        const parcelId = hit?.kind === 'parcel' || hit?.kind === 'civic'
          ? hit.id
          : hit?.parcelId
            ?? (ground ? this.view.board.parcelAt(ground.x, ground.z) : null);
        if (!parcelId) {
          this.hud.toast('Aim at an owned building.', 'reject');
          this.audio.play('reject');
          return;
        }
        this.dispatch({ type: 'demolish-strike', parcelId });
        return;
      }
      if (this.buildCatalogId) {
        if (event.button !== 0) return;
        const parcelId = this.parcelAtPointer(event.clientX, event.clientY);
        if (!parcelId) {
          this.hud.toast('Aim at an owned holding.', 'reject');
          this.audio.play('reject');
          return;
        }
        this.dispatch('place-building', parcelId, { catalogId: this.buildCatalogId });
        return;
      }
      const hit = this.view.pickAt(event.clientX, event.clientY);
      if (hit?.kind === 'unit') {
        this.selectUnit(hit.id);
        return;
      }
      if (this.selectedUnitId && event.button === 0) {
        const ground = this.groundPointAt(event.clientX, event.clientY);
        let blockId = null;
        if (hit?.kind === 'parcel' || hit?.kind === 'civic') {
          try {
            const parsed = parseParcelId(hit.id);
            blockId = `${parsed.bx},${parsed.bz}`;
          } catch {
            blockId = null;
          }
        }
        if (!blockId && ground) {
          blockId = blockIdAt(ground.x, ground.z, this.city.blocksX, this.city.blocksZ);
        }
        if (blockId) {
          this.dispatch({ type: 'station-unit', unitId: this.selectedUnitId, blockId });
          this.hud.toast(`Station ${this.selectedUnitId} · ${blockId}`, 'good');
          return;
        }
      }
      // Minigames open only on a deliberate bare-ground tap INSIDE the game's own turf.
      // The old order ran this grab (radius 9) before entity picking, so a click aimed at
      // a parcel near a park opened the game and visit-venue charged the action.
      if (!hit || hit.kind === 'ground') {
        const ground = this.groundPointAt(event.clientX, event.clientY);
        const centre = blockCentreGameAt(this.city, { point: ground }, 4);
        if (centre) {
          if (centre.game.id === 'veggie') this.openVeggie(centre.core.id);
          else if (centre.game.id === 'playground') this.openPlayground(centre.core.id);
          else if (centre.game.id === 'square') this.openSquare(centre.core.id);
          return;
        }
      }
      const selection = strategicSelectionAfterPick(this.selection, hit);
      if (hit?.kind === 'fringe') {
        this._fringeFocus = hit.focus ?? null;
        this.inspectFringe(hit.id);
        return;
      }
      if (hit?.kind === 'prop') {
        // Always show a readable name for street furniture / props.
        const fromBoard = this.view.board?.mischiefTargets?.find((t) => t.key === hit.key);
        const name = hit.label
          || fromBoard?.label
          || furnitureLabel(fromBoard?.model, hit.key)
          || 'Street furniture';
        const key = String(hit.key ?? '');
        if (key.includes('ice-cream')) {
          this.openRush();
          return;
        }
        const result = this.view.mischief.tap(hit.key);
        this.hud.propHint(name, result);
        return; // A prop tap never changes strategic selection.
      }
      if (hit?.kind === 'construction') {
        const job = hit.parcelId ? this.state.holdings?.[hit.parcelId]?.construction : null;
        hit.alreadyAccident = Boolean(job?.accidentOccurred);
        const result = impulseConstructionTap(this.view, hit, {
          clientX: event.clientX, clientY: event.clientY,
        });
        const name = hit.label === 'loo' ? 'Portaloo'
          : hit.label === 'pump' ? 'Concrete pump'
            : (hit.label || 'Works plant');
        if (result.broke && hit.parcelId) {
          this.dispatch({ type: 'plant-break', parcelId: hit.parcelId });
          this.hud.toast(`${name} written off — works delayed a quarter.`, 'reject');
        } else {
          this.hud.toast(name, 'good');
        }
        return;
      }
      if (hit?.kind === 'person') {
        this.view.people?.mischiefTap?.(hit.id);
        this.inspectPerson(hit.id);
        return;
      }
      if (hit?.kind === 'water' || hit?.kind === 'sand') {
        this.view.water?.tap(hit);
        return;
      }
      this.selectSafely(selection);
    });

    window.addEventListener('keydown', (event) => {
      // Browser and OS shortcuts must not spend game actions or move the camera.
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      this.view.rig.cancelInertia();
      // event.target is `window` for synthetic events, and window has no .matches —
      // calling it unguarded throws and kills every keyboard shortcut at once.
      const target = event.target;
      if (target instanceof HTMLElement && target.matches('input, textarea, [contenteditable]')) return;
      if (this.settlementPresenter?.isOpen) return;
      if (isModalOpen()) return;   // the dialog owns the keyboard while it is open
      const key = event.key.toLowerCase();
      if (key === 'escape') {
        if (this.tool === 'demolish') { this.disarmDemolishTool(); return; }
        if (this.script?.open) { this.script.close(); return; }
        if (this.rush?.open) { this.rush.close(); return; }
        this.select(null);
        return;
      }
      if (key === 'h' || key === '?') { this.showHelp(); return; }
      if (key === 'm') { this.toggleMute(); return; }
      if (key === 'f') { this.view.rig.frameAll(); return; }
      if (key === 'n') { this.view.rig.resetNorth(); return; }
      if (key === 'q') { this.view.rig.orbitBy(-45); return; }
      if (key === 'e') { this.view.rig.orbitBy(45); return; }
      if (key === '+' || key === '=') { this.view.rig.zoomBy(0.82); return; }
      if (key === '-' || key === '_') { this.view.rig.zoomBy(1.22); return; }
      if (key === 'r') { this.gotoRivalTarget(); return; }
      if (key === 'p') { this.cyclePerson(event.shiftKey ? -1 : 1); return; }
      if (key === 'enter') {
        // A held Enter repeats keydown, and on a focused Settle (or its card proxy) repeats the native click: a repeat would
        // confirm Settle's own warning, so it is dropped on the board and on Settle. Other focused controls keep native repeats.
        if (event.repeat && (
          !(target instanceof HTMLElement)
          || !target.matches('button, a[href], select, summary, [role="button"]')
          || target.closest('[data-verb="settle"], [data-phone-proxy="settle"]')
        )) {
          event.preventDefault();
          return;
        }
        // Focused controls own native activation; an unfocused board Enter settles.
        if (target instanceof HTMLElement && target.matches('button, a[href], select, summary, [role="button"]')) return;
        event.preventDefault();
        this.trySettle();
        return;
      }
      if (key === ' ' || event.code === 'Space') {
        if (target instanceof HTMLElement && target.matches('button, a[href], select, [role="button"]')) return;
        event.preventDefault();
        if (event.repeat) return;
        if (performance.now() < this.settlementPresentingUntil) return;
        if (
          this.desk?.open
          || this.shop?.open
          || this.rush?.open
          || this.script?.open
          || this.veggie?.open
          || this.playground?.open
          || this.square?.open
        ) return;
        this.trySettle();
        return;
      }
      const verbKeys = {
        w: 'walk',
        b: 'bid',
        s: 'survey',
        j: 'hire',
        l: 'lobby',
        i: 'insure',
        k: 'lease',
        x: 'remediate',
        c: 'consolidate',
      };
      if (verbKeys[key]) {
        event.preventDefault();
        this.triggerKeyboardVerb(verbKeys[key]);
        return;
      }

      // Keyboard-only play: move the selection around the board without a pointer.
      const arrows = { arrowright: [1, 0], arrowleft: [-1, 0], arrowdown: [0, 1], arrowup: [0, -1] };
      if (arrows[key]) {
        event.preventDefault();
        if (event.shiftKey) {
          const cameraPan = {
            arrowright: [-64, 0], arrowleft: [64, 0], arrowdown: [0, -64], arrowup: [0, 64],
          };
          this.view.rig.panByScreen(...cameraPan[key]);
        } else {
          this.stepSelection(...arrows[key]);
        }
        return;
      }
      if (key === 'tab') {
        // Native focus traversal belongs to the focused UI. Canvas/body retain
        // the existing board-selection shortcut in both directions.
        if (target instanceof HTMLElement && target.closest(
          '.card, .rail, .actionbar, .statusbar, button, a[href], select, summary, [role="button"], [role="tab"], [tabindex]:not(canvas):not(body)'
        )) return;
        event.preventDefault();
        this.cycleSelection(event.shiftKey ? -1 : 1);
        return;
      }

      if (key === '1' && this.inspectedFringeId) {
        event.preventDefault();
        this.triggerKeyboardVerb('acquire');
        return;
      }
      const verbs = { 1: 'acquire', 2: 'renovate', 4: 'divest', 5: 'hold' };
      if (!RULES.redevelopButtonRetired) verbs[3] = 'redevelop';
      if (verbs[key]) { event.preventDefault(); this.dispatch(verbs[key], this.selectedParcelId); }
    });

    this.audio.setEnabled(!this.muted);
  }

  select(value) {
    this.inspectedPersonId = null;
    this.inspectedFringeId = null;
    const selection = selectionFor(this.city, value, this.state);
    if (!selection) {
      this.selection = null;
      this.root.classList.remove('has-card');
      this.card.close();
      if (this.desk?.open) this.desk.close();
      if (this.shop?.open) this.shop.close();
      if (this.script?.open) this.script.close();
      this.view.board.setSelection(null);
      this.hud.render(this.city, this.state, {
        selectedId: null,
        viewerSeatId: this.viewerSeatId(),
        tool: this.tool,
        catalogId: this.buildCatalogId,
      });
      this.updateBuildPreview();
      this.connectors?.invalidate();
      return;
    }
    this.selection = selection;
    this.root.classList.add('has-card');
    this.view.board.setSelection(selection);
    this.card.show(this.city, this.state, selection, this.viewerSeatId());
    if (this.desk?.open) this.desk.close();
    if (this.shop?.open) this.shop.close();
    if (this.script?.open) this.script.close();
    this.hud.render(this.city, this.state, {
      selectedId: this.selectedId,
      viewerSeatId: this.viewerSeatId(),
      tool: this.tool,
      catalogId: this.buildCatalogId,
    });
    this.updateBuildPreview();
    this.audio.play('select');
    this.connectors?.invalidate();
  }

  openDesk(venueId = null) {
    const venue = stockExchangeOnBoard(this.city);
    const id = venueId ?? venue?.id;
    if (!id) {
      this.hud.toast('No Stock Exchange on this city.', 'reject');
      return;
    }
    this.root.classList.add('has-desk');
    this.desk.show(this.city, this.state, id);
  }

  visitVenue(venueId) {
    const action = { type: 'visit-venue', venueId };
    if (this.online) { this.submitOnline(action); return false; }
    if (this.hotseat) {
      const result = this.hotseat.stage(action);
      return !result.rejected;
    }
    const result = applyAction(this.city, this.state, action);
    this.acceptReducerResult(result, action.type, action);
    return !result.rejected;
  }

  openShop(_venueId = null) {
    const strip = supermarketOnBoard(this.city);
    if (!strip) {
      this.hud.toast('No supermarket on this city.', 'reject');
      return;
    }
    if (this.shop?.open) return;
    if (!this.visitVenue(strip.id)) return;
    if (this.desk?.open) this.desk.close();
    if (this.script?.open) this.script.close();
    this.root.classList.add('has-shop');
    this.shop.show(this.city, this.state);
  }

  openRush() {
    if (this.rush?.open) return;
    if (!this.visitVenue('ice-cream-rush')) return;
    if (this.desk?.open) this.desk.close();
    if (this.shop?.open) this.shop.close();
    if (this.script?.open) this.script.close();
    this._closeMinigames();
    this.root.classList.add('has-rush');
    this.rush.show(this.city, this.state, this.seed ?? 0);
  }

  /**
   * V3.70 L7. The three new overlays close each other and the older ones. Kept as its own method
   * rather than extending each `openX` by hand, because the existing four already differ in which
   * siblings they close and adding three lines to each is how that drifts further apart.
   */
  _closeMinigames() {
    if (this.veggie?.open) this.veggie.close();
    if (this.playground?.open) this.playground.close();
    if (this.square?.open) this.square.close();
  }

  openVeggie(coreId = null) {
    const core = coreId ? { id: coreId } : communityGardenOnBoard(this.city);
    if (!core) { this.hud.toast('No community garden on this city.', 'reject'); return; }
    if (this.veggie?.open) return;
    if (!this.visitVenue(core.id)) return;
    if (this.desk?.open) this.desk.close();
    if (this.shop?.open) this.shop.close();
    if (this.rush?.open) this.rush.close();
    if (this.script?.open) this.script.close();
    this._closeMinigames();
    this.root.classList.add('has-veggie');
    this.veggie.show(this.city, this.state, this.seed ?? 0, core.id);
  }

  openPlayground(coreId = null) {
    const core = coreId ? { id: coreId } : playgroundOnBoard(this.city);
    if (!core) { this.hud.toast('No playground on this city.', 'reject'); return; }
    if (this.playground?.open) return;
    if (!this.visitVenue(core.id)) return;
    if (this.desk?.open) this.desk.close();
    if (this.shop?.open) this.shop.close();
    if (this.rush?.open) this.rush.close();
    if (this.script?.open) this.script.close();
    this._closeMinigames();
    this.root.classList.add('has-playground');
    this.playground.show(this.city, this.state, this.seed ?? 0, core.id);
  }

  openSquare(coreId = null) {
    const core = coreId ? { id: coreId } : pocketParkOnBoard(this.city);
    if (!core) { this.hud.toast('No pocket park on this city.', 'reject'); return; }
    if (this.square?.open) return;
    if (!this.visitVenue(core.id)) return;
    if (this.desk?.open) this.desk.close();
    if (this.shop?.open) this.shop.close();
    if (this.rush?.open) this.rush.close();
    if (this.script?.open) this.script.close();
    this._closeMinigames();
    this.root.classList.add('has-square');
    this.square.show(this.city, this.state, this.seed ?? 0, core.id, new Date());
  }

  openScript() {
    const venue = remandOnBoard(this.city);
    if (!venue) {
      this.hud.toast('No remand centre on this city.', 'reject');
      return;
    }
    if (this.script?.open) return;
    if (!this.visitVenue(venue.id)) return;
    if (this.desk?.open) this.desk.close();
    if (this.shop?.open) this.shop.close();
    if (this.rush?.open) this.rush.close();
    this.card.close();
    this.root.classList.remove('has-card');
    this.root.classList.add('has-script');
    this.script.show(this.city, this.state, this.seed ?? 0);
  }

  inspectPerson(personId) {
    const person = this.state.people?.byId?.[personId];
    if (!person) return false;
    this._armFreshSheetSeat(false);
    this.inspectedFringeId = null;
    this.inspectedPersonId = personId;
    this.root.classList.add('has-card');
    const world = this.view.people.positionOf(personId);
    const shown = this.card.showPerson(
      this.city,
      this.state,
      personId,
      this.viewerSeatId(),
    );
    // The cassette must exist before its fixed seat defines the remaining board plate.
    // Measure that plate once, then frame the person into its centre with one pan.
    if (shown && world) {
      const rect = this.visibleBoardRect();
      this.framePointInVisibleBoard(world, { kind: 'person', id: personId }, rect, true);
    }
    this.connectors.invalidate();
    this.audio.play('select');
    return shown;
  }

  selectUnit(unitId, { order = 'select' } = {}) {
    this.selectedUnitId = unitId || null;
    this.view.militaryUnits?.select(this.selectedUnitId);
    this.militaryPanel?.sync();
    if (this.selectedUnitId) {
      const rec = this.view.militaryUnits?.units?.get(this.selectedUnitId);
      if (rec) {
        this.view.rig.focus(
          { x: rec.visual.x, y: 0, z: rec.visual.z },
          { distance: 48 },
        );
      }
      const hint = order === 'move'
        ? 'Tap a block to station the unit.'
        : `${this.selectedUnitId} selected.`;
      this.hud.toast(hint, 'good');
      this.audio.play('select');
    }
    return Boolean(this.selectedUnitId);
  }

  buildWarship() {
    if (!cityPersistencePolicy(location.search).allowPersistentRepairs) {
      this.hud.toast('Campaign building is unavailable in a preview.', 'reject');
      return;
    }
    try {
      const result = runCityCampaignMutation({ search: location.search, store: worldStore }, (storage) => {
        const inspected = inspectWorldRun(storage.get(WORLD_RUN_KEY));
        if (inspected.status !== 'valid' || !inspected.world) return { ok: false, reason: 'The globe is dark.' };
        return raiseAndStoreForce(inspected.world, 'navy', storage);
      });
      if (!result.ok) {
        this.hud.toast(result.reason ?? 'Cannot lay a hull.', 'reject');
        this.audio.play('reject');
        return;
      }
      this.hud.toast('Warship laid at the yard.', 'good');
      this.audio.play('select');
      if (this.inspectedFringeId === 'port') {
        this.card.showFringe(this.state, 'port', { focus: this._fringeFocus });
      }
    } catch (error) {
      this.hud.toast(error.message ?? 'Cannot lay a hull.', 'reject');
      this.audio.play('reject');
    }
  }

  inspectFringe(fringeId) {
    this.inspectedPersonId = null;
    this.inspectedFringeId = fringeId;
    this.root.classList.add('has-card');
    const shown = this.card.showFringe(this.state, fringeId, { focus: this._fringeFocus });
    if (!shown) {
      this.inspectedFringeId = null;
      if (!this.selection) this.root.classList.remove('has-card');
      return false;
    }
    this.connectors.invalidate();
    this.audio.play('select');
    return true;
  }

  cyclePerson(direction = 1) {
    const ids = [...(this.state.people?.order ?? [])].sort();
    if (!ids.length) {
      this.hud.toast('No people are on the board this quarter.', 'reject');
      return false;
    }
    const current = this.inspectedPersonId ? ids.indexOf(this.inspectedPersonId) : -1;
    const nextIndex = current < 0
      ? (direction > 0 ? 0 : ids.length - 1)
      : (current + direction + ids.length) % ids.length;
    return this.inspectPerson(ids[nextIndex]);
  }

  focusSelection() {
    const point = this.view.worldOf(this.selection);
    if (point) {
      this.view.rig.focus(point, { distance: selectionFocusDistance(this.selection) });
    }
  }

  /** Reveal every parcel covered by a persisted family-demand receipt, then use the
   * established cassette-aware focus path to frame the complete block at its centroid. */
  focusFamilySignal(blockIds = []) {
    const wanted = new Set(blockIds.map(String));
    const points = [...activeOrder(this.city, this.state)].sort()
      .map((id) => activeParcel(this.city, this.state, id))
      .filter((parcel) => parcel && wanted.has(`${parcel.bx},${parcel.bz}`))
      .map((parcel) => ({
        parcel,
        point: this.view.worldOf({ kind: 'parcel', id: parcel.id }),
      }))
      .filter(({ point }) => Boolean(point));
    if (!points.length) {
      this.hud.toast('Those family-signal parcels are no longer active.', 'reject');
      return false;
    }
    for (const { point } of points) {
      this.view.vfx.ring(point, { colour: '#e9b45a', radius: 10, duration: 2.4 });
    }
    const centre = points.reduce(
      (sum, { point }) => sum.add(point),
      new THREE.Vector3(),
    ).multiplyScalar(1 / points.length);
    this.framePointInVisibleBoard(
      centre,
      { kind: 'parcel' },
      this.visibleBoardRect(),
      true,
      true,
    );
    this.hud.toast(
      `Family signal · ${points.length} parcel${points.length === 1 ? '' : 's'} highlighted`,
      'good',
    );
    return true;
  }

  /** Wave L district sockets and headers share Wave K's ring + centroid camera path. */
  focusDistrictSignal({
    kind = 'parcels', targetIds = [], candidateParcelIds = [], blockIds = [], homeBlockId = null,
  } = {}) {
    const wantedBlocks = new Set(blockIds.map(String));
    const targets = kind === 'blocks'
      ? [...activeOrder(this.city, this.state)].sort().filter((id) => {
        const parcel = activeParcel(this.city, this.state, id);
        return parcel && wantedBlocks.has(`${parcel.bx},${parcel.bz}`);
      })
      : (targetIds.length ? targetIds : candidateParcelIds);
    const candidate = !targetIds.length && candidateParcelIds.length > 0;
    const points = targets.map((id) => {
      const selection = selectionFor(this.city, id, this.state);
      const core = selection ? null : this.city.blockCores?.find((entry) => entry.id === id);
      const point = selection
        ? this.view.worldOf(selection)
        : core?.centre
          ? new THREE.Vector3(core.centre.x, core.centre.y ?? 0.12, core.centre.z)
          : null;
      return { id, point };
    }).filter(({ point }) => Boolean(point));
    if (!points.length && kind !== 'blocks' && blockIds.length) {
      return this.focusDistrictSignal({ kind: 'blocks', blockIds });
    }
    if (!points.length) {
      this.hud.toast('No current parcel can carry that district socket.', 'reject');
      return false;
    }
    const colour = kind === 'blocks' ? '#65c7ca' : candidate ? '#e9b45a' : '#7bd7b2';
    for (const { point } of points) {
      this.view.vfx.ring(point, { colour, radius: 10, duration: 2.4 });
    }
    // A district header tap shades the HOME block gold — adjacents get rings only,
    // matching the block+adjacent mechanics (V3.40 D2).
    if (kind === 'blocks' && points.length) {
      const home = String(homeBlockId ?? blockIds[0] ?? '');
      const homePoints = points.filter(({ id }) => {
        const parcel = activeParcel(this.city, this.state, id);
        return parcel && `${parcel.bx},${parcel.bz}` === home;
      });
      const shadePoints = homePoints.length ? homePoints : points;
      const rect = shadePoints.reduce((acc, { point }) => ({
        minX: Math.min(acc.minX, point.x - 9), maxX: Math.max(acc.maxX, point.x + 9),
        minZ: Math.min(acc.minZ, point.z - 9), maxZ: Math.max(acc.maxZ, point.z + 9),
      }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
      this.view.vfx.shade?.(rect, { colour: '#e9b45a', duration: 3.2 });
    }
    const centre = points.reduce(
      (sum, { point }) => sum.add(point),
      new THREE.Vector3(),
    ).multiplyScalar(1 / points.length);
    this.framePointInVisibleBoard(
      centre,
      { kind: 'parcel' },
      this.visibleBoardRect(),
      true,
      true,
    );
    const label = kind === 'blocks' ? 'District footprint' : candidate ? 'Candidate parcels' : 'District socket';
    this.hud.toast(`${label} · ${points.length} highlighted`, 'good');
    return true;
  }

  /** Existing HUD/QA focus path, shared by district sockets without opening a sheet. */
  focusBoardTarget(id) {
    const point = this.view.worldOf(id);
    if (!point) return false;
    const kind = id?.kind ?? (typeof id === 'string'
      ? this.city.reserve?.id === id
        ? 'reserve'
        : this.city.civicUses.some((civic) => civic.id === id)
          ? 'civic'
          : 'parcel'
      : null);
    this.view.rig.focus(point, { distance: selectionFocusDistance(kind) });
    return true;
  }

  /** Move strategic selection on the global tile lattice. Keyboard-only play. */
  stepSelection(dx, dz) {
    const order = strategicSelectionOrder(this.city);
    if (!this.selection) { this.selectSafely(order[0]); return; }
    const entity = this.selection.kind === 'parcel'
      ? this.city.parcels[this.selection.id]
      : this.selection.kind === 'civic'
        ? this.city.civicUses.find((civic) => civic.id === this.selection.id)
        : this.city.reserve;
    const tx = this.selection.kind === 'reserve' ? 0 : entity.tx;
    const tz = this.selection.kind === 'reserve' ? 0 : entity.tz;
    let { gx, gz } = globalTile(entity.bx, entity.bz, tx, tz);
    const maxGx = this.city.blocksX * TILES_PER_BLOCK - 1;
    const maxGz = this.city.blocksZ * TILES_PER_BLOCK - 1;
    const currentKey = strategicSelectionKey(this.selection);
    for (let hop = 0; hop < TILES_PER_BLOCK * Math.max(this.city.blocksX, this.city.blocksZ); hop += 1) {
      gx += dx; gz += dz;
      if (gx < 0 || gz < 0 || gx > maxGx || gz > maxGz) return;
      const tile = fromGlobalTile(gx, gz);
      const id = parcelId(tile.bx, tile.bz, tile.tx, tile.tz);
      const next = strategicSelectionAtTile(this.city, id);
      if (next && strategicSelectionKey(next) !== currentKey) {
        this.selectSafely(next);
        return;
      }
    }
  }

  cycleSelection(direction) {
    const order = strategicSelectionOrder(this.city);
    const currentKey = strategicSelectionKey(this.selection);
    const index = currentKey
      ? order.findIndex((selection) => strategicSelectionKey(selection) === currentKey)
      : -1;
    const next = index < 0
      ? order[direction < 0 ? order.length - 1 : 0]
      : order[(index + direction + order.length) % order.length];
    this.selectSafely(next);
  }

  gotoRivalTarget() {
    const targets = disclosedRivalTargets(this.state);
    if (!targets.length) { this.hud.toast('Petridis has announced nothing to contest.'); return; }
    this.selectSafely(targets[0]);
  }

  /**
   * The rectangle of canvas the player can actually see: not the whole viewport, but
   * what is left once the status bar, the action row, the rail and — on a phone — the
   * property sheet have taken their share. Framework §6.4: the HUD never covers the
   * selected parcel.
   */
  visibleBoardRect() {
    // Phone round P1 (L1): on tall and short windows (data-phone-hud 1) the rectangle is the room the HUD leaves, from the band variables and the sheet's
    // state on <html>. On wide, and with ?phoneHud=0, it is what it always was.
    if (readLayout().phoneHud) return this.phoneBoardRect();
    const mobile = window.matchMedia('(max-width: 860px)').matches;
    const rect = {
      left: 12,
      top: mobile ? 150 : 66,
      right: window.innerWidth - 12,
      bottom: window.innerHeight - (mobile ? 128 : 92),
    };
    if (!mobile) {
      const statusElement = this.root.querySelector('.statusbar');
      const status = statusElement?.getBoundingClientRect();
      if (status?.width && status?.height && getComputedStyle(statusElement).display !== 'none') {
        rect.top = Math.max(rect.top, status.bottom + 12);
      }
    }
    const tablet = mobile && window.innerWidth >= 640;
    const auctionRail = tablet ? this.root.querySelector('.rail:has(.auction-rail)') : null;
    const auctionRect = auctionRail?.getBoundingClientRect();
    const auctionVisible = auctionRect?.width > 40 && getComputedStyle(auctionRail).display !== 'none';
    if (tablet) {
      const status = this.root.querySelector('.statusbar')?.getBoundingClientRect();
      const toolbar = this.root.querySelector('.mobile-cycle-strip')?.getBoundingClientRect();
      const actions = this.root.querySelector('.actionbar')?.getBoundingClientRect();
      rect.top = Math.max(12, (status?.bottom ?? 0) + 12, (toolbar?.bottom ?? 0) + 12);
      if (actions?.height) rect.bottom = Math.min(rect.bottom, actions.top - 12);
    }
    const cardElement = this.card?.element;
    const card = cardElement?.getBoundingClientRect();
    if (card && card.height) {
      if (tablet && !auctionVisible) {
        rect.right = Math.min(rect.right, card.left - 12);
      } else if (mobile) {
        rect.bottom = Math.min(rect.bottom, card.top - 12);
      } else {
        // Desktop has one seating plan: cassette on the left, board plate in the
        // middle, rail on the right. offsetLeft/offsetWidth measure the stable CSS
        // seat rather than the temporary scale used by the card-in animation.
        const cardEdge = cardElement.offsetLeft + cardElement.offsetWidth;
        rect.left = Math.max(rect.left, cardEdge + 12);
      }
    }
    if (window.innerWidth > 860) {
      const railElement = this.root.querySelector('.rail');
      const rail = railElement?.getBoundingClientRect();
      const railVisible = Boolean(
        railElement && getComputedStyle(railElement).display !== 'none' && rail?.width > 40,
      );
      // The 16px mill gutter is the visible edge of the board plate. The fallback
      // preserves the established 348px rail reservation before HUD mount completes.
      const railEdge = railVisible ? rail.left - 16 : window.innerWidth - 348;
      rect.right = Math.min(rect.right, railEdge);
    } else if (tablet) {
      // The tablet auction occupies the right column while its property sheet
      // sits below the remaining board. Measure both mounted surfaces.
      if (auctionVisible) {
        rect.right = Math.min(rect.right, auctionRect.left - 12);
      }
    } else if (!card) {
      // The rail only steals the top of a phone screen while no card is open — once one
      // is, the rail hides and the band above the sheet is the whole board.
      rect.top = Math.max(rect.top, 150);
    }
    return rect;
  }

  /**
   * visibleBoardRect() on the phone classes (contract section 2, ruling 8): the window less the bands (src/ui/phone-bands.css, read by src/ui/bands.js), less the
   * open sheet, which is the attribute data-phone-sheet on <html> (peek and full from the bottom edge on tall, side on the right of short), never a panel's live
   * rectangle. While no sheet has ever set that attribute (the sheet of lane L2b is not in every tree) and a card is mounted, the card is taken to stand where the
   * contract seats it, peek on tall and side on short: today's card sits at the window's top left (an aside of 520 x 100 px at 844x340), whose rectangle gives
   * no room at all. An attribute that says 'none' is believed.
   */
  phoneBoardRect() {
    refreshBands();
    const canvas = this.canvas.getBoundingClientRect();
    const w = canvas.width || window.innerWidth;
    const h = canvas.height || window.innerHeight;
    const attr = document.documentElement.dataset.phoneSheet;
    const card = attr === undefined ? this.card?.element?.getBoundingClientRect() : null;
    const sheet = seatedSheet(attr, !!(card && card.height && card.width), readLayout().layout);
    return roomRect(cachedBands(), w, h, sheet);
  }

  /** A selection seat just ran. Cleared on the next frame, so a full-to-peek queued as a microtask still sees it and a later raise does not. */
  _armFreshSheetSeat(forceFrame = false) {
    this._freshSheetSeat = true;
    this._freshSheetForce = forceFrame === true;
    cancelAnimationFrame(this._freshSheetSeatFrame);
    this._freshSheetSeatFrame = requestAnimationFrame(() => {
      this._freshSheetSeatFrame = 0;
      this._freshSheetSeat = false;
      this._freshSheetForce = false;
    });
  }

  /**
   * The open card moved between peek and full. Records are one delivery: the first old value against the attribute now is the net change,
   * and a delivery that nets to no change seats nothing. Only the tall phone layer, and only while this selection's card is the open one.
   */
  _onPhoneSheetRecords(records) {
    if (this.disposed) return;
    const layout = readLayout();
    if (!layout.phoneHud || layout.layout !== 'tall') return;
    if (!records || !records.length) return;
    const current = document.documentElement.getAttribute('data-phone-sheet');
    const oldValue = records[0].oldValue;
    const openEl = this.card?.element ?? null;
    const sameCard = openEl != null && openEl === this._phoneSheetCard;
    this._phoneSheetCard = openEl;
    if (oldValue === current) return;
    const pair = (oldValue === 'peek' && current === 'full') || (oldValue === 'full' && current === 'peek');
    if (!pair) return;
    const personOpen = !!(this.inspectedPersonId && this.card?.element?.dataset?.personId === this.inspectedPersonId);
    const selectionOpen = !!(this.selection && this.card?.isOpen?.(this.selection));
    if (!personOpen && !selectionOpen) return;
    // selectSafely seated the full room, then reselect dropped the sheet. Re-seat the peek room now, before a frame is painted.
    if (this._freshSheetSeat && oldValue === 'full' && current === 'peek') {
      cancelAnimationFrame(this._selectionResizeFrame);
      this._selectionResizeFrame = null;
      this._sheetSeatEase = false;
      this._sheetBringIn = false;
      this._seatOpenCardNow(this._freshSheetForce === true);
      return;
    }
    // A close is full, then none, then the selection's card back at peek: one delivery, a different element. That is not a lower.
    const peekFullOnly = records.every((record) => record.oldValue === 'peek' || record.oldValue === 'full');
    if (!peekFullOnly || !sameCard) return;
    // A raise during a gesture or inertia seats nothing now and nothing later: do not queue the resize frame.
    if (!this.view.rig.canAutoFrame()) return;
    const easeOff = new URLSearchParams(location.search).get('seatEase') === '0';
    this._sheetSeatEase = !easeOff && !this.view.rig.reducedMotion;
    // A hidden reserve is brought into the room on a raise or a lower only. The pan itself is the same function on every phone seat.
    this._sheetBringIn = true;
    this._onSelectionResize();
  }

  /** The same seat as the resize frame, run inside the sheet callback so the peek room is what gets painted. */
  _seatOpenCardNow(forceFrame = false) {
    if (this.disposed || !this.root.classList.contains('has-card')) return;
    if (!forceFrame && !this.view.rig.canAutoFrame()) return;
    if (!classFlipPending()) {
      if (this.inspectedPersonId && this.card.element?.dataset.personId === this.inspectedPersonId) {
        const point = this.view.people.positionOf(this.inspectedPersonId);
        if (point) this.framePointInVisibleBoard(point, { kind: 'person', id: this.inspectedPersonId }, this.visibleBoardRect(), true, forceFrame);
      } else if (this.selection && this.card.isOpen(this.selection)) {
        this.keepSelectionVisible(this.visibleBoardRect(), forceFrame);
      }
    }
    this.connectors.invalidate();
  }

  /** Select, then make sure the parcel is in the part of the board that is still visible. */
  selectSafely(id, { forceFrame = false } = {}) {
    // LIVE order (R4.1): mount the fixed-seat card, measure its surviving board
    // plate, then make one centre pan. Nothing may reposition the card afterwards.
    this._armFreshSheetSeat(forceFrame);
    this.select(id);
    if (!this.selection || !this.card?.isOpen(this.selection)) return;
    const rect = this.visibleBoardRect();
    this.keepSelectionVisible(rect, forceFrame);
  }

  /** `seat` is the raise's options, { ease, bring } (P2d CAM4: named; they were the third and fourth positional arguments). A selection seat passes none, so it stays instant. */
  keepSelectionVisible(rect = this.visibleBoardRect(), forceFrame = false, seat = {}) {
    this._dropPendingSheetSeat();
    if (!forceFrame && !this.view.rig.canAutoFrame()) return;
    const point = this.view.worldOf(this.selection);
    if (!point) return;
    const frameParcelCard = this.selection?.kind === 'parcel'
      && this.card?.isOpen(this.selection);
    // A raise passes the ease and the bring-in here. A selection seat does not, so it stays instant.
    this.framePointInVisibleBoard(point, this.selection, rect, frameParcelCard, forceFrame, { ease: seat?.ease === true, bring: seat?.bring === true });
  }

  /** A raise or lower frame that has not run yet. A selection seat cancels it, so the ease cannot land on the new selection. */
  _dropPendingSheetSeat() {
    if (!this._selectionResizeFrame) return;
    cancelAnimationFrame(this._selectionResizeFrame);
    this._selectionResizeFrame = null;
    this._sheetSeatEase = false;
    this._sheetBringIn = false;
  }

  /**
   * P2d CAM4: the reserve's seat distance on a bring-in, from the selection ring's footprint at its pulse peak (TILE x 0.56 x the ring's base scale x 1.05,
   * about the ring's centre) and the room, at the held azimuth and polar and the camera's field of view (phone-fit.js reserveFitDistance). `floor` is 96 m.
   */
  _reserveFitDistance(point, rect, floor) {
    const rig = this.view.rig;
    const board = this.view.board;
    const ring = board?.selectionRing?.position ?? point;
    const base = board?.selectionBaseScale ?? TILES_PER_BLOCK;
    return reserveFitDistance({
      anchor: { x: point.x, z: point.z },
      ring: { x: ring.x, z: ring.z },
      radius: TILE * 0.56 * base * PHONE_FIT.reservePulse,
      rect,
      canvas: this.view.canvas.getBoundingClientRect(),
      azimuth: rig.azimuth,
      polar: rig.polar,
      fovDeg: rig.camera?.fov,
      aspect: rig.camera?.aspect,
      floor,
      max: rig.maxDistance,
    });
  }

  /**
   * Focus a board point and pan it into the room. A parcel or person card pans on every open. A reserve pans only when it is hidden, and only on a raise or a lower.
   * `seat` is the raise's options (P2d CAM4: named; they were the sixth and seventh positional arguments): `ease` eases the camera to the instant end pose, `bring` brings a hidden
   * reserve into the room. Instance flags are not read: another seat in the same turn must stay instant.
   */
  framePointInVisibleBoard(point, selection, rect, frameCard = false, forceFrame = false, seat = {}) {
    const sheetEase = seat?.ease === true;
    const sheetBring = seat?.bring === true;
    // A synchronous seat (select, a person, a family or district signal) cancels a raise that has not reached its frame.
    if (this._selectionResizeFrame) {
      cancelAnimationFrame(this._selectionResizeFrame);
      this._selectionResizeFrame = null;
      this._sheetSeatEase = false;
      this._sheetBringIn = false;
    }
    if (!forceFrame && !this.view.rig.canAutoFrame()) return;
    const projected = projectToScreen(this.view, point);
    const hidden = !projected
      || rect.right - rect.left < 80 || rect.bottom - rect.top < 80
      || projected.x < rect.left || projected.x > rect.right
      || projected.y < rect.top || projected.y > rect.bottom;
    // Opening a cassette is itself a framing request: even when the target is
    // technically visible, a close facade is not useful board context.
    if (!hidden && !frameCard) return;

    // Focus the target on the ground, then measure where it actually projects. A
    // card-open correction is one anchored ground-plane pan to the centre
    // of the board rectangle that remains visible beside the cassette.
    const groundPoint = { x: point.x, y: 0, z: point.z };
    let distance = selectionFocusDistance(selection);
    const rig = this.view.rig;
    // P2d CAM4: a hidden reserve brought in on the tall layer (a raise, or the lower after it) stands back far enough for its ring to fit the room it is brought
    // into, never closer than its 96 m. Only under phoneHud: the wide class and ?phoneHud=0 never pass the bring-in and keep 96 m.
    if (sheetBring && selection?.kind === 'reserve' && readLayout().phoneHud) {
      distance = Math.max(distance, this._reserveFitDistance(point, rect, distance));
    }
    rig.focus(groundPoint, {
      distance,
    });
    // A hidden reserve stays on the focus pose, which looks at the canvas centre and can sit under the full sheet. A raise brings it into the room.
    if (frameCard || sheetBring) {
      // focus() sets the target pose; apply it before projectToScreen reads the camera.
      // P2b (RSZ): update(1) eases 1 - e^-9 = 99.988 % of the way, so the camera this reads still carries 0.012 % of the move from wherever it stood (4 mm for a
      // 36 m pan, 2 cm for the opening's 180 m dolly), and the pan below is measured from it: the same selection and room seated from another camera came
      // out 3e-3 m apart (the gate's portrait returns against the first portrait). On the phone classes the eased state is first set to the pose, so the seat is
      // a function of the selection and the room alone. The wide class and ?phoneHud=0 keep today's ease and the desktop pan exactly.
      // P2c item 1b: a player's raise or lower keeps that instant end pose, then puts the eased fields back so update(dt) travels there. The opening, a new
      // selection, a resize and a fold do not pass the ease. ?seatEase=0 and reduced motion never set it. The end pose is the instant seat's.
      const easeSeat = sheetEase && readLayout().phoneHud && !rig.reducedMotion;
      const held = easeSeat ? {
        x: rig.smoothTarget.x, y: rig.smoothTarget.y, z: rig.smoothTarget.z,
        distance: rig.smoothDistance, azimuth: rig.smoothAzimuth, polar: rig.smoothPolar, look: rig.smoothLookHeight,
      } : null;
      if (readLayout().phoneHud) {
        rig.smoothTarget.copy(rig.target);
        rig.smoothDistance = rig.distance;
        rig.smoothAzimuth = rig.azimuth;
        rig.smoothPolar = rig.polar;
        rig.smoothLookHeight = rig.lookHeight;
      }
      rig.update(1);
      const focused = projectToScreen(this.view, point);
      if (focused && rect.right - rect.left >= 80 && rect.bottom - rect.top >= 80) {
        const targetX = (rect.left + rect.right) / 2;
        const targetY = (rect.top + rect.bottom) / 2;
        rig.panByScreen(
          targetX - focused.x,
          targetY - focused.y,
          focused.x,
          focused.y,
        );
        rig.smoothTarget.copy(rig.target);
        // panByScreen moves the ground point. The seat reads the point at y = 6, so one ground pan leaves that point off the room's centre.
        // On the phone layer every seat that pans (a framing card, or a hidden reserve brought in) runs the same passes after that pan, so the
        // pose is one function of the selection and the room: the opening, a new selection, a person, a resize, a fold, a raise and a lower.
        // At most three passes. Stop at 0.5 px, or sooner when a pass gains under 0.25 px. The wide class and ?phoneHud=0 keep the single pan.
        if (readLayout().phoneHud) {
          const poseNow = () => rig._poseCamera(rig.camera, rig.smoothTarget, rig.smoothAzimuth, rig.smoothPolar, rig.smoothDistance, rig.smoothLookHeight);
          poseNow();
          for (let pass = 0; pass < 3; pass += 1) {
            const again = projectToScreen(this.view, point);
            if (!again) break;
            const dx = targetX - again.x;
            const dy = targetY - again.y;
            if (Math.hypot(dx, dy) <= 0.5) break;
            const before = Math.hypot(dx, dy);
            rig.panByScreen(dx, dy, again.x, again.y);
            rig.smoothTarget.copy(rig.target);
            poseNow();
            const afterPt = projectToScreen(this.view, point);
            const after = afterPt ? Math.hypot(targetX - afterPt.x, targetY - afterPt.y) : before;
            if (after >= before - 0.25) break;
          }
        }
      }
      if (held) {
        rig.smoothTarget.set(held.x, held.y, held.z);
        rig.smoothDistance = held.distance;
        rig.smoothAzimuth = held.azimuth;
        rig.smoothPolar = held.polar;
        rig.smoothLookHeight = held.look;
        rig.programmaticFocus = true;
      }
      // Pose what the next frame would show. The wide class keeps today's ease and is not posed here. A raise puts the old smooth fields back first,
      // so the painted camera leaves from where it stood; an instant seat is already on the end pose, with no pre-pan frame in between.
      if (readLayout().phoneHud) {
        rig._poseCamera(rig.camera, rig.smoothTarget, rig.smoothAzimuth, rig.smoothPolar, rig.smoothDistance, rig.smoothLookHeight);
      }
    }
  }

  /** Where a screen point meets the ground plane, in world metres. */
  groundPointAt(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    groundPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    groundPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    groundRay.setFromCamera(groundPointer, this.view.camera);
    const hit = new THREE.Vector3();
    return groundRay.ray.intersectPlane(groundPlane, hit) ? hit : null;
  }

  /**
   * The final quarter, ordinary quarters with unspent actions, and a due forced sale all confirm: the first press warns and
   * arms Settle for 4 s, and a second press settles. A confirm answers only the warning it was given, and a press inside
   * 350 ms of the warning (a double-click or double-tap) is ignored so the warning can be read first.
   */
  trySettle() {
    if (this.state.phase !== 'play') return;
    if (this.online) { this.submitOnline({ type: 'settle' }); return; }
    if (this.state.mode === 'hotseat') {
      this.hud.toast('Each seat commits through its private handover panel.', 'reject');
      return;
    }
    // Solo is Monopoly-style: actions apply immediately. Commit-quarter envelopes are
    // multiplayer/hotseat only. Using them for solo staged acquires without applying them
    // left holdings empty, the action counter frozen, and settle feeling "random".
    const remaining = this.state.actionsRemaining;
    // The forced sale and whether it ends the run are read from settlementPreview, as the Settle control reads them.
    const settle = settleButtonState(this.city, this.state);
    const finalWarning = settleConfirmWarning(this.state, remaining, {
      forcedSaleParcelId: settle.forcedSaleParcelId,
      endsRun: settle.forcedSaleEndsRun,
    });
    const now = performance.now();
    if (this.settleArmed && finalWarning !== this.settleArmedWarning) this.disarmSettle();
    if (finalWarning && !this.settleArmed) {
      this.settleArmed = true;
      this.settleArmedWarning = finalWarning;
      this.settleArmedAt = now;
      this.hud.toast(finalWarning, 'reject');
      this.hud.markSettleArmed?.(true);
      clearTimeout(this.settleArmTimer);
      this.settleArmTimer = setTimeout(() => this.disarmSettle(), 4000);
      return;
    }
    if (finalWarning && now - this.settleArmedAt < 350) return;
    this.disarmSettle();
    this.dispatch('settle', null);
  }

  /** Puts Settle back to its first press: the timer, the flag, the warning it answered and the Confirm label. */
  disarmSettle() {
    clearTimeout(this.settleArmTimer);
    this.settleArmTimer = null;
    this.settleArmed = false;
    this.settleArmedWarning = null;
    this.hud?.markSettleArmed?.(false);
  }

  /**
   * Letter shortcuts activate the same rendered control as pointer/touch input. This
   * keeps variant choice, selected target and rejection copy in one UI path; the
   * control still dispatches through applyAction and the action log.
   */
  triggerKeyboardVerb(family) {
    const selector = `[data-verb-family="${family}"]`;
    const cardButtons = [...(this.card.element?.querySelectorAll(selector) ?? [])];
    const barButtons = [...this.hud.actionbar.querySelectorAll(selector)];
    const buttons = [...cardButtons, ...barButtons];
    const visible = buttons.filter((button) => button.getClientRects().length > 0);
    const enabled = visible.find((button) => !button.disabled);
    if (enabled) {
      enabled.click();
      return true;
    }
    const unavailable = visible[0] ?? buttons[0];
    const reason = unavailable?.dataset.reason
      ?? `${family.replace(/-/g, ' ')} is not available for the current selection.`;
    this.hud.toast(reason, 'reject');
    this.audio.play('reject');
    return false;
  }

  dispatch(verb, parcelId = this.selectedParcelId, extra = null) {
    if (this.settlementPresenter?.isOpen) return;
    this.audio.unlock();
    if (verb === 'new-run') {
      this.hud.showResult(this.city, this.state, this.overlayHost);
      return;
    }
    if (verb && typeof verb === 'object') {
      if (verb.type === 'settle') {
        this.trySettle();
        return;
      }
      if (verb.type === 'build-warship') {
        this.buildWarship();
        return;
      }
      if (this.state.phase !== 'play') {
        // COPY-DRAFT: name the action available after the result sheet closes.
        this.hud.toast('The run is over. Choose New run to replay this seed or start a New District.', 'reject');
        return;
      }
      if (this.online) { this.submitOnline(verb); return; }
      if (this.hotseat && ['BUY_CAB', 'IMPORT_CAB', 'SERVICE_CAB', 'PATCH_SOFTWARE', 'DISMISS_INCIDENT',
        'UPGRADE_DEPOT', 'UPGRADE_CAB_BOOK', 'SET_CAB_DISPATCH', 'RUN_CAB_SHIFT'].includes(verb.type)) {
        this.hotseat.stage(verb); return;
      }
      const result = applyAction(this.city, this.state, verb);
      this.acceptReducerResult(result, verb.type, verb);
      return;
    }
    if (verb === 'demolish') {
      if (this.state.phase !== 'play') {
        // COPY-DRAFT: name the action available after the result sheet closes.
        this.hud.toast('The run is over. Choose New run to replay this seed or start a New District.', 'reject');
        return;
      }
      this.armDemolishTool();
      return;
    }
    if (verb === 'redevelop' && RULES.redevelopButtonRetired) {
      this.hud.toast('Choose BUILD on a cleared pad.', 'reject');
      return;
    }
    if (verb === 'open-desk') {
      this.openDesk(parcelId);
      return;
    }
    if (verb === 'open-shop') {
      this.openShop(parcelId);
      return;
    }
    if (verb === 'open-script') {
      this.openScript();
      return;
    }
    if (verb === 'build-warship') {
      this.buildWarship();
      return;
    }
    if (this.state.phase !== 'play') {
      // COPY-DRAFT: name the action available after the result sheet closes.
      this.hud.toast('The run is over. Choose New run to replay this seed or start a New District.', 'reject');
      return;
    }
    if (
      verb !== 'settle'
      && verb !== 'hold'
      && !verb.startsWith('reserve-improve:')
      && !parcelId
    ) {
      this.hud.toast('Pick a parcel first.', 'reject');
      this.audio.play('reject');
      return;
    }

    let action;
    if (verb === 'settle' || verb === 'hold') {
      action = { type: verb };
    } else if (verb === 'walk-person') {
      action = {
        type: 'walk',
        avatarId: 'player',
        destination: { kind: 'person', id: parcelId },
        purchase: null,
        brokerChoice: null,
      };
    } else if (verb.startsWith('broker-accept:')) {
      // Finance consultant: walk-to-person with brokerChoice after meet.
      const choice = verb.slice('broker-accept:'.length);
      action = {
        type: 'walk',
        avatarId: 'player',
        destination: { kind: 'person', id: parcelId },
        purchase: null,
        brokerChoice: choice,
      };
    } else if (verb.startsWith('hire:')) {
      // Builder / design consultant: hire:profession:brief:parcelId · personId is parcelId arg.
      const [, profession, brief, targetParcelId] = verb.split(':');
      action = {
        type: 'hire',
        avatarId: 'player',
        parcelId: targetParcelId,
        personId: parcelId,
        profession,
        brief,
      };
    } else if (verb.startsWith('send-crew:')) {
      const targetParcelId = verb.slice('send-crew:'.length);
      action = { type: 'send-crew', avatarId: 'player', personId: parcelId, parcelId: targetParcelId };
    } else if (verb.startsWith('trade:')) {
      // Stock Exchange: trade:ASSET:buy|sell:units · venue civic id is parcelId arg.
      const [, assetId, side, unitsRaw] = verb.split(':');
      action = {
        type: 'trade',
        assetId,
        side,
        units: Number(unitsRaw),
        venueId: parcelId,
      };
    } else if (verb === 'lobby' || verb.startsWith('lobby:')) {
      const permitLevel = verb.startsWith('lobby:')
        ? Number(verb.slice('lobby:'.length))
        : undefined;
      action = {
        type: 'lobby',
        avatarId: 'player',
        parcelId,
        ...(Number.isFinite(permitLevel) && permitLevel > 0 ? { permitLevel } : {}),
      };
    } else if (verb === 'merge' || verb === 'consolidate' || verb.startsWith('consolidate:')) {
      const partnerId = verb.startsWith('consolidate:')
        ? verb.slice('consolidate:'.length)
        : '';
      action = {
        type: 'consolidate',
        parcelId,
        parcelIds: partnerId ? [parcelId, partnerId].sort() : undefined,
      };
    } else if (verb.startsWith('reserve-improve:')) {
      action = {
        type: 'reserve-improve',
        catalogId: verb.slice('reserve-improve:'.length),
      };
    } else if (verb === 'walk-civic') {
      action = {
        type: 'walk',
        avatarId: 'player',
        destination: { kind: 'civic', id: parcelId },
        purchase: null,
        brokerChoice: null,
      };
    } else if (verb === 'walk') {
      action = {
        type: 'walk',
        avatarId: 'player',
        destination: { kind: 'parcel', id: parcelId },
        purchase: null,
        brokerChoice: null,
      };
    } else if (verb.startsWith('walk-purchase:')) {
      action = {
        type: 'walk',
        avatarId: 'player',
        destination: { kind: 'parcel', id: parcelId },
        purchase: verb.slice('walk-purchase:'.length),
        brokerChoice: null,
      };
    } else if (verb.startsWith('bid:')) {
      const auction = [...this.state.events.order].sort()
        .map((id) => this.state.events.byId[id])
        .find((event) =>
          event.type === 'auction'
          && event.anchorIds.includes(parcelId)
          && event.resolveQuarter === this.state.quarter
          && event.status !== 'resolved'
          && event.status !== 'cancelled');
      action = {
        type: 'bid',
        avatarId: 'player',
        eventId: auction?.id ?? '',
        maxBid: Number(verb.slice(4)),
      };
    } else if (verb.startsWith('insure:')) {
      action = { type: 'insure', parcelId, cover: verb.slice(7) };
    } else if (verb.startsWith('lease:')) {
      action = { type: 'lease', parcelId, tenantQuality: verb.slice(6) };
    } else if (verb === 'renovate-room' || verb.startsWith('renovate-room:')) {
      // Card may pass bare verb + extra, or encoded renovate-room:roomId:finish.
      let roomId = extra?.roomId ?? null;
      let finish = extra?.finish ?? null;
      if (verb.startsWith('renovate-room:')) {
        const parts = verb.split(':');
        roomId = parts[1] || roomId;
        finish = parts[2] || finish;
      }
      action = {
        type: 'renovate-room',
        parcelId,
        roomId,
        finish,
      };
    } else if (verb === 'place-building') {
      action = {
        type: 'place-building',
        parcelId,
        catalogId: extra?.catalogId ?? this.buildCatalogId,
      };
    } else if (verb === 'redevelop' && extra?.catalogId) {
      action = {
        type: 'redevelop',
        parcelId,
        catalogId: extra.catalogId,
      };
    } else if (verb === 'redevelop:notice' || verb === 'redevelop:buyout') {
      action = {
        type: verb,
        parcelId,
        tenantExit: verb === 'redevelop:notice' ? 'notice' : 'buyout',
      };
    } else {
      action = { type: verb, parcelId };
    }

    if (this.online) { this.submitOnline(action); return; }
    if (this.hotseat && verb !== 'settle') {
      const seatId = this.hotseat.activeSeatId;
      if (action.avatarId === 'player') action.avatarId = seatId;
      if (action.type === 'hold') {
        action.reason = 'chosen';
        action.bankRequested = true;
      }
      this.hotseat.stage(action);
      return;
    }

    // Solo: apply immediately through the legacy reducer so cash, holdings, and the
    // action counter update on every verb (same path as core tests). Seat-action
    // envelopes only *queue* into quarterCommit and must not be used for solo play —
    // that left acquires staged-but-unapplied (counter stuck, property not owned).
    if (this.state.mode === 'solo' && verb !== 'settle') {
      if (action.type === 'hold') {
        action.reason = 'chosen';
        action.bankRequested = true;
      }
      // Keep avatarId as 'player' for the solo avatar map (do not remap to P1).
      const result = applyAction(this.city, this.state, action);
      this.acceptReducerResult(result, verb, action);
      return;
    }

    const result = applyAction(this.city, this.state, action);
    this.acceptReducerResult(result, verb, action);
  }

  async submitOnline(action) {
    if (!this.online || this.disposed) return;
    if (CYBERCAB_PRESENTATION_ACTIONS.includes(action.type)) {
      const context = cybercabContext(this.city);
      const result = reduceCybercabPresentation(context.state ?? this.state, action);
      if (!result.rejected) context.state = result.state;
      return;
    }
    if (this._onlineBusy) return;
    this._onlineBusy = true; this.onlineUI?.setBusy(true);
    try {
      if (action.type === 'settle') await this.online.commit();
      else {
        const input = { ...action };
        if (input.avatarId === 'player') input.avatarId = this.online.seatId;
        if (input.type === 'hold') { input.reason = 'chosen'; input.bankRequested = true; }
        await this.online.stage(input);
        if (this.disposed) return;
        this.hud.toast('Move added to your private plan. Commit when ready.');
      }
    } catch (error) {
      if (this.disposed) return;
      this.onlineUI?.error(error); this.hud.toast(error.message || 'The server could not accept that move.', 'reject');
    } finally { this._onlineBusy = false; if (!this.disposed) this.onlineUI?.setBusy(false); }
  }

  acceptReducerResult(result, verb = '', action = null) {
    if (result.rejected) {
      this.hud.toast(canonicalReducerReason(result.events[0].reason), 'reject');
      this.audio.play('reject');
      return;
    }

    const prevQuarter = this.state.quarter;
    this.state = result.state;
    const settleEvent = (result.events ?? []).some((event) => event.kind === 'settle');
    // An accepted move changes what an armed Settle would throw away, so the next press warns again. The crossing accident is
    // the traffic simulation, not the player's move (trySettle still re-warns if it changed the consequence).
    if (this.settleArmed && verb !== 'settle' && verb !== 'crossing-accident' && !settleEvent) this.disarmSettle();
    if (verb === 'settle' || settleEvent) {
      // Phone round P2a (B): the pose Settle was pressed at, before this result moves anything (null off the phone classes).
      if (!this.settlementPresenter?.isOpen) this._settlePose = this.phoneFit?.holdPose() ?? null;
      this.settlementPresentingUntil = Infinity;
    }
    if (!this.online && cityPersistencePolicy(location.search).allowPersistentRepairs
      && shouldWriteCityExports(verb, prevQuarter, this.state.quarter, result.events)) {
      // A settle that is the new run's first save must not append to the previous run's queue.
      if (!this.runSaved) {
        this._cityExportsWritten = true;
        if (!result.settlementExportsCommitted) clearCityExports(store);
      }
      let added = result.exportNotices ?? [];
      if (!result.settlementExportsCommitted) {
        const logBefore = this.state.log?.length ?? 0;
        const wrote = writeCityExports(this.city, this.state, store);
        if (wrote) advanceWorldOnCitySettle();
        added = (this.state.log ?? []).slice(logBefore);
      }
      for (const row of added) {
        if (row?.type === 'exports-lapse' && row.body) this.hud.toast(row.body);
      }
    }
    const meeting = meetingResultFocus(result, action);
    const actedPersonId = meeting?.personId ?? null;
    const meetEvent = meeting?.event;
    const actedPersonDespawned = meeting?.despawned ?? false;
    if (actedPersonId) {
      this.inspectedPersonId = actedPersonDespawned ? null : actedPersonId;
    }
    this._meetResultOnCard = Boolean(meetEvent && !actedPersonDespawned);
    this._meetResultPersonId = this._meetResultOnCard ? actedPersonId : null;
    this._followParcelId = null;
    for (const event of result.events) this.handleEvent(event);
    this._meetResultOnCard = false;
    this._meetResultPersonId = null;

    this.view.syncState(this.state, this.viewerSeatId());
    if (this._followParcelId && activeParcel(this.city, this.state, this._followParcelId)) {
      this.selection = { kind: 'parcel', id: this._followParcelId };
      this.view.board.setSelection(this.selection);
      const followPoint = this.view.worldOf(this.selection);
      if (followPoint) {
        this.view.vfx.ring(followPoint, { colour: '#c4a574', radius: 16 });
        this.view.vfx.burst?.(followPoint);
      }
    }
    this._followParcelId = null;
    this.hud.render(this.city, this.state, {
      selectedId: this.selectedId,
      viewerSeatId: this.viewerSeatId(),
      tool: this.tool,
      catalogId: this.buildCatalogId,
    });
    if (this.tool !== 'demolish') this.updateBuildPreview();
    if (this.inspectedFringeId) {
      const shown = this.card.showFringe(this.state, this.inspectedFringeId, {
        focus: this._fringeFocus,
      });
      if (!shown) this.inspectedFringeId = null;
    } else if (this.inspectedPersonId && this.state.people.byId[this.inspectedPersonId]) {
      this.card.showPerson(
        this.city,
        this.state,
        this.inspectedPersonId,
        this.viewerSeatId(),
      );
    } else if (this.selection && !this.shop?.open) {
      this.inspectedPersonId = null;
      this.card.show(this.city, this.state, this.selection, this.viewerSeatId());
    } else if (actedPersonDespawned) {
      this.card.close();
      this.root.classList.remove('has-card');
    }
    if (this.desk?.open) this.desk.update(this.city, this.state);
    if (this.shop?.open) this.shop.update(this.city, this.state);
    if (this.script?.open) this.script.update(this.city, this.state);
    this.connectors.invalidate();
    // A crossing accident comes from the traffic simulation, not the player: on a new run it
    // waits for the first accepted action, whose save carries it.
    if (verb !== 'crossing-accident' || this.runSaved) {
      this.save();
      this.runSaved = true;
    }

    if (this.state.phase === 'result') {
      const result = runResult(this.city, this.state);
      this.audio.play(result.playerNav > result.rivalNav ? 'win' : 'lose');
      if (this.settlementPresenter.isOpen) this.pendingResult = true;
      else setTimeout(() => this.hud.showResult(this.city, this.state, this.overlayHost), 700);
    }
  }

  handleEvent(event) {
    const fmt = (value) => signedMoney(value, { plus: false });
    const point = event.parcelId ? this.view.worldOf(event.parcelId) : null;
    // Meet intel lives on the person card. Three vanishing toasts were the whole record.
    if (this._meetResultOnCard && event.personId === this._meetResultPersonId && (
      event.kind === 'rival-disclosure'
      || event.kind === 'hire-candidate'
      || event.kind === 'contact'
      || event.kind === 'broker-intel'
      || event.kind === 'family-signal'
      || event.kind === 'patrol-intel'
      || event.kind === 'fire-warning'
      || event.kind === 'occupation-warning'
      || event.kind === 'dog-find-pending'
      || event.kind === 'dog-find'
    )) {
      this.audio.play(
        event.kind === 'fire-warning' || event.kind === 'occupation-warning'
          ? 'reject'
          : 'select',
      );
      return;
    }
    switch (event.kind) {
      case 'acquire':
        this.audio.play('acquire');
        if (point) { this.view.vfx.ring(point, { colour: '#d8a24a', radius: 14 }); this.view.vfx.burst(point); }
        this.hud.toast(
          pickMessage(TOAST_MESSAGES.acquired, event.parcelId)
          + ` — ${event.parcelId.toUpperCase()} · ${fmt(event.quote.cashOut)} cash out`
          + ` · ${this.state.actionsRemaining} actions left`,
          'good',
        );
        break;
      case 'tenant-notice':
        this.audio.play('select');
        if (point) this.view.vfx.ring(point, { colour: '#d8a24a', radius: 10 });
        this.hud.toast(
          `NOTICE SERVED · ${event.parcelId.toUpperCase()} · ${fmt(event.amount)} paid · vacant after one quarter`,
          'good',
        );
        break;
      case 'tenant-buyout':
        this.audio.play('acquire');
        if (point) this.view.vfx.ring(point, { colour: '#d8a24a', radius: 10 });
        this.hud.toast(
          `TENANT BOUGHT OUT · ${event.parcelId.toUpperCase()} · ${fmt(event.amount)} paid · vacant now`,
          'good',
        );
        break;
      case 'demolish-strike':
        this.audio.play('reject');
        this.view.board.pulseDemolitionStrike(event.parcelId, event.strikes, event.total);
        if (point) {
          if (event.cleared) {
            this.view.board.beginDemolition(event.parcelId, event.fromArchetype);
          }
          this.view.vfx.demolition(point, {
            seed: this.city.seed,
            eventId: `demolish-strike:${event.parcelId}:${event.strikes}`,
            colour: '#a9977c',
            radius: event.cleared ? 12 : 4.5,
            height: event.cleared ? 5.5 : 2.2,
            intensity: event.cleared ? 1 : 0.22,
          });
        }
        this.hud.demolitionToast(event);
        break;
      case 'renovate':
        this.audio.play('renovate');
        if (point) {
          this.view.vfx.construction(point, {
            seed: this.city.seed,
            eventId: `renovate:${event.parcelId}:q${this.state.quarter}`,
            intensity: 0.45,
            radius: 10,
            height: 2.8,
          });
        }
        this.hud.toast(
          pickMessage(TOAST_MESSAGES.renovateStarted, event.parcelId)
          + ` — ${event.parcelId.toUpperCase()} · ${fmt(event.quote.cost)}`
          + ` · ${this.state.actionsRemaining} actions left`,
          'good',
        );
        break;
      case 'redevelop':
        this.buildCatalogId = null;
        this.buildHoverParcelId = null;
        this.root.classList.remove('is-build-tool');
        this.view.board.setFootprintGhost(null);
        this.audio.play('redevelop');
        if (point) {
          this.view.board.beginDemolition(event.parcelId, event.quote.fromArchetype);
          this.view.vfx.demolition(point, {
            seed: this.city.seed,
            eventId: `redevelop:${event.parcelId}:q${this.state.quarter}`,
            colour: '#a9977c',
            radius: 12,
            height: 5.5,
          });
        }
        this.hud.toast(
          pickMessage(TOAST_MESSAGES.redevelopStarted, event.parcelId)
          + ` — ${event.parcelId.toUpperCase()} · ${fmt(event.quote.cost)}, rent $0`
          + ` · ${this.state.actionsRemaining} actions left`,
          'good',
        );
        break;
      case 'place-building':
        this.buildCatalogId = null;
        this.buildHoverParcelId = null;
        this.root.classList.remove('is-build-tool');
        this.view.board.setFootprintGhost(null);
        this.audio.play('redevelop');
        if (point) {
          this.view.vfx.construction(point, {
            seed: this.city.seed,
            eventId: `place-building:${event.parcelId}:q${this.state.quarter}`,
            intensity: 0.65,
            radius: 9,
            height: 3.5,
          });
        }
        this.hud.toast(
          `BUILD STARTED · ${event.label} · $${event.cost.toLocaleString('en-AU')}`,
          'good',
        );
        break;
      case 'surrender':
        this.audio.play('reject');
        if (point) this.view.vfx.ring(point, { colour: '#c9705a', radius: 12 });
        this.hud.toast(`Surrendered ${event.parcelId.toUpperCase()} · ${fmt(event.quote.debtCleared)} debt cleared · nothing returned`, 'reject');
        break;
      case 'divest':
        this.audio.play('divest');
        if (point) this.view.vfx.ring(point, { colour: '#c9705a', radius: 12 });
        this.hud.toast(
          event.quote?.peSale
            ? `PE exit · ${event.parcelId.toUpperCase()} · ${fmt(event.quote.proceeds)}`
            : ordinaryDivestToast(event),
        );
        break;
      case 'crossing-accident':
        this.audio.play('reject');
        this.hud.toast(
          event.deceasedEstate
            ? `Crossing accident · ${event.victimName} hospitalised · ${String(event.parcelId).toUpperCase()} estate auction −${pctText(10000 - DECEASED_ESTATE_ASK_BP)}`
            : `Crossing accident · ${event.victimName} hospitalised`,
          'reject',
        );
        this.view.cityServices?.syncState(this.state);
        if (event.parcelId) this._followParcelId = event.parcelId;
        break;
      case 'ipo':
        this.audio.play('select');
        if (point) this.view.vfx.ring(point, { colour: '#d8a24a', radius: 14 });
        this.hud.toast(
          `IPO ${event.ticker} · ${event.shares.toLocaleString()} shares @ ${fmt(event.ipoPrice)}`
          + ` · cap ${fmt(event.marketCap)}`,
          'good',
        );
        break;
      case 'corridor':
        this.audio.play('corridor');
        this.hud.toast(pickMessage(TOAST_MESSAGES.corridorFormed), 'good');
        break;
      case 'avatar-spend':
        this.view.people.showSpendToast(event);
        this.hud.toast(
          `Venue spend ${signedMoney(-Math.abs(event.amount))} · ${accessTokenLabel(event.token)} through Q${event.untilQuarter}`
          + ` · ${this.state.actionsRemaining} actions left`,
          'good',
        );
        break;
      case 'avatar-spend-skipped':
        this.hud.toast(
          event.reason === 'spending-cap'
            ? 'Venue spend blocked. Lifestyle cap reached.'
            : `Venue spend blocked. You need ${fmt(event.amount)}.`,
          'reject',
        );
        break;
      case 'civic-upgrade':
        this.hud.toast(`${event.label} · nearby parcels lift · ${signedMoney(-Math.abs(event.amount))}`, 'good');
        break;
      case 'university-donate':
        this.hud.toast(`University endowment in · campus ideas unlocked · ${signedMoney(-Math.abs(event.amount))}`, 'good');
        break;
      case 'university-fund':
        this.hud.toast(`${event.label} funded · shop automation odds up · ${signedMoney(-Math.abs(event.amount))}`, 'good');
        break;
      case 'hold':
        this.audio.play('select');
        this.hud.toast(
          event.bankRequested
            ? `Banked 1 action · ${this.state.actionsRemaining} left this quarter · +1 action next quarter`
            : `Passed · ${this.state.actionsRemaining} action${this.state.actionsRemaining === 1 ? '' : 's'} left`,
        );
        break;
      case 'survey':
        this.audio.play('select');
        this.hud.toast(
          `Surveyed ${event.parcelId.toUpperCase()} · condition & exposure recorded`
          + ` · ${this.state.actionsRemaining} action${this.state.actionsRemaining === 1 ? '' : 's'} left`,
          'good',
        );
        break;
      case 'hire': {
        this.audio.play('select');
        const name = charName(event.profession);
        const hires = this.state.holdings?.[event.parcelId]?.hires ?? {};
        const both = hires.architect && hires['cheap-builder'];
        const feeText = event.profession === 'property-agent'
          ? `${pctText(RULES.agentFeeBp)} sale fee, uplift 0–15% at sale`
          : fmt(event.amount);
        this.hud.toast(
          `${name} · ${event.parcelId.toUpperCase()} ${event.brief}${both ? ', design-build active' : ''}`
          + ` · ${feeText}, ${this.state.actionsRemaining} actions left`,
          'good',
        );
        break;
      }
      case 'send-crew':
        this.audio.play('select');
        this.hud.toast(`SENT · ${String(event.parcelId).toUpperCase()}`, 'good');
        break;
      case 'broker-offer':
      case 'broker-intel':
        this.audio.play('select');
        if (event.accepted) {
          const kind = event.offer?.kind === 'lvr' ? 'higher LVR' : 'lower interest';
          this.hud.toast(
            `Vinh's offer is active — ${kind} until Q${event.offer?.expiresAfterQuarter}.`,
            'good',
          );
        } else if (event.detail) {
          this.hud.toast(
            `Vinh · LVR ${(event.detail.lvrBp / 100).toFixed(1)}% / interest ${(event.detail.interestBp / 100).toFixed(1)}%`
            + ' · accept on his card',
            'good',
          );
        } else {
          this.hud.toast(
            'Vinh · collect a Cafe token · exact terms unlock',
            'good',
          );
        }
        break;
      case 'visit-venue':
        this.audio.play('select');
        this.hud.toast(
          `VENUE ENTERED · 1 action · ${this.state.actionsRemaining} actions left`,
          'good',
        );
        break;
      case 'renovate-room':
        this.audio.play('renovate');
        this.hud.toast(
          `${String(event.roomId ?? 'room').toUpperCase()} → ${event.finish}`
          + ` · finishes when Q${event.quote?.completionQuarter ?? '?'} settles`
          + ` · ${signedMoney(event.quote?.valueAdd ?? 0)} value, no action`,
          'good',
        );
        break;
      case 'hire-candidate': {
        this.audio.play('select');
        const metName = charName(event.profession);
        const tip = event.profession === 'architect'
          ? 'quality or two-rung brief'
          : event.profession === 'cheap-builder'
            ? 'cost brief / defect risk'
            : 'sales brief / uplift 0–15% at sale';
        this.hud.toast(
          `Met ${metName} · ${tip} · Hire (J)`,
          'good',
        );
        break;
      }
      case 'family-signal': {
        this.audio.play('select');
        const familyName = personChipName('family', this.state.people?.byId?.[event.personId]);
        const signalParcel = event.blockId
          ? [...activeOrder(this.city, this.state)].sort()
            .map((id) => activeParcel(this.city, this.state, id))
            .find((parcel) => parcel && `${parcel.bx},${parcel.bz}` === String(event.blockId))
          : null;
        this.hud.toast(
          signalParcel
            ? `${familyName} · looking at the ${signalParcel.districtName} blocks around ${signalParcel.id.toUpperCase()} · ${this.state.actionsRemaining} actions left`
            : `${familyName} · Food reveals the blocks · open People → ${familyName} for the next step · ${this.state.actionsRemaining} actions left`,
          'good',
        );
        break;
      }
      case 'patrol-intel':
        this.audio.play('select');
        this.hud.toast(
          `Draper is patrolling · arson risk softens while she is out`
          + ` · insure vulnerable holdings, ${this.state.actionsRemaining} actions left`,
          'good',
        );
        break;
      case 'fire-warning':
        this.audio.play('reject');
        this.hud.toast(
          pickMessage(TOAST_MESSAGES.fireWarning, event.parcelId)
          + ` — insure before settle · ${this.state.actionsRemaining} actions left`,
          'reject',
        );
        break;
      case 'occupation-warning':
        this.audio.play('reject');
        this.hud.toast(
          event.outcome
            ? `Possum has moved in · occupation threat live`
            + ` · remediate the vacant holding, ${this.state.actionsRemaining} actions left`
            : `Possum is circling · collect a Food token to see the target`
            + ` · ${this.state.actionsRemaining} actions left`,
          'reject',
        );
        break;
      case 'rival-disclosure': {
        this.audio.play('select');
        const move = event.firstMove;
        const tip = move?.verb
          ? `${move.verb}${move.parcelId ? ` on ${String(move.parcelId).toUpperCase()}` : ''}`
          : 'no concrete first move yet';
        this.hud.toast(
          `Petridis · next intent: ${tip}`
          + ` · bank or outbid, ${this.state.actionsRemaining} actions left`,
          'good',
        );
        break;
      }
      case 'dog-find-pending':
        this.audio.play('select');
        this.hud.toast(
          `Banjo found nothing this time · try again later`
          + ` · ${this.state.actionsRemaining} actions left`,
        );
        break;
      case 'contact':
        this.audio.play('select');
        this.hud.toast(
          `Met ${charName(event.archetypeId ?? 'someone')}`
          + ` · no new intel · ${this.state.actionsRemaining} actions left`,
        );
        break;
      case 'reserve-improve': {
        this.audio.play('select');
        // Force gift meshes onto the lawn immediately (state already applied).
        this.view.board?.syncReserveKit?.(this.state);
        // Frame the reserve so the player sees the new gift land.
        const reserveCentre = this.city.reserve?.centre;
        if (reserveCentre) {
          this.view.rig?.focus?.(reserveCentre, { distance: 96 });
          this.view.vfx?.ring?.(reserveCentre, { colour: '#6aaf5a', radius: 14 });
        }
        this.hud.toast(
          pickMessage(TOAST_MESSAGES.reserveGift, event.catalogId)
          + ` — ${event.label ?? event.catalogId} / ${fmt(event.amount)}`
          + ` · favour ${event.favour}/${event.favourMax}, no action`,
          'good',
        );
        break;
      }
      case 'lobby': {
        this.audio.play(event.success ? 'select' : 'reject');
        const chancePct = ((event.chanceBp ?? 0) / 100).toFixed(0);
        const fee = fmt(event.amount ?? permitFeeForRung(event.permitLevel ?? 1));
        // COPY-DRAFT: a use permit keeps its name; a height permit uses the shared rung.
        const isUsePermit = Boolean(event.usePermitId);
        const rungLabel = lobbyRungLabel(event);
        if (event.success) {
          this.hud.toast(
            pickMessage(TOAST_MESSAGES.lobbyPass, event.parcelId)
            + ` — ${event.parcelId.toUpperCase()} ${rungLabel} / ${fee} / ${chancePct}%`
            + ` · ${this.state.actionsRemaining} actions left`,
            'good',
          );
          if (point) {
            this.view.vfx.ring(point, { colour: '#d8a24a', radius: 12 });
            this.view.vfx.burst?.(point, { colour: '#d8a24a', count: 12, speed: 2 });
          }
        } else {
          this.hud.toast(
            pickMessage(TOAST_MESSAGES.lobbyFail, event.parcelId)
            + ` — ${event.parcelId.toUpperCase()} ${isUsePermit ? `${rungLabel} refused` : `still L${event.planningCeiling ?? 0}`} / ${fee} / ${chancePct}%`
            + ` · ${this.state.actionsRemaining} actions left`,
            'reject',
          );
        }
        break;
      }
      case 'insure':
        this.audio.play('select');
        this.hud.toast(
          pickMessage(TOAST_MESSAGES.insured, event.parcelId)
          + ` — ${event.cover} / ${event.parcelId.toUpperCase()} / ${fmt(event.amount)}`
          + ` · ${this.state.actionsRemaining} actions left`,
          'good',
        );
        break;
      case 'trade':
        this.audio.play('select');
        this.hud.toast(
          `RESULT · ${event.side === 'buy' ? 'Bought' : 'Sold'} ${event.units} ${event.assetId} @ ${fmt(event.price)}`
          + ` · NAV updated / ${this.state.actionsRemaining} actions left`,
          'good',
        );
        break;
      case 'place-order': {
        const row = this.state.markets?.orders?.find((order) => order.id === event.orderId);
        if (row?.status === 'filled') break;
        this.hud.toast(
          event.bracket
            ? `RESULT · Bracket parked on ${event.assetId}`
            : `RESULT · ${event.orderType ?? 'order'} ${event.side ?? ''} ${event.units ?? ''} ${event.assetId} working`,
          'good',
        );
        break;
      }
      case 'order-fill':
        this.hud.toast(
          `RESULT · Filled ${event.side} ${event.units} ${event.assetId} @ ${fmt(event.price)}`,
          'good',
        );
        break;
      case 'cancel-order':
        this.hud.toast(`RESULT · Cancelled ${event.assetId ?? 'order'}`, 'good');
        break;
      case 'walk': {
        // Frame the destination on the board after a successful walk.
        const dest = event.destination;
        const avatarDest = this.state.avatars?.[event.avatarId ?? 'player']?.destination;
        let focusPoint = null;
        if (avatarDest?.kind === 'person') {
          focusPoint = this.view.people?.positionOf?.(avatarDest.id) ?? null;
        } else if (dest?.kind === 'person') {
          focusPoint = this.view.people?.positionOf?.(dest.id) ?? null;
        }
        if (!focusPoint && dest) {
          if (dest.kind === 'parcel' || dest.kind === 'civic' || dest.kind === 'reserve') {
            focusPoint = this.view.worldOf(dest) ?? this.view.worldOf(dest.id) ?? null;
          } else if (dest.id) {
            focusPoint = this.view.worldOf(dest.id) ?? null;
          }
        }
        if (focusPoint) {
          const isPerson = avatarDest?.kind === 'person' || dest?.kind === 'person';
          const dist = isPerson ? 52 : dest?.kind === 'reserve' ? 96 : 72;
          this.view.rig.focus(focusPoint, { distance: dist });
        }
        this.audio.play('select');
        // If no contact/spend event follows in the same batch, still explain the walk.
        // Contact events fire separately and carry the real RESULT copy.
        if (dest?.kind === 'person' || this._meetResultOnCard) {
          // Contact result stays on the person card.
        } else {
          const label = dest?.kind === 'civic'
            ? 'civic venue'
            : dest?.kind === 'reserve'
              ? 'public reserve'
              : dest?.id
                ? String(dest.id).toUpperCase()
                : 'destination';
          this.hud.toast(
            `RESULT · Walked to ${label}`
            + ` · ${this.state.actionsRemaining} actions left`,
          );
        }
        break;
      }
      case 'remediate':
        this.audio.play('select');
        this.hud.toast(
          `Possum evicted from ${event.parcelId.toUpperCase()}`
          + ` · ${fmt(event.amount ?? RULES.remediateCost)}`
          + ` · lease next, ${this.state.actionsRemaining} actions left`,
          'good',
        );
        break;
      case 'dog-find': {
        const find = event.find;
        let message = 'Banjo found something · intel added.';
        if (find.kind === 'lost-auction-paddle') {
          message = `Banjo dug up an auction paddle · ${find.parcelId.toUpperCase()} passed-in asking ${fmt(find.askingOverride)} · use on bid.`;
        } else if (find.kind === 'builders-dropped-plans') {
          message = `Banjo found Wozza's dropped plans · next defect roll is ${find.defectBand ? 'inside' : 'outside'} band.`;
        } else if (find.kind === 'council-time-capsule') {
          message = `Banjo found a time capsule · +${find.actionsGranted ?? RULES.timeCapsuleActions} actions this quarter · “${find.motto}”`;
        } else if (find.kind === 'tram-ticket-from-nowhere') {
          message = 'Banjo found a tram ticket · blue-and-gold livery unlocked.';
        }
        this.audio.play('select');
        this.hud.toast(
          `${message} — ${this.state.actionsRemaining} actions left`,
          'good',
        );
        break;
      }
      case 'lease':
        this.audio.play('select');
        this.hud.toast(
          pickMessage(TOAST_MESSAGES.tenantPlaced)
          + ` — ${event.parcelId.toUpperCase()} · ${fmt(event.amount)} fee`
          + ` · ${this.state.actionsRemaining} actions left`,
          'good',
        );
        break;
      case 'settle':
        this.audio.play('settle');
        for (const move of event.rivalMove?.moves ?? []) {
          if (!move.moved || move.verb !== 'redevelop') continue;
          const rivalHolding = this.state.holdings[move.parcelId];
          this.view.board.beginDemolition(
            move.parcelId,
            rivalHolding?.construction?.fromArchetype ?? this.city.parcels[move.parcelId].archetypeId,
          );
          const rivalPoint = this.view.worldOf(move.parcelId);
          if (rivalPoint) {
            this.view.vfx.demolition(rivalPoint, {
              seed: this.city.seed,
              eventId: `rival-redevelop:${move.parcelId}:q${this.state.quarter}`,
              colour: '#87919a',
              radius: 11,
              height: 5,
              intensity: 0.85,
            });
          }
        }
        for (const completion of event.completions ?? []) {
          this.view.board.beginCompletion(completion.parcelId, completion.archetypeId);
          const completePoint = this.view.worldOf(completion.parcelId);
          if (completePoint) {
            this.view.vfx.construction(completePoint, {
              seed: this.city.seed,
              eventId: `completion:${completion.parcelId}:q${this.state.quarter}`,
              colour: '#c9b896',
              radius: 10,
              height: 3.6,
              intensity: 0.8,
            });
          }
        }
        for (const accident of event.constructionAccidents ?? []) {
          const point = this.view.worldOf(accident.parcelId);
          if (point) {
            this.view.vfx.tip?.(point, {
              seed: this.city.seed,
              eventId: `accident:${accident.parcelId}:q${event.quarter}`,
              intensity: 0.9,
            });
          }
          this.hud.toast(
            `WORKS ACCIDENT · ${accident.parcelId.toUpperCase()}`
            + ` · +1q, finishes Q${accident.completionQuarter}, ambulance sent`,
            'reject',
          );
        }
        for (const item of event.propertyEvents ?? []) {
          if (item.kind === 'startup-valuation') {
            this.hud.toast(
              `${item.brand ?? 'Startup'} valued at ${fmt(item.valuation)} · divest to PE from the card`,
              'good',
            );
          }
          if (item.kind === 'startup-drift' && item.direction === 'up') {
            this.hud.toast(
              `${item.brand ?? 'Startup'} rises · ${fmt(item.valuation)}`,
              'good',
            );
          }
          if (item.kind === 'startup-drift' && item.direction === 'down') {
            this.hud.toast(
              `Cheaper overseas tech undercuts ${item.brand ?? 'the model'} · ${fmt(item.valuation)}`,
              'reject',
            );
          }
        }
        // City services (ambulance + bin day) reconcile from state.
        this.view.cityServices?.syncState(this.state);
        // Bin day is presentation on Q4/Q8… after the quarter advances in settle.
        if (this.state.quarter > 0 && this.state.quarter % 4 === 0) {
          this.hud.toast(
            `BIN DAY · Q${this.state.quarter} · kerb collection en route`,
            'good',
          );
        }
        // The forced sale due and each defect found wait until the books, the minute and any dialog have closed.
        const forcedSaleDue = this.settleNotices.settle(this.city, this.state, event);
        this.settlementPresenter.show({ ...event, forcedSaleDue }, this.state.ledger.at(-1));
        for (const tx of event.auctionTransactions ?? []) {
          if (tx.kind !== 'auction') continue;
          const auctionParcel = String(tx.parcelId ?? '').toUpperCase();
          if (tx.outcome === 'sold' && tx.winner === 'player') {
            this.hud.toast(
              `Auction won · ${auctionParcel} · hammer ${fmt(tx.salePrice)}, cash ${fmt(tx.cashOut)}`,
              'good',
            );
          } else if (tx.outcome === 'sold') {
            this.hud.toast(
              `Auction lost · ${auctionParcel} · Petridis pays ${fmt(tx.salePrice)}`,
              'reject',
            );
          } else if (tx.outcome === 'passed-in') {
            this.hud.toast(`Auction passed in · ${auctionParcel} · reserve unmet`, 'reject');
          }
        }
        break;
      case 'bid': {
        this.audio.play('select');
        const live = this.state.events.byId[event.eventId];
        const rivalMax = live?.rivalCommitment?.maxBid ?? 0;
        const losing = rivalMax > 0 && event.maxBid <= rivalMax;
        this.hud.toast(
          `Bid ${fmt(event.maxBid)} on ${String(event.parcelId).toUpperCase()}`
          + (losing
            ? ` · Petridis leads at ${fmt(rivalMax)}`
            : ' · hammer falls when you settle')
          + ` · ${this.state.actionsRemaining} actions left`,
          losing ? 'reject' : 'good',
        );
        break;
      }
      case 'supermarket-lease':
        this.hud.toast(`Strip leased · ${fmt(event.amount)} · open doors`, 'good');
        break;
      case 'supermarket-play':
        this.hud.toast('Doors open · one run', 'good');
        break;
      case 'supermarket-payout':
        this.hud.toast(`Banked ${fmt(event.amount)} from the strip`, 'good');
        break;
      case 'ice-cream-rush-payout':
        this.hud.toast(`Banked ${fmt(event.amount)} from the van`, 'good');
        break;
      case 'script-lord-payout':
        this.hud.toast(`Banked ${fmt(event.amount)} from Script Lord`, 'good');
        break;
      case 'script-lord-raid':
        this.hud.toast(
          `AFP trafficking raid · city holdings seized · NAV reset to ${fmt(event.startNav)}`,
          'reject',
        );
        break;
      case 'veggie-patch-payout':
        this.hud.toast(`Banked ${fmt(event.amount)} from the garden`, 'good');
        break;
      case 'consolidate': {
        this.audio.play('acquire');
        const parents = event.parcelIds ?? [];
        for (const id of parents) {
          const parentPoint = this.view.worldOf(id);
          if (parentPoint) this.view.vfx.ring(parentPoint, { colour: '#8a6a3a', radius: 12 });
        }
        const parentMarks = parents.map((id) => id.toUpperCase()).join(' + ');
        // A this-quarter assessment resolved early during the merge; a downgrade is
        // board information the player must see, not an event-payload secret (V3.39 F5).
        for (const row of event.assessmentsResolved ?? []) {
          if (row.downgrade) {
            this.hud.toast(`${String(row.parcelId).toUpperCase()} condition dropped on merge.`, 'reject');
          }
        }
        this.hud.toast(
          `${parentMarks} → ${String(event.parcelId).toUpperCase()}`,
          'good',
        );
        this._followParcelId = event.parcelId;
        break;
      }
      case 'subdivide': {
        this.audio.play('divest');
        const restored = event.parcelIds ?? [];
        this.hud.toast(
          `Pad split · ${String(event.parcelId).toUpperCase()} → ${restored.map((id) => id.toUpperCase()).join(' + ')}`,
          'good',
        );
        this._followParcelId = restored[0] ?? null;
        break;
      }
      default:
        break;
    }
  }

  onFrame() {
    this.connectors?.update();
  }

  toggleMute(muted = !this.muted) {
    this.muted = muted;
    this.audio.setEnabled(!this.muted);
    store.set(`${UI_PREFS_KEY}:muted`, this.muted ? '1' : '0');
    this.hud.toast(this.muted ? 'Sound off' : 'Sound on');
  }

  restart(mode) {
    if (this.online) { location.href = `./online.html?room=${encodeURIComponent(this.online.roomId)}`; return; }
    const previewUrl = previewRestartUrl(location.href, this.seed, mode);
    if (previewUrl) { location.href = previewUrl; return; }
    const result = runCityCampaignMutation({ search: location.search, store }, (storage) => {
      storage.remove(SAVE_KEY);
      return { ok: true };
    });
    if (!result.ok) { this.hud.toast(result.reason, 'reject'); return; }
    if (mode === 'same') {
      location.href = `./play.html?seed=${encodeURIComponent(this.seed)}`;
    } else {
      location.href = './play.html';
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this._onlineUnsubscribe?.();
    this.onlineUI?.dispose();
    this.online?.dispose();
    window.removeEventListener('pagehide', this._onPageHide);
    window.removeEventListener('resize', this._onSelectionResize);
    this._offLayoutSelection?.();
    this._offLayoutSelection = null;
    this._phoneSheetObserver?.disconnect();
    this._phoneSheetObserver = null;
    cancelAnimationFrame(this._selectionResizeFrame);
    cancelAnimationFrame(this._freshSheetSeatFrame);
    this.thumbnails?.dispose();
    this.connectors?.dispose();
    this.phoneFit?.dispose();
    this.settlementPresenter?.dispose();
    this.settleNotices?.dispose();
    this.hotseat?.dispose();
    disposeCybercabPanel(this.hud);
    this._disposeHelpDioramas?.();
    this._disposeHelpDioramas = null;
    this.view?.dispose();
    this.root.removeEventListener('pointerdown', this._unlockAudio, true);
    this.root.removeEventListener('keydown', this._unlockAudio, true);
    this.audio.dispose();
    if (window.__districtDeck) delete window.__districtDeck;
  }

  showHelp() {
    store.set(`${UI_PREFS_KEY}:seen-help`, '1');
    const actions = helpActionAllowance(this.state);
    const quarters = RULES.quarters;
    openModal(this.overlayHost, {
      label: 'How to play',
      html: this.online ? onlineHelpHtml({ quarters }) : `
        <p class="help-loop"><strong>Every quarter follows one turn loop:</strong></p>
        <ol class="help-steps">
          <li><strong>Select</strong> a parcel or person; its card opens.</li>
          <li><strong>Act</strong>: most verbs spend one action and apply at once. You have <strong>${actions} actions</strong> a quarter, plus any you banked, and the Actions counter shows how many are left.</li>
          <li><strong>Settle</strong> runs the books, lets Roman Petridis act, and starts next quarter.</li>
        </ol>
        <p>Unspent actions disappear at settle. <strong>Bank</strong> one for next quarter — 1 action.</p>

        <h3 class="help-h3">Sound</h3>
        <div data-help-audio></div>
        <h3 class="help-h3">Money verbs</h3>
        <div class="row"><span class="label">Acquire</span><span class="value">The parcel is yours at once, on ${pctText(RULES.lvrBp)} debt. — ${pctText(RULES.dutyBp)} duty · 1 action</span></div>
        <div class="row"><span class="label">Survey</span><span class="value">Survey names condition and hazard bands. — ${fmt(RULES.surveyCost)} · 1 action</span></div>
        <div class="help-diorama-row" data-help-diorama="works-ladder"></div>
        <div class="row"><span class="label">Divest</span><span class="value">Divest a holding and clear its debt — no action.</span></div>
        <div class="row"><span class="label">Bank</span><span class="value">Bank one action for next quarter — 1 action. At most ${RULES.maxBankedActions} carries.</span></div>

        <h3 class="help-h3">Planning, lease &amp; works</h3>
        <p class="help-loop">Cards show only legal verbs. Each button states its effect and price.</p>
        <div class="row" data-help-row="lobby"><span class="label">Lobby</span><span class="value">Lobby any legal ceiling rung at once. — from ${fmt(permitFeeForRung(1))} fee · 1 action. Refusal still spends the fee.</span></div>
        <div class="row"><span class="label">Lease</span><span class="value">Lease starts rent from a chosen tenant — ${fmt(RULES.leaseFee)} fee · 1 action. Safer tenants pay less and miss less.</span></div>
        <div class="row"><span class="label">Notice</span><span class="value">Notice keeps half rent for one full quarter — 1 action.</span></div>
        <div class="row"><span class="label">Buy out</span><span class="value">Pay the tenant; the holding is vacant now — 1 action.</span></div>
        <div class="row"><span class="label">Build</span><span class="value">Choose a BUILD form, then place it on a cleared pad.</span></div>
        <div class="help-diorama-row" data-help-diorama="merge"></div>
        <div class="row"><span class="label">Remediate</span><span class="value">Remove Possum from the vacant holding — ${fmt(RULES.remediateCost)} · 1 action. Lease on a later action.</span></div>
        <div class="row"><span class="label">Stock Exchange</span><span class="value">Trade listed names for cash — no action. Prices move at settle.</span></div>
        <div class="help-diorama-row" data-help-diorama="ownership"></div>

        <h3 class="help-h3">Roman Petridis — the opponent</h3>
        <p class="help-loop">Petridis plays one persona for the whole run, named beside his portrait.</p>
        <p class="help-loop">NAV is net asset value. He announces targets, acts at settle, and contests NAV through quarter ${quarters}.</p>
        <div class="row"><span class="label">Value</span><span class="value">Value seeks the highest running yield and holds for rent.</span></div>
        <div class="row"><span class="label">Momentum</span><span class="value">Momentum follows the strongest sector forecast and pays for growth.</span></div>
        <div class="row"><span class="label">Civic</span><span class="value">Civic builds tram corridors so linked holdings compound.</span></div>
        <div class="row"><span class="label">Contest</span><span class="value">Buy named targets first and extend your corridor to deny his plan. Duty lowers your NAV on the day you buy, so Petridis can lead straight after a purchase.</span></div>

        <h3 class="help-h3">Builders, consultants &amp; board people</h3>
        <p class="help-loop">Each person offers one payoff. Select them, read the playbook, then walk.</p>
        <div class="row"><span class="label">Wozza — the builder.</span><span class="value">Walk to meet (1 action). Then hire the cost brief — no action, ${fmt(RULES.cheapBuilderFee)} fee, ${PROFESSIONAL_PROJECT_CAP} projects. Cheaper works, higher defect odds.</span></div>
        <div class="row"><span class="label">Saskia — the architect.</span><span class="value">Walk to meet (1 action). Then hire the quality brief — no action, ${fmt(RULES.architectFee)} fee, ${PROFESSIONAL_PROJECT_CAP} projects. Zero defects, slower rungs.</span></div>
        <div class="row"><span class="label">Terry — the agent.</span><span class="value">Walk to meet (1 action). Then hire Terry on a holding — uplift 0–15% rolled at sale. The 2% sale fee remains.</span></div>
        <div class="row"><span class="label">Vinh — the broker.</span><span class="value">Walk to meet (1 action). Then choose loan terms — no action. Cafe token shows exact terms.</span></div>
        <div class="row"><span class="label">Roman Petridis — the opponent.</span><span class="value">Walk to meet (1 action). Then open his named target — no action. Buy first to deny his move.</span></div>
        <div class="row"><span class="label">Draper — the police officer.</span><span class="value">Walk to meet (1 action). Then hear her patrol report — no action. Arson risk softens while she patrols.</span></div>
        <div class="row"><span class="label">Trevor — the arsonist.</span><span class="value">Walk to meet (1 action). Then send him to a Petridis holding — 1 action. Fire resolves at settle; insure the threatened holding.</span></div>
        <div class="row"><span class="label">Possum — the squatter.</span><span class="value">Walk to meet (1 action). Then send him to a Petridis holding — 1 action. Occupation resolves at settle; remediate the holding.</span></div>
        <div class="row"><span class="label">The Nguyen-O’Briens — the local family.</span><span class="value">Walk to meet (1 action). Then read demand — no action. Food token shows the exact map.</span></div>
        <div class="row"><span class="label">Banjo — the dog.</span><span class="value">Walk to the mark (1 action). Then collect the find for no cash.</span></div>
        <div class="row"><span class="label">Shop tokens</span><span class="value">Cafe shows loan terms; Outfitter trims sales fees. Food maps demand; Notice shows event numbers.</span></div>

        <!-- COPY-DRAFT: port, globe and trade help; the footers explain the separate money. -->
        <h3 class="help-h3">Port, globe &amp; trade</h3>
        <div class="row" data-help-row="port"><span class="label">Port</span><span class="value">The port card opens from the cranes, the container yard, the tank farm or the shed at the water's edge. Buying the berth holding costs city Cash, and its berth yield is paid into Cash at each settle.</span></div>
        <div class="row" data-help-row="globe"><span class="label">Globe</span><span class="value">WORLD opens the globe of ports and trade routes, which runs on its own Treasury. Listed is the company's value on the exchange and is the globe's money goal.</span></div>
        <div class="row" data-help-row="trade"><span class="label">Trade</span><span class="value">A route opened on the globe moves a good to or from Melbourne, and its fee and handling are paid from Treasury. Its crates land at the port, and each settle moves the globe on by one beat.</span></div>

        <h3 class="help-h3">Board &amp; settle</h3>
        <div class="row"><span class="label">Petridis plan</span><span class="value">Named parcel targets · take them first</span></div>
        <div class="help-diorama-row" data-help-diorama="corridor"></div>
        <div class="row"><span class="label">Auction</span><span class="value">Set your maximum; you pay hammer, not max. Ties go to Petridis.</span></div>
        <div class="row"><span class="label">Civic land</span><span class="value">Civic land provides an amenity. It is never tradeable.</span></div>
        <div class="row"><span class="label">Settle</span><span class="value">The books pay rent minus ${pctText(RULES.opexBp)} opex and interest. Petridis acts before the next quarter.</span></div>
        <div class="row"><span class="label">You win</span><span class="value">Finish quarter ${quarters} with higher NAV than Petridis.</span></div>

        <p style="margin-top:16px">Petridis announces before acting. Deny named parcels while extending your corridor.</p>
        <p style="margin-top:12px"><strong>Camera:</strong> drag to pan · right-drag to orbit · <span class="kbd">+</span>/<span class="kbd">−</span> zoom</p>
        <p><span class="kbd">N</span> north · <span class="kbd">F</span> frame city</p>
        <p class="label" style="line-height:2;margin-top:12px">
          <span class="kbd">1</span> acquire · <span class="kbd">2</span> renovate${RULES.redevelopButtonRetired ? '' : ' · <span class="kbd">3</span> redevelop'}<br>
          <span class="kbd">4</span> divest · <span class="kbd">5</span> bank · <span class="kbd">Enter</span>/<span class="kbd">Space</span> settle<br>
          <span class="kbd">S</span> survey · <span class="kbd">W</span> walk · <span class="kbd">J</span> hire<br>
          <span class="kbd">P</span> people · <span class="kbd">R</span> Petridis target ·
          <span class="kbd">Esc</span> close
        </p>
        <p class="label" style="margin-top:14px">Game units only. Districts are fictionalised namesakes — not real valuations.</p>
      `,
      footer: '<button class="sheet__commit verb verb--settle" data-close data-autofocus>Play</button>',
    });

    const overlay = this.overlayHost.lastElementChild?.classList.contains('overlay')
      ? this.overlayHost.lastElementChild
      : null;
    const sheet = overlay?.querySelector('.sheet');
    if (!overlay || !sheet) return;
    sheet.classList.add('sheet--help-book');
    const disposeAudioSettings = mountAudioSettings(sheet.querySelector('[data-help-audio]'), this.audio, {
      onMute: muted => this.toggleMute(muted),
      onMusic: value => store.set(`${UI_PREFS_KEY}:music-volume`, String(value)),
      onEffects: value => store.set(`${UI_PREFS_KEY}:effects-volume`, String(value)),
    });
    enhanceHelpIntro(sheet, { quarters, ...(this.online ? {
      opponentLabel: this.online.snapshot?.opponent === 'policy' ? 'Roman Petridis' : 'your opponent',
    } : {}) });
    const examples = {
      corridor: { links: 2, bonusBp: RULES.corridorLinkBp },
      'works-ladder': { current: 0, ceiling: 2 },
      merge: { mode: 'merge' },
      ownership: { target: true },
    };
    const controllers = [...sheet.querySelectorAll('[data-help-diorama]')].map((host) => {
      const kind = host.dataset.helpDiorama;
      return mountDiorama(kind, host, examples[kind] ?? {});
    });
    let cleaned = false;
    const watcher = new MutationObserver(() => {
      if (!overlay.isConnected) cleanup();
    });
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      watcher.disconnect();
      disposeAudioSettings();
      for (const controller of controllers) controller.dispose();
      if (this._disposeHelpDioramas === cleanup) this._disposeHelpDioramas = null;
    };
    watcher.observe(this.overlayHost, { childList: true });
    this._disposeHelpDioramas?.();
    this._disposeHelpDioramas = cleanup;
  }

}

function charName(archetypeId) {
  const profile = CHARACTER_PROFILES[archetypeId];
  if (!profile) return archetypeId.replace(/-/g, ' ');
  return profile.shortName ?? profile.name;
}

function pickMessage(bank, key = null) {
  return pickVoiceMessage(bank, key);
}

function canonicalReducerReason(text) {
  return String(text ?? '')
    .replace(/\bHeld by the rival\b/gi, 'Held by Petridis')
    .replace(/\bThe parcel is under construction\b/gi, 'The parcel has active works')
    .replace(/\bUnder construction\b/gi, 'Works are active')
    .replace(/\bSend only onto a rival lot\b/gi, 'Send only to a Petridis holding')
    .replace(/\bThat lot is not sendable\b/gi, 'That parcel is not sendable')
    .replace(/\bThat use is not permissible on this site\b/gi, 'That use is not permitted on this parcel')
    .replace(/\bAlready at the highest permit this site allows\b/gi, 'Already at this parcel’s highest permit')
    .replace(/\bChoose a higher planning permit level for this site\b/gi, 'Choose a higher planning permit for this parcel');
}

function fmt(value) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${value < 0 ? '-' : ''}$${(abs / 1_000_000).toFixed(2)}m`;
  if (abs >= 1_000) return `${value < 0 ? '-' : ''}$${Math.round(abs / 1_000)}k`;
  return `${value < 0 ? '-' : ''}$${abs}`;
}

function pctText(bp) {
  return `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 1)}%`;
}

function accessTokenLabel(token) {
  return {
    brokerTermsUntilQuarter: 'Cafe token',
    askingBandUntilQuarter: 'Outfitter token',
    peopleDemandUntilQuarter: 'Food token',
    eventForecastUntilQuarter: 'Notice token',
  }[token] ?? 'Token';
}

const projectScratch = new THREE.Vector3();
const groundPointer = new THREE.Vector2();
const groundRay = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function projectToScreen(view, point) {
  projectScratch.set(point.x, 6, point.z);
  projectScratch.project(view.camera);
  if (projectScratch.z > 1) return null;
  const rect = view.canvas.getBoundingClientRect();
  return {
    x: rect.left + ((projectScratch.x + 1) / 2) * rect.width,
    y: rect.top + ((1 - projectScratch.y) / 2) * rect.height,
  };
}

const game = new Game(document.querySelector('.game'));
game.boot().catch((error) => {
  console.error(error);
  const loader = document.querySelector('.loader__text');
  if (loader) {
    loader.textContent = `Could not start: ${error.message}`;
    if (params.has('room')) {
      const link = document.createElement('a');
      link.href = `./online.html?room=${encodeURIComponent(params.get('room'))}`;
      link.textContent = 'Open room access and reconnect'; link.style.display = 'block';
      loader.append(link);
    }
  }
});
