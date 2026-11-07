// District Deck V3.00 — authored content.
// Separate from runtime state by contract (MengTo build-isometric-arpg: "keep authored
// content separate from runtime state"). Nothing here is mutated at runtime.
//
// Every dollar figure is a game unit. Nothing here is a valuation of any real asset,
// and every district is a fictionalised namesake, not the actual suburb.

export const SECTORS = Object.freeze({
  residential: { id: 'residential', label: 'Residential', accent: '#d8a24a' },
  retail: { id: 'retail', label: 'Retail', accent: '#c9705a' },
  office: { id: 'office', label: 'Office', accent: '#6f96b8' },
});

export const SECTOR_IDS = Object.freeze(['residential', 'retail', 'office']);
export const ZONE_IDS = Object.freeze(['NRZ', 'GRZ', 'RGZ', 'CZ', 'MUZ']);

/**
 * Authored tradeable archetypes. The original eight ids match the Blender kit; the
 * five succession archetypes use the binding V3.02 procedural fallback until their
 * promoted models land.
 *
 * V3.40 Wave R2b BUILD prices (hand-tuned, integer dollars):
 *   basePrice ≈ footprintTiles × storeys × eraQualityFactor × familyFactor
 * Family factors: residential 420_000, commercial 520_000, industrial 550_000, civic 480_000.
 * eraQualityFactor is a dimensionless era/quality multiplier (Victorian terrace ~1.76,
 * bayside bungalow ~3.33, civic supermarket strip ~2.92). Ladders, strict within family:
 *   residential: cottages/bungalows < terraces < townhouses < walkups < towers
 *   commercial: cafe < corner shops < shoptop < childcare < petrol
 *   industrial: grain-plot < kiln < hammerbarn < dairy-processor < pulp-mill
 *               < works-hall < printing-press < warehouse-brick < winery
 *               < factory-light < cattle-abattoir < refinery < steelworks
 *               < smelter < terafab < warehouse-datacentre
 *   civic: school-primary < school-high < missionary-school < police-station < officer-school
 *          < remand-centre < courthouse < transport-interchange < supermarket-strip
 *          < incubator < space-works < biolab < international-exchange
 * No two placeable forms in one family share a basePrice.
 */
export const ARCHETYPES = Object.freeze({
  'terrace-single': {
    id: 'terrace-single',
    label: 'Single-fronted terrace',
    era: 'Victorian, 1880s',
    sector: 'residential',
    footprint: [1, 1],
    storeys: 2,
    basePrice: 1_480_000,
    baseRent: 9_800,
  },
  'terrace-double': {
    id: 'terrace-double',
    label: 'Double-fronted terrace',
    era: 'Victorian, 1890s',
    sector: 'residential',
    footprint: [1, 1],
    storeys: 2,
    basePrice: 1_580_000,
    baseRent: 13_800,
  },
  'cottage-federation': {
    id: 'cottage-federation',
    label: 'Federation cottage',
    era: 'Federation, 1905',
    sector: 'residential',
    footprint: [1, 1],
    storeys: 1,
    basePrice: 890_000,
    baseRent: 10_500,
  },
  'bungalow-californian': {
    id: 'bungalow-californian',
    label: 'Californian bungalow',
    era: 'Interwar, 1925',
    sector: 'residential',
    footprint: [1, 1],
    storeys: 1,
    basePrice: 950_000,
    baseRent: 11_200,
  },
  'walkup-flats': {
    id: 'walkup-flats',
    label: 'Brick walk-up flats',
    era: 'Interwar, 1938',
    sector: 'residential',
    footprint: [1, 1],
    storeys: 3,
    basePrice: 2_350_000,
    baseRent: 29_500,
  },
  // Two interwar walk-ups joining `walkup-flats`: the same building type in three registers.
  // Both are [1,1], so unlike `hammerbarn` they can actually place.
  'walkup-beaux-arts': {
    id: 'walkup-beaux-arts',
    label: 'Beaux-Arts walk-up flats',
    era: 'Interwar, 1928',
    sector: 'residential',
    footprint: [1, 1],
    storeys: 5,
    basePrice: 3_180_000,
    baseRent: 41_500,
  },
  'walkup-moderne': {
    id: 'walkup-moderne',
    label: 'Streamline Moderne flats',
    era: 'Interwar, 1937',
    sector: 'residential',
    footprint: [1, 1],
    storeys: 4,
    basePrice: 2_760_000,
    baseRent: 35_800,
  },
  'shop-corner': {
    id: 'shop-corner',
    label: 'Corner shop and dwelling',
    era: 'Edwardian, 1910',
    sector: 'retail',
    footprint: [1, 1],
    storeys: 2,
    basePrice: 1_420_000,
    baseRent: 21_000,
  },
  // V3.70, owner-directed 2026-08-18: three period variants of the corner shop and dwelling, so the
  // map carries the same object in three eras rather than one archetype repeated. Same footprint and
  // same two storeys as the incumbent because that is what they are — a single-storey shop with
  // living quarters behind it, in Victorian, interwar and contemporary form.
  //
  // The lane sized these off `shop-corner` above and explicitly declined to set the economics, on the
  // grounds that a render lane proposing prices is proposing balance (§3.3 keeps the render layer
  // downstream of the sim). Accepted as spread around the incumbent by era; they are a starting point
  // and the balance seat should revisit them, not treat them as considered.
  //
  // Registered, NOT promoted. These three have never been graded, so they are deliberately absent
  // from `V370_KIT_IDS` and from `PROMOTION_CANDIDATES` — registration makes a subject placeable and
  // gradeable, promotion asserts it has cleared §1. Conflating those two cost L6 a whole round.
  'shop-corner-victorian': {
    id: 'shop-corner-victorian',
    label: 'Victorian corner shop',
    era: 'Victorian, 1889',
    sector: 'retail',
    footprint: [1, 1],
    storeys: 2,
    basePrice: 1_340_000,
    baseRent: 19_800,
  },
  'shop-corner-deco': {
    id: 'shop-corner-deco',
    label: 'Deco corner shop',
    era: 'Interwar, 1936',
    sector: 'retail',
    footprint: [1, 1],
    storeys: 2,
    basePrice: 1_480_000,
    baseRent: 22_000,
  },
  'shop-corner-modern': {
    id: 'shop-corner-modern',
    label: 'Modern corner shop',
    era: 'Contemporary',
    sector: 'retail',
    footprint: [1, 1],
    storeys: 2,
    basePrice: 1_640_000,
    baseRent: 24_600,
  },
  // V3.40 Wave R1b — BUILD places the actual café form, not a corner-shop alias.
  'cafe-corner': {
    id: 'cafe-corner',
    label: 'Corner cafe',
    era: 'Contemporary hospitality',
    sector: 'retail',
    footprint: [1, 1],
    // P20 I2-B: the corner-hotel sheet owns identity; retain the corner lot.
    storeys: 2,
    basePrice: 1_080_000,
    baseRent: 25_000,
    useClass: 'hospitality',
  },
  // V3.36 Wave C — approved change-of-use finishes for the corner-shop shell.
  // These are deliberately distinct authored forms: civic-adjacent services carry
  // steady rent, while the fuel forecourt earns more and brings its own fire exposure.
  'childcare-centre': {
    id: 'childcare-centre',
    label: 'Childcare centre',
    era: 'Contemporary fit-out',
    sector: 'retail',
    footprint: [1, 1],
    storeys: 1,
    minPermitLevel: 2,
    basePrice: 3_050_000,
    baseRent: 42_000,
    useClass: 'childcare',
  },
  'medical-centre': {
    id: 'medical-centre',
    label: 'Medical centre',
    era: 'Contemporary fit-out',
    sector: 'retail',
    footprint: [1, 1],
    storeys: 2,
    basePrice: 2_180_000,
    baseRent: 49_500,
    useClass: 'medical',
    conversionOnly: true,
  },
  'courthouse': {
    id: 'courthouse',
    label: 'Courthouse',
    era: 'Civic, contemporary classical',
    sector: 'office',
    footprint: [1, 1],
    storeys: 3,
    minPermitLevel: 2,
    basePrice: 3_620_000,
    baseRent: 46_000,
    useClass: 'civic',
  },
  'school-primary': {
    id: 'school-primary',
    label: 'Primary School',
    era: 'Civic, heritage brick',
    sector: 'office',
    footprint: [1, 1],
    storeys: 2,
    minPermitLevel: 2,
    basePrice: 2_120_000,
    baseRent: 34_000,
    useClass: 'civic',
  },
  'school-high': {
    id: 'school-high',
    label: 'High School',
    era: 'Civic, postwar brick',
    sector: 'office',
    footprint: [1, 1],
    storeys: 3,
    minPermitLevel: 2,
    basePrice: 2_520_000,
    baseRent: 41_000,
    useClass: 'civic',
  },
  // V3.40 Wave R1b — civic uses that can also be commissioned on a player holding.
  // Their parcel footprints mirror the civic register so kit resolution and BUILD fit agree.
  'supermarket-strip': {
    id: 'supermarket-strip',
    label: 'Supermarket',
    era: 'Contemporary retail',
    sector: 'retail',
    footprint: [3, 1],
    storeys: 1,
    minPermitLevel: 2,
    basePrice: 4_200_000,
    baseRent: 82_000,
    useClass: 'retail',
  },
  'transport-interchange': {
    id: 'transport-interchange',
    label: 'Transport interchange',
    era: 'Civic, contemporary',
    sector: 'office',
    footprint: [1, 2],
    storeys: 1,
    minPermitLevel: 2,
    basePrice: 3_980_000,
    baseRent: 72_000,
    useClass: 'civic',
  },
  'remand-centre': {
    id: 'remand-centre',
    label: 'Remand centre',
    era: 'Civic, contemporary secure',
    sector: 'office',
    footprint: [1, 2],
    storeys: 3,
    minPermitLevel: 2,
    basePrice: 3_240_000,
    baseRent: 39_000,
    useClass: 'civic',
  },
  'police-station': {
    id: 'police-station',
    label: 'Police station',
    era: 'Civic, contemporary',
    sector: 'office',
    footprint: [1, 1],
    storeys: 2,
    minPermitLevel: 2,
    basePrice: 2_860_000,
    baseRent: 35_000,
    useClass: 'civic',
  },
  // V4.0 Wave 2 — four city institutions. Each reuses an existing kit (see INSTITUTION_KIT).
  'missionary-school': {
    id: 'missionary-school',
    label: 'Missionary school',
    era: 'Civic, heritage brick',
    sector: 'office',
    footprint: [1, 2],
    storeys: 2,
    minPermitLevel: 2,
    basePrice: 2_680_000,
    baseRent: 36_500,
    useClass: 'civic',
  },
  'officer-school': {
    id: 'officer-school',
    label: 'Officer school',
    era: 'Civic, postwar brick',
    sector: 'office',
    footprint: [1, 2],
    storeys: 2,
    minPermitLevel: 2,
    basePrice: 3_040_000,
    baseRent: 37_500,
    useClass: 'civic',
  },
  'space-works': {
    id: 'space-works',
    label: 'Space works',
    era: 'Industrial, contemporary pad works',
    sector: 'office',
    footprint: [1, 2],
    storeys: 3,
    minPermitLevel: 3,
    basePrice: 5_600_000,
    baseRent: 64_000,
    useClass: 'civic',
    zoneIds: ['MUZ', 'CZ'],
  },
  'international-exchange': {
    id: 'international-exchange',
    label: 'International exchange',
    era: 'Civic, Beaux-Arts financial',
    sector: 'office',
    footprint: [1, 2],
    storeys: 8,
    minPermitLevel: 3,
    basePrice: 7_400_000,
    baseRent: 110_000,
    useClass: 'civic',
    zoneIds: ['CZ'],
  },
  // V4.5 Wave 2 — BIOLAB. L3 office-class like the exchange. No bespoke GLB:
  // reuses the stock-exchange kit with authored fascia (INSTITUTION_KIT).
  biolab: {
    id: 'biolab',
    label: 'Biolab',
    era: 'Civic, laboratory',
    sector: 'office',
    footprint: [1, 2],
    storeys: 5,
    minPermitLevel: 3,
    basePrice: 6_200_000,
    baseRent: 88_000,
    useClass: 'civic',
    zoneIds: ['CZ'],
  },
  // V5.0 Lane G — FINANCIAL incubator. L2 CZ office. No bespoke GLB:
  // reuses the stock-exchange kit with authored fascia (INSTITUTION_KIT).
  incubator: {
    id: 'incubator',
    label: 'AI incubator',
    era: 'Civic, studio campus',
    sector: 'office',
    footprint: [1, 2],
    storeys: 4,
    minPermitLevel: 2,
    basePrice: 4_860_000,
    baseRent: 72_000,
    useClass: 'civic',
    zoneIds: ['CZ'],
  },
  'petrol-station': {
    id: 'petrol-station',
    label: 'Petrol station',
    era: 'Contemporary forecourt',
    sector: 'retail',
    footprint: [1, 1],
    storeys: 1,
    basePrice: 3_380_000,
    baseRent: 66_000,
    useClass: 'fuel-retail',
    hazard: 'fuel-fire',
    fireExposureBp: 1_600,
  },
  'warehouse-brick': {
    id: 'warehouse-brick',
    label: 'Brick sawtooth warehouse',
    era: 'Industrial, 1922',
    sector: 'retail',
    footprint: [1, 2],
    storeys: 2,
    minPermitLevel: 2,
    basePrice: 2_100_000,
    baseRent: 31_000,
  },
  'factory-light': {
    id: 'factory-light',
    label: 'Light industrial factory',
    era: 'Industrial, 1955',
    sector: 'retail',
    footprint: [1, 2],
    storeys: 2,
    minPermitLevel: 2,
    basePrice: 2_350_000,
    baseRent: 34_500,
  },
  'tower-office': {
    id: 'tower-office',
    label: 'Curtain-wall office slab',
    era: 'Postwar, 1968',
    sector: 'office',
    footprint: [1, 2],
    storeys: 8,
    basePrice: 6_400_000,
    baseRent: 96_000,
  },
  'townhouse-row': {
    id: 'townhouse-row',
    label: 'Townhouse row, three dwellings',
    era: 'Contemporary',
    sector: 'residential',
    footprint: [1, 1],
    storeys: 2,
    basePrice: 2_050_000,
    baseRent: 27_600,
  },
  'townhouse-paired-single': {
    id: 'townhouse-paired-single',
    label: 'Single-storey townhouse',
    era: 'Contemporary',
    sector: 'residential',
    footprint: [1, 1],
    storeys: 1,
    basePrice: 1_742_400,
    baseRent: 24_288,
  },
  'apartment-low': {
    id: 'apartment-low',
    label: 'Low-rise apartments',
    era: 'Contemporary',
    sector: 'residential',
    footprint: [1, 1],
    storeys: 4,
    basePrice: 2_720_000,
    baseRent: 39_200,
  },
  'apartment-mid': {
    id: 'apartment-mid',
    label: 'Mid-rise apartments',
    era: 'Contemporary',
    sector: 'residential',
    footprint: [1, 1],
    storeys: 8,
    basePrice: 5_280_000,
    baseRent: 78_400,
  },
  'apartment-tower': {
    id: 'apartment-tower',
    label: 'Apartment tower',
    era: 'Contemporary',
    sector: 'residential',
    footprint: [1, 1],
    storeys: 8,
    basePrice: 5_880_000,
    baseRent: 78_400,
  },
  'apartment-midrise': {
    id: 'apartment-midrise',
    label: 'Midrise apartments',
    era: 'Contemporary',
    sector: 'residential',
    footprint: [1, 1],
    storeys: 7,
    basePrice: 4_250_000,
    baseRent: 58_000,
  },
  'house-modern-skillion': {
    id: 'house-modern-skillion',
    label: 'Modern skillion house',
    era: 'Contemporary',
    sector: 'residential',
    footprint: [1, 1],
    storeys: 2,
    basePrice: 1_180_000,
    baseRent: 13_400,
  },
  'house-modern-pavilion': {
    id: 'house-modern-pavilion',
    label: 'Modern pavilion house',
    era: 'Contemporary',
    sector: 'residential',
    footprint: [1, 1],
    storeys: 2,
    basePrice: 1_320_000,
    baseRent: 14_800,
  },
  'townhouse-modern-brick': {
    id: 'townhouse-modern-brick',
    label: 'Brick townhouse row',
    era: 'Contemporary',
    sector: 'residential',
    footprint: [1, 1],
    storeys: 3,
    basePrice: 2_180_000,
    baseRent: 29_200,
  },
  'townhouse-modern-render': {
    id: 'townhouse-modern-render',
    label: 'Paired batten townhouses',
    era: 'Contemporary',
    sector: 'residential',
    footprint: [1, 1],
    storeys: 2,
    basePrice: 1_920_000,
    baseRent: 26_400,
  },
  'apartment-modern-courtyard': {
    id: 'apartment-modern-courtyard',
    label: 'Courtyard apartments',
    era: 'Contemporary',
    sector: 'residential',
    footprint: [1, 1],
    storeys: 4,
    basePrice: 3_150_000,
    baseRent: 44_800,
  },
  'apartment-modern-bar': {
    id: 'apartment-modern-bar',
    label: 'Bar apartments',
    era: 'Contemporary',
    sector: 'residential',
    footprint: [1, 1],
    storeys: 6,
    basePrice: 4_680_000,
    baseRent: 66_200,
  },
  'shoptop-mixed': {
    id: 'shoptop-mixed',
    label: 'Shop-top mixed use',
    era: 'Contemporary',
    sector: 'retail',
    footprint: [1, 1],
    storeys: 4,
    basePrice: 2_750_000,
    baseRent: 41_000,
  },
  'warehouse-converted': {
    id: 'warehouse-converted',
    label: 'Converted warehouse',
    era: 'Contemporary conversion',
    sector: 'office',
    footprint: [1, 2],
    storeys: 3,
    basePrice: 3_600_000,
    baseRent: 52_000,
  },
  // V3.70 L6 — the warehouse's OTHER future. `warehouse-converted` above turns a bond store into
  // apartments; this turns the same shell into a data centre, and the shell is shared by reference
  // (`bondStoreShell()` in `industrial/warehouse.js`), verified per-vertex at 98.4 % identical to
  // `warehouse-brick`. What differs is plant, not envelope: rooftop chillers on a braced gantry, a
  // fenced generator compound, cable risers, sealed openings and a card-access door.
  //
  // Registered here because WITHOUT IT THE SUBJECT CANNOT BE CAPTURED AT ALL — `resolveKitSpec()`
  // returns null for an unregistered id, so the review lab rendered an empty frame and three
  // separate capture attempts produced blank plates that were nearly handed to a critic. Grading
  // requires registration; it does not require promotion. The board is held separately by the
  // `V370_KIT_IDS` gate in `board.js`, which refuses this id until its lane clears §1.
  //
  // Economics mirror `warehouse-converted` — same shell, same footprint, an office-sector yield —
  // with a higher base price for the plant and a stronger rent, which is the whole reason a player
  // would choose this permit over apartments.
  'warehouse-datacentre': {
    id: 'warehouse-datacentre',
    label: 'Data centre',
    era: 'Contemporary conversion',
    sector: 'office',
    footprint: [1, 2],
    storeys: 3,
    minPermitLevel: 2,
    basePrice: 4_400_000,
    baseRent: 68_000,
  },
  'office-lowrise': {
    id: 'office-lowrise',
    label: 'Low-rise office',
    era: 'Contemporary',
    sector: 'office',
    footprint: [1, 2],
    storeys: 5,
    basePrice: 4_900_000,
    baseRent: 71_000,
  },
  // A big-box hardware warehouse. Land-heavy and rent-light against its footprint: it takes two
  // tiles, pays for a car park with them, and returns less per square metre than the office that
  // could stand on the same parcel. The holding also trades construction materials: the owner
  // builds 10% cheaper, and other builders pay that owner 10% of their works. It cannot be
  // permitted into townhouses or apartments.
  'hammerbarn': {
    id: 'hammerbarn',
    label: 'Hardware warehouse',
    era: 'Contemporary',
    sector: 'retail',
    footprint: [1, 2],
    storeys: 1,
    minPermitLevel: 2,
    basePrice: 1_660_000,
    baseRent: 48_000,
  },
  // V4.0 Wave 3 — agricultural forms. Industrial family, same size×storeys×tier
  // table as V3.40 E3 (familyFactor 550_000). L2. sector retail like factory-light.
  'farm': {
    id: 'farm', label: 'Farm', era: 'Hinterland agriculture', sector: 'retail',
    footprint: [3, 3], storeys: 1, minPermitLevel: 1, zoneIds: ['AG'],
    basePrice: 30000, baseRent: 9000,
  },
  'grain-plot': {
    id: 'grain-plot',
    label: 'Grain yard',
    era: 'Industrial, broadacre grain',
    sector: 'retail',
    footprint: [1, 2],
    storeys: 1,
    minPermitLevel: 2,
    basePrice: 1_240_000,
    baseRent: 22_000,
  },
  'dairy-processor': {
    id: 'dairy-processor',
    label: 'Dairy co-op',
    era: 'Industrial, dairy farm and processor',
    sector: 'retail',
    footprint: [1, 2],
    storeys: 2,
    minPermitLevel: 2,
    basePrice: 1_880_000,
    baseRent: 28_500,
  },
  'winery': {
    id: 'winery',
    label: 'Winery',
    era: 'Industrial, grape winery',
    sector: 'retail',
    footprint: [1, 2],
    storeys: 2,
    minPermitLevel: 2,
    basePrice: 2_220_000,
    baseRent: 33_000,
  },
  'cattle-abattoir': {
    id: 'cattle-abattoir',
    label: 'Abattoir',
    era: 'Industrial, cattle farm and abattoir',
    sector: 'retail',
    footprint: [1, 2],
    storeys: 2,
    minPermitLevel: 2,
    basePrice: 2_480_000,
    baseRent: 36_000,
  },
  // V4.4 Wave 1 — six process-tree facility forms. Industrial family, V4.2
  // price logic (familyFactor 550_000, L2, MUZ/CZ). Unique basePrice. No new
  // GLBs: each reuses an industrial kit via PROCESS_KIT fascia words.
  kiln: {
    id: 'kiln',
    label: 'Kiln',
    era: 'Industrial, kiln hall',
    sector: 'retail',
    footprint: [1, 2],
    storeys: 1,
    minPermitLevel: 2,
    basePrice: 1_480_000,
    baseRent: 24_000,
  },
  'works-hall': {
    id: 'works-hall',
    label: 'Works hall',
    era: 'Industrial, machine hall',
    sector: 'retail',
    footprint: [1, 2],
    storeys: 2,
    minPermitLevel: 2,
    basePrice: 2_050_000,
    baseRent: 30_500,
  },
  // V4.6 Wave 1b — dedicated mill/press. Industrial family, V4.2 price logic
  // (familyFactor 550_000, L2, MUZ/CZ). Unique basePrice. No new GLBs.
  'pulp-mill': {
    id: 'pulp-mill',
    label: 'Pulp mill',
    era: 'Industrial, pulp and paper mill',
    sector: 'retail',
    footprint: [1, 2],
    storeys: 2,
    minPermitLevel: 2,
    basePrice: 1_970_000,
    baseRent: 29_500,
  },
  'printing-press': {
    id: 'printing-press',
    label: 'Printing press',
    era: 'Industrial, press hall',
    sector: 'retail',
    footprint: [1, 2],
    storeys: 2,
    minPermitLevel: 2,
    basePrice: 2_080_000,
    baseRent: 31_200,
  },
  refinery: {
    id: 'refinery',
    label: 'Refinery',
    era: 'Industrial, refine plant',
    sector: 'retail',
    footprint: [1, 2],
    storeys: 2,
    minPermitLevel: 2,
    basePrice: 2_620_000,
    baseRent: 38_000,
  },
  steelworks: {
    id: 'steelworks',
    label: 'Steelworks',
    era: 'Industrial, blast furnace and BOF',
    sector: 'retail',
    footprint: [1, 2],
    storeys: 2,
    minPermitLevel: 2,
    basePrice: 2_860_000,
    baseRent: 42_000,
  },
  smelter: {
    id: 'smelter',
    label: 'Smelter',
    era: 'Industrial, electrolysis hall',
    sector: 'retail',
    footprint: [1, 2],
    storeys: 2,
    minPermitLevel: 2,
    basePrice: 3_190_000,
    baseRent: 46_500,
  },
  terafab: {
    id: 'terafab',
    label: 'TeraFab',
    era: 'Industrial, silicon fab',
    sector: 'retail',
    footprint: [1, 2],
    storeys: 3,
    minPermitLevel: 2,
    basePrice: 4_180_000,
    baseRent: 62_000,
  },
  // —— Suburb-typical residential expansions (L0 stock + succession rungs) ——
  'terrace-carlton-heritage': {
    id: 'terrace-carlton-heritage',
    label: 'Carlton heritage terrace',
    era: 'Victorian, 1885',
    sector: 'residential',
    footprint: [1, 1],
    storeys: 2,
    basePrice: 1_680_000,
    baseRent: 14_600,
  },
  'heritage-federation-villa': {
    id: 'heritage-federation-villa',
    label: 'Heritage Federation villa',
    era: 'Federation, 1910',
    sector: 'residential',
    footprint: [1, 1],
    storeys: 1,
    basePrice: 1_020_000,
    baseRent: 13_200,
  },
  'art-deco-flats': {
    id: 'art-deco-flats',
    label: 'Art Deco walk-up flats',
    era: 'Interwar, 1935',
    sector: 'residential',
    footprint: [1, 1],
    storeys: 3,
    basePrice: 2_260_000,
    baseRent: 28_800,
  },
  // Only via redevelop under PERMIT L2 — never map-start stock.
  'apartment-permit': {
    id: 'apartment-permit',
    label: 'Planning-permit apartments',
    era: 'Contemporary',
    sector: 'residential',
    footprint: [1, 1],
    storeys: 6,
    // Premium over walkup/townhouse so L2 works cost, rent and MV clearly dominate L1.
    basePrice: 4_850_000,
    baseRent: 68_000,
  },
  'bungalow-brighton': {
    id: 'bungalow-brighton',
    label: 'Bayside Californian bungalow',
    era: 'Interwar, 1928',
    sector: 'residential',
    footprint: [1, 1],
    storeys: 1,
    basePrice: 1_400_000,
    baseRent: 18_500,
  },
  'warehouse-richmond-loft': {
    id: 'warehouse-richmond-loft',
    label: 'Richmond warehouse loft',
    era: 'Industrial, 1918',
    sector: 'residential',
    footprint: [1, 2],
    storeys: 2,
    basePrice: 1_720_000,
    baseRent: 24_000,
  },
});

export const ARCHETYPE_IDS = Object.freeze(Object.keys(ARCHETYPES).sort());

/**
 * V3.04 §16 / V3.06 A.2-A.3. One record owns each district's pricing, drift,
 * planning and zoning identity. `appliedBandBp` is precomputed authored content:
 * runtime does not evaluate the provisional compression exponent.
 *
 * V3.10 §3.2 adds `waterAffinity`, the authored geography intent that district
 * assignment honours as a hard ordering rather than a nudge:
 *
 *   `coastal`  must own the water-edge block run
 *   `harbour`  must touch water, at the built-up end of the edge
 *   `river`    may touch water only via the river corridor, never the open bay
 *   `inland`   never adjacent to a water block
 *
 * The generation-side meaning of each value lives in `city.js` (`WATER_AFFINITY`),
 * so the content record stays a statement of intent rather than a tuning table.
 */
export const DISTRICTS = Object.freeze([
  {
    id: 'fitzroy-north',
    waterAffinity: 'inland',
    name: 'Fitzroy North',
    accent: '#c8763f',
    researchAnalogue: 'Fitzroy/Fitzroy North houses',
    rawAnchor: '$1.5m–$1.8m',
    designIndex: 180,
    appliedBandBp: 12284,
    l3EconomyBandBp: 21500,
    baseDriftBp: 18,
    researchSource: 'REIV suburb medians · preliminary',
    researchSourceDate: '30 Jul 2026',
    researchSourceUrl: 'https://reiv.com.au/market-insights/suburb/fitzroy%20north',
    heightRegisterId: 'heritage-inner',
    districtCapStoreys: 18,
    towerOverlay: false,
    zonePalette: [
      { id: 'NRZ', weight: 35 }, { id: 'GRZ', weight: 30 },
      { id: 'RGZ', weight: 10 }, { id: 'CZ', weight: 10 },
      { id: 'MUZ', weight: 15 },
    ],
    trait: 'Terraces, tight frontages, the strongest corridor value in the city.',
    weights: [
      { id: 'terrace-single', weight: 20 },
      { id: 'terrace-double', weight: 14 },
      { id: 'terrace-carlton-heritage', weight: 10 },
      { id: 'cottage-federation', weight: 8 },
      { id: 'heritage-federation-villa', weight: 6 },
      { id: 'shop-corner', weight: 5 },
      { id: 'shop-corner-victorian', weight: 9 },
      { id: 'shop-corner-deco', weight: 6 },
      { id: 'walkup-flats', weight: 4 },
      { id: 'walkup-beaux-arts', weight: 10 },
      { id: 'walkup-moderne', weight: 10 },
      { id: 'art-deco-flats', weight: 4 },
      { id: 'warehouse-brick', weight: 2 },
    ],
  },
  {
    id: 'carlton-east',
    waterAffinity: 'inland',
    name: 'Carlton East',
    accent: '#a8524a',
    researchAnalogue: 'Carlton houses',
    rawAnchor: '$1.2m–$1.35m',
    designIndex: 140,
    appliedBandBp: 11250,
    l3EconomyBandBp: 19000,
    baseDriftBp: 10,
    researchSource: 'REIV suburb medians · preliminary',
    researchSourceDate: '30 Jul 2026',
    researchSourceUrl: 'https://reiv.com.au/market-insights/suburb/carlton',
    heightRegisterId: 'heritage-inner',
    districtCapStoreys: 18,
    towerOverlay: false,
    zonePalette: [
      { id: 'NRZ', weight: 25 }, { id: 'GRZ', weight: 30 },
      { id: 'RGZ', weight: 15 }, { id: 'CZ', weight: 10 },
      { id: 'MUZ', weight: 20 },
    ],
    trait: 'University edge. Residential rent holds when the office sector wobbles.',
    weights: [
      { id: 'terrace-carlton-heritage', weight: 20 },
      { id: 'terrace-double', weight: 14 },
      { id: 'terrace-single', weight: 10 },
      { id: 'walkup-flats', weight: 8 },
      { id: 'walkup-beaux-arts', weight: 13 },
      { id: 'walkup-moderne', weight: 13 },
      { id: 'art-deco-flats', weight: 10 },
      { id: 'shop-corner', weight: 4 },
      { id: 'shop-corner-victorian', weight: 8 },
      { id: 'shop-corner-deco', weight: 6 },
      { id: 'cottage-federation', weight: 6 },
    ],
  },
  {
    id: 'richmond-flat',
    waterAffinity: 'river',
    name: 'Richmond Flat',
    accent: '#7d7a52',
    researchAnalogue: 'Richmond/South Yarra house register',
    rawAnchor: '$1.5m+',
    designIndex: 165,
    appliedBandBp: 11916,
    l3EconomyBandBp: 20500,
    baseDriftBp: 14,
    researchSource: 'REIV suburb medians · preliminary',
    researchSourceDate: '30 Jul 2026',
    researchSourceUrl: 'https://reiv.com.au/market-insights/suburb/richmond',
    heightRegisterId: 'heritage-inner',
    districtCapStoreys: 18,
    towerOverlay: false,
    zonePalette: [
      { id: 'NRZ', weight: 20 }, { id: 'GRZ', weight: 25 },
      { id: 'RGZ', weight: 20 }, { id: 'CZ', weight: 15 },
      { id: 'MUZ', weight: 20 },
    ],
    trait: 'Industrial bones. Cheap to enter, and it develops harder than it looks.',
    // Factory is civic-only (quota 1). Warehouses top up to 3 city-wide, one Hammerbarn.
    weights: [
      { id: 'walkup-beaux-arts', weight: 8 },
      { id: 'walkup-moderne', weight: 8 },
      { id: 'warehouse-brick', weight: 18 },
      // Weight 14, and it STILL ALL BUT CANNOT PLACE — recorded here so the next seat does not
      // retune it. Measured by `mvp/tests/v371-critb2-hammer.mjs`, which builds isolated copies of
      // this folder and runs the generator with the R30 roster post-pass live, with its top-up
      // branch off, and with the whole block bypassed.
      //
      // READ THE MECHANISM AS THE FINDING AND EVERY RATE AS AN OBSERVATION WITH ITS SEED STREAM
      // ATTACHED. The rate moves with the stream, so a rate published without one is not
      // reproducible. An earlier version of this note said "0/200 seeds with the post-pass on";
      // that was a property of one arithmetic progression and of nothing else, and the board at
      // ?seed=2599919623&mode=solo&operatorId=underwriter&persona=underwriter carries a hammerbarn
      // — photographed, 7,588 triangles — while the note said zero.
      //
      // 1. THE [1,2] PAD IS SCARCE. This is a board-shape limit, not a weight one. A city carries
      //    ~93.6 parcels of which 1.359 are a two-tile claim; 0.532 of those fall in
      //    richmond-flat, and 55.6 % of cities have no two-tile claim in this district at all.
      //    When a drawn archetype's oriented footprint cannot be claimed, the draw is re-run
      //    against `singles` only, so a [1,2] subject that loses its geometry is replaced by an
      //    unrelated [1,1] rather than by a smaller version of itself. With the R30 block
      //    bypassed, hammerbarn at weight 14 wins a pad on 17.73 % of seeds. That is the ceiling
      //    the draw can reach at this weight.
      // 2. THE R30 TOP-UP THEN TAKES ALMOST ALL OF THEM, AND IT TAKES THEM FIRST. Cited by symbol
      //    rather than line, because `city.js` is edited by other lanes and absolute lines rot:
      //    the R30 roster block's `if (have < TARGET)` top-up tops the city up to two
      //    `warehouse-brick`, sorting candidates by `scoreDistrict` — richmond-flat scores 0 —
      //    and then by `footprintArea` descending. A placed hammerbarn is the only 1×2 pad in the
      //    highest-priority district, so it sorts to the FRONT of a list whose first element is
      //    overwritten. Measured with a probe inside that branch, over 300 seeds: a drawn
      //    hammerbarn is RANK 0 in 47 of the 47 cases where the top-up fires. Never rank 1, never
      //    rank 2. It survives only on the seeds where two `warehouse-brick` land elsewhere first
      //    and the top-up never needs a candidate.
      //
      // THE RATES. 1,000 seeds on each of three named streams — seq1 (integers 1..1000), lin7919
      // (i × 7919 + 13), xs32 (xorshift32 from state 0x9e3779b9) — pooled over 3,000 draws:
      //
      //    these weights, R30 live         1.80 %  of seeds   [1.40 / 2.20 / 1.80 per stream]
      //    previous weights, R30 live      1.33 %             [0.80 / 1.60 / 1.60]
      //    these weights, R30 bypassed    17.73 %             [17.10 / 17.50 / 18.60]
      //
      // The weight change does not move this and was not made for it: 1.80 % against 1.33 % is
      // inside the spread of the three streams that produce it. 4,239 of the 6,000
      // `warehouse-brick` a 3,000-city sweep produces are top-up rewrites rather than draws, which
      // is why that row reads a constant two per city.
      //
      // THE SAME BLOCK HIDES THE LOFT BELOW. `warehouse-richmond-loft` at weight 10 is NOT a dead
      // row: it wins a pad 0.123 times per city. The R30 trim then keeps only the first two
      // warehouses and re-skins the rest, so the loft reaches the board 0 times in 3,000 cities
      // with the block live and 370 times with it bypassed. It loses its visibility to the trim,
      // not to the pad.
      //
      // `office-lowrise` is NOT a shape control. It appears in no district's `weights` array, so
      // it is never drawn and its zero says nothing about board shape; its only source is that
      // same trim, which is why a 3,000-city sweep shows 48 with the block live and 0 with it
      // bypassed. The honest [1,2] control is `tower-office` — weight 32 in docklands-quay.
      //
      // Options, all balance decisions and none the render lane's: give the shed a [1,1] footprint
      // (but a big box on one tile is not a big box), run the warehouse top-up BEFORE the draw
      // instead of after, exclude 1×2 pads from the top-up's candidate sort, or generate more
      // two-tile parcels. Owner's call. Raising this weight is not one of them.
      { id: 'hammerbarn', weight: 14 },
      { id: 'warehouse-richmond-loft', weight: 10 },
      { id: 'cottage-federation', weight: 10 },
      { id: 'bungalow-californian', weight: 10 },
      { id: 'terrace-single', weight: 10 },
      { id: 'art-deco-flats', weight: 10 },
      { id: 'shop-corner', weight: 6 },
      { id: 'shop-corner-deco', weight: 13 },
      { id: 'shop-corner-modern', weight: 13 },
    ],
  },
  {
    id: 'brighton-reach',
    waterAffinity: 'coastal',
    name: 'Brighton Reach',
    accent: '#4f7f86',
    researchAnalogue: 'Brighton bayside house register',
    rawAnchor: '$3m–$8m',
    designIndex: 370,
    appliedBandBp: 15808,
    l3EconomyBandBp: 30000,
    baseDriftBp: 5,
    researchSource: 'REIV suburb medians · preliminary',
    researchSourceDate: '30 Jul 2026',
    researchSourceUrl: 'https://reiv.com.au/market-insights/suburb/brighton',
    heightRegisterId: 'suburban-default',
    districtCapStoreys: 4,
    towerOverlay: false,
    zonePalette: [
      { id: 'NRZ', weight: 55 }, { id: 'GRZ', weight: 25 },
      { id: 'RGZ', weight: 10 }, { id: 'CZ', weight: 5 },
      { id: 'MUZ', weight: 5 },
    ],
    trait: 'Brighton register at the water edge. Prestige pricing meets a four-storey cap.',
    weights: [
      { id: 'bungalow-brighton', weight: 25 },
      { id: 'heritage-federation-villa', weight: 16 },
      { id: 'cottage-federation', weight: 12 },
      { id: 'bungalow-californian', weight: 11 },
      { id: 'terrace-single', weight: 9 },
      { id: 'shop-corner', weight: 4 },
      { id: 'shop-corner-victorian', weight: 9 },
      { id: 'shop-corner-modern', weight: 7 },
      { id: 'walkup-flats', weight: 5 },
      { id: 'art-deco-flats', weight: 6 },
      { id: 'walkup-moderne', weight: 4 },
    ],
  },
  {
    id: 'docklands-quay',
    waterAffinity: 'harbour',
    name: 'Docklands Quay',
    accent: '#5c6b8a',
    researchAnalogue: 'Docklands apartment mix',
    rawAnchor: '~$530k',
    // V3.10 §3.5 anchor adjustment, 2026-07-31. The research anchor and its citation are
    // unchanged; the design index is the authored gameplay judgement laid over it, and
    // §3.2 changed what this district is. Across a 200-seed sweep on the pre-V3.10
    // generator, docklands-quay held 5.0 % of water-edge blocks; the harbour claim now
    // guarantees it 50 % on every seed, and costs it 18.1 % of its block share. Pricing
    // that guaranteed frontage lifts the index 60 -> 72, and the applied band follows the
    // V3.06 A.2 derivation round(10000 × (72/100)^0.35) = 8914. Left at 60, the geography
    // rule alone put the Petridis persona above the cheapest persona and the V3.03 §15
    // acceptance condition failed.
    designIndex: 72,
    appliedBandBp: 8914,
    l3EconomyBandBp: 15000,
    baseDriftBp: -8,
    researchSource: 'REIV suburb medians · preliminary',
    researchSourceDate: '30 Jul 2026',
    researchSourceUrl: 'https://reiv.com.au/market-insights/suburb/docklands',
    heightRegisterId: 'docklands-tower',
    districtCapStoreys: 40,
    towerOverlay: true,
    zonePalette: [
      { id: 'NRZ', weight: 0 }, { id: 'GRZ', weight: 5 },
      { id: 'RGZ', weight: 10 }, { id: 'CZ', weight: 35 },
      { id: 'MUZ', weight: 50 },
    ],
    trait: 'Docklands apartments. Volatile value, mixed-use zoning, and the tower overlay.',
    // No apartments at map start — those are built only with a planning permit (L2 redevelop).
    weights: [
      { id: 'tower-office', weight: 26 },
      { id: 'house-modern-skillion', weight: 12 },
      { id: 'house-modern-pavilion', weight: 12 },
      { id: 'townhouse-modern-brick', weight: 10 },
      { id: 'townhouse-modern-render', weight: 10 },
      { id: 'apartment-modern-courtyard', weight: 10 },
      { id: 'apartment-modern-bar', weight: 8 },
      { id: 'walkup-flats', weight: 6 },
      { id: 'walkup-moderne', weight: 6 },
      { id: 'shop-corner', weight: 3 },
      { id: 'shop-corner-modern', weight: 12 },
      { id: 'shop-corner-deco', weight: 6 },
      { id: 'warehouse-brick', weight: 10 },
    ],
  },
  {
    id: 'brunswick-rise',
    waterAffinity: 'inland',
    name: 'Brunswick Rise',
    accent: '#8a6f9b',
    researchAnalogue: 'Brunswick/Brunswick East houses',
    rawAnchor: '$1.2m–$1.35m',
    designIndex: 140,
    appliedBandBp: 11250,
    l3EconomyBandBp: 19000,
    baseDriftBp: 22,
    researchSource: 'REIV suburb medians · preliminary',
    researchSourceDate: '30 Jul 2026',
    researchSourceUrl: 'https://reiv.com.au/market-insights/suburb/brunswick',
    heightRegisterId: 'satellite-major',
    districtCapStoreys: 25,
    towerOverlay: false,
    zonePalette: [
      { id: 'NRZ', weight: 20 }, { id: 'GRZ', weight: 30 },
      { id: 'RGZ', weight: 25 }, { id: 'CZ', weight: 10 },
      { id: 'MUZ', weight: 15 },
    ],
    trait: 'Mixed and rising. Nothing is cheap and nothing is overpriced.',
    // Opening stock only — apartments arrive via PERMIT L2 redevelop, not generation.
    weights: [
      { id: 'bungalow-californian', weight: 18 },
      { id: 'art-deco-flats', weight: 14 },
      { id: 'terrace-single', weight: 15 },
      { id: 'walkup-flats', weight: 10 },
      { id: 'walkup-beaux-arts', weight: 8 },
      { id: 'walkup-moderne', weight: 8 },
      { id: 'shop-corner', weight: 4 },
      { id: 'shop-corner-victorian', weight: 8 },
      { id: 'shop-corner-deco', weight: 7 },
      { id: 'shop-corner-modern', weight: 7 },
      { id: 'cottage-federation', weight: 13 },
    ],
  },
]);

/**
 * V3.06 A.2 migration aliases only. Authored city content and new run state use
 * canonical ids exclusively.
 */
export const DISTRICT_ID_MIGRATION_ALIASES = Object.freeze({
  'southbank-spine': 'docklands-quay',
  'port-reach': 'brighton-reach',
});

/** Authored survey defect tiers. Asking discounts are deed information, not an owner perk. */
export const SURVEY_DEFECT_TIERS = Object.freeze({
  none: Object.freeze({ id: 'none', label: 'None found', discountBp: 0 }),
  minor: Object.freeze({ id: 'minor', label: 'Minor defects', discountBp: 600 }),
  major: Object.freeze({ id: 'major', label: 'Major defects', discountBp: 1500 }),
});

/** Deterministic defect tier revealed by a survey's condition inspection. */
export function surveyDefectTierForCondition(condition) {
  const rung = Math.max(0, Math.min(2, Math.floor(Number(condition) || 0)));
  return rung >= 2 ? 'none' : rung === 1 ? 'minor' : 'major';
}

/** Every tunable number the economy touches. Framework §4. */
export const RULES = Object.freeze({
  // Legacy fixture/migration value only. New runs derive their opening from city stock.
  startingCash: 3_200_000,
  openingMultipleBp: 21_500,
  openingRound: 50_000,
  // Ten years of play (4 quarters/year × 10) — enough runway for staged construction,
  // franchise tenancy and a rival race that survives a full development cycle.
  quarters: 40,
  // Four ordinary actions per quarter, plus the bank and divest paths.
  actionsPerQuarter: 4,
  // V3.36 Wave B: keep the legacy reducer/replay contract while retiring its card UI.
  redevelopButtonRetired: true,
  // Banjo's council time capsule: one-shot extra actions in the quarter you collect it.
  timeCapsuleActions: 4,
  // Holding banks an action into the next quarter. This is what makes Petridis's
  // disclosed intent a decision rather than a caption: bank now, outbid it next quarter.
  maxBankedActions: 1,

  lvrBp: 5500,          // debt taken as a share of price
  dutyBp: 550,          // transfer duty on acquisition
  agentFeeBp: 200,      // on divestment
  // Terry sales mandate: a deterministic triangular roll at sale, centred on 7.5%.
  agentSaleUpliftMinBp: 0,
  agentSaleUpliftMaxBp: 1500,
  interestBp: 120,      // per quarter, on outstanding debt
  opexBp: 1500,         // per quarter, on gross rent
  overdraftLimitBp: 500,
  overdraftInterestBp: 300,

  renovateCostBp: 1150, // calibrated V3.03 balance dial; safely above the 1127 bp arbitrage floor
  maxCondition: 2,
  conditionValueBp: [8700, 10000, 10700],
  conditionRentBp: [8900, 10000, 10600],
  redevelopCostBp: 6200, // of the incoming archetype's authored base price
  constructionValueBp: 6000,
  // Hammerbarn is a hardware warehouse, not another bond store. The owner buys
  // materials at cost (10% cheaper works). Anyone else who builds pays 10% of
  // their construction cost to that owner as the trade.
  hammerbarnOwnerWorksBp: 9000,
  hammerbarnTradeBp: 1000,
  // L0 standing · L1 townhouses · L2 low-rise apartments · L3 high-rise apartments.
  maxLevel: 3,
  // Built level rungs: each planning rung is clearly worth more (MV + rent).
  // Index by level 0..maxLevel.
  levelValueBp: Object.freeze([10000, 11200, 12800, 14800]),
  levelRentBp: Object.freeze([10000, 10800, 12000, 13600]),
  // L3 rent is floored from an authored neutral base, then multiplied by the same
  // suburb band as cost and completed value. Cheapest band 15000 => $300k/q.
  l3RentFloorBase: 200_000,

  // V3.06 B5 — block zoning and consolidated 1×2 endpoint economics.
  zoningSplitChanceBp: 2500,
  townhousePairedSingleBp: 8800,
  consolidatedApartmentPlateValue: 680_000,
  consolidatedApartmentPlateRent: 9_800,
  consolidatedOfficePlateValue: 980_000,
  consolidatedOfficePlateRent: 14_200,
  consolidatedMixedPlateValue: 830_000,
  consolidatedMixedPlateRent: 12_000,
  consolidatedEfficiency8Bp: 10000,
  consolidatedEfficiency20Bp: 9200,
  consolidatedEfficiency40Bp: 8600,
  consolidatedEfficiency41PlusBp: 8200,

  // Corridors are the designed line, so they have to be worth more than buying the
  // highest yield blind. Rent uplift AND a value premium, because a linked holding is
  // worth more to the next buyer too.
  corridorLinkBp: 1100,      // rent uplift per orthogonal owned neighbour
  corridorCapBp: 4400,
  corridorValueBp: 450,      // value uplift per link
  corridorValueCapBp: 1800,

  tramFrontageBp: 700,  // value uplift for a parcel fronting a tram corridor
  cornerFrontageBp: 450,
  amenityClampBp: 3000,
  amenityRentShareBp: 6000,

  forecastMinBp: -300,
  forecastMaxBp: 700,
  realisedNoiseBp: 450,
  sectorFloorBp: 6000,
  districtCompressionExponent: 0.35,
  districtDriftScaleBp: 10000,

  debtStressBp: 7000,   // debt / gross asset value above which the HUD warns

  // V3.03 Batch 3 — people, avatar access and professional works.
  peopleCap: 18,
  peopleDemandClampBp: 300,
  // A live family signal compounds this much extra value into its block each settle.
  familySignalValueDriftBp: 75,
  coffeeCost: 7,
  foodCost: 28,
  supermarketLease: 4_500,
  clothesCost: 120,
  techCost: 180,
  surveyCost: 3_000,
  cheapBuilderFee: 8_000,
  architectFee: 18_000,
  lobbyCost: 15_000,
  remediateCost: 12_000,
  // Melbourne REA-style leasing placement fee (~1 week mid-tier rent), not a tax.
  leaseFee: 650,
  cheapBuilderCostBp: 8500,
  cheapBuilderDefectBp: 2800,
  designBuildDefectBp: 2100,
  baseWorksDefectBp: 800,
  architectCostBp: 11800,
  architectHeritageValueBp: 250,
  renovationTenantBp: 6500,
  cheapBuilderTenantBp: 5000,
  architectTenantBp: 8000,
  materialsSpikeCostBp: 11800,
  interestShockBp: 165,
  brokerInterestBp: 95,
  brokerShockInterestBp: 140,
  brokerLvrBp: 6000,
  eventDownturnBp: -650,
  insuranceFirePremiumBp: 18,
  insuranceFloodPremiumBp: 22,
  insuranceBundleBp: 9000,

  // Listed markets (Stock Exchange civic). Cash-only · batch-sized units · no action.
  // No hard unit ceiling — cash (buy) and held units (sell) are the only limits.
  marketMaxUnitsPerTrade: 1_000_000_000,
  /** Default buy/sell qty per ticker on the Stock Exchange card. */
  marketLotSizeById: Object.freeze({
    NVDA: 100,
    AAPL: 100,
    MSFT: 100,
    AMZN: 100,
    GOOGL: 100,
    META: 100,
    TSLA: 100,
    BTC: 1,
    ETH: 2,
    SOL: 5,
    XAU: 1,
    CL: 10,
    KC: 5,
  }),
  insuranceDeductibleBp: 100,
  insuranceMinimumDeductible: 10_000,
  hazardDamageValueBp: 8000,

  // Divesting does not cost an action. Charging one turned the escape hatch into part
  // of the trap; churn is already punished by duty on the way in and the fee on the way
  // out, so a no-action exit cannot be farmed.
  divestCostsAction: false,

  // Public reserve gifts: cash spend, no action, builds civic favour.
  favourMax: 100,
  /** Lobby pass chance bonus: +40 bp per favour point, hard cap +1500 bp. */
  favourLobbyBpPerPoint: 40,
  favourLobbyBpCap: 1500,
  /** Works / hire cost scale: −15 bp per favour point, floor 8500 bp (15% off). */
  favourCostBpPerPoint: 15,
  favourCostBpFloor: 8500,
});

/**
 * Melbourne-market-rate catalog for the central public reserve (presentation + favour).
 * Purchases take no action; they spend cash and raise civic favour.
 */
export const RESERVE_CATALOG = Object.freeze([
  Object.freeze({
    id: 'blackwood-bench', kind: 'furniture', label: 'Blackwood park bench',
    cost: 2_800, favour: 3, blurb: 'Cast iron + timber seat',
  }),
  Object.freeze({
    id: 'picnic-table', kind: 'furniture', label: 'Picnic table set',
    cost: 4_500, favour: 4, blurb: 'Timber top + dual side seats',
  }),
  Object.freeze({
    id: 'hoddle-bin', kind: 'furniture', label: 'Council litter bin',
    cost: 1_450, favour: 2, blurb: 'Street-grade steel bin',
  }),
  Object.freeze({
    id: 'bike-hoop', kind: 'furniture', label: 'Bike hoop pair',
    cost: 650, favour: 1, blurb: 'Melbourne standard hoop',
  }),
  Object.freeze({
    id: 'drinking-fountain', kind: 'furniture', label: 'Drinking fountain',
    cost: 8_500, favour: 6, blurb: 'City blackwood fountain',
  }),
  Object.freeze({
    id: 'path-light', kind: 'furniture', label: 'Path light',
    cost: 1_900, favour: 2, blurb: 'Low park bollard light',
  }),
  Object.freeze({
    id: 'garden-beds', kind: 'terrain', label: 'Native garden beds',
    cost: 12_000, favour: 8, blurb: 'Planted beds · path edges',
  }),
  Object.freeze({
    id: 'lawn-refresh', kind: 'terrain', label: 'Lawn refresh',
    cost: 18_000, favour: 10, blurb: 'Turf + soil top-up',
  }),
  Object.freeze({
    id: 'pond-edge', kind: 'terrain', label: 'Pond edge planting',
    cost: 25_000, favour: 14, blurb: 'Reed edge + soft bank',
  }),
  Object.freeze({
    id: 'softfall', kind: 'terrain', label: 'Playground softfall',
    cost: 22_000, favour: 12, blurb: 'Rubber softfall pad',
  }),
  Object.freeze({
    id: 'tree-planting', kind: 'terrain', label: 'Avenue tree planting',
    cost: 6_500, favour: 5, blurb: 'One mature plane / eucalypt',
  }),
]);

export const RESERVE_CATALOG_BY_ID = Object.freeze(
  Object.fromEntries(RESERVE_CATALOG.map((item) => [item.id, item])),
);

/** Lobby pass bonus in basis points from civic favour (0–favourMax). */
export function favourLobbyBonusBp(favour) {
  const pts = Math.max(0, Math.min(RULES.favourMax, favour | 0));
  return Math.min(RULES.favourLobbyBpCap, pts * RULES.favourLobbyBpPerPoint);
}

/**
 * Cost scale for works / consultants from civic favour.
 * 10000 = full price; lower = discount. Floor at favourCostBpFloor.
 */
export function favourCostScaleBp(favour) {
  const pts = Math.max(0, Math.min(RULES.favourMax, favour | 0));
  return Math.max(RULES.favourCostBpFloor, 10000 - pts * RULES.favourCostBpPerPoint);
}

const deferredAttribute = (label, ruleKeys = []) => Object.freeze({
  label,
  ruleKeys: Object.freeze(ruleKeys),
  status: 'deferred',
});
const liveAttribute = (label, ruleKeys, modifier) => Object.freeze({
  label,
  ruleKeys: Object.freeze(Array.isArray(ruleKeys) ? ruleKeys : [ruleKeys]),
  status: 'live',
  modifier: Object.freeze(modifier),
});

/**
 * V3.10 §4.3 operator roster. Cash multiples and rule-backed attributes are live.
 * `ruleKeys` names only existing RULES inputs; an empty list means no existing reducer
 * modifier can express the authored effect without adding a new rule or gameplay branch.
 */
export const OPERATORS = Object.freeze([
  Object.freeze({
    id: 'underwriter', name: 'The Underwriter', cashMultipleBp: 10_000,
    register: 'Slow, safe, financed. The default.',
    attributes: Object.freeze([
      liveAttribute('+1 overdraft band', 'overdraftLimitBp', { add: 100 }),
      liveAttribute('−60 bp interest', 'overdraftInterestBp', { add: -60 }),
      deferredAttribute('−1 action in Q1', ['actionsPerQuarter']),
    ]),
  }),
  Object.freeze({
    id: 'auctioneer', name: 'The Auctioneer', cashMultipleBp: 8_500,
    register: 'Information and tempo over capital.',
    attributes: Object.freeze([
      deferredAttribute('Sees one extra Petridis target per quarter'),
      deferredAttribute('Wins ties at auction'),
    ]),
  }),
  Object.freeze({
    id: 'builder', name: 'The Builder', cashMultipleBp: 9_000,
    register: 'Develops harder and faster, and pays for haste.',
    attributes: Object.freeze([
      liveAttribute('−15% works cost', ['renovateCostBp', 'redevelopCostBp'], { multiplyBp: 8500 }),
      deferredAttribute('−1 quarter works downtime'),
      liveAttribute('+40% defect exposure without an architect', 'baseWorksDefectBp', { multiplyBp: 14000 }),
    ]),
  }),
  Object.freeze({
    id: 'heritage-trust', name: 'The Heritage Trust', cashMultipleBp: 9_500,
    register: 'Compounds by not knocking things down.',
    attributes: Object.freeze([
      deferredAttribute('+250 bp value on retained heritage holdings', ['architectHeritageValueBp']),
      deferredAttribute('Cannot redevelop above the original district ceiling'),
    ]),
  }),
  Object.freeze({
    id: 'syndicate', name: 'The Syndicate', cashMultipleBp: 12_000,
    register: 'Cooperative play, punished for betrayal.',
    attributes: Object.freeze([
      deferredAttribute('Opens with a standing pact offer'),
      deferredAttribute('Pact payoffs +25%'),
      deferredAttribute('Defection penalty doubled'),
    ]),
  }),
  Object.freeze({
    id: 'liquidator', name: 'The Liquidator', cashMultipleBp: 7_000,
    register: 'Churn engine; thin, fast, always trading.',
    attributes: Object.freeze([
      liveAttribute('No ordinary agent fee', 'agentFeeBp', { set: 0 }),
      liveAttribute('+1 action per quarter', 'actionsPerQuarter', { add: 1 }),
    ]),
  }),
  Object.freeze({
    id: 'planner', name: 'The Planner', cashMultipleBp: 9_500,
    register: 'Plays the overlay system, not the market.',
    attributes: Object.freeze([
      deferredAttribute('Lobby always succeeds once per run', ['lobbyCost']),
      deferredAttribute('Sees zoning lens from Q1 without survey'),
    ]),
  }),
  Object.freeze({
    id: 'absentee', name: 'The Absentee', cashMultipleBp: 13_500,
    register: 'Most capital, least agency.',
    attributes: Object.freeze([
      liveAttribute('−1 action per quarter', 'actionsPerQuarter', { add: -1 }),
      // No general rent-scale key exists in RULES. Keep this honest until one is authored.
      deferredAttribute('Rent +10%'),
      deferredAttribute('No intel from the street avatar'),
    ]),
  }),
]);

const OPERATOR_RULES_BY_ID = new Map();

/**
 * Immutable per-run RULES overlay for the selected operator. Modifiers are deliberately
 * limited to existing numeric RULES keys, keeping operator choice data-driven and replayable.
 */
export function operatorRules(operatorId) {
  const operator = OPERATORS.find(({ id }) => id === operatorId)
    ?? OPERATORS.find(({ id }) => id === 'underwriter');
  const cached = OPERATOR_RULES_BY_ID.get(operator.id);
  if (cached) return cached;
  const rules = { ...RULES };
  for (const attribute of operator.attributes) {
    if (attribute.status !== 'live' || !attribute.modifier) continue;
    for (const key of attribute.ruleKeys) {
      if (!(key in RULES) || typeof RULES[key] !== 'number') continue;
      const modifier = attribute.modifier;
      if (Object.hasOwn(modifier, 'set')) rules[key] = modifier.set;
      if (Object.hasOwn(modifier, 'multiplyBp')) {
        rules[key] = Math.round(rules[key] * modifier.multiplyBp / 10_000);
      }
      if (Object.hasOwn(modifier, 'add')) rules[key] += modifier.add;
    }
  }
  const frozen = Object.freeze(rules);
  OPERATOR_RULES_BY_ID.set(operator.id, frozen);
  return frozen;
}

export function rulesFor(state) {
  return state?.operatorId ? operatorRules(state.operatorId) : RULES;
}

/**
 * A fingerprint of every number the ledger depends on. A saved run replays its action
 * log, so restoring a mid-run under changed arithmetic would silently rewrite history.
 * Change any of these and old saves are discarded rather than quietly re-scored.
 */
/**
 * Bumped BY HAND whenever the reducer's semantics change without any number changing —
 * delayed corridor maturity, financed development, delayed renovation recognition,
 * the surrender path. A hash of the constants cannot see those, and a save replayed
 * under new semantics is a rewritten history, not a restored one.
 *
 * V3.10 §13 names 19 for W0-GEO. The value standing before this batch was 15, not 18,
 * so taking the authored figure skips 16, 17 and 18; the spec figure is honoured
 * because it is binding and the gap is inert (the field is only ever compared for exact
 * equality), and the discrepancy is recorded in the convergence ledger rather than
 * quietly resolved to 16.
 * W0-ECON-R2 advances 20 -> 21 because making operator RULES overlays live changes
 * replay arithmetic without changing the persisted state schema.
 * W2-R2 advances 23 -> 24 because tenant exits no longer prepay or finance works;
 * ordinary Redevelop charges the works only when the vacant holding starts them.
 * P3 advances 24 -> 25 because new holdings begin at L0 and every legal height rung may be
 * pursued directly for that rung's listed fee.
 * V3.36 Wave A advances 25 -> 26 because venue entry now spends an action and leasing requires
 * a standing building.
 * V3.36 Wave B advances 26 -> 27 because BUILD now requires a cleared pad and industrial
 * placement is restricted to authored MUZ parcels.
 * V3.36 Wave D advances 28 -> 29 because authored L3 build classification, demolition lease
 * rejection, and divest asking-pin cleanup change deterministic reducer outcomes and quotes.
 * V3.37 Wave E advances 29 -> 30 because BUILD financing, professional sales mandates,
 * broker contact gating and dog-find identity persistence change reducer outcomes and quotes.
 * V3.37 Wave G advances 30 -> 31 because childcare joins ground-up commercial BUILD while
 * retaining its shop change-of-use route; replay peers must agree on that authored catalog.
 * V3.37 Wave I advances 31 -> 32 because valued venture trade sales now ignore Terry's
 * shopfront-sale uplift; replay peers must agree on the divest quote and proceeds.
 * V3.38 Wave K advances 32 -> 33 because persisted meet outcomes, live family block drift,
 * Terry's sale roll, fringe purchase keys and the shop L1 successor change reducer results.
 * V3.38 Wave L advances 33 -> 34 because settled block-condition districts, their value/rent
 * effects, build-use identity and the courthouse catalog change replayed reducer economics.
 * V3.38 Wave M advances 34 -> 35 because the 40-quarter horizon, height-timed works, quarterly
 * venture burn and franchise-anchor lease/value rolls change replayed reducer economics.
 * V3.38 Wave O advances 35 -> 36 because income-valued divests reject Terry's uplift and
 * anchored arrears now haircut the cap-rate bid on the simulation's quarterly yield basis.
 * V3.39 Wave P advances 36 -> 37 because consolidation now early-resolves this-quarter
 * condition assessments (same stored roll), the amalgamation uplift lifts the zone cap,
 * and divests leave a district-drifting last-sale asking anchor consumed at purchase.
 * V3.40 Wave R1a advances 37 -> 38 because subdivision now preserves a consolidated pad's
 * completed demolition instead of restoring the standing forms captured in its lineage.
 * V3.40 Wave R1b advances 38 -> 39 because BUILD catalog membership, authored L2 gates,
 * childcare use-permit validation and placeable civic economics change deterministic actions.
 * V3.40 Wave R2b advances 39 -> 40 because placeable BUILD basePrice ladders change
 * deterministic quotes and parcel generation.
 * V3.40 Wave R3 advances 40 -> 41 because two-slot pad placement, the data-centre
 * log-uniform IPO roll, petrol forecourt cash at settle, and Aido PM confirm
 * through ordinary reducers change replayed economics.
 * V3.40 Wave R3B advances 41 -> 42 because concurrent pad-slot works, dual-aware
 * holding identity, and independent slot completion change replayed actions.
 * V4.0 Wave 2 advances 42 -> 43 because four civic institutions and the globe win
 * pair (space works / missionary school / officer school / international exchange)
 * change placeable BUILD economics and world ambition reducers. WORLD_SIM_REVISION
 * locksteps to the same 43.
 * V4.0 Wave R2 advances 43 -> 44 because the city→globe ledger is exactly-once,
 * outbound books stop minting, export shipments are per-book events, and
 * institution authority is applied-ledger-only. WORLD_SIM_REVISION locksteps to 44.
 * V4.0 Wave R3 advances 44 -> 45 because the city ledger is a monotonic watermark,
 * CityExports write only on real settlement, consumption is derived from standing
 * forms, listings consume cityLots, and payload amounts are capped. WORLD_SIM_REVISION
 * locksteps to 45.
 * V4.0 Wave 3 advances 47 -> 48 because the Agricultural District, four farm forms,
 * CityExports milk/wine/beef/education goods, and world offtake books change
 * placeable BUILD economics and world trade reducers. WORLD_SIM_REVISION locksteps to 48.
 * V4.0 Wave R5 advances 48 -> 49 because world.log records harvest / city-admission /
 * export-shipment movement rows the delivery mapper reads, and the agricultural
 * district's gateway predicate is port-only. WORLD_SIM_REVISION locksteps to 49.
 * V4.2 Wave 1 advances 49 -> 50 because five new Yard goods and desks, first-principles
 * force recipes (officer + minerals), Mars part bills, and per-good export cash change
 * world reducers. WORLD_SIM_REVISION locksteps to 50.
 * V4.3 Wave 1 advances 50 -> 51 because six new Yard goods and desks, first-principles
 * Mars and AGI bills, drone graphite/nickel inputs, and institution build-kit
 * ship/place reducers change city BUILD economics and world reducers.
 * WORLD_SIM_REVISION locksteps to 51.
 * V4.3 Wave R2 advances 51 -> 52 because city state records consumed kit ids
 * (bounded watermark) so a restored voucher cannot replay a placement.
 * WORLD_SIM_REVISION locksteps to 52.
 * V4.3 Wave R3 advances 52 -> 53 because kit vouchers live in the world envelope
 * with a monotonic issuance sequence, and city state records a lossless
 * kitSeqWatermark instead of a capped id list.
 * WORLD_SIM_REVISION locksteps to 53.
 * V4.4 Wave 1 advances 53 -> 54 because city process runs draw and deposit
 * Yard goods through a processDraws echo, and six industrial facility forms
 * plus the authored process catalog change BUILD economics and world reducers.
 * WORLD_SIM_REVISION locksteps to 54.
 * V4.4 Wave R2 advances 54 -> 55 because processDraws apply only inside the
 * exactly-once ledger gate, draw rows carry derived ids, startProcessRun
 * takes an advisory Yard snapshot, and the seven identity-refine rows leave
 * the catalog. WORLD_SIM_REVISION locksteps to 55.
 * V4.4 Wave 2 advances 55 -> 56 because combo ladder, distance law, byproduct
 * capture, and world-side mine MAKE ticking change city and world reducers.
 * WORLD_SIM_REVISION locksteps to 56.
 * V4.4 Wave 2b advances 56 -> 57 because lastGiveByGood gates supplier
 * distance (idle decoys no longer zero the haul), completions apply
 * qualityDecayBp, and unfunded MAKE no longer blocks import.
 * WORLD_SIM_REVISION locksteps to 57.
 * V4.5 Wave 2 advances 57 -> 58 because the biomind win, biolab institution,
 * pulp/paper/press chain, ink book, and quarter↔beat canon change city BUILD
 * economics and world ambition reducers. WORLD_SIM_REVISION locksteps to 58.
 * V4.5 Wave R3 advances 58 -> 59 because CITY_EXPORTS_KEY becomes a bounded
 * unapplied-quarter queue and process-made deposits mint cityLots. WORLD_SIM_REVISION
 * locksteps to 59.
 * V4.5 Wave 3 advances 59 -> 60 because seeded natural disasters hold books,
 * stall plants, lose in-flight shipments, and gate fire repair. WORLD_SIM_REVISION
 * locksteps to 60.
 * V4.5 Wave 3b advances 60 -> 61 because disaster targets match their copy,
 * fire burns until repaired, held books read HELD, and fire gates process draws.
 * WORLD_SIM_REVISION locksteps to 61.
 * V4.6 Wave 1 advances 61 -> 62 because every Yard good gains an inbound book,
 * process intermediates become first-class rail goods, per-crate handling fees
 * hold unfunded arrivals at the dock, the FINANCIAL win reads three $100m AI
 * startups, the AI-startup ceiling rises to $110m, and biomind training feeds
 * a progress total instead of raising STOCK_CAP. WORLD_SIM_REVISION locksteps
 * to 62.
 * V4.6 Wave R2a advances 62 -> 63 because same-beat dock holds coalesce to
 * one inbound and one outbound log row, so WORLD_LOG_CAP cannot evict
 * individual unfunded crates. WORLD_SIM_REVISION locksteps to 63.
 * V4.7 Lane B advances 63 -> 64 because Antarctica harvests Ancient Biotech
 * and BIOMIND training requires 100 of those crates. WORLD_SIM_REVISION
 * locksteps to 64.
 * V4.8 Lane D advances 64 -> 65 because the uranium enrichment chain, NUKE
 * force, and city weather stream change world force recipes and city event
 * generation. WORLD_SIM_REVISION locksteps to 65.
 * V5.0 advances 65 -> 66 because BIOMIND gains biotech 100 (Melbourne licences).
 * WORLD_SIM_REVISION locksteps to 66.
 * V5.2 Lane K advances 66 -> 67 because city settle auto-advances the world
 * beat and cargo applies stock/cash at the authored arrival beat rather than
 * the same beat it departed. WORLD_SIM_REVISION locksteps to 67.
 * V5.6 Lane B advances 67 -> 68 because port stocks are class-capped
 * (yard / warehouse / tank) with adjacent city warehouses raising the cap.
 * WORLD_SIM_REVISION locksteps to 68.
 * V5.7 P14 M1 advances 68 -> 69 because seeded threats, shipyard build
 * beats, city military units, and facility damage change world and city
 * reducers. WORLD_SIM_REVISION locksteps to 69.
 */
export const SIM_REVISION = 69;  // V5.7: threats, shipyard, city defence

/**
 * Kit routing for the civic institutions. No bespoke kit yet — each id reuses
 * an existing builder and carries authored fascia text for the sign plate.
 */
export const INSTITUTION_KIT = Object.freeze({
  'space-works': Object.freeze({ kit: 'factory-light', fascia: 'SPACE WORKS' }),
  'missionary-school': Object.freeze({ kit: 'school-high', fascia: 'MISSION SCHOOL' }),
  'officer-school': Object.freeze({ kit: 'school-high', fascia: 'OFFICER SCHOOL' }),
  'international-exchange': Object.freeze({ kit: 'stock-exchange', fascia: 'INTL EXCHANGE' }),
  biolab: Object.freeze({ kit: 'stock-exchange', fascia: 'BIOLAB' }),
  incubator: Object.freeze({ kit: 'stock-exchange', fascia: 'AI INCUBATOR' }),
});

/**
 * Kit routing for Wave 3 farm forms. No bespoke kit — each id reuses an existing
 * industrial shed (hammerbarn / sawtooth warehouse / factory) with authored fascia.
 */
export const FARM_KIT = Object.freeze({
  'grain-plot': Object.freeze({ kit: 'hammerbarn', fascia: 'GRAIN YARD' }),
  'dairy-processor': Object.freeze({ kit: 'factory-light', fascia: 'DAIRY CO-OP' }),
  'winery': Object.freeze({ kit: 'warehouse-brick', fascia: 'WINERY' }),
  'cattle-abattoir': Object.freeze({ kit: 'factory-light', fascia: 'ABATTOIR' }),
});

/**
 * Kit routing for V4.4 process facilities. No new GLBs — each id reuses an
 * existing industrial kit with authored fascia text for the sign plate.
 */
export const PROCESS_KIT = Object.freeze({
  steelworks: Object.freeze({ kit: 'factory-light', fascia: 'STEELWORKS' }),
  smelter: Object.freeze({ kit: 'factory-light', fascia: 'SMELTER' }),
  refinery: Object.freeze({ kit: 'factory-light', fascia: 'REFINERY' }),
  terafab: Object.freeze({ kit: 'warehouse-datacentre', fascia: 'TERAFAB' }),
  'works-hall': Object.freeze({ kit: 'warehouse-brick', fascia: 'WORKS HALL' }),
  kiln: Object.freeze({ kit: 'warehouse-brick', fascia: 'KILN' }),
  'pulp-mill': Object.freeze({ kit: 'warehouse-brick', fascia: 'PULP MILL' }),
  'printing-press': Object.freeze({ kit: 'warehouse-brick', fascia: 'PRESS' }),
});

/**
 * Exported so a test can feed it a modified rule set and prove the fingerprint actually
 * moves. A revision function nobody can falsify is not change detection, it is a string.
 */
export function revisionOf(rules, simRevision) {
  // Every key of the rule set, so a new rule cannot be added and then silently forgotten.
  const keys = Object.keys(rules).sort();
  const parts = keys.map((key) => (
    `${key}=${Array.isArray(rules[key]) ? rules[key].join('/') : rules[key]}`
  )).concat([`sim=${simRevision}`]);
  let h = 0x811c9dc5;
  const text = parts.join(';');
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export const RULES_REVISION = revisionOf(RULES, SIM_REVISION);

/** Petridis personas. Each discloses its next intent — that is what makes it a contest. */
export const RIVAL_POLICIES = Object.freeze([
  {
    id: 'value',
    name: 'Value',
    accent: '#6f96b8',
    blurb: 'Buys the highest running yield on the board and holds it.',
    score: ({ yieldBp }) => yieldBp,
  },
  {
    id: 'momentum',
    name: 'Momentum',
    accent: '#6f96b8',
    blurb: 'Follows the strongest published sector forecast, whatever it costs.',
    score: ({ forecastBp, yieldBp }) => forecastBp * 3 + yieldBp * 0.4,
  },
  {
    id: 'civic',
    name: 'Civic',
    accent: '#6f96b8',
    blurb: 'Builds corridors along tram lines and compounds linked holdings.',
    score: ({ tram, adjacentOwned, yieldBp }) =>
      (tram ? 900 : 0) + adjacentOwned * 700 + yieldBp * 0.5,
  },
]);

export const GRADES = Object.freeze([
  { min: 1.60, grade: 'S', label: 'City-maker' },
  { min: 1.30, grade: 'A', label: 'Compounding' },
  { min: 1.10, grade: 'B', label: 'Ahead' },
  { min: 0.95, grade: 'C', label: 'Level' },
  { min: 0.80, grade: 'D', label: 'Behind' },
  { min: 0.00, grade: 'E', label: 'Unwound' },
]);

export function gradeFor(ratio) {
  for (const band of GRADES) {
    if (ratio >= band.min) return band;
  }
  return GRADES[GRADES.length - 1];
}
