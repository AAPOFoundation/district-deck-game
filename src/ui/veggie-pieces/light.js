// Season light + background for the veggie overlay. Pure colours. No sim.

import * as THREE from 'three';

const RIG = Object.freeze({
  autumn: {
    hemiSky: '#f0e2c8',
    hemiGround: '#6a5340',
    hemi: 0.82,
    key: '#ffd7a0',
    keyInt: 1.62,
    fill: '#c9b89a',
    fillInt: 0.34,
    bg: '#5a4a34',
  },
  winter: {
    hemiSky: '#d8e4f0',
    hemiGround: '#5a6258',
    hemi: 0.70,
    key: '#e8eef4',
    keyInt: 1.22,
    fill: '#b0c0cc',
    fillInt: 0.38,
    bg: '#4a5558',
  },
  spring: {
    hemiSky: '#e8f4dc',
    hemiGround: '#5a6a44',
    hemi: 0.84,
    key: '#fff4d2',
    keyInt: 1.58,
    fill: '#c2d8a8',
    fillInt: 0.36,
    bg: '#4a5538',
  },
  summer: {
    hemiSky: '#fff6d8',
    hemiGround: '#6a6240',
    hemi: 0.90,
    key: '#ffe8b0',
    keyInt: 1.78,
    fill: '#d0e8f4',
    fillInt: 0.28,
    bg: '#5a6238',
  },
});

export function seasonRig(season) {
  return RIG[season] ?? RIG.autumn;
}

export function applySeasonRig(scene, lights, season) {
  const rig = seasonRig(season);
  if (scene) scene.background = new THREE.Color(rig.bg);
  if (lights?.hemi) {
    lights.hemi.color.set(rig.hemiSky);
    lights.hemi.groundColor.set(rig.hemiGround);
    lights.hemi.intensity = rig.hemi;
  }
  if (lights?.key) {
    lights.key.color.set(rig.key);
    lights.key.intensity = rig.keyInt;
  }
  if (lights?.fill) {
    lights.fill.color.set(rig.fill);
    lights.fill.intensity = rig.fillInt;
  }
  return rig;
}
