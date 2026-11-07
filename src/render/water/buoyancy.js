// W22: five-point heave/pitch/roll; moored stations are baked once.
// Callers supply the live Gerstner height mirror and freeze clock.
import * as THREE from 'three';

export class OceanBuoyancy {
  constructor(port, station, height) {
    this.height = height;
    this.rows = [];
    const point = new THREE.Vector3();
    port.traverse(body => {
      const spec = body.userData.oceanBuoyancy;
      if (!spec) return;
      const l = spec.halfLength, b = spec.halfBeam;
      body.updateWorldMatrix(true, false);
      const points = [[0,0], [l,0], [-l,0], [0,b], [0,-b]].map(([x,z]) => {
        point.set(x, 0, z).applyMatrix4(body.matrixWorld);
        return station(point.x, point.z);
      });
      this.rows.push({ body, points, l, b, mooredCan: true,
        response: Math.max(1, Math.min(3, 0.3 / (points[0].calm ?? 0.1))), y: body.position.y,
        rx: body.rotation.x, rz: body.rotation.z });
    });
    const ships = [...(port.userData.ships ?? [])];
    port.traverse(body => {
      if (/^fringe:port-(?:dredger|barge|tug|pilot|launch|tender|punt|runner|lighter)(?::\d+)?$/.test(body.name)) {
        ships.push({ bob: body });
      }
    });
    for (const ship of ships) {
      const body = ship.bob;
      if (!body) continue;
      let boot;
      body.traverse(mesh => { if (!boot && /hull:boot$/.test(mesh.name)) boot = mesh; });
      if (!boot) continue;
      boot.geometry.computeBoundingBox();
      const box = boot.geometry.boundingBox;
      const x = (box.min.x + box.max.x) * .5;
      const z = (box.min.z + box.max.z) * .5;
      const l = (box.max.x - box.min.x) * .4;
      const b = (box.max.z - box.min.z) * .4;
      boot.updateWorldMatrix(true, false);
      const points = [[x,z], [x+l,z], [x-l,z], [x,z+b], [x,z-b]].map(([px,pz]) => {
        point.set(px, 0, pz).applyMatrix4(boot.matrixWorld);
        return station(point.x, point.z);
      });
      const row = { body, points, l, b, y: body.position.y,
        rx: body.rotation.x, rz: body.rotation.z };
      this.rows.push(row);
      if (body.name === 'fringe:port-pilot') {
        row.externallyDriven = true;
        const local = [[x,z], [x+l,z], [x-l,z], [x,z+b], [x,z-b]];
        // The route owns XZ/yaw; resample after it moves, before the render.
        body.userData.applyOceanBuoyancy = time => {
          boot.updateWorldMatrix(true, false);
          for (let i = 0; i < local.length; i++) {
            point.set(local[i][0], 0, local[i][1]).applyMatrix4(boot.matrixWorld);
            points[i] = station(point.x, point.z);
          }
          this._applyRow(row, time);
        };
      }
    }
  }
  update(time) {
    for (const row of this.rows) {
      if (!row.externallyDriven) this._applyRow(row, time);
    }
  }
  _applyRow(row, time) {
      const p = row.points;
      const c = this.height(p[0], time), f = this.height(p[1], time);
      const a = this.height(p[2], time), r = this.height(p[3], time), l = this.height(p[4], time);
      const heave = (c + f + a + r + l) / 5;
      // Small chain-moored cans respond more than broad hulls in sheltered
      // swell; a smooth 28 cm excursion limit models the taut chain offshore.
      row.body.position.y = row.y + (row.mooredCan ? 0.28 * Math.tanh(row.response * heave / 0.28) : heave);
      row.body.rotation.z = row.rz + Math.atan2(f - a, row.l * 2);
      row.body.rotation.x = row.rx - Math.atan2(r - l, row.b * 2);
  }
  dispose() {
    for (const row of this.rows) {
      if (row.externallyDriven) delete row.body.userData.applyOceanBuoyancy;
      row.body.position.y = row.y; row.body.rotation.x = row.rx; row.body.rotation.z = row.rz;
    }
  }
}
