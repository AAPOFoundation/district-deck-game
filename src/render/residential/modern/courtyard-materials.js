// Library-owned materials only for the twelve courtyard recesses.
export const COURTYARD_GLASS_VARIANT = 'courtyard-recess-glass-r4';
export const COURTYARD_REVEAL_VARIANT = 'courtyard-mineral-reveal-r4';
const ROOM_TERM = 'p20Room * p24RoomLight';
const LOCAL_ROOM_TERM = 'p20Room * p24RoomLight * mix(1.0, 0.20, p24Day)';

export function courtyardRecessMaterials(materials) {
  const reveal = materials.get('render', {variant:COURTYARD_REVEAL_VARIANT,
    color:'#777a7c',roughness:.9,metalness:0,envBase:.28});
  if (!reveal.userData.courtyardMineralReveal) {
    reveal.color.setRGB(.18,.19,.20);
    reveal.emissive.setRGB(0,0,0); reveal.emissiveIntensity=0;
    reveal.specularIntensity=.12;
    reveal.userData.courtyardMineralReveal=true;
  }
  const glass = materials.get('glass', {variant:COURTYARD_GLASS_VARIANT,
    buildingGlass:true,buildingKey:'p20-shared-kit-glass'});
  if (!glass.userData.courtyardRecessGlass) {
    const previous=glass.onBeforeCompile,previousKey=glass.customProgramCacheKey;
    glass.onBeforeCompile=function(shader,renderer){
      previous.call(this,shader,renderer);
      if(shader.fragmentShader.split(ROOM_TERM).length!==2)throw Error('Courtyard glass requires exactly one inherited room term');
      shader.fragmentShader=shader.fragmentShader.replace(ROOM_TERM,LOCAL_ROOM_TERM);
    };
    glass.customProgramCacheKey=function(){return `${previousKey.call(this)}|courtyard-room-daylight-r4`;};
    glass.userData.courtyardRecessGlass=true;
    glass.needsUpdate=true;
  }
  return {reveal,glass};
}
