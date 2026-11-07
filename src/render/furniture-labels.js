// Human-readable names for street furniture / prop pick targets.
// Used by click-to-name toast and any HUD that labels a prop.

const EXACT = Object.freeze({
  'park-blackwood-bench': 'Park bench',
  'park-picnic-table': 'Picnic table',
  'hoddle-grid-bin': 'Street bin',
  'reserve-path-lamp': 'Street lamp',
  'australia-post-box': 'Australia Post box',
  'cast-street-bollard': 'Bollard',
  'traffic-signal': 'Traffic light',
  'traffic-car': 'Car',
  'beach-umbrella': 'Beach umbrella',
  'modern-tram-stop-pylon': 'Tram stop pylon',
  'tram-stop-shelter': 'Tram stop shelter',
  'tram-flag': 'Tram stop',
  'melbourne-tram-stop-sign': 'Tram stop',
  'parked-car': 'Parked car',
  'bike-hoop': 'Bike hoop',
  'melbourne-bike-hoop': 'Bike hoop',
  'city-information-pillar': 'City information stand',
  'drinking-fountain': 'Drinking fountain',
  'city-drinking-fountain': 'Drinking fountain',
  'lifeguard-tower': 'Lifeguard tower',
  'ice-cream-truck': 'Ice-cream truck',
  'path-light': 'Path light',
  'core-swing': 'Swing',
  'core-double-swing': 'Swing',
  'core-valve': 'Valve',
  'core-hatch': 'Hatch',
  'core-spinner': 'Roundabout',
  'core-seesaw': 'Seesaw',
  'core-spring-rider': 'Spring rider',
  'core-boom': 'Boom gate',
  'core-roller': 'Roller door',
  'core-tap': 'Tap',
});

/**
 * Resolve a display name for a mischief/prop target.
 * @param {string} [modelId]
 * @param {string} [key]
 */
export function furnitureLabel(modelId, key = '') {
  const id = String(modelId ?? '');
  if (EXACT[id]) return EXACT[id];
  const k = String(key ?? '');
  if (k.includes('umbrella')) return 'Beach umbrella';
  if (k.includes('traffic-car') || k.includes('parked-car')) return 'Car';
  if (k.includes('signal')) return 'Traffic light';
  if (k.includes('bollard')) return 'Bollard';
  if (k.includes('bench')) return 'Bench';
  if (k.includes('picnic')) return 'Picnic table';
  if (k.includes('postbox') || k.includes('post-box')) return 'Australia Post box';
  if (k.includes('bin')) return 'Bin';
  if (k.includes('lamp') || k.includes('light')) return 'Lamp';
  if (k.includes('tram-flag') || k.includes('tram-stop') || k.includes('flag')) return 'Tram stop';
  if (k.includes('tree') || k.includes('foliage')) return 'Tree';
  if (k.includes('hoop') || k.includes('bike')) return 'Bike hoop';
  if (k.includes('information') || k.includes('pillar')) return 'City information stand';
  if (k.includes('lifeguard')) return 'Lifeguard tower';
  if (k.includes('ice-cream') || k.includes('icecream')) return 'Ice-cream truck';
  if (k.includes('fountain')) return 'Fountain';
  if (k.includes('core-toy:swing') || k.includes('double-swing')) return 'Swing';
  if (k.includes('core-toy:valve')) return 'Valve';
  if (k.includes('core-toy:hatch')) return 'Hatch';
  if (k.includes('core-toy:spinner')) return 'Roundabout';
  if (k.includes('core-toy:seesaw')) return 'Seesaw';
  if (k.includes('core-toy:spring')) return 'Spring rider';
  if (k.includes('core-toy:boom')) return 'Boom gate';
  if (k.includes('core-toy:roller')) return 'Roller door';
  if (k.includes('core-toy:tap')) return 'Tap';
  if (k.includes('opening') && k.includes('door')) return 'Door';
  if (k.includes('opening') && k.includes('garage')) return 'Garage door';
  if (k.includes('opening') && (k.includes('win') || k.includes('window'))) return 'Window';
  if (k.includes('opening')) return 'Opening';
  if (k.includes('bus') || id.includes('bus')) return 'Bus';
  if (k.includes('tram')) return 'Tram';
  if (id) {
    return id
      .replace(/^prop:/, '')
      .replace(/[:_-]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }
  return 'Street furniture';
}
