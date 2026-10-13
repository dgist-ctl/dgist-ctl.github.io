// 달구 3D v3 — Blender 에서 만든 dalgu.glb(뼈대·쉐이프키·동작 6개)를 싣는다. 2026-10-13
// 근거: student_tutor/docs/specs/2026-10-13-달구-Blender-design_v1.1.md
// 원본: student_tutor/dalgu_blender/ (python build.py → dalgu.glb). 이전 판(도형 생성)은 dalgu3d_v2.js.
//
//   const d = await mountDalgu(box, { size: 88, framing: "full" });   // 실패하면 null
//   d.set("idle" | "think" | "nod" | "talk" | "hop" | "wave");
//   d.lookAt(nx, ny);   // -1 ~ 1, 오른쪽·아래가 +
//   d.dispose();
//
// 첫 프레임을 그린 뒤에야 box 에 캔버스를 넣는다 — 호출한 쪽은 null 이면 PNG 를 그대로 두면 된다.
import * as THREE from "./vendor/three.module.min.js";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import { clone as cloneSkinned } from "./vendor/SkeletonUtils.js";

const K = 1.5 / 305;
const O = (x, y) => [(x - 292) * K, -(y - 265) * K];     // 공식 그림 px → 세계 좌표
const GLB = new URL("./dalgu.glb", import.meta.url).href;
const ONCE = { nod: 1, wave: 1, hop: 1 };                  // 한 번 하고 idle 로 돌아가는 동작
// 멈춘 그림(still·스냅샷·맞춤)에 쓰는 순간(초) — anim.py 의 pose 프레임 / 24
const POSE = { idle: 0, think: 1, nod: 9 / 24, talk: 4 / 24, wave: 22 / 24, hop: 12 / 24 };
const FADE = 0.25;

let gltfP = null;                                          // 한 번만 내려받고 붙일 때마다 복제한다
function loadGltf() {
  if (!gltfP) gltfP = new GLTFLoader().loadAsync(GLB).catch((e) => { gltfP = null; throw e; });
  return gltfP;
}

// Blender 재질 이름 약속: *_unlit = 빛을 받지 않는 색, decal = 얼굴 그림(반투명 막)
function fixMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;                               // 뼈로 움직이면 경계 상자가 맞지 않는다
    const m = o.material;
    if (/_unlit$/.test(m.name)) {
      o.material = new THREE.MeshBasicMaterial({ color: m.color, map: m.map, transparent: !!m.map, side: THREE.DoubleSide });
    } else if (m.name === "decal") {
      m.transparent = true; m.depthWrite = false; m.polygonOffset = true; m.polygonOffsetFactor = -2;
    }
  });
}

const FRAMING = {
  full: { y: -0.36, h: 2.6 },      // 잔머리 끝 ~ 발
  bust: { y: -0.12, h: 1.85 },     // 머리 + 어깨
  face: { y: -0.02, h: 1.72 },     // 동그란 얼굴 칸(자료에 묻기) — 깡충해도 잔머리가 남게
};

export async function mountDalgu(box, opt = {}) {
  const size = opt.size || 88;
  const frame = FRAMING[opt.framing || "full"];
  // WebGL 이 없으면 three 가 콘솔에 오류를 남긴다 — 먼저 조용히 물어본다.
  const probe = document.createElement("canvas");
  if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) return null;
  let gltf;
  try { gltf = await loadGltf(); } catch (e) { return null; }
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power", preserveDrawingBuffer: !!(opt.ortho || opt.snapshot) });
  } catch (e) { return null; }
  if (!renderer.getContext()) return null;
  renderer.setPixelRatio(opt.ortho ? 1 : Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(size, size);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  const canvas = renderer.domElement;
  canvas.style.cssText = `width:${size}px;height:${size}px;display:block`;
  canvas.setAttribute("aria-hidden", "true");

  const scene = new THREE.Scene();
  let cam;
  if (opt.ortho) {                                         // 공식 그림과 겹쳐 맞출 때 — [left, right, top, bottom] 공식 px
    const [l, t] = O(opt.ortho[0], opt.ortho[2]), [r, b] = O(opt.ortho[1], opt.ortho[3]);
    cam = new THREE.OrthographicCamera(l, r, t, b, 0.1, 50);
    cam.position.set(0, 0, 10);
  } else {
    const fov = 16;
    cam = new THREE.PerspectiveCamera(fov, 1, 0.1, 80);
    const dist = (frame.h / 2) / Math.tan((fov / 2) * Math.PI / 180);
    cam.position.set(0, frame.y + 0.08, dist);
    cam.lookAt(0, frame.y, 0);
  }
  // 풍선 비닐처럼 — 스튜디오 환경광, 위 왼쪽 주광, 뒤 테두리광(v2 와 같다)
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.75;
  pmrem.dispose();
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(-1.2, 2.2, 3);
  const rim = new THREE.DirectionalLight(0xdfeaff, 1.2);
  rim.position.set(1.5, 1.0, -2.5);
  scene.add(key, rim);

  const model = cloneSkinned(gltf.scene);
  fixMaterials(model);
  scene.add(model);
  const bone = (n) => model.getObjectByName(n);
  const B = { root: bone("root"), head: bone("head"), eyes: [bone("eye_L"), bone("eye_R")] };
  const hairs = [];
  model.traverse((o) => { if (o.morphTargetDictionary && "dna" in o.morphTargetDictionary) hairs.push(o); });

  const mixer = new THREE.AnimationMixer(model);
  const acts = {};
  for (const clip of gltf.animations) {
    const a = mixer.clipAction(clip);
    if (ONCE[clip.name]) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    acts[clip.name] = a;
  }
  if (!acts.idle || !B.head || !B.root) { renderer.dispose(); return null; }

  const still = opt.still ?? matchMedia("(prefers-reduced-motion: reduce)").matches;
  const st = { mood: "idle", look: [0, 0], lookNow: [0, 0], dna: 0, spike: 0, nextBlink: 1.5, blinkAt: -9, turn: 0 };
  const clock = new THREE.Clock();
  let cur = acts.idle, raf = 0, visible = true, alive = true, seeking = false;
  cur.play();
  mixer.addEventListener("finished", (e) => { if (!still && !seeking && e.action === cur) set("idle"); });

  const q = new THREE.Quaternion(), eu = new THREE.Euler();
  // 동작 위에 얹는 것(바라보기·깜빡임). ★three 믹서는 값이 바뀐 뼈만 다시 쓴다 — 늘 1 인 눈 크기, 멈춘 자세의
  // 머리 회전은 다시 쓰지 않으므로 얹은 채로 두면 쌓인다(눈이 0 으로 쪼그라든 사고, 10-13).
  // 그래서 믹서를 돌리기 전에 지난번에 얹은 것을 언제나 되돌린다(unoverlay → 믹서 → overlay).
  const last = { root: new THREE.Quaternion(), head: new THREE.Quaternion(), lid: 1 };
  function unoverlay() {
    B.root.quaternion.multiply(q.copy(last.root).invert());
    B.head.quaternion.multiply(q.copy(last.head).invert());
    B.eyes.forEach((e) => { if (e) e.scale.y /= last.lid; });
    last.root.identity(); last.head.identity(); last.lid = 1;
  }
  function overlay(instant) {
    const k = instant ? 1 : 0.12;
    st.lookNow[0] += (st.look[0] - st.lookNow[0]) * k;
    st.lookNow[1] += (st.look[1] - st.lookNow[1]) * k;
    last.root.setFromEuler(eu.set(0, st.lookNow[0] * 0.2 + st.turn, 0));
    last.head.setFromEuler(eu.set(st.lookNow[1] * 0.25, st.lookNow[0] * 0.38, 0));
    B.root.quaternion.multiply(last.root);
    B.head.quaternion.multiply(last.head);
    const dnaT = st.mood === "think" ? 1 : 0, spikeT = st.mood === "hop" ? 1 : 0;
    st.dna += (dnaT - st.dna) * (instant ? 1 : 0.08);
    st.spike += (spikeT - st.spike) * (instant ? 1 : 0.25);
    for (const h of hairs) {
      h.morphTargetInfluences[h.morphTargetDictionary.dna] = st.dna;
      h.morphTargetInfluences[h.morphTargetDictionary.spike] = st.spike;
    }
    let lid = 1;
    if (!instant) {
      const t = clock.elapsedTime;
      if (t > st.nextBlink) { st.nextBlink = t + 2.8 + Math.random() * 3.2; st.blinkAt = t; }
      const b = t - st.blinkAt;
      if (b < 0.14) lid = Math.abs(b / 0.07 - 1) * 0.92 + 0.08;
    }
    B.eyes.forEach((e) => { if (e) e.scale.y *= lid; });
    last.lid = lid;
  }

  function frameOnce(dt) { unoverlay(); mixer.update(dt); overlay(still); renderer.render(scene, cam); }
  function loop() {
    raf = 0;
    if (!alive || !visible || document.hidden) return;
    frameOnce(Math.min(0.1, clock.getDelta()));
    raf = requestAnimationFrame(loop);
  }
  function kick() { if (still) { frameOnce(0); return; } if (!raf) { clock.getDelta(); raf = requestAnimationFrame(loop); } }
  function set(mood) {
    if (!acts[mood]) mood = "idle";
    st.mood = mood;
    const next = acts[mood];
    if (still) { unoverlay(); mixer.stopAllAction(); next.reset().play(); mixer.setTime(POSE[mood] || 0); frameOnce(0); return; }
    if (next === cur && !ONCE[mood]) return;
    next.reset().setEffectiveWeight(1).play();
    if (next !== cur) cur.crossFadeTo(next, FADE, false);
    cur = next;
    kick();
  }

  if (still) set("idle"); else frameOnce(0);              // 첫 프레임을 그린 뒤에야 끼운다
  box.appendChild(canvas);

  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; kick(); });
  io.observe(canvas);
  const onVis = () => kick();
  document.addEventListener("visibilitychange", onVis);
  kick();

  return {
    canvas, set,
    get mood() { return st.mood; },
    get _probe() { return { eye: B.eyes[0] ? B.eyes[0].scale.y : 1, head: B.head.quaternion.toArray() }; },   // 시험용
    lookAt(nx, ny) { st.look = [nx, ny]; if (still) frameOnce(0); },
    turn(rad) { st.turn = rad; frameOnce(0); },              // 시안 캡처용(정면·3/4·옆)
    seek(mood, t) {                                          // 미리보기 영상·시험용 — mood 의 t초 모습을 그린다
      seeking = true;
      st.mood = acts[mood] ? mood : "idle";
      unoverlay(); mixer.stopAllAction(); cur = acts[st.mood]; cur.reset().play(); mixer.setTime(t);
      overlay(true); renderer.render(scene, cam);
      seeking = false;
    },
    dispose() {
      alive = false; io.disconnect(); document.removeEventListener("visibilitychange", onVis);
      cancelAnimationFrame(raf); mixer.stopAllAction(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    },
  };
}

// 한 장 사진 — 같은 그림을 여러 곳(과목 목록 '주차 열기' 수십 개)에 쓸 때.
// 버튼마다 3D 를 띄우면 브라우저 WebGL 한도(보통 16)를 넘는다. 한 번 그려 data URL 로 나눠 쓴다.
export async function snapshotDalgu(opt = {}) {
  const box = document.createElement("div");
  const d = await mountDalgu(box, { ...opt, still: true, snapshot: true });
  if (!d) return null;
  if (opt.mood) d.set(opt.mood);
  const url = d.canvas.toDataURL("image/png");
  d.dispose();
  return url;
}
