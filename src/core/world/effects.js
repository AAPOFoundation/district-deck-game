// How the globe’s books land on Melbourne. Pure given a world object.

import {
  WORLD_CITY_BY_ID,
  WORLD_PULSE_BOOKS,
  WORLD_PULSE_DAMAGE_BP,
  WORLD_TRADE_ROUTES,
  booksGuardedByStationedChokes,
  pulseDamageBp,
} from './catalog.js';
import { WORLD_RUN_KEY, inspectWorldRun, worldStoreGet } from './envelope.js';
import { desksUnderDisaster, pulseHitsDisasterDesks } from './disasters.js';
import { routeIsOpen } from './trade.js';

const GOOD_COPY = Object.freeze({
  oil: 'Oil',
  fittings: 'Fittings',
  modular: 'Modular',
  furniture: 'Furniture',
  tiles: 'Tiles',
  timber: 'Timber',
  chips: 'Chips',
  robots: 'Robots',
  tourists: 'Tourists',
  credit: 'Credit',
  food: 'Grain',
  people: 'Labour',
  asylum: 'Asylum',
  biotech: 'Biotech',
  'ancient-biotech': 'Ancient Biotech',
  coffee: 'Coffee',
  copper: 'Copper',
  iron: 'Iron',
  lithium: 'Lithium',
  'rare-earth': 'Rare earth',
  titanium: 'Titanium',
  cobalt: 'Cobalt',
  steel: 'Steel',
  nickel: 'Nickel',
  graphite: 'Graphite',
  aluminium: 'Aluminium',
  ceramics: 'Ceramics',
  platinum: 'Platinum',
  cocoa: 'Cocoa',
  lng: 'LNG',
  autos: 'Autos',
  wine: 'Wine',
  gold: 'Gold',
  marble: 'Marble',
  beer: 'Beer',
  warships: 'Warships',
  machinery: 'Machinery',
  turbines: 'Turbines',
  compute: 'Compute',
  starlink: 'Starlink',
  alien: 'Alien',
  'milk-powder': 'Milk powder',
  beef: 'Beef',
  education: 'Tuition',
  paper: 'Paper',
  ink: 'Ink',
  bibles: 'Bibles',
  pulp: 'Pulp',
  'pig-iron': 'Pig iron',
  bauxite: 'Bauxite',
  alumina: 'Alumina',
  quartz: 'Quartz',
  silicon: 'Silicon',
  polysilicon: 'Polysilicon',
  wafer: 'Wafer',
  die: 'Die',
  kaolin: 'Kaolin',
  magnets: 'Magnets',
  windings: 'Windings',
  motors: 'Motors',
  frames: 'Frames',
  castings: 'Castings',
  materials: 'Slag',
  uranium: 'Uranium',
  'enriched-uranium': 'Enriched uranium',
  warhead: 'Warhead',
  'missile-body': 'Missile body',
});

function supply(open, on = 100, off = 12) {
  return open ? on : off;
}

export function melbournePressure(world) {
  if (!world) {
    return melbournePressure({ routes: {}, pulses: [] });
  }

  const oilOpen = routeIsOpen(world, 'oil-hormuz-melbourne');
  const fittingsOpen = routeIsOpen(world, 'fittings-guangzhou-melbourne');
  const hkMod = routeIsOpen(world, 'modular-hongkong-melbourne');
  const seMod = routeIsOpen(world, 'modular-gothenburg-melbourne');
  const furnitureOpen = routeIsOpen(world, 'furniture-hcmc-melbourne');
  const tilesOpen = routeIsOpen(world, 'tiles-guangzhou-melbourne');
  const timberOpen = routeIsOpen(world, 'timber-jakarta-melbourne');
  const chipsOpen = routeIsOpen(world, 'chips-taipei-melbourne');
  const robotsOpen = routeIsOpen(world, 'robots-starbase-melbourne');
  const touristsOpen = routeIsOpen(world, 'tourists-singapore-melbourne');
  const creditOpen = routeIsOpen(world, 'credit-sydney-melbourne');
  const foodOpen = routeIsOpen(world, 'food-singapore-melbourne');
  const peopleOpen = routeIsOpen(world, 'people-mumbai-melbourne');
  const asylumOpen = routeIsOpen(world, 'asylum-levant-melbourne');
  const war = (world.pulses ?? []).some((pulse) => pulse.type === 'war-asylum');

  const oilSupply = supply(oilOpen);
  const fittingsSupply = supply(fittingsOpen, 100, 18);
  const modularSupply = Math.min(100, (hkMod ? 55 : 8) + (seMod ? 45 : 4));
  const furnitureSupply = supply(furnitureOpen, 100, 15);
  const tilesSupply = supply(tilesOpen, 100, 16);
  const timberSupply = supply(timberOpen, 100, 18);
  const chipsSupply = supply(chipsOpen, 100, 10);
  const robotsSupply = supply(robotsOpen, 100, 8);
  const touristsSupply = supply(touristsOpen, 100, 20);
  const creditSupply = supply(creditOpen, 100, 20);
  const foodSupply = supply(foodOpen, 100, 10);
  const immigration = peopleOpen ? 70 : 25;
  const asylum = war && asylumOpen ? 80 : asylumOpen ? 20 : 0;

  const guardedBooks = booksGuardedByStationedChokes(world.ambition?.stationedChokepoints);
  const disasterDesks = desksUnderDisaster(world);
  let pulseBp = 0;
  for (const pulse of world.pulses ?? []) {
    const full = WORLD_PULSE_DAMAGE_BP[pulse.type] ?? 0;
    if (!Number.isInteger(full) || full <= 0) continue;
    if (pulseHitsDisasterDesks(pulse.type, disasterDesks)) continue;
    const books = WORLD_PULSE_BOOKS[pulse.type] ?? [];
    const stationed = books.some((id) => guardedBooks.has(id));
    pulseBp += pulseDamageBp(pulse.type, stationed);
  }

  const materialsCostBp = 10000
    + Math.round((100 - fittingsSupply) * 10)
    + Math.round((100 - timberSupply) * 8)
    + Math.round((100 - modularSupply) * 6)
    + Math.round((100 - tilesSupply) * 4)
    + pulseBp
    - (creditOpen ? 400 : 0)
    - (robotsOpen ? 250 : 0);

  const rentDemandBp = Math.round(immigration * 1.4)
    + Math.round(touristsSupply * 0.9)
    + Math.round(asylum * 2.2)
    + Math.round(furnitureSupply * 0.3)
    - (foodSupply < 40 ? 180 : 0);

  const oilShock = oilSupply < 40;
  const foodShock = foodSupply < 40;
  const embargo = world.routes?.['oil-hormuz-melbourne']?.status === 'embargoed'
    || world.routes?.['fittings-guangzhou-melbourne']?.status === 'embargoed';

  const lines = WORLD_TRADE_ROUTES.map((route) => {
    const row = world.routes?.[route.id];
    const from = WORLD_CITY_BY_ID[route.from];
    return Object.freeze({
      id: route.id,
      good: route.good,
      label: GOOD_COPY[route.good],
      fromId: route.from,
      fromName: from?.mapName ?? route.from,
      status: row?.status ?? 'closed',
      openFee: route.openFee,
      playerOpenable: route.playerOpenable,
      register: route.register,
    });
  });

  const shipping = WORLD_TRADE_ROUTES
    .filter((route) => routeIsOpen(world, route.id))
    .map((route) => GOOD_COPY[route.good]);
  let register = shipping.length
    ? `${shipping.slice(0, 4).join(', ')}${shipping.length > 4 ? '…' : ''} shipping.`
    : 'No supplier books are open. Pay a city on the globe to start shipping cargo.';
  if (war) register = 'War is on. Asylum books are steaming south; rooms are wanted.';
  else if (oilOpen && fittingsOpen && foodOpen) {
    register = 'Oil, fittings, and grain are shipping. Timber, chips, and rooms can still run short.';
  }

  return Object.freeze({
    oilSupply,
    fittingsSupply,
    modularSupply,
    furnitureSupply,
    tilesSupply,
    timberSupply,
    chipsSupply,
    robotsSupply,
    touristsSupply,
    creditSupply,
    foodSupply,
    immigration,
    asylum,
    embargo,
    war,
    oilShock,
    foodShock,
    materialsCostBp,
    pulseDamageBp: pulseBp,
    rentDemandBp,
    register,
    lines,
  });
}

export function readStoredWorldPressure(store) {
  const inspected = inspectWorldRun(worldStoreGet(WORLD_RUN_KEY, store));
  if (inspected.status !== 'valid') return melbournePressure(null);
  return melbournePressure(inspected.world);
}

export function pressureLine(pressure) {
  if (!pressure) return 'No world books.';
  return [
    `Oil ${pressure.oilSupply}`,
    `Fittings ${pressure.fittingsSupply}`,
    `Modular ${pressure.modularSupply}`,
    `Food ${pressure.foodSupply}`,
  ].join(' · ');
}
