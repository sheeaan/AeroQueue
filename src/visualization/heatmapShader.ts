import { Filter, GlProgram } from 'pixi.js';

/**
 * Custom WebGL filter that maps an accumulated grayscale intensity texture to a
 * congestion gradient (clear → green → yellow → red).
 *
 * The intensity texture is produced upstream by additively blending soft blobs
 * into an off-screen RenderTexture (see {@link HeatmapRenderer}); this fragment
 * shader simply re-colours that single texture in one pass, which is why the
 * approach scales to hundreds of agents without the fill-rate cost of stacking
 * hundreds of translucent sprites on screen.
 *
 * The vertex shader is the canonical PixiJS v8 filter vertex program; its
 * `uInputSize` / `uOutputFrame` / `uOutputTexture` uniforms and the `uTexture`
 * sampler are bound automatically by the filter pipeline.
 */
const VERTEX = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition( void )
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord( void )
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

const FRAGMENT = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;

vec3 congestionRamp(float t)
{
    vec3 cool = vec3(0.18, 0.74, 0.70); // free-flowing  (teal)
    vec3 warm = vec3(0.96, 0.70, 0.30); // moderate      (amber)
    vec3 hot  = vec3(0.95, 0.42, 0.45); // severe         (rose)
    vec3 c = mix(cool, warm, smoothstep(0.0, 0.5, t));
    return mix(c, hot, smoothstep(0.5, 1.0, t));
}

void main(void)
{
    float intensity = texture(uTexture, vTextureCoord).r;
    // Soft, professional overlay: a gentle alpha ramp and a low global cap so the
    // congestion field reads as a subtle tint, never a glowing neon blob.
    float alpha = smoothstep(0.10, 0.95, intensity);
    vec3 color = congestionRamp(clamp(intensity, 0.0, 1.0));
    finalColor = vec4(color * alpha, alpha) * 0.5;
}
`;

/**
 * Build the heatmap filter. Returns `null` (rather than throwing) if shader
 * compilation is unavailable, so the rest of the canvas keeps rendering.
 */
export function createHeatmapFilter(): Filter | null {
  try {
    return new Filter({
      glProgram: GlProgram.from({ vertex: VERTEX, fragment: FRAGMENT, name: 'aeroqueue-heatmap' }),
    });
  } catch (error) {
    console.warn('[AeroQueue] Heatmap filter unavailable; falling back to raw intensity.', error);
    return null;
  }
}
