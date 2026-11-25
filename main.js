import * as THREE from './vendor/three.module.min.js';
import { CONFIG } from './config.js';

const $ = id => document.getElementById(id);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const pad = n => (n < 10 ? '0' : '') + n;

// ---- text from config ----
document.title = CONFIG.name + ' | Video Editor';
$('role').textContent = CONFIG.role;
$('name').textContent = '';
[...CONFIG.name].forEach((ch, i) => {
  const s = document.createElement('span');
  s.textContent = ch; s.style.transitionDelay = (0.5 + i * 0.07) + 's';
  $('name').appendChild(s);
});
if (CONFIG.email) $('mail').href = 'mailto:' + CONFIG.email;

// ---- loader timecode ----
const t0 = performance.now();
let loading = true;
(function tick() {
  if (!loading) return;
  const f = Math.floor((performance.now() - t0) / 1000 * 24);
  $('ltc').textContent = '00:00:' + pad(Math.floor(f / 24) % 60) + ':' + pad(f % 24);
  requestAnimationFrame(tick);
})();
function finishLoading() {
  const wait = Math.max(0, 2200 - (performance.now() - t0));
  setTimeout(() => { loading = false; $('loader').classList.add('off'); document.body.classList.add('go'); }, reduce ? 0 : wait);
}

// ---- renderer ----
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true });
} catch (e) {
  document.body.classList.add('nogl'); finishLoading(); throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x0b1022, 1);
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0b1022, 0.03);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const frameLines = (w, h, color) => new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, h)),
  new THREE.LineBasicMaterial({ color }));

// ---- background: grid, wireframe knot, particles ----
const grid = new THREE.GridHelper(80, 60, 0x52e4ff, 0x2b3566);
grid.position.y = -3.4; grid.material.transparent = true; grid.material.opacity = 0.35;
scene.add(grid);

const knot = new THREE.Mesh(
  new THREE.TorusKnotGeometry(4, 1.1, 180, 24),
  new THREE.MeshBasicMaterial({ color: 0x7a5cff, wireframe: true, transparent: true, opacity: 0.22 }));
knot.position.set(0, 1, -16);
scene.add(knot);

const pc = 1600, pp = new Float32Array(pc * 3);
for (let i = 0; i < pc; i++) {
  pp[i * 3] = (Math.random() - .5) * 60;
  pp[i * 3 + 1] = (Math.random() - .5) * 30;
  pp[i * 3 + 2] = (Math.random() - .5) * 50 - 6;
}
const pg = new THREE.BufferGeometry();
pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
const dust = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0x9fe9ff, size: 0.06, transparent: true, opacity: 0.8 }));
scene.add(dust);

// ---- portrait (holographic shader) ----
const PW = 2.4, PH = 3;
const portraitMat = new THREE.ShaderMaterial({
  uniforms: { map: { value: null }, uTime: { value: 0 }, uRep: { value: new THREE.Vector2(1, 1) }, uOff: { value: new THREE.Vector2(0, 0) } },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform sampler2D map;uniform float uTime;uniform vec2 uRep;uniform vec2 uOff;varying vec2 vUv;
  void main(){
    vec2 uv=vUv*uRep+uOff;
    float sp=.004+.003*sin(uTime*1.3);
    vec3 c=vec3(texture2D(map,uv+vec2(sp,0.)).r,texture2D(map,uv).g,texture2D(map,uv-vec2(sp,0.)).b);
    c+=sin(vUv.y*420.+uTime*4.)*.025;
    float bar=smoothstep(.03,0.,abs(fract(uTime*.22)-vUv.y));
    c+=bar*vec3(.25,.85,1.)*.45;
    float e=smoothstep(0.,.06,min(min(vUv.x,1.-vUv.x),min(vUv.y,1.-vUv.y)));
    gl_FragColor=vec4(mix(vec3(.32,.89,1.),c,e),1.);
  }`
});
portraitMat.uniforms.map.value = canvasTex(800, 1000, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#3a2a9a'); gr.addColorStop(1, '#0b4a6a');
  g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#e7ecff';
  g.font = '700 420px sans-serif'; g.textAlign = 'center'; g.fillText(CONFIG.name[0] || 'R', w / 2, h / 2 + 150);
  g.font = '34px sans-serif'; g.fillText('Add assets/photo.jpg', w / 2, h - 70);
}, false);
const portrait = new THREE.Group();
portrait.add(new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), portraitMat));
portrait.add(frameLines(PW + .2, PH + .2, 0x52e4ff));
const glow = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({
  map: canvasTex(256, 256, (g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(82,228,255,.55)'); r.addColorStop(.5, 'rgba(122,92,255,.2)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); }),
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
glow.position.z = -.4; portrait.add(glow);
scene.add(portrait);
const photoDone = new Promise(res => {
  new THREE.TextureLoader().load(CONFIG.photo, t => {
    const ia = t.image.width / t.image.height, pa = PW / PH;
    const rep = ia > pa ? [pa / ia, 1] : [1, ia / pa];
    portraitMat.uniforms.uRep.value.set(rep[0], rep[1]);
    portraitMat.uniforms.uOff.value.set((1 - rep[0]) / 2, (1 - rep[1]) / 2);
    t.colorSpace = THREE.NoColorSpace;
    portraitMat.uniforms.map.value = t; res();
  }, undefined, () => res());
});

// ---- video ring ----
const VW = 4.8, VH = 2.7, R = 5.2, N = CONFIG.videos.length, STEP = Math.PI * 2 / N;
const ring = new THREE.Group(); scene.add(ring);
const panels = CONFIG.videos.map((v, i) => {
  const ph = canvasTex(1280, 720, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, `hsl(${230 + i * 40} 70% 35%)`); gr.addColorStop(1, '#0b1022');
    g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#e7ecff'; g.textAlign = 'center';
    g.font = '700 70px sans-serif'; g.fillText(v.title, w / 2, h / 2); g.font = '34px sans-serif'; g.fillText('Add ' + v.src, w / 2, h / 2 + 64);
  });
  const mat = new THREE.MeshBasicMaterial({ map: ph });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(VW, VH), mat);
  mesh.add(frameLines(VW + .14, VH + .14, i % 2 ? 0xff5c8a : 0x52e4ff));
  const a = i * STEP;
  mesh.position.set(Math.sin(a) * R, 0, Math.cos(a) * R); mesh.rotation.y = a;
  mesh.userData.i = i; ring.add(mesh);
  const el = document.createElement('video');
  el.muted = true; el.loop = true; el.playsInline = true; el.preload = 'auto';
  el.src = v.preview || v.src;
  el.addEventListener('loadeddata', () => {
    const vt = new THREE.VideoTexture(el); vt.colorSpace = THREE.SRGBColorSpace;
    mat.map = vt; mat.needsUpdate = true; el.play().catch(() => {});
  });
  return mesh;
});

// ---- state ----
let state = 'hero', k = 0, spin = 0, mx = 0, my = 0;
const sel = () => ((k % N) + N) % N;
function info() {
  const v = CONFIG.videos[sel()];
  $('count').textContent = (sel() + 1) + ' / ' + N; $('vt').textContent = v.title; $('vtag').textContent = v.tag;
}
info();
const io = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  const s = e.target.dataset.state;
  if (s === 'work' && state !== 'work') k = Math.round(-ring.rotation.y / STEP);
  state = s; info();
}), { threshold: 0.5 });
document.querySelectorAll('section').forEach(s => io.observe(s));
const go = d => { k += d; info(); };
$('prev').onclick = () => go(-1); $('next').onclick = () => go(1);
addEventListener('keydown', e => {
  if (!$('modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
  if (state === 'work') { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); }
});
function openModal() {
  const mv = $('mv'); mv.src = CONFIG.videos[sel()].src; $('modal').hidden = false; mv.play().catch(() => {});
}
function closeModal() { const mv = $('mv'); mv.pause(); mv.removeAttribute('src'); mv.load(); $('modal').hidden = true; }
$('play').onclick = openModal; $('close').onclick = closeModal;
$('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });

const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
function pick(e) {
  mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight * 2 - 1));
  ray.setFromCamera(mouse, camera);
  const h = ray.intersectObjects(panels)[0]; return h ? h.object.userData.i : -1;
}
addEventListener('pointermove', e => {
  mx = e.clientX / innerWidth * 2 - 1; my = e.clientY / innerHeight * 2 - 1;
  if (state === 'work' && e.target === $('gl')) $('gl').style.cursor = pick(e) >= 0 ? 'pointer' : 'default';
});
$('gl').addEventListener('click', e => {
  if (state !== 'work') return;
  const i = pick(e); if (i < 0) return;
  let d = ((i - sel()) + N) % N; if (d > N / 2) d -= N;
  if (d === 0) openModal(); else go(d);
});

// ---- resize + loop ----
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
const lerp = (a, b, t) => a + (b - a) * t;
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  const aspect = innerWidth / innerHeight, work = state === 'work', wide = aspect > 1.2;
  const baseZ = aspect < 1 ? 9 + (1 - aspect) * 8 : 9;
  const vh = 2 * baseZ * Math.tan(THREE.MathUtils.degToRad(25)), vw = vh * aspect;
  const f = 1 - Math.pow(0.001, dt);

  camera.position.x = lerp(camera.position.x, mx * 0.9, f * .6);
  camera.position.y = lerp(camera.position.y, -my * 0.5 + 0.3, f * .6);
  camera.position.z = lerp(camera.position.z, baseZ, f);
  camera.lookAt(0, 0, 0);

  const speed = reduce ? 0 : 1;
  if (work) ring.rotation.y = lerp(ring.rotation.y, -k * STEP, f * 1.1);
  else { spin += dt * 0.18 * speed; ring.rotation.y += dt * 0.18 * speed; }
  ring.position.z = lerp(ring.position.z, work ? 3 - R : -R - 3.5, f);
  ring.rotation.x = lerp(ring.rotation.x, work ? 0 : 0.12, f);

  const tx = work ? vw * 0.36 : (wide ? vw * 0.2 : 0);
  const ty = work ? vh * 0.34 : (wide ? 0.2 : vh * 0.14);
  const ts = work ? 0.38 : (wide ? 1 : 0.85);
  portrait.position.x = lerp(portrait.position.x, tx, f);
  portrait.position.y = lerp(portrait.position.y, ty + Math.sin(t * 1.2) * 0.08, f);
  portrait.scale.setScalar(lerp(portrait.scale.x, ts, f));
  portrait.rotation.y = lerp(portrait.rotation.y, mx * 0.3, f);
  portrait.rotation.x = lerp(portrait.rotation.x, my * 0.15, f);
  portraitMat.uniforms.uTime.value = t;

  knot.rotation.x = t * 0.05 * speed + scrollY * 0.0006;
  knot.rotation.y = t * 0.08 * speed + scrollY * 0.001;
  dust.rotation.y = t * 0.01 * speed;
  grid.position.z = (t * 0.6 * speed) % (80 / 60);
  renderer.render(scene, camera);
});

Promise.all([photoDone]).then(finishLoading);
