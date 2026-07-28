/**
 * GLSL sources.
 *
 * Three programs carry the whole game:
 *   WORLD    — level geometry, creatures and props, lit and fogged
 *   BILLBOARD— camera-facing quads for projectiles, sparks and glows
 *   POST     — the look: low-res buffer, colour crunch, dither, grain, scanlines
 *
 * The post pass is the one that matters aesthetically. Everything before it is
 * rendered into a small offscreen buffer at RENDER_W x RENDER_H; the filter then
 * quantises colour with an ordered Bayer dither, adds aberration, grain, roll
 * and vignette, and finally point-samples up to the window. That chain is what
 * produces the "cheap camcorder in a dark place" feel.
 */

export const MAX_LIGHTS = 12;

const COMMON_FOG = `
// Exponential-squared fog. Density is per-floor; the colour doubles as the
// clear colour so geometry dissolves into the void instead of ending abruptly.
vec3 applyFog(vec3 color, float dist, vec3 fogColor, float density) {
  float f = exp(-pow(dist * density, 2.0));
  f = clamp(f, 0.0, 1.0);
  return mix(fogColor, color, f);
}
`;

export const WORLD_VS = `#version 300 es
precision highp float;

in vec3 aPos;
in vec3 aNormal;
in vec2 aUv;
in vec3 aColor;
in float aAO;

uniform mat4 uViewProj;
uniform mat4 uModel;
uniform float uWobble;      // vertex jitter: the PS1-era "unstable geometry" tell
uniform vec2 uJitterRes;

out vec3 vWorld;
out vec3 vNormal;
out vec2 vUv;
out vec3 vColor;
out float vAO;

void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(uModel) * aNormal);
  vUv = aUv;
  vColor = aColor;
  vAO = aAO;

  vec4 clip = uViewProj * world;

  // Snap vertices to a coarse grid in screen space. Subtle, but it is a large
  // part of why the image reads as an old console rather than a modern engine.
  if (uWobble > 0.0) {
    vec2 grid = uJitterRes * 0.5 / max(uWobble, 0.0001);
    vec2 snapped = floor((clip.xy / clip.w) * grid + 0.5) / grid;
    clip.xy = snapped * clip.w;
  }
  gl_Position = clip;
}
`;

export const WORLD_FS = `#version 300 es
precision highp float;

in vec3 vWorld;
in vec3 vNormal;
in vec2 vUv;
in vec3 vColor;
in float vAO;

uniform sampler2D uTex;
uniform vec3 uCamPos;
uniform vec3 uAmbient;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uTime;

uniform vec4 uLightPos[${MAX_LIGHTS}];    // xyz = position, w = radius
uniform vec4 uLightColor[${MAX_LIGHTS}];  // rgb = colour, a = intensity
uniform int uLightCount;

uniform vec3 uFlashPos;
uniform vec3 uFlashDir;
uniform vec4 uFlashParams;   // cosInner, cosOuter, range, intensity
uniform vec3 uFlashColor;

uniform vec3 uEmissive;      // self-lit surfaces (lava, crystals, eyes)
uniform float uEmissivePulse;
uniform vec4 uTintFlash;     // rgb tint, a = mix amount (damage flashes)

out vec4 fragColor;

${COMMON_FOG}

void main() {
  vec4 texel = texture(uTex, vUv);
  if (texel.a < 0.35) discard;

  vec3 albedo = texel.rgb * vColor;
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorld);

  // Ambient is deliberately tiny: light must come from lamps and the torch.
  vec3 lit = uAmbient * albedo * vAO;

  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec3 toLight = uLightPos[i].xyz - vWorld;
    float d = length(toLight);
    float radius = uLightPos[i].w;
    if (d > radius) continue;
    vec3 L = toLight / max(d, 0.0001);
    float atten = 1.0 - d / radius;
    atten *= atten;
    float ndl = max(dot(N, L), 0.0);
    // A little wrap-around keeps back faces from going pure black.
    ndl = ndl * 0.85 + 0.15;
    lit += albedo * uLightColor[i].rgb * (uLightColor[i].a * atten * ndl);
  }

  // Hand torch: a hard-edged cone, the main way the player sees anything.
  vec3 toFlash = uFlashPos - vWorld;
  float fd = length(toFlash);
  if (fd < uFlashParams.z) {
    vec3 L = toFlash / max(fd, 0.0001);
    float spot = dot(-L, normalize(uFlashDir));
    float cone = smoothstep(uFlashParams.y, uFlashParams.x, spot);
    if (cone > 0.0) {
      float atten = pow(1.0 - fd / uFlashParams.z, 1.6);
      float ndl = max(dot(N, L), 0.0) * 0.8 + 0.2;
      lit += albedo * uFlashColor * (uFlashParams.w * cone * atten * ndl);
    }
  }

  lit += albedo * uEmissive * (1.0 + 0.25 * sin(uTime * 3.0 + vWorld.x + vWorld.z) * uEmissivePulse);

  // Reinhard-style roll-off keeps bright surfaces (lava, torch at point-blank)
  // inside the range the colour quantiser can still express.
  lit = lit / (1.0 + lit * 0.55);

  float dist = length(uCamPos - vWorld);
  vec3 color = applyFog(lit, dist, uFogColor, uFogDensity);
  color = mix(color, uTintFlash.rgb, uTintFlash.a);

  fragColor = vec4(color, 1.0);
}
`;

export const BILLBOARD_VS = `#version 300 es
precision highp float;

in vec3 aCenter;     // world position
in vec2 aCorner;     // -1..1 quad corner
in vec2 aUv;
in vec4 aColor;      // rgb + alpha
in float aSize;

uniform mat4 uViewProj;
uniform vec3 uRight;
uniform vec3 uUp;

out vec2 vUv;
out vec4 vColor;
out vec3 vWorld;

void main() {
  vec3 world = aCenter + uRight * (aCorner.x * aSize) + uUp * (aCorner.y * aSize);
  vWorld = world;
  vUv = aUv;
  vColor = aColor;
  gl_Position = uViewProj * vec4(world, 1.0);
}
`;

export const BILLBOARD_FS = `#version 300 es
precision highp float;

in vec2 vUv;
in vec4 vColor;
in vec3 vWorld;

uniform sampler2D uTex;
uniform vec3 uCamPos;
uniform vec3 uFogColor;
uniform float uFogDensity;

out vec4 fragColor;

${COMMON_FOG}

void main() {
  vec4 texel = texture(uTex, vUv);
  float a = texel.a * vColor.a;
  if (a < 0.02) discard;
  vec3 color = texel.rgb * vColor.rgb;
  float dist = length(uCamPos - vWorld);
  // Additive sprites fade into fog rather than tinting toward it.
  float f = clamp(exp(-pow(dist * uFogDensity, 2.0)), 0.0, 1.0);
  fragColor = vec4(color * f, a * f);
}
`;

export const POST_VS = `#version 300 es
precision highp float;
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const POST_FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uScene;
uniform sampler2D uHud;
uniform vec2 uResolution;     // low-res buffer size
uniform float uTime;

uniform float uAberration;    // radial RGB split, in pixels at the edge
uniform float uGrain;         // animated luminance noise
uniform float uScanline;      // horizontal line darkening
uniform float uVignette;
uniform float uLevels;        // colour steps per channel before dithering
uniform float uDither;        // 0 = hard banding, 1 = full ordered dither
uniform float uSaturation;
uniform float uContrast;
uniform float uBrightness;
uniform vec3 uTint;           // per-floor colour grade
uniform float uGlitch;        // horizontal tear amount, spikes on damage
uniform float uDamage;        // red wash
uniform float uFade;          // 0 = normal, 1 = black (transitions)

// --- ordered dithering ---------------------------------------------------
// Compact recursive Bayer construction: bayer8 from bayer4 from bayer2.
float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

void main() {
  vec2 uv = vUv;
  vec2 px = uv * uResolution;

  // The HUD is sampled from the *undistorted* coordinate. Tearing and roll are
  // meant to happen to the recording, not to the readout the player relies on.
  vec4 hud = texture(uHud, vec2(uv.x, 1.0 - uv.y));
  float hudMask = hud.a;

  // --- tape-style horizontal tearing -------------------------------------
  if (uGlitch > 0.001) {
    float band = floor(uv.y * 24.0);
    float n = hash(vec2(band, floor(uTime * 12.0)));
    float tear = step(1.0 - uGlitch * 0.55, n) * (n - 0.5) * uGlitch * 0.09;
    uv.x += tear;
  }

  // Slight vertical roll: never enough to be unreadable, enough to feel analogue.
  uv.y += sin(uTime * 0.6) * 0.0006;

  // --- chromatic aberration ----------------------------------------------
  vec2 centre = uv - 0.5;
  float r2 = dot(centre, centre);
  vec2 offset = centre * (uAberration / uResolution.x) * (0.35 + r2 * 3.0);

  vec3 color;
  color.r = texture(uScene, uv + offset).r;
  color.g = texture(uScene, uv).g;
  color.b = texture(uScene, uv - offset).b;

  // --- HUD, composited before the crunch so it belongs to the image -------
  // It still goes through the grade and the quantiser, because an overlay that
  // skips them floats above the picture instead of sitting in it. What it does
  // not get is the part of the crunch that destroys eight-pixel glyphs:
  // scanlines, grain and coarse banding are all held back by hudMask below.
  color = mix(color, hud.rgb, hudMask);

  // --- grade --------------------------------------------------------------
  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(lum), color, uSaturation);
  color = (color - 0.5) * uContrast + 0.5 + uBrightness;
  color *= uTint;
  color = mix(color, vec3(0.85, 0.12, 0.12), uDamage * 0.26);

  // --- scanlines and interference ----------------------------------------
  float scan = 1.0 - uScanline * (0.5 + 0.5 * sin(px.y * 3.14159));
  color *= mix(scan, 1.0, hudMask);
  float interference = hash(vec2(floor(px.y), floor(uTime * 30.0)));
  color *= 1.0 - uGlitch * 0.25 * step(0.93, interference) * (1.0 - hudMask);

  // --- vignette -----------------------------------------------------------
  // Held back over the HUD too: the readouts live in the corners, which is
  // exactly where the vignette is darkest.
  float vig = 1.0 - uVignette * smoothstep(0.18, 0.75, r2) * (1.0 - hudMask * 0.75);
  color *= vig;

  // --- grain --------------------------------------------------------------
  float g = hash(px + vec2(uTime * 61.0, uTime * 37.0)) - 0.5;
  color += g * uGrain * (1.0 - hudMask * 0.9);

  // --- colour quantisation with ordered dithering -------------------------
  // The dither is added *before* flooring, so gradients break into a stable
  // cross-hatch instead of flat bands. This is the signature of the whole look.
  // Over the HUD the palette opens up and the dither backs off, because a
  // twelve-step ramp plus a Bayer threshold turns a glyph edge into confetti.
  float levels = mix(uLevels, 48.0, hudMask);
  float threshold = (bayer8(px) - 0.5) * uDither * (1.0 - hudMask * 0.85);
  color = clamp(color, 0.0, 1.0);
  color = floor(color * levels + threshold + 0.5) / levels;

  color *= (1.0 - uFade);
  fragColor = vec4(color, 1.0);
}
`;
