// Location-card template. Advisor register — Civilization III encyclopedic voice.
// Keys still say “book”. Blurbs are authored per city, one to two sentences.

import {
  creditOffer,
  exportCashForGood,
  WORLD_CITIES,
  WORLD_CITY_BY_ID,
  WORLD_TRADE_ROUTES,
} from '../../core/world/catalog.js';
import { CARGO_DAYS, CARGO_MODE } from './cargo-lanes.js';
import { MONEY_KEY_GLOBE } from '../money-key.js';
import { itemIconHtml, ITEM_LABEL } from './item-icons.js';

const MELBOURNE_ID = 'melbourne-inner';

export const DESK_BLURB = Object.freeze({
  'melbourne-inner': 'Our home harbour. Import cargo here; sell Biotech to Los Angeles, Tokyo, and London.',
  'geelong-port': 'A harbour market on the bay. Tankers from the inner city put in here.',
  'ballarat-gold': 'Inland prestige on the old goldfield. The carnival ticket lands after Melbourne.',
  'sydney-harbour': 'Prices a cash line against the listed tape. Repay a slice each beat.',
  'adelaide-light': 'A naval yard on the gulf. Warships steam the Bight to Melbourne.',
  'hobart-derwent': 'A Derwent brewery and dairy. Beer and Milk powder cross Bass Strait.',
  'singapore-roads': 'Entrepôt of the strait. Tourists land here; Grain moves both ways.',
  'hongkong-peak': 'A harbour of finished rooms. Modular crates land ready to place.',
  'guangzhou-fittings': 'The fittings mill — steel, glass, joinery, and tile.',
  'shanghai-bund': 'The Bund mill. Plant machinery and Ink leave; Milk powder is sought.',
  'taipei-chips': 'A silicon harbour. Chips feed the works and the listed tape.',
  'hcmc-furniture': 'A Mekong joinery. Furniture is made for the inner rooms.',
  'jakarta-timber': 'A hardwood harbour. Timber leaves; Fittings and Beef are sought.',
  'gothenburg-mod': 'Quiet luxury from the Swedish west. Modular rooms; the crates are dear.',
  'hormuz-roads': 'The strait of tankers. Crude Oil fuels the works.',
  'starbase-texas': 'A gulf space yard. Robots, Boca Compute, and Starlink ship from Boca.',
  'levant-roads': 'A war harbour. People, not cargo, wait upon the guns.',
  'london-city': 'The City. Gas Turbines and Bibles leave; Biotech and Wine are sought.',
  'santos-coffee': 'A Brazilian harbour. Coffee and Beef fill the inner kitchens.',
  'valparaiso-copper': 'A Pacific copper port. Chilean Copper is drawn for wiring and the works.',
  'accra-cocoa': 'A Gold Coast cocoa harbour. Ghanaian Cocoa for kitchens and rooms.',
  'doha-lng': 'A Qatari gas harbour. LNG fuels the works.',
  'nagoya-autos': 'A Tokaido motor works. Japanese cars and Motors fill the streets.',
  'bordeaux-wine': 'A Gironde cellar. French Wine for the inner rooms.',
  'johannesburg-gold': 'A Witwatersrand vault. Bullion fattens Head office.',
  'mumbai-cotton': 'A labour harbour. Human Labour and Tuition take rooms and works.',
  'carrara-marble': 'A Tuscan quarry. Italian Marble for stone and facades.',
  'antarctica-dome': 'A research dome on the ice. Ancient Biotech yields while the dome stands.',
  'northpole-base': 'A polar base. Alien tech yields while the base holds.',
  'losangeles-harbour': 'An offtake harbour. Melbourne Biotech lands by air in three days.',
  'tokyo-harbour': 'An offtake harbour. Biotech, Chips, Tuition, and Steel land by air in two days.',
  'port-hedland': 'A Pilbara iron harbour. Ore leaves for hulls and plates.',
  greenbushes: 'A jarrah-forest pit. Lithium for drone batteries.',
  'mount-weld': 'An inland rare-earth pit. Ore for motors and guidance.',
  'eneabba-sands': 'A mineral-sand coast. Titanium for airframes.',
  kolwezi: 'A Copperbelt pit. Cobalt for batteries and magnets.',
  pohang: 'A stainless works on the Korean coast. Steel, pig iron, frames, and slag leave for hulls.',
  morowali: 'A Sulawesi nickel harbour. Ore for engines and batteries.',
  balama: 'A graphite pit. Ore for anodes.',
  gladstone: 'A Queensland smelter. Aluminium, Bauxite, and Alumina leave the wharf.',
  seto: 'A ceramic kiln. Technical Ceramics and Kaolin for tiles and liners.',
  rustenburg: 'A Bushveld platinum harbour. Ore leaves the reef.',
  'cape-flattery': 'A silica coast. Sand for the silicon furnace.',
  hsinchu: 'A fab city. Wafers, dies, and Silicon for the works.',
  rotorua: 'A mill town. Pulp and Paper leave the mill.',
  sheffield: 'A hall of furnaces. Steel Castings for the works hall.',
  osaka: 'A Kansai winding mill. Copper Windings for motors and turbines.',
  ningbo: 'A magnet works. Rare-earth Magnets for motors and turbines.',
  'olympic-dam': 'A Roxby Downs pit. Uranium for the centrifuge works.',
});

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function money(n) {
  const value = Math.round(n);
  if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(1)}T`;
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return `$${value.toLocaleString('en-AU')}`;
}

export function goodPlainName(good) {
  return ITEM_LABEL[good] ?? good;
}

export function goodTitle(good, cityId = null) {
  if (good === 'ancient-biotech') return 'Ancient Biotech';
  if (good === 'biotech' && cityId === 'antarctica-dome') return 'Ancient Biotech';
  return ITEM_LABEL[good] ?? good;
}

export function cityDeskRoutes(cityId) {
  return WORLD_TRADE_ROUTES.filter((route) => (
    route.from === cityId || (route.from === MELBOURNE_ID && route.to === cityId)
  ));
}

export function primaryGoodForDesk(cityId) {
  const routes = cityDeskRoutes(cityId);
  const inbound = routes.find((route) => route.direction === 'inbound');
  if (inbound) return inbound.good;
  const outbound = routes.find((route) => route.from === MELBOURNE_ID);
  return outbound?.good ?? null;
}

export function deskCityForGood(good) {
  const inbound = WORLD_TRADE_ROUTES.find((route) => (
    route.good === good && route.direction === 'inbound'
  ));
  if (inbound) return inbound.from;
  const outbound = WORLD_TRADE_ROUTES.find((route) => (
    route.good === good && route.direction === 'outbound'
  ));
  return outbound?.to ?? null;
}

export function booksForGood(good) {
  return WORLD_TRADE_ROUTES.filter((route) => route.good === good);
}

/**
 * Every trade book for this good across all desks. Primary desk rows
 * lead when deskCityId is set. Sibling goods at the same desk stay off
 * the card — one good, one card, every route named {Good} from {City}.
 */
export function resourceCardBooks(good, deskCityId = null) {
  const own = booksForGood(good);
  const seen = new Set();
  const primary = [];
  const rest = [];
  for (const route of own) {
    if (seen.has(route.id)) continue;
    seen.add(route.id);
    if (deskCityId && (route.from === deskCityId || route.to === deskCityId)) {
      primary.push(route);
    } else {
      rest.push(route);
    }
  }
  return deskCityId ? [...primary, ...rest] : [...own];
}

export function bookRouteTitle(route) {
  const name = goodTitle(route.good, route.from);
  if (route.from === MELBOURNE_ID) {
    const dest = WORLD_CITY_BY_ID[route.to]?.mapName ?? route.to;
    return `${name} to ${dest}`;
  }
  const source = WORLD_CITY_BY_ID[route.from]?.mapName ?? route.from;
  return `${name} from ${source}`;
}

export function madeAtCopy(desk) {
  const name = String(desk ?? '').trim();
  return name ? `MADE AT ${name.toUpperCase()}` : 'MADE AT WORKS';
}

export function madeAtRouteExplain(desk) {
  const name = String(desk ?? '').trim() || 'desk';
  return `Made at the ${name} works when MAKE is on — never importable.`;
}

function uniqueGoods(routes, direction) {
  const seen = [];
  for (const route of routes) {
    if (direction && route.direction !== direction) continue;
    if (seen.includes(route.good)) continue;
    seen.push(route.good);
  }
  return seen;
}

export function blurbWordCount(cityId) {
  const blurb = DESK_BLURB[cityId] ?? '';
  return blurb.trim().split(/\s+/).filter(Boolean).length;
}

export function deskBlurb(cityId) {
  return DESK_BLURB[cityId] ?? '';
}

function inboundUnit(good, cityId) {
  const name = goodTitle(good, cityId);
  if (good === 'tourists') return 'a Tourist arrives';
  if (good === 'people') return 'Labour arrives';
  if (good === 'asylum') return 'people arrive';
  if (good === 'food') return 'a Grain crate arrives';
  if (good === 'credit') return 'a cash line is drawn';
  return `one ${name} crate arrives`;
}

function outboundUnit(good, cityId) {
  const name = goodTitle(good, cityId);
  if (good === 'food') return 'one Grain crate ships';
  return `one ${name} crate ships`;
}

export function passageCopy(routeId) {
  const mode = CARGO_MODE[routeId];
  const days = CARGO_DAYS[routeId] ?? 18;
  const span = days === 1 ? "a day's passage" : `${days} days' passage`;
  if (mode === 'air') return `By air · ${span}.`;
  if (mode === 'rail') return `By rail · ${span}.`;
  if (mode === 'sea-tanker') {
    return routeId.startsWith('lng-')
      ? `By LNG tanker · ${span}.`
      : `By oil tanker · ${span}.`;
  }
  if (mode === 'sea-bass') {
    return routeId === 'beer-hobart-melbourne'
      ? `By Bass Strait steamer · ${span}.`
      : `By coastal warship · ${span}.`;
  }
  if (mode === 'sea-suez') return `By steamer via Suez · ${span}.`;
  if (mode === 'sea-sunda') return `By steamer via Sunda · ${span}.`;
  if (mode === 'sea-cape') return `By steamer via the Cape · ${span}.`;
  if (mode === 'sea-pacific') return `By steamer across the Pacific · ${span}.`;
  if (mode === 'sea-indian') return `By steamer via the Indian Ocean · ${span}.`;
  return `By steamer · ${span}.`;
}

function beatLine(route) {
  const cityId = route.from === MELBOURNE_ID ? route.to : route.from;
  const title = goodTitle(route.good, route.from);
  if (route.loan) {
    return 'Draw cash now. Repay a slice each beat until the line is clear.';
  }
  if (route.outpost) {
    return `Pay once to stand it. ${title} arrives each beat it holds.`;
  }
  if (!route.playerOpenable) {
    return 'This line opens when the guns do. People, not cargo.';
  }
  if (route.from === MELBOURNE_ID) {
    return `Establish this route for ${money(route.openFee)} and ${outboundUnit(route.good, cityId)} each beat thereafter. Head office is paid ${money(exportCashForGood(route.good))}.`;
  }
  return `Establish this route for ${money(route.openFee)} and ${inboundUnit(route.good, route.from)} each beat thereafter.`;
}

function titledGood(good, cityId) {
  return goodTitle(good, cityId);
}

function goodsPhrase(goods, cityId = null) {
  const chips = goods.map((good) => (
    `<span class="province-good-chip">${itemIconHtml(good)} ${escapeHtml(titledGood(good, cityId))}</span>`
  ));
  if (chips.length === 0) return '';
  if (chips.length === 1) return chips[0];
  if (chips.length === 2) return `${chips[0]} and ${chips[1]}`;
  return `${chips.slice(0, -1).join(', ')}, and ${chips.at(-1)}`;
}

function sellBuySentence(city, sells, buys) {
  if (city.id === MELBOURNE_ID) {
    return 'Melbourne sells cargo abroad and receives inbound crates.';
  }
  if (sells.length && buys.length) {
    return `Offers ${goodsPhrase(sells, city.id)}; seeks ${goodsPhrase(buys, city.id)}.`;
  }
  if (sells.length) return `Offers ${goodsPhrase(sells, city.id)}.`;
  if (buys.length) return `Seeks ${goodsPhrase(buys, city.id)}.`;
  return `${escapeHtml(city.mapName)} has no cargo to move.`;
}

function openingSentence(routes) {
  if (routes.length === 0) return '';
  if (routes.length === 1) {
    const route = routes[0];
    if (route.loan) return 'Draw cash now; repay a slice each beat.';
    if (route.outpost) return 'Pay once to stand it; cargo arrives while it holds.';
    if (!route.playerOpenable) return 'People arrive when the guns open.';
    return `Establish a trade route for ${money(route.openFee)}; cargo sails each beat.`;
  }
  if (routes.every((route) => !route.playerOpenable)) return 'People arrive when the guns open.';
  return 'Establish a trade route and its cargo sails each beat.';
}

export function stripLeadHtml(html) {
  return String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[#a-zA-Z0-9]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function explainerSentences(html) {
  const text = stripLeadHtml(html);
  if (!text) return [];
  return text.split(/(?<=[.!?])\s+/).filter(Boolean);
}

export function sentenceWordCount(sentence) {
  return stripLeadHtml(sentence)
    .replace(/[—–]/g, ' ')
    .replace(/[;:,]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word && !/^[—–-]+$/.test(word))
    .length;
}

export function deskLeadHtml(city) {
  const routes = cityDeskRoutes(city.id);
  const sells = uniqueGoods(routes, 'inbound');
  const buys = uniqueGoods(routes.filter((route) => route.from === MELBOURNE_ID), 'outbound');
  const parts = [sellBuySentence(city, sells, buys)];
  const opening = openingSentence(routes);
  if (opening) parts.push(opening);
  return parts.join(' ');
}

export function bookRegisterCopy(route) {
  return beatLine(route);
}

export function liveBookRegister(route, row = { status: 'closed' }, world = null) {
  const travel = passageCopy(route.id);
  if (route.loan) {
    const offer = creditOffer(world);
    if (row.status === 'open' && row.remaining) {
      return `Line drawn. Remaining $${row.remaining.toLocaleString('en-AU')}. Repay $${row.installment.toLocaleString('en-AU')} each beat.`;
    }
    return `Draw $${offer.principal.toLocaleString('en-AU')} now. Repay $${offer.installment.toLocaleString('en-AU')} each beat for ${offer.termBeats} beats. Arrangement ${money(offer.fee)}.`;
  }
  if (route.outpost) {
    const title = goodTitle(route.good, route.from);
    if (row.status === 'open') return `Standing. ${title} lands each beat. ${travel}`;
    return `${bookRegisterCopy(route)} ${travel}`.trim();
  }
  if (row.status === 'open') {
    const title = goodTitle(route.good, route.from);
    if (route.from === MELBOURNE_ID) {
      const capacity = Number.isInteger(route.capacity) && route.capacity > 0 ? route.capacity : 1;
      return `Ships up to ${capacity} ${title} crate${capacity === 1 ? '' : 's'} each beat when Melbourne has the goods. Pays ${money(exportCashForGood(route.good))} per delivered crate. ${travel}`;
    }
    return `${inboundUnit(route.good, route.from)} each beat while shipping is clear. ${travel}`;
  }
  return `${bookRegisterCopy(route)} ${travel}`.trim();
}

export function bookStatusLabel(route, row = { status: 'closed' }, remaining = null) {
  if (row.status === 'open') {
    if (route.outpost) return 'Standing';
    if (route.loan) return 'Drawn';
    return 'Open';
  }
  if (row.status === 'closed') return 'Closed';
  if (row.status === 'held') {
    return remaining == null ? 'Held' : `Held · ${remaining} beat${remaining === 1 ? '' : 's'}`;
  }
  if (row.status === 'embargoed') return 'Embargoed';
  if (row.status === 'cut') return 'Cut';
  return row.status;
}

export function bookButtonLabel(route, row = { status: 'closed' }, fee = route.openFee) {
  if (row.status === 'open') {
    if (route.outpost) return 'Standing';
    if (route.loan) return 'Drawn';
    return 'Trade Route — Open';
  }
  if (!route.playerOpenable) return 'This book opens only with the guns.';
  if (route.setupLabel) return `${route.setupLabel} · ${money(fee)}`;
  // COPY-DRAFT: the displayed cost is the Treasury fee for drawing the loan.
  if (route.loan) return `Draw loan · ${money(fee)} Treasury fee`;
  return `Establish Trade Route · ${money(fee)}`;
}

// COPY-DRAFT: a complete sentence for the route opened by the player.
export function lineOpenedNotice(name) {
  // A book whose name already says "line" (the line of credit) carries no cargo.
  if (/\bline\b/.test(name)) return `The ${name} is open.`;
  return `The ${name} line is open. Cargo sails as the city settles quarters.`;
}

export function booksHeadingCopy(routes) {
  const exportDesk = routes.some((route) => route.from === MELBOURNE_ID);
  const importDesk = routes.some((route) => route.to === MELBOURNE_ID);
  if (exportDesk && importDesk) return 'Trade routes';
  if (exportDesk) return 'Trade routes';
  return 'Trade routes';
}

export function civ3MakeToggle(on) {
  return on === true ? 'In production' : 'Imported';
}

export function civ3StageMode(mode) {
  if (mode === 'CAN MAKE') return 'Within our grasp';
  if (mode === 'MAKE') return 'In production';
  return 'Imported';
}

export function civ3RouteChip(kind, desk = '') {
  if (kind === 'open') return desk ? `Open · ${desk}` : 'Open';
  if (kind === 'shut') return 'Closed';
  if (kind === 'held') return 'Held · Nature has the book';
  if (kind === 'make-only') return madeAtCopy(desk);
  if (kind === 'embargoed') return 'Embargoed. Wait the beat.';
  if (kind === 'cut') return 'The line is cut.';
  return desk || kind;
}

function moneyTape(n) {
  const value = Math.round(n);
  if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(1)}T`;
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return money(value);
}

function trimAdviceClause(register) {
  const text = String(register ?? '').trim();
  if (!text) return '';
  const clause = text.split(/(?<=[.!?])\s+/)[0] ?? '';
  return clause.replace(/[.!?]$/, '');
}

const CITY_KEY_GLYPH = '<svg class="province-city-key-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 20V10l4-3 4 3v10H4zM8 20v-6h4v6M14 20V8l3-2 3 2v12h-6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';

export const BEAT_SUBTITLE = 'Runs the world one step — ships sail, works tick, the oldest settled quarter is applied.';

export const TREASURY_TITLE = 'Head-office cash that pays routes, kits, and raised arms. City CASH is Melbourne\'s own till; exports earn to the Treasury at each beat.';

export const LISTED_TITLE = 'Company value on the exchange — the FINANCIAL win metric. City CASH is Melbourne\'s own till; exports earn to the Treasury at each beat.';

/**
 * melbournePressure (effects.js, read-only): oilSupply is 100 when
 * oil-hormuz-melbourne is open, else 12. foodSupply is 100 when
 * food-singapore-melbourne is open, else 10. Yard crates are arrivals.
 * Not beats of coverage.
 */
export function pressureChipTitle(good, value) {
  if (good === 'oil') {
    return `Oil supply index ${value}. Hormuz closed 12, open 100. Shock when below 40.`;
  }
  if (good === 'food') {
    return `Grain import link ${value}. Open the Singapore grain route for 100; a missing, closed, held, embargoed, or cut inbound stays 10. Yard crates count arrivals, not this link.`;
  }
  return `Supply index ${value}. Shock when below 40.`;
}

export function globeFootRibbonHtml({
  treasuryCash = 0,
  tape = 0,
  oilSupply = 0,
  foodSupply = 0,
  oilIcon = '',
  foodIcon = '',
  advisory = '',
  cardOpen = false,
} = {}) {
  const clause = trimAdviceClause(advisory);
  const hideChrome = cardOpen || !clause;
  const advice = `<p class="province-advice-line" data-ribbon="advice"${hideChrome ? ' hidden' : ''}>${escapeHtml(clause)}</p>`;
  return `
    <span class="chrome-rivets" aria-hidden="true"></span>
    <!-- COPY-DRAFT: the shared Treasury relationship also appears in its hover title. -->
    <div class="province-tape-plate" data-ribbon="tape">
      <span class="province-tape-figure" data-tape="office" title="${escapeHtml(TREASURY_TITLE)}"><em>Treasury</em><b>${escapeHtml(money(treasuryCash))}</b></span>
      <span class="province-tape-figure" data-tape="listed" title="${escapeHtml(LISTED_TITLE)}"><em>Listed</em><b>${escapeHtml(moneyTape(tape))}</b></span>
    </div>
    <p class="province-money-key" data-ribbon="money-key">${MONEY_KEY_GLOBE}</p>
    <div class="province-goods" id="province-goods" data-ribbon="pressure" aria-label="Melbourne goods">
      <span class="province-good" data-good="oil" data-status="${oilSupply < 40 ? 'short' : 'working'}" title="${escapeHtml(pressureChipTitle('oil', oilSupply))}">${oilIcon}<span class="province-good-word">Oil</span><b class="province-good-value">${escapeHtml(String(oilSupply))}</b></span>
      <span class="province-good" data-good="food" data-status="${foodSupply < 40 ? 'short' : 'working'}" title="${escapeHtml(pressureChipTitle('food', foodSupply))}">${foodIcon}<span class="province-good-word">Food</span><b class="province-good-value">${escapeHtml(String(foodSupply))}</b></span>
    </div>
    ${advice}
    <a class="province-city-key" href="./play.html" data-ribbon="city">${CITY_KEY_GLYPH}<span>CITY</span></a>
  `;
}

export function assertDeskCopyCoverage() {
  const missing = WORLD_CITIES.filter((city) => !DESK_BLURB[city.id]).map((city) => city.id);
  const long = WORLD_CITIES.filter((city) => blurbWordCount(city.id) > 40).map((city) => city.id);
  return { missing, long, cities: WORLD_CITIES.length };
}

export { WORLD_CITY_BY_ID, money, escapeHtml };
