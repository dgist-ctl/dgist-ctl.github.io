// 달구 3D — 공식 달구(아기 수달)를 Three.js 도형으로 만든다. 외부 모델 파일은 없다.
// 근거: student_tutor/docs/specs/2026-10-07-달구-3D-design_v1.0.md
//
// 모든 치수는 공식 이모티콘 '안녕!'(600px, 크몽 35215) 위에서 잰 픽셀 좌표를 O() 로 옮긴 것이다.
// 머리 폭 305px = 1.5 단위, 머리 중심(292, 265) = 원점. 고칠 때는 공식 그림 위에 겹쳐 보며
// (index.html?overlay) 아래 P 의 픽셀 좌표만 바꾼다.
//
//   const d = await mountDalgu(box, { size: 88, framing: "full" });   // 실패하면 null
//   d.set("idle" | "think" | "nod" | "talk" | "hop" | "wave");
//   d.lookAt(nx, ny);   // -1 ~ 1, 오른쪽·아래가 +
//   d.dispose();
//
// 첫 프레임을 그린 뒤에야 box 에 캔버스를 넣는다 — 호출한 쪽은 null 이면 PNG 를 그대로 두면 된다.
import * as THREE from "./vendor/three.module.min.js";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js";

const K = 1.5 / 305;
const O = (x, y) => [(x - 292) * K, -(y - 265) * K];     // 공식 그림 px → 세계 좌표
const C = {
  blue: 0x6E9CDD, cream: 0xFBF4E8, ink: 0x161616, white: 0xFFFFFF, tongue: 0xEE7D86, pad: 0xF2B7B0,
};

// 공식 그림 위 픽셀 좌표(맞춤 루프가 고치는 곳은 여기뿐이다)
export const P = {
  // 몸 비율 = 이모티콘 '안녕!' 위 50회 자동 맞춤(opt_best.json, IoU 0.690). 풍선 실측과 같은 비율이다.
  head: { cx: 292, cy: 271.5, w: 316, h: 280, n: 0.52, z: 0.6, taper: 0.14 },
  creamY: 279, creamSag: 0.03,
  // 얼굴 = 풍선 달구 실측(유튜브 「안녕, 디지스트의 봄」) — 눈이 이모티콘보다 크고 입이 넓다
  eyes: { dx: 64, y: 274, r: 0.08 },
  brows: { dx: 47, y: 228, rx: 16, ry: 12 },
  nose: { y: 299, r: 0.1 },
  mouth: { y: 322, w: 62 },
  whisk: { x0: 180, x1: 216, y: [291, 308] },
  blush: { dx: 98, y: 306, r: 30, a: 0.35 },
  ears: { dx: 118, y: 178, r: 0.13 },
  muzzle: { y: 312, sx: 0.5, sy: 0.24, amp: 0.09 },     // 크림 주둥이가 앞으로 불룩(풍선)
  body: { cx: 306, cy: 466, w: 0.58, h: 0.53, z: 0.46 },
  belly: { dx: -0.05, rx: 0.28, ry: 0.35 },
  legs: { x: [272, 362], y: 557, r: 0.11 },
  tail: { x0: 400, y0: 492, x1: 488, y1: 462, r: 0.085 },
  arms: { dx: 84, y: 408, r: 0.115, len: 0.2, rot: 1.1 },  // 풍선처럼 옆으로 벌린다
  sash: { tilt: 1.08, tube: 0.055, tag: [298, 458], tagW: 0.6, ry: 0.52 },
};

/* ---------- 형태 도구 ---------- */

// 구 → 둥근 상자(n<1 이면 모서리가 찬다) → taper(y) 로 위아래 폭을 다르게.
function blob(sx, sy, sz, n, taper = () => 1, seg = 96) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const d = [p.getX(i), p.getY(i), p.getZ(i)];
    const v = d.map((a) => Math.sign(a) * Math.abs(a) ** n);
    const r = 1 / (Math.hypot(...v) || 1);
    const y = v[1] * r * sy, f = taper(y / sy);
    p.setXYZ(i, v[0] * r * sx * f, y, v[2] * r * sz * f);
  }
  g.computeVertexNormals();
  return g;
}

function toonRamp() {
  const t = new THREE.DataTexture(new Uint8Array([170, 170, 170, 255, 228, 228, 228, 255, 255, 255, 255, 255]), 3, 1);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
const RAMP = toonRamp();

// 파랑·크림 두 색 + (선택) 정면 투영 그림. cream 은 물체 좌표 p·법선 n 으로 크림 정도(0~1)를 내는 GLSL 식.
function twoTone({ cream = "0.0", decal = null, box = null }) {
  const m = new THREE.MeshStandardMaterial({ color: C.blue, roughness: 0.42, metalness: 0 });
  // three 는 onBeforeCompile 의 소스 문자열로 셰이더를 재사용한다 — 식이 다르면 열쇠도 달라야 한다.
  m.customProgramCacheKey = () => cream + (decal ? "|decal" : "");
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCream = { value: new THREE.Color(C.cream) };
    sh.uniforms.uDecal = { value: decal };
    sh.uniforms.uBox = { value: new THREE.Vector4(...(box || [0, 1, 0, 1])) };
    sh.vertexShader = "varying vec3 vP; varying vec3 vN;\n" + sh.vertexShader
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n vP = position; vN = normal;");
    sh.fragmentShader = "varying vec3 vP; varying vec3 vN; uniform vec3 uCream; uniform vec4 uBox;\n"
      + (decal ? "uniform sampler2D uDecal;\n" : "")
      + sh.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
        { vec3 p = vP; vec3 n = normalize(vN);
          float cr = clamp(${cream}, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, uCream, cr);
          ${decal ? `vec2 uv = vec2((p.x - uBox.x) / (uBox.y - uBox.x), (p.y - uBox.z) / (uBox.w - uBox.z));
          if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
            vec4 d = texture2D(uDecal, uv);
            diffuseColor.rgb = mix(diffuseColor.rgb, d.rgb, d.a * smoothstep(0.15, 0.45, n.z));
          }` : ""} }`);
  };
  return m;
}
const toon = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0 });   // 풍선 비닐 질감

// 외곽선 — 같은 기하를 법선 방향으로 부풀려 뒷면만 검게 칠한다.
function outlineMat(thick) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { thick: { value: thick } },
    vertexShader: "uniform float thick; void main(){ vec3 p = position + normal * thick;"
      + " gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }",
    fragmentShader: "void main(){ gl_FragColor = vec4(0.086, 0.086, 0.086, 1.0); }",
  });
}
// 외곽선은 이모티콘 화풍. 풍선 기준(10-07 지시)으로 껐다 — OUTLINE=true 로 되돌린다.
const OUTLINE = false;
function lined(mesh, thick = 0.022) { if (OUTLINE) mesh.add(new THREE.Mesh(mesh.geometry, outlineMat(thick))); return mesh; }

// 표면 위 점 — 정면(+z)에서 쏜 광선이 처음 닿는 곳(물체 좌표).
const ray = new THREE.Raycaster();
function hitFront(mesh, x, y) {
  mesh.updateMatrixWorld(true);
  ray.set(new THREE.Vector3(x, y, 5), new THREE.Vector3(0, 0, -1));
  const h = ray.intersectObject(mesh, false)[0];
  return h ? mesh.worldToLocal(h.point.clone()) : new THREE.Vector3(x, y, 0.4);
}

/* ---------- 얼굴 그림(정면 투영) ---------- */

function faceDecal() {
  const H = P.head, S = 4;
  const x0 = H.cx - H.w / 2 - 10, x1 = H.cx + H.w / 2 + 10, y0 = H.cy - H.h / 2 - 10, y1 = H.cy + H.h / 2 + 10;
  const cv = document.createElement("canvas");
  cv.width = (x1 - x0) * S; cv.height = (y1 - y0) * S;
  const g = cv.getContext("2d");
  g.setTransform(S, 0, 0, S, -x0 * S, -y0 * S);
  const X = (s, x) => H.cx + s * x;
  // 이마의 크림 눈썹 점 — 안쪽으로 살짝 기운 타원
  g.fillStyle = "#FAF0DC";
  for (const s of [-1, 1]) {
    g.beginPath(); g.ellipse(X(s, P.brows.dx), P.brows.y, P.brows.rx, P.brows.ry, s * 0.3, 0, 7); g.fill();
  }
  // 볼 홍조
  for (const s of [-1, 1]) {
    const x = X(s, P.blush.dx), y = P.blush.y, r = P.blush.r;
    const gr = g.createRadialGradient(x, y, 2, x, y, r);
    gr.addColorStop(0, `rgba(246,150,140,${P.blush.a})`); gr.addColorStop(1, "rgba(246,150,140,0)");
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  g.strokeStyle = "#161616"; g.lineCap = "round"; g.lineJoin = "round";
  // 입 — W
  const my = P.mouth.y, mw = P.mouth.w, c = H.cx;
  g.lineWidth = 4.6; g.beginPath();
  g.moveTo(c - mw, my);
  g.quadraticCurveTo(c - mw + 6, my + 16, c - mw / 2, my + 15); g.quadraticCurveTo(c - 4, my + 14, c, my + 4);
  g.quadraticCurveTo(c + 4, my + 14, c + mw / 2, my + 15); g.quadraticCurveTo(c + mw - 6, my + 16, c + mw, my);
  g.stroke();
  // 수염 — 양쪽 두 가닥
  g.lineWidth = 3.6;
  const w = P.whisk;
  for (const s of [-1, 1]) {
    const Xw = (x) => c + s * (x - c);
    g.beginPath(); g.moveTo(Xw(w.x0), w.y[0]); g.lineTo(Xw(w.x1), w.y[0] - 5); g.stroke();
    g.beginPath(); g.moveTo(Xw(w.x0), w.y[1]); g.lineTo(Xw(w.x1), w.y[1] + 4); g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const [L, T] = O(x0, y0), [R, B] = O(x1, y1);
  return { tex: t, box: [L, R, B, T] };
}

/* ---------- 달구 만들기 ---------- */

function buildDalgu() {
  const root = new THREE.Group();          // 폴짝
  const bodyG = new THREE.Group();         // 숨쉬기·몸 돌리기
  root.add(bodyG);

  /* 몸 — 머리 아래에 겹쳐 묻힌 서양배(목이 없다). 크림 배는 오른쪽으로 살짝 치우친 타원 */
  const Bp = P.body;
  const [bx, by] = O(Bp.cx, Bp.cy);
  const body = lined(new THREE.Mesh(
    blob(Bp.w, Bp.h, Bp.z, 0.92, (t) => 0.86 + 0.16 * (1 - t) / 2),
    twoTone({ cream: `(1.0 - smoothstep(0.9, 1.0, pow((p.x - ${P.belly.dx.toFixed(3)}) / ${P.belly.rx.toFixed(3)}, 2.0) + pow((p.y + 0.02) / ${P.belly.ry.toFixed(3)}, 2.0))) * step(0.0, p.z)` }),
  ));
  body.position.set(bx, by, 0);
  bodyG.add(body);

  // 다리 — 몸 아래 작은 혹 두 개
  for (const px of P.legs.x) {
    const leg = lined(new THREE.Mesh(new THREE.SphereGeometry(P.legs.r, 24, 16), toon(C.blue)));
    const [x, y] = O(px, P.legs.y);
    leg.position.set(x, y, 0.12); leg.scale.set(1, 0.85, 1.1);
    bodyG.add(leg);
  }
  // 꼬리 — 오른쪽 아래에서 위로 굵게
  {
    const T = P.tail;
    const [x0, y0] = O(T.x0, T.y0), [x1, y1] = O(T.x1, T.y1);
    const tail = lined(new THREE.Mesh(new THREE.CapsuleGeometry(T.r, Math.hypot(x1 - x0, y1 - y0), 8, 16), toon(C.blue)));
    tail.position.set((x0 + x1) / 2, (y0 + y1) / 2, -0.12);
    tail.rotation.z = Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2;
    tail.scale.set(1, 1, 0.8);
    bodyG.add(tail);
  }
  // 팔 — 몸 옆의 짧은 뭉툭이. arms[0] = 화면 왼쪽, arms[1] = 화면 오른쪽(인사하는 손)
  const arms = [];
  for (const s of [-1, 1]) {
    const A = P.arms;
    const pivot = new THREE.Group();
    const [x, y] = O(292 + s * A.dx, A.y);
    pivot.position.set(x, y, 0.12);
    const arm = lined(new THREE.Mesh(new THREE.CapsuleGeometry(A.r, A.len, 8, 16), toon(C.blue)));
    arm.position.y = -(A.len / 2 + A.r * 0.5);
    // 발바닥 젤리 — 큰 젤리 하나 + 발가락 젤리 셋(공식 '안녕!' 손바닥)
    const jelly = new THREE.MeshBasicMaterial({ color: C.pad });
    const paw = new THREE.Group();
    paw.position.set(0, -(A.len / 2 + A.r * 0.35), A.r * 0.9);
    const big = new THREE.Mesh(new THREE.CircleGeometry(A.r * 0.5, 20), jelly);
    big.position.y = -A.r * 0.15; big.scale.set(1.15, 0.9, 1);
    paw.add(big);
    for (const k of [-1, 0, 1]) {
      const toe = new THREE.Mesh(new THREE.CircleGeometry(A.r * 0.2, 14), jelly);
      toe.position.set(k * A.r * 0.38, A.r * (0.32 - 0.08 * Math.abs(k)), 0);
      paw.add(toe);
    }
    arm.add(paw);
    pivot.add(arm);
    pivot.rotation.z = s * A.rot;
    pivot.userData.home = pivot.position.clone();
    bodyG.add(pivot); arms.push(pivot);
  }
  // 띠 — 화면 왼쪽 어깨에서 오른쪽 허리로, 수평에서 26° 쯤 완만하게
  {
    const Sp = P.sash;
    const sashG = new THREE.Group();
    sashG.position.set(bx, by + 0.02, 0);
    sashG.rotation.z = Sp.tilt;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, Sp.tube, 10, 96), toon(C.white));
    ring.rotation.y = Math.PI / 2;
    ring.scale.set(Bp.z + 0.035, Sp.ry, 1);
    if (OUTLINE) ring.add(new THREE.Mesh(ring.geometry, outlineMat(0.016)));
    sashG.add(ring);
    bodyG.add(sashG);
    // "DG" — 띠 위의 큰 글자(흰 글자 + 검은 테)
    const cv = document.createElement("canvas"); cv.width = 384; cv.height = 192;
    const g = cv.getContext("2d");
    g.font = "900 150px 'Arial Rounded MT Bold', 'Arial Black', Arial, sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.lineJoin = "round"; g.lineWidth = 26; g.strokeStyle = "#161616"; g.strokeText("DG", 192, 104);
    g.fillStyle = "#fff"; g.fillText("DG", 192, 104);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(Sp.tagW, Sp.tagW / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    const [tx, ty] = O(...Sp.tag);
    const z = hitFront(body, tx - bx, ty - by).z;
    tag.position.set(tx, ty, z + 0.13);           // 띠(몸 + 0.035 + 굵기) 보다 앞
    tag.rotation.z = -(Math.PI / 2 - Sp.tilt);   // 띠 방향을 따라 눕는다
    bodyG.add(tag);
  }

  /* 머리 — 위가 좁고 볼이 넓다 */
  const headG = new THREE.Group();
  bodyG.add(headG);
  const Hp = P.head;
  const HX = (Hp.w / 2) * K, HY = (Hp.h / 2) * K, HZ = Hp.z;
  const face = faceDecal();
  // 크림 경계: 정면에서 눈 바로 아래 거의 수평, 볼 옆으로 조금 처지고 뒤로 갈수록 내려가 사라진다.
  const yb = O(0, P.creamY)[1] + (Hp.cy - 265) * K;   // 물체 좌표로
  const headGeo = blob(HX, HY, HZ, Hp.n, (t) => 1 + Hp.taper / 2 - Hp.taper * (t + 1) / 2);
  {
    const M = P.muzzle, my = O(0, M.y)[1] + (Hp.cy - 265) * K, pos = headGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (z <= 0) continue;
      const g = Math.exp(-((x / M.sx) ** 2 + ((y - my) / M.sy) ** 2)) * (z / HZ) ** 2;
      pos.setZ(i, z + M.amp * g);
    }
    headGeo.computeVertexNormals();
  }
  const head = lined(new THREE.Mesh(
    headGeo,
    twoTone({
      cream: `1.0 - smoothstep(-0.008, 0.008, p.y - (${yb.toFixed(3)} - ${P.creamSag} * pow(p.x / ${HX.toFixed(3)}, 2.0) - 1.4 * max(0.0, -p.z - 0.12)))`,
      decal: face.tex, box: face.box.map((v, i) => (i >= 2 ? v + (Hp.cy - 265) * K : v)),   // 물체 좌표로
    }),
  ), 0.026);
  head.position.y = -(Hp.cy - 265) * K;      // 볼살이 아래로 내려온 만큼
  headG.add(head);

  // 눈 — 검은 구슬 + 반짝이 두 개. 깜빡임은 eye.scale.y.
  const eyes = [];
  for (const s of [-1, 1]) {
    const [x, y] = O(292 + s * P.eyes.dx, P.eyes.y);
    const r = P.eyes.r;
    const eye = new THREE.Group();
    eye.position.copy(hitFront(head, x, y)).add(new THREE.Vector3(0, 0, -r * 0.2));
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 20), new THREE.MeshPhongMaterial({ color: C.ink, shininess: 90 }));
    ball.scale.set(1, 1.1, 0.5);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(r * 0.34, 12, 10), new THREE.MeshBasicMaterial({ color: C.white }));
    hl.position.set(r * 0.3, r * 0.42, r * 0.5);
    const hl2 = new THREE.Mesh(new THREE.SphereGeometry(r * 0.16, 10, 8), new THREE.MeshBasicMaterial({ color: C.white }));
    hl2.position.set(-r * 0.32, -r * 0.4, r * 0.5);
    eye.add(ball, hl, hl2);
    headG.add(eye); eyes.push(eye);
  }
  // 코 — 크림 경계에 걸친 둥근 타원
  {
    const [x, y] = O(292, P.nose.y);
    const r = P.nose.r;
    const nose = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 20), new THREE.MeshPhongMaterial({ color: C.ink, shininess: 70 }));
    nose.scale.set(1.0, 0.68, 0.6);
    nose.position.copy(hitFront(head, x, y)).add(new THREE.Vector3(0, 0, -0.005));
    const hl = new THREE.Mesh(new THREE.SphereGeometry(r * 0.25, 12, 10), new THREE.MeshBasicMaterial({ color: 0x9a9a9a }));
    hl.position.set(-r * 0.3, r * 0.4, r * 0.5);
    nose.add(hl);
    headG.add(nose);
  }
  // 벌린 입(혀) — talk·wave 에서만 보인다.
  const mouth = new THREE.Group();
  {
    const [x, y] = O(292, P.mouth.y + 14);
    mouth.position.copy(hitFront(head, x, y)).add(new THREE.Vector3(0, 0, -0.03));
    // 위가 평평한 반원 — 웃는 입
    const shape = new THREE.Shape();
    shape.moveTo(-0.11, 0); shape.lineTo(0.11, 0);
    shape.absarc(0, 0, 0.11, 0, -Math.PI, true);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, curveSegments: 24 });
    const inside = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x3b1416 }));
    const tongue = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), new THREE.MeshBasicMaterial({ color: C.tongue }));
    tongue.position.set(0, -0.06, 0.06); tongue.scale.set(1.15, 0.7, 1);
    mouth.add(inside, tongue);
    mouth.scale.set(1, 0.001, 1);
    headG.add(mouth);
  }
  // 귀 — 윗모서리의 작은 반원
  for (const s of [-1, 1]) {
    const [x, y] = O(292 + s * P.ears.dx, P.ears.y);
    const ear = lined(new THREE.Mesh(new THREE.SphereGeometry(P.ears.r, 28, 18), toon(C.blue)), 0.02);
    ear.scale.set(1, 0.95, 0.6);
    ear.position.set(x, y, 0.02);
    headG.add(ear);
  }

  // 잔머리 두 가닥 — 평소 V 로 뻗어 끝이 바깥으로 말리고, 집중하면 DNA 로 꼬이고, 놀라면 삐죽.
  head.updateMatrixWorld(true);
  ray.set(new THREE.Vector3(0, 3, 0.05), new THREE.Vector3(0, -1, 0));
  const top = ray.intersectObject(head, false)[0];
  const hairBase = top ? top.point.clone().add(new THREE.Vector3(0, -0.02, 0)) : new THREE.Vector3(0, HY, 0.05);
  const hairMat = new THREE.MeshBasicMaterial({ color: C.ink });
  const hairs = [new THREE.Mesh(new THREE.BufferGeometry(), hairMat), new THREE.Mesh(new THREE.BufferGeometry(), hairMat)];
  hairs.forEach((h) => headG.add(h));
  function hairPoints(side, mood) {           // mood = { dna: 0~1, spike: 0~1, sway }
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const curl = Math.max(0, t - 0.6) / 0.4;  // 끝 40% 가 바깥으로 말린다
      const rest = new THREE.Vector3(side * (0.06 * t + 0.07 * curl * curl) + mood.sway * t * t * 0.03,
        0.2 * t - 0.06 * curl * curl, 0);
      const spike = new THREE.Vector3(side * 0.06 * t, 0.24 * t, 0);
      const a = t * Math.PI * 3 + (side > 0 ? 0 : Math.PI);
      const r = 0.042 * Math.sin(Math.PI * Math.min(1, t * 1.15));
      const dna = new THREE.Vector3(Math.cos(a) * r, 0.26 * t, Math.sin(a) * r);
      pts.push(rest.lerp(spike, mood.spike).lerp(dna, mood.dna).add(hairBase));
    }
    return pts;
  }
  function setHair(mood) {
    hairs.forEach((h, k) => {
      h.geometry.dispose();
      h.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hairPoints(k ? 1 : -1, mood)), 24, 0.016, 8, false);
    });
  }

  return { root, bodyG, headG, eyes, mouth, arms, setHair };
}

/* ---------- 장면·애니메이션 ---------- */

const FRAMING = {
  full: { y: -0.36, h: 2.6 },      // 잔머리 끝 ~ 발
  bust: { y: -0.12, h: 1.85 },     // 머리 + 어깨
};

export async function mountDalgu(box, opt = {}) {
  if (opt.params) {                          // 맞춤 루프가 치수를 바꿔 볼 때만 쓴다
    for (const [k, v] of Object.entries(opt.params)) {
      if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(P[k], v); else P[k] = v;
    }
  }
  const size = opt.size || 88;
  const frame = FRAMING[opt.framing || "full"];
  // WebGL 이 없으면 three 가 콘솔에 오류를 남긴다 — 먼저 조용히 물어본다.
  const probe = document.createElement("canvas");
  if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) return null;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power", preserveDrawingBuffer: !!(opt.ortho || opt.snapshot) });
  } catch (e) { return null; }
  if (!renderer.getContext()) return null;
  renderer.setPixelRatio(opt.ortho ? 1 : Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(size, size);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.style.cssText = `width:${size}px;height:${size}px;display:block`;
  canvas.setAttribute("aria-hidden", "true");

  const scene = new THREE.Scene();
  let cam;
  if (opt.ortho) {                           // 공식 그림과 겹쳐 맞출 때 — [left, right, top, bottom] 공식 px
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
  // 풍선 비닐처럼 — 스튜디오 환경광으로 부드러운 음영·광택, 위 왼쪽 주광, 뒤 테두리광
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.75;
  pmrem.dispose();
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(-1.2, 2.2, 3);
  const rim = new THREE.DirectionalLight(0xdfeaff, 1.2);
  rim.position.set(1.5, 1.0, -2.5);
  scene.add(key, rim);
  renderer.toneMapping = THREE.NeutralToneMapping;

  const D = buildDalgu();
  scene.add(D.root);

  const still = opt.still ?? matchMedia("(prefers-reduced-motion: reduce)").matches;
  const st = { mood: "idle", since: 0, look: [0, 0], lookNow: [0, 0], dna: 0, spike: 0, nextBlink: 1.5, turn: 0 };
  let t0 = performance.now(), raf = 0, visible = true, alive = true;

  function pose(t) {
    const m = st.mood, dt = t - st.since;
    st.lookNow[0] += (st.look[0] - st.lookNow[0]) * (still ? 1 : 0.12);
    st.lookNow[1] += (st.look[1] - st.lookNow[1]) * (still ? 1 : 0.12);
    D.bodyG.rotation.set(0, st.lookNow[0] * 0.2 + st.turn, 0);
    D.headG.rotation.set(st.lookNow[1] * 0.25, st.lookNow[0] * 0.38, 0);   // 몸 회전에 더해진다

    const br = still ? 0 : Math.sin(t * 2.2);
    D.bodyG.scale.set(1 + br * 0.006, 1 + br * 0.012, 1);
    D.headG.position.y = br * 0.008;
    D.headG.rotation.z = still ? 0 : Math.sin(t * 0.9) * 0.045;   // 가만히 있어도 고개를 살랑
    D.root.position.y = 0; D.root.scale.set(1, 1, 1);
    D.arms[0].rotation.z = -P.arms.rot; D.arms[1].rotation.z = P.arms.rot; D.arms[1].rotation.x = 0;
    D.arms[1].position.copy(D.arms[1].userData.home);
    D.mouth.scale.y = 0.001;

    let dnaT = 0, spikeT = 0;
    if (m === "think") {
      dnaT = 1;
      D.headG.rotation.z = 0.18 * Math.min(1, dt * 3);
      D.headG.rotation.y += 0.12 * Math.sin(t * 0.8);
    } else if (m === "nod") {
      D.headG.rotation.x += Math.sin(Math.min(1, dt / 0.7) * Math.PI * 2) * 0.2;
      if (dt > 0.75) set("idle");
    } else if (m === "talk") {
      D.root.position.y = Math.abs(Math.sin(t * 7)) * 0.03;
      D.mouth.scale.y = 0.3 + 0.7 * Math.abs(Math.sin(t * 9));
    } else if (m === "hop") {
      const k = Math.min(1, dt / 0.62);
      spikeT = 1;
      const air = Math.sin(Math.PI * Math.min(1, Math.max(0, (k - 0.15) / 0.7)));
      D.root.position.y = air * 0.3;
      const sq = k < 0.15 ? k / 0.15 : k > 0.85 ? (1 - k) / 0.15 : 0;
      D.root.scale.set(1 + sq * 0.1, 1 - sq * 0.12, 1 + sq * 0.1);
      D.arms[0].rotation.z = -P.arms.rot - air * 1.2; D.arms[1].rotation.z = P.arms.rot + air * 1.2;
      if (k >= 1) set("idle");
    } else if (m === "wave") {               // 공식 '안녕!' — 화면 오른쪽 손을 든다
      // 볼 앞으로 꺼내 든다 — 머리 뒤로 올리면 가려진다. 손바닥 젤리가 보이게.
      D.arms[1].position.set(...O(398, 405), 0.42);
      D.arms[1].rotation.z = 2.75 + (still ? 0 : 0.3 * Math.sin(t * 10));
      D.arms[1].rotation.x = -0.25;
      D.headG.rotation.z = 0.17;            // 고개를 살짝 갸웃 — 공식 그림 그대로
      D.mouth.scale.y = 1;
      if (!still && dt > 1.8) set("idle");
    }
    st.dna += (dnaT - st.dna) * (still ? 1 : 0.08);
    st.spike += (spikeT - st.spike) * (still ? 1 : 0.25);
    D.setHair({ dna: st.dna, spike: st.spike, sway: still ? 0 : Math.sin(t * 1.7) * 0.6 });

    let lid = 1;
    if (!still) {
      if (t > st.nextBlink) { st.nextBlink = t + 2.8 + Math.random() * 3.2; st.blinkAt = t; }
      const b = t - (st.blinkAt ?? -9);
      if (b < 0.14) lid = Math.abs(b / 0.07 - 1) * 0.92 + 0.08;
    }
    D.eyes.forEach((e) => (e.scale.y = lid));
  }

  function frameOnce() { pose((performance.now() - t0) / 1000); renderer.render(scene, cam); }
  function loop() {
    raf = 0;
    if (!alive || !visible || document.hidden) return;
    frameOnce();
    raf = requestAnimationFrame(loop);
  }
  function kick() { if (still) { frameOnce(); return; } if (!raf) raf = requestAnimationFrame(loop); }
  function set(mood) { st.mood = mood; st.since = (performance.now() - t0) / 1000; if (still) frameOnce(); }

  frameOnce();                               // 첫 프레임을 그린 뒤에야 끼운다
  box.appendChild(canvas);

  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; kick(); });
  io.observe(canvas);
  const onVis = () => kick();
  document.addEventListener("visibilitychange", onVis);
  kick();

  return {
    canvas, set,
    get mood() { return st.mood; },
    lookAt(nx, ny) { st.look = [nx, ny]; if (still) frameOnce(); },
    turn(rad) { st.turn = rad; frameOnce(); },              // 시안 캡처용(정면·3/4·옆)
    dispose() {
      alive = false; io.disconnect(); document.removeEventListener("visibilitychange", onVis);
      cancelAnimationFrame(raf); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
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
