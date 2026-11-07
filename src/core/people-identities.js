// Unique named identities per people archetype.
// Spawn assigns an unused identityId so two dogs on the board are never the same dog.

function freezeRow(row) {
  return Object.freeze({ ...row });
}

export const CAST_IDENTITIES = Object.freeze({
  architect: Object.freeze([
    freezeRow({
      chip: 'Saskia',
      label: 'The Architect',
      skin: '#edd6bc',
      hair: '#b08948',
      eyes: 'blue',
      portrait: 'architect-portrait.png',
    }),
  ]),
  'property-agent': Object.freeze([
    freezeRow({
      chip: 'Terry',
      label: 'The Spruiker',
      skin: '#e4c6a6',
      hair: '#2c1c14',
      eyes: 'green',
      portrait: 'property-agent-portrait.png',
    }),
  ]),
  'cheap-builder': Object.freeze([
    freezeRow({
      chip: 'Wozza',
      label: 'The Chippy',
      skin: '#c48a5c',
      hair: '#6f4c28',
      portrait: 'cheap-builder-portrait.png',
    }),
  ]),
  'mortgage-broker': Object.freeze([
    freezeRow({
      chip: 'Vinh',
      label: 'The Broker',
      skin: '#e0c09a',
      hair: '#d5d0c3',
      portrait: 'mortgage-broker-portrait.png',
    }),
  ]),
  'rival-developer': Object.freeze([
    freezeRow({
      chip: 'Petridis',
      label: 'The Rival',
      skin: '#c49a72',
      hair: '#181312',
      portrait: 'rival-developer-portrait.png',
    }),
  ]),
  arsonist: Object.freeze([
    freezeRow({
      chip: 'Trevor',
      label: 'The Firestarter',
      skin: '#e2c4a0',
      hair: '#7a4f28',
      portrait: 'arsonist-portrait.png',
    }),
    freezeRow({
      chip: 'Glen',
      label: 'The Firestarter',
      skin: '#ead0b4',
      hair: '#c4a06a',
      portrait: 'arsonist-portrait.png',
    }),
  ]),
  squatter: Object.freeze([
    freezeRow({
      chip: 'Possum',
      label: 'The Squatter',
      skin: '#c9a07a',
      hair: '#201914',
      portrait: 'squatter-portrait.png',
    }),
    freezeRow({
      chip: 'Jo',
      label: 'The Squatter',
      skin: '#e2c4a4',
      hair: '#4a3020',
      portrait: 'squatter-portrait.png',
    }),
  ]),
  policeman: Object.freeze([
    freezeRow({
      chip: 'Draper',
      label: 'Senior Constable',
      skin: '#e0c0a0',
      hair: '#402e20',
      portrait: 'policeman-portrait.png',
    }),
    freezeRow({
      chip: 'Nash',
      label: 'Probationary Constable',
      skin: '#edd4b8',
      hair: '#1c1410',
      portrait: 'policeman-portrait.png',
    }),
  ]),
  family: Object.freeze([
    freezeRow({
      chip: 'Nguyen',
      label: "The Nguyen-O'Briens",
      skin: '#c9a07a',
      hair: '#4e3119',
      portrait: 'family-portrait.png',
      members: Object.freeze([
        'family-nguyen-dad', 'family-nguyen-mum', 'family-nguyen-boy', 'family-nguyen-girl',
      ]),
    }),
    freezeRow({
      chip: 'Chen',
      label: 'The Chens',
      skin: '#e8c9a8',
      hair: '#1a1410',
      portrait: 'family-chen-portrait.png',
      members: Object.freeze([
        'family-chen-dad', 'family-chen-mum', 'family-chen-boy', 'family-chen-girl',
      ]),
    }),
    freezeRow({
      chip: 'Walsh',
      label: 'The Walshes',
      skin: '#ead6bc',
      hair: '#8a6a48',
      portrait: 'family-walsh-portrait.png',
      members: Object.freeze([
        'family-walsh-dad', 'family-walsh-mum', 'family-walsh-boy', 'family-walsh-girl',
      ]),
    }),
  ]),
  dog: Object.freeze([
    freezeRow({
      chip: 'Banjo',
      label: 'The Dog',
      skin: '#c9a97f',
      hair: '#5a3220',
      portrait: 'dog-portrait.png',
    }),
    freezeRow({
      chip: 'Blue',
      label: 'The Heeler',
      skin: '#c8bca8',
      hair: '#6a7280',
      portrait: 'dog-blue-portrait.png',
    }),
    freezeRow({
      chip: 'Biscuit',
      label: 'The Kelpie',
      skin: '#e8d4b0',
      hair: '#c4a06a',
      portrait: 'dog-biscuit-portrait.png',
    }),
    freezeRow({
      chip: 'Ink',
      label: 'The Kelpie',
      skin: '#3a3430',
      hair: '#1a1816',
      portrait: 'dog-ink-portrait.png',
    }),
    freezeRow({
      chip: 'Pip',
      label: 'The Heeler',
      skin: '#f2eadc',
      hair: '#e8dcc8',
      portrait: 'dog-pip-portrait.png',
    }),
  ]),
  avatar: Object.freeze([
    freezeRow({
      chip: 'You',
      label: 'You',
      skin: '#e4c6a6',
      hair: '#2b201a',
      portrait: null,
    }),
  ]),
});

export function identitiesFor(archetypeId) {
  return CAST_IDENTITIES[archetypeId] ?? CAST_IDENTITIES.avatar;
}

export function identityFor(archetypeId, identityId = 0) {
  const roster = identitiesFor(archetypeId);
  const index = Number.isInteger(identityId)
    ? ((identityId % roster.length) + roster.length) % roster.length
    : 0;
  return roster[index];
}

export function nextIdentityId(archetypeId, living) {
  const n = identitiesFor(archetypeId).length;
  const used = new Set(
    living
      .filter((person) => person.archetypeId === archetypeId)
      .map((person) => person.identityId ?? 0),
  );
  for (let index = 0; index < n; index += 1) {
    if (!used.has(index)) return index;
  }
  return living.filter((person) => person.archetypeId === archetypeId).length % n;
}

export function personPortraitSrc(archetypeId, identityId = 0) {
  const file = identityFor(archetypeId, identityId).portrait
    ?? `${archetypeId}-portrait.png`;
  return `assets/img/people/${file}`;
}

/** PEOPLE rail prefers the Imagen upper-body still; falls back to the pedestal bust. */
export function personRailPortraitSrc(archetypeId, identityId = 0) {
  const ident = identityFor(archetypeId, identityId);
  if (ident.railPortrait) return `assets/img/people/${ident.railPortrait}`;
  const base = ident.portrait ?? `${archetypeId}-portrait.png`;
  return `assets/img/people/${base.replace(/-portrait\.png$/, '-upper.png')}`;
}
