// Courtyard-only upper flank/wing-rear construction; all interactive openings unchanged.
import { box } from '../core.js';
import { PUNCHED } from './modern-detail.js';
import { courtyardRecessMaterials } from './courtyard-materials.js';

export function courtyardReliefSchedule(schedule) {
  const byId = new Map();
  const meta = schedule.meta.map(original => {
    if (original.s === 0) return original;
    const centreY = original.y + original.h / 2;
    const w = original.w * 1.15, h = original.h + 0.12;
    const changed = { ...original, w, h, y: centreY - h / 2, relief: true };
    byId.set(original.id, { u: original.u, y: centreY - (h + .28) / 2,
      width: w + .28, height: h + .28, tag: original.id });
    return changed;
  });
  return { meta, holes: schedule.holes.map(original => byId.get(original.tag) ?? original) };
}

export function courtyardRecessedWindow(ctx, { opening, id }) {
  PUNCHED.windows += 1;
  const local = courtyardRecessMaterials(ctx.materials);
  const [x,y,z] = opening.centre, [nx,,nz] = opening.outward;
  const yaw = Math.atan2(nx,nz), ux = Math.cos(yaw), uz = -Math.sin(yaw);
  const {w,h} = opening, parts = [];
  const add = (suffix, material, u,v,n,width,height,depth) => {
    const geometry = box(width,height,depth,0,0,0,`${id}-${suffix}`);
    geometry.rotateY(yaw); geometry.translate(x+ux*u+nx*n,y+v,z+uz*u+nz*n);
    parts.push({geometry,material});
  };
  // Rough cut margin .14 = frame .115 + lining .025. Corner members
  // meet at faces, without hiding a frame inside the uncut wall.
  for (const side of [-1,1]) {
    add(`reveal-${side<0?'l':'r'}`,local.reveal,side*(w/2+.1275),.07,-.105,.025,h+.14,.21);
    add(`frame-${side<0?'l':'r'}`,ctx.p.joinery,side*(w/2+.0575),.0575,-.185,.115,h+.115,.05);
  }
  add('reveal-head',local.reveal,0,h/2+.1275,-.105,w+.23,.025,.21);
  add('frame-head',ctx.p.joinery,0,h/2+.0575,-.185,w,.115,.05);
  add('sill',ctx.p.wallAlt,0,-h/2-.07,-.055,w+.28,.14,.31);
  // Pane overlaps the clear aperture while remaining .015 behind the frame/sill.
  add('pane',local.glass,0,0,-.24,w+.04,h+.04,.03);
  return parts;
}
