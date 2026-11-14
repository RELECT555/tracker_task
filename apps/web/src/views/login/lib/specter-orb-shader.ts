// Spring state comes from C/Wasm; material and light are evaluated on the GPU.
export const specterOrbVertex = `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

export const specterOrbFragment = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_resolution;
uniform float u_time;
uniform vec4 u_pointer;
uniform vec4 u_body;
uniform vec4 u_dynamics;
uniform vec4 u_ripples[4];

float hash(vec2 point) {
  vec3 p = fract(vec3(point.xyx) * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise(vec2 point) {
  vec2 cell = floor(point);
  vec2 blend = fract(point);
  blend = blend * blend * (3.0 - 2.0 * blend);
  return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), blend.x),
    mix(hash(cell + vec2(0.0, 1.0)), hash(cell + 1.0), blend.x), blend.y);
}
mat2 rotation(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}
float vapor(vec2 p) {
  float bend = noise(p * 1.12 + vec2(3.2, 8.4));
  p += vec2(bend, -bend) * 0.81;
  return noise(p) * 0.66 + noise(p * 2.13 + 7.5) * 0.25 + noise(p * 4.15 - 3.1) * 0.09;
}
void main() {
  vec3 background = vec3(8.0, 9.0, 14.0) / 255.0;
  float size = max(1.0, min(u_resolution.x, u_resolution.y));
  float pixel = 1.0 / size;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / size;
  vec2 q = p - u_body.xy;
  float squeeze = clamp(u_dynamics.x, -0.3, 1.3);
  float charge = clamp(squeeze, 0.0, 1.0);
  float energy = clamp(u_dynamics.z, 0.0, 1.0);
  float time = u_time * 0.22;
  float flowTime = time + sin(u_dynamics.w) * 0.12;
  float speed = min(length(u_body.zw), 1.5);
  vec2 direction = u_body.zw / max(length(u_body.zw), 0.001);
  vec2 tangent = vec2(-direction.y, direction.x);

  // Stretch along momentum while narrowing across it.
  float stretch = 1.0 + speed * 0.16;
  vec2 stretched = direction * dot(q, direction) / stretch + tangent * dot(q, tangent) * stretch;
  q = mix(q, stretched, smoothstep(0.001, 0.01, speed));
  float distanceToCenter = length(q);
  if (distanceToCenter > 0.56) {
    gl_FragColor = vec4(background, 1.0);
    return;
  }

  float rippleDisplacement = 0.0;
  float rippleLight = 0.0;
  float wavefront = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 ripple = u_ripples[i];
    float age = max(ripple.z, 0.0);
    float distanceFromImpact = length(p - ripple.xy);
    float envelope = exp(-age * 1.9) * clamp(ripple.w, 0.0, 1.0);
    float front = distanceFromImpact - age * 0.24;
    float wave = sin(front * 75.0) * exp(-abs(front) * 12.0) * envelope;
    rippleDisplacement += wave * 0.014;
    rippleLight += wave;
    wavefront += exp(-abs(front) * 120.0) * envelope;
  }

  vec2 radial = q / max(distanceToCenter, 0.0001);
  float angle = atan(q.y, q.x + 0.00001);
  float radius = 0.305 * (1.0 - squeeze * 0.18);
  radius += sin(angle * 3.0 - flowTime * 1.2) * (0.004 + charge * 0.017);
  radius += sin(angle * 5.0 + flowTime * 0.8) * (0.002 + energy * 0.004);
  radius += (noise(radial * 2.2 + vec2(time * 0.32, 1.4)) - 0.5) * 0.008 + rippleDisplacement;
  float edge = distanceToCenter - radius;
  float disc = 1.0 - smoothstep(-pixel, pixel, edge);
  vec2 surface = q / max(radius, 0.15);
  float depth = sqrt(max(0.0, 1.0 - dot(surface, surface)));
  vec3 normal = vec3(surface, depth);

  vec2 pointer = (u_pointer.xy - 0.5) * u_resolution / size;
  vec2 reach = pointer / max(0.35, length(pointer));
  vec2 key = mix(vec2(0.55, 0.75), reach + vec2(0.2, 0.3), u_pointer.z * 0.55);
  key /= max(length(key), 0.001);
  float rimLight = clamp(0.5 + 0.5 * dot(radial, key), 0.0, 1.0);
  float fresnel = pow(1.0 - depth, 2.8);
  vec3 blue = vec3(0.12, 0.29, 1.0);
  vec3 cyan = vec3(0.16, 0.82, 1.0);
  vec3 violet = vec3(0.57, 0.18, 0.95);
  vec3 pearl = vec3(0.75, 0.95, 1.0);
  vec3 rim = mix(violet, blue, rimLight);
  rim = mix(rim, cyan, pow(rimLight, 5.0) * 0.8);
  rim = mix(rim, pearl, charge * 0.4);
  float halo = exp(-max(edge, 0.0) * 36.0) * (1.0 - smoothstep(0.04, 0.17, edge));
  vec3 radiance = rim * halo * (0.12 + energy * 0.12 + charge * 0.12);

  // Curved layers follow the sphere's depth; compression winds them into a vortex.
  vec2 flow = rotation(-0.35 + charge * depth * 2.6 + flowTime * 0.12) * surface;
  float clouds = 0.0;
  for (int i = 0; i < 3; i++) {
    float layer = float(i);
    vec2 layerFlow = flow * (2.0 + layer * 0.81);
    layerFlow += vec2(layer * 2.6 - flowTime * 0.57, depth * (1.8 + layer * 0.7) + flowTime * 0.4);
    clouds += smoothstep(0.27, 0.8, vapor(layerFlow)) * (0.48 - layer * 0.12);
  }
  float wash = pow(clouds, 1.7);
  float currents = sin(flow.y * 7.0 + flow.x * 2.0 + depth * 8.0 + clouds * 10.0 - flowTime);
  float filaments = pow(max(0.0, 1.0 - abs(currents)), 12.0);
  float secondaryThreads = pow(max(0.0, 1.0 - abs(sin(clouds * 22.0 + depth * 5.0))), 18.0);
  float keyLight = exp(-dot(surface - key * 0.65, surface - key * 0.65) * 3.8);
  float fillLight = exp(-dot(surface + key * 0.6, surface + key * 0.6) * 4.0);
  vec3 interior = blue * (0.012 + wash * 0.2);
  interior += (cyan * keyLight + violet * fillLight) * (0.09 + wash * 0.65);
  interior += mix(violet, cyan, clouds) * filaments * (0.07 + charge * 0.28) * depth;
  interior += cyan * secondaryThreads * wash * depth * 0.14;
  interior += rim * fresnel * 0.48;

  // A pearlescent core emerges while the membrane is compressed.
  float core = exp(-dot(surface, surface) * 4.5);
  float vortex = 0.5 + 0.5 * sin(angle * 3.0 + distanceToCenter * 45.0 - flowTime * 3.0);
  interior += mix(cyan, pearl, core) * charge * (core * 0.58 + vortex * wash * 0.3);
  interior += cyan * max(0.0, rippleLight) * 0.18;
  vec3 halfVector = normalize(vec3(key * 0.7, 1.6));
  float specular = pow(max(0.0, dot(normal, halfVector)), 34.0);
  interior += pearl * specular * (0.12 + charge * 0.2);
  radiance = mix(radiance, interior, disc);

  float rimWidth = max(0.0018, pixel * 0.9);
  radiance += rim * exp(-abs(edge) / rimWidth) * (0.65 + pow(rimLight, 4.0) * 1.25);
  radiance += pearl * exp(-abs(edge + 0.004) / (rimWidth * 0.7)) * pow(rimLight, 18.0) * 0.6;

  radiance += cyan * wavefront * (1.0 - disc) * 0.2;
  radiance *= 1.0 - smoothstep(0.46, 0.55, distanceToCenter);
  vec3 color = background + (1.0 - exp(-radiance * 1.4)) * (1.0 - background);
  float grain = (hash(gl_FragCoord.xy) - 0.5) * 0.004 * (1.0 - smoothstep(0.31, 0.46, distanceToCenter));
  gl_FragColor = vec4(max(background, color + grain), 1.0);
}
`;
