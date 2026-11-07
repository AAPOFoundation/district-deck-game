// District Deck — storyline and narrative framework.
// Authored content only. Nothing here is mutated at runtime, nothing here rolls dice.
// Every district is a fictionalised namesake, not the actual suburb; every character
// is an invention; every dollar figure is a game unit. Any resemblance to a real
// Melbourne property identity is a coincidence the real one would probably deny anyway.
//
// Voice contract: dry Australian deadpan. The joke never announces itself. Characters
// are property-literate — yields, overlays, corridors, permits — because everyone in
// this city is, including the dog.

import { RULES } from './content.js';

const QUARTERS_PER_YEAR = 4;

function campaignYears(quarters = RULES.quarters) {
  return Math.ceil(Math.max(1, Number(quarters) || RULES.quarters) / QUARTERS_PER_YEAR);
}

function deepFreeze(obj) {
  for (const key of Object.getOwnPropertyNames(obj)) {
    const value = obj[key];
    if (value && typeof value === 'object' && !Object.isFrozen(value)) deepFreeze(value);
  }
  return Object.freeze(obj);
}

// ---------------------------------------------------------------------------
// 1. STORYLINE — the overarching frame
// ---------------------------------------------------------------------------

export const STORYLINE = deepFreeze({
  prologue: {
    title: 'The Ledger',
    text: [
      'Frank Delacqua bought his first terrace in 1987 with a handshake and a lie about the roof, and he spent the next forty years proving that a small operator with good instincts could hold a street against anyone. He taught you everything — how to read a rising damp line, how to stand at an auction so the agent thinks you have more money than you do, how to tell a heritage overlay from a heritage excuse. Then, in June, he died at an open for inspection in Kew, mid-sentence, disputing the floor plan.',
      'He left you one boarded-up terrace in Fitzroy North, a settlement cheque that looks bigger than it is, and a ledger with a list of names. Most of the names are crossed out. One is underlined twice: Roman Petridis.',
      'Petridis sent lilies to the funeral and a surveyor the following Tuesday. His group is moving through the inner north the way water moves through a lightwell — quietly, downhill, into everything. Frank held him off for a decade with nothing but timing and spite. Now it is your ledger.',
      `You have ${RULES.quarters} quarters. ${campaignYears()} years of Melbourne weather, Melbourne auctions, and Melbourne opinions. Build something Frank would have looked at for a long time, and nodded.`,
    ],
    stakes:
      'If the money runs out, Petridis buys the ledger at the liquidation sale and frames it. He has said this to your face, pleasantly, twice.',
  },

  chapters: [
    {
      quarter: 1,
      title: 'Settlement',
      description:
        'The cheque clears, the boards come off the Fitzroy North terrace, and you discover what Frank meant by "sound, structurally, in the ways that count." First acquisitions, first walk of the districts, first coffee you pay eleven dollars for without flinching, because flinching is for people who are leaving.',
      cityMood:
        'Autumn. The planes on the boulevards are turning and the trams are full of people reading auction results like form guides. The city smells of rain on warm bluestone and someone, somewhere, is sanding floorboards.',
    },
    {
      quarter: 2,
      title: 'The Winter Book',
      description:
        'Listings thin out and the agents get honest, which in this market is a seasonal condition, like fog. The smart money buys in July from vendors whose marriages did not survive the renovation. You start hiring — a builder, a broker, opinions of varying legality.',
      cityMood:
        'Winter proper. Four o\'clock darkness, heaters in the auction rooms, breath visible at the opens. The city is not sad, exactly. It is negotiating.',
    },
    {
      quarter: 3,
      title: 'Permit Season',
      description:
        'The council discovers your plans and responds with the enthusiasm of a body that measures time in objection periods. Heritage overlays bloom like mould. Petridis, meanwhile, gets his permits in six weeks, which everyone agrees is a remarkable coincidence.',
      cityMood:
        'Late winter into early spring. Magpies are swooping the surveyors, which the surveyors have started taking personally. Somewhere in a council chamber, a shadow falls across your elevation drawings.',
    },
    {
      quarter: 4,
      title: 'Spring Carnival',
      description:
        'Auction season opens like a starting gate. Clearance rates climb, reserves detach from reality, and every nature strip in the inner north grows an A-frame board. This is the quarter that decides whether you are an operator or an anecdote.',
      cityMood:
        'Spring. Blossom on the median strips, sixty auctions a Saturday, and the particular roar a crowd makes when a three-bedroom worker\'s cottage passes its reserve by four hundred thousand dollars. The city is drunk on itself.',
    },
    {
      quarter: 5,
      title: 'Rate Day',
      description:
        'The first Tuesday of the month arrives with intent. The cash rate moves, the serviceability spreadsheets catch fire, and half the paper millionaires of Q4 discover what "variable" meant. Your loan book is either a keel or an anchor. Time to find out which.',
      cityMood:
        'Summer coming on hot. The city has the jittery brightness of a person who has had four coffees and opened their banking app. Everyone is fine. Everyone says they are fine.',
    },
    {
      quarter: 6,
      title: 'The Corridor War',
      description:
        'The pattern in Frank\'s ledger finally makes sense: he was not buying streets, he was buying connections. Districts that link, feed each other. Petridis has seen the same map — his group starts acquiring along your corridors, one title ahead of you, like a man laying track in front of your train.',
      cityMood:
        'High summer. Heat shimmer on the tram lines, cranes stacked against a white sky. The city has stopped pretending this is a market and admitted it is a board game.',
    },
    {
      quarter: 7,
      title: 'The Squeeze',
      description:
        'Materials spike, tenants fall behind, and something in your portfolio catches fire in circumstances the insurer describes as "interesting." Petridis offers to buy you out at a number designed to be almost enough. The word "almost" is doing exactly the work he intends.',
      cityMood:
        'Late summer, stretched thin. Cool-change winds slam doors in half-built frames. The city is tired the way a crowd is tired in a hard quarter — still watching, but through its fingers.',
    },
    {
      quarter: 8,
      title: 'Year Two Books',
      description:
        'The first full development cycle closes — titles settle, leases turn and the long jobs show their shape. Refinance, consolidate, and decide which corridors deserve the next eight quarters.',
      cityMood:
        'Autumn again. The planes turn on the same boulevards and the trams carry another year of auction results. The city has changed just enough to punish anyone who assumed it had not.',
    },
  ],

  epilogue: {
    navVictory: {
      frame:
        'The NAV line crosses the mark on a Tuesday, undramatically, the way real fortunes do. No confetti. A valuer\'s email, a broker\'s missed call, and a ledger that finally balances in your favour.',
      lastLine:
        'You buy the coffee. Eleven dollars. You do not flinch. You never will again, which is its own kind of loss.',
    },
    corridorMastery: {
      frame:
        'On the wall map, the districts you hold link up like a tramline drawn in ink — Fitzroy to Collingwood to Richmond, feeding each other rent and foot traffic and reasons to exist. Petridis owns towers. You own the way people move between them, which turns out to be the whole city.',
      lastLine: 'Frank was not buying streets. Neither were you.',
    },
    mandateComplete: {
      frame:
        'The mandate closes with every box ticked and a few the mandate did not know it had. The institutions that lent against your name now return your calls on the first ring. Somewhere a committee notes, with mild institutional surprise, that you delivered.',
      lastLine: 'The ledger goes on a shelf, next to Frank\'s. Two spines, one habit.',
    },
    defeat: {
      frame:
        'The receivers are polite, which is somehow worse. The portfolio breaks up at a Wednesday liquidation auction attended by everyone you have ever hired, and Petridis, who bids on the ledger and gets it for less than the reserve. He has it framed. He told you he would.',
      lastLine:
        'On the tram home you catch yourself reading the auction results. Old habit. Someone has to hold this city to account, and apparently it is still going to be you — just from the cheap seats, for now.',
    },
  },
});

// ---------------------------------------------------------------------------
// 2. CHARACTER_PROFILES — everyone you meet on the street
// ---------------------------------------------------------------------------

export const CHARACTER_PROFILES = deepFreeze({
  'property-agent': {
    name: 'Terry Mangoulias',
    shortName: 'Terry',
    title: 'Sales Consultant, Mangoulias & Sons (there are no sons)',
    personality:
      'Twenty-six years of Saturday auctions have given Terry a laminated smile and a genuine, almost tender belief that every parcel is worth whatever someone can be made to pay for it. He quotes ranges the way weather forecasters quote sunshine — aspirationally, with plausible deniability. Underneath the shine there is an operator who knows every title in the inner north and exactly which vendors are lying about why they are selling.',
    greeting:
      'Terry Mangoulias. Don\'t google me — that was a different Terry, largely. Now: are you here to buy, or are you one of those people who comes to the opens for the free biscuits? Because I count the biscuits.',
    idle: [
      'Underquoted? I prefer "aspirationally anchored."',
      'I\'ve sold that terrace three times. Twice to the same bloke. He waves now.',
      'Saturday\'s auction moved indoors. Vendor cries in the rain, apparently, and it shows up on the drone footage.',
    ],
    hire:
      'Smart move. Now — do you want on-market, off-market, or the third category, which I\'m legally required to describe with a small pause before I mention it?',
    success:
      'Sold, congratulations, and before you ask — yes, the reserve was always going to be that number. It was always going to be that number.',
    failure:
      'Passed in on a vendor bid, which stings, I won\'t dress it up. Look, between us: the vendor is the problem. The vendor is always the problem. I say that as someone whose entire income is vendors.',
    gossip: [
      'Brighton vendor knocked back three point two because the buyer "didn\'t feel right for the house." The house is vacant. The house has been vacant since March.',
      'Petridis\'s people don\'t bid at auction. They wait in the car and come in after it passes in, like seagulls, but with lanyards.',
      'A fella in Docklands listed at what he paid in 2019. We all admired his optimism. Privately. At the pub.',
      'Petridis\'s people rang about your corner parcel. I said it wasn\'t for sale. They said everything\'s for sale, it\'s a question of which decade. I\'ve started using that at listing presentations.',
      'Campaigns are running five weeks now, six with rain. I\'ve swapped the sparkling at the opens for tea. Nobody\'s said anything. That\'s how you know where the market is.',
    ],
  },

  'cheap-builder': {
    name: 'Warren "Wozza" Kelleher',
    shortName: 'Wozza',
    title: 'Builder — Kelleher Constructions & Sons (the sons are cousins)',
    personality:
      'Wozza has been building in the inner suburbs since before half of them had footpaths, and he holds the deep tradesman\'s conviction that most of what an engineer signs off on is decoration. His quotes are low, his skips are of disputed provenance, and his work passes inspection more often than the maths says it should. He is loyal to whoever pays cash and to precisely one football club.',
    greeting:
      'Wozza. Cash is grouse, invoices are possible, cheques are a hate crime. What are we knocking down, and has anyone heritage-listed it while we\'ve been standing here?',
    idle: [
      'That wall\'s not load-bearing. Probably. There\'s one way to find out and I\'ve got the bar in the ute.',
      'Skip\'s full. Whose skip? Mate, skips belong to the street. Ancient law.',
      'Smoko. Non-negotiable. The slab can cure without supervision, it\'s a slab, not a toddler.',
    ],
    hire:
      'Beauty. I\'ll bring the ute, the gear, and me cousin Daz — he\'s between certificates at the moment but his concreting is clean. I mean that. Proper clean.',
    success:
      'Done, and it passed inspection, which frankly surprised me, Daz, and the inspector, who shook me hand like we\'d been through something together. In a way we had.',
    failure:
      'Righto, small thing. The slab has come up a bit... creative. Structurally it\'s fine — well, it\'s there, it exists — but you\'ll want to call it "character" before the valuer calls it something else. There\'ll be a variation.',
    gossip: [
      'Petridis uses the big-tier builders. Lovely hoardings, terrible sausage rolls, and every sparky on the job has a lanyard and an opinion.',
      'Bloke in Richmond found a cellar under his slab. Full of bluestone. Sold the bluestone, paid for the reno. That\'s Richmond, that is.',
      'Materials rep told me timber\'s going up again. I told him where he could store it. We\'re still mates.',
      'Quoted a job Monday, prices moved Wednesday, quote expired Thursday. I write quotes in pencil now. The pencil\'s holding its value better than the steel.',
      'Petridis\'s crews have booked every crane on the corridor out to Easter. I don\'t need a crane — me and Daz have the ute and a difference of opinion about physics. But it\'s the principle.',
    ],
  },

  architect: {
    name: 'Saskia Holt',
    shortName: 'Saskia',
    title: 'Design Consultant — Holt Atelier, adjunct at RMIT, unforgiving',
    personality:
      'Saskia wears black in January, wins awards for buildings almost nobody can afford, and can save a Victorian facade or condemn one with the same small movement of her jaw. She believes concrete is honest, clients mostly are not, and the difference between architecture and building is whether the light was invited or just got in. Her fees are outrageous and her buildings appreciate faster than yours.',
    greeting:
      'Saskia Holt. Before we begin: I don\'t do "Hamptons." If the word Hamptons enters this conversation, the conversation has ended and you are paying for the hour.',
    idle: [
      'Your brief says "timeless." I\'ve seen your Pinterest board. Everything on it is from 2019. Let me work.',
      'I could save that facade. The open question is whether it deserves saving. It knows what it did.',
      'Concrete is honest. It tells you exactly what it is. I have clients who could learn from concrete.',
    ],
    hire:
      'Very well. I\'ll want the survey, the overlay maps, and one honest sentence about your budget. You may take a moment to prepare the sentence.',
    success:
      'It photographs beautifully, it works in section, and the neighbours have formally objected to how it makes their place look — so, a complete success on all three registers.',
    failure:
      'Your builder has value-engineered my void. There is now a room where the light used to be. I am billing for the light.',
    gossip: [
      'Petridis\'s towers are designed by an algorithm wearing a firm as a coat. Efficient floorplates, no soul, and the soul was never in the budget line, so technically on brief.',
      'Council knocked back a glass box in Fitzroy for "neighbourhood character." The neighbourhood in question is a car park and a man who yells at bins. Character, though. Granted.',
      'Everyone wants a plunge pool now. Nobody can tell me what they are plunging from. Grief, I assume.',
      'Petridis\'s people asked me to consult on the corridor towers. I quoted a fee with my feelings in it. They accepted without blinking, which told me everything about the budget and nothing good about the towers.',
      'Everyone is "value-engineering" now the steel has moved. The value leaves. The engineering stays. I have started billing for the difference.',
    ],
  },

  'mortgage-broker': {
    name: 'Vinh Truong',
    shortName: 'Vinh',
    title: 'Finance Consultant — Truong Capital Solutions (it is one desk, and it is enough)',
    personality:
      'Vinh has seventeen lenders on his panel and a private ranking of them by how long they take to say no. He speaks fluent serviceability, reads a rate decision the way other people read a funeral notice, and has restructured more bad loans than the banks will ever admit to writing. He is calm because he has already run your numbers, and the numbers told him everything, including two things you have not.',
    greeting:
      'Vinh Truong, finance. Seventeen lenders on the panel, and eleven of them will pretend they\'ve never met you. Sit down and let\'s talk about the other six.',
    idle: [
      'Serviceability looks fine until you run the DTI at the stressed rate. Then it looks like a letter from the bank.',
      'That bank says no. The other bank also says no, but by email, with a survey about the experience and a link to refinance with them, which takes a certain nerve.',
      'Fixed or variable. It\'s astrology with paperwork, and I say that as a believer.',
    ],
    hire:
      'Good decision. Bring your statements, your payslips, and a story we can both live with. The story matters more than people think.',
    success:
      'Approved. Don\'t ask which lender. Don\'t ask the rate on the second tranche. Just — approved. Enjoy this feeling, it comes at a margin.',
    failure:
      'The valuation came in short. Bank\'s valuer drove past at night, in the rain, and felt nothing. There\'s an appeals process, and the appeals process is also a man in a car, in the rain.',
    gossip: [
      'Petridis borrows offshore at rates that would make you cry into your comparison rate. Scale is a hell of a drug.',
      'Half the fixed-rate loans from the boom roll off this year. The banks are calling it "the maturity cliff" in the same voice they use for "restructure."',
      'A client asked me to hide a car loan. Mate, the bank can see the car. The car has a tracker. The car is a witness.',
      'The fixed-rate cliff stopped being a forecast this quarter. My phone starts at seven now. I answer with the discharge forms already open. Saves everyone a step.',
      'Three lenders repriced overnight without telling their own staff. The notification email landed after the rate did. In this industry that counts as forward guidance.',
    ],
  },

  'rival-developer': {
    name: 'Roman Petridis',
    shortName: 'Petridis',
    title: 'Principal, Petridis Property Group — your problem',
    personality:
      'Roman started with one shopfront in Port Junction and now holds more of this city than the maps admit, acquired title by title with the patience of erosion. He is unfailingly pleasant, funds at rates you cannot see, and regards sentiment as a carrying cost. Depending on the quarter he plays for yield, for momentum, or for corridors — the smile is the same in all three modes, which is the unsettling part.',
    greeting:
      'You\'re Frank\'s successor — in the professional sense, I mean, of course. A decent operator, Frank. Sentimental, though. He bought streets. I buy the reasons streets exist. Coffee? It\'s from my building.',
    idle: [
      'Hold. Extract. Exit. It isn\'t poetry, it\'s just true, which poetry rarely is.',
      'They asked my timeline at the planning hearing. I said I\'d been here since before the hearing. That was the timeline.',
      'Heritage is a fine thing. I hold three heritage buildings. They yield surprisingly well.',
    ],
    hire:
      'Hire me? That\'s charming. Genuinely. I\'ll tell that one at the Christmas party — we hold it in a building you bid on once.',
    success:
      'Another settlement. Do pass on my regards to the vendor — I believe you also made them an offer. I believe it was close. "Close" is a lovely word. It costs nothing and buys the same.',
    failure:
      'You outbid us. Enjoy it fully — I mean that. My analysts assure me the corner of the spreadsheet you\'ve just won is the corner we\'d modelled losing. Though they would say that. I pay them to.',
    gossip: [
      'The Value desk tells me your yields are improving. The Momentum desk tells me you\'re slow. The Civic desk has started marking your corridors on our map in red, which historically has meant something.',
      'Frank once beat me to a terrace in Collingwood by settling in eleven days. Eleven. I sent him a bottle of something good. He sent it back full, which hurt more.',
      'The council and I understand each other. That is all that sentence says, and it is enough.',
      'The Civic desk requested additional budget this quarter, which has not happened in years. I approved it and asked them to record the reason in the minutes. The reason is your corridor. Do request a copy of the minutes.',
      'My offer for your portfolio has a date on it. I mention this as scheduling, not pressure — the desk that priced you is needed elsewhere. They priced you carefully. "Almost enough," they said. I kept the phrase.',
    ],
  },

  arsonist: {
    name: 'Trevor',
    shortName: 'Trevor',
    title: '"Thermal Risk Consultant" (self-described, business card is laminated, singular)',
    personality:
      'Trevor appears near vacant buildings the way seagulls appear near chips — no visible summons, total conviction of purpose. He speaks exclusively in hypotheticals, admires the insurance industry with an enthusiasm it would not welcome, and knows the ignition temperature of every cladding product banned since 2017. Nothing has ever been proven, a phrase Trevor says the way other people say their own name.',
    greeting:
      'Evening. Lovely holdings you\'ve got here. Very combustible era, Victorian timber — the resins, see. Anyway. No reason. Just walking. I walk here.',
    idle: [
      'Smell that? No? Good. Good.',
      'Insurance. Beautiful industry. Underrated. People only think of it at the worst times, which is a shame, timing-wise.',
      'Old wiring in these terraces. Practically does the job itself, and no one ever asks the wiring any questions.',
    ],
    hire:
      'Say no more. Genuinely — say no more, that\'s the whole arrangement. Deniability is a two-man job and you\'ve just filled the vacancy.',
    success:
      'Terrible accident up the road last night. Electrical, they reckon. They always reckon electrical. Wonderful people, forensic investigators — thorough, but only in the places they look.',
    failure:
      'Slight issue. There was a witness. Well — a dog. Dogs can\'t testify, I checked, informally. But that one\'s been looking at me across the street all morning and I don\'t love the confidence.',
    gossip: [
      'Vacant possession is a fire risk, statistically. I contribute to those statistics — as a reader, I mean. I read them.',
      'That Docklands tower had the good cladding taken off in the remediation. The good cladding. From my professional standpoint. Which I don\'t have.',
      'Petridis has never needed a man like me, which tells you everything about what his lawyers can do with paper. Paper burns too, is all I\'ll say. It\'s just slower and it happens in courtrooms.',
      'Lot of vacants coming onto my walking route lately, what with the arrears. I keep a list. A mental list. Well — laminated. Mental first, then laminated.',
      'Insurance premiums are up right across the district, which I had nothing to do with. Genuinely nothing, and for once there\'s paperwork to prove it, in the sense that there is no paperwork.',
    ],
  },

  squatter: {
    name: 'Jules "Possum" Whitely',
    shortName: 'Possum',
    title: 'Resident, Tenure Unspecified — Collingwood Rise by preference',
    personality:
      'Possum has lived in eleven buildings in six years and improved most of them, which the owners discovered only at eviction, awkwardly. Part artist, part paralegal, entirely unbothered, they can quote the adverse possession doctrine from memory and have a zine about it with a print run of forty. They regard vacancy as a moral failure and themselves as the correction.',
    greeting:
      'Before you say anything — adverse possession is a real doctrine, fifteen years continuous and exclusive, and I\'ve got a zine about it. Two dollars. For you, two dollars.',
    idle: [
      'This place had pigeons and a mattress fire. I put a kitchen in. The pigeons adjusted.',
      'The owner drives past on Sundays. We wave. It\'s civilised. Melbourne, you know?',
      'Vacancy rate in this street is criminal. Not legally. Morally. Legally it\'s an incentive structure.',
    ],
    hire:
      'You want me to occupy somewhere specific? Mate, that\'s just housing policy with extra steps. Give me the address and a fortnight — I\'ll have curtains up and standing in the eyes of the neighbours.',
    success:
      'Settled in. Fixed the back tap while I was at it — tell the valuer the "renovator\'s delight" is now just a delight, and my invoice is that you never saw me.',
    failure:
      'Got moved on. Two constables and a locksmith. The locksmith wouldn\'t look at me — he knows the doctrine. He just doesn\'t have the case law. Kept the mural though. They always keep the mural. It lifts the auction photos.',
    gossip: [
      'Petridis land-banks half of Port Junction behind hoardings with artist impressions on them. The artist impression has more residents than the parcel.',
      'There\'s a warehouse in Richmond that\'s been "under development" since the last recession but one. The pigeons have a body corporate now.',
      'Fitzroy locals fought a three-storey development for two years, won, and then complained the parcel was an eyesore. Beautiful. No notes.',
      'Petridis\'s hoardings move up the corridor one parcel a month. I stay one squat ahead. Neither of us pays rent. One of us keeps the gutters clear.',
      'Three evictions on this street this quarter and two of the houses are still vacant. I\'ve done the maths on that. The maths is why there\'s a zine.',
    ],
  },

  policeman: {
    name: 'Senior Constable Pam Draper',
    shortName: 'Draper',
    title: 'Victoria Police — inner metro, seen everything twice',
    personality:
      'Draper has worked these suburbs long enough to have arrested the same man outside two different buildings he did not own, and she polices property crime with the weary precision of someone who knows the paperwork outlives the crime. She is unbribeable, unhurried, and keeps a private mental file on Trevor that is thicker than most novels. Nothing surprises her, which she resents slightly, because she used to enjoy being surprised.',
    greeting:
      'Draper. Someone reported "suspicious activity." Around here that\'s a range that runs from arson to a leaf blower before 7am, so let\'s narrow it down together.',
    idle: [
      'That scaffolding has its own incident number. I keep meaning to close the file. The scaffolding keeps meaning to come down. We\'re in a holding pattern.',
      'I know Trevor\'s just walking. Trevor is always just walking. One day the walking will conclude somewhere, and I will be there.',
      'Auction crowds. Forty adults blocking a street to watch a man in a suit shout numbers at a house. And they call it the world\'s most liveable city. Because it is, that\'s the thing.',
    ],
    hire:
      'You can\'t hire police. You can, however, report crime promptly, keep your holdings secured, and stop leaving your vacants looking like an invitation. Do those three and we\'ll get along like a house that is not on fire.',
    success:
      'Patrols stepped up, your street\'s quiet, and a certain thermal enthusiast has taken his walking to another postcode. That\'s what a good week looks like in my line.',
    failure:
      'We got there late. I\'ll be straight with you — a vacant building with no lights, no tenants, and no fencing isn\'t a victim, it\'s a venue. Half of prevention is not being the easiest option on the street.',
    gossip: [
      'Every summer I pull the arson stats. Every summer, same shape. Vacants, insured, electrical. Electrical, electrical — and then the fourth one, suddenly, isn\'t.',
      'Petridis\'s security contractor logs everything. Everything. I\'ve had subpoenas come back with less detail. I don\'t like him, but I\'d hire his cameras.',
      'A squatter in Collingwood reported a burglary in a building they were squatting in. Took the statement with a straight face. Mostly straight. It was a fair call, someone had nicked their zines.',
      'Fires are up, arrears are up, and the insurance claims are reaching the station before the incident reports do. The claims are better drafted. That\'s not a compliment to anybody.',
      'Petridis\'s corridor holdings all grew new fencing this month. Yours didn\'t. I notice fencing. It\'s ninety per cent of the prevention advice I give and the only part nobody takes.',
    ],
  },

  family: {
    name: 'The Nguyen-O\'Briens',
    shortName: 'The Nguyen-O\'Briens',
    title: 'Hannah, Dec, two kids, a deposit, and a labradoodle named Mortgage',
    personality:
      'Hannah and Dec have been to enough Saturday auctions that their four-year-old can say "passed in" and does, loudly, at the worst moments. They are the demand signal made flesh — pre-approved, school-zone-literate, and quietly heartbroken in a way they have agreed not to discuss until after settlement, whenever that is. Where they start looking, the market follows six months later, a fact they would find hilarious and then, immediately, not.',
    greeting:
      'Hi! We\'re the Nguyen-O\'Briens — fourteen auctions and counting. Kayla can say "passed in" now. She\'s four. We\'re very proud and also we are not okay.',
    idle: [
      'Dec measures every third bedroom with a laser thing now. The laser thing has seen things.',
      'We said we\'d never compromise on a north-facing yard. That was nine auctions ago. We\'d take west-facing now. We\'d take south-facing. We\'d take facing.',
      'The school zone map is on the fridge. The fridge is in a rental. We try not to think about that sentence too hard.',
    ],
    hire:
      'Wait, you want our opinion? On where families like us are looking? Oh mate, sit down, we have a spreadsheet. We have TABS.',
    success:
      'We found one. We actually — sorry, give us a second. Fourteen months. Kayla drew the house. It has a chimney it doesn\'t have, but it\'s our chimney it doesn\'t have.',
    failure:
      'Passed in again, then sold to an investor after, over the phone, from the car. Kayla waved at the car. The car did not wave back. That\'s the market, apparently.',
    gossip: [
      'Everyone at daycare pickup is suddenly talking about Collingwood Rise. Two years ago they said never. The word "never" has a two-year settlement period in this city.',
      'Our broker says families like us are the leading indicator. Good to know we\'re useful to someone\'s spreadsheet.',
      'A house in our zone sold for a number that made Dec sit down on the nature strip. A stranger sat down next to him. Didn\'t say anything. Didn\'t need to.',
      'Our pre-approval expired and the renewal came back forty grand lighter at the new rate. The bank attached a brochure about dreaming big. Dec filed the brochure. We don\'t say where.',
      'The rent went up again, so we\'re looking further out. Kayla asked if the new suburbs have houses. We said yes. She asked why none of them are ours. We\'re workshopping the answer.',
    ],
  },

  dog: {
    name: 'Banjo',
    shortName: 'Banjo',
    title: 'Kelpie-cross, Parcel Operations (self-appointed), finder of things',
    personality:
      'Banjo attached himself to your operation outside the Fitzroy North terrace on day one, performed a full inspection of the subfloor without being asked, and has considered himself senior staff ever since. He has a kelpie\'s working obsession, a stray\'s survey of every laneway in the inner north, and an inexplicable instinct for turning up holding exactly the thing you needed. Nobody hired him. That is not how Banjo understands the arrangement to have gone.',
    greeting:
      'A kelpie-cross sits at your feet and regards you with the focused intensity of a creature that has already completed your onboarding and found it adequate.',
    idle: [
      '*digs at the same square metre of nature strip, with intent, past topsoil, past clay, into something Wozza later identifies as drainage*',
      '*stares at Trevor from across the street without blinking, which even Trevor has mentioned*',
      '*inspects the slab pour, walks through it once, and leaves a permanent record of his sign-off*',
    ],
    hire:
      'You did not hire Banjo. Banjo was here. There is a sense, difficult to argue with at his eye level, that Banjo hired you.',
    success:
      'Banjo drops something at your feet and sits, vibrating slightly. It\'s a title deed. Slightly chewed. Still legal, probably. He appears to expect a performance review, favourable.',
    failure:
      'Banjo has brought you a possum. The possum is fine, furious, and has opinions about the subfloor. Banjo appears to consider the introduction complete.',
    gossip: [
      '*sits pointedly at the boundary of a parcel three doors down, which passes in the following Saturday — draw your own conclusions, everyone else has*',
      '*refuses, absolutely, to walk into the Docklands wind tunnel, which the market later validates*',
      '*greets Wozza by bringing him half a sausage — the other half is understood to have been a finder\'s fee*',
      '*walks the corridor route on the morning lap, unprompted, and sits at each unpurchased title in turn — herding, possibly, or a briefing*',
      '*during the squeeze, sleeps on the ledger rather than beside it, and is not taking questions*',
    ],
  },
});

// ---------------------------------------------------------------------------
// 3. DISTRICT_STORIES — the eight districts
// ---------------------------------------------------------------------------

export const DISTRICT_STORIES = deepFreeze({
  'fitzroy-north': {
    tagline: 'Where the terraces are heritage-listed and so are the grudges.',
    atmosphere:
      'Tight frontages, iron lace, and a body of local opinion that predates the sewerage. The terraces here have outlived gold rushes, depressions, and four waves of people who were going to change the place — each wave now objects to the next. Rising damp is a shared heritage value.',
    locals_say: [
      'We\'re not against development. We\'re against that development. And the last one. And, on reflection, the one before that.',
      'The cafe changed hands and kept the menu. Civilisation held, this time.',
      'My place has been in the family forty years. Worth two million, apparently. Can\'t afford to live in it, can\'t afford to leave it. Fitzroy North, mate.',
    ],
    warning:
      'The overlay giveth and the overlay taketh away. Buy the worst house on the best street and budget for the objection period like it\'s a structural cost, because it is.',
  },

  'carlton-east': {
    tagline: 'Twelve thousand students, four thousand beds. You do the maths — they can\'t afford to.',
    atmosphere:
      'The university edge, where every second terrace has a fire-escape staircase bolted on the back and a landlord who has not visited since the Kennett government. Rents are stable the way gravity is stable. In February the whole district smells of instant noodles and possibility.',
    locals_say: [
      'Six students, one bathroom, and the landlord calls it "cosy communal living." The tribunal calls it something else, eventually.',
      'The graduate housing tower filled in a weekend. A weekend. The waitlist has a waitlist.',
      'O-week is loud, exams are quiet, and rent is due in both. It\'s the closest thing this market has to a tide table.',
      'My share house backs onto the cemetery. Quietest neighbours in Carlton, and the only ones not subdividing.',
    ],
    warning:
      'Yields here are honest and boring, which in this city makes them exotic. Just never mistake stable for asleep — one policy change on international enrolments and the tide table gets rewritten.',
  },

  'richmond-flat': {
    tagline: 'Buy the shed, keep the sawtooth roof, charge triple for the exposed brick.',
    atmosphere:
      'Industrial bones on flood-flat land — old workrooms and warehouses with trusses like whale ribs, going cheap because the smart money hasn\'t finished pretending it isn\'t interested. Every second building is one planning permit away from being a "lifestyle precinct." The bones are magnificent. The damp course is a rumour.',
    locals_say: [
      'That was a hat factory, then a squat, then a gym, then a squat again. Now it\'s "creative office." Same pigeons the whole way through.',
      'Cheapest entry inside five clicks of the CBD, and there\'s a reason, and the reason is water, and nobody says the reason at the open.',
      'They kept the sawtooth roof and the crane hook. Charge extra for the crane hook. It\'s never lifted anything but the price.',
    ],
    warning:
      'Cheap entry, heavy exit. Check the flood mapping before the romance of the trusses gets you — the river has prior title and it settles without notice.',
  },

  'brighton-reach': {
    tagline: 'Height-capped, ego uncapped.',
    atmosphere:
      'Prestige coastal, where the planning scheme caps the buildings at two storeys and nothing whatsoever caps anything else. The bathing boxes are worth more than houses in other states and the locals mention this the way other people mention the weather. Everything is rendered, everything is white, and everything has a view committee.',
    locals_say: [
      'We knocked back the buyer. Didn\'t feel right for the street. The street has feelings and they are load-bearing.',
      'Three million for the land, then you demolish. The house is a packaging cost.',
      'The bathing box went for more than my first three houses combined. It has no plumbing. It has a waitlist.',
    ],
    warning:
      'The ceiling means you cannot build your way out of a bad buy — every dollar of upside has to come from the dirt and the postcode. Prestige is real here, but it is priced to perfection, and perfection has thin margins.',
  },

  'docklands-quay': {
    tagline: 'The wind is free. Everything else is negotiable — downward.',
    atmosphere:
      'Harbour towers built in a hurry for a future that keeps rescheduling, on a waterfront the wind treats as a personal fetch. The bones are genuinely good — water, rail, skyline — and the drift is genuinely negative, and both these things have been true for twenty years, which is the whole Docklands condition in one sentence. Somewhere a fountain runs for nobody.',
    locals_say: [
      'Lost two hundred grand on my apartment. — Yeah, that tracks.',
      'The view is incredible. The view is the amenity. The view is, at this point, the tenant.',
      'They say it turns the corner when the next stadium thing lands. They\'ve said that through three stadium things.',
    ],
    warning:
      'Negative drift is not a discount, it\'s a direction. Buy here only with a thesis and an exit — the entry price will flatter you and the resale will take it personally.',
  },

  'southbank-edge': {
    tagline: 'Culture on the ground floor, body corporate fees all the way up.',
    atmosphere:
      'The arts precinct premium, where the galleries and theatres hold the ground plane and forty storeys of glass lean over them taking credit. Buskers, bridges, and the specific glamour of a river that is working hard. The apartments trade on the postcode, the postcode trades on institutions nobody who owns here has entered since the school excursion.',
    locals_say: [
      'The spire lights up purple some nights. Nobody knows the schedule. It\'s the most Melbourne thing in the precinct — beautiful, unexplained, probably grant-funded.',
      'My body corporate fees have a gym, a pool, a concierge, and a special levy. The special levy uses the gym more than I do.',
      'Walk to work, walk to the theatre, walk to the tennis. Never walk to a supermarket, there isn\'t one, we forage at the convenience store like possums in better lighting.',
    ],
    warning:
      'The premium is real but it is attached to the precinct, not your particular tower — and towers here compete with every new tower approved behind them. Buy the ground-floor culture adjacency, not the floor-38 sameness.',
  },

  'port-junction': {
    tagline: 'The cranes left. The overlay stayed.',
    atmosphere:
      'Industrial heritage in the full legal sense — wharf sheds, rail sidings, a customs house with better bones than anything built since, all of it wrapped in protections that arrived roughly one demolition too late and have overcorrected ever since. The gulls own the air rights. Petridis owns a surprising amount of the rest, behind hoardings with artist impressions on them.',
    locals_say: [
      'Me grandfather worked that wharf. Now it\'s a "heritage activation opportunity." He\'d have activated it with a forklift.',
      'The land\'s worth a fortune and can\'t be touched, which around here we call a Wednesday.',
      'They found rail tracks under the car park. Everyone stood around looking at them. Beautiful afternoon, that was.',
    ],
    warning:
      'This is a patience trade — the holding costs are real, the permits are geological, and the payoff only comes to whoever is still solvent when the precinct plan finally lands. Frank\'s ledger has three Port Junction titles in it, all marked "not yet."',
  },

  'collingwood-rise': {
    tagline: 'The frontier, as surveyed from behind a seven-dollar coffee.',
    atmosphere:
      'The gentrification frontier in live motion — smash repairers next to natural wine bars, warehouse conversions mid-scaffold, and murals with development applications pinned to the wall beside them. Every month the frontier moves one street north and everyone pretends not to see it happen. The coffee is genuinely excellent, which complicates the critique.',
    locals_say: [
      'When the smash repairer sells, it\'s over. — Mate, the smash repairer sold in March. — ...When the other one sells, it\'s over.',
      'I moved here because it was cheap and real. So did four thousand other people who say that sentence, and now it\'s neither, and we did that, saying that sentence.',
      'The bakery queue on Saturday is longer than the auction crowd. Sometimes it is the auction crowd, carb-loading.',
    ],
    warning:
      'Frontier pricing is a rumour that gets confirmed one settlement at a time — the margin belongs to whoever buys two streets ahead of the coffee, not one street behind it. When the last smash repairer lists, the frontier has already moved and you are buying the museum of it.',
  },
});

// ---------------------------------------------------------------------------
// 4. EVENT_NARRATIVES — market events, dramatised responsibly
// ---------------------------------------------------------------------------

export const EVENT_NARRATIVES = deepFreeze({
  auction: {
    headline: 'SUPER SATURDAY: SIXTY AUCTIONS, ZERO RESERVES ANYONE BELIEVES',
    breaking:
      'Auction flag is up — a run of listings has hit the boards this quarter and the crowds are forming on the nature strips. Terry has been seen practising his auctioneer voice at the mirror. Reserves are aspirational, blood is in the air, and somewhere a vendor is being told to "trust the campaign."',
    aftermath:
      'The boards are stickered, the crowds have dispersed to brunch, and the results read like a weather report from a strange planet. Half the sales made sense. The other half will be justified at dinner parties for a decade.',
    toast: 'Auctions live — reserves optional, dignity extra.',
  },

  downturn: {
    headline: 'MARKET COOLS; EVERYONE WHO SAID IT COULDN\'T STARTS SAYING THEY SAID IT WOULD',
    breaking:
      'The quarter has turned. Clearance rates are sliding, campaigns are stretching into their fifth week, and the phrase "quality holdings always hold" has entered heavy rotation, which historically means the opposite. Vendors are meeting the market. The market is not returning calls.',
    aftermath:
      'The stickers say SOLD but the numbers say negotiated. Discounts are dressed as strategy, settlements are stretching, and the only people smiling are the ones who kept powder dry — and Vinh, who restructures either way.',
    toast: 'Downturn — the market is "consolidating," which is a word.',
  },

  'flash-flood': {
    headline: 'FLASH FLOODING HITS LOW GROUND; RICHMOND FLAT REMEMBERS WHY IT\'S CALLED THAT',
    breaking:
      'A summer cell has parked over the city and the drains have formally resigned. Water is moving through the flood-flat districts with prior title and no appointment. If you hold low ground, your slab is about to give you its honest opinion of the stormwater plan.',
    aftermath:
      'The water has gone back to wherever it lives, leaving a tide line on the brickwork and a queue at the insurance assessors. The flood mapping everyone skimmed at purchase is being read properly for the first time, aloud, in tones.',
    toast: 'Flash flood — low-lying holdings underwater. In both senses.',
  },

  'interest-shock': {
    headline: 'RATE DECISION LANDS LIKE A PIANO; "VARIABLE" REVEALED TO HAVE MEANT VARIABLE',
    breaking:
      'First Tuesday of the month and the cash rate has moved with intent. Serviceability spreadsheets are catching fire across the city, brokers\' phones are ringing in minor keys, and every fixed-rate cliff just got a better view. Your loan book is repricing whether you watch or not.',
    aftermath:
      'The repayments have settled at their new altitude. Some borrowers absorbed it, some sold "for lifestyle reasons," and the auction crowds have thinned to the people who can still do the maths in their heads and hate the answer.',
    toast: 'Rate shock — your repayments called, they\'ve moved somewhere nicer.',
  },

  'materials-spike': {
    headline: 'TIMBER, STEEL, CONCRETE SPIKE; WOZZA\'S QUOTE NOW COMES WITH A BEST-BEFORE DATE',
    breaking:
      'Materials costs have jumped the fence. Timber is up, steel is up, and concrete is quoting like it went to private school. Every open contract on your book just got hungrier, and every builder in the city is rediscovering the word "variation" with a convert\'s enthusiasm.',
    aftermath:
      'The spike has passed through the supply chain and into your feasibilities, permanently, the way these things do. Fixed-price contracts signed before the jump are being honoured through gritted teeth or renegotiated through lawyers. Wozza honoured his, and mentions it weekly.',
    toast: 'Materials spike — your build cost just did a renovation of its own.',
  },

  fire: {
    headline: 'BLAZE GUTS VACANT BUILDING; CAUSE "ELECTRICAL," SAYS EVERYONE, QUICKLY',
    breaking:
      'Smoke over the district — one of the vacants is alight and the brigade is running hoses past a small crowd of onlookers, one of whom is Trevor, who was "already in the area." Draper has taken out her notebook. The notebook has a section.',
    aftermath:
      'Charred trusses, a fenced-off shell, and an insurance assessor moving through the wreckage with the enthusiasm of a man who has read this exact file before. The market prices the area down and the rumours up. Banjo sits across the street, staring at the crowd, taking a census.',
    toast: 'Fire in the portfolio — "electrical," reportedly. Reportedly.',
  },

  'tenant-arrears': {
    headline: 'ARREARS CREEP ACROSS THE BOOK; RENT DAY BECOMES MORE OF A RENT CONCEPT',
    breaking:
      'The ledger has developed gaps where the rent should be. Some tenants have hit the wall, some have hit the road, and one has responded to the reminder notice with a countercomplaint about the hot water that is, annoyingly, valid. Cash flow is officially a topic.',
    aftermath:
      'Payment plans are in place, one tribunal date is set, and the hot water is fixed because it was always going to have to be. The yield spreadsheet has been updated with a new column called "actual." Vinh saw the column and made a small noise.',
    toast: 'Arrears rising — the rent is theoretical in places.',
  },
});

// ---------------------------------------------------------------------------
// 5. MARKET_COMMENTARY — exchange desk colour
// ---------------------------------------------------------------------------

export const MARKET_COMMENTARY = deepFreeze({
  bull: [
    'Everything\'s green — chips, fruit companies, the coin, even coffee, which means the traders are celebrating with the thing they\'re long. Tidy.',
    'The board\'s running hot and the barbecue talk has turned to "getting some exposure." When your uncle says exposure, the top is somewhere in the room.',
    'NVDA up, gold up, oil up. When everything\'s up at once, someone is wrong, and the market has generously agreed to reveal who later.',
  ],
  bear: [
    'Sea of red on the board. The long-term investors have logged off to focus on their long term, which is a walk.',
    'The coin\'s down again and the true believers are averaging in, which is what averaging down is called at this stage of the conversation.',
    'Everything\'s off. Gold\'s holding, because gold always holds, the smug metallic retiree of the board.',
  ],
  volatile: [
    'Up two percent by lunch, down three by the close. The board isn\'t a market today, it\'s a mood.',
    'The tickers are whipsawing and the only consistent performer is coffee — the commodity, and also the coping mechanism.',
    'Traders are calling it "two-way price action," which is the professional term for nobody knows, and nobody does.',
  ],
});

// ---------------------------------------------------------------------------
// 6. QUARTER_INTROS — chapter openings, played at the top of each quarter
// ---------------------------------------------------------------------------

export const QUARTER_INTROS = deepFreeze([
  {
    quarter: 1,
    title: 'Settlement',
    narration:
      'The boards come off the Fitzroy North terrace on a grey Tuesday, and the first thing out is a decade of pigeons and the smell of Frank\'s cigarettes, which shouldn\'t be possible and is. The settlement cheque is in the account, looking smaller every time you check it, which is why you stop checking it. Terry has already left two voicemails, both beginning "mate." The city doesn\'t know your name yet. It knows Frank\'s, and for one quarter, that will open doors — after that, the doors are your problem.',
    objective_hint:
      'Walk the districts before you spend a dollar. First acquisitions set your cost base for the whole campaign — buy where the entry is honest, not where the coffee is good. The coffee is good everywhere. That\'s the trap.',
    rival_taunt: {
      value:
        'Frank\'s successor. I ran your inheritance through the desk this morning — decent land, terrible carry. Sell me the terrace now and skip the education. The tuition in this market is punishing.',
      momentum:
        'You\'ve arrived at an interesting time — everything I bought last year is repricing beautifully. Do keep up. The market rewards speed and photographs the slow for the case study.',
      civic:
        'Welcome to the city, formally. I\'d study the corridor map before you buy anything — although by all means don\'t. Frank never shared it with you either, I see. Sentimental to the end.',
    },
  },
  {
    quarter: 2,
    title: 'The Winter Book',
    narration:
      'July arrives and the market goes indoors. The auction crowds shrink to the serious and the desperate, categories with significant overlap, and the agents\' quotes drift within cooee of the truth for the only season they ever will. Wozza\'s ute has started appearing outside your terrace uninvited, which he describes as "quoting." Somewhere in the ledger, Frank has written "buy in the rain" and underlined it. The rain has arrived on schedule.',
    objective_hint:
      'Winter vendors have reasons, and reasons are discounts. Build your crew this quarter — builder, broker, and whatever Trevor is — because spring will not wait while you interview.',
    rival_taunt: {
      value:
        'We picked up three titles this month from vendors who "wanted certainty." Certainty is my favourite product. It costs the seller four percent and me nothing.',
      momentum:
        'Quiet quarter. Dull board. I\'ve been buying anyway — momentum sleeps in winter, it doesn\'t die. Whereas hesitation, I notice, is looking very well rested.',
      civic:
        'I acquired a corner in Collingwood you\'d have wanted, once you understood why. That\'s the difficulty with corridors — by the time they\'re visible, they\'re mine.',
    },
  },
  {
    quarter: 3,
    title: 'Permit Season',
    narration:
      'Your first serious plans go into council, and council responds with the calm of an institution that has outlasted every applicant it has ever met. The objection period opens like duck season. Saskia submits elevations she describes as "a gift to the street"; the street, through its residents\' association, respectfully disagrees in fourteen pages. Meanwhile Petridis\'s tower two blocks over gets its permit in six weeks, a turnaround the planning tribunal describes as "efficient" and everyone else describes at the pub.',
    objective_hint:
      'Permits are a pipeline, not an errand — lodge early, lodge everything, and never leave a renovation waiting on paperwork you could have started last quarter. The overlay map is your real opponent this season.',
    rival_taunt: {
      value:
        'I hear the residents object to your development. They objected to mine too, once. We had a series of meetings. They now object to other people\'s developments. Meetings are underrated.',
      momentum:
        'You\'re in the objection period? Wonderful. I\'ll be settled, built, and leased before your notice board stops being vandalised. The vandalism is local heritage, incidentally. Protected.',
      civic:
        'Careful with council. They and I have an understanding built on many years and several ribbon-cuttings. You have a ledger and a dog. The dog, I\'ll grant, is formidable.',
    },
  },
  {
    quarter: 4,
    title: 'Spring Carnival',
    narration:
      'September breaks over the city like a starter\'s gun and every second street sprouts an A-frame board overnight. Clearance rates climb into the nineties, the quoted ranges return to fiction, and Terry starts wearing the good suit, the one he calls "the closer." The Nguyen-O\'Briens are back on the circuit with the laser measurer and the thousand-yard stare. This is the quarter Frank called "the carnival" — the one where fortunes are made by ten thirty and unmade by the two o\'clock auction, and everyone stays for both.',
    objective_hint:
      'Volume is opportunity and anaesthetic — the crowd will pay carnival prices for ordinary parcels, so sell into the roar and buy what passes in quietly at twelve fifteen. Discipline earns double in spring.',
    rival_taunt: {
      value:
        'Carnival season. I don\'t attend auctions — I attend the Monday after, when the underbidders are sad and the passed-ins are cheap. Enjoy the streamers. Someone has to.',
      momentum:
        'NOW we\'re moving. Six settlements this month and the board is green to the horizon. Try to buy something before the music stops — it\'s embarrassing to watch you stretch.',
      civic:
        'The carnival crowd buys houses. I am buying the routes between them. When the streamers come down, do look at a map. Bring a highlighter. Bring two.',
    },
  },
  {
    quarter: 5,
    title: 'Rate Day',
    narration:
      'The first Tuesday of November arrives wearing a suit, and at half past two the cash rate moves with the short, decisive brutality of a country vet. Within the hour Vinh has called twice, the second time just breathing near the phone in a supportive way. The carnival crowds of last quarter are rereading their loan documents, discovering the word "variable" was there the whole time, in that font and everything. Frank\'s ledger has a page for this too: "when rates move, the market tells you who was swimming in what."',
    objective_hint:
      'Audit the loan book before you touch another title. Leverage that was clever last quarter is expensive now — refinance early, divest the marginal, and remember that in a rate squeeze, cash is a personality trait.',
    rival_taunt: {
      value:
        'Rates up. Splendid. My book is fixed to the horizon and my competitors\' books are, I\'m told, "in review." I love a review. It\'s a going-out-of-business sale with governance.',
      momentum:
        'Fine, the board wobbled. Momentum isn\'t about the direction, it\'s about being first — and I was repositioned before your broker finished his supportive breathing. Yes, I\'ve heard about the breathing.',
      civic:
        'Rate shocks pass. Corridors don\'t. While everyone else rereads their loan documents, I\'ll be at the planning counter. Nobody queues there in a panic. More\'s the pity.',
    },
  },
  {
    quarter: 6,
    title: 'The Corridor War',
    narration:
      'It happens on a Thursday: you lay Frank\'s ledger over the district map and the crossed-out names resolve into a line — Fitzroy to Collingwood to Richmond, title by title, a corridor drawn in decades of patience. He wasn\'t collecting streets. He was connecting them. The elation lasts until Friday, when Terry calls to say a "private buyer" has settled on the corner parcel you needed, eleven days start to finish, lilies already delivered to the vendor. Petridis has the same map. He\'s had it longer.',
    objective_hint:
      'Corridors pay compound rent — every link multiplies the districts on both ends. Identify the two titles that complete yours and move on them before subtlety, because the other map in this game has a head start.',
    rival_taunt: {
      value:
        'So you\'ve found Frank\'s map. He offered it to me once, at a price, which I declined, at a price. Sentiment aside — your corridor needs two more titles. I own one of them. Shall we discuss yield?',
      momentum:
        'A race! Finally. You want the corridor, I want the corridor, and I settle in eleven days. Frank managed eleven once. I framed the contract. It\'s in the foyer. Come see it — visit the foyer.',
      civic:
        'Now you\'re playing the actual game, and I confess it\'s better with an opponent — the council meetings alone were getting lonely. One corridor each, then. The city can score it.',
    },
  },
  {
    quarter: 7,
    title: 'The Squeeze',
    narration:
      'The quarter opens with a materials invoice that reads like a ransom note and gets worse from there. Timber spikes, two tenants stop answering, and on the third Sunday one of your vacants catches fire in circumstances the insurer describes as "interesting," while Trevor, across the road, describes himself as "also surprised." Draper takes statements. Banjo stares. Then the letter arrives: Petridis Property Group, offering to acquire your portfolio entire, at a number engineered to be almost enough — the "almost" measured, you suspect, to the dollar.',
    objective_hint:
      'This is the quarter that tests the ledger. Triage hard: protect the corridor, insure the vacants, feed the loans, and sell anything that does not deserve another year. Surviving the squeeze intact is a strategy, not a retreat.',
    rival_taunt: {
      value:
        'You received my offer. It\'s a fair price — fair to my shareholders, which is the only fairness with a legal definition. It expires when your next invoice arrives. I\'ve seen the invoice. Take the offer.',
      momentum:
        'Fires, arrears, materials through the roof — your quarter is a case study and I\'ve already booked the conference slot. There\'s still time to be the redemption arc. Slide forty-one. It\'s a good slide.',
      civic:
        'For what it\'s worth, I had nothing to do with the fire, and I find Trevor as distasteful as you do. I want your corridor intact — I intend to win it whole, at settlement, on the map. Anything else is vandalism.',
    },
  },
  {
    quarter: 8,
    title: 'Year Two Books',
    narration:
      `Autumn again. The planes turn on the boulevards, right on schedule, entirely indifferent to your loan-to-value ratio. The first long builds are coming out of scaffold and the lease book finally has enough history to argue back. Terry has stopped calling this the opening campaign. Frank's ledger has ${Math.max(0, RULES.quarters - 8)} blank quarter columns left. Typical.`,
    objective_hint:
      'Close the first cycle cleanly: lease completed works, cut weak carry, and leave room for the next development programme. This is a checkpoint, not the finish.',
    rival_taunt: {
      value:
        `Eight quarters in. Your cost base was better than I modelled, which has cost an analyst his Christmas bonus. There are ${Math.max(0, RULES.quarters - 8)} more columns behind that one. Pace yourself.`,
      momentum:
        `First lap closed. I nearly ordered catering, then noticed the other ${Math.max(0, RULES.quarters - 8)} columns. Even I have limits on premature confidence.`,
      civic:
        'The first map is legible now. Do not mistake legibility for completion. See you at the next council cycle, successor.',
    },
  },
]);

/** The authored eight-quarter Melbourne cycle repeats; the campaign horizon receives the final beat. */
export const STORYLINE_CYCLE_QUARTERS = 8;
export const DEFAULT_STORY_QUARTERS = RULES.quarters;

const LATER_CYCLE_BEATS = deepFreeze([
  {
    title: 'The Books Reopen',
    narration: 'The inherited terrace is no longer an introduction; it is one line among many. The city has your name now, along with opinions about every number beside it.',
    objective_hint: 'Reprice every holding before the next programme starts. Familiar streets still punish stale assumptions.',
  },
  {
    title: 'Winter Positions',
    narration: 'Winter thins the auction rooms again. This time the quiet reveals positions already taken, loans already carried, and vendors who know exactly how patient you can afford to be.',
    objective_hint: 'Use the thin market to repair the cost base, the crew book and the debt ladder.',
  },
  {
    title: 'Permit Pipeline',
    narration: 'Another planning season opens. Old approvals are turning into scaffolds while new drawings enter the same council queue, where institutional memory is longer than yours.',
    objective_hint: 'Keep permits ahead of works. A mature programme should never wait on paperwork.',
  },
  {
    title: 'Spring Market',
    narration: 'The A-frames return and the quoted ranges lift with the blossom. The crowd is new; the appetite, choreography and Saturday arithmetic are not.',
    objective_hint: 'Sell into noise, buy after it, and make the campaign earn its carrying years.',
  },
  {
    title: 'Rate Review',
    narration: 'Rate day comes around with a thicker loan book beneath it. A small movement now reaches more titles, more tenants and more reasons not to call it small.',
    objective_hint: 'Stress the current book, not the one you remember. Cash and debt both age.',
  },
  {
    title: 'Corridor Ledger',
    narration: 'The corridor map is no longer a discovery. It is a live argument in ink: completed links, missing corners, and Petridis marks pressed close to yours.',
    objective_hint: 'Defend the links that pay and finish only the ones whose next title earns its carry.',
  },
  {
    title: 'The Carry Test',
    narration: 'Materials, arrears and weather return in different proportions. The ledger is larger now, so triage is less dramatic and more expensive.',
    objective_hint: 'Protect rent, finish viable works and cut any holding living on an old excuse.',
  },
  {
    title: 'Cycle Books',
    narration: 'Another two-year programme closes. Completed works have joined the rent book, weak carry has had time to identify itself, and the next blank columns are fewer.',
    objective_hint: 'Close this cycle cleanly, then fund the remaining campaign rather than the last one.',
  },
]);

function finalQuarterIntroFor(horizon) {
  const years = campaignYears(horizon);
  return deepFreeze({
    quarter: horizon,
    title: 'Settlement Day',
    narration:
      `${years} years close on another autumn Tuesday. The last scaffold has come down, the final lease is signed, and Frank's ledger has no blank quarter columns left. Across the city, Petridis has already asked his valuers for the same number you are about to read.`,
    objective_hint:
      `This is Q${horizon}. Settle the last obligations, place the final tenant, and make every remaining dollar defend the result on the closing books.`,
    rival_taunt: {
      value:
        `${horizon} columns. I checked every one. Whatever the number says next, successor, neither of us can call it a first impression.`,
      momentum:
        'Last settle. No next quarter to rescue the almosts. I have always preferred arithmetic when it runs out of places to hide.',
      civic:
        `The city kept the score for ${years} years. Close your books. I will meet you at the map when the ink is dry.`,
    },
  });
}

export const FINAL_QUARTER_INTRO = finalQuarterIntroFor(DEFAULT_STORY_QUARTERS);

/**
 * Resolve a chapter opening for every campaign quarter without exhausting authored copy.
 * Named cycles keep replay output stable; the final campaign quarter is never mistaken for
 * an intermediate eight-quarter checkpoint.
 */
export function storylineIntroForQuarter(quarter, quarters = DEFAULT_STORY_QUARTERS) {
  const horizon = Math.max(1, Math.floor(Number(quarters) || DEFAULT_STORY_QUARTERS));
  const q = Math.max(1, Math.min(horizon, Math.floor(Number(quarter) || 1)));
  if (q === horizon) return finalQuarterIntroFor(horizon);
  const cycle = Math.floor((q - 1) / STORYLINE_CYCLE_QUARTERS) + 1;
  const template = QUARTER_INTROS[(q - 1) % STORYLINE_CYCLE_QUARTERS];
  if (cycle === 1) return template;
  const beat = LATER_CYCLE_BEATS[(q - 1) % STORYLINE_CYCLE_QUARTERS];
  const remaining = horizon - q;
  const year = Math.ceil(q / QUARTERS_PER_YEAR);
  return deepFreeze({
    ...template,
    quarter: q,
    cycle,
    title: `${beat.title} · cycle ${cycle}`,
    narration: `Year ${year} of ${campaignYears(horizon)}. ${beat.narration} ${remaining} quarter${remaining === 1 ? '' : 's'} remain after this one.`,
    objective_hint: beat.objective_hint,
    rival_taunt: {
      value: `Q${q} of ${horizon}. I have priced the remaining ${remaining} columns. Have you?`,
      momentum: `Cycle ${cycle}, Q${q}. The board still rewards whoever moves before the explanation arrives.`,
      civic: `Q${q} of ${horizon}. The map is older, denser and less forgiving of unfinished lines.`,
    },
  });
}

export function storylineIntroPlan(quarters = DEFAULT_STORY_QUARTERS) {
  const horizon = Math.max(1, Math.floor(Number(quarters) || DEFAULT_STORY_QUARTERS));
  return deepFreeze(Array.from(
    { length: horizon },
    (_, index) => storylineIntroForQuarter(index + 1, horizon),
  ));
}

// ---------------------------------------------------------------------------
// 7. VICTORY_SPEECHES and DEFEAT_SPEECHES
// ---------------------------------------------------------------------------

export const VICTORY_SPEECHES = deepFreeze({
  navVictory: {
    title: 'The Number',
    speech:
      `The NAV line crosses the mark on a quiet Tuesday, which is how real fortunes arrive — no confetti, just a valuer's email and a missed call from Vinh that turns out to be him laughing. You take the ledger to the terrace where it started, sit on the front step Wozza never quite levelled, and write the final balance under forty years of Frank's entries. The handwriting has changed over ${RULES.quarters} quarters. It looks, you notice, a little like his. Terry rings to congratulate you and, in the same breath, to mention an off-market opportunity — and you listen, because you're an operator now, and operators always listen.`,
    toast: 'NAV target reached. Frank squints. Frank nods.',
  },
  corridorMastery: {
    title: 'The Map',
    speech:
      'On the wall of the terrace, the district map now shows what Frank saw forty years ago: a line of held titles running Fitzroy to Collingwood to Richmond, linked and feeding, rent flowing along it like trams. Petridis concedes by courier — a bottle of something good, and a note that reads "Frank sent mine back full. I expect no better manners." You keep the bottle. Somewhere across the city he is standing at his own map, re-drawing red lines, already patient about next time. Let him be. The corridor is yours, the city moves along it, and the ledger\'s last entry is a drawing: three districts, one line, no caption needed.',
    toast: 'Corridor complete. The city runs through you now.',
  },
  mandateComplete: {
    title: 'The Mandate',
    speech:
      `Every objective ticked, every box filled, and a closing report so clean the institutions read it twice looking for the trick. There is no trick — just ${RULES.quarters} quarters of buying in the rain, selling into the roar, and keeping the ledger honest when the market wasn't. The committee that once took a fortnight to return your calls now asks whether you're taking new capital. You tell them you'll think about it, which is true, and you think about it on the front step of a terrace in Fitzroy North, with a dog who was never hired and never left, watching the street you held. The mandate is complete. The ledger is not. You open a new page. Old habit.`,
    toast: 'Mandate complete. All boxes ticked, several invented.',
  },
  narrowWin: {
    title: 'By a Nose',
    speech:
      'It comes down to the last settlement of the last week, and it clears by a margin that would not cover Terry\'s commission on a Docklands car space. A win by a nose is still a win — Frank\'s ledger has three of them, each annotated with a single word too rude to record here. Petridis rings personally, which he has never done, and says "close," and hangs up, which from him is a wreath and a handshake and an invitation to go again. You pour the good stuff into the mug with the chipped rim. Some victories are champagne. This one is a long exhale on a front step, and honestly, those keep better.',
    toast: 'Won it at the wire. Frank\'s favourite kind.',
  },
});

export const DEFEAT_SPEECHES = deepFreeze({
  insolvency: {
    title: 'The Receivers Are Polite',
    speech:
      'The money runs out on a Wednesday, and the receivers turn out to be polite, which is somehow the worst part — they compliment the corridor logic while cataloguing it for sale. The liquidation auction is attended by everyone you ever hired: Wozza bids on his own scaffolding, Possum takes notes for the zine, and Petridis, in the back row, buys the ledger for less than reserve and has it framed, as promised. On the tram home you catch yourself reading the auction results out of habit. Frank went broke twice before he got it right. The ledger never recorded that as an ending. It recorded it as an entry.',
    toast: 'Insolvent. Frank went broke twice. Your move.',
  },
  rivalDominance: {
    title: 'His Map Now',
    speech:
      'The final tallies land and the arithmetic is unsentimental: Petridis holds the corridors, the districts price off his settlements, and the city — which never chose sides, only outcomes — now matches his map. He offers you a job, and the truly galling part is that the offer is generous and the role is real, because he never wanted you destroyed, only measured. You decline from the front step of the one terrace you kept. He expected that too. Somewhere in the ledger Frank wrote "lost the street, kept the eye" — and the eye, you find, still works: you can already see the two titles Petridis has priced wrong. Next time starts there.',
    toast: 'Petridis takes the map. The eye stays yours.',
  },
  timeExpired: {
    title: 'The Music Stopped',
    speech:
      `${RULES.quarters} quarters, gone — not to disaster but to almost: the corridor one title short, the target one settle shy, the plan permanently one quarter from working. The autumn planes turn on schedule and the city files you, without malice, under "held on, for ${campaignYears()} years." Terry says "mate" again on the phone, which is how you know. And yet the ledger you hand over is a real ledger now — entries, scars, three good buys anyone would envy and two mistakes you will never make twice. Frank's first campaign ended exactly here. His second one didn't. The difference between those two sentences is the entire trade, and now you own it.`,
    toast: 'Time called. Short by one quarter. Aren\'t we all.',
  },
  fireSale: {
    title: 'Everything Must Go',
    speech:
      'It ends in a fire sale — the real kind, the kind with lawyers — as the portfolio breaks up piece by piece into the hands of buyers who send their regards and their conveyancers. The Nguyen-O\'Briens buy your Fitzroy North terrace at the dispersal, which is, you decide after a difficult hour, the single acceptable line in the whole sorry statement: Kayla\'s drawing of it, chimney and all, is on their fridge by Sunday, and the fridge finally owns something. Draper closes her file. Trevor, notably, was never near any of it; the damage was all yours, done with a pen. The ledger goes with you. Ledgers always do.',
    toast: 'Fire sale complete. The terrace, at least, went home.',
  },
});
