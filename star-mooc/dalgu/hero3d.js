// 도입부 3D — 여섯 기관이 한 궤도 위에서 이어지는 별자리. 표제 뒤 배경으로만 쓴다(누를 것 없음).
//
//   const h = await mountHero(host);   // 실패하면 null — 그러면 평범한 흰 표제 그대로
//   h.dispose();
//
// 처음 2.4초는 카메라가 멀리서 비스듬히 다가오며 별들이 제자리로 모이고(도입 움직임),
// 그 뒤로는 천천히 돌고 마우스 쪽으로 살짝 기운다. 색은 페이지의 CSS 토큰을 읽어 밝은·어두운 화면을 따른다.
import * as THREE from "./vendor/three.module.min.js";
import { makeLogo } from "./logo3d.js";

const INST = ["KAIST", "GIST", "DGIST", "UNIST", "POSTECH", "UST"];
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

function tokens() {
  const cs = getComputedStyle(document.documentElement), g = (n) => cs.getPropertyValue(n).trim();
  return { accent: g("--accent"), s1: g("--s1"), s2: g("--s2"), s3: g("--s3"), ink: g("--ink"), sheet: g("--sheet"), muted: g("--muted") };
}

function label(text, color) {
  const c = document.createElement("canvas"), x = c.getContext("2d");
  c.width = 256; c.height = 64;
  x.font = "600 30px 'IBM Plex Mono', ui-monospace, monospace";
  x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = color;
  x.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(0.8, 0.2, 1);
  return s;
}

function glowTex() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d"), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.25, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export async function mountHero(host) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  } catch (e) { return null; }
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  const world = new THREE.Group(); scene.add(world);
  const ring = new THREE.Group(); ring.rotation.x = -1.08; world.add(ring);   // 비스듬히 눕힌 궤도
  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 4, 5); scene.add(key);

  let T = tokens();
  const glow = glowTex();
  const R = 2.35, trackCols = () => [T.s1, T.s2, T.s3, T.s1, T.s2, T.s3];

  // 궤도 선 두 겹 — 바깥은 점선처럼 가늘게
  const orbitMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.35 });
  const orbitPts = []; for (let i = 0; i <= 128; i++) { const a = (i / 128) * Math.PI * 2; orbitPts.push(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0)); }
  ring.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(orbitPts), orbitMat));
  const outerMat = new THREE.LineDashedMaterial({ dashSize: 0.08, gapSize: 0.12, transparent: true, opacity: 0.28 });
  const outer = new THREE.Line(new THREE.BufferGeometry().setFromPoints(orbitPts.map((p) => p.clone().multiplyScalar(1.32))), outerMat);
  outer.computeLineDistances(); ring.add(outer);

  // 여섯 기관 별 — 공 + 빛무리 + 이름
  const nodes = INST.map((name, i) => {
    const a = (i / INST.length) * Math.PI * 2 + Math.PI / 2;
    const g = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 3), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, opacity: 0.55 }));
    halo.scale.setScalar(0.85);
    g.add(halo, ball);
    ring.add(g);
    return { name, a, g, ball, halo, lab: null, home: new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0),
      from: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, 2 + Math.random() * 4) };
  });

  // 별끼리 잇는 선(육각 + 두 삼각 = 별 모양) — 도입 때 차례로 그어진다
  const pairs = [];
  for (let i = 0; i < 6; i++) pairs.push([i, (i + 1) % 6]);
  for (let i = 0; i < 6; i++) pairs.push([i, (i + 2) % 6]);
  const linkGeo = new THREE.BufferGeometry();
  const linkPos = new Float32Array(pairs.length * 6);
  linkGeo.setAttribute("position", new THREE.BufferAttribute(linkPos, 3));
  const linkMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.5 });
  const links = new THREE.LineSegments(linkGeo, linkMat); ring.add(links);

  // 가운데 STAR-MOOC 로고 — 혜성이 손글씨 별을 그린다(logo3d.js)
  const logo = makeLogo({ renderer, glow, reduce }), core = logo.group;
  const coreHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, opacity: 0.35 }));
  coreHalo.scale.setScalar(2.2);
  world.add(coreHalo, core);

  // 떠다니는 먼지 별
  const N = 260, dust = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 1.5 + Math.random() * 5, a = Math.random() * Math.PI * 2, y = (Math.random() - 0.5) * 4;
    dust.set([Math.cos(a) * r, y, Math.sin(a) * r - 1], i * 3);
  }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute("position", new THREE.BufferAttribute(dust, 3));
  const dustMat = new THREE.PointsMaterial({ size: 0.035, transparent: true, opacity: 0.55, depthWrite: false });
  const dustPts = new THREE.Points(dustGeo, dustMat); world.add(dustPts);

  function paint() {
    T = tokens();
    const cols = trackCols();
    nodes.forEach((n, i) => {
      n.ball.material.color.set(cols[i]); n.halo.material.color.set(cols[i]);
      if (n.lab) { n.g.remove(n.lab); n.lab.material.map.dispose(); n.lab.material.dispose(); }
      n.lab = label(n.name, T.ink); n.lab.position.set(0, -0.32, 0); n.g.add(n.lab);
    });
    orbitMat.color.set(T.accent); outerMat.color.set(T.muted); linkMat.color.set(T.accent);
    logo.paint(new THREE.Color(T.sheet).getHSL({}).l < 0.4);   // 어두운 화면에선 밝은 로고
    coreHalo.material.color.set(T.accent); dustMat.color.set(T.accent);
  }
  paint();
  const mo = new MutationObserver(paint); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const mq = matchMedia("(prefers-color-scheme: dark)"); mq.addEventListener("change", paint);

  // 크기 — 넓은 화면은 오른쪽으로 비켜 글을 가리지 않게, 좁은 화면은 가운데 위쪽
  let W = 1, H = 1, side = 0, near = 10.5, nearNow = 10.5;
  function size() {
    W = host.clientWidth || 1; H = host.clientHeight || 1;
    renderer.setSize(W, H, false);
    cam.aspect = W / H; cam.updateProjectionMatrix();
    const intro = host.classList.contains("intro");
    side = intro ? 0 : W > 980 ? 2.4 : W > 680 ? 1.2 : 0;   // 첫 화면 도입 땐 가운데
    near = intro ? (W / H < 0.8 ? 9.5 : 6.6) : 10.5;          // 도입 땐 궤도가 표제를 감싸도록 가까이
    if (!intro) {   // 기관 이름이 화면 밖으로 나가지 않게: 보이는 반폭 안에 궤도(이름 포함 반지름 ≈ 3.4)가 들도록
      const half = Math.tan((cam.fov * Math.PI) / 360) * cam.aspect;   // 거리 1 당 반폭
      near = Math.max(10.5, 3.6 / half);
      side = Math.max(0, Math.min(side, half * near - 3.6));
    }
  }
  const ro = new ResizeObserver(size); ro.observe(host); size();
  const mo2 = new MutationObserver(size); mo2.observe(host, { attributes: true, attributeFilter: ["class"] });
  world.position.x = side; nearNow = near;

  let px = 0, py = 0, tx = 0, ty = 0;
  const onMove = (e) => { tx = (e.clientX / innerWidth - 0.5) * 2; ty = (e.clientY / innerHeight - 0.5) * 2; };
  if (matchMedia("(hover: hover) and (pointer: fine)").matches) addEventListener("pointermove", onMove, { passive: true });

  // 화면 밖이면 멈춘다(배터리)
  let visible = true;
  let hiddenAt = 0;   // 30초 넘게 안 보다가 돌아오면 혜성이 로고를 다시 그린다
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (!visible) hiddenAt = performance.now(); else if (hiddenAt && performance.now() - hiddenAt > 30000) logo.replay();
    if (visible && !raf) raf = requestAnimationFrame(frame);
  });
  io.observe(host);

  const t0 = performance.now(), INTRO = reduce ? 0 : 2400;
  const A = new THREE.Vector3(), B = new THREE.Vector3();
  let raf = 0;
  function frame(now) {
    raf = 0;
    const t = now - t0, k = INTRO ? ease(t / INTRO) : 1, sec = t / 1000;
    // 카메라: 멀리 비스듬히 → 제자리
    nearNow += (near - nearNow) * 0.04;
    const dist = nearNow + (1 - k) * 7, swing = (1 - k) * 1.1;
    cam.position.set(Math.sin(swing) * dist - side * 0.0, 0.6 + (1 - k) * 2.5, Math.cos(swing) * dist);
    px += (tx - px) * 0.04; py += (ty - py) * 0.04;
    cam.position.x += px * 0.5; cam.position.y -= py * 0.35;
    cam.lookAt(-side * 0.0, 0, 0);
    world.position.x += (side - world.position.x) * 0.045;   // 도입이 끝나면 오른쪽으로 미끄러져 비킨다
    // 별들이 흩어진 자리에서 궤도 위로 모인다(하나씩 조금씩 늦게)
    nodes.forEach((n, i) => {
      const ki = INTRO ? ease((t - i * 120) / (INTRO * 0.8)) : 1;
      n.g.position.lerpVectors(n.from, n.home, ki);
      n.g.position.z += Math.sin(sec * 1.3 + i) * 0.05 * k;
      n.ball.scale.setScalar(0.4 + 0.6 * ki);
      n.halo.material.opacity = 0.35 + 0.25 * Math.sin(sec * 2 + i * 1.7) * 0.5 + 0.2 * ki;
      n.lab.material.opacity = ease((t - INTRO * 0.7 - i * 80) / 500) * (INTRO ? 1 : 1);
    });
    // 선은 별이 모인 뒤 차례로 그어진다
    pairs.forEach(([a, b], j) => {
      const kj = INTRO ? ease((t - INTRO * 0.55 - j * 70) / 450) : 1;
      A.copy(nodes[a].g.position); B.copy(nodes[b].g.position);
      B.lerpVectors(A, B, kj);
      linkPos.set([A.x, A.y, A.z, B.x, B.y, B.z], j * 6);
    });
    linkGeo.attributes.position.needsUpdate = true;
    linkMat.opacity = 0.18 + 0.22 * k;
    // 느린 회전
    const spin = reduce ? 0 : sec * 0.06;
    ring.rotation.z = spin + (1 - k) * -1.2;
    // 로고는 도입 영상이 걷힌 뒤에 그리기 시작한다(영상 밑에서 다 그려 버리지 않게)
    if (!document.documentElement.classList.contains("intro-on")) logo.update(now, [px, py]);
    coreHalo.material.opacity = 0.18 + 0.06 * Math.sin(sec * 1.6);
    dustPts.rotation.y = reduce ? 0 : sec * 0.015;
    dustMat.opacity = 0.5 * k;
    renderer.render(scene, cam);
    if (visible && !(reduce && t > 200)) raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  // 첫 프레임이 그려진 뒤에 넣는다
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  host.appendChild(renderer.domElement);
  requestAnimationFrame(() => host.classList.add("on"));

  return {
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); mo.disconnect(); mo2.disconnect();
      mq.removeEventListener("change", paint); removeEventListener("pointermove", onMove);
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}
