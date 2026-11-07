// P14 M3 — MILITARY rail panel. R1 register, ≤ 12 words a line.

import { liveThreats } from '../core/world/threats.js';
import {
  WORLD_RUN_KEY,
  inspectWorldRun,
  worldStoreGet,
} from '../core/world/envelope.js';
import { WORLD_THREAT_KIND_LABEL } from '../core/world/catalog.js';
import { leftoverAttackers } from '../render/military/attacks.js';
import { getMilitaryDemoFeed } from '../render/military/units.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function wordCount(line) {
  return String(line ?? '').trim().split(/\s+/).filter(Boolean).length;
}

export function militaryCautionLine(threat, beat = 0) {
  if (!threat) return '';
  const eta = Math.max(0, (threat.strikeBeat ?? beat) - beat);
  const where = threat.kind === 'drones'
    ? (threat.targetFacility ?? 'CITY').toUpperCase()
    : (threat.basinId ?? 'SEA').toUpperCase();
  const head = threat.kind === 'drones' ? 'DRONES INBOUND' : 'PIRATES INBOUND';
  return `${head} · ${where} · ${eta} BEATS`;
}

export function militaryFightLine(row) {
  if (!row) return '';
  const where = (row.targetFacility ?? row.target ?? row.basinId ?? 'PORT').toString().toUpperCase();
  const up = Number.isInteger(row.interceptors)
    ? row.interceptors
    : (row.interceptors?.length ?? row.up ?? 0);
  if (row.kind === 'pirates') return `SEA FIGHT · ${where} · ${up} UP`;
  return `RAID ON ${where} · ${up} UP`;
}

function unitOrder(unit, watch) {
  if (unit.kind === 'officer') return watch ? 'Watch' : 'Move';
  return unit.moving ? 'Move' : 'Stationed';
}

function kindLabel(kind) {
  if (kind === 'tank') return 'Tank';
  if (kind === 'drone') return 'Drone wing';
  if (kind === 'officer') return 'Officer';
  return kind;
}

export function militaryPanelModel({ state, world, unitsStatus, beat, raidStatus, demo } = {}) {
  const feed = demo ?? getMilitaryDemoFeed?.() ?? null;
  const units = (unitsStatus?.units?.length ? unitsStatus.units : null)
    ?? feed?.units
    ?? state?.military?.units
    ?? [];
  const watch = state?.military?.watch?.officerOnWatch === true
    || units.some((u) => u.kind === 'officer' && u.blockId);
  const live = world ? liveThreats(world, beat ?? world.beat ?? 0) : [];
  const log = [...(world?.log ?? []), ...(state?.log ?? [])]
    .filter((row) => /threat-|shipyard-|station-unit|repair-facility|unit-dropped/.test(row.type ?? ''))
    .slice(-5);
  const demoRaid = feed?.raid ?? null;
  const demoSea = feed?.sea ?? null;
  const extra = [];
  if (demoRaid) {
    extra.push({
      id: 'demo-raid',
      kind: 'drones',
      targetFacility: demoRaid.targetFacility ?? 'port',
      strikeBeat: (beat ?? 0) + 0,
      beat: (beat ?? 0) - 2,
      strength: demoRaid.strength,
      interceptors: demoRaid.interceptors ?? [],
      leftover: demoRaid.leftover,
      outcome: demoRaid.outcome ?? 'damage',
      fighting: true,
    });
  }
  if (demoSea) {
    extra.push({
      id: 'demo-sea',
      kind: 'pirates',
      basinId: demoSea.basinId ?? 'bass',
      targetFacility: demoSea.basinId ?? 'bass',
      strikeBeat: beat ?? 0,
      beat: (beat ?? 0) - 2,
      strength: 3,
      interceptors: demoSea.interceptors ?? [],
      leftover: 0,
      outcome: demoSea.outcome ?? 'repelled',
      fighting: true,
    });
  }
  const merged = [...live];
  for (const row of extra) {
    if (!merged.some((item) => item.id === row.id || (item.kind === row.kind && item.fighting))) {
      merged.push(row);
    }
  }
  const raidLive = raidStatus ?? unitsStatus?.raid ?? null;
  const cautions = merged
    .filter((row) => row.outcome == null)
    .map((row) => militaryCautionLine(row, beat ?? world?.beat ?? 0));
  if (demoRaid) {
    const inbound = militaryCautionLine({
      kind: 'drones',
      targetFacility: demoRaid.targetFacility ?? 'port',
      strikeBeat: 2,
    }, 0);
    if (!cautions.includes(inbound)) cautions.unshift(inbound);
  }
  const threats = [];
  const seenPlates = new Set();
  for (const row of merged) {
    const interceptors = row.interceptors?.length ?? 0;
    const fighting = row.fighting === true || row.outcome != null || Boolean(raidLive);
    const plate = fighting
      ? militaryFightLine({
        kind: row.kind,
        targetFacility: row.targetFacility ?? row.basinId ?? 'port',
        interceptors,
      })
      : militaryCautionLine(row, beat ?? world?.beat ?? 0);
    if (!plate || seenPlates.has(plate)) continue;
    seenPlates.add(plate);
    threats.push({
      id: row.id,
      kind: row.kind,
      label: plate,
      eta: Math.max(0, (row.strikeBeat ?? 0) - (beat ?? world?.beat ?? 0)),
      target: row.targetFacility ?? row.targetBook ?? row.basinId ?? '—',
      strength: row.strength,
      interceptors,
      leftover: leftoverAttackers(row.strength, row.interceptors),
      outcome: row.outcome,
      fighting,
      plate,
    });
  }
  return {
    units: units.map((u) => ({
      id: u.id,
      kind: u.kind,
      block: u.blockId ?? '—',
      order: unitOrder(u, watch),
      selected: Boolean(u.selected),
    })),
    threats,
    log,
    cautions,
  };
}

export function militaryPanelHtml(model) {
  const units = model?.units ?? [];
  const threats = model?.threats ?? [];
  const log = model?.log ?? [];
  const cautions = model?.cautions ?? [];
  const unitRows = units.length
    ? units.map((u) => `
        <button type="button" class="military-unit${u.selected ? ' is-selected' : ''}"
                data-military-unit="${escapeHtml(u.id)}">
          <strong>${escapeHtml(kindLabel(u.kind))}</strong>
          <span>Block ${escapeHtml(u.block)}</span>
          <small>${escapeHtml(u.order)}</small>
        </button>
        <div class="military-unit__orders">
          <button type="button" class="military-order" data-military-move="${escapeHtml(u.id)}">Move</button>
          ${u.kind === 'officer'
            ? `<button type="button" class="military-order" data-military-watch="${escapeHtml(u.id)}">Watch</button>`
            : ''}
        </div>`)
      .join('')
    : '<p class="military-empty">No units on the board.</p>';
  const threatRows = threats.length
    ? threats.map((t) => {
      const plate = t.plate ?? t.label ?? '';
      const fighting = t.fighting || /RAID ON/.test(plate);
      return `
        <div class="military-threat${fighting ? ' is-fight' : ''}">
          <strong>${escapeHtml(plate || (t.label ?? t.kind).toUpperCase())}</strong>
          <span>${fighting
            ? escapeHtml(`${String(t.kind).toUpperCase()} · STR ${t.strength}`)
            : escapeHtml(String(t.target).toUpperCase() + ' · ' + t.eta + ' BEATS')}</span>
          <small>STR ${t.strength} · INT ${t.interceptors} · LEFT ${t.leftover}</small>
        </div>`;
    }).join('')
    : '<p class="military-empty">No live threats.</p>';
  const logRows = log.length
    ? log.map((row) => `<li>${escapeHtml((row.body ?? row.type ?? '').toString())}</li>`).join('')
    : '<li>No military log yet.</li>';
  const plates = cautions.map((line) => (
    `<div class="military-plate">${escapeHtml(line)}</div>`
  )).join('');
  return `
    <div class="military-panel" data-military-panel>
      ${plates}
      <section class="military-section">
        <h3>Units</h3>
        <div class="military-units">${unitRows}</div>
      </section>
      <section class="military-section">
        <h3>Threats</h3>
        <div class="military-threats">${threatRows}</div>
      </section>
      <section class="military-section">
        <h3>Log</h3>
        <ol class="military-log">${logRows}</ol>
      </section>
    </div>`;
}

function readWorld() {
  try {
    const inspected = inspectWorldRun(worldStoreGet(WORLD_RUN_KEY));
    return inspected.status === 'valid' ? inspected.world : null;
  } catch {
    return null;
  }
}

export const MILITARY_CAPTURE_ATTR = 'data-military-capture';

function ensureMilitaryCaptureStyle() {
  if (document.querySelector('[data-military-capture-style]')) return;
  const style = document.createElement('style');
  style.dataset.militaryCaptureStyle = '';
  style.textContent = `
    .game[${MILITARY_CAPTURE_ATTR}="clean"] > :not(#board) {
      visibility: hidden !important;
      pointer-events: none !important;
    }
    .game[${MILITARY_CAPTURE_ATTR}="clean"] > #board {
      visibility: visible !important;
    }
  `;
  document.head.appendChild(style);
}

export function mountMilitaryPanel(root, {
  getModel,
  onSelectUnit,
  onMove,
  onWatch,
} = {}) {
  ensureMilitaryCaptureStyle();
  const host = document.createElement('section');
  host.className = 'panel panel--instrument panel--tool military-rail-panel';
  host.dataset.railPanel = 'military';
  host.hidden = true;
  host.innerHTML = `
    <header>
      <span class="label">Military</span>
      <span class="rail-tab__summary">UNITS · THREATS</span>
    </header>
    <div class="body" data-military-body></div>`;
  const rail = root.querySelector('.rail');
  if (rail) rail.appendChild(host);
  else root.appendChild(host);

  const api = {
    open: false,
    captureMode: false,
    host,
    toggle(on) {
      if (on && typeof on === 'object') {
        if (typeof on.capture === 'boolean') this.setCaptureMode(on.capture);
        if (typeof on.open === 'boolean') this.open = on.open;
      } else {
        this.open = on ?? !this.open;
      }
      host.hidden = this.captureMode || !this.open;
      host.classList.toggle('is-open', this.open);
      this.sync();
      return this.open;
    },
    setCaptureMode(on) {
      this.captureMode = Boolean(on);
      if (this.captureMode) root.setAttribute(MILITARY_CAPTURE_ATTR, 'clean');
      else root.removeAttribute(MILITARY_CAPTURE_ATTR);
      host.hidden = this.captureMode || !this.open;
      return this.captureMode;
    },
    sync() {
      const rail = root.querySelector('.rail');
      const tools = rail?.querySelector('.rail-tools');
      if (tools) {
        if (host.previousElementSibling !== tools) tools.insertAdjacentElement('afterend', host);
      } else if (rail && host.parentElement !== rail) {
        rail.appendChild(host);
      }
      host.hidden = this.captureMode || !this.open;
      const body = host.querySelector('[data-military-body]');
      if (!body) return;
      const model = getModel?.() ?? militaryPanelModel({ world: readWorld() });
      body.innerHTML = militaryPanelHtml(model);
      if (tools && !tools.querySelector('[data-rail-tool="military"]')) {
        tools.classList.add('military-rail');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `rail-tool mat-steel${this.open ? ' is-armed' : ''}`;
        btn.dataset.railTool = 'military';
        btn.setAttribute('aria-pressed', this.open ? 'true' : 'false');
        btn.innerHTML = `
          <span class="rail-tool__well" aria-hidden="true">
            <svg class="chrome-action__glyph" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 18h16M6 18V8l6-4 6 4v10M9 18v-5h6v5"></path>
            </svg>
          </span>
          <span class="rail-tool__label">MILITARY</span>`;
        tools.appendChild(btn);
      } else {
        const btn = tools?.querySelector('[data-rail-tool="military"]');
        if (btn) {
          btn.classList.toggle('is-armed', this.open);
          btn.setAttribute('aria-pressed', this.open ? 'true' : 'false');
        }
      }
    },
  };

  root.addEventListener('click', (event) => {
    const tool = event.target.closest('[data-rail-tool="military"]');
    if (tool) {
      event.preventDefault();
      event.stopPropagation();
      api.toggle();
      return;
    }
    const unit = event.target.closest('[data-military-unit]');
    if (unit) {
      onSelectUnit?.(unit.dataset.militaryUnit);
      return;
    }
    const move = event.target.closest('[data-military-move]');
    if (move) {
      onMove?.(move.dataset.militaryMove);
      api.sync();
      return;
    }
    const watch = event.target.closest('[data-military-watch]');
    if (watch) onWatch?.(watch.dataset.militaryWatch);
  }, true);

  api.sync();
  return api;
}
