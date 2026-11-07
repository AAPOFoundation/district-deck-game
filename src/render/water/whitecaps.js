// W22-R2: the steepest Gerstner set alone breaks. History is evaluated in
// crest-following coordinates: it leaves a streak, not stationary foam flakes.
// Five half-second ages retain foam for two seconds without a render target.
export const WHITECAPS_GLSL = /* glsl */ `
  uniform vec2 uBayDir[3];
  uniform float uBayLen[3];
  uniform float uBayAmp[3];
  uniform float uBaySteep[3];
  uniform float uBayOmega[3];
  uniform float uWaveScale;
  float ddCrestCaps(float along, float front, float depth, float calm, float t) {
    float live = smoothstep(0.8, 11.0, front) * smoothstep(0.12, 2.15, depth)
      * min(1.0, depth / 5.4);
    // These regions cannot cross the determinant threshold. In the tight
    // basin view this avoids all history work without changing a pixel.
    if (calm >= 0.15 || uWaveScale * live < 0.44) return 0.0;
    float k = 6.28318530718 / uBayLen[0];
    float wob = sin(along * 0.019 + 0.6) * 4.2 + sin(along * 0.047 + 1.9) * 1.8;
    float phi = k * dot(uBayDir[0], vec2(along, front + wob * 0.35)) - uBayOmega[0] * t;
    // det(I - kQA sin(phi) DD^T) = 1 - kQA sin(phi), D is unit length.
    float fold = 1.0 - k * uBaySteep[0] * uBayAmp[0] * uWaveScale * live * sin(phi);
    float edge = 0.97485 + 0.00020 * (0.5 + 0.5 * sin(along * 0.73 + sin(along * 0.21)));
    float crest = 1.0 - smoothstep(0.97458, edge, fold);
    if (crest <= 0.0) return 0.0;
    float memory = 0.0;
    for (int j = 0; j < 5; j++) {
      float age = float(j) * 0.5;
      float packet = sin(along * 0.045 + sin(along * 0.013) * 0.7 - (t - age) * 0.35);
      float born = pow(max(0.0, packet), 32.0);
      memory = max(memory, born * exp(-age / 0.65) * (1.0 - smoothstep(1.5, 2.0, age)));
    }
    return crest * memory * (1.0 - smoothstep(0.02, 0.15, calm));
  }
`;
