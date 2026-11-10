// F3 opt-in frame policies. Missing/invalid parameters preserve the existing tiers.
export function readFrameOptions(search = typeof location !== 'undefined' ? location.search : '') {
  const params = new URLSearchParams(search || '');
  const msaa = params.get('msaa');
  return {
    msaa: ['0', '2', '4'].includes(msaa) ? Number(msaa) : null,
    autoDpr: params.get('dpr') === 'auto',
  };
}

export function sceneSamples(tierSamples, override, maxSamples) {
  // Do not clamp the legacy path: Three already applies the hardware limit at allocation.
  if (![0, 2, 4].includes(override)) return tierSamples;
  const limit = Number.isFinite(maxSamples) ? Math.max(0, Math.floor(maxSamples)) : 0;
  return Math.min(override, limit);
}

export const AUTO_DPR = Object.freeze({ movingRatio: 1.25, restDelayMs: 1000 });

// Use the rendered camera pose, including eased moves and inertia, without observing
// the post chain's temporary projection jitter. Tiny easing tails count as settled.
export class MotionPixelRatio {
  constructor(fullRatio, camera) {
    this.fullRatio = fullRatio;
    this.movingRatio = Math.min(fullRatio, AUTO_DPR.movingRatio);
    this.lastMovementMs = -Infinity;
    this.pose = [];
    this._sample(camera);
  }

  _sample(camera) {
    const { position: p, quaternion: q, fov, zoom } = camera;
    const next = [p.x, p.y, p.z, q.x, q.y, q.z, q.w, fov, zoom];
    const moved = next.some((value, i) => Math.abs(value - this.pose[i]) > (i < 3 ? 1e-5 : 1e-7));
    this.pose = next;
    return moved;
  }

  update(camera, nowMs) {
    if (this._sample(camera)) this.lastMovementMs = nowMs;
    return nowMs - this.lastMovementMs < AUTO_DPR.restDelayMs ? this.movingRatio : this.fullRatio;
  }
}
