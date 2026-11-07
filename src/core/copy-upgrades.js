// District Deck — AAA copy upgrades.
// Replacement text for every player-facing string surface.
// Import and spread over the existing constants to upgrade in place.

// ─────────────────────────────────────────────────────────────────────
// 1. PERSON LABELS — character names, not job titles
// ─────────────────────────────────────────────────────────────────────

export const PERSON_LABELS = Object.freeze({
  'property-agent': 'The Spruiker',
  'cheap-builder': 'The Chippy',
  architect: 'The Architect',
  'mortgage-broker': 'The Broker',
  'rival-developer': 'The Rival',
  arsonist: 'The Firestarter',
  squatter: 'The Squatter',
  policeman: 'The Constable',
  family: 'The Nguyen-O\'Briens',
  dog: 'The Dog',
});

export const PERSON_ROLE = Object.freeze({
  'property-agent': 'Estate agent -- sells the dream, lifts the result',
  'cheap-builder': 'Builder -- cheap quote, questionable waterproofing',
  architect: 'Architect -- heritage sympathetic, invoice unsympathetic',
  'mortgage-broker': 'Broker -- will find you money at a price',
  'rival-developer': 'AI developer -- pleasant, patient, already modelling your corridor',
  arsonist: 'Hazard -- where there is smoke there is a claim',
  squatter: 'Hazard -- possession is nine-tenths of the problem',
  policeman: 'Senior Constable -- keeps a file on Trevor thicker than most novels',
  family: 'Demand signal -- where families walk, rents follow',
  dog: 'Kelpie-cross -- has opinions, expresses them by sitting',
});

// ─────────────────────────────────────────────────────────────────────
// 2. PERSON PLAYBOOK — each character in their own voice
// ─────────────────────────────────────────────────────────────────────

export const PERSON_PLAYBOOK = Object.freeze({
  'property-agent': {
    summary: 'Give me the mandate and I will put ten percent on the board. The biscuits remain complimentary; the commission does not.',
    steps: [
      'Walk over. I don\'t wait at opens forever -- there\'s a vendor bid to manage somewhere.',
      'Hire the sales brief on a holding for no action. I take up to three projects; the sale price lifts ten percent before my fee.',
    ],
  },
  'cheap-builder': {
    summary: 'Mate, if the stumps are shot I\'m cheaper than the other bloke, I start Monday, and me cousin Daz does the concreting. The waterproofing is a separate conversation.',
    steps: [
      'You need something that needs work -- the worse the better, frankly, saves us both the pretending.',
      'Walk over. I\'ll quote on site. Cash preferred, invoice possible, cheques are a hate crime.',
      'Hire me after that for no extra action -- fee only -- and I can take up to three jobs before I am booked.',
      'Works start. If the heritage bloke shows up, say nothing and offer him a coffee.',
    ],
  },
  architect: {
    summary: 'Heritage is what I do. The brief is not cheap, but the render will be straight and council will not knock it back. I don\'t do Hamptons.',
    steps: [
      'Own something worth saving -- or something I can make worth saving, which is a broader category than you think.',
      'Walk over. Bring the survey and one honest sentence about your budget. You may take a moment to prepare the sentence.',
      'Quality or succession after that is free of action cost -- fee only -- and I will take up to three briefs.',
      'Works commence. The light will be invited, not just present.',
    ],
  },
  'mortgage-broker': {
    summary: 'Seventeen lenders on the panel and eleven of them will pretend they\'ve never met you. Sit down and let\'s talk about the other six.',
    steps: [
      'Walk over. I\'ve already run your numbers -- the numbers told me everything, including two things you haven\'t.',
      'Higher LVR or lower interest. Picking one after we meet does not cost another action. I vanish after, which is part of the service.',
    ],
  },
  'rival-developer': {
    summary: 'You\'re reading my disclosure -- that\'s wise, in the professional sense. I show you the targets because watching you try to outbid me is, honestly, one of the few entertainments the market still offers.',
    steps: [
      'Walk over and read what I\'m acquiring next. I disclose because I can afford to.',
      'Opening that parcel after we talk does not cost another action. Buy it before I do, if you have the nerve and the cash.',
    ],
  },
  arsonist: {
    summary: 'Evening. Lovely stock you\'ve got near here. Very combustible era, Victorian timber -- the resins, see. Anyway. No reason. Just walking.',
    steps: [
      'Insure. That\'s not advice -- I don\'t give advice. It\'s an observation about the general area and its relationship with, let\'s say, thermal events.',
    ],
  },
  squatter: {
    summary: 'Adverse possession is a real doctrine -- fifteen years continuous and exclusive -- and I\'ve got a zine about it. Your vacant just got a sitting tenant, and the sitting tenant has opinions.',
    steps: [
      'If it\'s yours: remediate, which means paperwork, and then lease it so I don\'t come back. I always come back. The doctrine is very clear on this.',
    ],
  },
  policeman: {
    summary: 'Draper. Someone reported suspicious activity. Around here that\'s a range from arson to a leaf blower before 7am. I keep my own file.',
    steps: [
      'Walk over. I\'ve seen something you should know about, and I won\'t be here next shift.',
    ],
  },
  family: {
    summary: 'We\'re the Nguyen-O\'Briens -- fourteen auctions and counting. Where families like us start looking, the market follows six months later. We\'d find that funny if we could afford to.',
    steps: [
      'Walk over. We have a spreadsheet. We have TABS. Wherever we\'re circling, the rents follow.',
    ],
  },
  dog: {
    summary: 'A kelpie-cross sits at the boundary of a parcel and regards it with the focused intensity of a creature that has completed your due diligence and found it adequate.',
    steps: [
      'Walk to the mark. Banjo does not charge -- he considers the arrangement to be salaried, retroactively, in sausages.',
    ],
  },
});

// ─────────────────────────────────────────────────────────────────────
// 3. DISTRICT TRAITS — what each district feels like to invest in
// ─────────────────────────────────────────────────────────────────────

export const DISTRICT_TRAITS = Object.freeze({
  'fitzroy-north':
    'Wall-to-wall terraces on streets too narrow for a three-point turn. Corridor value here is the strongest in the city -- if you can get a run of frontage, the yield compounds faster than the gentrification complaints.',

  'carlton-east':
    'University money keeps the lights on even when the office sector is having a nervous breakdown. Rent resilience in a downturn, moderate upside in a boom, and enough heritage overlay to make every planning application an act of faith.',

  'richmond-flat':
    'Old factory bones under new money. Cheap to enter by inner-city standards, but do not confuse a low price with a low ceiling -- the warehouse conversions and mixed-use zoning mean this district develops harder than it first appears.',

  'brighton-reach':
    'Bayside prestige pricing with a four-storey height cap that means you are buying the land, not the air rights. Slow, expensive, predictable. The kind of district where your yield looks thin until you check the capital growth over a decade.',

  'docklands-quay':
    'Tower overlay, mixed-use zoning, and the kind of volatility that separates the developers from the speculators. Cheap to enter, expensive to get wrong. The harbour frontage is the play -- everything else is a holding pattern.',

  'brunswick-rise':
    'Nothing here is cheap and nothing is overpriced. The drift is positive, the zoning is permissive, and every second building is a bungalow waiting for a planning permit. A developer district disguised as a residential one.',
});

// ─────────────────────────────────────────────────────────────────────
// 4. MACRO EVENT COPY — Bloomberg terminal meets deadpan Melbourne
// ─────────────────────────────────────────────────────────────────────

export const MACRO_COUNTER_ACTION = Object.freeze({
  downturn: 'Sector-wide markdown incoming. Hold cash, cut debt, and do not start works you cannot finish on the other side.',
  'flash-flood': 'Low-lying parcels are exposed. Insure before settle or wear the loss -- council does not reimburse.',
  'interest-shock': 'Rate pain at settlement. Cut exposure, lock broker terms if you can, or just own less debt.',
  'materials-spike': 'Timber, steel, and concrete all moving at once. Start works now at the old price or wait it out -- there is no middle ground.',
});

export const MACRO_EXACT = Object.freeze({
  downturn: 'Every sector takes a 6.5% haircut before the index floor catches it. Board-wide, no exceptions.',
  'interest-shock': '1.65% on all outstanding debt. Broker terms soften it to 1.40%. Still hurts.',
  'materials-spike': 'All works quotes multiplied by 1.18. Applies to every renovation and redevelopment currently eligible.',
});

// ─────────────────────────────────────────────────────────────────────
// 5. MARKET NARRATIVE — Melbourne desk commentary, not wire service
// ─────────────────────────────────────────────────────────────────────
// These replace the `body` field in each scenario of QUARTER_BEATS.
// Structure: { beatId: { scenarioId: body } }

export const QUARTER_BEAT_BODIES = Object.freeze({
  fomc: {
    cut: 'The Governor cuts and the auction rooms fill before the ink dries. Growth names rally, the dollar slips, and every agent in the eastern suburbs starts texting their buyer list. Gold fades back as the haven trade unwinds. Everyone knew. Nobody was positioned.',
    hold: 'Martin Place says nothing new with enormous conviction. The cash rate stays, the clearance rate stays, and the carry trades survive another quarter. CBA trades sideways. The property desk goes for coffee.',
    hawk: 'The Governor hikes and the mortgage belt flinches. Serviceability calculators update overnight, high-beta crypto gets sold, and the only thing holding a bid is gold. The desk that was long growth is now long regret.',
  },
  'ai-capex': {
    beat: 'Cloud spend guides come in hot and the AI trade wakes up from its nap. NVDA leads, the ASX tech names draft behind it, and even oil catches a whisper bid on the power-demand story. REA prints in sympathy -- if the tech money is flowing, the inner-east listings follow.',
    digest: 'Spend holds but Collins Street is watching margins now, not revenue. The AI complex pauses to digest the run. Nobody is selling, nobody is adding. Purgatory with a positive bias.',
    pause: 'One hyperscaler puts a cluster on hold and the whole complex trades like it is 2022 again. Multiple compression across every name with "AI" in the deck. The analyst notes from Martin Place will be brutal.',
  },
  opec: {
    'cut-supply': 'Barrels pulled, crude jumps, and every builder in Melbourne adds a fuel surcharge by Thursday. The inflation hawks come out of their holes. Good for the commodity names on the ASX, bad for everyone whose feasibility assumed diesel at last quarter\'s price.',
    'hold-quota': 'Compliance is mixed, which is OPEC-speak for "we will cheat later." Crude chops around range. The oil desk yawns. No new inflation signal, no new trade. Melbourne construction costs hold steady, which is the only line in this that matters to your build.',
    unwind: 'Supply coming back. Crude gets sold, transport costs ease, and the materials spike loses its tail. Growth names catch a bid on the falling-input-cost thesis. Wozza\'s next quote will be five percent lower, which he will describe as a personal favour.',
  },
  harvest: {
    frost: 'Brazilian frost does exactly what frost does to arabica. Coffee spikes, and every seven-dollar latte in Collingwood carries the cost forward by Tuesday. Food inflation ticks up, gold catches a mild bid, and the baristas feel vindicated.',
    normal: 'Harvest in line, warehouses normal, nothing to see. Coffee fades back to range and Smith Street keeps charging seven dollars anyway, which was never about the beans.',
    glut: 'Record crop and the warehouses cannot take any more. Arabica gets sold, consumer staples catch a small bid, and somewhere a Fitzroy roaster is crying into an espresso. Melbourne coffee prices will not move. They never move. The seven dollars is structural.',
  },
});

export const YEAR_BEAT_BODIES = Object.freeze({
  regime: {
    boom: 'Growth holds, inflation cools, and the clearance rate pushes ninety. Risk-on for the year overlay. The recession callers go quiet. The bears do not go extinct, they just stop returning Terry\'s calls.',
    stag: 'Sticky goods prices meet slowing growth and nobody has a playbook for this. Gold and BHP lead the year. Duration and crypto lag. The clearance rate drifts into the sixties and the agents start calling it a "buyers\' market," which is what agents say when it is not their market.',
    recession: 'Labour market cracks and the haven trade lights up. Gold, cash, quality duration. Cyclicals and crypto get sold like there is no tomorrow, which is, in fairness, the concern. The clearance rate drops below fifty and the auction rooms serve better biscuits, which Terry considers a leading indicator.',
  },
});

// ─────────────────────────────────────────────────────────────────────
// 6. SETTLEMENT COPY — accountant's statement with personality
// ─────────────────────────────────────────────────────────────────────

export const SETTLEMENT_LABELS = Object.freeze({
  rent: 'Rent collected',
  opex: 'Operating costs',
  interest: 'Interest charged',
  overdraft: 'Overdraft interest',
  net: 'Net income',
  cash: 'Cash position',
  nav: 'Net asset value',
});

/** Replaces the settlement presenter header. */
export const SETTLEMENT_HEADER = 'Books closed';

/** End-of-quarter flavour lines, picked by quarter number mod length. */
export const SETTLEMENT_FLAVOUR = Object.freeze([
  'The rent is in. The damage is done.',
  'Another quarter survived. The portfolio lives.',
  'Markets moved. Your corridor either held the price or explained why Frank underlined patience.',
  'Interest charged. Rent collected. The ledger does not lie.',
  'Settlement complete. Your accountant would approve. Probably.',
  'Quarter closed. Terry is already on the phone about next quarter.',
  'Books balanced. The ledger does not negotiate.',
  'Settled. The market has spoken, and it was not kind.',
  'Rent in, costs out, and whatever is left is yours.',
  'Another quarter in the books. The city does not wait.',
  'The ledger is sealed. What you did not earn, you owe.',
  'Quarter done. If it hurts, you leveraged too hard.',
  'Closed. The rent covers the interest or it does not.',
  'Settled. Vinh ran the numbers and made a small noise. Draw your own conclusions.',
  'Books shut. The corridor premium paid for itself, or explained at length why not.',
  'Quarter settled. The gap between you and the rival just changed.',
  'Done. The works cost what they cost. The rent is what it is.',
  'Sealed. If your net is negative, the next quarter starts at a deficit.',
  'Settled. Heritage stock does not care about your growth targets.',
  'Quarter closed. The corridor premium either justified itself or it did not.',
]);

// ─────────────────────────────────────────────────────────────────────
// 7. TOAST MESSAGES — short, punchy, Melbourne-dry
// ─────────────────────────────────────────────────────────────────────

export const TOAST_MESSAGES = Object.freeze({

  // ── Acquisition ──
  acquired: Object.freeze([
    'Yours. Stamp duty hurts, doesn\'t it.',
    'Acquired. The vendor thanks you for your money.',
    'Title transferred. Terry is already texting the next vendor.',
    'Bought. The body corp fees start now.',
    'Bought. Wozza\'s ute appeared in the driveway before the ink dried.',
    'Acquired. Frank would have squinted at the price, then nodded.',
    'Yours. The building inspection said "adequate."',
    'Bought. The neighbours are already watching.',
    'Terry: "Beautiful stock. Unbeatable potential. I would have bid myself, but I am working for you, so."',
    'Vinh: "The DTI is still under control. For now. We will revisit at settlement."',
    'Terry: "Signed. Sealed. My cut comes off the top, which you knew."',
  ]),

  // ── Renovation ──
  renovateStarted: Object.freeze([
    'Dust sheets up. The tiler says Monday, which means Thursday.',
    'Wozza\'s ute is in the driveway. The neighbours already know.',
    'Works started. Daz is here. Nobody asked for Daz, but Daz is here.',
    'Reno kicked off. The skip appeared from somewhere and Wozza is not taking questions.',
    'Demolition started. The heritage adviser has been told it\'s maintenance.',
    'Works live. The sparky starts Monday. The plasterer starts when the sparky finishes. The sparky never finishes.',
    'Wozza: "She\'ll be right. Thursday. Maybe Friday. The stumps are fine."',
    'Wozza: "Cash preferred, by the way. The invoice is a formality."',
  ]),
  renovateComplete: Object.freeze([
    'Done. Passed inspection, which surprised Wozza, Daz, and the inspector.',
    'Works complete. The plasterer actually finished.',
    'Reno sealed. The building inspector shook Wozza\'s hand like they\'d been through something together.',
    'Done. Looks better than it did, anyway.',
    'Complete. Saskia says it photographs well, which from Saskia is a standing ovation.',
    'Renovation done. The neighbours have formally objected to how it makes their place look.',
    'Wozza: "Told you Thursday. What day is it. Thursday."',
    'Saskia: "The proportions are adequate. I would have done it differently, but I always would."',
  ]),

  // ── Redevelopment ──
  redevelopStarted: Object.freeze([
    'Demolition crew is on site. The pigeons are furious.',
    'Planning permit exercised. No turning back and no turning left -- Saskia checked the setbacks.',
    'Demo day. The old stock is now rubble and the rubble is Wozza\'s problem.',
    'Permit live. The crane arrives next quarter and the entire street will have an opinion about the crane.',
    'Wrecking ball. Whatever that building was, it is now fill and memory.',
    'Redeveloping. The hoardings are up and the artist impression is optimistic.',
    'Saskia: "The brief is not cheap but the render will be straight and council will not knock it back."',
  ]),
  redevelopComplete: Object.freeze([
    'Built. The architect is already billing for variations.',
    'New stock live. Saskia wants it photographed before anyone moves furniture.',
    'Construction finished. The occupancy certificate smells like fresh paint and compromise.',
    'Complete. The view from the top floor is worth it.',
    'Done. The building exists and so does the variation claim from Wozza.',
    'New stock on the register. The corridor just recalculated.',
  ]),

  // ── Tenant ──
  tenantPlaced: Object.freeze([
    'Tenant signed. Terry assures you they are wonderful. Terry assures everyone of everything.',
    'Leased. Someone else is paying your mortgage.',
    'Tenant signed. They asked about the hot water. They always ask about the hot water.',
    'Occupied. The yield is no longer theoretical.',
    'Leased up. Vinh\'s spreadsheet just turned a different colour.',
    'Tenant in. Try not to lose them -- VCAT is slower than the vacancy.',
  ]),
  tenantLeft: Object.freeze([
    'Tenant vacated. The fridge is theirs, the mark on the wall is yours.',
    'Vacancy. Possum is already taking an interest.',
    'Tenant gone. The holding cost starts its clock.',
    'Empty. Another quarter of paying the mortgage yourself.',
    'Vacant. Trevor walks past, notices, says nothing. That is worse.',
  ]),
  tenantArrears: Object.freeze([
    'Rent at risk. The tenant has gone quiet, which is not the quiet you wanted.',
    'Payment warning. This quarter\'s rent is a conversation, not a deposit.',
    'Arrears notice. VCAT is an option you do not want and they know that.',
    'Late payment. The yield is aspirational, as Terry would say.',
    'Collection issue. The hot water complaint is suddenly a negotiating position.',
  ]),

  // ── Divestment ──
  divested: Object.freeze([
    'Sold. Cash landed.',
    'Divested. The market gave you what it gave you.',
    'Gone. The holding is off the books.',
    'Off the books. The stamp duty was sunk anyway.',
    'Sold. Someone else\'s problem now.',
    'Divested at market.',
    'Sold. The price is the price.',
    'Divested. The books record the proceeds.',
  ]),

  // ── Construction ──
  constructionStarted: Object.freeze([
    'Foundations underway. Four quarters of zero rent and full faith.',
    'Slab down. Daz signed it in the wet concrete. Nobody asked Daz to sign the slab.',
    'Steel going up. The crane has opinions about the wind.',
    'Site fenced. The hoardings have an artist impression that Saskia calls aspirational.',
  ]),
  constructionDelayed: Object.freeze([
    'Delay on site. The subbies blame the rain, the rain blames the subbies.',
    'Construction setback. Wozza\'s explanation involves a cousin and a skip and you have stopped asking.',
    'Works delayed. The council inspector found something interesting, which is never the good interesting.',
    'Site accident. The completion date has moved, and so has Wozza\'s estimate.',
    'Wozza: "Look, the rain is not my fault. The concrete is not my fault. The timeline is also not my fault."',
  ]),

  // ── Rival ──
  rivalAcquired: Object.freeze([
    'Petridis just bought. He sent the vendor lilies.',
    'The rival settled in eleven days. You were still reading the Section 32.',
    'Rival expanding. That pleasant smile just acquired your target parcel.',
    'They bought. You did not. Petridis says "close" is a lovely word.',
    'Rival move. Check the disclosure -- the next one is already on his list.',
    'Petridis: "Lovely parcel. I settled in eleven days. How long do you take?"',
    'Petridis: "I noticed you were interested. I was interested first."',
    'Petridis: "No hard feelings. I disclose because I can afford to."',
  ]),
  rivalBlocked: Object.freeze([
    'You denied the rival. He recalculates, pleasantly.',
    'Blocked. Petridis sends his regards and a surveyor to the next one.',
    'Rival denied. One fewer parcel on his map. He has other maps.',
    'Pre-empted. The disclosure told you where they were going.',
    'Petridis: "Well played. I will be in the next street."',
  ]),

  // ── Market ──
  marketUp: Object.freeze([
    'Sector bid. Clearance rates climbing.',
    'Board\'s green. Even that Docklands place looks clever from here.',
    'Index climbing. Terry\'s calling it a strong market, which means he\'s raising the guide.',
    'Prices firming. The auction crowds are back and the biscuits are getting worse.',
    'Bull quarter. The agents wear the good suit.',
    'Terry: "Market is running. I love a running market. Everything sells and everyone is grateful."',
  ]),
  marketDown: Object.freeze([
    'Sector sold. The agents have started saying "buyers\' market."',
    'Market off. The clearance rate drops and the biscuits improve.',
    'Index slipping. Leverage amplifies this, which Vinh mentioned at the time.',
    'Prices softening. The campaigns are stretching into their fifth week.',
    'Bear quarter. The leveraged feel it most, which is everybody.',
    'Vinh: "Rates are not your friend this quarter. Refinance now or refinance at worse."',
  ]),

  // ── Insurance and hazard ──
  insured: Object.freeze([
    'Insured. Premium deducted. Draper approves.',
    'Covered. Fire and flood, which in this city is not theoretical.',
    'Insurance bound. Trevor is not the only thermal event in Melbourne.',
    'Draper: "Insured. Good. Sleep comes easier, and the paperwork comes faster if something happens."',
  ]),
  fireWarning: Object.freeze([
    'Fire risk on the board. Trevor was in the area.',
    'Smoke signal. Uninsured stock is an invitation, not a holding.',
    'Arsonist adjacent. Draper has her notebook out.',
    'Trevor: "Evening. Lovely stock you have got near here. Very combustible era, Victorian timber. Anyway. No reason."',
    'Draper: "Walk over. I have seen something you should know about, and I will not be here next shift."',
  ]),
  floodWarning: Object.freeze([
    'Flood watch for low-lying parcels. Richmond remembers.',
    'Flash flood forecast. Check your exposure before the slab gives you its opinion.',
    'Water rising. Insure the low blocks or learn the meaning of flood-flat.',
  ]),
  damaged: Object.freeze([
    'Wozza: "I can fix that. It will cost you, and the cost is also a surprise, but less of one than the damage."',
    'Hit. The insurer uses the word "interesting," which is never the good interesting.',
    'Property damaged. The insured recover. The uninsured are case studies.',
  ]),

  // ── Auction ──
  auctionWon: Object.freeze([
    'Under the hammer. Yours.',
    'Sold to the bidder. Welcome to the register.',
    'Auction won. Stamp duty and settlement follow.',
    'Hammer falls your way. Terry winks. You pretend not to see.',
    'Terry: "Strong result. The underbidder cried. I love this job."',
  ]),
  auctionLost: Object.freeze([
    'Outbid. Petridis\'s people waited in the car again.',
    'Passed in. The reserve was above your limit, which Terry swears is unusual.',
    'Lost it. The underbidder\'s consolation is brunch.',
    'Auction gone. Terry says another one will come. Terry always says that.',
    'Terry: "Look, I said it was competitive. My advice is the same as my fee -- worth it."',
  ]),

  // ── Planning and lobby ──
  lobbyPass: Object.freeze([
    'Height approved. Saskia says you\'re welcome.',
    'Permit granted. The council remembers generosity.',
    'Council says yes. Do not ask twice.',
    'Planning pass. The heritage adviser has moved on to objecting to someone else.',
    'Saskia: "Approved. The elevation was persuasive. I am always persuasive."',
  ]),
  consolidated: Object.freeze([
    'Lots bolted. One vacant pad.',
    'Titles joined. The cottages are memory.',
    'Amalgamated. Rebuild the double lot.',
    'Two deeds, one pad. Council will like the frontage.',
    'Consolidated. Site cleared. The next form is the point.',
  ]),
  subdivided: Object.freeze([
    'Pad split. Two titles again.',
    'Subdivided. The pair is back on the register.',
    'Unbolted. Two lots, two problems.',
  ]),

  lobbyFail: Object.freeze([
    'Refused. The planning fee is gone either way.',
    'Council knocked it back. The objection period won this round.',
    'Permit denied. The heritage overlay wins this round.',
    'Planning fail. Saskia is billing for the elevations. She always bills.',
  ]),

  // ── People ──
  personArrived: Object.freeze([
    'New face in the district. They will not wait forever.',
    'Someone worth meeting just turned up. One action to find out why.',
    'Someone just showed up on the street. They look like they know something.',
    'Draper spotted someone. She spots everyone, but this one she mentioned.',
    'Movement near your holdings. Might be an opportunity, might be Trevor.',
  ]),
  personLeft: Object.freeze([
    'Gone. Whatever they knew, they took it with them.',
    'Walked off. They had better things to do, and now so do you.',
    'Gone. That intel walked away with them.',
    'Missed them. Terry says they went east. Terry says a lot of things.',
    'Window closed. Banjo watched them go and then looked at you. Draw your own conclusions.',
  ]),

  // ── Corridor ──
  corridorFormed: Object.freeze([
    'Corridor forming. Frank kept a map like this. You are starting to understand why.',
    'Adjacent holding connected. Frank\'s map would approve.',
    'Run forming. Each link adds to the corridor premium.',
    'Corridor sealed. Petridis will have noticed — he notices corridors the way Banjo notices fences.',
    'Two holdings linked. The premium is live and the rival is recalculating.',
    'Connected. The tram line between your holdings now earns its keep.',
  ]),

  // ── Reserve / civic ──
  reserveGift: Object.freeze([
    'Gift placed. The council notices generosity.',
    'Donated. The reserve looks better and so do your lobby odds.',
    'Civic contribution noted. The planning counter remembers.',
    'Installed. The park has a new bench and you have a new friend at council.',
    'Banjo approves of the bench. Banjo has sat on the bench. The bench is now his.',
    'Wozza bolted it down himself. The invoice is a favour, which he will mention.',
    'Native planting in. Saskia would approve, which she communicates by not objecting.',
  ]),

  // ── Financial ──
  overdraftEntered: Object.freeze([
    'Overdraft drawn. The interest rate is punitive, which is a word banks use for educational.',
    'Cash negative. Every quarter costs more now.',
    'Into overdraft. Vinh would like a word, and the word is refinance.',
    'Vinh: "I have seventeen lenders on the panel. Eleven of them will pretend they have never met you. Sit down."',
  ]),
  debtStress: Object.freeze([
    'Debt stress warning. The loan book is getting heavy.',
    'Leverage high. A downturn here would be biographical.',
    'Gearing stretched. Vinh\'s spreadsheet has changed colour again.',
    'Vinh: "The serviceability test is getting creative. I do not like creative."',
  ]),
});

// ─────────────────────────────────────────────────────────────────────
// 8. LOADING MESSAGES — Melbourne property market humour, under 50 chars
// ─────────────────────────────────────────────────────────────────────

export const LOADING_MESSAGES = Object.freeze([
  'Surveying the lot boundaries...',
  'Checking the heritage overlay...',
  'Negotiating with the body corp...',
  'Reading the Section 32...',
  'Waiting for council approval...',
  'Measuring the setback requirements...',
  'Appraising the terrace stock...',
  'Calculating stamp duty...',
  'Inspecting the sub-floor stumps...',
  'Rezoning the activity centre...',
  'Drafting the vendor statement...',
  'Scheduling the building inspection...',
  'Pouring the slab on spec...',
  'Arguing with the heritage adviser...',
  'Filing the planning permit...',
  'Counting the auction crowd...',
  'Checking the REIV clearance rate...',
  'Reviewing the covenant...',
  'Assessing the easement...',
  'Calibrating the corridor premium...',
  'Negative gearing the portfolio...',
  'Subdividing the rear yard...',
  'Engaging the quantity surveyor...',
  'Disputing the land tax notice...',
  'Briefing the conveyancer...',
  'Quoting the chippy...',
  'Lodging the VCAT appeal...',
  'Adjusting for the rate notice...',
  'Pricing the dual-occ potential...',
  'Estimating the demolition cost...',
]);

// ─────────────────────────────────────────────────────────────────────
// 9. GRADE LABELS — end-of-run performance descriptions
// ─────────────────────────────────────────────────────────────────────

export const GRADE_LABELS = Object.freeze({
  S: 'City-maker',
  A: 'Compounding',
  B: 'Ahead of the market',
  C: 'Holding steady',
  D: 'Behind the curve',
  E: 'Unwound',
});

export const RESULT_HEADLINES = Object.freeze({
  won: 'You out-built the rival.',
  lost: 'The rival out-built you.',
});

// ─────────────────────────────────────────────────────────────────────
// 10. INTERACTION LABELS — what meeting each person type does
// ─────────────────────────────────────────────────────────────────────

export const INTERACTION_LABELS = Object.freeze({
  'hire-candidate': 'Walk over once, then hire them for up to three projects with no further action.',
  'broker-offer': 'Vinh has two offers -- higher LVR or lower interest. Meet once, then pick for free. He leaves.',
  'rival-disclosure': 'Petridis has disclosed his targets. Walk over, then open the named parcel for no action.',
  'pending-fire': 'Trevor was in the area. Insure the threatened holding before settlement.',
  'pending-occupation': 'Possum has moved in. Remediate to clear, then lease to lock it.',
  'patrol-intel': 'Draper knows something about this block. Walk over.',
  'family-signal': 'The Nguyen-O\'Briens are circling with the laser measurer. Walk over for the demand read.',
  'dog-find-pending': 'Banjo is sitting on something with intent. Walk to the mark -- finds are free.',
});

// ─────────────────────────────────────────────────────────────────────
// 11. PROFESSION LABELS — for hire contract display
// ─────────────────────────────────────────────────────────────────────

export const PROFESSION_LABELS = Object.freeze({
  'cheap-builder': 'Builder (cost brief)',
  architect: 'Architect (design brief)',
});

// ─────────────────────────────────────────────────────────────────────
// 12. OWNER LABELS — holding ownership display
// ─────────────────────────────────────────────────────────────────────

export const OWNER_LABELS = Object.freeze({
  player: 'Your holding',
  rival: 'Rival holding',
});

// ─────────────────────────────────────────────────────────────────────
// 13. OPERATOR REGISTER LINES — character descriptions for operator select
// ─────────────────────────────────────────────────────────────────────

export const OPERATOR_REGISTERS = Object.freeze({
  underwriter: 'Slow money, safe money, borrowed money. The conservative default -- you will never blow up, but you will never surprise anyone either.',
  auctioneer: 'Information and tempo over capital. Sees further than the rest and wins the ties that matter. Starts with less cash because knowledge is leverage.',
  builder: 'Develops harder, faster, and cheaper, and pays for all three with defect risk. The cowboy play -- enormous upside when it works, enormous remediation bill when it does not.',
  'heritage-trust': 'Compounds by not knocking things down. Heritage stock appreciates under their care. Cannot build above the original cap, which is either a constraint or a philosophy.',
  syndicate: 'Cooperative play with a betrayal penalty. Opens with a pact offer and profits more from alliances, but defection costs double. Trust is a balance sheet item.',
  liquidator: 'Thin, fast, always trading. No agent fee on divestment and an extra action per quarter. Starts with less cash because the churn engine does not need a war chest.',
  planner: 'Plays the overlay system instead of the market. Lobby succeeds once per run and sees zoning from the start without paying for a survey. The bureaucrat\'s edge.',
  absentee: 'Most capital, least agency. One fewer action per quarter but rents run ten percent higher and the opening cash makes up for the lost tempo. The passive income play.',
});

// ─────────────────────────────────────────────────────────────────────
// 14. RIVAL POLICY BLURBS — what each AI strategy actually does
// ─────────────────────────────────────────────────────────────────────

export const RIVAL_BLURBS = Object.freeze({
  value: 'Buys the highest running yield on the board and holds it. Does not chase forecasts, does not speculate. The boring strategy that quietly compounds while you are leveraged to the ceiling.',
  momentum: 'Follows the strongest published sector forecast, whatever it costs. Overpays in a bull market, gets caught in a downturn. Predictable in a way that is exploitable if you are watching.',
  civic: 'Builds corridors along the tram lines and lets adjacency compound. Slow to start, devastating if it gets a run. Deny the frontage parcels early or spend the rest of the game catching up.',
});

// ─────────────────────────────────────────────────────────────────────
// 15. EVENT FORECAST HEADLINES — punchier versions
// ─────────────────────────────────────────────────────────────────────

export const EVENT_HEADLINES = Object.freeze({
  auction: 'Auction on this block',
  downturn: 'Market dip',
  'flash-flood': 'Flood watch',
  'interest-shock': 'Rates just jumped',
  'materials-spike': 'Builds just got expensive',
  fire: 'Fire risk on this place',
  'tenant-arrears': 'Rent might not land',
});

export const EVENT_DETAILS = Object.freeze({
  downturn: 'Every sector drops 6.5% before it bottoms out.',
  'flash-flood': 'Low-lying places can take damage when the quarter closes.',
  'interest-shock': 'Interest at settle goes to 1.65%. A broker can cut that to 1.40%.',
  'materials-spike': 'Reno and redevelop quotes are 18% higher while this is on.',
  fire: 'Insure it before settle, or you can lose value and time.',
  'tenant-arrears': 'This place pays $0 rent at settle if they skip.',
});

const WET_ROOM_ARREARS_COPY = Object.freeze({
  kitchen: Object.freeze({
    headline: 'Kitchen wrecked — rent might not land',
    detail: 'Kitchen wrecked — they skip more often until you upgrade it.',
  }),
  bathroom: Object.freeze({
    headline: 'Bathroom wrecked — rent might not land',
    detail: 'Bathroom wrecked — they skip more often until you upgrade it.',
  }),
});

/** Per-event arrears copy when factors/payload.roomId names a wrecked wet room. */
export function tenantArrearsCopy(roomId) {
  return WET_ROOM_ARREARS_COPY[roomId] ?? Object.freeze({
    headline: EVENT_HEADLINES['tenant-arrears'],
    detail: EVENT_DETAILS['tenant-arrears'],
  });
}

/**
 * Desktop rail packs every tenant-arrears row. Name the room only when every
 * event in the pack shares the same payload.roomId. Mixed / generic packs stay
 * “Rent might not land · N places”.
 */
export function arrearsGroupHeadline(events) {
  const list = Array.isArray(events) ? events : [];
  const generic = EVENT_HEADLINES['tenant-arrears'];
  if (!list.length) return generic;
  const roomIds = list.map((event) => event.payload?.roomId ?? event.factors?.roomId ?? null);
  const named = roomIds[0] === 'kitchen' || roomIds[0] === 'bathroom';
  const unanimous = named && roomIds.every((id) => id === roomIds[0]);
  const headline = unanimous
    ? tenantArrearsCopy(roomIds[0]).headline
    : generic;
  return list.length > 1 ? `${headline} · ${list.length} places` : headline;
}

export const EVENT_LOCKED_BODY =
  'You can see what\'s coming. Open Town Hall and grab a notice if you want the exact numbers.';

export const EVENT_EMPTY_BODY = 'Nothing hitting this quarter.';

// ─────────────────────────────────────────────────────────────────────
// 16. DAILY MARKET TICKER COPY — Melbourne desk commentary
// ─────────────────────────────────────────────────────────────────────

export const DAILY_TICKER_COPY = Object.freeze({
  NVDA: Object.freeze([
    { headline: 'NVDA -- data-centre GPUs sold out through the quarter. The ASX tech basket lifts in sympathy and REA\'s cloud bill goes up, which the agents pass on to you.', kind: 'company' },
    { headline: 'NVDA -- China licence rumour circulating. The book is mixed and the Collins Street desk is nervous.', kind: 'company' },
    { headline: 'NVDA -- foundry costs guiding higher. Margins are the new story, not revenue. The AI infrastructure trade reprices from Melbourne to Mountain View.', kind: 'financials' },
  ]),
  AAPL: Object.freeze([
    { headline: 'AAPL -- services revenue run-rate beats. The installed base keeps paying, which is a sentence Vinh has used about mortgages.', kind: 'financials' },
    { headline: 'AAPL -- iPhone channel checks in line. No surprise, no trade. The JB Hi-Fi floor staff saw this in December.', kind: 'company' },
    { headline: 'AAPL -- EU App Store fine chatter. Brussels is expensive this quarter. The regulatory-risk trade has a new postcode.', kind: 'company' },
  ]),
  MSFT: Object.freeze([
    { headline: 'MSFT -- Azure AI attach rate printed hot. Every enterprise wants a copilot. The ASX tech names draft behind it.', kind: 'financials' },
    { headline: 'MSFT -- OpenAI commercial terms reaffirmed. The partnership holds, for now.', kind: 'company' },
    { headline: 'MSFT -- capex digestion weighing on the multiple. Spend now, earn later, hope always. Collins Street updates the models and goes for a long lunch.', kind: 'financials' },
  ]),
  AMZN: Object.freeze([
    { headline: 'AMZN -- AWS reacceleration prints. Cloud is back and Collins Street is relieved.', kind: 'financials' },
    { headline: 'AMZN -- Prime fee hike sticks. The consumer complains and pays.', kind: 'company' },
    { headline: 'AMZN -- labour action at two fulfilment hubs. Last-mile costs are someone else\'s problem, which in property means your tenant\'s.', kind: 'company' },
  ]),
  GOOGL: Object.freeze([
    { headline: 'GOOGL -- search and YouTube ads both beat. The advertising machine does not stop, and neither does the REA spend.', kind: 'financials' },
    { headline: 'GOOGL -- antitrust remedy narrower than feared. The lawyers earned their retainer, and the REA ad budget stays where it is.', kind: 'company' },
    { headline: 'GOOGL -- cloud mix lags Azure for a session. Second place is still enormously profitable.', kind: 'financials' },
  ]),
  META: Object.freeze([
    { headline: 'META -- Reels ads filling above plan. Short-form video is printing money. The attention economy has a new landlord.', kind: 'financials' },
    { headline: 'META -- Reality Labs spend held flat. The metaverse costs what it costs, which is more than a Docklands penthouse with a worse view.', kind: 'company' },
    { headline: 'META -- engagement dips in two geos. The attention economy has competition. So does your rental listing.', kind: 'company' },
  ]),
  TSLA: Object.freeze([
    { headline: 'TSLA -- deliveries surprise to the upside. The factory floor outperformed the stock.', kind: 'financials' },
    { headline: 'TSLA -- autonomy update staged across two markets. The thesis is either imminent or eternal. Collins Street updates the model and goes for a long lunch.', kind: 'company' },
    { headline: 'TSLA -- overnight price cut in China. Margin for market share, the oldest trade in the book.', kind: 'company' },
  ]),
  BTC: Object.freeze([
    { headline: 'BTC -- spot ETF prints a second straight inflow day. Institutional money arriving, like a Collingwood gentrifier with a deposit.', kind: 'flow' },
    { headline: 'BTC -- miner hash-price steady. The machines keep running, and the Docklands co-working space that accepts BTC for rent keeps not mentioning it.', kind: 'company' },
    { headline: 'BTC -- leverage flush on perps. The degens got liquidated and the spot bid held. Melbourne OTC volume spiked at the session low.', kind: 'flow' },
  ]),
  ETH: Object.freeze([
    { headline: 'ETH -- staking queue shortens. Yield compression is the quiet story, and Vinh knows yield compression when he sees it.', kind: 'flow' },
    { headline: 'ETH -- L2 fee share in line. The rollup economy ticks over. The Collins Street crypto desk yawns and checks the staking dashboard.', kind: 'company' },
    { headline: 'ETH -- unlock calendar weighing on the tape. Supply is not a rumour, it is a schedule, and the Melbourne OTC desks are already pricing it.', kind: 'flow' },
  ]),
  SOL: Object.freeze([
    { headline: 'SOL -- DEX volumes hit a new local high. On-chain activity is real, not just noise — the Collingwood crypto crowd is minting again.', kind: 'flow' },
    { headline: 'SOL -- post-mortem on a nineteen-minute outage. Nineteen minutes is an eternity in DeFi and an unremarkable delay on the Sandringham line.', kind: 'company' },
    { headline: 'SOL -- ETF filing chatter only. The paperwork exists, the product does not. Melbourne planning permits take longer.', kind: 'flow' },
  ]),
  XAU: Object.freeze([
    { headline: 'XAU -- real yields slip four basis points. Bullion catches a bid in the quiet.', kind: 'macro' },
    { headline: 'XAU -- official-sector buying rumoured but unconfirmed. Central banks do not announce. The RBA does not comment.', kind: 'flow' },
    { headline: 'XAU -- stronger greenback trims the metal. The inverse correlation holds, and the Aussie dollar feels it first.', kind: 'macro' },
  ]),
  CL: Object.freeze([
    { headline: 'CL -- EIA draw larger than consensus. The physical market is tighter than the paper market. Wozza adds a fuel surcharge.', kind: 'macro' },
    { headline: 'CL -- tanker rates quiet. Nothing on the water. Construction diesel holds.', kind: 'flow' },
    { headline: 'CL -- demand scare from two PMI prints. Manufacturing is not buying barrels. Your build costs exhale.', kind: 'macro' },
  ]),
  KC: Object.freeze([
    { headline: 'KC -- Minas weather desk flags frost risk. Every specialty roaster in Melbourne starts hedging with their facial expression.', kind: 'macro' },
    { headline: 'KC -- certified stocks unchanged. The warehouses are what they are. Smith Street charges seven dollars regardless.', kind: 'flow' },
    { headline: 'KC -- Vietnam robusta hedge selling. The other coffee market has its own problems. Melbourne\'s seven dollars is structural.', kind: 'macro' },
  ]),
  BHP: Object.freeze([
    { headline: 'BHP -- iron ore demand holds and the mining money stays in Melbourne. Every cent on the ore price is a suburb\'s mood.', kind: 'macro' },
    { headline: 'BHP -- guidance revision. The resource trade reprices and Perth watches, but the dividends are spent in Toorak.', kind: 'financials' },
    { headline: 'BHP -- China stimulus chatter lifts the commodity basket. When BHP moves, the Melbourne wealth effect follows six months later.', kind: 'macro' },
  ]),
  CBA: Object.freeze([
    { headline: 'CBA -- net interest margin in line. The mortgage book is performing, which means your tenants are still paying their own loans, which means they are still renting yours.', kind: 'financials' },
    { headline: 'CBA -- bad debts ticking up in the property book. The serviceability cliff has names on it now.', kind: 'financials' },
    { headline: 'CBA -- home loan approvals data shows the market where it already knew it was. The clearance rate confirmed it last Saturday.', kind: 'macro' },
  ]),
  REA: Object.freeze([
    { headline: 'REA -- listing volumes beat the forecast. Every agent in the eastern suburbs just checked their commission calculator.', kind: 'financials' },
    { headline: 'REA -- premium listings driving ARPU higher. The vendors are paying for the photos, which means they are serious, which means they are scared.', kind: 'financials' },
    { headline: 'REA -- search traffic spiking in the inner north. Where the browsers go, the bidders follow two Saturdays later.', kind: 'flow' },
  ]),
});

// ─────────────────────────────────────────────────────────────────────
// 17. ROOM CONDITION LABELS — property condition descriptions
// ─────────────────────────────────────────────────────────────────────

export const ROOM_CONDITION_LABELS = Object.freeze({
  veryWorn: 'Needs everything',
  worn: 'Worn through',
  tired: 'Showing its age',
  ok: 'Presentable',
  good: 'Solid condition',
});

// ─────────────────────────────────────────────────────────────────────
// 18. ROOM FINISH DISPLAY NAMES
// ─────────────────────────────────────────────────────────────────────

export const ROOM_FINISH_NAMES = Object.freeze({
  luxury: 'Art Deco',
  deluxe: 'Deluxe',
  basic: 'Basic',
  tired: 'Original',
});

// ─────────────────────────────────────────────────────────────────────
// 19. DOG FIND DESCRIPTIONS — what the dog found
// ─────────────────────────────────────────────────────────────────────

export const DOG_FIND_TEXT = Object.freeze({
  'lost-auction-paddle': 'Lost auction paddle. The dog is sitting with it, looking pleased.',
  'builders-dropped-plans': 'Builder\'s dropped plans. The dog is carrying the roll like a stick.',
  'council-time-capsule': 'Council time capsule. The dog is digging by the rotunda with intent.',
  'tram-ticket-from-nowhere': 'Tram ticket from nowhere. The dog is waiting at the interchange.',
});

/** What the find is worth in play. Flavour finds say so. */
export const DOG_FIND_PAYOFF = Object.freeze({
  'lost-auction-paddle': 'You now know the passed-in asking on that lot. Use it when you bid or buy.',
  'builders-dropped-plans': 'A peek at whether Wozza’s next works roll on that site sits in the defect band. It does not change the roll.',
  'council-time-capsule': '+4 actions this quarter. The capsule bought you time.',
  'tram-ticket-from-nowhere': 'Paints the trams blue and gold. Cosmetic only.',
});

// ─────────────────────────────────────────────────────────────────────
// 20. HELP / HOW TO PLAY — concise rules summary
// ─────────────────────────────────────────────────────────────────────

export const HOW_TO_PLAY_LINES = Object.freeze([
  'Your operator sets how many actions you receive each quarter. You have forty quarters to out-build the AI developer.',
  'Acquire parcels, renovate to lift condition, redevelop to climb the planning rungs.',
  'Adjacent holdings form corridors -- each link adds rent and value to both parcels.',
  'The rival discloses their next targets. Deny them by buying first.',
  'Settle ends the quarter: rent is collected, interest is charged, markets move.',
  'Divesting is free. Everything else costs an action.',
  'Walk to a person to unlock hire, terms, or intel. Walk to a property to bid, meet anyone there, or pick up shop tokens. One action.',
  'Insure before settlement if fire or flood events are active.',
  'Lobby council for planning permits -- civic favour improves the odds.',
  'The player with the higher NAV at the end of forty quarters wins.',
]);

// ─────────────────────────────────────────────────────────────────────
// 21. RESERVE CATALOG COPY — Melbourne-rate civic gifts
// ─────────────────────────────────────────────────────────────────────

export const RESERVE_BLURBS = Object.freeze({
  'blackwood-bench': 'Cast-iron frame, hardwood slats. The kind that lasts forty years.',
  'picnic-table': 'Timber top, dual side seats. Families will use this whether you like it or not.',
  'hoddle-bin': 'Council-spec steel bin. It will outlast the park.',
  'bike-hoop': 'Melbourne standard hoop pair. Cyclists will lock to a fence otherwise.',
  'drinking-fountain': 'Blackwood and brass. The kind with a dog bowl at the base.',
  'path-light': 'Low bollard, warm LED. Enough to see where you are walking.',
  'garden-beds': 'Native plantings along the path edges. Council loves this.',
  'lawn-refresh': 'Full turf and soil top-up. The reserve will look like it is maintained.',
  'pond-edge': 'Reed edge, soft bank treatment. Habitat and amenity in one line item.',
  'softfall': 'Rubber softfall pad. Insurance requires it, parents expect it.',
  'tree-planting': 'One mature plane tree or eucalypt. Shade in three years, heritage in fifty.',
});
