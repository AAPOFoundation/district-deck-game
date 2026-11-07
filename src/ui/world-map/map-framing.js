import { solveFightTilt } from './world-threats.js';

/** YXZ applies tilt first. Recompute yaw after that tilt to keep the port facing us. */
export function mapFacingYaw(point, rotX) {
  const tiltedZ = point.y * Math.sin(rotX) + point.z * Math.cos(rotX);
  return Math.atan2(-point.x, tiltedZ);
}

/** Deterministic framing; projectY measures the actual camera, including its aspect. */
export function solveMapFrame(point, projectY, targetY) {
  const measure = (rotX) => projectY(rotX, mapFacingYaw(point, rotX));
  let solution = solveFightTilt(measure, targetY,
    { lo: -Math.PI / 2, hi: Math.PI / 2, coarse: 33, refines: 5 },
  );
  // Near a pole the desired screen height may require crossing a quarter-turn.
  if (solution.err > 0.1) solution = solveFightTilt(measure, targetY,
    { lo: -Math.PI, hi: Math.PI, coarse: 65, refines: 5 });
  return { ...solution, rotY: mapFacingYaw(point, solution.rotX) };
}
