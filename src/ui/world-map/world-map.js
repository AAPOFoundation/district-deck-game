// Province globe. A Three.js voxel Earth; it never opens or imports the city engine.

import * as THREE from 'three';
import { wireCityReturn } from '../../core/session-bridge.js';
import { firstVisibleMarkerHit } from './marker-picking.js';
import { solveMapFrame } from './map-framing.js';
import { arrangeDossier } from './dossier-layout.js';
import { isPhoneTall, phoneMapRect, phoneDossierClosed, phonePanelHidden, yardTapOpensPanel, collapseYardDrawer } from './phone-globe.js';
import { anchoredPortLabels, portLabelTiers } from './port-labels.js';
import { requestedWorldSeed, loadWorldSession, importWorldSession } from './world-session.js';
import { liveFarmMarkers, farmMarkerSuffix } from './farm-markers.js';
import { CYBERCAB_PORT, CYBERCAB_LANE, CYBERCAB_ROUTE, liveCybercabCity, cybercabBookModel, cybercabBookHtml, createCybercabBookPoll } from './cybercab-book.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  WORLD_CITIES,
  WORLD_CHOKEPOINTS,
  WORLD_CREEDS,
  creditOffer,
  WORLD_CULTURE_HOLD,
  WORLD_CULTURE_NEED,
  WORLD_DRONE_WIN,
  WORLD_FORCE_KINDS,
  WORLD_FORCE_RECIPES,
  WORLD_BUILD_KIT_IDS,
  WORLD_BUILD_KITS,
  WORLD_MARS_PARTS,
  WORLD_MISSIONARY_COST,
  WORLD_OFFICER_COST,
  WORLD_STATION_COST,
  WORLD_TRADE_ROUTES,
  WORLD_TREASURY_START,
} from '../../core/world/catalog.js';
import { deskIsOpen, liveInstitutions, victoryProgress } from '../../core/world/ambition.js';
import { renderYardArrivalNotice } from './yard-notice.js';
import { yardCapacityChipModel } from '../port-warehouse-card.js';
import { ambitionRailHtml } from './ambition-rail.js';
import { ambitionArmedKey, ambitionCategoryHtml } from './ambition-groups.js';
import { makeOnlyDeskId, yardListHtml, yardDisclosureOptions } from './yard-list.js';
import { worktreePanelHtml } from '../worktree-panel.js';
import { itemIconHtml } from './item-icons.js';
import {
  bookButtonLabel,
  bookRegisterCopy,
  bookRouteTitle,
  bookStatusLabel,
  booksHeadingCopy,
  civ3MakeToggle,
  deskBlurb,
  deskCityForGood,
  deskLeadHtml,
  globeFootRibbonHtml,
  liveBookRegister,
  lineOpenedNotice,
  pressureChipTitle,
  primaryGoodForDesk,
} from './desk-copy.js';
import {
  isMineMakeDesk,
  makeOffCopy,
  makeOnCopy,
  makeToggleHintCopy,
} from '../../core/world/processes.js';
import {
  WORLD_RUN_KEY, buildAndStoreMarsPart,
  commissionAndStoreOfficer,
  foundAndStoreCreed, inspectWorldRun, openAndStoreMars, openAndStoreTrade,
  raiseAndStoreForce, readCityExports, sendAndStoreMission, serialiseWorld, setMineMakeAndStore,
  shipAndStoreBuildKit,
  feedAndStoreBiomind,
  startAndStoreBiomind, stationAndStoreBase, trainAndStoreMissionary,
  worldStoreGet, worldStoreSet,
} from '../../core/world/envelope.js';
import { shipmentLaneFraction } from '../../core/world/shipments.js';
import { quarterBeatCanon } from '../../core/world/quarter-beat.js';
import { melbournePressure } from '../../core/world/effects.js';
import { canRaiseForce } from '../../core/world/forces.js';
import { canOpenTradeRoute } from '../../core/world/trade.js';
import { hash32 } from '../../core/rng.js';
import {
  GLOBE_COLS,
  GLOBE_LAND_LIMIT,
  GLOBE_RADIUS,
  GLOBE_ROWS,
  ATMOSPHERE_LIMB,
  COAST_SKIRT,
  greatCircle,
  latLonToVector,
  rasterizeCoastFoam,
  rasterizeCoastSkirt,
  rasterizeGlobeVoxels,
  rasterizeLandRelief,
  RELIEF_LIMIT,
  TERRAIN_FILTER,
  BATHYMETRY_BANDS,
  bathymetryBandAt,
  coastDistanceAt,
  MERIDIAN_GRADUATIONS,
  LAND_SURFACE,
  meridianTickAt,
  shelfWeightAt,
} from './world-globe.js';
import {
  LAND_BIOMES,
  SMOOTH_LAND,
  SMOOTH_LAND_MATERIAL,
  buildSmoothLand,
  landFadeTarget,
  pinScaleForCamZ,
  stepLandFade,
} from './world-land-smooth.js';
import { P1_GROUNDING, P1_OCEAN, P1_GLOBE_LIGHT } from '../../render/v4-p1-polish.js';
import {
  CARGO_DAYS,
  CARGO_MODE,
  cargoLift,
  cargoWaypoints,
  isSeaCargo,
  pathStops,
  travelLabel,
  travelNote,
  travelPhrase,
} from './cargo-lanes.js';
import {
  OCEAN_BRDF, bindOceanMaterial, setOceanSun, tickCoastFoam, tickOceanMaterial,
} from './world-ocean.js';
import { WorldDisasterLayer } from './world-disasters.js';
import { addVoxelCargoProp, deskNeedsVoxelCargo } from './desk-cargo.js';
import { ESCORT_NATURE_COPY, liveDisasters } from '../../core/world/disasters.js';
import {
  WorldThreatLayer,
  appendThreatYardSegment,
  escortDossierNote,
  formatLiveThreatHold,
  labelsClear,
  liveThreatAdvice,
  placePriorityLabels,
  placedLabelRects,
  solveFightTilt,
  staggerLabels,
} from './world-threats.js';

const LOCAL_WORLD = hash32('district-deck:world:local');
const LAST_RUN_KEY = 'district-deck:v305:last-run';
const DISPOSE_KEY = '__districtDeckWorldMapDispose';
const STATS_KEY = '__districtDeckWorldMapStats';
const MELBOURNE_ID = 'melbourne-inner';
const ADELAIDE_WARSHIP_ID = 'warships-adelaide-melbourne';
const CARGO_SCALE = 0.0625;
const CARGO_SCALE_BY_GOOD = Object.freeze({
  credit: 0.028,
});
const VOXEL_CARGO_FIT = 10;
const CARGO_GLB_GOODS = Object.freeze([
  'oil', 'food', 'chips', 'robots', 'people', 'tourists', 'credit',
  'biotech', 'timber', 'fittings', 'modular', 'furniture', 'tiles', 'asylum',
  'coffee', 'copper', 'cocoa', 'lng', 'autos', 'wine', 'gold',
  'marble', 'beer', 'warships', 'compute', 'starlink', 'alien',
  'machinery', 'turbines',
  'quartz', 'iron', 'lithium', 'rare-earth', 'titanium', 'cobalt',
  'steel', 'nickel', 'graphite', 'aluminium', 'ceramics', 'platinum',
  'silicon', 'pulp', 'castings', 'windings', 'magnets', 'uranium',
  'ancient-biotech',
]);
const cargoTemplates = new Map();
const HIDDEN_GLOBE_CITY_IDS = new Set(['geelong-port', 'ballarat-gold']);
const GLOBE_CITIES = WORLD_CITIES.filter((city) => !HIDDEN_GLOBE_CITY_IDS.has(city.id));
const FORCE_VISUAL_CAP = 8;

const FOOTER_PRESSURE_GOODS = Object.freeze([
  Object.freeze({ good: 'oil', label: 'Oil', field: 'oilSupply' }),
  Object.freeze({ good: 'food', label: 'Food', field: 'foodSupply' }),
]);

const FORCE_TOKEN_PROFILE = Object.freeze({
  army: Object.freeze({
    label: 'Melbourne field wagon', domain: 'Land', yard: 'Melbourne Yard', upkeep: '$8k / beat',
  }),
  navy: Object.freeze({
    label: 'Bass Strait cutter', domain: 'Sea', yard: 'Melbourne Yard', upkeep: '$12k / beat',
  }),
  air: Object.freeze({
    label: 'Melbourne courier flight', domain: 'Air', yard: 'Melbourne Yard', upkeep: '$16k / beat',
  }),
  drone: Object.freeze({
    label: 'Melbourne drone wing', domain: 'Air', yard: 'Melbourne Yard', upkeep: '$14k / beat',
  }),
});

const FORCE_TOKEN_SITES = Object.freeze({
  army: Object.freeze([
    [-19.0, 141.0], [-34.9, 145.2], [-36.2, 141.7], [-33.9, 143.5],
    [-35.8, 147.0], [-34.2, 141.4], [-36.7, 143.2], [-34.8, 147.3],
  ]),
  navy: Object.freeze([
    [-41.2, 147.6], [-39.6, 147.2], [-39.1, 145.2], [-39.8, 144.1],
    [-40.2, 148.1], [-38.9, 149.2], [-40.5, 146.0], [-39.7, 142.8],
  ]),
  air: Object.freeze([
    [-28.5, 145.8], [-34.2, 143.5], [-35.1, 147.1], [-33.5, 145.8],
    [-36.0, 142.5], [-34.4, 148.4], [-33.1, 142.7], [-35.8, 149.0],
  ]),
  drone: Object.freeze([
    [-30.4, 144.8], [-32.6, 146.2], [-31.8, 142.9], [-29.7, 147.4],
    [-33.2, 144.1], [-31.1, 148.8], [-34.0, 146.6], [-30.8, 141.9],
  ]),
  nuke: Object.freeze([
    [-31.2, 136.9], [-29.8, 137.6], [-32.4, 135.8], [-30.1, 138.4],
    [-33.0, 136.2], [-28.9, 137.1], [-31.7, 134.9], [-30.6, 139.2],
  ]),
});

const GOOD_COLOUR = Object.freeze({
  oil: 0xc8a24a,
  fittings: 0x8c5a3a,
  modular: 0x6a7a8a,
  furniture: 0x7a6a3a,
  tiles: 0x8a7a6a,
  timber: 0x7a5a2a,
  chips: 0x3a5a7a,
  robots: 0x5a3a2a,
  tourists: 0xc8763f,
  credit: 0x6a4a3a,
  food: 0xd4b06a,
  people: 0x69796e,
  asylum: 0x8c3a3a,
  biotech: 0x3a7a5a,
  'ancient-biotech': 0x3a8a8a,
  uranium: 0xc4b45a,
  'enriched-uranium': 0xd8d46a,
  warhead: 0x6a5a3a,
  'missile-body': 0x5a6270,
  coffee: 0x6a3a22,
  copper: 0xb45a2a,
  iron: 0x8a4a2a,
  lithium: 0x8aa0b4,
  'rare-earth': 0x3a7a5a,
  titanium: 0x8a8a9a,
  cobalt: 0x2a4a8a,
  steel: 0x6a7278,
  nickel: 0x9a9080,
  graphite: 0x2a2a2e,
  aluminium: 0xc8ccd0,
  ceramics: 0xc49a72,
  platinum: 0xdce2e6,
  cocoa: 0x5a2a18,
  lng: 0x3a6a7a,
  autos: 0x3a4a6a,
  wine: 0x6a2a3a,
  gold: 0xc4a05a,
  machinery: 0x6a5a3a,
  turbines: 0x5a6a72,
  marble: 0xd0c8bc,
  beer: 0xc4a03a,
  warships: 0x4a5a6a,

  compute: 0x3a6a8a,
  starlink: 0x6a8aaa,
  alien: 0x5a8a6a,
  'milk-powder': 0xd0c4a8,
  beef: 0x8c3a2a,
  education: 0x3a3a5a,
  'pig-iron': 0x5a3a32,
  bauxite: 0x8a3a22,
  alumina: 0xd8d0c4,
  quartz: 0xc8c0b4,
  silicon: 0x4a4a52,
  polysilicon: 0x6a6a72,
  wafer: 0x3a4a5a,
  die: 0x2a3a4a,
  kaolin: 0xd4c8b8,
  magnets: 0x6a2a2a,
  windings: 0xb45a2a,
  motors: 0x4a5a4a,
  frames: 0x6a6270,
  castings: 0x5a4a3a,
  materials: 0x6a5a48,
  pulp: 0xc8bca8,
  paper: 0xd8d0c4,
  ink: 0x1a1a22,
  bibles: 0x6a3a2a,
});

const BOOK_NAME = Object.freeze({
  'oil-hormuz-melbourne': 'oil',
  'fittings-guangzhou-melbourne': 'fittings',
  'modular-hongkong-melbourne': 'modular',
  'modular-gothenburg-melbourne': 'luxury modular',
  'furniture-hcmc-melbourne': 'furniture',
  'tiles-guangzhou-melbourne': 'tiles',
  'timber-jakarta-melbourne': 'timber',
  'chips-taipei-melbourne': 'chips',
  'robots-starbase-melbourne': 'robots',
  'compute-starbase-melbourne': 'Boca compute',
  'starlink-starbase-melbourne': 'Starlink',
  'tourists-singapore-melbourne': 'tourists',
  'credit-sydney-melbourne': 'line of credit',
  'machinery-shanghai-melbourne': 'plant machinery',
  'ink-shanghai-melbourne': 'printing ink',
  'warships-adelaide-melbourne': 'warships',
  'beer-hobart-melbourne': 'beer',
  'marble-carrara-melbourne': 'marble',
  'ancient-biotech-antarctica-melbourne': 'ancient biotech',
  'uranium-olympic-melbourne': 'uranium',
  'alien-northpole-melbourne': 'alien tech',
  'turbines-london-melbourne': 'gas turbines',
  'asylum-levant-melbourne': 'asylum',
  'biotech-melbourne-london': 'biotech',
  'biotech-melbourne-losangeles': 'biotech',
  'biotech-melbourne-tokyo': 'biotech',
  'coffee-santos-melbourne': 'coffee',
  'copper-valparaiso-melbourne': 'copper',
  'iron-hedland-melbourne': 'iron',
  'lithium-greenbushes-melbourne': 'lithium',
  'rare-earth-weld-melbourne': 'rare earth',
  'titanium-eneabba-melbourne': 'titanium',
  'cobalt-kolwezi-melbourne': 'cobalt',
  'steel-pohang-melbourne': 'steel',
  'nickel-morowali-melbourne': 'nickel',
  'graphite-balama-melbourne': 'graphite',
  'aluminium-gladstone-melbourne': 'aluminium',
  'ceramics-seto-melbourne': 'ceramics',
  'platinum-rustenburg-melbourne': 'platinum',
  'cocoa-accra-melbourne': 'cocoa',
  'lng-doha-melbourne': 'LNG',
  'autos-nagoya-melbourne': 'cars',
  'wine-bordeaux-melbourne': 'wine',
  'gold-johannesburg-melbourne': 'gold',
  'people-mumbai-melbourne': 'labour',
  'grain-melbourne-singapore': 'grain',
  'fittings-melbourne-jakarta': 'fittings',
  'chips-melbourne-tokyo': 'chips',
  'steel-melbourne-tokyo': 'steel',
  'bibles-melbourne-singapore': 'bibles',
  'food-singapore-melbourne': 'grain',
  'milk-powder-hobart-melbourne': 'milk powder',
  'beef-santos-melbourne': 'beef',
  'education-mumbai-melbourne': 'tuition',
  'pig-iron-pohang-melbourne': 'pig iron',
  'bauxite-gladstone-melbourne': 'bauxite',
  'alumina-gladstone-melbourne': 'alumina',
  'quartz-eneabba-melbourne': 'quartz',
  'silicon-taipei-melbourne': 'silicon',
  'polysilicon-taipei-melbourne': 'polysilicon',
  'wafer-taipei-melbourne': 'wafers',
  'die-taipei-melbourne': 'dies',
  'kaolin-seto-melbourne': 'kaolin',
  'magnets-weld-melbourne': 'magnets',
  'windings-valparaiso-melbourne': 'windings',
  'motors-nagoya-melbourne': 'motors',
  'frames-pohang-melbourne': 'frames',
  'castings-pohang-melbourne': 'castings',
  'materials-pohang-melbourne': 'slag',
  'pulp-jakarta-melbourne': 'pulp',
  'paper-shanghai-melbourne': 'paper',
  'bibles-london-melbourne': 'bibles',
});

const KIND_LABEL = Object.freeze({
  rail: 'Overland rail',
  steamer: 'Cargo ship',
  tanker: 'Oil tanker',
  air: 'Air freight',
});

const GOOD_WHY = Object.freeze({
  oil: 'Crude fuels the works and the listed tape.',
  fittings: 'Steel, glass, and joinery for the works.',
  tiles: 'Tile and stone for inner floors.',
  modular: 'Whole rooms land as crates.',
  furniture: 'Chairs, beds, and joinery for inner rooms.',
  timber: 'Hardwood for frames, floors, and formwork.',
  chips: 'Electronics and silicon for works and tape.',
  robots: 'Yard robots and the compute stack.',
  tourists: 'Tourists fill hotels and inner rooms.',
  credit: 'Sydney sizes a loan to Melbourne’s listed tape. Repay each beat.',
  food: 'Grain feeds the inner kitchens.',
  people: 'Human labour from Mumbai takes rooms and works.',
  asylum: 'War lines. People, not cargo. This line opens when the guns do.',
  biotech: 'Melbourne’s export. Labs sell licences to the offtake desk.',
  'ancient-biotech': 'Antarctic ice-core specimens. Endgame biomind feedstock.',
  uranium: 'Olympic Dam uranium for the centrifuge works.',
  'enriched-uranium': 'Centrifuge product. Political red tape holds the works.',
  warhead: 'Assembled fusing and guidance. The pit is a separate crate.',
  'missile-body': 'Steel, aluminium, and castings for the airframe.',
  coffee: 'Santos beans for the inner kitchens.',
  copper: 'Chilean copper for wiring and the works.',
  iron: 'Pilbara iron for hulls and plates.',
  lithium: 'Greenbushes lithium for drone batteries.',
  'rare-earth': 'Mount Weld rare earth for motors and guidance.',
  titanium: 'Eneabba titanium for airframes.',
  cobalt: 'Kolwezi cobalt for batteries and magnets.',
  steel: 'Pohang stainless for hulls and frames.',
  nickel: 'Morowali nickel for engines and batteries.',
  graphite: 'Balama graphite for anodes.',
  aluminium: 'Gladstone aluminium from the smelter.',
  ceramics: 'Seto technical ceramics for tiles and liners.',
  platinum: 'Rustenburg platinum from the Bushveld.',
  cocoa: 'Ghanaian cocoa for kitchens and rooms.',
  lng: 'Qatari gas for the works and the listed tape.',
  autos: 'Nagoya cars fill the streets.',
  wine: 'Bordeaux wine for inner rooms.',
  gold: 'Witwatersrand bullion fattens the listed tape.',
  machinery: 'Shanghai plant machinery for the works.',
  turbines: 'London gas turbines for power and the works.',
  marble: 'Carrara marble for inner stone and facades.',
  beer: 'Hobart beer for inner rooms.',
  warships: 'Port Adelaide hulls for Bass Strait.',

  compute: 'Boca compute for the yard and the tape.',
  starlink: 'A constellation link from Boca.',
  alien: 'Polar alien tech. Breakthroughs stack in the yard.',
  paper: 'Pulped from timber in the works hall. Shanghai also sells a crate.',
  ink: 'Shanghai printing ink for the press.',
  bibles: 'Pressed from paper and ink. Missions spend one bible.',
  pulp: 'Jakarta pulp for the paper mill.',
  'pig-iron': 'Pohang pig-iron for the BOF.',
  bauxite: 'Gladstone bauxite for the Bayer plant.',
  alumina: 'Gladstone alumina for Hall-Héroult.',
  quartz: 'Eneabba quartz for the silicon furnace.',
  silicon: 'Taipei metallurgical silicon.',
  polysilicon: 'Taipei polysilicon for the Czochralski pull.',
  wafer: 'Taipei wafers for lithography.',
  die: 'Taipei dies for chip packing.',
  kaolin: 'Seto kaolin for the kiln.',
  magnets: 'Mount Weld rare-earth magnets.',
  windings: 'Valparaíso copper windings.',
  motors: 'Nagoya electric motors.',
  frames: 'Pohang steel frames.',
  castings: 'Pohang steel castings.',
  materials: 'Pohang slag for the works.',
});

const CHIP_NAME = Object.freeze({
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
  uranium: 'Uranium',
  'enriched-uranium': 'Enriched uranium',
  warhead: 'Warhead',
  'missile-body': 'Missile body',
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
  machinery: 'Machines',
  turbines: 'Turbines',
  marble: 'Marble',
  beer: 'Beer',
  warships: 'Ships',

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
});

const LABEL_OFFSETS = Object.freeze({
  'melbourne-inner': { x: 82, y: -72 },
  'sydney-harbour': { x: 82, y: -108 },
  'adelaide-light': { x: -86, y: -82 },
  'olympic-dam': { x: -54, y: -48 },
  'port-hedland': { x: -72, y: -28 },
  'greenbushes': { x: -88, y: 26 },
  'mount-weld': { x: -36, y: -40 },
  'eneabba-sands': { x: -78, y: 10 },
  'kolwezi': { x: -54, y: -24 },
  'hobart-derwent': { x: 74, y: -42 },
  'singapore-roads': { x: 58, y: 14 },
  'carrara-marble': { x: -40, y: 18 },
  'antarctica-dome': { x: -64, y: 12 },
  'northpole-base': { x: 0, y: -36 },
  'hongkong-peak': { x: -74, y: -2 },
  'guangzhou-fittings': { x: 40, y: -28 },
  'shanghai-bund': { x: -34, y: -30 },
  'taipei-chips': { x: 56, y: 18 },
  'hcmc-furniture': { x: 30, y: 30 },
  'jakarta-timber': { x: 48, y: 36 },
  'gothenburg-mod': { x: -40, y: -24 },
  'hormuz-roads': { x: -48, y: 10 },
  'starbase-texas': { x: 52, y: -18 },
  'levant-roads': { x: -52, y: -16 },
  'london-city': { x: 40, y: -12 },
  'santos-coffee': { x: 54, y: 18 },
  'valparaiso-copper': { x: -70, y: 14 },
  'accra-cocoa': { x: 42, y: 22 },
  'doha-lng': { x: 46, y: -16 },
  'nagoya-autos': { x: 58, y: -20 },
  'bordeaux-wine': { x: -54, y: 12 },
  'johannesburg-gold': { x: 56, y: 16 },
  'mumbai-cotton': { x: -50, y: 20 },
  'losangeles-harbour': { x: -62, y: -8 },
  'tokyo-harbour': { x: 62, y: -28 },
  pohang: { x: -46, y: -18 },
  morowali: { x: 42, y: 24 },
  balama: { x: 50, y: -20 },
  gladstone: { x: 118, y: -168 },
  seto: { x: -48, y: 16 },
  rustenburg: { x: -58, y: -20 },
  'cape-flattery': { x: 72, y: 16 },
  hsinchu: { x: 132, y: 14 },
  rotorua: { x: 96, y: 26 },
  sheffield: { x: -110, y: -36 },
  osaka: { x: 18, y: 44 },
  ningbo: { x: 36, y: 8 },
});

const previousDispose = globalThis[DISPOSE_KEY];
if (typeof previousDispose === 'function') previousDispose();

const landElement = document.getElementById('province-land');
const canvas = document.getElementById('province-canvas');
const labelsElement = document.getElementById('province-labels');
const routeLabelsElement = document.getElementById('province-route-labels');
const dossierElement = document.getElementById('province-dossier');
const yardElement = document.getElementById('province-yard');
const yardBeatElement = document.getElementById('province-yard-beat');
const cratesElement = document.getElementById('province-crates');
const ambitionActionsElement = document.getElementById('province-ambition-actions');
const yardNoticeElement = document.getElementById('province-yard-notice');
let treasuryElement = document.getElementById('province-treasury');
let goodsElement = document.getElementById('province-goods');
const footerElement = document.querySelector('.province-foot');

if (
  !landElement || !canvas || !labelsElement || !routeLabelsElement || !dossierElement || !yardElement
  || !yardBeatElement || !cratesElement
  || !ambitionActionsElement
  || !yardNoticeElement || !treasuryElement || !goodsElement
) {
  throw new Error('The voxel globe markup is incomplete.');
}

function makeYardCard(kind, title) {
  const card = document.createElement('section');
  card.className = `province-yard-card province-yard-card--${kind}`;
  card.dataset.yardCard = kind;
  const heading = document.createElement('h3');
  heading.className = 'province-yard-card-title';
  heading.textContent = title;
  card.append(heading);
  return card;
}

/** Group the existing Yard nodes without changing or dropping their controls. */
function mountYardCards() {
  if (yardElement.dataset.cardsReady === '1') return;
  const heading = yardElement.querySelector('.province-yard-heading');
  const lead = document.getElementById('province-yard-lead');
  const sections = [...yardElement.querySelectorAll(':scope > .province-yard-section')];
  if (!heading || !lead || sections.length < 2) return;

  const statusCard = makeYardCard('status', 'Yard status');
  const threatCard = makeYardCard('threat', 'Active threat');
  const ledgerCard = makeYardCard('ledger', 'Stores register');
  const registerScroll = document.createElement('div');
  registerScroll.className = 'province-yard-register-scroll';
  registerScroll.dataset.yardRegisterScroll = '1';
  const ambitionDisclosure = document.createElement('details');
  ambitionDisclosure.className = 'province-yard-ambition-disclosure';
  const ambitionSummary = document.createElement('summary');
  const ambitionTitle = document.createElement('span');
  const ambitionHint = document.createElement('small');
  ambitionTitle.textContent = 'Ambitions';
  ambitionHint.textContent = 'Five victory books';
  ambitionSummary.append(ambitionTitle, ambitionHint);
  ambitionDisclosure.append(ambitionSummary, ...sections.slice(1));
  heading.insertAdjacentElement('beforebegin', statusCard);
  statusCard.append(heading, lead);
  statusCard.insertAdjacentElement('afterend', threatCard);
  threatCard.insertAdjacentElement('afterend', ledgerCard);
  threatCard.append(yardNoticeElement);
  registerScroll.append(sections[0], ambitionDisclosure);
  ledgerCard.append(registerScroll);
  const content = document.createElement('div');
  content.id = 'province-yard-content';
  content.className = 'v4-yard-content';
  content.append(statusCard, threatCard, ledgerCard);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'v4-yard-toggle';
  toggle.textContent = 'The Yard · Stores & ambitions';
  toggle.setAttribute('aria-controls', content.id);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    yardElement.dataset.expanded = open ? '1' : '0';
  });
  yardElement.append(toggle, content);
  yardElement.dataset.cardsReady = '1';
}

function syncYardCards(activeThreat) {
  const card = yardElement.querySelector('[data-yard-card="threat"]');
  if (!card) return;
  card.classList.toggle('is-active', Boolean(activeThreat));
  card.dataset.active = activeThreat ? '1' : '0';
}

function mountRibbon() {
  if (!footerElement || footerElement.dataset.ribbonReady === '1') return;
  footerElement.innerHTML = globeFootRibbonHtml({
    treasuryCash: 0,
    tape: 0,
    oilSupply: 0,
    foodSupply: 0,
    oilIcon: itemIconHtml('oil'),
    foodIcon: itemIconHtml('food'),
  });
  treasuryElement = footerElement.querySelector('[data-ribbon="tape"]');
  goodsElement = footerElement.querySelector('#province-goods');
  footerElement.dataset.ribbonReady = '1';
  wireCityReturn(footerElement.querySelector('[data-ribbon="city"]'), window, { dismissPanel: dismissWorldPanel });
}

mountRibbon();
mountYardCards();

let yardNotice = '';
let selectedForce = null;
let selectedRouteId = null;
let selectedAmbition = null;
let selectedWorktreeGood = null;
let selectedDeskCityId = null;
let expandedAmbitionCategory = null;
let railArmed = null;

function labelsHidden() {
  return new URLSearchParams(location.search).get('bare') === '1';
}

function money(n) {
  const value = Math.round(n);
  if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(1)}T`;
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  return `$${value.toLocaleString('en-AU')}`;
}

function moneyTape(n) {
  const value = Math.round(n);
  if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(1)}T`;
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return money(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const STOCK_SINGULAR = Object.freeze({
  people: 'person',
  fittings: 'fitting',
  robots: 'robot',
  chips: 'chip',
  timber: 'timber',
  food: 'grain',
  oil: 'oil',
  iron: 'iron',
  lithium: 'lithium',
  'rare-earth': 'rare earth',
  titanium: 'titanium',
  cobalt: 'cobalt',
  copper: 'copper',
});


function forceTokenName(kind, index) {
  const profile = FORCE_TOKEN_PROFILE[kind];
  const escorted = kind === 'navy' ? escortedSeaBook(index) : null;
  if (escorted) {
    const source = cityById.get(escorted.from)?.mapName ?? escorted.from;
    return `${source} ${BOOK_NAME[escorted.id] ?? escorted.good} escort ${index + 1}`;
  }
  return `${profile?.label ?? kind} ${index + 1}`;
}

function firstWorkingSeaBook() {
  return WORLD_TRADE_ROUTES.find((route) => (
    isSeaCargo(route.id)
    && world.routes?.[route.id]?.status === 'open'
  )) ?? null;
}

function escortTicket(index) {
  return (world.requests ?? []).find((request) => (
    request?.kind === 'escort'
    && request.index === index
    && typeof request.book === 'string'
  )) ?? null;
}

function escortedSeaBook(index) {
  const ticket = escortTicket(index);
  const route = ticket
    ? WORLD_TRADE_ROUTES.find((candidate) => candidate.id === ticket.book)
    : null;
  if (!route || !isSeaCargo(route.id)) return null;
  return world.routes?.[route.id]?.status === 'open' ? route : null;
}

function forceTokenStation(kind, index) {
  if (kind === 'army') return 'Inland Australia · north-west of Melbourne';
  if (kind === 'air') return 'Melbourne · above the city';
  if (kind === 'drone') return 'Melbourne · drone corridor';
  const escorted = escortedSeaBook(index);
  if (!escorted) return 'Bass Strait';
  const source = cityById.get(escorted.from)?.mapName ?? escorted.from;
  return `${BOOK_NAME[escorted.id] ?? escorted.good} · ${source} line · mid-route`;
}

function forceDossierHtml(kind, index) {
  const profile = FORCE_TOKEN_PROFILE[kind];
  if (!profile) return '';
  const escorted = kind === 'navy' ? escortedSeaBook(index) : null;
  const escortTarget = kind === 'navy' ? firstWorkingSeaBook() : null;
  const order = escorted ? 'Escort' : 'Hold';
  return `
    <h2>${escapeHtml(forceTokenName(kind, index))}</h2>
    <span class="province-status province-force-brief-status">MILITARY brief</span>
    <dl class="province-force-brief">
      <div>
        <dt>Domain</dt>
        <dd>${escapeHtml(profile.domain)}</dd>
      </div>
      <div>
        <dt>Home yard</dt>
        <dd>${escapeHtml(profile.yard)}</dd>
      </div>
      <div>
        <dt>Station</dt>
        <dd>${escapeHtml(forceTokenStation(kind, index))}</dd>
      </div>
      <div>
        <dt>Upkeep</dt>
        <dd>${escapeHtml(profile.upkeep)}</dd>
      </div>
      <div class="province-force-order">
        <dt>Order</dt>
        <dd>${order}</dd>
      </div>
    </dl>
    <div class="province-force-orders" aria-label="MILITARY orders">
      <button type="button"
              class="province-force-order-button"
              data-order="hold"
              data-force="${escapeHtml(kind)}"
              data-index="${index}">Hold</button>
      <button type="button"
              class="province-force-order-button"
              data-order="escort"
              data-force="${escapeHtml(kind)}"
              data-index="${index}"
              data-book="${escapeHtml(escortTarget?.id ?? '')}"
              ${escortTarget ? '' : 'disabled'}>
        ${escortTarget ? `Escort ${escapeHtml(BOOK_NAME[escortTarget.id] ?? escortTarget.good)}` : 'Escort'}
      </button>
      <button type="button" disabled>Show flag</button>
      <button type="button" disabled>Disband</button>
    </div>
    <p class="province-force-orders-note">${escapeHtml(ESCORT_NATURE_COPY)}</p>
    ${escorted ? escortThreatNoteHtml(escorted.id) : ''}
    <p class="province-force-orders-note">Show flag and Disband — not this sitting.</p>
  `;
}

function escortThreatNoteHtml(bookId) {
  const note = escortDossierNote(world, bookId);
  if (!note) return '';
  return `<p class="province-force-threat">${escapeHtml(note)}</p>`;
}

function routeDossierHtml(routeId) {
  const route = WORLD_TRADE_ROUTES.find((candidate) => candidate.id === routeId);
  if (!route) return '';
  const row = world.routes?.[route.id] ?? { status: 'closed', opened: false, untilBeat: null };
  const check = canOpenTradeRoute(world, route.id);
  const source = cityById.get(route.from)?.mapName ?? route.from;
  const dest = cityById.get(route.to)?.mapName ?? route.to;
  const via = pathStops(route.id);
  const kind = travelLabel(route.id);
  const days = CARGO_DAYS[route.id];
  const outbound = route.from === MELBOURNE_ID;
  const remaining = row.untilBeat == null ? null : Math.max(0, row.untilBeat - world.beat);
  const status = row.status === 'open'
    ? 'Open'
    : row.status === 'embargoed' || row.status === 'held'
      ? `HOLD${remaining == null ? '' : ` · ${remaining} beat${remaining === 1 ? '' : 's'}`}`
      : row.status === 'cut'
        ? 'Cut'
        : 'Closed';
  const note = row.status === 'open'
    ? (outbound
      ? `Open to ${dest}. ${bookRegisterCopy(route)}`
      : 'The route is open. Cargo sails each beat.')
    : row.status === 'held'
      ? 'Held. Nature has the book. Escorts do not protect against nature.'
      : row.status === 'embargoed'
        ? 'Held. Wait the embargo before cargo can move.'
        : row.status === 'cut'
          ? 'The line is cut.'
          : bookRegisterCopy(route);
  const openButton = row.status === 'closed' && route.playerOpenable
    ? `
      <button type="button"
              class="province-open-book"
              data-route="${escapeHtml(route.id)}"
              ${check.ok ? '' : 'disabled'}>
        ${escapeHtml(bookButtonLabel(route, row, route.openFee))}
      </button>
      ${check.reason && !check.ok
    ? `<p class="province-book-reason">${escapeHtml(check.reason)}</p>`
    : ''}
    `
    : '';
  return `
    <h2>${escapeHtml(outbound
    ? `${CHIP_NAME[route.good] ?? BOOK_NAME[route.id] ?? route.good} to ${dest}`
    : `${CHIP_NAME[route.good] ?? BOOK_NAME[route.id] ?? route.good} from ${source}`)}</h2>
    <p class="province-lead">${outbound
    ? `${escapeHtml(dest)} offtake. Melbourne offers ${escapeHtml(CHIP_NAME[route.good] ?? BOOK_NAME[route.id] ?? route.good)} to ${escapeHtml(dest)}.`
    : `${escapeHtml(source)} supply. ${escapeHtml(source)} offers ${escapeHtml(CHIP_NAME[route.good] ?? BOOK_NAME[route.id] ?? route.good)}. ${escapeHtml(GOOD_WHY[route.good] ?? '')}`}</p>
    <span class="province-status" data-status="${escapeHtml(row.status)}">${escapeHtml(status)} line</span>
    <dl class="province-book-brief">
      <div>
        <dt>Travels by</dt>
        <dd>${escapeHtml(kind)}</dd>
      </div>
      <p class="province-kind-note">${escapeHtml(travelNote(route.id))}</p>
      <div>
        <dt>Voyage</dt>
        <dd>About ${days} day${days === 1 ? '' : 's'}</dd>
      </div>
      <div>
        <dt>Stops</dt>
        <dd>${escapeHtml(via)}</dd>
      </div>
      <div>
        <dt>Status</dt>
        <dd>${escapeHtml(status)}</dd>
      </div>
      <div>
        <dt>Fee</dt>
        <dd>${money(route.openFee)}</dd>
      </div>
    </dl>
    <p class="province-book-working" data-status="${escapeHtml(row.status)}">${escapeHtml(note)}</p>
    <div class="province-book-actions">
      <button type="button"
              class="province-frame-book"
              data-route="${escapeHtml(route.id)}">
        Frame source
      </button>
      ${openButton}
    </div>
  `;
}

function tapeVisualRatio(have, need) {
  const lo = Math.log10(1_000_000_000);
  const hi = Math.log10(Math.max(need, 1_000_000_000_000));
  const x = Math.log10(Math.max(have, 1_000_000_000));
  return Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
}

function objectDotsHtml(have, need, className, creedId = '') {
  const creed = creedId ? ` data-creed="${escapeHtml(creedId)}"` : '';
  return `<span class="${className}"${creed} aria-hidden="true">${
    Array.from({ length: need }, (_, index) => `<i data-fill="${index < have ? '1' : '0'}"></i>`).join('')
  }</span>`;
}

function marsHullSvg(stackedParts, caption) {
  const on = (id) => (stackedParts.includes(id) ? '1' : '0');
  return `
    <figure class="province-hull">
      <svg class="province-hull-svg" viewBox="0 0 320 110" role="img" aria-label="Mars hull">
        <polygon data-part="probe" data-on="${on('probe')}" points="8,55 64,18 64,92"></polygon>
        <rect data-part="habitat" data-on="${on('habitat')}" x="62" y="24" width="92" height="62" rx="10"></rect>
        <circle class="province-hull-port" cx="90" cy="55" r="9"></circle>
        <circle class="province-hull-port" cx="118" cy="55" r="9"></circle>
        <rect data-part="drive" data-on="${on('drive')}" x="152" y="30" width="62" height="50" rx="5"></rect>
        <rect data-part="life" data-on="${on('life')}" x="212" y="18" width="34" height="74" rx="16"></rect>
        <polygon data-part="stack" data-on="${on('stack')}" points="244,26 292,12 314,55 292,98 244,84"></polygon>
      </svg>
      <figcaption>${escapeHtml(caption)}</figcaption>
    </figure>
  `;
}

function tapeHistographSvg(have, beat) {
  const lo = 9;
  const hi = 13;
  const padL = 40;
  const padR = 10;
  const padT = 8;
  const padB = 20;
  const width = 320;
  const height = 118;
  const start = 4_000_000_000;
  const xMaxBeat = Math.max(beat, 8);
  const xFor = (value) => padL + ((value / xMaxBeat) * (width - padL - padR));
  const yFor = (value) => {
    const t = (Math.log10(Math.max(value, 1_000_000_000)) - lo) / (hi - lo);
    return padT + ((1 - t) * (height - padT - padB));
  };
  const ticks = [
    [1_000_000_000, '$1B'],
    [10_000_000_000, '$10B'],
    [100_000_000_000, '$100B'],
    [1_000_000_000_000, '$1T'],
    [10_000_000_000_000, '$10T'],
  ];
  const grid = ticks.map(([value, label]) => {
    const y = yFor(value);
    return `<line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="#5a3a22" stroke-width="0.7"></line>
      <text x="4" y="${y + 3}" fill="#c4a05a" font-size="9">${label}</text>`;
  }).join('');
  const perBeat = beat > 0 ? (have - start) / beat : 0;
  const verts = [];
  let prevY = yFor(start);
  verts.push(`${xFor(0)},${prevY}`);
  for (let step = 1; step <= beat; step += 1) {
    const x = xFor(step);
    verts.push(`${x},${prevY}`);
    prevY = yFor(start + (step * perBeat));
    verts.push(`${x},${prevY}`);
  }
  const line = `<polyline fill="none" stroke="#d8b05a" stroke-width="2.4" points="${verts.join(' ')}"></polyline>
    <circle cx="${xFor(beat)}" cy="${yFor(have)}" r="3.5" fill="#ead4a6"></circle>`;
  return `
    <svg class="province-histograph" viewBox="0 0 ${width} ${height}" role="img" aria-label="Tape histograph, log from one billion to ten trillion">
      <rect width="${width}" height="${height}" fill="#1f1810"></rect>
      ${grid}
      ${line}
      <text x="${padL}" y="${height - 6}" fill="#8a7350" font-size="9">Beat 0</text>
      <text x="${width - padR}" y="${height - 6}" fill="#8a7350" font-size="9" text-anchor="end">Beat ${xMaxBeat}</text>
    </svg>
  `;
}

function paintYardCapacity() {
  const chip = yardCapacityChipModel(world);
  let el = document.getElementById('province-yard-capacity');
  if (!el) {
    el = document.createElement('p');
    el.id = 'province-yard-capacity';
    el.className = 'province-yard-capacity';
    const heading = yardElement.querySelector('.province-yard-heading');
    (heading ?? yardBeatElement).insertAdjacentElement('afterend', el);
  }
  el.innerHTML = `
    <span class="province-yard-capacity-title">PORT</span>
    <span class="province-yard-capacity-key">Yard</span>
    <b class="province-yard-capacity-value">${chip.used.yard}/${chip.cap.yard}</b>
    <span class="province-yard-capacity-key">Secure</span>
    <b class="province-yard-capacity-value">${chip.used.warehouse}/${chip.cap.warehouse}</b>
    <span class="province-yard-capacity-key">Tank</span>
    <b class="province-yard-capacity-value">${chip.used.tank}/${chip.cap.tank}</b>`;
  el.setAttribute('aria-label', chip.text);
  el.title = chip.text;
  el.classList.toggle('is-amber', chip.tone === 'amber');
  el.classList.toggle('is-red', chip.tone === 'red');
}

function paintYard() {
  const payload = readCityExports();
  const canon = quarterBeatCanon({
    cityQuarter: payload?.quarter ?? world.ambition?.lastLedgerQuarter ?? null,
    worldBeat: world.beat ?? 0,
    lastLedgerQuarter: world.ambition?.lastLedgerQuarter ?? null,
    lastLedgerAppliedBeat: world.ambition?.lastLedgerAppliedBeat ?? null,
  });
  yardBeatElement.textContent = canon.globePlate;
  yardBeatElement.title = canon.driftTitle;
  yardBeatElement.classList.toggle('is-drift', canon.drift);
  paintYardCapacity();
  cratesElement.innerHTML = yardListHtml(world, {
    ...yardDisclosureOptions(cratesElement),
    armedGood: railArmed?.kind === 'good' ? railArmed.id : null,
  });
  ambitionActionsElement.innerHTML = ambitionCategoryHtml(world, {
    expandedId: expandedAmbitionCategory,
    armedWin: railArmed?.kind === 'win' ? railArmed.id : null,
    armedKey: railArmed?.kind === 'key' ? railArmed.id : null,
  });
  const threatHold = formatLiveThreatHold(world);
  const shown = threatHold ? appendThreatYardSegment(yardNotice, threatHold) : yardNotice;
  yardNoticeElement.textContent = shown;
  yardNoticeElement.hidden = !shown;
  yardNoticeElement.classList.toggle('threat-live', Boolean(threatHold));
  syncYardCards(Boolean(threatHold));
}

function worldSeedFromUrl() {
  return requestedWorldSeed(location.search);
}

const GLOBE_SEEN_BEAT_KEY = 'dd:world-globe:seen-beat';

function readGlobeSeenBeat(seed) {
  try {
    const raw = sessionStorage.getItem(GLOBE_SEEN_BEAT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.seed === seed && Number.isInteger(parsed.beat)) return parsed.beat;
  } catch { /* optional storage */ }
  return null;
}

function writeGlobeSeenBeat(seed, beat) {
  try {
    sessionStorage.setItem(GLOBE_SEEN_BEAT_KEY, JSON.stringify({ seed, beat }));
  } catch { /* optional storage */ }
}

async function loadOrCreateWorld(request) {
  let result = loadWorldSession({ request, defaultSeed: LOCAL_WORLD });
  if (result.status === 'ready') return result.world;
  const main = document.querySelector('#province');
  main.hidden = true;
  worldBootPhase('recovery');
  const recovery = document.createElement('section');
  recovery.dataset.worldRecovery = '1';
  recovery.setAttribute('aria-labelledby', 'world-recovery-title');
  recovery.style.cssText = 'max-width:38rem;margin:10vh auto;padding:2rem;background:#252b31;color:#f1e8d6;font:16px/1.6 system-ui;border:1px solid #9b8868;border-radius:12px;';
  document.body.append(recovery);
  return new Promise((resolve) => {
    let importCandidate = null;
    let recoveryNotice = '';
    const retry = () => {
      result = loadWorldSession({ request, defaultSeed: LOCAL_WORLD });
      if (result.status !== 'ready') { paintRecovery(); return; }
      recovery.remove();
      main.hidden = false;
      worldBootPhase('loading', 'Preparing ports and shipping lines.');
      resolve(result.world);
    };
    const paintRecovery = () => {
      recovery.replaceChildren();
      const title = document.createElement('h1');
      title.id = 'world-recovery-title';
      title.textContent = 'Your world save is protected';
      const detail = document.createElement('p');
      detail.setAttribute('role', 'status');
      detail.textContent = result.status === 'seed-conflict'
        ? `This link requests world ${result.requestedSeed}, but your saved world is ${result.world.worldSeed}. Resume your saved world to keep its progress.`
        : result.status === 'invalid-save'
          ? 'This world save is damaged or belongs to another version. It has not been replaced. Choose a compatible saved world to restore it; your original will be backed up before replacement.'
          : result.status === 'invalid-seed'
            ? 'This link has an invalid world seed. Continue without that parameter to resume your saved world, or create one if no save exists.'
            : result.reason ?? 'World storage is unavailable. Allow local storage and retry. The globe cannot safely save progress yet.';
      if (recoveryNotice) detail.textContent += ` ${recoveryNotice}`;
      const addButton = (label, action) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.style.cssText = 'margin:8px 12px 8px 0;padding:10px 16px;font:inherit;cursor:pointer;';
        button.addEventListener('click', action);
        recovery.append(button);
      };
      recovery.append(title, detail);
      if (result.status === 'invalid-save') {
        const picker = document.createElement('input');
        picker.type = 'file';
        picker.accept = '.json,application/json';
        picker.hidden = true;
        picker.setAttribute('aria-label', 'Choose a compatible saved world');
        picker.addEventListener('change', async () => {
          const file = picker.files?.[0];
          if (!file) return;
          try {
            const raw = await file.text();
            const inspected = inspectWorldRun(raw);
            if (inspected.status !== 'valid') throw new Error('That file is not a compatible world save.');
            importCandidate = { raw, world: inspected.world };
            recoveryNotice = `Selected world ${inspected.world.worldSeed}, beat ${inspected.world.beat}. Import it to replace the damaged save.`;
          } catch (error) {
            importCandidate = null;
            recoveryNotice = error.message || 'The selected file could not be read.';
          }
          paintRecovery();
        });
        recovery.append(picker);
        addButton('Choose saved world', () => picker.click());
        if (importCandidate) addButton('Import selected world', () => {
          const imported = importWorldSession({ candidateRaw: importCandidate.raw, expectedRaw: result.raw });
          if (!imported.ok) { recoveryNotice = imported.reason; paintRecovery(); return; }
          const url = new URL(location.href);
          url.searchParams.delete('worldSeed');
          history.replaceState(null, '', url);
          request = { kind: 'absent' };
          importCandidate = null;
          recoveryNotice = 'Your original save was retained in a recovery backup.';
          retry();
        });
      }
      if (result.status === 'seed-conflict' || result.status === 'invalid-seed') {
        addButton(result.status === 'seed-conflict' ? 'Resume saved world' : 'Continue without seed override', () => {
          const url = new URL(location.href);
          url.searchParams.delete('worldSeed');
          history.replaceState(null, '', url);
          request = { kind: 'absent' };
          retry();
        });
      }
      if (result.raw != null) addButton('Download save copy', () => {
        const url = URL.createObjectURL(new Blob([result.raw], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'district-deck-world-save.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      addButton('Retry', retry);
      addButton('Return to city', () => footerElement.querySelector('[data-ribbon="city"]').click());
      recovery.querySelector('button')?.focus();
    };
    paintRecovery();
  });
}

function routeBookHtml(route) {
  const row = world.routes[route.id] ?? { status: 'closed' };
  const check = canOpenTradeRoute(world, route.id);
  const bookName = BOOK_NAME[route.id] ?? route.good;
  const reasonId = `province-book-reason-${route.id}`;
  const reason = check.ok ? '' : check.reason;
  const source = cityById.get(route.from)?.mapName ?? route.from;
  const dest = cityById.get(route.to)?.mapName ?? route.to;
  let register = liveBookRegister(route, row, world);
  const remaining = row.untilBeat == null ? null : Math.max(0, row.untilBeat - world.beat);
  const statusLabel = bookStatusLabel(route, row, remaining);
  const buttonLabel = bookButtonLabel(route, row, check.fee);
  return `
    <article class="province-book" data-status="${row.status}">
      <div class="province-book-line">
        <strong class="province-book-title" data-book-title="${escapeHtml(bookRouteTitle(route))}">${escapeHtml(bookRouteTitle(route))}</strong>
        <span class="province-book-status" data-status="${row.status}"> — ${escapeHtml(statusLabel)}</span>
      </div>
      <p>${escapeHtml(register)}</p>
      <button type="button"
              class="province-open-book"
              data-route="${route.id}"
              aria-describedby="${reasonId}"
              ${check.ok ? '' : 'disabled'}>
        ${escapeHtml(buttonLabel)}
      </button>
      <p class="province-book-reason" id="${reasonId}" ${reason ? '' : 'hidden'}>
        ${escapeHtml(reason)}
      </p>
    </article>
  `;
}

function melbourneDossierHtml(city) {
  const inbound = WORLD_TRADE_ROUTES
    .filter((route) => route.to === MELBOURNE_ID && route.playerOpenable);
  const working = inbound.filter((route) => world.routes?.[route.id]?.status === 'open');
  const shut = inbound.filter((route) => world.routes?.[route.id]?.status !== 'open');
  const bookLabel = (route) => {
    const source = cityById.get(route.from)?.mapName ?? route.from;
    return `${CHIP_NAME[route.good] ?? BOOK_NAME[route.id] ?? route.good} ${source}`;
  };
  const workingBooks = working.length
    ? working.map((route) => `
      <button type="button"
              class="province-working-book"
              data-route="${escapeHtml(route.id)}">
        ${escapeHtml(bookLabel(route))}
      </button>
    `).join('<span aria-hidden="true"> · </span>')
    : '<span>none</span>';
  const shutPreview = shut.slice(0, 6);
  const shutMore = shut.length - shutPreview.length;
  const shutBooks = shutPreview.map((route) => {
    const row = world.routes?.[route.id] ?? { status: 'closed', untilBeat: null };
    const remaining = row.untilBeat == null ? null : Math.max(0, row.untilBeat - world.beat);
    const action = row.status === 'embargoed'
      ? `HOLD${remaining == null ? '' : ` ${remaining}`}`
      : row.status === 'cut'
        ? 'CUT'
        : money(route.openFee);
    return `
      <li>
        <button type="button"
                class="province-shut-book"
                data-route="${escapeHtml(route.id)}">
          <span>${escapeHtml(bookLabel(route))}</span>
          <em>${escapeHtml(action)}</em>
        </button>
      </li>
    `;
  }).join('');
  return `
    <span class="province-status" data-status="open">yours</span>
    <h2>${escapeHtml(city.mapName)}</h2>
    <p class="province-lead">Melbourne — our home harbour. Import cargo here; sell Biotech to Los Angeles, Tokyo, and London.</p>
    <p class="province-advice${liveThreatAdvice(world) ? ' threat-live' : ''}"><strong>Advice</strong><span>${escapeHtml(liveThreatAdvice(world) || pressure.register)}</span></p>
    <div class="province-working-band">
      <strong>Shipping</strong>
      <span>${workingBooks}</span>
    </div>
    <details class="province-shut-band">
      <summary>
        <strong>Shut ${shut.length}</strong>
        <span>establish a trade route</span>
      </summary>
      <ul>${shutBooks}${shutMore > 0 ? `<li class="province-shut-more">${shutMore} more desks on the globe</li>` : ''}</ul>
    </details>
  `;
}

function cityDeskRoutes(cityId) {
  return WORLD_TRADE_ROUTES.filter((route) => (
    route.from === cityId || (route.from === MELBOURNE_ID && route.to === cityId)
  ));
}

function deskRegister(city, deskStatus) {
  if (city.id === 'adelaide-light') {
    const shipStatus = world.routes[ADELAIDE_WARSHIP_ID]?.status ?? deskStatus;
    if (shipStatus === 'open') {
      return 'Port Adelaide is sending warships along the Bight.';
    }
    if (shipStatus === 'embargoed' || shipStatus === 'cut') {
      return 'The warship line is paid, but the Bight run is held.';
    }
  }
  return null;
}

function dossierHtml(city, record) {
  if (city.id === MELBOURNE_ID) return melbourneDossierHtml(city);
  const deskRoutes = cityDeskRoutes(city.id);
  const deskStatus = deskRoutes.length === 1
    ? (world.routes[deskRoutes[0].id]?.status ?? 'closed')
    : record.status;
  const booksHeading = booksHeadingCopy(deskRoutes);
  const books = deskRoutes.length ? `
    <p class="province-books-heading">${booksHeading}</p>
    <div class="province-books">${deskRoutes.map(routeBookHtml).join('')}</div>
  ` : '<p class="province-book-none">No cargo line is offered from this city.</p>';
  const liveRegister = deskRegister(city, deskStatus);
  const lead = liveRegister ? escapeHtml(liveRegister) : deskLeadHtml(city);
  const caption = deskBlurb(city.id);
  const makeOn = world.ambition?.mineMake?.[city.id] === true;
  const makeBlock = isMineMakeDesk(city.id) ? `
    <div class="province-make" data-on="${makeOn ? '1' : '0'}">
      <p>${escapeHtml(makeOn ? makeOnCopy() : makeOffCopy())}</p>
      <button type="button"
              class="province-make-toggle"
              data-desk="${escapeHtml(city.id)}"
              data-on="${makeOn ? '1' : '0'}">
        ${escapeHtml(civ3MakeToggle(makeOn))}
      </button>
      <p class="province-make-key">${escapeHtml(makeToggleHintCopy())}</p>
    </div>
  ` : '';
  return `
    <span class="province-status" data-status="${deskStatus}">${deskStatus === 'open' ? 'Open' : deskStatus === 'closed' ? 'Closed' : deskStatus}</span>
    <h2>${escapeHtml(city.mapName)}</h2>
    <p class="province-lead">${lead}</p>
    ${caption ? `<p class="province-caption">${escapeHtml(caption)}</p>` : ''}
    ${makeBlock}
    ${books}
  `;
}

if (labelsHidden()) document.body.classList.add('bare-chart');

const seed = worldSeedFromUrl();
let world = await loadOrCreateWorld(seed);
worldBootPhase('loading', 'Preparing ports and shipping lines.');
writeGlobeSeenBeat(world.worldSeed, world.beat);
const cityById = new Map(WORLD_CITIES.map((city) => [city.id, city]));
const raster = rasterizeGlobeVoxels();
const foamRaster = rasterizeCoastFoam();
const skirtRaster = rasterizeCoastSkirt();
const reliefRaster = rasterizeLandRelief();

/**
 * MC3 F8 — the globe's value floor. `GLOBE_OCEAN_HEX` is a hair deeper than
 * `P1_OCEAN.color` so the added emissive does not wash the lit side; the
 * emissive pair is the floor itself, and `GLOBE_VOID_HEX` is the room behind.
 */
const GLOBE_OCEAN_HEX = 0x1d5f7c;
/*
 * ── P14-M9 ITEM 1 — WHY THE FLOOR CAME DOWN FROM 0.62. ──
 *
 * MC3 F8's finding is not in dispute: with no floor the night half measured
 * luma 3 and 59-62 % of the map rectangle sat below luma 24, which is a hole in
 * the desk rather than a planet. The floor closed that and it stays.
 *
 * What it also did, at 0.62, was become the LARGEST single contribution to the
 * sea's value on both halves of the globe — and an emissive term ignores the
 * normal, the key and the sun angle by construction. So no shelf, no
 * terminator and no specular track could read through it: pack-i's "featureless
 * billiard-ball sea" and pack-j's "toy-gloss ocean with no water shading" are
 * both partly a description of a uniform emissive.
 *
 * 0.44 with an emissive MAP is the same idea done so it can carry information:
 * the floor is modulated by the shelf texture, so the night sea still shows
 * where the water is shallow, and `world-ocean.js` scales what is left down to
 * `OCEAN_TERMINATOR.dayFloor` on the lit half where the key is doing the work.
 * The night-side share below luma 24 is measured in the M9 report.
 */
// M11 item 3 — the floor is added FLAT to every pixel of the sphere, so its
// hue is a bigger share of the sea's screen colour than any albedo. G1 lowers
// that floor to 0.30 and turns it deep blue-green: enough night-side context
// to avoid a void without lifting the physical day-side response.
const GLOBE_OCEAN_FLOOR_HEX = 0x102f3d;
const GLOBE_OCEAN_FLOOR_I = 0.30;
const GLOBE_VOID_HEX = 0x6d5f52;
/** The horizon band: where the sea meets the limb, it catches the light. */
const GLOBE_HORIZON_HEX = 0x8fc0d8;
const GLOBE_HORIZON_OPACITY = 0.045;

function horizonBandTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  // Nothing inside the globe's own disc; a bright band at the limb; a short
  // falloff outside it. The globe occludes the inner half, so what shows is a
  // specular horizon and a breath of atmosphere beyond it.
  g.addColorStop(0.000, 'rgba(143, 192, 216, 0)');
  g.addColorStop(0.605, 'rgba(143, 192, 216, 0)');
  g.addColorStop(0.648, 'rgba(143, 192, 216, 0.55)');
  g.addColorStop(0.672, 'rgba(176, 214, 228, 0.95)');
  g.addColorStop(0.700, 'rgba(143, 192, 216, 0.42)');
  g.addColorStop(0.800, 'rgba(96, 140, 168, 0.16)');
  g.addColorStop(1.000, 'rgba(96, 140, 168, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* ================================================================== *
 * P14 M9 ITEM 1 — THE OCEAN IS A SEA, NOT A BILLIARD BALL.
 *
 * MC4 pack-i / pack-j: "single-key ocean specular sells a physical sphere" as
 * the STRENGTH, and "voxel continents sit on a toy-gloss billiard-ball ocean
 * with no coastal fit, water shading, or atmospheric staging" as the weakness.
 * The two halves are the same object: one smooth Blinn lobe on a uniform blue
 * sphere is what a billiard ball looks like, and it is a gloss highlight rather
 * than a sun track because nothing breaks it and nothing else varies.
 *
 * Four things go on the sphere, and the first is the one that fixes the coasts.
 *
 * 1. A DEPTH-TINTED SHELF, geo-registered. `world-globe.js`'s chamfer distance
 *    transform gives every ocean cell its distance to the nearest land in mask
 *    cells; `shelfWeightAt` ramps that to a shallow weight that HOLDS out to 11
 *    cells and lets go by 22. At the world map's own projection that is 30 to
 *    60 screen pixels of lighter, greener water round every coastline, which is
 *    the brief's own number and is what "coastal fit" means on a sea.
 * 2. FAINT CURRENT STREAKS, on the real lattice rather than on a tiling square:
 *    they follow latitude, shear with the gyres, and are drawn at a few per
 *    cent of the base so they read as surface rather than as pattern.
 * 3. A LATITUDE BODY RAMP. Warm shallow tropics, cold deep high latitudes.
 * 4. A noise-broken specular track. G1 replaces the old tiling roughness map
 *    with two incommensurate world-space normal swells, so no texture seam or
 *    repeat is visible and the GGX glint changes with the camera.
 *
 * The shelf map is registered to the geography, so it must NOT scroll.
 * ================================================================== */
/** Base sea, the shelf it lightens to, and the deep it falls to. */
/*
 * ── P14-M11 ITEM 3 — THE BODY GOES ULTRAMARINE; THE SHELF KEEPS ITS TINT. ──
 *
 * MC6 read the sea as "teal" at three separate poses. The measurement behind
 * that word is the blue-over-green ratio the KEY leaves on screen: the globe's
 * lamp is #f3d7a8, which multiplies green by 215/255 = 0.843 and blue by
 * 168/255 = 0.659, so an authored ratio of 1.52 lands at 1.19 and 1.19 is
 * teal. `OCEAN_BODY_HEX` 0x0d3f60 authored 96/63 = 1.52 and drew at 1.19;
 * 0x102f5e authors 94/47 = 2.00 and draws at 1.56, which is blue.
 *
 * The SHELF is left alone on purpose — the brief keeps the shelf tint, and
 * turquoise over sand is the one place on a real ocean where that hue is
 * correct. What changes is the body and the deep the shelf is read against,
 * which is what makes a shallow band read as shallow rather than as more sea.
 */
const OCEAN_DEEP_HEX = 0x061a28;
const OCEAN_BODY_HEX = 0x20527d;
const OCEAN_LOWER_DEPTH_HEX = 0x12334b;
const OCEAN_UPPER_DEPTH_HEX = 0x205d78;
const OCEAN_SHELF_HEX = 0x397b9e;
const OCEAN_COAST_HEX = 0x70b9c2;
const OCEAN_PALE_SHELF_HEX = LAND_BIOMES.coastRim;
const OCEAN_STREAK_HEX = 0x93bcd8;
/*
 * ── THE HUE, AND WHY THESE ARE NOT THE OBVIOUS NUMBERS. ──
 *
 * The brief asks for a MATTE DEEP-BLUE ocean, and the globe's key is
 * `P1_GLOBE_LIGHT.keyColor` #f3d7a8 — a warm lamp, which multiplies blue by
 * 168/255 = 0.66 and green by 215/255 = 0.84. An albedo authored to look blue
 * on a swatch therefore renders TEAL on this sphere: the first cut used
 * b/g = 1.08 on the shelf and the frame came back green.
 *
 * So the ratio is pre-compensated. Blue over green of about 1.5 in the deep and
 * the body lands at roughly 1.15 on screen, which reads blue; the shelf is held
 * at 1.22, which lands near parity and reads as the turquoise shallow water
 * over sand that it is meant to be. The deep is blue, the shelf is turquoise,
 * and both of those are true of a real coast.
 */
/** Equirect resolution. 1024 wide is 2.84 texels per degree of longitude. */
const OCEAN_MAP_W = 1024;
const OCEAN_MAP_H = 512;

function hexRgb(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}
function mixRgb(a, b, t) {
  const u = Math.min(1, Math.max(0, t));
  return [
    a[0] + (b[0] - a[0]) * u,
    a[1] + (b[1] - a[1]) * u,
    a[2] + (b[2] - a[2]) * u,
  ];
}

function oceanShelfTexture() {
  const W = OCEAN_MAP_W;
  const H = OCEAN_MAP_H;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const data = img.data;
  const body = hexRgb(OCEAN_BODY_HEX);
  const shelf = hexRgb(OCEAN_SHELF_HEX);
  // Three's SphereGeometry puts u = 0 at phi = 0, which is -X, i.e. lon 180;
  // `cellToLatLon` puts column 0 at lon -180. u = (lon + 180) / 360 for both,
  // so a texture column maps STRAIGHT onto a mask column with no offset, and
  // `flipY` on a CanvasTexture puts image row 0 at v = 1, the north pole,
  // which is mask row 0. The registration is therefore the identity.
  for (let py = 0; py < H; py += 1) {
    const row = Math.min(GLOBE_ROWS - 1, Math.floor((py / H) * GLOBE_ROWS));
    for (let px = 0; px < W; px += 1) {
      const column = Math.min(GLOBE_COLS - 1, Math.floor((px / W) * GLOBE_COLS));
      const distance = coastDistanceAt(column, row);
      // P21: one blue paint with a continuous, restrained shelf. No depth
      // terraces, pale coastal ring or latitude streak texture.
      const shelfFade = Math.exp(-distance / 5);
      const c = mixRgb(body, shelf, shelfFade * 0.55);
      const i = (py * W + px) * 4;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * The specular breaker. This is a ROUGHNESS map: `MeshStandardMaterial` reads
 * its GREEN channel and multiplies `material.roughness` by it, so a value field
 * here is a per-pixel roughness field and the single smooth Blinn lobe becomes
 * a broken sun track. It tiles (it is not geography), so it is the one texture
 * on the sphere `tickOceanMaterial` may drift.
 */
function oceanCurrentTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  // M11 item 3 — mid grey was #b8b8b8, i.e. roughness x 0.72, so an authored
  // 0.78 DREW at 0.56 and the sphere was semi-gloss whatever the material
  // said. #dcdcdc is x 0.863; with the base at 0.90 the product is 0.777 and
  // the map's own blobs hold it above 0.72 everywhere.
  ctx.fillStyle = '#dcdcdc';
  ctx.fillRect(0, 0, size, size);
  // Value blobs at two scales. `globalAlpha` keeps every stroke a small nudge,
  // so the field stays inside +/- 25 % of the base and the sea never turns
  // matte in patches.
  ctx.globalAlpha = 0.10;
  for (let i = 0; i < 220; i += 1) {
    const x = ((i * 137) % size) + ((i * 53) % 7);
    const y = ((i * 241) % size) + ((i * 31) % 11);
    const r = 9 + ((i * 17) % 34);
    ctx.fillStyle = (i % 2) ? '#f2f2f2' : '#7a7a7a';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.075;
  // Long thin streaks: a wind-roughened sea is anisotropic, and this is what
  // breaks the track into a run of separate glints instead of one wash.
  for (let i = 0; i < 64; i += 1) {
    const y = (i * 37) % size;
    ctx.strokeStyle = (i % 3) ? '#efefef' : '#808080';
    ctx.lineWidth = 1 + (i % 4);
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= size; x += 16) {
      const yy = (y + Math.sin((x + i * 13) * 0.02) * 6 + size) % size;
      ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.repeat.set(6, 3);
  return texture;
}

/**
 * One geo-registered terrain atlas for the instanced ledger. The voxel colours
 * remain the close-view authority; trilinear mips are blended over their top
 * faces as cells fall below a few pixels, removing the noisy one-cell shimmer
 * without turning the register into a smooth continent mesh.
 */
function terrainPaletteTexture(sourceRaster) {
  const width = 1024;
  const height = 512;
  const cellColours = new Uint32Array(GLOBE_COLS * GLOBE_ROWS);
  const fallbackByRow = Array.from({ length: GLOBE_ROWS }, (_, row) => {
    const lat = 90 - (((row + 0.5) / GLOBE_ROWS) * 180);
    if (lat <= -60 || lat >= 74) {
      const polar = lat < 0 ? (-60 - lat) / 24 : (lat - 74) / 16;
      return new THREE.Color(LAND_SURFACE.iceEdge)
        .lerp(new THREE.Color(LAND_SURFACE.iceCore), Math.max(0, Math.min(1, polar)))
        .getHex();
    }
    return LAND_SURFACE.shelfDry;
  });
  for (const voxel of sourceRaster.voxels) {
    cellColours[(voxel.row * GLOBE_COLS) + voxel.column] = voxel.color;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    const row = Math.min(GLOBE_ROWS - 1, Math.floor((y / height) * GLOBE_ROWS));
    for (let x = 0; x < width; x += 1) {
      const column = Math.min(GLOBE_COLS - 1, Math.floor((x / width) * GLOBE_COLS));
      const hex = cellColours[(row * GLOBE_COLS) + column] || fallbackByRow[row];
      const i = (y * width + x) * 4;
      image.data[i] = (hex >> 16) & 255;
      image.data[i + 1] = (hex >> 8) & 255;
      image.data[i + 2] = hex & 255;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'globe:terrain-palette-mips';
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const TERRAIN_PALETTE_MAP = terrainPaletteTexture(raster);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
});
// MC3 F8 — the desk beyond the globe was rendering at luma 4, so the corners of
// the map rectangle were a void whatever the ocean did. Lifted to a graded warm
// slate: still a dark room, no longer a hole. `GLOBE_VOID_HEX` is the authored
// value; what lands on screen is measured in the M6 report.
renderer.setClearColor(GLOBE_VOID_HEX, 1);
renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(GLOBE_VOID_HEX);
scene.fog = new THREE.Fog(GLOBE_VOID_HEX, 22, 48);

function starfieldTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#05070c';
  ctx.fillRect(0, 0, size, size);
  const vignette = ctx.createRadialGradient(size / 2, size / 2, size * 0.18, size / 2, size / 2, size * 0.62);
  vignette.addColorStop(0, 'rgba(5, 7, 12, 0)');
  vignette.addColorStop(1, 'rgba(2, 3, 6, 0.55)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1400; i += 1) {
    let h = Math.imul(i + 0x27d4eb2d, 0x9e3779b1);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    const x = (h >>> 0) % size;
    let h2 = Math.imul(i + 0x165667b1, 0xc2b2ae35);
    h2 ^= h2 >>> 16;
    const y = (h2 >>> 0) % size;
    const mag = ((h >>> 8) & 255) / 255;
    const r = mag > 0.92 ? 1.4 : mag > 0.7 ? 0.9 : 0.55;
    const a = 0.22 + mag * 0.78;
    ctx.fillStyle = `rgba(220, 228, 240, ${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'globe:starfield-map';
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
const starfield = new THREE.Mesh(
  new THREE.SphereGeometry(16.5, 48, 32),
  new THREE.MeshBasicMaterial({
    map: starfieldTexture(),
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  }),
);
starfield.name = 'globe:starfield';
starfield.renderOrder = -8;
scene.add(starfield);

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
camera.position.set(0, 0.3, 5.15);
camera.lookAt(0, 0.03, 0);

scene.add(new THREE.HemisphereLight(
  P1_GLOBE_LIGHT.hemiSky, P1_GLOBE_LIGHT.hemiGround, P1_GLOBE_LIGHT.hemiIntensity,
));
scene.add(new THREE.AmbientLight(P1_GLOBE_LIGHT.ambient, P1_GLOBE_LIGHT.ambientIntensity));
const keyLight = new THREE.DirectionalLight(P1_GLOBE_LIGHT.keyColor, P1_GLOBE_LIGHT.keyIntensity);
keyLight.position.set(...P1_GLOBE_LIGHT.keyPosition);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(P1_GLOBE_LIGHT.fillColor, 0);
fillLight.position.set(...P1_GLOBE_LIGHT.fillPosition);
fillLight.castShadow = false;
scene.add(fillLight);
const rimLight = new THREE.DirectionalLight(P1_GLOBE_LIGHT.rimColor, 0);
rimLight.position.set(...P1_GLOBE_LIGHT.rimPosition);
rimLight.castShadow = false;
rimLight.name = 'p1-globe-rim';
scene.add(rimLight);

function standardMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.78,
    metalness: 0.02,
    ...options,
  });
}

/** One instance, used as both the colour map and the emissive map. */
const OCEAN_SHELF_MAP = oceanShelfTexture();

const materials = {
  table: standardMaterial(0x271b10, { roughness: 0.92 }),
  // MC3 F8 — the ocean had no floor: away from the key light it fell to luma 3
  // and 59-62% of the map rectangle measured below luma 24. An emissive floor
  // is light the sphere carries itself, so the night side is a deep blue rather
  // than a hole. Restrained on purpose: it lifts the shadow, it does not glow.
  // ── P14-M9 ITEM 1 — MATTE, DEPTH-TINTED, AND ITS SPECULAR IS BROKEN. ──
  // Was: `P1_OCEAN.roughness` 0.42 / `P1_OCEAN.metalness` 0.16 with the current
  // texture as the COLOUR map. A 0.42-rough 0.16-metal sphere under one key
  // returns a smooth Blinn lobe, which is the toy gloss pack-j names; the map
  // was a tiling square with no relation to the geography, so nothing on the
  // sea told you where the sea was shallow.
  //
  // `P1_OCEAN` itself is unchanged — `v41-wave-1b` pins all four of its numbers
  // and it is another lane's file — so the shift is made here, on the globe's
  // own physical material: non-metal dielectric water at F0 0.02, with the
  // shelf carrying colour and an analytic normal field breaking the GGX lobe.
  water: bindOceanMaterial(new THREE.MeshPhysicalMaterial({
    // G1: Three's physical path is GGX/Smith with Schlick Fresnel. This IOR
    // evaluates to dielectric F0 0.02; the analytic normal field in
    // world-ocean.js breaks the lobe without a repeating normal texture.
    roughness: OCEAN_BRDF.roughness,
    metalness: 0.0,
    ior: OCEAN_BRDF.ior,
    specularIntensity: 0.025,
    toneMapped: false,
    specularColor: 0xffffff,
    map: OCEAN_SHELF_MAP,
    /*
     * FLAT, and that is deliberate — the first cut put the shelf texture on
     * `emissiveMap` so the floor would carry the coastal shading, and it made
     * the night side WORSE, not better: the floor is then proportional to the
     * albedo, and the albedo in the deep open ocean is #082438, so exactly the
     * pixels that need a floor got the least of it. Measured, disc share under
     * luma 24: 0.003 before this round, 0.056 with the mapped floor at 0.34,
     * 0.065 with it at 0.44 — raising a floor that scales with a dark albedo
     * does not lift a dark albedo. A flat floor lifts every unlit pixel by the
     * same amount, which is what MC3 F8 asked for, and the day side is where
     * the shelf has to read anyway.
     */
    emissive: GLOBE_OCEAN_FLOOR_HEX,
    emissiveIntensity: GLOBE_OCEAN_FLOOR_I,
  }), { geoMap: true }),
  brass: standardMaterial(0x9b783b, { roughness: 0.45, metalness: 0.42 }),
  ink: standardMaterial(0x29251f, { roughness: 0.84 }),
  locked: standardMaterial(0x687783, { roughness: 0.86 }),
  openable: standardMaterial(0xb17a3f, { roughness: 0.74 }),
  working: standardMaterial(0x778044, { roughness: 0.72 }),
  creed: standardMaterial(0x7a4a62, {
    roughness: 0.7,
    emissive: 0x3a1020,
    emissiveIntensity: 0.28,
  }),
  creedStain: standardMaterial(0x7a4a62, {
    roughness: 0.95,
    transparent: true,
    opacity: 0.46,
    emissive: 0x3a1020,
    emissiveIntensity: 0.22,
    depthWrite: false,
  }),
  hullDim: standardMaterial(0x2a2218, { roughness: 0.82 }),
  hullGhost: standardMaterial(0x9b783b, {
    roughness: 0.48,
    metalness: 0.28,
    emissive: 0x3b260d,
    emissiveIntensity: 0.2,
  }),
  hullLit: standardMaterial(0xc4a05a, {
    roughness: 0.48,
    metalness: 0.22,
    emissive: 0x5f310d,
    emissiveIntensity: 0.28,
  }),
  army: standardMaterial(0x9a7a3a, {
    roughness: 0.84,
    emissive: 0x2b1905,
    emissiveIntensity: 0.12,
  }),
  navy: standardMaterial(0x477b8b, {
    roughness: 0.58,
    metalness: 0.18,
    emissive: 0x173943,
    emissiveIntensity: 0.3,
  }),
  navyGunwale: standardMaterial(0xaeb9bd, { roughness: 0.68, metalness: 0.08 }),
  air: standardMaterial(0xc5c9c5, {
    roughness: 0.5,
    metalness: 0.28,
    emissive: 0x4a5250,
    emissiveIntensity: 0.38,
    side: THREE.DoubleSide,
  }),
  drone: standardMaterial(0x4a6a3a, {
    roughness: 0.52,
    metalness: 0.22,
    emissive: 0x1a2a12,
    emissiveIntensity: 0.32,
    side: THREE.DoubleSide,
  }),
  home: standardMaterial(0xc8763f, {
    roughness: 0.66,
    emissive: 0x4a1805,
    emissiveIntensity: 0.22,
  }),
  wax: standardMaterial(0x4d5961, { roughness: 0.78 }),
  hold: standardMaterial(0x8c2418, {
    roughness: 0.82,
    emissive: 0x310600,
    emissiveIntensity: 0.2,
  }),
  selected: standardMaterial(0xe1bd69, {
    roughness: 0.5,
    emissive: 0x5f310d,
    emissiveIntensity: 0.4,
  }),
  grainTie: standardMaterial(0xf1d294, {
    roughness: 0.78,
    emissive: 0x3b260d,
    emissiveIntensity: 0.08,
  }),
  hit: new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  }),
};
materials.hit.colorWrite = false;

const CREED_CLOTH_HEX = Object.freeze({
  meritocracy: 0xc4a05a,
  capitalism: 0x3a6a48,
  socialism: 0x8c2418,
  christianity: 0xe1cfaa,
  islam: 0x355f48,
  buddhism: 0xc45a18,
});
const creedClothMaterials = new Map();

function creedClothMaterial(creedId) {
  const key = creedId ?? 'none';
  if (creedClothMaterials.has(key)) return creedClothMaterials.get(key);
  const material = standardMaterial(CREED_CLOTH_HEX[creedId] ?? 0x7a4a62, {
    roughness: 0.68,
    emissive: 0x3a1020,
    emissiveIntensity: 0.22,
  });
  creedClothMaterials.set(key, material);
  return material;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const pipDrum = new THREE.CylinderGeometry(0.027, 0.027, 0.042, 8);
const pipSackBody = new THREE.SphereGeometry(0.065, 6, 4);
const pipSackNeck = new THREE.CylinderGeometry(0.018, 0.034, 0.045, 6);
const pipSackTie = new THREE.CylinderGeometry(0.039, 0.039, 0.012, 6);
const kiteGeometry = new THREE.BufferGeometry();
kiteGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
  0.039, 0, 0,
  -0.009, 0, 0.026,
  -0.034, 0, 0,
  -0.009, 0, -0.026,
], 3));
kiteGeometry.setIndex([0, 2, 1, 0, 3, 2]);
kiteGeometry.computeVertexNormals();
const goodPipMaterials = new Map();

function goodPipMaterial(good, lit) {
  const key = `${good}:${lit ? 'lit' : 'dim'}`;
  if (goodPipMaterials.has(key)) return goodPipMaterials.get(key);
  const colour = new THREE.Color(GOOD_COLOUR[good] ?? 0x8a7350);
  if (!lit) colour.multiplyScalar(0.42);
  const material = standardMaterial(colour.getHex(), {
    roughness: lit ? 0.62 : 0.9,
    emissive: lit ? colour.clone().multiplyScalar(0.34).getHex() : 0x000000,
    emissiveIntensity: lit ? 0.34 : 0,
    transparent: !lit,
    opacity: lit ? 1 : 0.72,
  });
  goodPipMaterials.set(key, material);
  bindPinShading(material);
  return material;
}

const globe = new THREE.Group();
globe.name = 'Head-office globe';
scene.add(globe);

function deskCanvasTexture(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (kind === 'felt') {
    ctx.fillStyle = '#2a1e16';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 420; i += 1) {
      const x = (i * 37 + 11) % 256;
      const y = (i * 53 + 19) % 256;
      const tone = 28 + ((i * 13) % 22);
      ctx.fillStyle = `rgb(${tone + 8},${tone},${tone - 6})`;
      ctx.fillRect(x, y, 2 + (i % 3), 2);
    }
  } else {
    ctx.fillStyle = '#3a2818';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 48; i += 1) {
      const y = (i * 17 + 11) % 256;
      ctx.strokeStyle = i % 3 === 0 ? '#4a3422' : '#2e1e14';
      ctx.globalAlpha = 0.42;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y + ((i * 3) % 7) - 3);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.repeat.set(kind === 'felt' ? 2 : 4, kind === 'felt' ? 2 : 3);
  return texture;
}

const woodMat = standardMaterial(0x3a2818, {
  roughness: 0.86, metalness: 0.04, map: deskCanvasTexture('wood'),
});
const feltMat = standardMaterial(0x2a1e16, {
  roughness: 0.92, metalness: 0.02, map: deskCanvasTexture('felt'),
});
const paperMat = standardMaterial(0xd8cbb0, { roughness: 0.78, metalness: 0.02 });
const inkLineMat = standardMaterial(0x4a3a28, { roughness: 0.7 });

const deskRoom = new THREE.Group();
deskRoom.name = 'head-office-desk';
scene.add(deskRoom);
const stand = new THREE.Mesh(new THREE.BoxGeometry(28, 0.22, 22), woodMat);
stand.name = 'head-office-desk:top';
stand.position.set(0, -1.52, 0.6);
stand.receiveShadow = true;
stand.castShadow = true;
deskRoom.add(stand);
const backWall = new THREE.Mesh(new THREE.BoxGeometry(28, 14, 0.5), feltMat);
backWall.name = 'head-office-desk:back';
backWall.position.set(0, 4.2, -10.2);
backWall.receiveShadow = true;
deskRoom.add(backWall);
const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 14, 22), feltMat);
leftWall.position.set(-14, 4.2, 0.4);
leftWall.receiveShadow = true;
deskRoom.add(leftWall);
const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 14, 22), feltMat);
rightWall.position.set(14, 4.2, 0.4);
rightWall.receiveShadow = true;
deskRoom.add(rightWall);
const ceiling = new THREE.Mesh(new THREE.BoxGeometry(28, 0.4, 22), feltMat);
ceiling.position.set(0, 9.2, 0.2);
deskRoom.add(ceiling);
// M12 — a vertical, graduated instrument ring.  The old 11 px horizontal gold
// tube read as an equator drawn over the planet; this is a 3.5 px band with
// ten-degree ticks and a restrained additive edge.
const meridian = new THREE.Group();
meridian.name = 'head-office-desk:meridian';
meridian.rotation.z = 0.18;
meridian.rotation.y = 0.24;
const meridianGlow = new THREE.Mesh(
  new THREE.TorusGeometry(GLOBE_RADIUS + 0.030, 0.013, 8, 96),
  new THREE.MeshBasicMaterial({
    color: 0xd6aa48, transparent: true, opacity: 0.12,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }),
);
meridianGlow.name = 'head-office-desk:meridian:glow';
meridianGlow.castShadow = false;
// P21: the brass meridian needs no additive halo.
meridianGlow.visible = false;
meridian.add(meridianGlow);
const meridianBand = new THREE.Mesh(
  new THREE.TorusGeometry(GLOBE_RADIUS + 0.030, 0.0055, 8, 96),
  materials.brass,
);
meridianBand.name = 'head-office-desk:meridian:band';
meridianBand.castShadow = true;
meridian.add(meridianBand);
const meridianTicks = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.05, 0.009, 0.009),
  materials.brass,
  MERIDIAN_GRADUATIONS.count,
);
meridianTicks.name = 'head-office-desk:meridian:ticks';
const meridianDummy = new THREE.Object3D();
for (let i = 0; i < MERIDIAN_GRADUATIONS.count; i += 1) {
  const tick = meridianTickAt(i);
  const radius = GLOBE_RADIUS + 0.034 + tick.length * 0.5;
  meridianDummy.position.set(Math.cos(tick.angle) * radius, Math.sin(tick.angle) * radius, 0);
  meridianDummy.rotation.set(0, 0, tick.angle);
  meridianDummy.scale.set(tick.length / 0.05, tick.major ? 1.45 : 1, tick.major ? 1.45 : 1);
  meridianDummy.updateMatrix();
  meridianTicks.setMatrixAt(i, meridianDummy.matrix);
}
meridianTicks.instanceMatrix.needsUpdate = true;
meridianTicks.castShadow = true;
meridian.add(meridianTicks);
deskRoom.add(meridian);
const contactShadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.95, 28),
  standardMaterial(0x1a1008, { roughness: 0.98 }),
);
contactShadow.name = 'head-office-desk:contact';
contactShadow.rotation.x = -Math.PI / 2;
contactShadow.position.set(0, -1.40, 0);
contactShadow.receiveShadow = true;
deskRoom.add(contactShadow);
const chart = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.02, 2.9), paperMat);
chart.name = 'head-office-desk:chart';
chart.position.set(1.85, -1.40, 1.55);
chart.rotation.y = -0.22;
chart.receiveShadow = true;
deskRoom.add(chart);
const chartRuleA = new THREE.Mesh(unitBox, inkLineMat);
chartRuleA.scale.set(1.8, 0.008, 0.02);
chartRuleA.position.set(0, 0.02, 0.4);
chart.add(chartRuleA);
const chartRuleB = new THREE.Mesh(unitBox, inkLineMat);
chartRuleB.scale.set(0.02, 0.008, 2.2);
chartRuleB.position.set(-0.4, 0.02, 0);
chart.add(chartRuleB);
const lampArm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 2.4, 8), materials.brass);
lampArm.position.set(-3.15, 2.55, 3.05);
lampArm.rotation.z = 0.55;
lampArm.castShadow = true;
deskRoom.add(lampArm);
const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.55, 10), materials.brass);
lampShade.position.set(-2.35, 3.55, 3.05);
lampShade.rotation.z = 0.35;
deskRoom.add(lampShade);
const lampGlow = new THREE.SpotLight(0xffd6a0, 3.4, 14, 0.55, 0.45, 1);
lampGlow.name = 'head-office-desk:lamp';
lampGlow.position.set(-2.45, 3.7, 3.1);
lampGlow.target.position.set(0, 0, 0);
lampGlow.castShadow = true;
deskRoom.add(lampGlow);
deskRoom.add(lampGlow.target);
const standCup = new THREE.Mesh(
  new THREE.CylinderGeometry(0.22, 0.38, 0.07, 24),
  materials.brass,
);
standCup.position.set(0, -GLOBE_RADIUS - 0.055, 0);
standCup.castShadow = true;
scene.add(standCup);

/*
 * ── P14-M9 ITEM 1 — THE SEA COMES UP TO MEET THE LAND. ──
 *
 * Measured (`shots-v56/M9-probe.json`, Q5): at `GLOBE_RADIUS - 0.012` the sea
 * surface is 1.286 and a land voxel's underside is 1.30175, so every coastline
 * floated 0.01575 units — 4.96 PIXELS at this projection — clear of the water.
 * That gap, with a hard tonal cut at the plate's edge, is the whole of "voxel
 * continents sit as extruded Lego".
 *
 * The sea is at -0.0035 now, which is 2.16 px of remaining gap, and the coast
 * skirt below spans it. It is not raised further because the Suez / Red Sea
 * channel marks sit at `GLOBE_RADIUS - 0.004` with a 0.006 box height, i.e.
 * their tops are at 1.297: a sea above that buries them and the canal cuts the
 * `isCanalWater` table opens would close again. 1.2945 leaves them 2.5 mm proud.
 *
 * The sphere is also finer — 64 x 40 rather than 48 x 32 — because the limb is
 * where the atmosphere rim lands and a 48-gon silhouette shows through a
 * Fresnel band that is only a few pixels wide.
 */
const GLOBE_SEA_R = GLOBE_RADIUS - 0.0035;
const water = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_SEA_R, 64, 40),
  materials.water,
);
water.name = 'globe:ocean-brdf';
water.receiveShadow = true;
globe.add(water);

// MC3 F8 — the horizon band. On the scene, not the globe, so it does not spin;
// billboarded each frame so it always reads as the limb of the sphere in front
// of it. Additive and depth-tested: the globe hides its inner half.
const horizonBand = new THREE.Mesh(
  new THREE.PlaneGeometry(GLOBE_RADIUS * 3.86, GLOBE_RADIUS * 3.86),
  new THREE.MeshBasicMaterial({
    map: horizonBandTexture(),
    color: GLOBE_HORIZON_HEX,
    transparent: true,
    opacity: GLOBE_HORIZON_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }),
);
horizonBand.name = 'globe horizon band';
horizonBand.renderOrder = -1;
horizonBand.position.copy(globe.position);
scene.add(horizonBand);

/*
 * ── P14-M9 ITEM 1 — A THIN FRESNEL ATMOSPHERE AT THE LIMB. ──
 *
 * MC4 pack-j: "no atmospheric staging". `globe horizon band` is a billboarded
 * radial-gradient PLANE, which gives a ring at a fixed screen radius: it reads
 * as a halo drawn round the sphere rather than as air over it, and because it
 * is billboarded it cannot know where the sun is.
 *
 * This is a shell at 1.05 R with a real Fresnel term — `pow(1 - dot(N, V), k)`
 * — so it is invisible where you look straight down at the sea and reaches full
 * strength only at the limb, which is what air does. It is additive and it
 * writes no depth, so nothing behind it changes, and it carries the SUN: the
 * day limb is warm and bright, the night limb is a thin cold line, and the two
 * meet over a wide smoothstep, which is the soft terminator the brief asks for
 * seen from the outside.
 *
 * The physical shell is deliberately narrow: five per cent of globe radius,
 * within the G1 brief's four-to-six-per-cent limb band.
 */
/*
 * ── P14-M11 ITEM 3 — THE RIM IS STRENGTHENED. ──
 *
 * M9 built this shell and pack-b still read "no atmosphere". At K 3.4 and gain
 * 0.62 the term is 90 % inside the outer 6 % of the disc and peaks at 0.62 of
 * a colour that is already dim — about 24 px of a very faint blue on an 817 px
 * globe, which is a rim you have to look for. The brief asks for a limb that
 * READS as air: K 2.6 roughly doubles the band's width (90 % inside the outer
 * 11 %) and the gain goes to 1.05, and the shell is lifted from 1.0265 R to
 * 1.034 R so the band clears the voxel silhouette instead of sitting on it.
 * G1 takes the final authored shell to 1.05 R, K 2.15, with an explicit
 * day-bright/night-dim terminator rather than increasing a uniform halo.
 */
const ATMO_FRESNEL_K = ATMOSPHERE_LIMB.fresnelPower;
const ATMO_SHELL_SCALE = ATMOSPHERE_LIMB.shellScale;
const ATMO_DAY_HEX = 0x75c7f2;
const ATMO_NIGHT_HEX = 0x244f78;
const atmosphereUniforms = {
  uSunDir: { value: new THREE.Vector3(...P1_GLOBE_LIGHT.keyPosition).normalize() },
  uDay: { value: new THREE.Color(ATMO_DAY_HEX) },
  uNight: { value: new THREE.Color(ATMO_NIGHT_HEX) },
  uGain: { value: 0.22 },
};
const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS * ATMO_SHELL_SCALE, 64, 40),
  new THREE.ShaderMaterial({
    uniforms: atmosphereUniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    toneMapped: false,
    vertexShader: `
      varying vec3 vWN;
      varying vec3 vVD;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWN = normalize(mat3(modelMatrix) * normal);
        vVD = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform vec3 uDay;
      uniform vec3 uNight;
      uniform float uGain;
      varying vec3 vWN;
      varying vec3 vVD;
      void main() {
        float ndv = max(0.0, dot(normalize(vWN), normalize(vVD)));
        float fres = pow(1.0 - ndv, ${ATMO_FRESNEL_K.toFixed(2)});
        float nl = dot(normalize(vWN), normalize(uSunDir));
        // A wide smoothstep across the terminator: 0.34 to -0.30 in cos is
        // about 38 degrees of arc, so the day/night meeting is a gradient.
        float day = smoothstep(
          ${ATMOSPHERE_LIMB.nightAt.toFixed(2)},
          ${ATMOSPHERE_LIMB.dayAt.toFixed(2)},
          nl
        );
        vec3 col = mix(uNight, uDay, day);
        // Five per cent of radius is physical shell, not a billboard halo.
        // A low inner haze meets the land/ocean horizon; the outer term carries
        // the readable blue scatter and loses energy across the terminator.
        float haze = smoothstep(0.06, 0.68, fres) * 0.13;
        float limb = smoothstep(0.42, 0.96, fres) * 0.74;
        float dayEnergy = mix(
          ${ATMOSPHERE_LIMB.nightGain.toFixed(2)},
          ${ATMOSPHERE_LIMB.dayGain.toFixed(2)},
          day
        );
        float amt = (haze + limb) * uGain * dayEnergy;
        gl_FragColor = vec4(col * amt, amt);
      }
    `,
  }),
);
atmosphere.name = 'p1-globe-atmosphere';
atmosphere.renderOrder = 6;
atmosphere.castShadow = false;
atmosphere.receiveShadow = false;
globe.add(atmosphere);
atmosphere.material.depthTest = true;
atmosphere.material.depthWrite = false;
const pinShadeUniform = { value: new THREE.Vector3(0.68, 0.575, 0.47) };
// One sun for both terminators: the ocean's own soft day/night and the
// atmosphere rim read the SAME world-space direction, taken off the live key
// rather than re-typed, so they can never disagree about where noon is.
setOceanSun(materials.water, keyLight.position);
atmosphereUniforms.uSunDir.value.copy(keyLight.position).normalize();
// M11 item 4 — and the pins read the SAME direction, so a pin cannot be lit
// from one side while the sea under it is lit from another.
pinShadeUniform.value.copy(keyLight.position).normalize();

/* ================================================================== *
 * P14 M10 ITEM 2 — THE TERRAIN SHADER ON THE VOXEL LAND.
 *
 * MC5 pack-i: "cuboid-extruded continents read as toy bricks, not relief". A
 * per-instance colour paints all six faces of a box the same, so a 137,859-cube
 * field lit by one key returns one flat wash whatever the geography does. Four
 * terms, injected into the standard material rather than replacing it, so the
 * shadow map, the fog, the tone map and the key all still apply:
 *
 *   SLOPE SHADE. The extrusion sides are pulled toward cut rock and then
 *     multiplied by the sun term measured on the face's OWN world normal, so
 *     the east faces and the west faces of the same column separate.
 *   VALLEY AO. The bottom of every side face darkens toward `uValleyAO`, so the
 *     crease where one column meets the next reads as a valley floor and the
 *     land gains depth between the tiers rather than only at their edges.
 *   RIM. The sun-facing top EDGE of each cell carries a thin highlight: the
 *     sun's direction is resolved into the cell's own tangent frame in the
 *     vertex program, so the rim lights the correct edge on every cell of a
 *     sphere rather than one hemisphere's worth.
 *   And the tops keep the instance colour, which is now altitude-banded.
 *
 * The world normal is EXACT here despite the non-uniform instance scale: the
 * unit box's normals are the axis vectors, and `instanceMatrix`'s columns are
 * `east * width`, `outward * height`, `north * depth` with all three scales
 * positive, so `mat3(instanceMatrix) * (1,0,0)` normalises to `east` exactly.
 * ================================================================== */
const TERRAIN_SHADE = Object.freeze({
  /** How far a side face is pulled toward cut rock. */
  rockMix: 0.46,
  rock: 0x6b6152,
  /** Side multiplier in full shade and in full sun. */
  sideDark: 0.52,
  sideLit: 1.16,
  /** Top faces retain the terrain tint but now carry the same directional sun. */
  topDark: 0.72,
  topLit: 1.14,
  /** Multiplier at the foot of a side face. */
  valleyAO: 0.58,
  /** Where the top-face rim band starts, in normalised cell half-width. */
  rimEdge: 0.46,
});
function terrainMaterial(opts = {}) {
  const material = standardMaterial(0xffffff, { roughness: opts.roughness ?? 0.88 });
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(...P1_GLOBE_LIGHT.keyPosition).normalize() },
    uRockMix: { value: opts.rockMix ?? TERRAIN_SHADE.rockMix },
    uRock: { value: new THREE.Color(TERRAIN_SHADE.rock) },
    uSideDark: { value: TERRAIN_SHADE.sideDark },
    uSideLit: { value: TERRAIN_SHADE.sideLit },
    uTopDark: { value: TERRAIN_SHADE.topDark },
    uTopLit: { value: TERRAIN_SHADE.topLit },
    uValleyAO: { value: opts.valleyAO ?? TERRAIN_SHADE.valleyAO },
    uRimGain: { value: opts.rimGain ?? 0.10 },
    uRimEdge: { value: TERRAIN_SHADE.rimEdge },
    uTerrainPalette: { value: TERRAIN_PALETTE_MAP },
    uPaletteBlend: { value: TERRAIN_FILTER.paletteBlend },
    uHorizonKeep: { value: TERRAIN_FILTER.horizonKeep },
    uEdgeSoftnessPx: { value: TERRAIN_FILTER.edgeSoftnessPx },
  };
  material.userData.terrain = uniforms;
  material.customProgramCacheKey = () => `dd-terrain-${opts.key ?? 'land'}`;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uSunDir;
        varying vec3 vDDLocal;
        varying vec3 vDDLocalN;
        varying vec3 vDDWorldN;
        varying vec3 vDDWorldP;
        varying vec3 vDDSphereP;
        varying vec2 vDDSunLocal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vDDLocal = position;
        vDDLocalN = objectNormal;
        #ifdef USE_INSTANCING
          mat4 ddM = modelMatrix * instanceMatrix;
        #else
          mat4 ddM = modelMatrix;
        #endif
        vDDWorldN = normalize((ddM * vec4(objectNormal, 0.0)).xyz);
        vDDWorldP = (ddM * vec4(position, 1.0)).xyz;
        #ifdef USE_INSTANCING
          vDDSphereP = (instanceMatrix * vec4(position, 1.0)).xyz;
        #else
          vDDSphereP = position;
        #endif
        vec3 ddEast = normalize((ddM * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
        vec3 ddNorth = normalize((ddM * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
        vec3 ddSun = normalize(uSunDir);
        vDDSunLocal = vec2(dot(ddSun, ddEast), dot(ddSun, ddNorth));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uSunDir;
        uniform vec3 uRock;
        uniform float uRockMix;
        uniform float uSideDark;
        uniform float uSideLit;
        uniform float uTopDark;
        uniform float uTopLit;
        uniform float uValleyAO;
        uniform float uRimGain;
        uniform float uRimEdge;
        uniform sampler2D uTerrainPalette;
        uniform float uPaletteBlend;
        uniform float uHorizonKeep;
        uniform float uEdgeSoftnessPx;
        varying vec3 vDDLocal;
        varying vec3 vDDLocalN;
        varying vec3 vDDWorldN;
        varying vec3 vDDWorldP;
        varying vec3 vDDSphereP;
        varying vec2 vDDSunLocal;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float ddUp = vDDLocalN.y;
          float ddSide = 1.0 - abs(ddUp);
          float ddTop = step(0.5, ddUp);
          vec3 ddSphereN = normalize(vDDSphereP);
          vec2 ddTerrainUv = vec2(
            atan(-ddSphereN.z, ddSphereN.x) / 6.28318530718 + 0.5,
            asin(clamp(ddSphereN.y, -1.0, 1.0)) / 3.14159265359 + 0.5
          );
          vec3 ddFilteredTerrain = texture2D(uTerrainPalette, ddTerrainUv).rgb;
          float ddPaletteEdge = max(abs(vDDLocal.x), abs(vDDLocal.z)) * 2.0;
          float ddPaletteAA = max(0.002,
            fwidth(ddPaletteEdge) * uEdgeSoftnessPx);
          float ddCellInterior = 1.0 - smoothstep(
            1.0 - ddPaletteAA, 1.0, ddPaletteEdge
          );
          float ddMipBlend = uPaletteBlend * mix(1.0, 0.76, ddCellInterior);
          diffuseColor.rgb = mix(
            diffuseColor.rgb, ddFilteredTerrain, ddTop * ddMipBlend
          );
          float ddSun = dot(normalize(vDDWorldN), normalize(uSunDir));
          float ddLit = smoothstep(-0.40, 0.55, ddSun);
          float ddShade = mix(uSideDark, uSideLit, ddLit);
          float ddTopShade = mix(uTopDark, uTopLit, ddLit);
          diffuseColor.rgb *= mix(1.0, ddTopShade, ddTop);
          // 0 at the foot of a side face, 1 by a third of the way up.
          float ddBase = smoothstep(-0.50, -0.16, vDDLocal.y);
          float ddAo = mix(uValleyAO, 1.0, ddBase);
          vec3 ddRock = mix(diffuseColor.rgb, uRock, uRockMix);
          diffuseColor.rgb = mix(diffuseColor.rgb, ddRock * ddShade * ddAo, ddSide);
          // The sun-facing top edge.
          vec2 ddE = vec2(vDDLocal.x, vDDLocal.z);
          float ddEdge = max(abs(ddE.x), abs(ddE.y)) * 2.0;
          float ddAlign = dot(normalize(ddE + vec2(1e-5)), normalize(vDDSunLocal + vec2(1e-5)));
          float ddRim = step(0.5, ddUp)
            * smoothstep(uRimEdge, 0.98, ddEdge)
            * smoothstep(0.10, 0.85, ddAlign)
            * smoothstep(-0.10, 0.30, ddSun)
            * uRimGain;
          diffuseColor.rgb += vec3(ddRim, ddRim * 0.98, ddRim * 0.90);
          float ddLandNV = max(0.0, dot(
            normalize(vDDWorldN), normalize(cameraPosition - vDDWorldP)
          ));
          float ddInnerHorizon = smoothstep(
            0.12, 0.90, pow(1.0 - ddLandNV, 1.65)
          );
          diffuseColor.rgb *= mix(1.0, uHorizonKeep, ddInnerHorizon);
        }`);
  };
  return material;
}

const land = new THREE.InstancedMesh(
  unitBox,
  terrainMaterial({ key: 'land', rimGain: 0.075 }),
  raster.voxels.length,
);
land.name = 'Earth voxel land';
land.castShadow = true;
land.receiveShadow = true;
land.userData.instanceBudget = GLOBE_LAND_LIMIT;
const dummy = new THREE.Object3D();
const radial = new THREE.Vector3();
const outward = new THREE.Vector3();
const east = new THREE.Vector3();
const north = new THREE.Vector3();
const yUp = new THREE.Vector3(0, 1, 0);
const tangentBasis = new THREE.Matrix4();
const tangentRotation = new THREE.Quaternion();
const voxelColor = new THREE.Color();

raster.voxels.forEach((voxel, index) => {
  radial.set(voxel.x, voxel.y, voxel.z);
  const lon = THREE.MathUtils.degToRad(voxel.lon);
  dummy.position.copy(radial);
  outward.copy(radial).normalize();
  east.set(-Math.sin(lon), 0, -Math.cos(lon));
  north.crossVectors(east, outward).normalize();
  tangentBasis.makeBasis(east, outward, north);
  tangentRotation.setFromRotationMatrix(tangentBasis);
  dummy.quaternion.copy(tangentRotation);
  dummy.scale.set(voxel.width, voxel.height, voxel.depth);
  dummy.updateMatrix();
  land.setMatrixAt(index, dummy.matrix);
  voxelColor.setHex(voxel.color);
  land.setColorAt(index, voxelColor);
});
land.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
land.instanceMatrix.needsUpdate = true;
if (land.instanceColor) land.instanceColor.needsUpdate = true;
globe.add(land);

const smoothLandData = buildSmoothLand();
const smoothLandGeometry = new THREE.BufferGeometry();
smoothLandGeometry.setAttribute('position', new THREE.BufferAttribute(smoothLandData.positions, 3));
smoothLandGeometry.setAttribute('color', new THREE.BufferAttribute(smoothLandData.colors, 3));
smoothLandGeometry.setAttribute('normal', new THREE.BufferAttribute(smoothLandData.normals, 3));
smoothLandGeometry.setIndex(new THREE.BufferAttribute(smoothLandData.indices, 1));
const smoothLandMaterial = new THREE.MeshBasicMaterial({
  color: SMOOTH_LAND_MATERIAL.color,
  vertexColors: SMOOTH_LAND_MATERIAL.vertexColors,
  toneMapped: SMOOTH_LAND_MATERIAL.toneMapped,
  fog: SMOOTH_LAND_MATERIAL.fog,
});
// P21-G1B: the accepted Imagen height sheet supplies soft geographic relief.
// Sample in local spherical coordinates so the field rotates with the land;
// lighting is evaluated in world space so the terminator stays with the sun.
const paintedHeight = new THREE.TextureLoader().load(new URL('./globe-height.png', import.meta.url).href);
paintedHeight.wrapS = THREE.RepeatWrapping;
paintedHeight.wrapT = THREE.ClampToEdgeWrapping;
paintedHeight.colorSpace = THREE.NoColorSpace;
smoothLandMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.uPaintHeight = { value: paintedHeight };
  shader.uniforms.uPaintSun = { value: keyLight.position.clone().normalize() };
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
    varying vec3 vPaintLocal;
    varying vec3 vPaintWorld;
    varying vec3 vPaintEast;
    varying vec3 vPaintNorth;`).replace('#include <begin_vertex>', `#include <begin_vertex>
    vPaintLocal = normalize(position);
    vPaintWorld = normalize(mat3(modelMatrix) * vPaintLocal);
    vec3 paintEast = normalize(vec3(vPaintLocal.z, 0.0, -vPaintLocal.x));
    vPaintEast = mat3(modelMatrix) * paintEast;
    vPaintNorth = mat3(modelMatrix) * cross(vPaintLocal, paintEast);`);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
    uniform sampler2D uPaintHeight;
    uniform vec3 uPaintSun;
    varying vec3 vPaintLocal;
    varying vec3 vPaintWorld;
    varying vec3 vPaintEast;
    varying vec3 vPaintNorth;`).replace('#include <color_fragment>', `#include <color_fragment>
    vec3 paintLocal = normalize(vPaintLocal);
    vec2 paintUV = vec2(atan(-paintLocal.z, paintLocal.x) / 6.28318530718 + 0.5,
      asin(clamp(paintLocal.y, -1.0, 1.0)) / 3.14159265359 + 0.5);
    float paintE = texture2D(uPaintHeight, paintUV + vec2(0.001953125, 0.0)).r
      - texture2D(uPaintHeight, paintUV - vec2(0.001953125, 0.0)).r;
    float paintN = texture2D(uPaintHeight, paintUV + vec2(0.0, 0.00390625)).r
      - texture2D(uPaintHeight, paintUV - vec2(0.0, 0.00390625)).r;
    vec3 paintNormal = normalize(normalize(vPaintWorld)
      - 1.4 * (paintE * normalize(vPaintEast) + paintN * normalize(vPaintNorth)));
    float paintDay = smoothstep(-0.30, 0.65, dot(paintNormal, uPaintSun));
    diffuseColor.rgb *= mix(0.72, 1.06, paintDay) * vec3(1.02, 1.0, 0.96);`);
};
smoothLandMaterial.customProgramCacheKey = () => 'p21-g1b-height-sheet';
const smoothLand = new THREE.Mesh(smoothLandGeometry, smoothLandMaterial);
smoothLand.name = 'globe:smooth-land';
smoothLand.castShadow = false;
smoothLand.receiveShadow = true;
smoothLand.renderOrder = 1;
globe.add(smoothLand);

const coastShelfGeometry = new THREE.BufferGeometry();
coastShelfGeometry.setAttribute('position', new THREE.BufferAttribute(smoothLandData.shelf.positions, 3));
coastShelfGeometry.setAttribute('color', new THREE.BufferAttribute(smoothLandData.shelf.colors, 3));
coastShelfGeometry.setIndex(new THREE.BufferAttribute(smoothLandData.shelf.indices, 1));
coastShelfGeometry.computeVertexNormals();
const coastShelf = new THREE.Mesh(coastShelfGeometry, new THREE.MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.92,
  depthWrite: false,
  toneMapped: false,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -2,
}));
coastShelf.name = 'globe:coast-shelf';
coastShelf.renderOrder = 0;
globe.add(coastShelf);

const riverGeometry = new THREE.BufferGeometry();
riverGeometry.setAttribute('position', new THREE.BufferAttribute(smoothLandData.rivers.positions, 3));
const landRivers = new THREE.LineSegments(riverGeometry, new THREE.LineBasicMaterial({
  color: LAND_BIOMES.river,
  transparent: true,
  opacity: 0.72,
  depthWrite: false,
}));
landRivers.name = 'globe:land-rivers';
landRivers.renderOrder = 2;
globe.add(landRivers);

let landFadeCurrent = 0;
function applyLandFade(fade) {
  const voxelsOn = fade > 0.02;
  const smoothOn = fade < 0.98;
  land.visible = voxelsOn;
  relief.visible = voxelsOn;
  foam.visible = voxelsOn;
  skirt.visible = voxelsOn;
  smoothLand.visible = smoothOn;
  coastShelf.visible = smoothOn;
  landRivers.visible = smoothOn;
  if (land.material) {
    land.material.transparent = voxelsOn && fade < 0.98;
    land.material.opacity = voxelsOn ? fade : 1;
  }
  if (relief.material) {
    relief.material.transparent = voxelsOn && fade < 0.98;
    relief.material.opacity = voxelsOn ? fade : 1;
  }
  smoothLandMaterial.opacity = 1;
  coastShelf.material.opacity = 0.12 * (1 - fade);
}

const foam = new THREE.InstancedMesh(
  unitBox,
  standardMaterial(0xffffff, { roughness: 0.62, metalness: 0.08 }),
  Math.max(1, foamRaster.voxels.length),
);
foam.name = 'p1-coast-foam';
foam.castShadow = false;
foam.receiveShadow = true;
foamRaster.voxels.forEach((voxel, index) => {
  radial.set(voxel.x, voxel.y, voxel.z);
  const lon = THREE.MathUtils.degToRad(voxel.lon);
  dummy.position.copy(radial);
  outward.copy(radial).normalize();
  east.set(-Math.sin(lon), 0, -Math.cos(lon));
  north.crossVectors(east, outward).normalize();
  tangentBasis.makeBasis(east, outward, north);
  tangentRotation.setFromRotationMatrix(tangentBasis);
  dummy.quaternion.copy(tangentRotation);
  dummy.scale.set(voxel.width, voxel.height, voxel.depth);
  dummy.updateMatrix();
  foam.setMatrixAt(index, dummy.matrix);
  voxelColor.setHex(voxel.color);
  foam.setColorAt(index, voxelColor);
});
foam.instanceMatrix.setUsage(THREE.StaticDrawUsage);
foam.instanceMatrix.needsUpdate = true;
if (foam.instanceColor) foam.instanceColor.needsUpdate = true;
globe.add(foam);

/*
 * ── P14-M9 ITEM 1 — THE BEACH SKIRT UNDER EVERY CONTINENT EDGE. ──
 *
 * `p1-coast-foam` lays a 0.0025-unit voxel on the WATER side of each coast
 * cell; at 314.9 px per unit that is 0.79 px, which is why the frames read no
 * beach at all. This is the LAND side: one lighter box under every land cell
 * that touches water, 0.016 units tall (5.0 px) so it bridges the sea surface
 * to the land's underside, and 1.34x the cell's own plan so it stands proud of
 * the extrusion as a terrace rather than hiding under it. Sand, wetted paler
 * along the lattice; ice-white inside the polar caps.
 *
 * One instanced draw call for 10,346 cells. `castShadow` is off — a 0.016-unit
 * slab cannot resolve a shadow at this map's texel density and would only
 * fringe the coast — and `receiveShadow` is on, so the continent standing on it
 * darkens its own beach.
 */
const skirt = new THREE.InstancedMesh(
  unitBox,
  standardMaterial(0xffffff, { roughness: 0.86, metalness: 0.02 }),
  Math.max(1, skirtRaster.voxels.length),
);
skirt.name = 'p1-coast-skirt';
skirt.castShadow = false;
skirt.receiveShadow = true;
skirt.userData.instanceBudget = COAST_SKIRT.limit;
skirtRaster.voxels.forEach((voxel, index) => {
  radial.set(voxel.x, voxel.y, voxel.z);
  const lon = THREE.MathUtils.degToRad(voxel.lon);
  dummy.position.copy(radial);
  outward.copy(radial).normalize();
  east.set(-Math.sin(lon), 0, -Math.cos(lon));
  north.crossVectors(east, outward).normalize();
  tangentBasis.makeBasis(east, outward, north);
  tangentRotation.setFromRotationMatrix(tangentBasis);
  dummy.quaternion.copy(tangentRotation);
  dummy.scale.set(voxel.width, voxel.height, voxel.depth);
  dummy.updateMatrix();
  skirt.setMatrixAt(index, dummy.matrix);
  voxelColor.setHex(voxel.color);
  skirt.setColorAt(index, voxelColor);
});
skirt.instanceMatrix.setUsage(THREE.StaticDrawUsage);
skirt.instanceMatrix.needsUpdate = true;
if (skirt.instanceColor) skirt.instanceColor.needsUpdate = true;
// Under the land, over the sea: the skirt draws before the continents so the
// extrusion's own faces win where they overlap.
skirt.renderOrder = -2;
globe.add(skirt);

/*
 * ── P14-M10 ITEM 2 — THE SECOND AND THIRD TIERS. ──
 *
 * The band tint gives the tops terrain colour; this gives the land a stepped
 * SILHOUETTE. `rasterizeLandRelief` stacks one extra voxel on 12.0 % of land
 * cells and two on 4.7 %, each 0.94x and 0.84x the plan below it, so every
 * upland reads as a terrace with a lit shoulder and the limb of the globe is
 * notched instead of smooth. 23,025 voxels in ONE instanced draw call against
 * a 60,000 budget; `receiveShadow` is on so a tier throws onto the tier under
 * it, and `castShadow` is on for the same reason the base land has it.
 *
 * A HIGHER RIM GAIN THAN THE BASE. A base cell is 2.67 px across and its own
 * neighbours overlap it (the plan is 1.12x the cell), so a rim on it is mostly
 * hidden; a tier cell stands 1.4 px proud of what is under it and its rim is
 * the edge the eye actually reads as a ridge line.
 */
const relief = new THREE.InstancedMesh(
  unitBox,
  // The rim was 0.16 in the first cut. At 2.67 px per cell a rim on EVERY cell
  // is a highlight at cell frequency, and the 3x sighting crop came back with a
  // regular crosshatch over every upland — the tile read this item exists to
  // remove. 0.10 leaves the plateau EDGES lit and the interiors quiet.
  terrainMaterial({ key: 'relief', rimGain: 0.10, valleyAO: 0.56, roughness: 0.90 }),
  Math.max(1, reliefRaster.voxels.length),
);
relief.name = 'p1-land-relief';
relief.castShadow = true;
relief.receiveShadow = true;
relief.userData.instanceBudget = RELIEF_LIMIT;
reliefRaster.voxels.forEach((voxel, index) => {
  radial.set(voxel.x, voxel.y, voxel.z);
  const lon = THREE.MathUtils.degToRad(voxel.lon);
  dummy.position.copy(radial);
  outward.copy(radial).normalize();
  east.set(-Math.sin(lon), 0, -Math.cos(lon));
  north.crossVectors(east, outward).normalize();
  tangentBasis.makeBasis(east, outward, north);
  tangentRotation.setFromRotationMatrix(tangentBasis);
  dummy.quaternion.copy(tangentRotation);
  dummy.scale.set(voxel.width, voxel.height, voxel.depth);
  dummy.updateMatrix();
  relief.setMatrixAt(index, dummy.matrix);
  voxelColor.setHex(voxel.color);
  relief.setColorAt(index, voxelColor);
});
relief.instanceMatrix.setUsage(THREE.StaticDrawUsage);
relief.instanceMatrix.needsUpdate = true;
if (relief.instanceColor) relief.instanceColor.needsUpdate = true;
// The tiers are geometry, not decals: they need no render-order override, and
// leaving them at 0 keeps them inside the opaque pass with the land they stand
// on. `raycast` is untouched — the icons, the labels and every hit test go
// through `flagGroups`, `routeMeshes` and `forceTokenGroup`, none of which this
// mesh belongs to.
globe.add(relief);
applyLandFade(0);

const channelMaterial = standardMaterial(0x2f6f8c, {
  roughness: 0.42,
  metalness: 0.18,
  emissive: 0x163044,
  emissiveIntensity: 0.22,
});
const CHANNEL_MARKS = [
  [36.1, -5.4], [36.6, 3.5], [35.5, 14.4], [35.4, 18.8], [33.05, 30.6],
  [31.27, 32.30], [30.57, 32.29], [30.32, 32.38], [29.97, 32.55],
  [27.70, 33.95], [24.2, 36.0], [21.50, 38.80], [20.40, 38.30], [16.2, 41.1], [12.58, 43.33],
];
for (const [lat, lon] of CHANNEL_MARKS) {
  const mark = new THREE.Mesh(unitBox, channelMaterial);
  const pos = latLonToVector(lat, lon, GLOBE_RADIUS - 0.004);
  mark.position.set(pos.x, pos.y, pos.z);
  mark.quaternion.setFromUnitVectors(yUp, mark.position.clone().normalize());
  mark.scale.set(0.028, 0.006, 0.028);
  mark.name = 'sea channel';
  globe.add(mark);
}

const forceTokenGroup = new THREE.Group();
forceTokenGroup.name = 'Melbourne force tokens';
globe.add(forceTokenGroup);
const cargoGroup = new THREE.Group();
cargoGroup.name = 'Working cargo';
globe.add(cargoGroup);
const cargoRunners = [];
const bobTargets = [];

function markerShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 3, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.78)');
  gradient.addColorStop(0.54, 'rgba(0, 0, 0, 0.52)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'globe:marker-shadow-map';
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

const globeBlobMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  map: markerShadowTexture(),
  transparent: true,
  opacity: 0.72,
  depthWrite: false,
  toneMapped: false,
});
const globeBlobGeometry = new THREE.RingGeometry(
  P1_GROUNDING.globeBlobRadius * 0.52,
  P1_GROUNDING.globeBlobRadius * 1.05,
  24,
);

/* ================================================================== *
 * P14 M11 ITEM 4 — CITY PINS BELONG TO THE GLOBE.
 *
 * MC6 pack-d, 6/10, weakest: "city pins are FLAT-LIT toy blocks with colliding
 * labels that fight the globe's material language". Three separate facts, and
 * each has its own fix here:
 *
 *   FLAT-LIT   `setCargoLit` puts `emissive = baseColour * 0.28` at intensity
 *              0.38 on every lit pip, and the globe carries an ambient and a
 *              hemisphere on top of a single key. An emissive term takes no
 *              light at all, so a pin on the NIGHT side of the sphere was as
 *              bright as one at noon and no pin had a shaded side. The pins
 *              carry the sea's own terminator now (`bindPinShading`), read
 *              from the SAME `uSunDir` the ocean and the atmosphere read, so
 *              a pin is lit when its patch of ocean is lit.
 *   NO CONTACT `p1-contact-blob` is a flat dark disc at 0.42 opacity that sits
 *              under everything and reads as a sticker. A contact ring is
 *              added over it: a narrow annulus, dark inside and lit on the
 *              sun side, which is what a small object standing on a surface
 *              actually puts down.
 *   ONE SIZE   the fight dollies the camera in by up to 2x and the pins grew
 *              with it, so a marker became a prop. `scalePinsForZoom` holds
 *              them near a constant SCREEN size, with a partial exponent so
 *              they still gain a little presence when the camera closes.
 * ================================================================== */
const PIN_SHADE = Object.freeze({
  /** How much of the albedo a pin keeps on the night side. */
  nightKeep: 0.66,
  /** Cool push on the night side. */
  nightTint: 0.30,
  /** Emissive the lit pips carry. M10 ran 0.38, which is a lamp, not a token. */
  litEmissive: 0.24,
  dimEmissive: 0.18,
  /** Camera Z the pins are authored at, and the compensation exponent. */
  refCamZ: 5.15,
  zoomExp: 0.72,
  scaleMin: 0.28,
  scaleMax: 0.75,
  sightingScale: SMOOTH_LAND.pinSightingScale,
});
const boundPinMaterials = new Set();

/**
 * Give a pin material the globe's own day/night. Injected into the standard
 * material so the key, the shadow map, the fog and the tone map all still
 * apply; only the diffuse colour is scaled, so a pin's own hue survives.
 */
function bindPinShading(material) {
  if (!material || material.userData?.pinShaded) return material;
  material.userData.pinShaded = true;
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.(shader, renderer);
    shader.uniforms.uPinSun = pinShadeUniform;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       varying vec3 vPinWN;`,
    ).replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vPinWN = normalize(mat3(modelMatrix) * objectNormal);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       uniform vec3 uPinSun;
       varying vec3 vPinWN;`,
    ).replace(
      '#include <map_fragment>',
      `#include <map_fragment>
       float pinNl = dot(normalize(vPinWN), normalize(uPinSun));
       float pinNight = smoothstep(0.34, -0.26, pinNl);
       diffuseColor.rgb *= mix(1.0, ${PIN_SHADE.nightKeep.toFixed(3)}, pinNight);
       diffuseColor.b += diffuseColor.b * ${PIN_SHADE.nightTint.toFixed(3)} * pinNight;`,
    );
    material.userData.pinShader = shader;
  };
  material.customProgramCacheKey = () => 'dd-pin-shade-m11';
  material.needsUpdate = true;
  boundPinMaterials.add(material);
  return material;
}

/* G1: a low bevelled plinth, a soft footprint, and a separate specular lip. */
const markerRadius = P1_GROUNDING.globeBlobRadius;
const markerInner = markerRadius * 0.52;
const globeMarkerGeometry = new THREE.LatheGeometry([
  new THREE.Vector2(markerInner, 0.002),
  new THREE.Vector2(markerRadius * 0.76, 0.002),
  new THREE.Vector2(markerRadius * 0.96, 0.006),
  new THREE.Vector2(markerRadius * 1.04, 0.012),
  new THREE.Vector2(markerRadius * 0.96, 0.021),
  new THREE.Vector2(markerRadius * 0.78, 0.026),
  new THREE.Vector2(markerInner, 0.026),
], 24);
globeMarkerGeometry.name = 'globe:marker-disc-geometry';
const globeMarkerMaterial = bindPinShading(new THREE.MeshPhysicalMaterial({
  color: 0x819795,
  roughness: 0.56,
  metalness: 0.06,
  emissive: 0x334443,
  emissiveIntensity: 0.22,
  clearcoat: 0.2,
  clearcoatRoughness: 0.16,
}));
globeMarkerMaterial.name = 'globe:marker-specular-edge';

function addContactBlob(parent, radiusScale = 1) {
  const blob = new THREE.Mesh(globeBlobGeometry, globeBlobMaterial);
  blob.name = 'p1-contact-blob';
  blob.rotation.x = -Math.PI / 2;
  blob.position.set(0, 0.0012, 0);
  blob.userData.radiusScale = radiusScale;
  blob.scale.setScalar(radiusScale);
  blob.renderOrder = 1;
  parent.add(blob);
  // Keep the inherited two-draw marker budget: its old flat ring becomes the
  // physical bevel, whose sloped normals and clearcoat make the specular edge.
  const discGroup = new THREE.Group();
  discGroup.name = 'globe:marker-disc';
  discGroup.userData.radiusScale = radiusScale;
  discGroup.scale.setScalar(radiusScale);
  const disc = new THREE.Mesh(globeMarkerGeometry, globeMarkerMaterial);
  disc.name = 'p1-contact-ring';
  disc.castShadow = true;
  disc.receiveShadow = true;
  disc.renderOrder = 2;
  discGroup.add(disc);
  parent.add(discGroup);
  return blob;
}

/**
 * Hold the pins near a constant SCREEN size as the fight dollies in. A camera
 * at distance d projects a length proportional to 1/d, so a scale of d/refD
 * would be exactly constant; the exponent leaves a little growth so a pin the
 * camera has closed on still reads as nearer.
 */
function scalePinsForZoom(camZ) {
  const s = pinScaleForCamZ(camZ);
  for (const flag of flagGroups) {
    flag.scale.setScalar((flag.userData.baseScale ?? 1) * s);
  }
  forceTokenGroup.traverse((child) => {
    if (child.name !== 'globe:marker-disc' && child.name !== 'p1-contact-blob') return;
    const radiusScale = child.userData.radiusScale ?? 1;
    child.scale.setScalar(radiusScale * s);
  });
  return s;
}

function addTokenBox(parent, material, scale, position) {
  const part = new THREE.Mesh(unitBox, material);
  part.scale.set(...scale);
  part.position.set(...position);
  part.castShadow = true;
  parent.add(part);
  return part;
}

async function loadCargoGlbs() {
  const loader = new GLTFLoader();
  await Promise.all(CARGO_GLB_GOODS.map(async (good) => {
    const gltf = await loader.loadAsync(`./assets/models/world-cargo/${good}.glb`);
    cargoTemplates.set(good, gltf.scene);
  }));
}

function setCargoLit(pip, lit) {
  pip.userData.colourParts.forEach((mesh) => {
    const base = mesh.userData.baseColor;
    if (!base || !mesh.material?.color) return;
    /*
     * M11 item 4 — the emissive is a THIRD of what it was. An emissive term is
     * light the object carries itself: at 0.38 with a 0.28 tint it was the
     * largest contribution to a pin's value on both halves of the sphere,
     * which is exactly why the audit read them as flat-lit. It is kept — a
     * token that goes black on the night side is unreadable — but it is now
     * small enough that the key does the shading.
     */
    if (lit) {
      mesh.material.color.copy(base);
      if (mesh.material.emissive) mesh.material.emissive.copy(base).multiplyScalar(0.20);
      mesh.material.emissiveIntensity = PIN_SHADE.litEmissive;
    } else {
      mesh.material.color.copy(base).multiplyScalar(0.92);
      if (mesh.material.emissive) mesh.material.emissive.copy(base).multiplyScalar(0.10);
      mesh.material.emissiveIntensity = PIN_SHADE.dimEmissive;
    }
  });
}

function addGoodPip(parent, route) {
  const pip = new THREE.Group();
  pip.name = `${route.good} cargo`;
  pip.userData.routeId = route.id;
  pip.userData.good = route.good;
  pip.userData.colourParts = [];
  pip.position.set(0, 0.01, 0);
  const template = cargoTemplates.get(route.good);
  if (template) {
    const model = template.clone(true);
    model.name = `${route.good} glb`;
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.material = child.material.clone();
      child.castShadow = true;
      child.receiveShadow = true;
      child.userData.baseColor = child.material.color.clone();
      // M11 item 4 — the GLB's own material takes the globe's terminator now,
      // so a pin on the night side is a night pin.
      bindPinShading(child.material);
      pip.userData.colourParts.push(child);
    });
    pip.add(model);
  } else if (deskNeedsVoxelCargo(route.good)) {
    const material = goodPipMaterial(route.good, false);
    const voxel = addVoxelCargoProp(THREE, pip, route.good, material, unitBox);
    voxel.group.scale.setScalar(VOXEL_CARGO_FIT);
    pip.userData.colourParts.push(...voxel.parts);
  } else {
    const material = goodPipMaterial(route.good, false);
    const part = addTokenBox(pip, material, [0.06, 0.044, 0.048], [0, 0.025, 0]);
    pip.userData.colourParts.push(part);
  }
  const hold = addTokenBox(pip, materials.hold, [0.08, 0.04, 0.04], [0.22, 0.55, 0.18]);
  hold.name = 'HOLD wax';
  hold.visible = false;
  pip.userData.hold = hold;
  const hit = addTokenBox(pip, materials.hit, [0.9, 0.8, 0.9], [0, 0.35, 0]);
  hit.name = `${route.good} pip pick target`;
  pip.scale.setScalar(CARGO_SCALE_BY_GOOD[route.good] ?? CARGO_SCALE);
  addContactBlob(pip, 1.6);
  parent.add(pip);
  return pip;
}

function orientTokenRoot(root, lat, lon, radius) {
  const point = latLonToVector(lat, lon, radius);
  root.position.set(point.x, point.y, point.z);
  root.quaternion.setFromUnitVectors(yUp, root.position.clone().normalize());
}

function orientMaritimeTokenRoot(root, lat, lon, radius) {
  const point = latLonToVector(lat, lon, radius);
  const longitude = THREE.MathUtils.degToRad(lon);
  const surfaceUp = new THREE.Vector3(point.x, point.y, point.z).normalize();
  const surfaceEast = new THREE.Vector3(-Math.sin(longitude), 0, -Math.cos(longitude));
  const surfaceNorth = new THREE.Vector3().crossVectors(surfaceEast, surfaceUp).normalize();
  const basis = new THREE.Matrix4().makeBasis(surfaceEast, surfaceUp, surfaceNorth);
  root.position.set(point.x, point.y, point.z);
  root.quaternion.setFromRotationMatrix(basis);
}

function bookMidpoint(route) {
  const origin = cityById.get(route.from)?.map;
  const destination = cityById.get(route.to)?.map;
  const stops = cargoWaypoints(route.id, origin, destination);
  if (stops.length < 2) return origin ?? { lat: -40.3, lon: 146.8 };
  return stops[Math.max(0, Math.min(stops.length - 1, Math.floor(stops.length * 0.45)))];
}

function makeForceToken(kind, index) {
  const escorted = kind === 'navy' ? escortedSeaBook(index) : null;
  const authoredSite = FORCE_TOKEN_SITES[kind][index];
  const site = escorted ? bookMidpoint(escorted) : { lat: authoredSite[0], lon: authoredSite[1] };
  const { lat, lon } = site;
  const root = new THREE.Group();
  const token = new THREE.Group();
  root.name = `${kind} token ${index + 1}`;
  root.userData.forceKind = kind;
  root.userData.forceIndex = index;
  root.userData.baseScale = escorted ? 1.25 : 1;
  root.add(token);

  if (kind === 'army') {
    orientTokenRoot(root, lat, lon, GLOBE_RADIUS + 0.025);
    addTokenBox(token, materials.army, [0.043, 0.01, 0.022], [0, 0.012, 0]);
    addTokenBox(token, materials.army, [0.016, 0.014, 0.018], [0.012, 0.023, 0]);
    addTokenBox(token, materials.ink, [0.015, 0.017, 0.012], [-0.028, 0.014, -0.027]);
    addTokenBox(token, materials.ink, [0.015, 0.017, 0.012], [0.028, 0.014, -0.027]);
    addTokenBox(token, materials.ink, [0.015, 0.017, 0.012], [-0.028, 0.014, 0.027]);
    addTokenBox(token, materials.ink, [0.015, 0.017, 0.012], [0.028, 0.014, 0.027]);
    token.rotation.y = -0.48 + ((index % 3) * 0.2);
  } else if (kind === 'navy') {
    orientMaritimeTokenRoot(root, lat, lon, GLOBE_RADIUS + (escorted ? 0.16 : 0.026));
    addTokenBox(token, materials.navy, [0.065, 0.01, 0.022], [0, 0.006, 0]);
    const bow = addTokenBox(token, materials.navy, [0.046, 0.019, 0.036], [0.071, 0.013, 0]);
    bow.rotation.y = 0.72;
    addTokenBox(token, materials.navy, [0.04, 0.028, 0.03], [-0.018, 0.032, 0]);
    addTokenBox(token, materials.navyGunwale, [0.105, 0.006, 0.034], [0.004, 0.026, 0]);
    addTokenBox(token, materials.locked, [0.007, 0.024, 0.007], [-0.011, 0.041, 0]);
    addTokenBox(token, materials.brass, [0.011, 0.011, 0.011], [-0.024, 0.036, 0]);
    token.position.set(escorted ? 0 : 0.18, 0, escorted ? 0 : 0.03);
    token.rotation.y = (escorted ? 0.62 : 0.08) + ((index % 3) * 0.18);
    bobTargets.push({ object: token, baseY: 0, amplitude: 0.004, phase: index * 0.9 });
  } else if (kind === 'drone') {
    orientTokenRoot(root, lat, lon, GLOBE_RADIUS + 0.03);
    addTokenBox(token, materials.drone, [0.072, 0.014, 0.022], [0, 0.01, 0]);
    addTokenBox(token, materials.drone, [0.03, 0.006, 0.092], [0.004, 0.012, 0]);
    addTokenBox(token, materials.ink, [0.016, 0.02, 0.006], [-0.032, 0.022, 0.014]);
    addTokenBox(token, materials.ink, [0.016, 0.02, 0.006], [-0.032, 0.022, -0.014]);
    addTokenBox(token, materials.brass, [0.014, 0.012, 0.014], [0.034, 0.006, 0]);
    token.position.set(0, 0.04, 0);
    token.rotation.y = 0.4 + ((index % 4) * 0.22);
    bobTargets.push({ object: token, baseY: 0.04, amplitude: 0.004, phase: index * 0.6 });
  } else if (kind === 'nuke') {
    // Slender upright silo missile on the inland SA sites — never the air kite.
    orientTokenRoot(root, lat, lon, GLOBE_RADIUS + 0.02);
    addTokenBox(token, materials.ink, [0.03, 0.008, 0.03], [0, 0.004, 0]);
    addTokenBox(token, materials.locked, [0.013, 0.052, 0.013], [0, 0.032, 0]);
    addTokenBox(token, materials.brass, [0.009, 0.014, 0.009], [0, 0.063, 0]);
    addTokenBox(token, materials.ink, [0.02, 0.01, 0.006], [0, 0.008, 0.012]);
    token.rotation.y = 0.2 + ((index % 4) * 0.3);
  } else {
    orientTokenRoot(root, lat, lon, GLOBE_RADIUS + 0.02);
    const kite = new THREE.Mesh(kiteGeometry, materials.air);
    kite.castShadow = true;
    token.add(kite);
    addTokenBox(token, materials.ink, [0.045, 0.004, 0.004], [0.002, 0.002, 0]);
    addTokenBox(token, materials.locked, [0.012, 0.004, 0.006], [-0.03, 0.001, 0]);
    token.position.set(0, 0.06, 0);
    token.rotation.y = -0.3 + ((index % 4) * 0.2);
    bobTargets.push({ object: token, baseY: 0.06, amplitude: 0.003, phase: index * 0.75 });
  }

  if (kind === 'army' || kind === 'navy') addContactBlob(root, kind === 'navy' ? 1.8 : 1.4);
  const flying = kind === 'air' || kind === 'drone';
  const hit = new THREE.Mesh(unitBox, materials.hit);
  hit.scale.set(flying ? 0.13 : 0.22, flying ? 0.04 : 0.15, flying ? 0.1 : 0.16);
  hit.position.set(0, flying ? 0 : 0.055, 0);
  token.add(hit);
  root.traverse((child) => {
    child.userData.forceKind = kind;
    child.userData.forceIndex = index;
  });
  return root;
}

function paintForceTokenSelection() {
  for (const root of forceTokenGroup.children) {
    const selected = selectedForce
      && root.userData.forceKind === selectedForce.kind
      && root.userData.forceIndex === selectedForce.index;
    root.scale.setScalar(root.userData.baseScale * (selected ? 1.1 : 1));
  }
}

function rebuildForceTokens() {
  forceTokenGroup.clear();
  bobTargets.length = 0;
  for (const kind of WORLD_FORCE_KINDS) {
    const total = world.forces?.[kind] ?? 0;
    const visible = Math.min(total, FORCE_VISUAL_CAP);
    for (let index = 0; index < visible; index += 1) {
      forceTokenGroup.add(makeForceToken(kind, index));
    }
  }
  if (selectedForce && selectedForce.index >= (world.forces?.[selectedForce.kind] ?? 0)) {
    selectedForce = null;
  }
  paintForceTokenSelection();
}

const routeMeshes = [];
const routeLabelById = new Map();
const cybercabPoll = createCybercabBookPoll();
let cybercabBook = cybercabBookModel(liveCybercabCity());
let cybercabPollTime = 0;

function syncCybercabBook() {
  const decision = cybercabPoll.poll(liveCybercabCity());
  if (!decision.changed) return;
  const wasOpened = cybercabBook.opened;
  cybercabBook = decision.nextBook;
  rebuildRoutes();
  if (!wasOpened && cybercabBook.opened) selectCity(CYBERCAB_PORT);
  else paintHud();
}

function createRouteLabels() {
  routeLabelsElement.replaceChildren();
  routeLabelById.clear();
}

function rebuildRoutes() {
  routeMeshes.forEach((mesh) => {
    globe.remove(mesh);
    mesh.geometry?.dispose();
    mesh.userData.materials?.forEach((material) => material.dispose());
  });
  routeMeshes.length = 0;
  if (selectedRouteId && !WORLD_TRADE_ROUTES.some((route) => route.id === selectedRouteId)) {
    selectedRouteId = null;
  }
  createRouteLabels();
  // P21: show only paid, working connections. One screen-pixel stroke;
  // endpoint labels and the selected supplier card carry the explanation.
  for (const route of [...WORLD_TRADE_ROUTES, CYBERCAB_ROUTE]) {
    if (route.id === CYBERCAB_LANE) {
      if (!cybercabBook.opened || !cybercabBook.orders.some(order => order.status !== 'delivered')) continue;
    } else if (world.routes[route.id]?.status !== 'open') continue;
    const points = routePolyline(route);
    const geometry = new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 97 }, (_, i) => pointOnRoute(points, i / 96, CARGO_MODE[route.id])),
    );
    const material = new THREE.LineBasicMaterial({
      color: 0xc5a568, transparent: true, opacity: 0.32, depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    line.name = `globe:route:${route.id}`;
    line.userData.routeId = route.id;
    line.userData.materials = [material];
    globe.add(line);
    routeMeshes.push(line);
    if (route.id === CYBERCAB_LANE) {
      const label = document.createElement('button');
      line.userData.labelOffset = { x: 0, y: -18 };
      label.type = 'button';
      label.className = 'province-route-label';
      label.dataset.route = CYBERCAB_LANE;
      label.addEventListener('click', () => selectCity(CYBERCAB_PORT));
      routeLabelsElement.append(label);
      routeLabelById.set(CYBERCAB_LANE, label);
    }
  }
  rebuildCargo();
}

function routePolyline(route) {
  const origin = cityById.get(route.from)?.map;
  const destination = cityById.get(route.to)?.map;
  const stops = cargoWaypoints(route.id, origin, destination);
  const points = [];
  for (let leg = 0; leg < stops.length - 1; leg += 1) {
    const samples = CARGO_MODE[route.id] === 'air' ? 36 : 18;
    const legPoints = greatCircle(stops[leg], stops[leg + 1], samples);
    points.push(...(leg === 0 ? legPoints : legPoints.slice(1)));
  }
  return points;
}

function toVector3(point) {
  return point instanceof THREE.Vector3
    ? point
    : new THREE.Vector3(point.x, point.y, point.z);
}

function pointOnRoute(points, t, mode = 'sea-asia') {
  if (points.length < 2) return toVector3(latLonToVector(0, 0, GLOBE_RADIUS));
  const u = THREE.MathUtils.clamp(t, 0, 1);
  const f = u * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(f));
  const local = f - index;
  const a = points[index];
  const b = points[index + 1];
  const lat = a.lat + ((b.lat - a.lat) * local);
  let dLon = b.lon - a.lon;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  const lon = a.lon + (dLon * local);
  const lift = cargoLift(mode, u);
  const point = latLonToVector(lat, lon, GLOBE_RADIUS + lift);
  return new THREE.Vector3(point.x, point.y, point.z);
}

const cargoFractionMemo = new Map();
const CARGO_EASE_MS = 2600;

function rebuildCargo() {
  for (const runner of cargoRunners) {
    if (runner.userData.routeId !== CYBERCAB_LANE) continue;
    for (const mesh of runner.userData.colourParts ?? []) {
      boundPinMaterials.delete(mesh.material);
      mesh.material.dispose();
    }
  }
  cargoGroup.clear();
  cargoRunners.length = 0;
  const beat = world.beat ?? 0;
  for (const shipment of world.shipments ?? []) {
    if (Number.isInteger(shipment.landedBeat)) {
      cargoFractionMemo.delete(shipment.id);
      continue;
    }
    const route = WORLD_TRADE_ROUTES.find((row) => row.id === shipment.routeId);
    if (!route) continue;
    const points = routePolyline(route);
    if (points.length < 2) continue;
    const runner = addGoodPip(cargoGroup, route);
    runner.userData.shipmentId = shipment.id;
    runner.userData.shipment = shipment;
    runner.userData.points = points;
    runner.userData.mode = CARGO_MODE[route.id] ?? 'sea-asia';
    runner.userData.days = CARGO_DAYS[route.id] ?? route.days ?? 18;
    const target = shipmentLaneFraction(shipment, beat);
    const prev = cargoFractionMemo.get(shipment.id);
    // Ease from the previous beat's position so cargo CRAWLS along the
    // lane instead of jumping between beat marks (critic V5.2 item 2).
    runner.userData.fromFraction = Number.isFinite(prev) ? prev : target;
    runner.userData.fraction = target;
    runner.userData.easeStart = performance.now();
    cargoFractionMemo.set(shipment.id, target);
    const start = pointOnRoute(points, runner.userData.fromFraction, runner.userData.mode);
    runner.position.copy(start);
    runner.quaternion.setFromUnitVectors(yUp, start.clone().normalize());
    cargoRunners.push(runner);
  }
  const line = routeMeshes.find(mesh => mesh.userData.routeId === CYBERCAB_LANE);
  const active = cybercabBook.orders.filter(order => order.status !== 'delivered');
  // Orders sharing a sailing use one cargo marker, with quantity in the register.
  const sailings = new Map(active.map(order => [`${order.status}:${order.progress}`, order]));
  if (line && cargoTemplates.has('autos')) for (const order of sailings.values()) {
    const runner = addGoodPip(cargoGroup, CYBERCAB_ROUTE);
    runner.name = 'globe:cybercab-import';
    // A cargo symbol at sea needs no detached contact disc or decorative halo.
    for (const child of [...runner.children]) {
      if (child.name === 'p1-contact-blob' || child.name === 'globe:marker-disc') runner.remove(child);
    }
    setCargoLit(runner, true);
    Object.assign(runner.userData, {
      orderId: order.id, points: routePolyline(CYBERCAB_ROUTE), mode: 'sea-asia',
      fraction: order.progress, fromFraction: cargoFractionMemo.get(order.id) ?? order.progress,
      easeStart: performance.now(),
    });
    cargoFractionMemo.set(order.id, order.progress);
    cargoRunners.push(runner);
    line.userData.labelAnchor = runner;
  }
  const label = routeLabelById.get(CYBERCAB_LANE);
  if (label) {
    const shipping = active.filter(order => order.status === 'shipping').length;
    label.textContent = `CABS ×${active.length}`;
    label.title = shipping ? `${shipping} cybercabs shipping to Melbourne` : `${active.length} cybercabs arrived at Melbourne port yard`;
  }
}

// Supply the existing register an attachment measured from the actual cargo,
// including camera tilt. No fixed HUD offset or independently placed label.
function updateCybercabLabelAnchor() {
  const line = routeMeshes.find(mesh => mesh.userData.routeId === CYBERCAB_LANE);
  const runner = line?.userData.labelAnchor;
  const label = routeLabelById.get(CYBERCAB_LANE);
  if (!runner || !label) return;
  const width = landElement.clientWidth, height = landElement.clientHeight;
  const origin = runner.getWorldPosition(new THREE.Vector3());
  const centre = globe.getWorldPosition(new THREE.Vector3());
  const view = camera.getWorldPosition(new THREE.Vector3()).sub(centre).normalize();
  const depth = origin.clone().sub(centre).normalize().dot(view);
  const scale = .85 + .15 * Math.max(0, depth);
  origin.project(camera);
  let left = Infinity, right = -Infinity, top = Infinity;
  const p = new THREE.Vector3();
  runner.getObjectByName('autos glb').traverse(mesh => {
    if (!mesh.isMesh) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      p.set(x, y, z).applyMatrix4(mesh.matrixWorld).project(camera);
      left = Math.min(left, (p.x + 1) * width / 2);
      right = Math.max(right, (p.x + 1) * width / 2);
      top = Math.min(top, (1 - p.y) * height / 2);
    }
  });
  line.userData.labelOffset = {
    x: (left + right) / 2 - (origin.x + 1) * width / 2,
    y: top - (1 - origin.y) * height / 2 - label.offsetHeight * scale / 2 - 3,
  };
}

const flagGroups = [];
const labelByCity = new Map();
const leaderByCity = new Map();
let lastLabelPlacement = null;
/** M11 item 4 — the pin scale the last frame applied, for the read-back. */
let lastPinScale = 1;

function marketRole(cityId) {
  if (cityId === MELBOURNE_ID) return 'home';
  const routes = WORLD_TRADE_ROUTES.filter((route) => (
    route.playerOpenable
    && (route.from === cityId || (route.from === MELBOURNE_ID && route.to === cityId))
  ));
  if (routes.some((route) => world.routes[route.id]?.status === 'open')) return 'working';
  if (routes.length > 0) return 'openable';
  return 'locked';
}

function materialForMarketRole(role) {
  if (role === 'home') return materials.home;
  if (role === 'working') return materials.working;
  if (role === 'openable') return materials.openable;
  return materials.locked;
}

function deskPipRoute(city) {
  if (city.id === MELBOURNE_ID) {
    return WORLD_TRADE_ROUTES.find((route) => (
      route.good === 'biotech' && route.from === MELBOURNE_ID
    )) ?? null;
  }
  return WORLD_TRADE_ROUTES.find((route) => route.from === city.id) ?? null;
}

function addFlag(city) {
  const pos = latLonToVector(city.map.lat, city.map.lon, GLOBE_RADIUS + 0.04);
  const group = new THREE.Group();
  group.name = `${city.mapName} desk`;
  group.position.copy(pos);
  group.quaternion.setFromUnitVectors(yUp, group.position.clone().normalize());
  group.userData.cityId = city.id;
  group.userData.baseScale = 1;
  group.scale.setScalar(1);
  addContactBlob(group, 1.15);
  globe.add(group);

  const marker = new THREE.Mesh(unitBox, materials.selected);
  marker.scale.set(0.04, 0.005, 0.04);
  marker.position.set(0, 0.003, 0);
  marker.visible = false;
  group.add(marker);

  const deskRoute = deskPipRoute(city);
  let goodPip = null;
  if (deskRoute) {
    goodPip = addGoodPip(group, deskRoute);
  }

  const hit = new THREE.Mesh(unitBox, materials.hit);
  hit.scale.set(0.11, 0.11, 0.11);
  hit.position.set(0, 0.04, 0);
  hit.name = `${city.mapName} pick target`;
  group.add(hit);

  const labelAnchor = new THREE.Object3D();
  labelAnchor.position.set(0, 0.08, 0);
  group.add(labelAnchor);
  group.userData.labelAnchor = labelAnchor;
  group.userData.selectionMarker = marker;
  group.userData.clothBars = [];
  group.userData.wax = { visible: false };
  group.userData.goodPip = goodPip;
  group.userData.sourceHook = null;
  group.userData.homeHooks = [];
  group.userData.role = marketRole(city.id);
  group.traverse((child) => {
    child.userData.cityId = city.id;
  });
  flagGroups.push(group);
}

function paintFlagRoles() {
  for (const flag of flagGroups) {
    const role = marketRole(flag.userData.cityId);
    const material = materialForMarketRole(role);
    flag.userData.role = role;
    flag.userData.wax.visible = role === 'locked';
    const pip = flag.userData.goodPip;
    if (pip) {
      const status = world.routes?.[pip.userData.routeId]?.status ?? 'closed';
      const lit = status === 'open';
      setCargoLit(pip, lit);
      pip.userData.hold.visible = status === 'embargoed' || status === 'held';
    }
    const label = labelByCity.get(flag.userData.cityId);
    if (label) {
      label.dataset.role = role;
      const city = cityById.get(flag.userData.cityId);
      if (city.id === MELBOURNE_ID) {
        const caption = city.mapName.toUpperCase() + farmMarkerSuffix(liveFarmMarkers());
        const name = label.querySelector('.province-city-name');
        if (name) name.textContent = caption;
        else label.textContent = caption;
      } else {
        label.textContent = city.mapName.toUpperCase();
      }
      label.setAttribute(
        'aria-label',
        `${city.name}, ${role === 'home' ? 'your city' : role === 'openable' ? 'line available' : role === 'working' ? 'working line' : 'sealed market'}`,
      );
    }
  }
}

const melbourneMap = cityById.get(MELBOURNE_ID).map;
const melbourneVec = latLonToVector(melbourneMap.lat, melbourneMap.lon, 1);
const drag = {
  active: false,
  moved: false,
  x: 0,
  y: 0,
  rotY: Math.atan2(-melbourneVec.x, melbourneVec.z),
  rotX: 0,
  spin: 0,
};
globe.rotation.order = 'YXZ';
globe.rotation.y = drag.rotY;
globe.rotation.x = drag.rotX;

function frameMapPoint(map, centreLatitude = true) {
  const mapVector = latLonToVector(map.lat, map.lon, 1);
  drag.rotY = Math.atan2(-mapVector.x, mapVector.z);
  drag.rotX = 0;
  if (centreLatitude) {
    const width = Math.max(1, landElement.clientWidth);
    const height = Math.max(1, landElement.clientHeight);
    const safe = unobscuredMapRect(width, height);
    const point = latLonToVector(map.lat, map.lon, GLOBE_RADIUS + 0.036);
    const vector = new THREE.Vector3();
    const rotation = new THREE.Euler(0, 0, 0, 'YXZ');
    camera.updateMatrixWorld();
    const frame = solveMapFrame(point, (rotX, rotY) => {
      vector.set(point.x, point.y, point.z);
      rotation.set(rotX, rotY, 0, 'YXZ');
      vector.applyEuler(rotation).add(globe.position).project(camera);
      return (-vector.y * 0.5 + 0.5) * height;
    }, (safe.top + safe.bottom) / 2);
    drag.rotX = frame.rotX;
    drag.rotY = frame.rotY;
  }
  drag.spin = 0;
  globe.rotation.y = drag.rotY;
  globe.rotation.x = drag.rotX;
}

function frameCity(city) {
  frameMapPoint(city.map);
}

let selectedId = MELBOURNE_ID;
let hoveredCityId = null;
let selectedIndex = Math.max(0, GLOBE_CITIES.findIndex((city) => city.id === selectedId));
let pressure = melbournePressure(world);

function readCityWeatherSnapshot() {
  try {
    const raw = worldStoreGet(LAST_RUN_KEY);
    if (!raw) return null;
    const envelope = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const state = envelope?.canonicalState
      ? JSON.parse(envelope.canonicalState)
      : envelope;
    const weather = state?.weather;
    if (!weather || typeof weather !== 'object') return null;
    return {
      season: weather.season ?? null,
      state: weather.state ?? 'clear',
      floodArmed: weather.floodArmed === true,
    };
  } catch {
    return null;
  }
}

function weatherChipText(weather) {
  // A fresh boot has no stored run yet — Q1 is autumn on the season
  // wheel, so the chip never shows a bare dash.
  const season = String(weather?.season ?? '').toUpperCase() || 'AUTUMN';
  let sky = 'CLEAR';
  if (weather?.floodArmed) sky = 'FLOOD';
  else if (weather?.state === 'heavy-rain') sky = 'HEAVY RAIN';
  else if (weather?.state === 'rain') sky = 'RAIN';
  else if (weather?.state === 'hot-dry') sky = 'HOT DRY';
  return `${season} · ${sky}`;
}

function paintMelbourneWeatherChip() {
  const label = labelByCity.get(MELBOURNE_ID);
  if (!label) return;
  let chip = label.querySelector('.province-weather-chip');
  if (!chip) {
    const name = document.createElement('span');
    name.className = 'province-city-name';
    name.textContent = (cityById.get(MELBOURNE_ID)?.mapName?.toUpperCase() ?? 'MELBOURNE') + farmMarkerSuffix(liveFarmMarkers());
    chip = document.createElement('small');
    chip.className = 'province-weather-chip';
    label.replaceChildren(name, chip);
  }
  chip.textContent = weatherChipText(readCityWeatherSnapshot());
}

function paintGoodsStrip() {
  if (!goodsElement) return;
  for (const { good, field } of FOOTER_PRESSURE_GOODS) {
    const element = goodsElement.querySelector(`[data-good="${good}"]`);
    if (!element) continue;
    const value = Number(pressure[field] ?? 0);
    const short = value < 40;
    element.dataset.status = short ? 'short' : 'working';
    const node = element.querySelector('.province-good-value');
    if (node) node.textContent = String(value);
    element.title = pressureChipTitle(good, value);
  }
}

function paintHud() {
  const city = cityById.get(selectedId);
  let dossier = dossierHtml(city, world.cities[city.id]);
  if (selectedRouteId) dossier = routeDossierHtml(selectedRouteId);
  if (selectedForce) dossier = forceDossierHtml(selectedForce.kind, selectedForce.index);
  if (selectedAmbition) dossier = ambitionRailHtml(world, selectedAmbition);
  if (selectedWorktreeGood && selectedWorktreeGood !== 'cybercabs') {
    dossier = worktreePanelHtml(selectedWorktreeGood, {
      world,
      deskCityId: selectedDeskCityId ?? deskCityForGood(selectedWorktreeGood),
    });
  }
  if (selectedWorktreeGood === 'cybercabs') dossier = cybercabBookHtml(cybercabBook);
  const selectionKey = JSON.stringify([selectedId, selectedWorktreeGood, selectedDeskCityId,
    selectedRouteId, selectedForce, selectedAmbition]);
  const bookChoice = dossierElement.dataset.selectionKey === selectionKey
    ? dossierElement.querySelector('[data-v4-book-choice]')?.value ?? null : null;
  const preferredBook = WORLD_TRADE_ROUTES.find((route) => route.good === selectedWorktreeGood
    && (route.from === selectedDeskCityId || route.to === selectedDeskCityId))?.id ?? null;
  dossierElement.innerHTML = `<span class="chrome-rivets" aria-hidden="true"></span>${dossier}`;
  dossierElement.dataset.selectionKey = selectionKey;
  if (!phoneDossierClosed(dossierElement.dataset.phoneClosed, selectionKey)) delete dossierElement.dataset.phoneClosed;
  arrangeDossier(dossierElement, { bookChoice, preferredBook,
    onClose: () => { dossierElement.dataset.phoneClosed = selectionKey; canvas.focus({ preventScroll: true }); },
    onRecenter: () => frameCity(cityById.get(selectedId)), onBookChoice(routeId) {
    const route = WORLD_TRADE_ROUTES.find((candidate) => candidate.id === routeId);
    if (route) {
      selectCity(route.from === MELBOURNE_ID ? route.to : route.from, false, route.good);
      dossierElement.querySelector('[data-v4-book-choice]')?.focus({ preventScroll: true });
    }
  } });
  const portPicker = document.querySelector('[data-port-picker]');
  if (portPicker) portPicker.value = selectedId;
  const progress = victoryProgress(world);
  const office = treasuryElement?.querySelector('[data-tape="office"] b');
  const listed = treasuryElement?.querySelector('[data-tape="listed"] b');
  if (office) office.textContent = moneyTape(world.treasuryCash ?? WORLD_TREASURY_START);
  if (listed) listed.textContent = moneyTape(progress.financial.have);
  const cardOpen = Boolean(
    selectedWorktreeGood || selectedAmbition || selectedRouteId || selectedForce,
  );
  const advice = footerElement?.querySelector('[data-ribbon="advice"]');
  if (advice) {
    const threatClause = liveThreatAdvice(world);
    const clause = threatClause
      || String(pressure.register ?? '').split(/(?<=[.!?])\s+/)[0]
      || '';
    advice.hidden = cardOpen || !clause;
    advice.classList.toggle('threat-live', Boolean(threatClause));
    if (!advice.hidden) advice.textContent = clause.replace(/[.!?]$/, '');
  }
  paintYard();
  paintGoodsStrip();
  paintFlagRoles();
  paintMelbourneWeatherChip();
  let selectionLabel = `${city.mapName} selected. Drag to spin. Click a cargo to read its supplier card.`;
  if (selectedRouteId) {
    selectionLabel = `${BOOK_NAME[selectedRouteId] ?? 'Supply'} supply line selected. Drag to spin.`;
  }
  if (selectedForce) {
    selectionLabel = `${forceTokenName(selectedForce.kind, selectedForce.index)} selected. Drag to spin.`;
  }
  canvas.setAttribute(
    'aria-label',
    `Voxel world globe. ${selectionLabel}`,
  );
}

function selectCity(cityId, focusLabel = false, preferredGood = null) {
  const city = cityById.get(cityId);
  const globeIndex = GLOBE_CITIES.findIndex((candidate) => candidate.id === cityId);
  if (!city || globeIndex < 0) return;
  delete dossierElement.dataset.phoneClosed;
  selectedForce = null;
  selectedRouteId = null;
  selectedAmbition = null;
  selectedWorktreeGood = null;
  selectedDeskCityId = null;
  railArmed = null;
  selectedId = city.id;
  if (city.id !== MELBOURNE_ID) {
    const primary = preferredGood ?? (city.id === CYBERCAB_PORT && cybercabBook.opened
      ? 'cybercabs' : primaryGoodForDesk(city.id));
    if (primary) {
      selectedWorktreeGood = primary;
      selectedDeskCityId = city.id;
      railArmed = { kind: 'good', id: primary };
    }
  }
  selectedIndex = globeIndex;
  frameCity(city);
  flagGroups.forEach((flag) => {
    const selected = flag.userData.cityId === selectedId;
    flag.userData.selectionMarker.visible = selected;
    flag.scale.setScalar(selected ? flag.userData.baseScale * 1.22 : flag.userData.baseScale);
  });
  labelByCity.forEach((label, id) => {
    label.setAttribute('aria-current', id === selectedId ? 'true' : 'false');
  });
  routeLabelById.forEach((label) => label.setAttribute('aria-current', 'false'));
  paintForceTokenSelection();
  paintHud();
  // The tall phone's sheet takes its height from the paint, so frame the port above it again.
  if (isPhoneTall(document.documentElement)) frameCity(city);
  if (focusLabel) labelByCity.get(city.id)?.focus({ preventScroll: true });
}

function selectForce(kind, index) {
  const token = forceTokenGroup.children.find(
    (candidate) => candidate.userData.forceKind === kind
      && candidate.userData.forceIndex === index,
  );
  if (!token) return;
  delete dossierElement.dataset.phoneClosed;
  selectedForce = { kind, index };
  selectedRouteId = null;
  selectedAmbition = null;
  selectedWorktreeGood = null;
  selectedDeskCityId = null;
  labelByCity.forEach((label) => label.setAttribute('aria-current', 'false'));
  routeLabelById.forEach((label) => label.setAttribute('aria-current', 'false'));
  flagGroups.forEach((flag) => {
    flag.userData.selectionMarker.visible = false;
    flag.scale.setScalar(flag.userData.baseScale);
  });
  paintForceTokenSelection();
  paintHud();
}

function selectRoute(routeId) {
  if (routeId === CYBERCAB_LANE) { selectCity(CYBERCAB_PORT); return; }
  const route = WORLD_TRADE_ROUTES.find((candidate) => candidate.id === routeId);
  if (!route) return;
  delete dossierElement.dataset.phoneClosed;
  const source = cityById.get(route.from);
  selectedForce = null;
  selectedRouteId = route.id;
  selectedAmbition = null;
  selectedWorktreeGood = null;
  selectedDeskCityId = null;
  if (source) {
    selectedId = source.id;
    selectedIndex = Math.max(0, GLOBE_CITIES.findIndex((city) => city.id === source.id));
    frameCity(source);
  }
  labelByCity.forEach((label) => label.setAttribute('aria-current', 'false'));
  routeLabelById.forEach((label, id) => {
    label.setAttribute('aria-current', id === route.id ? 'true' : 'false');
  });
  flagGroups.forEach((flag) => {
    flag.userData.selectionMarker.visible = false;
    flag.scale.setScalar(flag.userData.baseScale);
  });
  paintForceTokenSelection();
  paintHud();
  if (source && isPhoneTall(document.documentElement)) frameCity(source);
}

function createCityLabels() {
  labelsElement.replaceChildren();
  labelByCity.clear();
  leaderByCity.clear();
  for (const city of GLOBE_CITIES) {
    const record = world.cities[city.id];
    const role = marketRole(city.id);
    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'province-city-label';
    label.id = `province-label-${city.id}`;
    label.dataset.city = city.id;
    label.dataset.status = record.status;
    label.dataset.role = role;
    label.textContent = city.mapName.toUpperCase();
    const farms = city.id === MELBOURNE_ID ? liveFarmMarkers() : [];
    if (farms.length) {
      label.textContent += farmMarkerSuffix(farms);
      label.dataset.farmMarkers = farms.map((farm) => farm.id).join(',');
      label.title = farms.map((farm) => `${farm.label}: ${farm.route}`).join('\n');
    }
    label.setAttribute(
      'aria-label',
      `${city.name}, ${role === 'home' ? 'your city' : role === 'openable' ? 'line available' : role === 'working' ? 'working line' : 'sealed market'}`,
    );
    label.addEventListener('click', () => selectCity(city.id));
    label.addEventListener('focus', () => selectCity(city.id));
    labelsElement.append(label);
    labelByCity.set(city.id, label);
    // MC3 F8 — a label the collision pass has moved off its anchor keeps a
    // leader back to it, so the mark it names is never in doubt.
    const leader = document.createElement('span');
    leader.className = 'province-city-leader';
    leader.setAttribute('aria-hidden', 'true');
    leader.style.visibility = 'hidden';
    labelsElement.append(leader);
    leaderByCity.set(city.id, leader);
  }
  if (!document.querySelector('[data-port-picker]')) {
    const pickerLabel = document.createElement('label');
    pickerLabel.className = 'v4-port-picker';
    pickerLabel.textContent = 'Find a port';
    const picker = document.createElement('select');
    picker.dataset.portPicker = '1';
    picker.setAttribute('aria-label', 'Find a world port');
    for (const city of [...GLOBE_CITIES].sort((a, b) => a.mapName.localeCompare(b.mapName))) {
      const option = document.createElement('option');
      option.value = city.id;
      option.textContent = city.mapName;
      picker.append(option);
    }
    picker.value = selectedId;
    picker.addEventListener('change', () => selectCity(picker.value));
    pickerLabel.append(picker);
    document.querySelector('.province-mast').append(pickerLabel);
  }
}

function worldBootPhase(phase, message) {
  window.dispatchEvent(new CustomEvent('district-deck:world-phase', { detail: { phase, message } }));
}

let globeDesksReady = false;
let globePresented = false;
async function bootGlobeDesks() {
  try {
    await loadCargoGlbs();
  } catch (error) {
    console.warn('World cargo GLBs failed; desks fall back to boxes.', error);
  }
  GLOBE_CITIES.forEach(addFlag);
  rebuildRoutes();
  rebuildForceTokens();
  createCityLabels();
  selectCity(MELBOURNE_ID);
  globeDesksReady = true;
}
bootGlobeDesks().catch((error) => {
  console.error('World port setup failed.', error);
  worldBootPhase('failed');
});

function applyForceOrder(button) {
  const kind = button.dataset.force;
  const index = Number(button.dataset.index);
  if (kind !== 'navy' || !Number.isInteger(index)) return;
  let frameSite = cityById.get(MELBOURNE_ID)?.map ?? null;
  let centreFrame = false;
  const withoutTicket = (world.requests ?? []).filter((request) => !(
    request?.kind === 'escort' && request.index === index
  ));
  if (button.dataset.order === 'escort') {
    const route = WORLD_TRADE_ROUTES.find((candidate) => candidate.id === button.dataset.book);
    const seaBook = route ? isSeaCargo(route.id) : false;
    if (!seaBook || world.routes?.[route.id]?.status !== 'open') {
      yardNotice = 'No working sea line is ready for escort.';
      paintHud();
      return;
    }
    world = {
      ...world,
      requests: [...withoutTicket, { kind: 'escort', index, book: route.id }],
    };
    frameSite = bookMidpoint(route);
    centreFrame = true;
    yardNotice = `${BOOK_NAME[route.id] ?? route.good} line escorted. The cutter is on the ink.`;
  } else if (button.dataset.order === 'hold') {
    world = { ...world, requests: withoutTicket };
    yardNotice = 'Cutter held in Bass Strait.';
  } else {
    return;
  }
  worldStoreSet(WORLD_RUN_KEY, serialiseWorld(world));
  rebuildForceTokens();
  if (frameSite) frameMapPoint(frameSite, centreFrame);
  paintHud();
}

function openAmbitionRail(spec) {
  delete dossierElement.dataset.phoneClosed;
  selectedAmbition = spec;
  selectedForce = null;
  selectedRouteId = null;
  selectedWorktreeGood = null;
  selectedDeskCityId = null;
  railArmed = { kind: 'key', id: ambitionArmedKey(spec) };
  paintHud();
}

function closeAmbitionRail() {
  selectedAmbition = null;
  if (railArmed?.kind === 'key') railArmed = null;
  paintHud();
}

function frameDeskForGood(good) {
  const deskId = deskCityForGood(good) ?? makeOnlyDeskId(good);
  if (!deskId) return;
  const city = cityById.get(deskId);
  const globeIndex = GLOBE_CITIES.findIndex((candidate) => candidate.id === deskId);
  if (!city || globeIndex < 0) return;
  selectedId = city.id;
  selectedIndex = globeIndex;
  selectedDeskCityId = deskId;
  // Rail-taps centre the desk fully — longitude AND latitude — so the
  // location lands mid-globe rather than riding high (critic V5.0 item 2).
  frameMapPoint(city.map, true);
  flagGroups.forEach((flag) => {
    const selected = flag.userData.cityId === selectedId;
    flag.userData.selectionMarker.visible = selected;
    flag.scale.setScalar(selected ? flag.userData.baseScale * 1.22 : flag.userData.baseScale);
  });
  labelByCity.forEach((label, id) => {
    label.setAttribute('aria-current', id === selectedId ? 'true' : 'false');
  });
}

function openWorktree(good) {
  delete dossierElement.dataset.phoneClosed;
  selectedWorktreeGood = good;
  selectedDeskCityId = deskCityForGood(good) ?? makeOnlyDeskId(good);
  selectedAmbition = null;
  selectedForce = null;
  selectedRouteId = null;
  expandedAmbitionCategory = null;
  railArmed = { kind: 'good', id: good };
  frameDeskForGood(good);
  paintHud();
  if (isPhoneTall(document.documentElement)) frameDeskForGood(good);
}

function closeWorktree() {
  selectedWorktreeGood = null;
  selectedDeskCityId = null;
  if (railArmed?.kind === 'good') railArmed = null;
  paintHud();
}

function applyAmbitionSpec(spec) {
  if (spec.type === 'raise-force') return raiseAndStoreForce(world, spec.kind);
  if (spec.type === 'mars-part') return buildAndStoreMarsPart(world, spec.part);
  if (spec.type === 'train-missionary') return trainAndStoreMissionary(world);
  if (spec.type === 'send-mission') return sendAndStoreMission(world, spec.city);
  if (spec.type === 'commission-officer') return commissionAndStoreOfficer(world);
  if (spec.type === 'station-base') return stationAndStoreBase(world, spec.choke);
  if (spec.type === 'open-mars-desk') return openAndStoreMars(world);
  if (spec.type === 'train-biomind') return startAndStoreBiomind(world);
  if (spec.type === 'feed-biomind') return feedAndStoreBiomind(world, spec.good ?? null);
  if (spec.type === 'ship-build-kit') return shipAndStoreBuildKit(world, spec.institution);
  if (spec.type === 'found-doctrine') return foundAndStoreCreed(world, spec.creed);
  return null;
}

function ambitionNotice(spec, result) {
  if (spec.type === 'raise-force') {
    const recipe = WORLD_FORCE_RECIPES[spec.kind];
    return `${recipe.label} raised. ${money(result.fee)} spent; ${world.forces[spec.kind]} marked near Melbourne.`;
  }
  if (spec.type === 'train-missionary') return 'Missionary trained.';
  if (spec.type === 'send-mission') return result.reason;
  if (spec.type === 'commission-officer') return 'Officer commissioned.';
  if (spec.type === 'station-base') return result.reason;
  if (spec.type === 'open-mars-desk') return 'Mars is open. Stack the five parts.';
  if (spec.type === 'train-biomind') return 'Biomind training started.';
  if (spec.type === 'feed-biomind') return 'Fed Yard crates into biomind training.';
  if (spec.type === 'ship-build-kit') {
    const kit = WORLD_BUILD_KITS[spec.institution];
    return `Shipped the ${kit?.label ?? spec.institution} kit. Place it in the city.`;
  }
  if (spec.type === 'found-doctrine') return 'Doctrine founded. Open lines spread it each beat.';
  return 'Mars part stacked.';
}

function onDossierClick(event) {
  if (event.target.closest?.('[data-cybercab-buy]')) {
    if (!cybercabBookModel(liveCybercabCity()).canBuy) { syncCybercabBook(); return; }
    window.parent.__districtDeck.dispatch({ type: 'IMPORT_CAB' });
    syncCybercabBook();
    dossierElement.querySelector('[data-cybercab-buy]')?.focus({ preventScroll: true });
    return;
  }
  if (event.target.closest?.('[data-cybercab-machinery]')) {
    selectedWorktreeGood = primaryGoodForDesk(CYBERCAB_PORT);
    paintHud();
    return;
  }
  const back = event.target.closest?.('[data-ambition-back]');
  if (back) {
    closeAmbitionRail();
    return;
  }
  const commit = event.target.closest?.('[data-ambition-commit]');
  if (commit) {
    if (commit.disabled) return;
    const spec = {
      type: commit.dataset.ambitionCommit,
      kind: commit.dataset.force,
      part: commit.dataset.part,
      city: commit.dataset.city,
      choke: commit.dataset.choke,
      creed: commit.dataset.creed,
      institution: commit.dataset.institution,
    };
    const result = applyAmbitionSpec(spec);
    if (!result) return;
    if (!result.ok) {
      yardNotice = result.reason;
      const inspected = inspectWorldRun(worldStoreGet(WORLD_RUN_KEY));
      if (inspected.status === 'valid') {
        world = inspected.world;
        pressure = melbournePressure(world);
        rebuildForceTokens();
      }
      paintHud();
      return;
    }
    world = result.world;
    pressure = melbournePressure(world);
    yardNotice = ambitionNotice(spec, result);
    rebuildForceTokens();
    paintHud();
    return;
  }
  const needSource = event.target.closest?.('.province-need-source[data-route]');
  if (needSource) {
    const route = WORLD_TRADE_ROUTES.find(
      (candidate) => candidate.id === needSource.dataset.route,
    );
    if (route) selectRoute(route.id);
    return;
  }
  const forceOrder = event.target.closest?.('.province-force-order-button');
  if (forceOrder && !forceOrder.disabled) {
    applyForceOrder(forceOrder);
    return;
  }
  const frameBook = event.target.closest?.('.province-frame-book');
  if (frameBook) {
    const route = WORLD_TRADE_ROUTES.find(
      (candidate) => candidate.id === frameBook.dataset.route,
    );
    if (route) selectRoute(route.id);
    return;
  }
  const inboundBook = event.target.closest?.(
    '.province-working-book, .province-shut-book',
  );
  if (inboundBook) {
    const route = WORLD_TRADE_ROUTES.find(
      (candidate) => candidate.id === inboundBook.dataset.route,
    );
    if (route) selectRoute(route.id);
    return;
  }
  const makeToggle = event.target.closest?.('.province-make-toggle');
  if (makeToggle) {
    toggleMineMake(makeToggle.dataset.desk);
    return;
  }
  const button = event.target.closest?.('.province-open-book');
  if (!button || button.disabled) return;
  const routeId = button.dataset.route;
  const check = canOpenTradeRoute(world, routeId);
  if (!check.ok) {
    paintHud();
    return;
  }
  const result = openAndStoreTrade(world, routeId);
  if (!result.ok) {
    paintHud();
    return;
  }
  world = result.world;
  if (!selectedWorktreeGood) selectedRouteId = routeId;
  pressure = melbournePressure(world);
  yardNotice = lineOpenedNotice(BOOK_NAME[routeId] ?? 'Supply');
  rebuildRoutes();
  rebuildForceTokens();
  paintHud();
}

dossierElement.addEventListener('click', onDossierClick);

function onYardClick(event) {
  if (yardTapOpensPanel(event.target)) collapseYardDrawer(yardElement, document.documentElement);
  const worktree = event.target.closest?.('[data-worktree]');
  if (worktree) {
    openWorktree(worktree.dataset.worktree);
    return;
  }
  const category = event.target.closest?.('[data-ambition-category]');
  if (category) {
    const id = category.dataset.ambitionCategory;
    expandedAmbitionCategory = expandedAmbitionCategory === id ? null : id;
    selectedWorktreeGood = null;
    selectedDeskCityId = null;
    selectedAmbition = null;
    railArmed = expandedAmbitionCategory ? { kind: 'win', id } : null;
    paintHud();
    return;
  }
  const rowMain = event.target.closest?.('.province-yard-row-main');
  if (rowMain) {
    const route = WORLD_TRADE_ROUTES.find(
      (candidate) => candidate.id === rowMain.dataset.route,
    );
    if (route) selectRoute(route.id);
    else if (rowMain.dataset.good) openWorktree(rowMain.dataset.good);
    return;
  }
  const ambitionButton = event.target.closest?.('.province-ambition');
  if (ambitionButton) {
    const kind = ambitionButton.dataset.ambition;
    if (kind === 'mars' || kind === 'agi' || kind === 'biomind') {
      openAmbitionRail({ type: kind === 'mars' ? 'open-mars-desk' : 'train-biomind' });
      return;
    }
    if (kind === 'creed') {
      openAmbitionRail({ type: 'found-doctrine', creed: ambitionButton.dataset.creed });
      return;
    }
    if (kind === 'mars-part' || kind === 'train-missionary' || kind === 'send-mission'
      || kind === 'commission-officer' || kind === 'station-base') {
      openAmbitionRail({
        type: kind,
        part: ambitionButton.dataset.part,
        city: ambitionButton.dataset.city,
        choke: ambitionButton.dataset.choke,
      });
      return;
    }
    if (kind === 'ship-kit') {
      openAmbitionRail({
        type: 'ship-build-kit',
        institution: ambitionButton.dataset.institution,
      });
      return;
    }
    return;
  }
  const button = event.target.closest?.('.province-raise-force');
  if (!button) return;
  openAmbitionRail({ type: 'raise-force', kind: button.dataset.force });
}

yardElement.addEventListener('click', onYardClick);

function toggleMineMake(deskId) {
  if (!isMineMakeDesk(deskId)) return;
  const on = world.ambition?.mineMake?.[deskId] === true;
  const result = setMineMakeAndStore(world, deskId, !on);
  if (!result.ok) return;
  world = result.world;
  yardNotice = civ3MakeToggle(!on);
  paintHud();
}

function dismissWorldPanel() {
  // A panel shut with Close on a phone is already out of view, so Escape goes on to the city.
  if (phonePanelHidden(dossierElement, document.documentElement)) return false;
  if (selectedAmbition) { closeAmbitionRail(); return true; }
  if (selectedWorktreeGood) { closeWorktree(); return true; }
  if (expandedAmbitionCategory) {
    expandedAmbitionCategory = null;
    paintHud();
    return true;
  }
  return false;
}

function onDocumentKey(event) {
  if (event.defaultPrevented) return;
  if (event.key === 'm' || event.key === 'M') {
    if (selectedAmbition || selectedRouteId || selectedForce || selectedWorktreeGood) return;
    if (!isMineMakeDesk(selectedId)) return;
    event.preventDefault();
    toggleMineMake(selectedId);
    return;
  }
  if (event.key === 'Escape' && dismissWorldPanel()) event.preventDefault();
}

window.addEventListener('keydown', onDocumentKey);

function moveKeyboardSelection(event) {
  let nextIndex = selectedIndex;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex -= 1;
  else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex += 1;
  else if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = GLOBE_CITIES.length - 1;
  else return;
  event.preventDefault();
  nextIndex = (nextIndex + GLOBE_CITIES.length) % GLOBE_CITIES.length;
  selectCity(GLOBE_CITIES[nextIndex].id, true);
}

const raycaster = new THREE.Raycaster();
// Lines use world units; Three's default 1-unit tolerance would intercept
// clicks across most of the globe once paid routes are rendered.
raycaster.params.Line.threshold = 0.008;
const pointer = new THREE.Vector2();

function cityAtPointer(event) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  raycaster.setFromCamera(pointer, camera);
  const object = firstVisibleMarkerHit(raycaster.intersectObjects(flagGroups, true), 'cityId',
    globe.getWorldPosition(new THREE.Vector3()), camera.getWorldPosition(new THREE.Vector3()));
  return object?.userData.cityId ?? null;
}

function routeAtPointer(event) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  raycaster.setFromCamera(pointer, camera);
  const cameraNormal = camera.getWorldPosition(new THREE.Vector3()).normalize();
  const hit = raycaster.intersectObjects([...routeMeshes, ...cargoGroup.children], true).find(
    (candidate) => candidate.point.clone().normalize().dot(cameraNormal) > 0.15,
  );
  if (!hit) return null;
  let object = hit.object;
  while (object && !object.userData.routeId) object = object.parent;
  return object?.userData.routeId ?? null;
}

function forceAtPointer(event) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  raycaster.setFromCamera(pointer, camera);
  const object = firstVisibleMarkerHit(raycaster.intersectObjects(forceTokenGroup.children, true), 'forceKind',
    globe.getWorldPosition(new THREE.Vector3()), camera.getWorldPosition(new THREE.Vector3()));
  if (!object?.userData.forceKind) return null;
  return {
    kind: object.userData.forceKind,
    index: object.userData.forceIndex,
  };
}

function onPointerDown(event) {
  hoveredCityId = null;
  drag.active = true;
  drag.moved = false;
  drag.x = event.clientX;
  drag.y = event.clientY;
  drag.spin = 0;
  canvas.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event) {
  if (drag.active) {
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 3) drag.moved = true;
    drag.spin = dx * 0.005;
    drag.rotY += drag.spin;
    drag.rotX = Math.max(-Math.PI, Math.min(Math.PI, drag.rotX + (dy * 0.003)));
    drag.x = event.clientX;
    drag.y = event.clientY;
    globe.rotation.y = drag.rotY;
    globe.rotation.x = drag.rotX;
    return;
  }
  hoveredCityId = cityAtPointer(event);
  canvas.style.cursor = forceAtPointer(event) || routeAtPointer(event) || hoveredCityId
    ? 'pointer'
    : 'grab';
}

function onPointerUp(event) {
  if (drag.active && !drag.moved) {
    const force = forceAtPointer(event);
    if (force) selectForce(force.kind, force.index);
    else {
      const routeId = routeAtPointer(event);
      if (routeId) selectRoute(routeId);
      else {
        const cityId = cityAtPointer(event);
        if (cityId) selectCity(cityId);
      }
    }
  }
  drag.active = false;
  canvas.style.cursor = 'grab';
}

function onPointerLeave() {
  hoveredCityId = null;
  drag.active = false;
  canvas.style.cursor = 'grab';
}

canvas.style.cursor = 'grab';
canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointerleave', onPointerLeave);
canvas.addEventListener('keydown', moveKeyboardSelection);
labelsElement.addEventListener('keydown', moveKeyboardSelection);

function reflectStoredWorld({ playArrivals = true } = {}) {
  const inspected = inspectWorldRun(worldStoreGet(WORLD_RUN_KEY));
  if (inspected.status !== 'valid' || !inspected.world) return;
  if (inspected.world.worldSeed !== world.worldSeed) return;
  const next = inspected.world;
  const seen = readGlobeSeenBeat(next.worldSeed);
  const before = world.stocks;
  const beatChanged = next.beat !== world.beat;
  world = next;
  pressure = melbournePressure(world);
  if (playArrivals && beatChanged && seen !== next.beat) {
    yardNotice = renderYardArrivalNotice(before, world.stocks, {
      labels: CHIP_NAME,
      element: yardNoticeElement,
      world,
    });
  }
  writeGlobeSeenBeat(world.worldSeed, world.beat);
  rebuildRoutes();
  rebuildForceTokens();
  paintHud();
}

function onWorldStorage(event) {
  if (event.key === WORLD_RUN_KEY) reflectStoredWorld();
}

function onWorldVisibility() {
  if (document.visibilityState === 'visible') reflectStoredWorld();
}

window.addEventListener('storage', onWorldStorage);
document.addEventListener('visibilitychange', onWorldVisibility);

const projectedPosition = new THREE.Vector3();
const cameraWorld = new THREE.Vector3();
const labelGlobeCentre = new THREE.Vector3();
const labelView = new THREE.Vector3();
const LABEL_LIMB_SINE = Math.sin(12 * Math.PI / 180);

// Clone marker materials once: fading a port must not fade every shared token.
function fadePortMarker(flag, opacity) {
  if (!flag.userData.fadeMaterials) {
    const copies = new Map();
    flag.traverse((child) => {
      if (!child.material || child.material === materials.hit) return;
      const copy = (source) => {
        if (!copies.has(source)) {
          const material = source.clone();
          material.transparent = true;
          copies.set(source, { material, opacity: source.opacity });
        }
        return copies.get(source).material;
      };
      child.material = Array.isArray(child.material) ? child.material.map(copy) : copy(child.material);
    });
    flag.userData.fadeMaterials = [...copies.values()];
  }
  flag.visible = opacity > 0;
  for (const entry of flag.userData.fadeMaterials) entry.material.opacity = entry.opacity * opacity;
  flag.userData.labelOpacity = opacity;
}

/**
 * M5 F4 — the map rectangle no chrome sits on. `.province-yard` claims the left
 * band, `.province-dossier` the right, the footer the bottom. City labels, threat
 * chips and the combat framing all read the same rectangle.
 */
function unobscuredMapRect(width, height) {
  const right = dossierElement.offsetLeft > width * 0.5
    ? Math.min(width - 8, dossierElement.offsetLeft - 10)
    : width - 8;
  const collapsedYard = width <= 860 && yardElement.dataset.expanded !== '1';
  const left = !collapsedYard && yardElement.offsetWidth > 0 && yardElement.offsetLeft < width * 0.5
    ? Math.max(8, yardElement.offsetLeft + yardElement.offsetWidth + 10)
    : 8;
  const bottom = footerElement?.offsetTop > height * 0.5
    ? Math.min(height - 8, footerElement.offsetTop - 8)
    : height - 8;
  const top = 8;
  const mast = document.querySelector('.province-mast');
  return phoneMapRect({ left, right, top, bottom }, { phoneTall: isPhoneTall(document.documentElement), mastBottom: mast ? mast.offsetTop + mast.offsetHeight : 0, dossierTop: dossierElement.offsetParent ? dossierElement.offsetTop : null });
}

function updateProjectedLabels() {
  const width = landElement.clientWidth;
  const height = landElement.clientHeight;
  if (!width || !height) return;
  const focusedEscortBook = selectedForce?.kind === 'navy'
    ? escortTicket(selectedForce.index)?.book ?? null
    : null;
  const safe = unobscuredMapRect(width, height);
  const safeRight = safe.right;
  const safeLeft = safe.left;
  const safeBottom = safe.bottom;
  camera.getWorldPosition(cameraWorld);
  globe.getWorldPosition(labelGlobeCentre);
  labelView.copy(cameraWorld).sub(labelGlobeCentre).normalize();
  // MC3 F8 — every visible city label goes into one collision pass. M5 placed
  // each label on its own anchor and clamped it, and the northern books then
  // bunched into a single unreadable strip.
  const labelItems = [];
  const labelState = new Map();
  const labelBounds = {
    left: safeLeft, right: safeRight, top: 8, bottom: safeBottom,
  };
  for (const flag of flagGroups) {
    const cityId = flag.userData.cityId;
    const label = labelByCity.get(cityId);
    label.dataset.hovered = cityId === hoveredCityId ? 'true' : 'false';
    flag.userData.labelAnchor.getWorldPosition(projectedPosition);
    const radialDot = projectedPosition.clone().sub(labelGlobeCentre).normalize().dot(labelView);
    const limb = THREE.MathUtils.clamp(radialDot / LABEL_LIMB_SINE, 0, 1);
    const opacity = limb * limb * (3 - 2 * limb);
    const scale = 0.85 + 0.15 * Math.max(0, radialDot);
    fadePortMarker(flag, opacity);
    flag.userData.labelDepth = radialDot;
    label.dataset.depth = String(radialDot);
    label.style.opacity = String(opacity);
    label.style.zIndex = String(2 + Math.round(Math.max(0, radialDot) * 1000));
    projectedPosition.project(camera);
    const onScreen = projectedPosition.z > -1 && projectedPosition.z < 1
      && projectedPosition.x > -1.05 && projectedPosition.x < 1.05
      && projectedPosition.y > -1.05 && projectedPosition.y < 1.05;
    const visible = onScreen && radialDot > 0;
    const anchorX = ((projectedPosition.x * 0.5) + 0.5) * width;
    const anchorY = ((-projectedPosition.y * 0.5) + 0.5) * height;
    const w = label.offsetWidth * scale;
    const h = label.offsetHeight * scale;
    const x = anchorX;
    const y = anchorY - 3 - h / 2;
    labelState.set(cityId, { label, visible, anchorX, anchorY, w, h, scale, opacity });
    if (!visible) continue;
    labelItems.push({
      id: cityId,
      x,
      y,
      anchorX,
      anchorY,
      w,
      h,
      // Preserve the selected port's white card; other ports sort by depth.
      priority: cityId === MELBOURNE_ID ? 'home'
        : flag.userData.role === 'working' || flag.userData.role === 'openable'
          ? 'route-end'
          : 'rest',
      rank: cityId === selectedId ? -2 : -radialDot,
    });
  }
  /*
   * The ROUTE labels join the same pass. They were clamped and nothing else,
   * so a route name and a city name at the same latitude simply overlapped —
   * half of what the audit called "colliding labels" was this list against
   * that one. They rank behind every city because a port names a place and a
   * route label names a line that is already drawn on the globe.
   */
  const routeState = new Map();
  for (const routeGroup of routeMeshes) {
    const routeId = routeGroup.userData.routeId;
    const label = routeLabelById.get(routeId);
    const anchor = routeGroup.userData.labelAnchor;
    if (!label || !anchor) continue;
    anchor.getWorldPosition(projectedPosition);
    const radialDot = projectedPosition.clone().sub(labelGlobeCentre).normalize().dot(labelView);
    const limb = THREE.MathUtils.clamp(radialDot / LABEL_LIMB_SINE, 0, 1);
    const scale = 0.85 + 0.15 * Math.max(0, radialDot);
    label.dataset.depth = String(radialDot);
    label.style.opacity = String(limb * limb * (3 - 2 * limb));
    label.style.zIndex = String(2 + Math.round(Math.max(0, radialDot) * 1000));
    projectedPosition.project(camera);
    const onScreen = projectedPosition.z > -1 && projectedPosition.z < 1
      && projectedPosition.x > -1.05 && projectedPosition.x < 1.05
      && projectedPosition.y > -1.05 && projectedPosition.y < 1.05;
    const routeFocused = !focusedEscortBook || routeId === focusedEscortBook;
    const visible = onScreen && radialDot > 0 && routeFocused;
    const offset = routeGroup.userData.labelOffset ?? { x: 0, y: -12 };
    const x = ((projectedPosition.x * 0.5) + 0.5) * width + offset.x;
    const y = ((-projectedPosition.y * 0.5) + 0.5) * height + offset.y;
    routeState.set(routeId, { label, visible, scale });
    if (!visible) continue;
    labelItems.push({
      id: `route:${routeId}`,
      x,
      y,
      w: label.offsetWidth * scale,
      h: label.offsetHeight * scale,
      rank: -radialDot,
      priority: 'rest',
    });
  }
  // Threat chips still reserve the home card before the anchored depth pass.
  const homeItems = labelItems.filter((item) => item.priority === 'home');
  const homePlaced = staggerLabels(homeItems, labelBounds, {
    dropOnCollision: true,
    maxSteps: 0,
    gap: 6,
  });
  const homeRects = placedLabelRects(homePlaced, homeItems);
  // A collapsed compact Yard frees the map beneath it. Reserve the actual
  // short HUD rectangles instead of excluding the entire left side of Earth.
  const hudRects = width <= 860 && yardElement.dataset.expanded !== '1'
    ? [document.querySelector('.province-mast'), yardElement].map((element, index) => {
      const rect = element.getBoundingClientRect();
      return { id: `hud:${index}`, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, w: rect.width, h: rect.height };
    }) : [];
  const chipRects = threatLayer.projectChips(
    camera, width, height, projectedPosition, cameraWorld,
    { left: safeLeft, right: safeRight, top: 8, bottom: safeBottom },
    { reserved: [...homeRects, ...hudRects] },
  ) ?? [];
  // Ordinary cards keep their anchored admission. An exposed selected port can
  // use the existing bounded search and leader when its initial card crosses an
  // edge; final bounds and HUD/collision checks still belong to the solver.
  const anchoredItems = anchoredPortLabels(labelItems, labelBounds, { selectedId, hudRects });
  const tiers = portLabelTiers(anchoredItems, { selectedId, hoveredId: hoveredCityId });
  const staggered = placePriorityLabels(tiers, labelBounds, {
    reserved: [...chipRects, ...hudRects], dropOnCollision: true, maxSteps: 4, step: 14, maxDisplacement: 64, gap: 6,
  });
  const placedById = new Map(staggered.map((row) => [row.id, row]));
  lastLabelPlacement = { items: labelItems, placed: staggered, reserved: [...chipRects, ...hudRects], hudRects };
  for (const [cityId, state] of labelState) {
    const { label } = state;
    const leader = leaderByCity.get(cityId);
    if (leader) leader.dataset.selected = cityId === selectedId ? 'true' : 'false';
    const placed = placedById.get(cityId);
    if (!state.visible || !placed || placed.hidden) {
      label.style.visibility = 'hidden';
      if (leader) leader.style.visibility = 'hidden';
      continue;
    }
    label.style.left = `${placed.x}px`;
    label.style.top = `${placed.y}px`;
    label.style.visibility = 'visible';
    label.style.transform = `translate(-50%, -50%) scale(${state.scale})`;
    if (!leader) continue;
    leader.style.left = `${state.anchorX}px`;
    leader.style.top = `${state.anchorY}px`;
    const dx = placed.x - state.anchorX;
    const dy = placed.y + state.h / 2 - state.anchorY;
    leader.style.width = `${Math.max(3, Math.hypot(dx, dy))}px`;
    leader.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    leader.style.opacity = String(state.opacity);
    leader.style.visibility = 'visible';
  }
  for (const [routeId, state] of routeState) {
    const placed = placedById.get(`route:${routeId}`);
    if (!state.visible || !placed || placed.hidden) {
      state.label.style.visibility = 'hidden';
      continue;
    }
    state.label.style.left = `${placed.x}px`;
    state.label.style.top = `${placed.y}px`;
    state.label.style.visibility = 'visible';
    state.label.style.transform = `translate(-50%, -50%) scale(${state.scale})`;
  }
}

let motionReduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const disasterLayer = new WorldDisasterLayer(globe, {
  land,
  reducedMotion: motionReduced,
  materials,
});

const threatChipHost = document.createElement('div');
threatChipHost.id = 'province-threat-chips';
threatChipHost.className = 'threat-chips';
threatChipHost.setAttribute('aria-label', 'Threat ETA');
landElement.append(threatChipHost);
const threatLayer = new WorldThreatLayer(globe, {
  reducedMotion: motionReduced,
  chipHost: threatChipHost,
  cargoRunners,
  flagGroups,
});

const melbourneWeather = {
  group: new THREE.Group(),
  rain: null,
  ring: null,
  dummy: new THREE.Object3D(),
  count: 56,
};

(function setupMelbourneWeather() {
  const city = cityById.get(MELBOURNE_ID);
  if (!city) return;
  const point = latLonToVector(city.map.lat, city.map.lon, GLOBE_RADIUS + 0.03);
  melbourneWeather.group.name = 'melbourne-weather';
  melbourneWeather.group.position.copy(point);
  melbourneWeather.group.quaternion.setFromUnitVectors(
    yUp,
    melbourneWeather.group.position.clone().normalize(),
  );
  globe.add(melbourneWeather.group);
  const rainMat = new THREE.MeshBasicMaterial({
    color: 0xb7d4e6, transparent: true, opacity: 0.62, depthWrite: false,
  });
  melbourneWeather.rain = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.003, 0.035, 0.003),
    rainMat,
    melbourneWeather.count,
  );
  melbourneWeather.rain.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  melbourneWeather.group.add(melbourneWeather.rain);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x6a88a8, transparent: true, opacity: 0.42, depthWrite: false,
    emissive: 0x24364c, emissiveIntensity: 0.55, roughness: 0.45,
  });
  melbourneWeather.ring = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ringMat);
  melbourneWeather.ring.scale.set(0.18, 0.01, 0.18);
  melbourneWeather.ring.position.y = 0.01;
  melbourneWeather.group.add(melbourneWeather.ring);
}());

function tickMelbourneWeather(time) {
  const weather = readCityWeatherSnapshot();
  const raining = weather?.state === 'rain' || weather?.state === 'heavy-rain' || weather?.floodArmed;
  const storm = weather?.state === 'heavy-rain' || weather?.floodArmed;
  const hot = weather?.state === 'hot-dry';
  melbourneWeather.group.visible = Boolean(raining || storm || hot);
  if (melbourneWeather.rain) melbourneWeather.rain.visible = Boolean(raining);
  if (!melbourneWeather.ring) return;
  melbourneWeather.ring.visible = Boolean(storm || hot);
  if (hot && !storm) {
    melbourneWeather.ring.material.color.setHex(0xc4783a);
    melbourneWeather.ring.material.emissive.setHex(0x5a2a10);
    melbourneWeather.ring.scale.set(0.16, 0.008, 0.16);
    melbourneWeather.ring.material.opacity = 0.28;
  } else {
    melbourneWeather.ring.material.color.setHex(0x6a88a8);
    melbourneWeather.ring.material.emissive.setHex(0x24364c);
  }
  if (!raining || !melbourneWeather.rain) return;
  const t = motionReduced ? 0 : time * 0.001;
  for (let i = 0; i < melbourneWeather.count; i += 1) {
    const u = i / melbourneWeather.count;
    const radius = 0.04 + (u * 0.06);
    const angle = (i * 2.4) + t * 0.4;
    const fall = (t * (storm ? 0.55 : 0.32) + u) % 1;
    melbourneWeather.dummy.position.set(
      Math.cos(angle) * radius,
      0.08 - fall * 0.09,
      Math.sin(angle) * radius,
    );
    melbourneWeather.dummy.scale.set(1, storm ? 1.35 : 1, 1);
    melbourneWeather.dummy.updateMatrix();
    melbourneWeather.rain.setMatrixAt(i, melbourneWeather.dummy.matrix);
  }
  melbourneWeather.rain.instanceMatrix.needsUpdate = true;
  if (storm) {
    const pulse = motionReduced ? 1 : 1 + Math.sin(t * 2.2) * 0.08;
    melbourneWeather.ring.scale.set(0.18 * pulse, 0.01, 0.18 * pulse);
    melbourneWeather.ring.material.opacity = 0.32 + (motionReduced ? 0 : Math.sin(t * 3) * 0.1);
  }
}
const motionQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
if (motionQuery?.addEventListener) {
  motionQuery.addEventListener('change', (event) => {
    motionReduced = event.matches;
    disasterLayer.setReducedMotion(motionReduced);
    threatLayer.setReducedMotion(motionReduced);
  });
}

function resizeRenderer() {
  const width = Math.max(1, landElement.clientWidth);
  const height = Math.max(1, landElement.clientHeight);
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.5));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

const resizeObserver = globalThis.ResizeObserver
  ? new ResizeObserver(resizeRenderer)
  : null;
resizeObserver?.observe(landElement);
window.addEventListener('resize', resizeRenderer);
resizeRenderer();
frameCity(cityById.get(MELBOURNE_ID));

const stats = Object.freeze({
  grid: `${raster.columns}x${raster.rows}`,
  occupiedLandCells: raster.occupied,
  landInstances: raster.voxels.length,
  landInstanceBudget: GLOBE_LAND_LIMIT,
  cityFlags: flagGroups.length,
  tradeRoutes: WORLD_TRADE_ROUTES.length,
  get renderedTradeRoutes() { return routeMeshes.length; },
  get forceTokens() { return forceTokenGroup.children.length; },
  get forceTokenPositions() {
    scene.updateMatrixWorld(true);
    const width = landElement.clientWidth;
    const height = landElement.clientHeight;
    return forceTokenGroup.children.map((root) => {
      const token = root.children[0] ?? root;
      const pickTarget = token.children.find((child) => child.material === materials.hit) ?? token;
      const projected = pickTarget
        .getWorldPosition(new THREE.Vector3())
        .project(camera);
      return {
        kind: root.userData.forceKind,
        index: root.userData.forceIndex,
        x: ((projected.x * 0.5) + 0.5) * width,
        y: ((-projected.y * 0.5) + 0.5) * height,
      };
    });
  },
  get forces() {
    return Object.fromEntries(WORLD_FORCE_KINDS.map((kind) => [kind, world.forces?.[kind] ?? 0]));
  },
  get workingRoutes() {
    return WORLD_TRADE_ROUTES
      .filter((route) => world.routes?.[route.id]?.status === 'open')
      .map((route) => route.id);
  },
  pickForce(kind, index = 0) { selectForce(kind, index); },
  pickRoute(routeId) { selectRoute(routeId); },
  pickCity(cityId) { selectCity(cityId); },
  openAmbitionRail(spec) { openAmbitionRail(spec); },
  closeAmbitionRail() { closeAmbitionRail(); },
  openWorktree(good) { openWorktree(good); },
  closeWorktree() { closeWorktree(); },
  expandAmbitionCategory(id) {
    expandedAmbitionCategory = id;
    paintHud();
  },
  replaceWorld(next) {
    world = next;
    pressure = melbournePressure(world);
    rebuildRoutes();
    rebuildForceTokens();
    paintHud();
  },
  frameLatLon(lat, lon) {
    frameMapPoint({ lat, lon }, true);
  },
  get world() { return world; },
  get selectedForce() { return selectedForce ? { ...selectedForce } : null; },
  get selectedRoute() { return selectedRouteId; },
  get selectedAmbition() { return selectedAmbition ? { ...selectedAmbition } : null; },
  get selectedWorktree() { return selectedWorktreeGood; },
  get expandedAmbitionCategory() { return expandedAmbitionCategory; },
  get disasters() { return liveDisasters(world); },
  get threats() { return threatLayer.debugState(); },
  // M5 F4 receipt: the unobscured stage, the fight bounds against it, and the
  // per-token rects that prove no overlap and a >= 24 px read.
  get threatFrame() {
    const w = Math.max(1, landElement.clientWidth);
    const h = Math.max(1, landElement.clientHeight);
    const safe = unobscuredMapRect(w, h);
    return {
      w,
      h,
      safe,
      check: threatLayer.fightSafeCheck?.(camera, w, h, safe) ?? null,
      parts: threatLayer.fightPartRects?.(camera, w, h) ?? null,
    };
  },
  // MC3 F8 receipt: the label collision pass, and whether it actually cleared.
  get labelPlacement() {
    if (!lastLabelPlacement) return null;
    const { items, placed, reserved = [], hudRects = [] } = lastLabelPlacement;
    const byId = new Map(items.map((item) => [item.id, item]));
    return {
      count: items.length,
      threats: reserved.length - hudRects.length,
      hud: hudRects.length,
      clear: labelsClear(placed, items, undefined, reserved),
      moved: placed.filter((row) => row.moved > 0.5).length,
      leaders: placed.filter((row) => row.leader).length,
      hidden: placed.filter((row) => row.hidden).map((row) => row.id),
      rows: placed.map((row) => ({
        id: row.id,
        x: Math.round(row.x),
        y: Math.round(row.y),
        w: Math.round(byId.get(row.id)?.w ?? 0),
        h: Math.round(byId.get(row.id)?.h ?? 0),
        moved: Math.round(row.moved),
        leader: Boolean(row.leader),
        hidden: Boolean(row.hidden),
        priority: row.priority ?? byId.get(row.id)?.priority ?? 'rest',
      })),
    };
  },
  get oceanMotionReduced() { return motionReduced; },
  get globeFinish() {
    let markerDiscs = 0;
    let threatMarkerDiscs = 0;
    scene.traverse((object) => {
      if (object.name === 'globe:marker-disc') markerDiscs += 1;
      if (object.name === 'globe:threat-marker-disc') threatMarkerDiscs += 1;
    });
    return {
      ocean: {
        f0: OCEAN_BRDF.f0,
        ior: OCEAN_BRDF.ior,
        roughness: materials.water.roughness,
        physical: materials.water.isMeshPhysicalMaterial === true,
        shader: materials.water.customProgramCacheKey(),
      },
      atmosphere: {
        radiusFraction: ATMOSPHERE_LIMB.radiusFraction,
        shellScale: ATMO_SHELL_SCALE,
        name: atmosphere.name,
      },
      terrain: {
        mipmapped: TERRAIN_PALETTE_MAP.generateMipmaps,
        minFilter: TERRAIN_PALETTE_MAP.minFilter,
        paletteBlend: TERRAIN_FILTER.paletteBlend,
        horizonKeep: TERRAIN_FILTER.horizonKeep,
      },
      markers: { discs: markerDiscs, threatDiscs: threatMarkerDiscs },
      panelCards: yardElement.querySelectorAll('[data-yard-card]').length,
      activeThreatCard: yardElement.querySelector('[data-yard-card="threat"]')?.dataset.active === '1',
      land: {
        smooth: smoothLand.name,
        shelf: coastShelf.name,
        rivers: landRivers.name,
        ledger: land.name,
        fade: +landFadeCurrent.toFixed(3),
        atmosphereGain: atmosphereUniforms.uGain.value,
        starfield: starfield.name,
      },
    };
  },
  get renderer() { return renderer; },
  get camera() { return camera; },
  /** M11 item 4 receipt: the pin scale the last frame applied, and the scene. */
  get pinScale() { return +lastPinScale.toFixed(4); },
  get scene() { return scene; },
  get voxelCargoGoods() {
    return WORLD_TRADE_ROUTES
      .filter((route) => deskNeedsVoxelCargo(route.good))
      .map((route) => route.good);
  },
  get deskPips() {
    return flagGroups.map((flag) => ({
      cityId: flag.userData.cityId,
      good: flag.userData.goodPip?.userData.good ?? null,
      scale: flag.userData.goodPip?.scale.x ?? null,
    }));
  },
  /*
   * P14 M10 item 2 — the terrain layer, reachable for an A/B.
   *
   * The relief is four shader terms plus a stacked raster, and "does the slope
   * shade read, or is it noise at cell frequency?" is a question a screenshot
   * pair answers and an argument does not. `material.userData.terrain` holds
   * the live uniform objects `onBeforeCompile` hands the program, so a harness
   * can zero one term at a time on the running page. Read-only accessors; the
   * page never uses them itself.
   */
  get terrain() {
    return {
      land: { mesh: land, uniforms: land.material.userData.terrain, count: raster.voxels.length },
      relief: {
        mesh: relief,
        uniforms: relief.material.userData.terrain,
        count: reliefRaster.voxels.length,
        tier1: reliefRaster.tier1,
        tier2: reliefRaster.tier2,
      },
      skirt: { mesh: skirt, count: skirtRaster.voxels.length },
      smooth: {
        mesh: smoothLand,
        name: smoothLand.name,
        vertexCount: smoothLandData.vertexCount,
        triangleCount: smoothLandData.triangleCount,
        turning: smoothLandData.turning,
        riverCount: smoothLandData.riverCount,
      },
    };
  },
});
globalThis[STATS_KEY] = stats;

let animationFrame = 0;
let disposed = false;
let lastAnimateTime = 0;
// M5 F4 — eased screen-pixel pan that keeps a live fight on the unobscured stage.
const fightPanSmooth = { x: 0, y: 0 };
const _tiltVec = new THREE.Vector3();
const _tiltEuler = new THREE.Euler(0, 0, 0, 'YXZ');

/** Screen y of the stage centre — what a centred fight should measure. */
function fightStageCentreY() {
  const h = Math.max(1, landElement.clientHeight);
  const safe = unobscuredMapRect(Math.max(1, landElement.clientWidth), h);
  return (safe.top + safe.bottom) * 0.5;
}

/**
 * MC3 F12 — screen y of the fight's focus point for a candidate globe tilt,
 * measured through the live camera in the globe's own rotation order. This is
 * what `solveFightTilt` searches over; it never mutates the globe.
 */
function fightFocusScreenY(focus, rotX, rotY) {
  const h = Math.max(1, landElement.clientHeight);
  const v = latLonToVector(focus.lat, focus.lon, GLOBE_RADIUS + 0.036);
  _tiltVec.set(v.x, v.y, v.z);
  _tiltEuler.set(rotX, rotY, 0, 'YXZ');
  _tiltVec.applyEuler(_tiltEuler).add(globe.position);
  _tiltVec.project(camera);
  return ((-_tiltVec.y * 0.5) + 0.5) * h;
}

function animate(time = 0) {
  if (disposed) return;
  if (flagGroups.length && time - cybercabPollTime >= 250) {
    cybercabPollTime = time;
    syncCybercabBook();
  }
  const spinFrames = Math.min(3, Math.max(0, lastAnimateTime ? (time - lastAnimateTime) / (1000 / 60) : 1));
  // MC3 F8 — the horizon band always faces the eye, so the limb it draws is the
  // limb the camera sees. Pure orientation; no state, no storage.
  horizonBand.quaternion.copy(camera.quaternion);
  if (!drag.active && !motionReduced && Math.abs(drag.spin) > 0.00001) {
    const decay = 0.91 ** spinFrames;
    drag.rotY += drag.spin * (1 - decay) / (1 - 0.91);
    drag.spin *= decay;
    globe.rotation.y = drag.rotY;
  } else if (motionReduced) {
    drag.spin = 0;
  }
  for (const { object, baseY, amplitude, phase } of bobTargets) {
    object.position.y = motionReduced
      ? baseY
      : baseY + (Math.sin((time * 0.002) + phase) * amplitude);
  }
  for (const runner of cargoRunners) {
    const points = runner.userData.points;
    if (!points?.length) continue;
    const to = Number.isFinite(runner.userData.fraction) ? runner.userData.fraction : 0;
    const from = Number.isFinite(runner.userData.fromFraction) ? runner.userData.fromFraction : to;
    const k = motionReduced ? 1 : Math.min(1, (time - (runner.userData.easeStart ?? time)) / CARGO_EASE_MS);
    const eased = k < 1 ? k * k * (3 - 2 * k) : 1;
    const t = from + (to - from) * eased;
    const point = pointOnRoute(points, t, runner.userData.mode);
    runner.position.copy(point);
    runner.quaternion.setFromUnitVectors(yUp, point.clone().normalize());
  }
  // Cybercab cargo obeys the same hemisphere and 12-degree limb fade as ports.
  for (const runner of cargoRunners) {
    if (runner.userData.routeId !== CYBERCAB_LANE) continue;
    const centre = globe.getWorldPosition(new THREE.Vector3());
    const view = camera.getWorldPosition(new THREE.Vector3()).sub(centre).normalize();
    const depth = runner.getWorldPosition(new THREE.Vector3()).sub(centre).normalize().dot(view);
    runner.visible = depth > 0;
    const limb = THREE.MathUtils.clamp(depth / LABEL_LIMB_SINE, 0, 1);
    for (const mesh of runner.userData.colourParts) {
      mesh.material.transparent = true;
      mesh.material.opacity = limb * limb * (3 - 2 * limb);
    }
  }
  tickOceanMaterial(materials.water, time, motionReduced);
  tickCoastFoam(foam, time, motionReduced);
  disasterLayer.tick(time, world);
  threatLayer.tick(time, world);
  tickMelbourneWeather(time);
  const mapW = Math.max(1, landElement.clientWidth);
  const mapH = Math.max(1, landElement.clientHeight);
  const camZ = 5.15;
  const fightFocus = !drag.active && !motionReduced ? threatLayer.fightFocus?.() : null;
  if (fightFocus) {
    // Solve the tilt against an UNPANNED camera. A view offset persists across
    // frames, so solving through it finds a tilt that only centres the fight
    // once the pan is added — a stable fixed point that leaves the pan doing
    // 95 px of work it should not have to do, which is the state MC3 measured.
    camera.clearViewOffset();
    camera.updateMatrixWorld();
    const mapVector = latLonToVector(fightFocus.lat, fightFocus.lon, 1);
    const wantY = Math.atan2(-mapVector.x, mapVector.z);
    drag.rotY += (wantY - drag.rotY) * 0.16;
    globe.rotation.y = drag.rotY;
    // MC3 F12 — the tilt is SOLVED against the real projection, not derived.
    // `globe.rotation.order` is 'YXZ', so M5's analytic law (which assumed
    // Rx * Ry) left the fight 140 px low and handed the work to the pan.
    const wantX = solveFightTilt(
      (candidate) => fightFocusScreenY(fightFocus, candidate, drag.rotY),
      fightStageCentreY(),
    ).rotX;
    drag.rotX += (wantX - drag.rotX) * 0.16;
    globe.rotation.x = drag.rotX;
  }
  scene.updateMatrixWorld(true);
  const safeStage = unobscuredMapRect(mapW, mapH);
  const zoom = threatLayer.fightZoom?.(camera, mapW, mapH, safeStage) ?? 1;
  const targetZ = camZ / zoom;
  camera.position.z += (targetZ - camera.position.z) * (motionReduced ? 1 : 0.12);
  // M11 item 4 — hold the pins near a constant screen size through the dolly.
  lastPinScale = scalePinsForZoom(camera.position.z);
  const dt = lastAnimateTime ? Math.max(0, time - lastAnimateTime) : 16;
  lastAnimateTime = time;
  const fadeTarget = landFadeTarget(camera.position.z);
  landFadeCurrent = stepLandFade(landFadeCurrent, fadeTarget, dt, motionReduced);
  applyLandFade(landFadeCurrent);
  // Measure and fit with no pan applied, then pan. A view offset is a pure
  // translation of the frustum, so the fitted pixel sizes survive it.
  camera.clearViewOffset();
  camera.updateMatrixWorld();
  threatLayer.fitTokensToScreen?.(camera, mapW, mapH);
  scene.updateMatrixWorld(true);
  const pan = threatLayer.fightPan?.(camera, mapW, mapH, safeStage) ?? null;
  const wantPanX = pan ? pan.x : 0;
  const wantPanY = pan ? pan.y : 0;
  const k = motionReduced ? 1 : 0.16;
  fightPanSmooth.x += (wantPanX - fightPanSmooth.x) * k;
  fightPanSmooth.y += (wantPanY - fightPanSmooth.y) * k;
  if (Math.abs(fightPanSmooth.x) > 0.5 || Math.abs(fightPanSmooth.y) > 0.5) {
    camera.setViewOffset(mapW, mapH, fightPanSmooth.x, fightPanSmooth.y, mapW, mapH);
  } else {
    fightPanSmooth.x = 0;
    fightPanSmooth.y = 0;
    camera.clearViewOffset();
  }
  camera.updateMatrixWorld();
  renderer.render(scene, camera);
  updateCybercabLabelAnchor();
  updateProjectedLabels();
  // The HUD, port models and first rendered frame must agree before revealing
  // them. Keeping the main measurable while hidden preserves camera/label layout.
  if (globeDesksReady && !globePresented) {
    globePresented = true;
    worldBootPhase('ready');
  }
  animationFrame = requestAnimationFrame(animate);
}
animationFrame = requestAnimationFrame(animate);

function dispose() {
  if (disposed) return;
  disposed = true;
  cancelAnimationFrame(animationFrame);
  resizeObserver?.disconnect();
  window.removeEventListener('resize', resizeRenderer);
  window.removeEventListener('keydown', onDocumentKey);
  window.removeEventListener('pagehide', dispose);
  canvas.removeEventListener('pointerdown', onPointerDown);
  canvas.removeEventListener('pointermove', onPointerMove);
  canvas.removeEventListener('pointerup', onPointerUp);
  canvas.removeEventListener('pointerleave', onPointerLeave);
  canvas.removeEventListener('keydown', moveKeyboardSelection);
  labelsElement.removeEventListener('keydown', moveKeyboardSelection);
  dossierElement.removeEventListener('click', onDossierClick);
  yardElement.removeEventListener('click', onYardClick);
  window.removeEventListener('storage', onWorldStorage);
  document.removeEventListener('visibilitychange', onWorldVisibility);
  const geometries = new Set();
  const disposableMaterials = new Set();
  scene.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    objectMaterials.filter(Boolean).forEach((material) => disposableMaterials.add(material));
  });
  disasterLayer.dispose();
  threatLayer.dispose();
  threatChipHost.remove();
  geometries.forEach((geometry) => geometry.dispose());
  disposableMaterials.forEach((material) => material.dispose());
  renderer.dispose();
  labelsElement.replaceChildren();
  routeLabelsElement.replaceChildren();
  if (globalThis[STATS_KEY] === stats) delete globalThis[STATS_KEY];
  if (globalThis[DISPOSE_KEY] === dispose) delete globalThis[DISPOSE_KEY];
}

globalThis[DISPOSE_KEY] = dispose;
window.addEventListener('pagehide', dispose, { once: true });

export { LAST_RUN_KEY, worldSeedFromUrl, loadOrCreateWorld, dispose };
