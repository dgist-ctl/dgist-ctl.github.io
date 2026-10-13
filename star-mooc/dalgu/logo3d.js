// 가운데 STAR-MOOC 로고 — 「혜성이 손글씨 별을 그린다」(사용자 10-13: 흔히 보던 도는 로고가 아닌 것)
//
//   const L = makeLogo({ renderer, glow, reduce });  world.add(L.group);
//   L.paint(dark);  L.update(nowMs);  L.replay();
//
// 1) 금빛 혜성 머리가 로고의 별 획을 손으로 그린 순서(펜 4번)대로 달리며, 지나간 자리에 두께 있는 획이 생긴다.
//    막 생긴 획은 달군 쇠처럼 금빛으로 빛나다가 로고 색으로 식는다.
// 2) 마지막 획(꼬리)이 STAR-MOOC 글자 위를 지나가면, 그 아래 글자가 하나씩 떨어져 내려 제자리에 선다.
// 3) 다 그리면 한 바퀴 입체로 돌고, 그 뒤엔 천천히 좌우로 기울며 숨 쉬듯 떠 있다.
//    7초마다 금빛 물결이 그린 순서대로 획을 훑고, 꼬리 아래 글자가 차례로 살짝 뛴다.
// 획 뼈대·굵기·글자 윤곽 = site/brand/starmooc-logo-3d.json (_빌드/logo3d_trace.py 가 로고 그림에서 딴다).
import * as THREE from "./vendor/three.module.min.js";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js";

const LW = 1.9;                                   // 로고 너비(월드 단위)
const PEN = [[0, 1.25], [1.25, 1.8], [1.8, 2.35], [2.55, 3.65]];   // 펜 4번의 시작·끝(초)
const DONE = 3.65, SPIN = [4.0, 5.7], PULSE = 7.0;
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const inout = (t) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)));
const back = (t) => { t = Math.min(1, Math.max(0, t)); const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

// 굵기가 변하는 관 — 손글씨 획의 굵기(r)를 따라 부풀고 가늘어진다. aU = 획을 따라 0→1
function strokeGeo(P) {
  const RS = 10, N = P.length, pos = [], nor = [], au = [], idx = [];
  for (let i = 0; i < N; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(N - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const nx = -ty, ny = tx, r = P[i][2] * LW * 1.35, cap = Math.min(1, i / 3, (N - 1 - i) / 3) * 0.6 + 0.4;   // 끝은 둥글게 가늘어짐
    for (let j = 0; j <= RS; j++) {
      const th = (j / RS) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      pos.push(P[i][0] * LW + nx * c * r * cap, P[i][1] * LW + ny * c * r * cap, s * r * cap * 0.8);
      nor.push(nx * c, ny * c, s);
      au.push(i / (N - 1));
    }
  }
  for (let i = 0; i < N - 1; i++) for (let j = 0; j < RS; j++) {
    const a = i * (RS + 1) + j, b = a + RS + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("aU", new THREE.Float32BufferAttribute(au, 1));
  g.setIndex(idx);
  return g;
}

// 그린 만큼만 보이고(uProg), 막 그린 곳·물결 자리는 금빛으로(uHot·uPulse)
function strokeMat(env) {
  const m = new THREE.MeshPhysicalMaterial({ roughness: 0.3, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.12, envMap: env, envMapIntensity: 0.9 });
  m.userData.u = { uProg: { value: 0 }, uHot: { value: 0 }, uPulse: { value: -1 }, uGold: { value: new THREE.Color(0xf2b33d) } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aU;\nvarying float vU;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvU = aU;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vU;\nuniform float uProg, uHot, uPulse;\nuniform vec3 uGold;")
      .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\nif (vU > uProg) discard;")
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        float hot = uHot * (0.35 + 0.65 * smoothstep(uProg - 0.18, uProg, vU));
        float wave = exp(-pow((vU - uPulse) * 9.0, 2.0));
        totalEmissiveRadiance += uGold * (hot * 1.6 + wave * 1.1);`);
  };
  return m;
}

export function makeLogo({ renderer, glow, reduce, noSpin = false }) {   // noSpin: 도입 영상 — 뒤집힌 글자로 끝나지 않게 한 바퀴 돌기를 뺀다
  const group = new THREE.Group();
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
  const letterMat = new THREE.MeshPhysicalMaterial({ roughness: 0.28, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1, envMap: env, envMapIntensity: 0.8 });
  const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffc94a, transparent: true, depthWrite: false, opacity: 0 }));
  head.scale.setScalar(0.42); head.renderOrder = 3;
  // 불티 — 점마다 투명도가 따로 줄어든다(PointsMaterial 은 색만 줄어 흰 화면에 검은 점이 남았다)
  const TRAIL = 36, trailPos = new Float32Array(TRAIL * 3), trailA = new Float32Array(TRAIL);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute("aA", new THREE.BufferAttribute(trailA, 1));
  const trailMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xf0a81e) }, uSize: { value: 16 * Math.min(2, devicePixelRatio || 1) } },
    vertexShader: "attribute float aA; varying float vA; uniform float uSize; void main(){ vA = aA; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = uSize * aA * (10.0 / -mv.z); gl_Position = projectionMatrix * mv; }",
    fragmentShader: "varying float vA; uniform vec3 uColor; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; if (a < 0.01) discard; gl_FragColor = vec4(uColor, a); }",
    transparent: true, depthWrite: false,
  });
  const trail = new THREE.Points(trailGeo, trailMat); trail.renderOrder = 2;
  group.add(trail, head);
  const strokes = [], letters = [], hist = [];
  let ready = false, t0 = null, dark = false, off = 0;   // off = 몇 초째부터 시작할지(도입 영상에서 이미 그렸으면 다 그린 뒤부터)

  fetch(new URL("../brand/starmooc-logo-3d.json", import.meta.url)).then((r) => r.json()).then((J) => {
    for (const P of J.strokes) {
      const m = strokeMat(env), mesh = new THREE.Mesh(strokeGeo(P), m);
      strokes.push({ P, m, mesh }); group.add(mesh);
    }
    const toV = (A) => A.map(([x, y]) => new THREE.Vector2(x * LW, y * LW));
    for (const s of J.shapes.filter((s) => s.c === "b")) {
      const sh = new THREE.Shape(toV(s.o)); sh.holes = s.h.map((h) => new THREE.Path(toV(h)));
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 1 });
      geo.computeBoundingBox(); const c = new THREE.Vector3(); geo.boundingBox.getCenter(c);
      geo.translate(-c.x, -c.y, -0.025);
      const mesh = new THREE.Mesh(geo, letterMat); mesh.position.set(c.x, c.y, 0); mesh.visible = false;   // 혜성이 지나가기 전엔 숨김
      letters.push({ mesh, x: c.x, y: c.y, w: geo.boundingBox.max.x - geo.boundingBox.min.x }); group.add(mesh);
    }
    letters.sort((a, b) => a.x - b.x);
    // 글자가 떨어지는 때 = 꼬리 획의 혜성이 그 글자 위를 지날 때
    const tail = J.strokes[J.strokes.length - 1];
    for (const L of letters) {
      let k = tail.findIndex((p) => p[0] * LW >= L.x);
      if (k < 0) k = tail.length - 1;
      L.at = PEN[3][0] + inv(k / (tail.length - 1)) * (PEN[3][1] - PEN[3][0]);
    }
    paint(dark); ready = true;
  }).catch(() => {});
  // 펜 움직임은 inout — 글자 시각을 맞추려면 역함수가 필요하다
  function inv(y) { return Math.acos(1 - 2 * Math.min(1, Math.max(0, y))) / Math.PI; }

  function paint(d) {
    dark = d;
    for (const s of strokes) s.m.color.set(d ? 0xe4e7ef : 0x3a3a3e);
    letterMat.color.set(d ? 0x9fb5ff : 0x172a88);
    letterMat.emissive.set(d ? 0x14205a : 0x000000);
    trailMat.uniforms.uColor.value.set(d ? 0xffd36b : 0xe89a10);
    for (const s of strokes) { s.m.emissive.set(d ? 0x8a90a2 : 0x000000); s.m.metalness = d ? 0.1 : 0.45; s.m.roughness = d ? 0.45 : 0.3; }
    head.material.color.set(d ? 0xffd36b : 0xf0a81e);
  }

  const at = (P, u) => {   // 획 위 u(0~1) 지점
    const f = u * (P.length - 1), i = Math.min(P.length - 2, Math.floor(f)), k = f - i;
    return [(P[i][0] + (P[i + 1][0] - P[i][0]) * k) * LW, (P[i][1] + (P[i + 1][1] - P[i][1]) * k) * LW];
  };

  function update(now, tilt = [0, 0]) {
    if (!ready) return;
    if (t0 === null) t0 = now;
    const T = reduce ? 99 : (now - t0) / 1000 + off;
    // 1) 펜 4번
    let hx = null, hy = 0;
    strokes.forEach((s, i) => {
      const [a, b] = PEN[i], u = inout((T - a) / (b - a));
      s.m.userData.u.uProg.value = T >= b ? 1.01 : u;
      s.m.userData.u.uHot.value = T < a ? 0 : 1 - sm(b, b + 1.4, T);
      if (T >= a && T <= b) [hx, hy] = at(s.P, u);
    });
    // 혜성 머리 + 꼬리 불티
    if (hx !== null) { head.position.set(hx, hy, 0.06); hist.unshift([hx, hy]); }
    else hist.unshift(hist[0] || [0, 0]);
    hist.length = Math.min(hist.length, TRAIL);
    head.material.opacity = hx !== null ? 0.95 : Math.max(0, head.material.opacity - 0.06);
    head.scale.setScalar(0.34 + 0.08 * Math.sin(T * 30));
    for (let i = 0; i < TRAIL; i++) {
      const p = hist[Math.min(i, hist.length - 1)] || [0, 0], j = i * 0.004;
      trailPos.set([p[0] + Math.sin(i * 12.9) * j, p[1] + Math.cos(i * 7.3) * j, 0.05], i * 3);
      trailA[i] = (1 - i / TRAIL) * head.material.opacity;
    }
    trailGeo.attributes.position.needsUpdate = trailGeo.attributes.aA.needsUpdate = true;
    // 2) 글자: 꼬리 위에서 떨어져 내려 선다 / 물결이 지나가면 살짝 뛴다
    const cyc = T > SPIN[1] ? ((T - SPIN[1]) % PULSE) / 1.8 : -1;     // 물결 진행(0~1 이 한 번)
    for (const L of letters) {
      const k = back((T - L.at) / 0.55);
      const hop = cyc >= 0.55 && cyc <= 1 ? Math.max(0, Math.sin(((cyc - 0.55) / 0.45 * letters.length - letters.indexOf(L)) * Math.PI / 2.2)) : 0;
      L.mesh.visible = T >= L.at;
      L.mesh.position.y = L.y + (1 - k) * 0.42 + (hop > 0 && hop < 1 ? hop * 0.045 : 0);
      L.mesh.rotation.x = (1 - k) * -1.3;
      L.mesh.scale.setScalar(0.25 + 0.75 * Math.min(1, k));
    }
    // 물결: 펜 순서대로 금빛이 획을 훑는다
    strokes.forEach((s, i) => {
      const w = cyc < 0 ? -1 : (cyc * 4 - i) * 1.25 - 0.15;
      s.m.userData.u.uPulse.value = w > -0.2 && w < 1.2 ? w : -1;
    });
    // 3) 한 바퀴 → 그 뒤엔 숨 쉬듯 기울기(마우스 쪽으로 조금 더)
    const spin = noSpin ? 0 : inout((T - SPIN[0]) / (SPIN[1] - SPIN[0])) * Math.PI * 2;
    const live = sm(SPIN[1], SPIN[1] + 1.5, T);
    group.rotation.y = spin + live * (Math.sin((T - SPIN[1]) * 0.5) * 0.38 + tilt[0] * 0.25);
    group.rotation.x = live * (Math.sin((T - SPIN[1]) * 0.33) * 0.1 - tilt[1] * 0.15);
    group.position.y = live * Math.sin(T * 0.9) * 0.04;
  }

  return { group, paint, update, replay(from = 0) { t0 = null; off = from; hist.length = 0; }, IDLE: SPIN[1], get drawing() { return t0 !== null && !reduce; } };
}
