import * as THREE from '/vendor/three.module.js';

// Köprü sahnesi yalnız görsel katmandır: sonucu sunucu belirler, burada sadece oynatılır.
// Sonsuz köprü sabit sayıda yeniden kullanılan parçayla çizilir; ilerleme sayısal durumdur.
export const SEG = 3;           // Bir doğru cevabın köprüde kapladığı mesafe.
const W = 7;                    // Köprü genişliği.
const PLANK_STEP = 1, PLANKS = 72, POST_STEP = 4, POSTS = 20, ROCK_STEP = 5, ROCKS = 18;
const COLORS = ['#ff9f43', '#5ec8ff', '#ff6b9a', '#8be07a', '#c59bff', '#ffd166', '#4fd1c5', '#ff7a5c', '#9fb4ff', '#f6a6ff', '#b8e986', '#ffc3a0'];
// Açığa çıkma zaman çizelgesi (saniye).
const T = {lateral: .5, runStart: .6, runEnd: 1.4, logStart: .2, impact: 1.25, knockEnd: 1.95, back: 2.6, backEnd: 3.3, end: 3.6};

const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const clamp01 = v => Math.max(0, Math.min(1, v));
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const lerp = (a, b, t) => a + (b - a) * t;
export const colorFor = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
export const laneX = (lane, count) => -W / 2 + W * (lane + .5) / count;

function flameTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 40, 2, 32, 36, 30);
  grad.addColorStop(0, 'rgba(255,245,200,1)'); grad.addColorStop(.35, 'rgba(255,170,60,.9)'); grad.addColorStop(.7, 'rgba(255,80,20,.35)'); grad.addColorStop(1, 'rgba(255,40,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function letterTexture(letter) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 128, 128);
  g.font = '800 92px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#fff'; g.fillText(letter, 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createScene(container, labelLayer, {quality = 'high', reducedMotion = false} = {}) {
  const renderer = new THREE.WebGLRenderer({antialias: quality === 'high', powerPreference: 'high-performance'});
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2a1524');
  scene.fog = new THREE.Fog('#3b1a22', 18, 62);
  const camera = new THREE.PerspectiveCamera(55, 1, .1, 120);
  camera.position.set(0, 5.5, 9);
  const disposables = [];
  const keep = (...items) => { disposables.push(...items); return items[0]; };

  scene.add(new THREE.HemisphereLight('#ffc9a0', '#4a1414', 1.35));
  const sun = new THREE.DirectionalLight('#ffd7b0', 1.6); sun.position.set(-6, 12, 6); scene.add(sun);
  const lavaLight = new THREE.PointLight('#ff5a1f', 40, 30, 1.6); lavaLight.position.set(0, -4, 0); scene.add(lavaLight);

  // Lav, kanyon ve köprü parçaları.
  const lava = new THREE.Mesh(keep(new THREE.PlaneGeometry(200, 200)), keep(new THREE.MeshStandardMaterial({color: '#ff4a12', emissive: '#ff3a00', emissiveIntensity: 1.1, roughness: .9})));
  lava.rotation.x = -Math.PI / 2; lava.position.y = -12; scene.add(lava);
  const rockMat = keep(new THREE.MeshStandardMaterial({color: '#3a2226', roughness: 1, flatShading: true}));
  const rocks = new THREE.InstancedMesh(keep(new THREE.IcosahedronGeometry(1, 0)), rockMat, ROCKS * 2);
  scene.add(rocks);
  const plankMat = keep(new THREE.MeshStandardMaterial({color: '#ffffff', roughness: .85}));
  const planks = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(W, .18, PLANK_STEP * .86)), plankMat, PLANKS);
  planks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PLANKS * 3), 3);
  scene.add(planks);
  const woodDark = keep(new THREE.MeshStandardMaterial({color: '#4a2a1a', roughness: .9}));
  const posts = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(.22, 1.4, .22)), woodDark, POSTS * 2); scene.add(posts);
  const railGeo = keep(new THREE.BoxGeometry(.08, .08, 90)), ropeMat = keep(new THREE.MeshStandardMaterial({color: '#c9a36b', roughness: .8}));
  const rails = [-1, 1].map(side => { const m = new THREE.Mesh(railGeo, ropeMat); m.position.set(side * (W / 2 + .05), 1.15, 0); scene.add(m); return m; });
  const beams = [-1, 1].map(side => { const m = new THREE.Mesh(keep(new THREE.BoxGeometry(.3, .3, 90)), woodDark); m.position.set(side * (W / 2 - .6), -.25, 0); scene.add(m); return m; });

  // Oyuncuya özel şerit işaretleri (her istemci yalnız kendi şık sırasını görür).
  const laneGeo = keep(new THREE.PlaneGeometry(1, SEG * .9)), letterGeo = keep(new THREE.PlaneGeometry(1.1, 1.1));
  const letters = ['A', 'B', 'C', 'D'].map(l => keep(letterTexture(l)));
  const lanes = [0, 1, 2, 3].map(i => {
    const strip = new THREE.Mesh(laneGeo, keep(new THREE.MeshBasicMaterial({color: '#ffffff', transparent: true, opacity: .12, depthWrite: false})));
    strip.rotation.x = -Math.PI / 2; strip.position.y = .1;
    const label = new THREE.Mesh(letterGeo, keep(new THREE.MeshBasicMaterial({map: letters[i], transparent: true, depthWrite: false})));
    label.rotation.x = -Math.PI / 2; label.position.y = .12;
    scene.add(strip, label); return {strip, label};
  });

  // Uçuşan korlar.
  const emberCount = quality === 'high' && !reducedMotion ? 260 : 70;
  const emberPos = new Float32Array(emberCount * 3), emberSeed = new Float32Array(emberCount);
  for (let i = 0; i < emberCount; i++) { emberPos[i * 3] = (hash(i) - .5) * 40; emberPos[i * 3 + 1] = -12 + hash(i + 7) * 20; emberPos[i * 3 + 2] = -hash(i + 3) * 60 + 10; emberSeed[i] = hash(i + 11); }
  const emberGeo = keep(new THREE.BufferGeometry()); emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
  const embers = new THREE.Points(emberGeo, keep(new THREE.PointsMaterial({color: '#ffb35a', size: .14, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false})));
  scene.add(embers);

  // Avatarlar ve kütükler.
  const flameTex = keep(flameTexture());
  const bodyGeo = keep(new THREE.CapsuleGeometry(.3, .5, 4, 10)), headGeo = keep(new THREE.SphereGeometry(.26, 16, 12));
  const shadowGeo = keep(new THREE.CircleGeometry(.42, 20)), shadowMat = keep(new THREE.MeshBasicMaterial({color: '#000', transparent: true, opacity: .35, depthWrite: false}));
  const ringGeo = keep(new THREE.RingGeometry(.48, .58, 28)), ringMat = keep(new THREE.MeshBasicMaterial({color: '#ff7a2f', transparent: true, opacity: .9, depthWrite: false}));
  const logGeo = keep(new THREE.CylinderGeometry(.55, .55, 1.6, 14)), logMat = keep(new THREE.MeshStandardMaterial({color: '#6b3b1f', roughness: .9}));
  const logCapGeo = keep(new THREE.CircleGeometry(.5, 14)), logCapMat = keep(new THREE.MeshStandardMaterial({color: '#c98a4b', roughness: .8}));
  const warnGeo = keep(new THREE.PlaneGeometry(1.4, 16)), avatars = new Map();

  function makeLog() {
    const group = new THREE.Group(), roll = new THREE.Group(), body = new THREE.Mesh(logGeo, logMat);
    body.rotation.z = Math.PI / 2; roll.add(body);
    for (const side of [-1, 1]) { const cap = new THREE.Mesh(logCapGeo, logCapMat); cap.position.x = side * .81; cap.rotation.y = side * Math.PI / 2; roll.add(cap); }
    const warn = new THREE.Mesh(warnGeo, new THREE.MeshBasicMaterial({color: '#ff3b30', transparent: true, opacity: 0, depthWrite: false}));
    warn.rotation.x = -Math.PI / 2; warn.position.y = .11;
    group.add(roll); scene.add(group, warn); group.visible = false;
    return {group, roll, warn};
  }
  function avatar(id) {
    const color = new THREE.Color(colorFor(id));
    const group = new THREE.Group(), figure = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({color, roughness: .55, emissive: '#ff5a00', emissiveIntensity: 0});
    const body = new THREE.Mesh(bodyGeo, mat); body.position.y = .56;
    const head = new THREE.Mesh(headGeo, mat); head.position.y = 1.2;
    figure.add(body, head);
    const shadow = new THREE.Mesh(shadowGeo, shadowMat); shadow.rotation.x = -Math.PI / 2; shadow.position.y = .1;
    const ring = new THREE.Mesh(ringGeo, ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = .105; ring.visible = false;
    const flames = [0, 1, 2].map(i => { const s = new THREE.Sprite(new THREE.SpriteMaterial({map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true})); s.visible = false; s.position.set((i - 1) * .18, 1.1, .1); figure.add(s); return s; });
    group.add(figure, shadow, ring); scene.add(group);
    const el = document.createElement('div'); el.className = 'label'; labelLayer.appendChild(el);
    return {id, group, figure, mat, ring, flames, el, x: 0, z: 0, y: 0, seed: hash(avatars.size + 1) * 10, log: makeLog(), text: ''};
  }
  function dropAvatar(a) {
    scene.remove(a.group, a.log.group, a.log.warn); a.mat.dispose(); a.log.warn.material.dispose();
    for (const f of a.flames) f.material.dispose();
    a.el.remove();
  }

  let state = null, me = null, anim = null, running = false, frame = 0, last = 0, shake = 0, clockOffset = 0;
  const camTarget = new THREE.Vector3(), look = new THREE.Vector3(0, .8, -7), tmp = new THREE.Vector3(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), c3 = new THREE.Color(), euler = new THREE.Euler();

  function slotX(index, count) {
    const gap = Math.min(.95, (W - 1.4) / Math.max(1, count - 1));
    return (index - (count - 1) / 2) * gap;
  }

  function setState(next, myId, offset = 0) {
    state = next; me = myId; clockOffset = offset;
    const ids = new Set(next.players.map(p => p.id));
    for (const [id, a] of avatars) if (!ids.has(id)) { dropAvatar(a); avatars.delete(id); }
    const order = [...next.players].sort((a, b) => a.id < b.id ? -1 : 1);
    order.forEach((p, i) => {
      let a = avatars.get(p.id);
      if (!a) { a = avatar(p.id); avatars.set(p.id, a); a.z = -p.position * SEG; a.x = slotX(i, order.length); }
      a.slot = slotX(i, order.length); a.player = p; a.ring.visible = p.id === myId;
      a.el.classList.toggle('me', p.id === myId);
    });
    const qn = next.question;
    if (next.phase === 'reveal' && qn?.results && anim?.round !== qn.round) {
      const serverNow = Date.now() + offset;
      const elapsed = Math.max(0, Math.min(next.timing.reveal, next.timing.reveal - (next.until - serverNow)));
      const count = qn.options.length, plans = {};
      for (const [id, r] of Object.entries(qn.results)) plans[id] = {...r, count};
      anim = {round: qn.round, start: performance.now() - elapsed, plans};
    }
    updateLanes();
  }

  function updateLanes() {
    const qn = state?.question, a = avatars.get(me);
    const show = qn && ['question', 'reveal'].includes(state.phase) && a;
    lanes.forEach((lane, i) => {
      const visible = !!show && i < qn.options.length;
      lane.strip.visible = lane.label.visible = visible;
      if (!visible) return;
      const count = qn.options.length, width = W / count;
      lane.strip.scale.x = width * .94;
      const chosen = qn.choice === qn.options[i].id, correct = qn.correct && qn.correct === qn.options[i].id;
      lane.strip.material.color.set(correct ? '#3fd18f' : chosen ? (qn.correct ? '#ff5a5f' : '#ff7a2f') : '#ffffff');
      lane.strip.material.opacity = correct ? .45 : chosen ? .42 : .1;
      lane.label.material.opacity = chosen || correct ? 1 : .55;
    });
  }

  function plannedPosition(a, t, p) {
    const plan = anim?.plans[a.id];
    const baseZ = -p.position * SEG;
    if (!plan || t >= T.end) return {x: a.slot, z: baseZ, y: 0, tumble: 0, done: true};
    const fromZ = -plan.from * SEG, toZ = -plan.position * SEG;
    if (plan.skip) return {x: a.slot, z: baseZ, y: 0, tumble: 0};
    const laneTarget = plan.lane >= 0 ? laneX(plan.lane, plan.count) + a.slot * .12 : a.slot;
    let x = a.slot;
    if (t < T.back) x = lerp(a.slot, laneTarget, ease(clamp01(t / T.lateral)));
    else x = lerp(laneTarget, a.slot, ease(clamp01((t - T.back) / (T.backEnd - T.back))));
    let z = fromZ, y = 0, tumble = 0;
    if (plan.correct) {
      const k = clamp01((t - T.runStart) / (T.runEnd - T.runStart));
      z = lerp(fromZ, toZ, ease(k)); y = Math.abs(Math.sin(k * Math.PI * 3)) * .35 * (k > 0 && k < 1);
    } else {
      const k = clamp01((t - T.impact) / (T.knockEnd - T.impact));
      z = lerp(fromZ, toZ, ease(k)); y = Math.sin(k * Math.PI) * (reducedMotion ? .3 : 1.3);
      tumble = reducedMotion ? 0 : k * Math.PI * 2 * (k < 1);
      if (t < T.impact) y = Math.max(0, Math.sin(t * 16)) * .05; // Tedirgin bekleyiş.
    }
    return {x, z, y, tumble, laneTarget, fromZ};
  }

  function updateLog(a, t, plan, pos) {
    const {group, roll, warn} = a.log;
    const active = plan && !plan.skip && !plan.correct && t >= T.logStart && t < T.knockEnd + .5;
    group.visible = active; warn.visible = active && t < T.impact;
    if (!active) return;
    const lx = plan.lane >= 0 ? pos.laneTarget : a.slot, target = pos.fromZ;
    const k = (t - T.logStart) / (T.impact - T.logStart);
    const z = target - 16 + 16 * k;           // Karşıdan gelip tam oyuncuya çarpar.
    group.position.set(lx, .55 + (t > T.impact ? -(t - T.impact) * (t - T.impact) * 6 : 0), z);
    roll.rotation.x = -k * 7;
    warn.position.set(lx, .11, target - 8);
    warn.material.opacity = .28 * (1 - clamp01(k)) + .1;
  }

  function place(time, dt) {
    const t = anim ? (performance.now() - anim.start) / 1000 : Infinity;
    if (anim && t > T.end + .5) anim = null;
    const qn = state?.question;
    for (const a of avatars.values()) {
      const p = a.player, pos = plannedPosition(a, t, p);
      const smooth = anim?.plans[a.id] && !pos.done ? 1 : 1 - Math.pow(.001, dt);
      a.x = lerp(a.x, pos.x, smooth); a.z = lerp(a.z, pos.z, smooth); a.y = pos.y;
      a.group.position.set(a.x, 0, a.z);
      a.figure.position.y = a.y + (state?.phase === 'question' ? Math.sin(time * 3 + a.seed) * .03 : 0);
      a.figure.rotation.x = pos.tumble || 0;
      updateLog(a, t, anim?.plans[a.id], pos);
      if (a.id === me && anim?.plans[a.id] && !anim.plans[a.id].correct && !anim.plans[a.id].skip && t >= T.impact && !a.hitAt) { a.hitAt = anim.round; if (!reducedMotion) shake = .35; }
      if (a.hitAt && a.hitAt !== anim?.round) a.hitAt = 0;
      // Ateş serisi: 2'de kıvılcım, 3'ten itibaren büyüyen alev.
      const streak = p.streak || 0, level = Math.min(4, Math.max(0, streak - 1));
      a.mat.emissiveIntensity = streak >= 2 ? .12 + level * .08 + Math.sin(time * 8 + a.seed) * .03 : 0;
      a.flames.forEach((f, i) => {
        const on = streak >= 3 && (i === 1 || (streak >= 4 && quality === 'high') || streak >= 5);
        f.visible = on;
        if (!on) return;
        const flick = 1 + Math.sin(time * 14 + i * 2 + a.seed) * .12;
        const size = (.55 + level * .22) * (i === 1 ? 1.15 : .8) * flick;
        f.scale.set(size * .8, size * 1.3, 1); f.position.y = 1.35 + size * .35;
      });
      // İsim etiketi.
      tmp.set(a.x, a.y + 1.85, a.z).project(camera);
      const visible = tmp.z < 1 && Math.abs(tmp.x) < 1.2 && Math.abs(tmp.y) < 1.2;
      a.el.style.display = visible ? '' : 'none';
      if (visible) {
        const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
        a.el.style.transform = `translate(${((tmp.x + 1) / 2 * w).toFixed(1)}px,${((1 - tmp.y) / 2 * h).toFixed(1)}px) translate(-50%,-100%)`;
        const res = qn?.results?.[a.id], showPts = anim && res && t > T.runEnd;
        const text = `${p.name}${showPts ? (res.correct ? ` <span class="pts">+${res.points}</span>` : '') : ''}${state?.phase === 'question' && p.ready ? '<span class="ready"></span>' : ''}`;
        if (text !== a.text) { a.text = text; a.el.innerHTML = ''; a.el.append(p.name); if (showPts && res.correct) { const s = document.createElement('span'); s.className = 'pts'; s.textContent = `+${res.points}`; a.el.append(s); } if (state?.phase === 'question' && p.ready) { const r = document.createElement('span'); r.className = 'ready'; a.el.append(r); } }
      }
    }
  }

  function world(camZ) {
    const start = Math.floor((camZ + 14) / PLANK_STEP) * PLANK_STEP;
    for (let i = 0; i < PLANKS; i++) {
      const z = start - i * PLANK_STEP, k = Math.round(z / PLANK_STEP);
      q.setFromAxisAngle(tmp.set(0, 1, 0), (hash(k) - .5) * .03);
      m4.compose(tmp.set(0, (hash(k + 5) - .5) * .03, z), q, s3.set(1, 1, 1)); planks.setMatrixAt(i, m4);
      c3.set('#8a5a36').offsetHSL((hash(k + 9) - .5) * .03, 0, (hash(k + 2) - .5) * .12); planks.setColorAt(i, c3);
    }
    planks.instanceMatrix.needsUpdate = true; planks.instanceColor.needsUpdate = true;
    const postStart = Math.floor((camZ + 12) / POST_STEP) * POST_STEP;
    for (let i = 0; i < POSTS; i++) for (const [j, side] of [[0, -1], [1, 1]]) {
      m4.makeTranslation(side * (W / 2 + .05), .55, postStart - i * POST_STEP); posts.setMatrixAt(i * 2 + j, m4);
    }
    posts.instanceMatrix.needsUpdate = true;
    const rockStart = Math.floor((camZ + 20) / ROCK_STEP) * ROCK_STEP;
    for (let i = 0; i < ROCKS; i++) for (const [j, side] of [[0, -1], [1, 1]]) {
      const z = rockStart - i * ROCK_STEP, k = Math.round(z / ROCK_STEP) * 2 + j, size = 3 + hash(k) * 4;
      q.setFromEuler(euler.set(hash(k + 1) * 3, hash(k + 2) * 3, 0));
      m4.compose(tmp.set(side * (W / 2 + 7 + hash(k + 3) * 6), -6 + hash(k + 4) * 5, z), q, s3.set(size, size * (1.2 + hash(k + 6)), size)); rocks.setMatrixAt(i * 2 + j, m4);
    }
    rocks.instanceMatrix.needsUpdate = true;
    for (const m of [...rails, ...beams]) m.position.z = camZ - 30;
    lava.position.z = camZ - 30; lavaLight.position.z = camZ - 8;
  }

  function updateEmbers(time, dt, camZ) {
    for (let i = 0; i < emberCount; i++) {
      const o = i * 3;
      emberPos[o + 1] += dt * (1 + emberSeed[i] * 2);
      emberPos[o] += Math.sin(time + emberSeed[i] * 20) * dt * .3;
      if (emberPos[o + 1] > 8 || emberPos[o + 2] > camZ + 12 || emberPos[o + 2] < camZ - 60) {
        emberPos[o] = (hash(i + time) - .5) * 40; emberPos[o + 1] = -12; emberPos[o + 2] = camZ + 10 - hash(i * 3 + time) * 70;
      }
    }
    emberGeo.attributes.position.needsUpdate = true;
  }

  function render(now) {
    if (!running) return;
    frame = requestAnimationFrame(render);
    const dt = Math.min(.1, (now - (last || now)) / 1000); last = now;
    const time = now / 1000;
    place(time, dt);
    const mine = avatars.get(me), meZ = mine ? mine.z : 0;
    const portrait = camera.aspect < 1;
    camTarget.set(mine ? mine.x * .3 : 0, portrait ? 9.5 : 8, meZ + (portrait ? 9.5 : 7.6));
    camera.position.lerp(camTarget, 1 - Math.pow(.02, dt));
    look.lerp(tmp.set(mine ? mine.x * .2 : 0, 0, meZ - (portrait ? 4.5 : 5.5)), 1 - Math.pow(.02, dt));
    if (shake > 0) { shake = Math.max(0, shake - dt); camera.position.x += (Math.random() - .5) * shake; camera.position.y += (Math.random() - .5) * shake; }
    camera.lookAt(look);
    world(camera.position.z);
    // Şerit işaretleri benim önümde, bir adım ileride durur.
    const qn = state?.question;
    if (qn && mine) lanes.forEach((lane, i) => {
      if (i >= qn.options.length) return;
      const x = laneX(i, qn.options.length), z = -(anim?.plans[me]?.from ?? mine.player.position) * SEG - SEG * 1.05;
      lane.strip.position.set(x, .1, z); lane.label.position.set(x, .13, z);
    });
    updateEmbers(time, dt, camera.position.z);
    lava.material.emissiveIntensity = 1 + Math.sin(time * 1.3) * .12;
    renderer.render(scene, camera);
  }

  function resize() {
    const w = container.clientWidth || innerWidth, h = container.clientHeight || innerHeight;
    renderer.setPixelRatio(quality === 'high' ? Math.min(devicePixelRatio, 2) : 1);
    renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.fov = w < h ? 72 : 55; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();

  return {
    setState,
    start() { if (running) return; running = true; last = 0; frame = requestAnimationFrame(render); },
    stop() { running = false; cancelAnimationFrame(frame); },
    setQuality(value) { quality = value; resize(); },
    setReducedMotion(value) { reducedMotion = value; },
    // Arka plandan dönünce eski animasyon kuyruğu oynatılmaz; en güncel durumdan devam edilir.
    skipAnimation() { anim = null; },
    dispose() {
      running = false; cancelAnimationFrame(frame); removeEventListener('resize', resize);
      for (const a of avatars.values()) dropAvatar(a);
      avatars.clear();
      for (const lane of lanes) { lane.strip.material.dispose(); lane.label.material.dispose(); }
      for (const item of disposables) item.dispose?.();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
