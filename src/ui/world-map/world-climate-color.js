// Continuous climate paint only: no geography, elevation, simulation or GPU state.
const clamp = x => Math.max(0, Math.min(1, x));
export function climateRamp(a, b, x) {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
export function mixClimateColor(a, b, t) {
  t = clamp(t);
  return [16, 8, 0].reduce((hex, shift) => hex | (Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t) << shift), 0);
}
/** A small spherical climate displacement; periodic at the date line, zero at poles. */
export function climateLatitude(lat, lon) {
  const p = lat * Math.PI / 180, l = lon * Math.PI / 180;
  return Math.max(0, Math.min(90, Math.abs(lat) + 3.2 * Math.cos(p) * (Math.sin(2 * l + .7) * .65 + Math.sin(l - 3 * p) * .35)));
}
export function canopyColorAt(lat, lon, palette) {
  const a = climateLatitude(lat, lon);
  const warm = mixClimateColor(palette.tropical, palette.temperate, climateRamp(8, 28, a));
  return mixClimateColor(warm, palette.boreal, climateRamp(38, 60, a));
}
export function climateColorAt(lat, lon, dry, palette) {
  const a = climateLatitude(lat, lon);
  let color = canopyColorAt(lat, lon, palette);
  // Ochre follows aridity rather than painting every coast at the same latitude.
  color = mixClimateColor(color, palette.savanna, climateRamp(.08, .65, dry) * (1 - climateRamp(40, 62, a)));
  color = mixClimateColor(color, palette.desert, climateRamp(.25, .90, dry));
  color = mixClimateColor(color, palette.ridge, climateRamp(.55, 1, dry) * .55 * (1 - climateRamp(36, 50, a)));
  color = mixClimateColor(color, palette.tundra, climateRamp(56, 74, a));
  return mixClimateColor(color, palette.ice, climateRamp(lat < 0 ? 60 : 70, lat < 0 ? 84 : 88, a));
}
/** Every former forest cutoff fades to zero, including patch and belt edges. */
export function forestInfluence({ lat, alt, dry, forest, belt, uplandAt }) {
  const a = Math.abs(lat);
  return .40 * climateRamp(.60, .82, forest) * climateRamp(.42, .58, belt)
    * climateRamp(0, 4, a) * (1 - climateRamp(54, 64, a))
    * (1 - climateRamp(uplandAt + .06, uplandAt + .22, alt))
    * (1 - climateRamp(.48, .66, dry));
}
