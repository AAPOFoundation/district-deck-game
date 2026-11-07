export function mountAudioSettings(host, audio, { onMute, onMusic, onEffects } = {}) {
  if (!host) return () => {};
  host.innerHTML = `<fieldset class="sound-settings">
    <legend>Sound</legend>
    <label><input type="checkbox" data-sound-enabled ${audio.enabled ? 'checked' : ''}> Sound on</label>
    <label>Music <input type="range" data-music-volume min="0" max="100" value="${Math.round(audio.musicVolume * 100)}" aria-label="Music volume"><output>${Math.round(audio.musicVolume * 100)}%</output></label>
    <label>Effects <input type="range" data-effects-volume min="0" max="100" value="${Math.round(audio.effectsVolume * 100)}" aria-label="Effects volume"><output>${Math.round(audio.effectsVolume * 100)}%</output></label>
    <p>An original, quiet city score. Sound pauses when you leave this tab.</p>
  </fieldset>`;
  const input = event => {
    const target = event.target;
    audio.unlock();
    if (target.matches('[data-sound-enabled]')) { onMute?.(!target.checked); return; }
    const value = Number(target.value) / 100;
    if (target.matches('[data-music-volume]')) { audio.setMusicVolume(value); onMusic?.(value); }
    if (target.matches('[data-effects-volume]')) { audio.setEffectsVolume(value); onEffects?.(value); }
    if (target.nextElementSibling?.tagName === 'OUTPUT') target.nextElementSibling.textContent = `${Math.round(value * 100)}%`;
  };
  const preview = event => { if (event.target.matches('[data-effects-volume]')) audio.play('acquire'); };
  host.addEventListener('input', input);
  host.addEventListener('change', preview);
  return () => { host.removeEventListener('input', input); host.removeEventListener('change', preview); };
}
