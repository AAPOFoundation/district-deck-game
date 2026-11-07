import { BufferGeometry, Float32BufferAttribute } from 'three';

/** Four open lining members: exposed front lips and inner returns only.
 * The surrounding punched wall supplies their hidden backs and outside faces.
 * Local +Z is outward; local origin is the aperture's centre at the wall face.
 */
export function apartmentReveal({ width, height, depth = 0.24, lip = 0.085 }) {
  const x = width / 2, y = height / 2, ix = x - lip, iy = y - lip;
  const quad = (a, b, c, d) => [...a, ...b, ...c, ...a, ...c, ...d];
  const member = (name, front, inner) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([...front, ...inner], 3));
    geometry.setAttribute('uv', new Float32BufferAttribute([
      0,0, 1,0, 1,1, 0,0, 1,1, 0,1,
      0,0, 1,0, 1,1, 0,0, 1,1, 0,1,
    ], 2));
    geometry.computeVertexNormals();
    geometry.name = name;
    return geometry;
  };
  return [
    member('reveal-head', quad([-x,iy,0],[x,iy,0],[x,y,0],[-x,y,0]),
      quad([-ix,iy,0],[-ix,iy,-depth],[ix,iy,-depth],[ix,iy,0])),
    member('reveal-sill', quad([-x,-y,0],[x,-y,0],[x,-iy,0],[-x,-iy,0]),
      quad([-ix,-iy,0],[ix,-iy,0],[ix,-iy,-depth],[-ix,-iy,-depth])),
    member('reveal-jamb', quad([-x,-iy,0],[-ix,-iy,0],[-ix,iy,0],[-x,iy,0]),
      quad([-ix,-iy,0],[-ix,-iy,-depth],[-ix,iy,-depth],[-ix,iy,0])),
    member('reveal-jamb', quad([ix,-iy,0],[x,-iy,0],[x,iy,0],[ix,iy,0]),
      quad([ix,-iy,0],[ix,iy,0],[ix,iy,-depth],[ix,-iy,-depth])),
  ];
}
