import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CylinderGeometry,
  DirectionalLight,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  OrthographicCamera,
  PCFShadowMap,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  Shape,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// A shallow, bevelled section keeps the path a ribbon rather than a tube.
const ribbonProfile = [
  [-0.27, -0.04], [-0.3, -0.015], [-0.3, 0.025], [-0.27, 0.055],
  [0.27, 0.055], [0.3, 0.025], [0.3, -0.015], [0.27, -0.04],
] as const;

function ribbonGeometry(curve: CatmullRomCurve3) {
  const segments = 120;
  const vertices: number[] = [];
  const indices: number[] = [];
  const up = new Vector3(0, 1, 0);
  const width = ribbonProfile.length;
  for (let step = 0; step <= segments; step++) {
    const t = step / segments;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    const across = new Vector3().crossVectors(up, tangent).normalize();
    const normal = new Vector3().crossVectors(tangent, across).normalize();
    for (const [u, v] of ribbonProfile) {
      const vertex = point.clone().addScaledVector(across, u).addScaledVector(normal, v);
      vertices.push(vertex.x, vertex.y, vertex.z);
    }
    if (step === segments) break;
    for (let side = 0; side < width; side++) {
      const a = step * width + side;
      const b = step * width + (side + 1) % width;
      indices.push(a, a + width, b, b, a + width, b + width);
    }
  }
  const end = segments * width;
  for (let side = 1; side < width - 1; side++) {
    indices.push(0, side, side + 1, end, end + side + 1, end + side);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function archGeometry() {
  const arch = new Shape();
  arch.moveTo(-0.72, 0);
  arch.lineTo(-0.72, 0.83);
  arch.absarc(0, 0.83, 0.72, Math.PI, 0, true);
  arch.lineTo(0.72, 0);
  arch.lineTo(0.49, 0);
  arch.lineTo(0.49, 0.83);
  arch.absarc(0, 0.83, 0.49, 0, Math.PI, false);
  arch.lineTo(-0.49, 0);
  arch.closePath();
  return new ExtrudeGeometry(arch, {
    depth: 0.23, bevelEnabled: true, bevelSize: 0.045,
    bevelThickness: 0.045, bevelSegments: 4, steps: 1, curveSegments: 36,
  });
}

function makeRoute() {
  const route = new Group();
  const pearl = new MeshPhysicalMaterial({
    color: '#e6e2f2', metalness: 0.12, roughness: 0.3, clearcoat: 0.45,
  });
  const edge = new MeshPhysicalMaterial({
    color: '#6b53ad', metalness: 0.38, roughness: 0.26, clearcoat: 0.5,
  });
  const violet = new MeshPhysicalMaterial({
    color: '#7543eb', metalness: 0.3, roughness: 0.22,
    clearcoat: 0.85, clearcoatRoughness: 0.15,
  });
  const light = new MeshPhysicalMaterial({
    color: '#d6bcff', metalness: 0.1, roughness: 0.25,
    emissive: '#9d6bf0', emissiveIntensity: 0.35,
  });
  const mint = new MeshPhysicalMaterial({
    color: '#99ebd6', metalness: 0.28, roughness: 0.18,
    clearcoat: 1, clearcoatRoughness: 0.12,
  });
  const steps = [
    { x: -2.65, y: 0.05, z: 0.55 },
    { x: 0, y: 0.65, z: 0 },
    { x: 2.65, y: 1.25, z: -0.55 },
  ];
  const slabGeometry = new RoundedBoxGeometry(2.45, 0.32, 1.95, 4, 0.14);
  const edgeGeometry = new RoundedBoxGeometry(2.36, 0.14, 1.86, 3, 0.065);
  for (const { x, y, z } of steps) {
    const slab = new Mesh(slabGeometry, pearl);
    slab.position.set(x, y, z);
    slab.castShadow = true;
    slab.receiveShadow = true;
    const rim = new Mesh(edgeGeometry, edge);
    rim.position.set(x, y - 0.2, z);
    rim.castShadow = true;
    route.add(slab, rim);
  }

  // Each climb reaches the next landing before its leading edge.
  const curve = new CatmullRomCurve3([
    new Vector3(-3.3, 0.265, 0.82),
    new Vector3(-2.5, 0.265, 0.68),
    new Vector3(-2.02, 0.325, 0.48),
    new Vector3(-1.73, 0.645, 0.26),
    new Vector3(-1.44, 0.872, 0.03),
    new Vector3(-1.1, 0.87, -0.18),
    new Vector3(-0.5, 0.87, -0.32),
    new Vector3(0.25, 0.87, -0.14),
    new Vector3(0.72, 0.89, 0.04),
    new Vector3(1.02, 1.185, 0.11),
    new Vector3(1.3, 1.47, 0.115),
    new Vector3(1.72, 1.465, -0.055),
    new Vector3(2.3, 1.465, -0.48),
    new Vector3(3.25, 1.465, -0.55),
  ]);
  const path = new Mesh(ribbonGeometry(curve), violet);
  path.castShadow = true;
  path.receiveShadow = true;
  route.add(path);
  const line = Array.from({ length: 97 }, (_, index) => {
    const t = index / 96;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    const across = new Vector3().crossVectors(new Vector3(0, 1, 0), tangent).normalize();
    const normal = new Vector3().crossVectors(tangent, across).normalize();
    return point.addScaledVector(normal, 0.06);
  });
  route.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(line), 120, 0.015, 6, false), light));
  for (const t of [0.015, 0.49]) {
    const point = curve.getPointAt(t);
    const puck = new Mesh(new CylinderGeometry(0.19, 0.21, 0.1, 40), pearl);
    puck.position.copy(point).add(new Vector3(0, 0.11, 0));
    puck.castShadow = true;
    const ring = new Mesh(new TorusGeometry(0.115, 0.025, 8, 40), violet);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(point).add(new Vector3(0, 0.17, 0));
    route.add(puck, ring);
  }
  const finish = new Mesh(archGeometry(), mint);
  finish.position.set(2.86, 1.43, -0.55);
  finish.rotation.y = Math.PI / 2;
  finish.castShadow = true;
  finish.receiveShadow = true;
  route.add(finish);
  // An inset at the destination gives the arch a machined, finished edge.
  const archInset = new Mesh(archGeometry(), light);
  archInset.scale.set(0.87, 0.94, 0.15);
  archInset.rotation.y = Math.PI / 2;
  archInset.position.set(2.81, 1.44, -0.55);
  route.add(archInset);
  return { route, materials: [pearl, edge, violet, light, mint] };
}

export function createRouteBoard(canvas: HTMLCanvasElement) {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  const gl = renderer.getContext();
  renderer.setClearColor('#16132a', 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  const scene = new Scene();
  // PMREM renders to half-float targets. The directional lights also work
  // on WebGL2 devices that cannot render to those targets.
  const studio = renderer.extensions.has('EXT_color_buffer_float') ? new RoomEnvironment() : null;
  let reflections: WebGLRenderTarget | null = null;
  scene.environmentIntensity = 0.75;
  const camera = new OrthographicCamera(-5, 5, 3, -3, 0.1, 40);
  camera.position.set(5.4, 5.2, 10);
  camera.lookAt(0, 0.85, 0);
  camera.updateMatrixWorld();
  const { route, materials } = makeRoute();
  scene.add(route, new AmbientLight('#d7d1ff', 0.45));
  const key = new DirectionalLight('#fff5e9', 2);
  key.position.set(-3, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 2;
  key.shadow.camera.left = -6;
  key.shadow.camera.right = 6;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -6;
  key.shadow.normalBias = 0.025;
  key.shadow.bias = -0.0002;
  const rim = new DirectionalLight('#a999ff', 2);
  rim.position.set(2, 3, -5);
  scene.add(key, rim);
  // A broad contact shadow grounds the floating miniature without hard silhouettes.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const shadowContext = shadowCanvas.getContext('2d');
  if (shadowContext) {
    const gradient = shadowContext.createRadialGradient(64, 64, 5, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
    gradient.addColorStop(0.45, 'rgba(0, 0, 0, 0.2)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    shadowContext.fillStyle = gradient;
    shadowContext.fillRect(0, 0, 128, 128);
  }
  const shadowTexture = new CanvasTexture(shadowCanvas);
  const shadowMaterial = new MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false });
  const floor = new Mesh(new PlaneGeometry(10, 4.5), shadowMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.5;
  scene.add(floor);
  const modelBounds = new Box3();
  const viewBounds = new Box3();
  const meshBounds = new Box3();
  const modelView = new Matrix4();
  // Release render targets while the old context is lost, before its replacement
  // becomes active. GPU-generated maps cannot be restored from CPU image data.
  function releaseTargets() {
    scene.environment = null;
    reflections?.dispose();
    reflections = null;
    key.shadow.dispose();
    key.shadow.map = null;
  }
  canvas.addEventListener('webglcontextlost', releaseTargets);
  function render(yaw: number, pitch: number) {
    const { clientWidth: width, clientHeight: height } = canvas;
    if (!width || !height || gl.isContextLost()) return false;
    if (studio && !reflections) {
      const generator = new PMREMGenerator(renderer);
      try {
        reflections = generator.fromScene(studio, 0.04);
        scene.environment = reflections.texture;
      } finally {
        generator.dispose();
      }
    }
    const aspect = width / height;
    route.rotation.set(pitch, yaw, 0);
    floor.position.y = modelBounds.setFromObject(route).min.y - 0.28;

    // Measure in camera space so extreme tilts keep the arch in frame.
    viewBounds.makeEmpty();
    route.traverse((object) => {
      if (!(object instanceof Mesh) || !object.geometry.boundingBox) return;
      modelView.multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld);
      viewBounds.union(meshBounds.copy(object.geometry.boundingBox).applyMatrix4(modelView));
    });
    const padding = 0.14;
    const halfHeight = Math.max(2.45, 4.65 / aspect, (viewBounds.max.y - viewBounds.min.y) / 2 + padding);
    const centerY = Math.min(viewBounds.min.y - padding + halfHeight, Math.max(0, viewBounds.max.y + padding - halfHeight));
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = centerY + halfHeight;
    camera.bottom = centerY - halfHeight;
    camera.updateProjectionMatrix();
    if (renderer.domElement.width !== Math.floor(width * renderer.getPixelRatio())
      || renderer.domElement.height !== Math.floor(height * renderer.getPixelRatio())) {
      renderer.setSize(width, height, false);
    }
    renderer.render(scene, camera);
    return !gl.isContextLost();
  }
  function dispose() {
    canvas.removeEventListener('webglcontextlost', releaseTargets);
    releaseTargets();
    const geometries = new Set<BufferGeometry>();
    route.traverse((object) => {
      if (object instanceof Mesh) geometries.add(object.geometry);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    floor.geometry.dispose();
    shadowMaterial.dispose();
    shadowTexture.dispose();
    studio?.dispose();
    renderer.dispose();
  }
  return { render, dispose };
}
