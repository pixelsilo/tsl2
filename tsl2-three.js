<!-- Import map -->

{
  "imports": {
    "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
    "three/examples/jsm/controls/OrbitControls.js": "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js",
    "three/examples/jsm/loaders/GLTFLoader.js": "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js",
    "three/examples/jsm/loaders/EXRLoader.js": "https://unpkg.com/three@0.160.0/examples/jsm/loaders/EXRLoader.js",
    "three/examples/jsm/environments/RoomEnvironment.js": "https://unpkg.com/three@0.160.0/examples/jsm/environments/RoomEnvironment.js",
    "three/examples/jsm/postprocessing/EffectComposer.js": "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js",
    "three/examples/jsm/postprocessing/RenderPass.js": "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/RenderPass.js",
    "three/examples/jsm/postprocessing/OutlinePass.js": "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/OutlinePass.js"
  }
}

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";

/* ---------- Read CMS config + labels ---------- */
function readMeshConfigAndLabels() {
  const map = {};
  document.querySelectorAll(".mesh-config").forEach(cfg => {
    const name  = (cfg.getAttribute("data-mesh") || "").trim();
    if (!name) return;
    const color = (cfg.getAttribute("data-color") || "").trim();
    const link  = (cfg.getAttribute("data-link") || "").trim();
    const title = (cfg.getAttribute("data-name") || "").trim();
    const item = cfg.closest(".w-dyn-item");
    const labelEl = item?.querySelector(".label") || null; // your existing label node
    map[name] = { color: color || null, link: link || null, title: title || null, labelEl };
  });
  return map;
}
const CONFIG = readMeshConfigAndLabels();
const INTERACTIVE_NAMES = new Set(Object.keys(CONFIG));

/* ---------- Container ---------- */
const WRAP = document.getElementById("three-wrap");

/* ---------- Scene, camera, renderer (soft shadows) ---------- */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const camera = new THREE.PerspectiveCamera(50, WRAP.clientWidth/WRAP.clientHeight, 0.1, 100);
camera.position.set(2.8, 2.0, 3.2);
camera.lookAt(0,0,0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(WRAP.clientWidth, WRAP.clientHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
WRAP.appendChild(renderer.domElement);

/* ---------- Overlay for labels (reuses your .label elements) ---------- */
const overlay = document.createElement("div");
overlay.style.position = "absolute";
overlay.style.left = "0";
overlay.style.top = "0";
overlay.style.width = "100%";
overlay.style.height = "100%";
overlay.style.pointerEvents = "none";
WRAP.appendChild(overlay);

/* ---------- Environment: EXR with fallback ---------- */
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
const EXR_URL = "https://pixelsilo.s3.eu-west-2.amazonaws.com/docklands_02_1k.exr";
function setFallbackRoomEnv() {
  const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = tex;
}
const caps = renderer.capabilities;
const floatOK = caps.isWebGL2 || renderer.extensions.has?.("OES_texture_float");
if (!floatOK) {
  setFallbackRoomEnv();
} else {
  new EXRLoader().setDataType(THREE.FloatType).load(
    EXR_URL,
    (tex) => {
      const env = pmrem.fromEquirectangular(tex).texture;
      scene.environment = env;
      // scene.background = env; // uncomment to show HDRI
      tex.dispose();
      pmrem.dispose();
    },
    undefined,
    () => setFallbackRoomEnv()
  );
}

/* ---------- Lights ---------- */
scene.add(new THREE.HemisphereLight(0xffffff, 0xb0b0b0, 0.6));
const dir = new THREE.DirectionalLight(0xffffff, 1.1);
dir.position.set(4, 6, 3);
dir.castShadow = true;
dir.shadow.mapSize.set(2048, 2048);
dir.shadow.bias = -0.0005;
dir.shadow.normalBias = 0.02;
dir.shadow.camera.near = 0.1;
dir.shadow.camera.far = 50;
dir.shadow.camera.left   = -5;
dir.shadow.camera.right  =  5;
dir.shadow.camera.top    =  5;
dir.shadow.camera.bottom = -5;
scene.add(dir);
// subtle fill (no shadows)
const fill = new THREE.DirectionalLight(0xffffff, 0.35);
fill.position.set(-3, 2, -4);
fill.castShadow = false;
scene.add(fill);

/* ---------- Controls ---------- */
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 0.5;
controls.maxDistance = 10;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.6;

/* Keep camera above the “ground plane”:
   phi (polar) is 0 at +Y (top), PI/2 at horizon, PI at -Y (below).
   We cap at just under the horizon so the camera never goes “under”.
*/
controls.minPolarAngle = 0.9;                 // optional: avoid straight top-down singularity
controls.maxPolarAngle = Math.PI * 0.5 - 0.05; // ≈ 87°, never below horizon

// cancel a pending click when dragging starts
controls.addEventListener("start", () => { downMeshName = null; });


/* ---------- Postprocessing (Outline) ---------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const outlinePass = new OutlinePass(new THREE.Vector2(WRAP.clientWidth, WRAP.clientHeight), scene, camera);
outlinePass.edgeStrength = 3.0;
outlinePass.edgeThickness = 1.0;
outlinePass.visibleEdgeColor.set(0x222222);
outlinePass.hiddenEdgeColor.set(0xffffff);
composer.addPass(outlinePass);

/* ---------- Interactivity (only CMS-listed meshes) ---------- */
let downMeshName = null;
let downScreen = { x: 0, y: 0 };
const CLICK_EPS = 6; // px
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hovered = null;

const originalColors = new Map();   // hover baseline
const exportBaseColors = new Map(); // exported glTF color
const cmsColors = new Map();        // CMS color (or fallback)
const labelBindings = new Map();    // mesh -> { el }
const interactiveMeshes = [];       // raycast targets only
const meshesByName = new Map();     // name -> mesh (for camera focusing)

function setPointerFromEvent(event) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((event.clientY - r.top) / r.height) * 2 + 1;
}
function firstMeshHit() {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(interactiveMeshes, true);
  return hits.find(h => h.object?.isMesh) || null;
}
function onPointerMove(e) {
  setPointerFromEvent(e);
  const hit = firstMeshHit();
  if (hovered && (!hit || hit.object !== hovered)) {
    const base = originalColors.get(hovered);
    if (base) hovered.material.color.copy(base);
    hovered = null;
    outlinePass.selectedObjects = [];
    renderer.domElement.style.cursor = "default";
  }
  if (hit && hit.object !== hovered) {
    hovered = hit.object;
    const base = originalColors.get(hovered);
    if (base) hovered.material.color.set(base.clone().multiplyScalar(1.25));
    outlinePass.selectedObjects = [hovered];
    renderer.domElement.style.cursor = "pointer";
  }
}
renderer.domElement.addEventListener("pointermove", onPointerMove, { passive: true });

function resolveInteractiveName(obj) {
  let m = obj;
  while (m && !INTERACTIVE_NAMES.has(m.name) && m.parent) m = m.parent;
  return m?.name || null;
}
renderer.domElement.addEventListener("pointerdown", (e) => {
  setPointerFromEvent(e);
  const hit = firstMeshHit();
  downMeshName = hit ? resolveInteractiveName(hit.object) : null;
  downScreen.x = e.clientX; downScreen.y = e.clientY;
}, { passive: true });

renderer.domElement.addEventListener("pointerup", (e) => {
  const dx = e.clientX - downScreen.x;
  const dy = e.clientY - downScreen.y;
  if (Math.hypot(dx, dy) > CLICK_EPS || !downMeshName) { downMeshName = null; return; }
  setPointerFromEvent(e);
  const hit = firstMeshHit();
  const upMeshName = hit ? resolveInteractiveName(hit.object) : null;
  if (upMeshName && upMeshName === downMeshName) {
    const cfg = CONFIG[upMeshName];
    if (cfg?.link) window.open(cfg.link, "_blank", "noopener");
  }
  downMeshName = null;
}, { passive: true });
renderer.domElement.addEventListener("pointercancel", () => { downMeshName = null; }, { passive: true });
renderer.domElement.addEventListener("pointerleave",  () => { downMeshName = null; }, { passive: true });

/* ---------- Availability overlay toggle (button) ---------- */
let overlayOn = false;
const overlayBtn = document.querySelector("._3js_button-holder .toggle-button");
function syncButtonUI() {
  if (!overlayBtn) return;
  overlayBtn.classList.toggle("is_toggled", overlayOn);
  overlayBtn.setAttribute("aria-pressed", overlayOn ? "true" : "false");
  const label = overlayBtn.querySelector("div");
  if (label) label.textContent = overlayOn ? "Hide availability overlay" : "Show availability overlay";
}
function applyOverlay(on) {
  interactiveMeshes.forEach((mesh) => {
    const base = on ? cmsColors.get(mesh) : exportBaseColors.get(mesh);
    if (base) {
      mesh.material.color.copy(base);
      originalColors.set(mesh, base.clone());
    }
  });
  if (hovered) {
    const base = originalColors.get(hovered);
    if (base) hovered.material.color.copy(base);
    outlinePass.selectedObjects = hovered ? [hovered] : [];
  }
}
overlayBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  overlayOn = !overlayOn;
  applyOverlay(overlayOn);
  syncButtonUI();
});
if (overlayBtn?.classList.contains("is_toggled")) overlayOn = true;
syncButtonUI();

/* ---------- Load GLTF, shadows, CMS binding, labels ---------- */
const loader = new GLTFLoader();
loader.load(
  "https://pixelsilo.s3.eu-west-2.amazonaws.com/three-cubes-14.gltf",
  (gltf) => {
    const root = gltf.scene;
    scene.add(root);

    // center & frame
    const fullBox = new THREE.Box3().setFromObject(root);
    const size = fullBox.getSize(new THREE.Vector3());
    const center = fullBox.getCenter(new THREE.Vector3());
    root.position.sub(center);
    camera.position.set(0, size.length() * 0.35, size.length() * 1.1);
    camera.lookAt(0,0,0);
    controls.target.set(0,0,0);

    // shadow-catcher ground
    const minY = new THREE.Box3().setFromObject(root).min.y;
    const groundSize = Math.max(size.x, size.z) * 4;
    const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.35 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = minY - 0.01;
    ground.receiveShadow = true;
    scene.add(ground);

    // tighten shadow frustum
    const pad = Math.max(size.x, size.z) * 0.75;
    dir.shadow.camera.left   = -pad;
    dir.shadow.camera.right  =  pad;
    dir.shadow.camera.top    =  pad;
    dir.shadow.camera.bottom = -pad;
    dir.shadow.camera.near   = 0.1;
    dir.shadow.camera.far    = Math.max(10, size.length() * 3);
    dir.shadow.camera.updateProjectionMatrix();

    // traverse meshes
    root.traverse((o) => {
      if (!o.isMesh || !o.material) return;

      o.material = o.material.clone();
      if ("metalness" in o.material && !scene.environment) o.material.metalness = 0.0;
      if (!o.material.color) o.material.color = new THREE.Color(0xaaaaaa);

      // shadows
      o.castShadow = true;
      o.receiveShadow = true;

      // register by name for camera focusing
      meshesByName.set(o.name, o);

      // record exported base color BEFORE CMS
      exportBaseColors.set(o, o.material.color.clone());

      const isInteractive = INTERACTIVE_NAMES.has(o.name);
      if (isInteractive) {
        const cfg = CONFIG[o.name];

        // store CMS color (or fallback to exported)
        if (cfg?.color) {
          try { cmsColors.set(o, new THREE.Color(cfg.color)); }
          catch { cmsColors.set(o, exportBaseColors.get(o).clone()); }
        } else {
          cmsColors.set(o, exportBaseColors.get(o).clone());
        }

        // register for interactions
        originalColors.set(o, o.material.color.clone());
        interactiveMeshes.push(o);

        // bind label (centered)
        if (cfg?.labelEl) {
          const el = cfg.labelEl;
          overlay.appendChild(el);
          el.style.position = "absolute";
          el.style.transform = "translate(-50%, -50%)"; // center over mesh
          el.style.pointerEvents = "auto";
          if (cfg.link) {
            el.style.cursor = "pointer";
            el.addEventListener("click", (ev) => {
              ev.stopPropagation();
              window.open(cfg.link, "_blank", "noopener");
            });
          }
          labelBindings.set(o, { el });
        }
      }
    });

    // apply current overlay state
    applyOverlay(overlayOn);

    // now that meshesByName is filled, hook up the list buttons
    setupListButtons();
  },
  undefined,
  (err) => console.error("GLTF load error:", err)
);

/* ---------- SMART LABELS: de-clutter, hide occluded, fade by distance ---------- */
const MAX_LABELS = 6;   // max labels visible
const MIN_SEP_PX = 52;  // spacing between labels
const ALLOW_OCCLUDED = false; // true = ignore occlusion

function rectsOverlap(a, b, pad = 0) {
  return !(a.right < b.left - pad || a.left > b.right + pad ||
           a.bottom < b.top - pad || a.top > b.bottom + pad);
}
function isOccluded(mesh, worldPoint) {
  if (ALLOW_OCCLUDED) return false;
  const dir = new THREE.Vector3().subVectors(worldPoint, camera.position).normalize();
  const ray = new THREE.Raycaster(camera.position, dir);
  const hits = ray.intersectObjects(scene.children, true);
  if (!hits.length) return false;
  const first = hits[0].object;
  let m = first;
  while (m && m !== mesh) m = m.parent;
  return !m; // first hit was NOT this mesh => occluded
}

const _v = new THREE.Vector3();
function updateLabels() {
  const rect = renderer.domElement.getBoundingClientRect();
  const placedRects = [];
  let shown = 0;

  // Build candidates; ensure hovered first, then nearest
  const entries = [];
  labelBindings.forEach(({ el }, mesh) => {
    new THREE.Box3().setFromObject(mesh).getCenter(_v);
    const world = _v.clone();
    _v.project(camera);

    const off = _v.z > 1 || _v.z < -1 || _v.x < -1.2 || _v.x > 1.2 || _v.y < -1.2 || _v.y > 1.2;
    if (off) { entries.push({ mesh, el, skip:true, depth: Infinity }); return; }

    const sx = (_v.x * 0.5 + 0.5) * rect.width;
    const sy = (-_v.y * 0.5 + 0.5) * rect.height;
    entries.push({ mesh, el, sx, sy, world, depth: camera.position.distanceTo(world), skip:false });
  });

  entries.sort((a, b) => {
    const ah = (hovered && a.mesh === hovered) ? -1 : 0;
    const bh = (hovered && b.mesh === hovered) ? -1 : 0;
    if (ah !== bh) return ah - bh;
    return a.depth - b.depth; // nearer first
  });

  for (const e of entries) {
    if (e.skip) { e.el.style.display = "none"; continue; }
    if (shown >= MAX_LABELS && (!hovered || e.mesh !== hovered)) { e.el.style.display = "none"; continue; }

    const occ = isOccluded(e.mesh, e.world);
    if (occ && (!hovered || e.mesh !== hovered)) { e.el.style.display = "none"; continue; }

    e.el.style.display = "block";
    e.el.style.left = `${e.sx}px`;
    e.el.style.top  = `${e.sy}px`;

    const bb = e.el.getBoundingClientRect();
    const r = { left: bb.left, top: bb.top, right: bb.right, bottom: bb.bottom };
    const collides = placedRects.some(pr => rectsOverlap(pr, r, MIN_SEP_PX));
    if (collides && (!hovered || e.mesh !== hovered)) {
      e.el.style.display = "none";
      continue;
    }

    // subtle distance fade (near=1, far≈0.4). Invert this if you want near labels fainter.
    const fade = THREE.MathUtils.clamp(1.2 - (e.depth / 12), 0.4, 1);
    e.el.style.opacity = fade.toFixed(3);

    placedRects.push(r);
    shown++;
  }

  // ensure hovered label visible & fully opaque
  if (hovered && labelBindings.has(hovered)) {
    const { el } = labelBindings.get(hovered);
    el.style.display = "block";
    el.style.opacity = "1";
  }
}

/* ---------- Camera orbit-to-selected (keep target fixed + polar clamp) ---------- */

// tiny tween helper (ease in/out)
function tween(duration, onUpdate, onDone) {
  const t0 = performance.now();
  function easeInOutCubic(x){ return x < 0.5 ? 4*x*x*x : 1 - Math.pow(-2*x+2, 3)/2; }
  function step() {
    const t = (performance.now() - t0) / duration;
    const k = t >= 1 ? 1 : easeInOutCubic(t);
    onUpdate(k);
    if (t < 1) requestAnimationFrame(step); else onDone?.();
  }
  requestAnimationFrame(step);
}

// clamp a unit direction vector to OrbitControls polar limits
function clampDirToPolar(dir) {
  // dir is from target to camera; convert to spherical
  const sph = new THREE.Spherical().setFromVector3(dir);
  // sph.phi is polar angle [0..PI]; enforce controls limits
  const min = controls.minPolarAngle ?? 0;
  const max = controls.maxPolarAngle ?? Math.PI;
  sph.phi = THREE.MathUtils.clamp(sph.phi, min, max);
  // rebuild the direction with radius 1
  dir.setFromSpherical(sph).normalize();
  return dir;
}

/**
 * Rotate camera around the EXISTING controls.target so the selected mesh center
 * is most “in front” of the camera. We DO NOT move the target or change radius.
 * We also clamp polar angle so the camera never goes below the floor.
 */
function orbitToMeshByName(name, opts = {}) {
  const mesh = meshesByName.get(name);
  if (!mesh) return;

  // Fixed orbit center and current radius
  const target = controls.target.clone();
  const radius = camera.position.distanceTo(target);

  // Current and desired view directions (unit vectors from target)
  const startDir = camera.position.clone().sub(target).normalize();
  const meshCenter = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
  let endDir = meshCenter.clone().sub(target).normalize();

  // Guard: if endDir is degenerate, keep current dir
  if (!isFinite(endDir.x) || !isFinite(endDir.y) || !isFinite(endDir.z)) {
    endDir = startDir.clone();
  }

  // Clamp BOTH ends to allowed polar range
  const startClamped = clampDirToPolar(startDir.clone());
  const endClamped   = clampDirToPolar(endDir.clone());

  // Rotation that maps start->end on the unit sphere
  const fullRot = new THREE.Quaternion().setFromUnitVectors(startClamped, endClamped);

  // Pause autorotate during the move
  const wasAuto = controls.autoRotate;
  controls.autoRotate = false;

  tween(opts.duration || 900,
    (k) => {
      // Slerp a partial rotation between the clamped directions
      const q = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), fullRot, k);
      let dirK = startClamped.clone().applyQuaternion(q).normalize();

      // Safety: clamp each frame (handles numeric drift)
      dirK = clampDirToPolar(dirK);

      // New camera position on same radius, still looking at fixed target
      const nextPos = target.clone().add(dirK.multiplyScalar(radius));
      camera.position.copy(nextPos);
      camera.lookAt(target);
      controls.update();
    },
    () => { controls.autoRotate = wasAuto; }
  );
}

/* Hook list buttons -> orbit-to-selected */
function setupListButtons() {
  document.querySelectorAll(".w-dyn-item .list-button").forEach(btn => {
    const item = btn.closest(".w-dyn-item");
    const meshName = item?.querySelector(".mesh-config")?.getAttribute("data-mesh");
    if (!meshName) return;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      orbitToMeshByName(meshName);
    });
  });
}

/* ---------- Resize + render ---------- */
function onResize(){
  const w = WRAP.clientWidth, h = WRAP.clientHeight;
  camera.aspect = w/h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  outlinePass.setSize(w, h);
}
new ResizeObserver(onResize).observe(WRAP);
window.addEventListener("resize", onResize);

(function animate(){
  requestAnimationFrame(animate);
  controls.update();
  composer.render();
  updateLabels();
})();
