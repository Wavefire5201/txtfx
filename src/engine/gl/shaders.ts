/**
 * GLSL 300 es shader sources. All fragment outputs are PREMULTIPLIED alpha;
 * pass blending is configured by the renderer:
 *   normal  -> blendFunc(ONE, ONE_MINUS_SRC_ALPHA)
 *   screen  -> blendFunc(ONE, ONE_MINUS_SRC_COLOR)   (exact screen-over math)
 *   (other CSS blend modes approximate to normal — documented limitation)
 */

export const QUAD_VERT_CORNERS = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

// --- Backdrop: cover-cropped image + 4-corner vignette (matches drawBackdrop) ---

export const BACKDROP_VERT = `#version 300 es
layout(location=0) in vec2 corner;
uniform vec4 uUvRect; // xy offset, zw scale of the cover-crop window
out vec2 vUv;
out vec2 vPos01;
void main() {
  vPos01 = corner;
  vUv = uUvRect.xy + corner * uUvRect.zw;
  gl_Position = vec4(corner.x * 2.0 - 1.0, 1.0 - corner.y * 2.0, 0.0, 1.0);
}`;

export const BACKDROP_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uImage;
uniform vec2 uCanvas;     // css px
uniform float uHasImage;  // 0 => transparent backdrop
in vec2 vUv;
in vec2 vPos01;
out vec4 outColor;
void main() {
  if (uHasImage < 0.5) { outColor = vec4(0.0); return; }
  vec3 color = texture(uImage, vUv).rgb;
  // Four sequential source-over radial gradients rgba(0,0,0,0.45) -> 0
  vec2 px = vPos01 * uCanvas;
  float r = max(uCanvas.x, uCanvas.y) * 0.5;
  vec2 corners[4] = vec2[4](vec2(0.0), vec2(uCanvas.x, 0.0), vec2(0.0, uCanvas.y), uCanvas);
  for (int i = 0; i < 4; i++) {
    float a = 0.45 * clamp(1.0 - distance(px, corners[i]) / r, 0.0, 1.0);
    color *= (1.0 - a); // over with black
  }
  outColor = vec4(color, 1.0);
}`;

// --- Glyphs: instanced quads sampling the atlas ---
// instance uvec3: x = col | row<<16 ; y = atlasSlot ; z = RGBA (A<<24|R<<16|G<<8|B)

export const GLYPH_VERT = `#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in uvec3 inst;
uniform vec2 uCell;       // charW,charH css px
uniform vec2 uPad;        // grid padX,padY css px
uniform vec2 uCanvas;     // css px
uniform vec2 uQuad;       // quad size css px (atlas cell / dpr)
uniform float uInkPad;    // atlas ink margin css px
uniform vec2 uSlotGrid;   // atlas slot cols, rows
uniform vec2 uCellUv;     // uv size of one atlas cell
out vec2 vUv;
out vec4 vColor;
void main() {
  float col = float(inst.x & 0xFFFFu);
  float row = float(inst.x >> 16);
  vec2 origin = uPad + vec2(col, row) * uCell - vec2(uInkPad);
  vec2 pos = origin + corner * uQuad;
  vec2 clip = (pos / uCanvas) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  float slot = float(inst.y);
  vec2 slotPos = vec2(mod(slot, uSlotGrid.x), floor(slot / uSlotGrid.x));
  vUv = (slotPos + corner) * uCellUv;
  uint rgba = inst.z;
  vColor = vec4(
    float((rgba >> 16) & 0xFFu),
    float((rgba >> 8) & 0xFFu),
    float(rgba & 0xFFu),
    float((rgba >> 24) & 0xFFu)
  ) / 255.0;
}`;

export const GLYPH_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uAtlas;
in vec2 vUv;
in vec4 vColor;
out vec4 outColor;
void main() {
  float ink = texture(uAtlas, vUv).a;
  float a = ink * vColor.a;
  outColor = vec4(vColor.rgb * a, a); // premultiplied
}`;

// --- Glow: instanced radial-falloff quads (exact glow-cache gradient stops) ---
// instance uvec3: x = col | row<<16 ; y = radiusPx | brightnessQ8<<16 ; z = RGB

export const GLOW_VERT = `#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in uvec3 inst;
uniform vec2 uCell;
uniform vec2 uPad;
uniform vec2 uCanvas;
out vec2 vLocal;
out vec3 vColor;
out float vBright;
void main() {
  float col = float(inst.x & 0xFFFFu);
  float row = float(inst.x >> 16);
  float radius = float(inst.y & 0xFFFFu);
  vBright = float(inst.y >> 16) / 255.0;
  vec2 center = uPad + (vec2(col, row) + 0.5) * uCell;
  vec2 pos = center + (corner - 0.5) * radius * 2.0;
  vec2 clip = (pos / uCanvas) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vLocal = corner;
  uint rgb = inst.z;
  vColor = vec3(float((rgb >> 16) & 0xFFu), float((rgb >> 8) & 0xFFu), float(rgb & 0xFFu)) / 255.0;
}`;

export const GLOW_FRAG = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec3 vColor;
in float vBright;
out vec4 outColor;
void main() {
  float d = distance(vLocal, vec2(0.5)) * 2.0;
  // Canvas radial gradient stops: 0 -> 0.7b, 0.4 -> 0.28b, 1 -> 0 (linear between)
  float a;
  if (d < 0.4) a = mix(0.7, 0.28, d / 0.4);
  else a = mix(0.28, 0.0, clamp((d - 0.4) / 0.6, 0.0, 1.0));
  a *= vBright;
  if (d > 1.0) a = 0.0;
  outColor = vec4(vColor * a, a); // premultiplied
}`;

export function compileProgram(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string): WebGLProgram {
  function compile(type: number, src: string): WebGLShader {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("gl: createShader failed");
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`gl shader compile failed: ${log}`);
    }
    return shader;
  }
  const program = gl.createProgram();
  if (!program) throw new Error("gl: createProgram failed");
  const vs = compile(gl.VERTEX_SHADER, vertSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fragSrc);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`gl program link failed: ${log}`);
  }
  return program;
}
