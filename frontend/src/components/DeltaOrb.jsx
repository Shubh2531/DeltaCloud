import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/* Delta Orb: a living sphere that shows the market's state.
 * - Surface ripples harder as prices swing more (energy 0..1).
 * - Colour drifts from teal (rising) through blue (flat) to red (falling) (delta -1..1).
 * - Each market orbits as its own node: green when up on the day, red when down,
 *   larger and further out the bigger its move.
 * - A shock ring fires when a single price tick jumps (spike counter).
 * Values are read through a ref, so the scene is built once and follows live data. */

const NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

export const SHELL_VERTEX = `
uniform float uTime;
uniform float uEnergy;
uniform float uPulse;
varying vec3 vNormalV;
varying vec3 vViewV;
varying float vDisp;
varying vec3 vPos;
${NOISE}
void main(){
  vec3 p = position;
  float slow = snoise(p * 1.5 + vec3(0.0, uTime * 0.30, uTime * 0.18));
  float fast = snoise(p * 4.2 - vec3(uTime * 0.55));
  float wave = sin(p.y * 9.0 - uTime * 7.0) * uPulse;
  float d = slow * (0.05 + uEnergy * 0.16) + fast * 0.035 * uEnergy + wave * 0.05;
  vDisp = d;
  vPos = p;
  vec4 mv = modelViewMatrix * vec4(p + normal * d, 1.0);
  vNormalV = normalize(normalMatrix * normal);
  vViewV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

export const SHELL_FRAGMENT = `
uniform float uTime;
uniform float uEnergy;
uniform float uPulse;
uniform vec3 uColA;
uniform vec3 uColB;
varying vec3 vNormalV;
varying vec3 vViewV;
varying float vDisp;
varying vec3 vPos;
void main(){
  vec3 n = normalize(vNormalV);
  vec3 v = normalize(vViewV);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 2.2);
  float bands = 0.5 + 0.5 * sin(vPos.y * 7.0 + vDisp * 22.0 + uTime * 0.9);
  vec3 col = mix(uColA, uColB, clamp(vDisp * 6.0 + 0.5, 0.0, 1.0));
  col = col * (0.35 + 0.65 * bands) + uColB * fres * 1.5 + vec3(1.0) * uPulse * 0.15;
  float alpha = clamp(0.18 + fres * 1.05 + abs(vDisp) * 2.2 + uPulse * 0.25, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}`;

export const DUST_VERTEX = `
attribute float aSeed;
uniform float uTime;
uniform float uEnergy;
uniform float uPx;
varying float vAlpha;
void main(){
  float ang = uTime * (0.06 + uEnergy * 0.45) * (0.4 + aSeed);
  float c = cos(ang);
  float s = sin(ang);
  vec3 p = vec3(position.x * c - position.z * s,
                position.y + sin(uTime * 0.8 + aSeed * 30.0) * 0.05 * (0.5 + uEnergy * 2.0),
                position.x * s + position.z * c);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (1.5 + aSeed * 3.0) * uPx * (4.0 / max(-mv.z, 0.1));
  vAlpha = 0.25 + 0.75 * aSeed;
  gl_Position = projectionMatrix * mv;
}`;

export const DUST_FRAGMENT = `
uniform vec3 uColor;
varying float vAlpha;
void main(){
  float d = length(gl_PointCoord - vec2(0.5));
  if (d > 0.5) discard;
  gl_FragColor = vec4(uColor, smoothstep(0.5, 0.0, d) * vAlpha);
}`;

const PALETTE = {
  flatA: new THREE.Color("#3b5bdb"), flatB: new THREE.Color("#8b5cf6"),
  upA: new THREE.Color("#00c9a7"), upB: new THREE.Color("#5cffd6"),
  downA: new THREE.Color("#c2185b"), downB: new THREE.Color("#ff6b6b"),
};
const UP = new THREE.Color("#4ade80");
const DOWN = new THREE.Color("#ff5c7a");

function labelTexture(text, color) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    g.font = "600 30px Inter, system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "rgba(6,10,20,0.6)";
    const w = Math.min(250, g.measureText(text).width + 28);
    g.beginPath();
    if (g.roundRect) g.roundRect(128 - w / 2, 10, w, 44, 22);
    else g.rect(128 - w / 2, 10, w, 44);
    g.fill();
    g.fillStyle = color;
    g.fillText(text, 128, 33);
  }
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

// The brand mark itself (Δ), drawn crisp and glowing so it reads instantly no matter
// how the orb is rotated — a camera-facing sprite rather than a 3D shape, since a 3D
// triangle only reads as "the Δ" from certain angles and this has to be recognizable
// the instant someone sees it, not just on a good frame.
function deltaMarkTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d");
  if (g) {
    const cx = 128;
    const cy = 150;
    const size = 92;
    const tri = (s) => {
      g.beginPath();
      g.moveTo(cx, cy - s);
      g.lineTo(cx - s * 0.92, cy + s * 0.82);
      g.lineTo(cx + s * 0.92, cy + s * 0.82);
      g.closePath();
    };

    // soft halo behind the mark
    const halo = g.createRadialGradient(cx, cy - 6, 6, cx, cy - 6, 150);
    halo.addColorStop(0, "rgba(201, 210, 255, 0.55)");
    halo.addColorStop(1, "rgba(201, 210, 255, 0)");
    g.fillStyle = halo;
    g.fillRect(0, 0, 256, 256);

    // glassy fill
    tri(size);
    const fill = g.createLinearGradient(cx, cy - size, cx, cy + size);
    fill.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    fill.addColorStop(1, "rgba(139, 123, 255, 0.2)");
    g.fillStyle = fill;
    g.fill();

    // crisp outer edge
    tri(size);
    g.lineWidth = 8;
    g.strokeStyle = "rgba(255, 255, 255, 0.98)";
    g.shadowColor = "rgba(180, 190, 255, 0.9)";
    g.shadowBlur = 18;
    g.stroke();

    // an inner edge, smaller, for a faceted two-layer look
    g.shadowBlur = 0;
    tri(size * 0.52);
    g.lineWidth = 3;
    g.strokeStyle = "rgba(255, 255, 255, 0.55)";
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

export default function DeltaOrb({ reading, spike = 0, label = "Delta Orb" }) {
  const mountRef = useRef(null);
  const live = useRef({ reading, spike });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    live.current = { reading, spike };
  }, [reading, spike]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      setFailed(true);
      return undefined;
    }
    const px = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(px);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 5.2);

    const world = new THREE.Group();
    scene.add(world);

    /* Shell */
    const shellMat = new THREE.ShaderMaterial({
      vertexShader: SHELL_VERTEX,
      fragmentShader: SHELL_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uEnergy: { value: 0.3 }, uPulse: { value: 0 },
        uColA: { value: PALETTE.flatA.clone() }, uColB: { value: PALETTE.flatB.clone() },
      },
    });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 128), shellMat);
    world.add(shell);

    /* Core: a wire icosahedron that spins faster as energy rises */
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 1), coreMat);
    world.add(core);

    /* A soft glow behind the mark, and the Δ mark itself — the first thing anyone
       should recognize. Both are camera-facing sprites, so they read clearly at every
       rotation instead of only from a lucky angle. */
    const glowTex = glowTexture();
    const markGlowMat = new THREE.SpriteMaterial({
      map: glowTex, color: PALETTE.flatB.clone(), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const markGlow = new THREE.Sprite(markGlowMat);
    markGlow.scale.set(1.3, 1.3, 1);
    world.add(markGlow);

    const markMat = new THREE.SpriteMaterial({
      map: deltaMarkTexture(), color: 0xffffff, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    });
    const mark = new THREE.Sprite(markMat);
    mark.scale.set(0.58, 0.58, 1);
    mark.renderOrder = 5;
    world.add(mark);

    /* Dust halo */
    const COUNT = 1400;
    const pos = new Float32Array(COUNT * 3);
    const seeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i += 1) {
      const r = 1.25 + Math.random() * 0.95;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph) * 0.65;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      seeds[i] = Math.random();
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    dustGeo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    const dustMat = new THREE.ShaderMaterial({
      vertexShader: DUST_VERTEX,
      fragmentShader: DUST_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uEnergy: { value: 0.3 }, uPx: { value: px }, uColor: { value: PALETTE.flatB.clone() } },
    });
    world.add(new THREE.Points(dustGeo, dustMat));

    /* Market nodes, each on its own tilted orbit */
    const nodes = Array.from({ length: 6 }, (_, i) => {
      const pivot = new THREE.Group();
      pivot.rotation.set(0.35 + (i % 3) * 0.32 - 0.3, i * 0.9, (i % 2 ? 1 : -1) * 0.25);
      world.add(pivot);

      const ringPts = [];
      for (let k = 0; k < 96; k += 1) {
        const a = (k / 96) * Math.PI * 2;
        ringPts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
      }
      const ringMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false });
      const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ringPts), ringMat);
      pivot.add(ring);

      const dotMat = new THREE.MeshBasicMaterial({ color: UP.clone(), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
      const dot = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 20), dotMat);
      pivot.add(dot);

      const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: UP.clone(), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
      const glow = new THREE.Sprite(glowMat);
      pivot.add(glow);

      const tagMat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false });
      const tag = new THREE.Sprite(tagMat);
      tag.scale.set(0.8, 0.2, 1);
      pivot.add(tag);

      return { pivot, ring, dot, glow, tag, phase: (i / 6) * Math.PI * 2, radius: 1.6, key: "" };
    });

    /* Shock ring, facing the camera */
    const shockMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const shock = new THREE.Mesh(new THREE.RingGeometry(1, 1.035, 128), shockMat);
    scene.add(shock);

    /* Size */
    const resize = () => {
      const w = Math.max(160, mount.clientWidth || 320);
      renderer.setSize(w, w, false);
      camera.aspect = 1;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro?.observe(mount);

    /* Drag to spin */
    const drag = { on: false, x: 0, y: 0, vx: 0, vy: 0, rx: 0.15, ry: 0 };
    const el = renderer.domElement;
    const down = (e) => { drag.on = true; drag.x = e.clientX; drag.y = e.clientY; };
    const move = (e) => {
      if (!drag.on) return;
      drag.vy = (e.clientX - drag.x) * 0.006;
      drag.vx = (e.clientY - drag.y) * 0.004;
      drag.x = e.clientX;
      drag.y = e.clientY;
    };
    const up = () => { drag.on = false; };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);

    /* Animate */
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const targetA = new THREE.Color();
    const targetB = new THREE.Color();
    let energy = 0.3;
    let pulse = 0;
    let lastSpike = live.current.spike;
    let visible = true;
    let raf = 0;
    let clock = 0;
    let prev = performance.now();

    const io = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting;
          if (visible && !raf && !reduce) raf = requestAnimationFrame(frame);
        })
      : null;
    io?.observe(mount);

    function frame(now = performance.now()) {
      raf = 0;
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const { reading: r, spike: s } = live.current;
      const tEnergy = r ? r.energy : 0.25;
      const tDelta = r ? r.delta : 0;
      energy += (tEnergy - energy) * 0.03;
      clock += dt * (0.6 + energy * 1.8);

      if (s !== lastSpike) { lastSpike = s; pulse = 1; }
      pulse = Math.max(0, pulse - dt * 0.9);

      // colour
      const k = Math.min(1, Math.abs(tDelta) * 1.6);
      targetA.copy(PALETTE.flatA).lerp(tDelta >= 0 ? PALETTE.upA : PALETTE.downA, k);
      targetB.copy(PALETTE.flatB).lerp(tDelta >= 0 ? PALETTE.upB : PALETTE.downB, k);
      shellMat.uniforms.uColA.value.lerp(targetA, 0.04);
      shellMat.uniforms.uColB.value.lerp(targetB, 0.04);
      dustMat.uniforms.uColor.value.lerp(targetB, 0.04);

      shellMat.uniforms.uTime.value = clock;
      shellMat.uniforms.uEnergy.value = energy;
      shellMat.uniforms.uPulse.value = pulse;
      dustMat.uniforms.uTime.value = clock;
      dustMat.uniforms.uEnergy.value = energy;

      // breathe
      const breath = 1 + Math.sin(clock * 1.4) * (0.015 + energy * 0.03) + pulse * 0.06;
      shell.scale.setScalar(breath);
      core.rotation.x += dt * (0.3 + energy * 2.2);
      core.rotation.y += dt * (0.45 + energy * 2.8);
      coreMat.opacity = 0.2 + energy * 0.35 + pulse * 0.3;

      // the mark: a slow confident pulse, brighter and tighter the more the market moves
      markGlowMat.color.lerp(targetB, 0.04);
      markGlowMat.opacity = 0.35 + energy * 0.3 + pulse * 0.4;
      markGlow.scale.setScalar(1.25 + Math.sin(clock * 1.1) * 0.05 + pulse * 0.25);
      mark.scale.setScalar(0.58 + Math.sin(clock * 1.6) * 0.015 + pulse * 0.12);
      markMat.opacity = 0.82 + pulse * 0.18;

      // drag with inertia, otherwise slow auto-spin
      drag.ry += drag.vy + (drag.on ? 0 : dt * 0.12);
      drag.rx = Math.max(-0.9, Math.min(0.9, drag.rx + drag.vx));
      drag.vx *= 0.92;
      drag.vy *= 0.92;
      world.rotation.y = drag.ry;
      world.rotation.x = drag.rx;

      // market nodes
      const list = r?.nodes || [];
      nodes.forEach((n, i) => {
        const m = list[i];
        const has = Boolean(m);
        n.pivot.visible = has;
        if (!has) return;
        const mag = Math.min(1, Math.abs(m.change) / 6);
        n.radius += (1.45 + mag * 0.75 - n.radius) * 0.05;
        n.phase += dt * (0.18 + energy * 0.7) * (1 - i * 0.06);
        const x = Math.cos(n.phase) * n.radius;
        const z = Math.sin(n.phase) * n.radius;
        const col = m.change >= 0 ? UP : DOWN;
        const size = 0.045 + mag * 0.07;
        n.ring.scale.setScalar(n.radius);
        n.dot.position.set(x, 0, z);
        n.dot.scale.setScalar(size * (1 + pulse * 0.5));
        n.dot.material.color.lerp(col, 0.1);
        n.glow.position.set(x, 0, z);
        n.glow.scale.setScalar(size * 9);
        n.glow.material.color.lerp(col, 0.1);
        n.glow.material.opacity = 0.45 + mag * 0.5;
        n.tag.position.set(x, size + 0.17, z);
        const key = `${m.base} ${m.change >= 0 ? "+" : ""}${m.change.toFixed(1)}%`;
        if (key !== n.key) {
          n.key = key;
          n.tag.material.map?.dispose();
          n.tag.material.map = labelTexture(key, m.change >= 0 ? "#4ade80" : "#ff6b81");
          n.tag.material.needsUpdate = true;
        }
      });

      // shock ring
      shock.scale.setScalar(1.05 + (1 - pulse) * 1.4);
      shockMat.opacity = pulse * 0.55;

      renderer.render(scene, camera);
      if (!reduce && visible) raf = requestAnimationFrame(frame);
    }
    frame();

    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
      ro?.disconnect();
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      scene.traverse((obj) => {
        obj.geometry?.dispose?.();
        const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
        mats.forEach((mat) => { mat.map?.dispose?.(); mat.dispose(); });
      });
      renderer.dispose();
      renderer.forceContextLoss?.();
      el.remove();
    };
  }, []);

  return (
    <div className="dorb-stage" ref={mountRef} role="img" aria-label={reading ? `${label}: ${reading.headline}` : label}>
      {failed && <div className="dorb-fallback" />}
    </div>
  );
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.3, "rgba(255,255,255,0.35)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(c);
}
