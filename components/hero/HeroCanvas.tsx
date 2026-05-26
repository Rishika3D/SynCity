'use client';

/**
 * HeroCanvas — Cinematic scroll-driven cloud flythrough.
 *
 * Raw Three.js (no R3F) for full renderer control.
 * Camera starts inside a volumetric cloud bank and flies forward on scroll.
 * GSAP ScrollTrigger drives camera position & fog. rAF loop keeps drift alive.
 * Mouse parallax adds subtle interactive depth.
 */

import { useEffect, useRef } from 'react';
import * as THREE             from 'three';
import gsap                   from 'gsap';
import { ScrollTrigger }      from 'gsap/ScrollTrigger';

// ── Seeded RNG (mulberry32) ───────────────────────────────────────────────
function mkRng(seed: number) {
  let s = seed;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Cloud blob texture ────────────────────────────────────────────────────
function makeCloudTex(): THREE.CanvasTexture {
  const cv  = document.createElement('canvas');
  cv.width  = 512;
  cv.height = 512;
  const ctx = cv.getContext('2d')!;

  // One large dominant blob + softer satellites — feathered for additive blending
  const blobs: [number, number, number, number][] = [
    [256, 256, 240, 1.00], // central dominant
    [120, 145, 160, 0.60], [390, 150, 170, 0.65],
    [150, 360, 135, 0.55], [355, 350, 145, 0.58],
    [ 50,  75, 110, 0.45], [450, 430, 120, 0.48],
    [ 70, 430,  95, 0.42], [440,  65, 100, 0.44],
    [256, 100, 105, 0.50], [256, 410, 115, 0.52],
    [185, 225, 100, 0.40], [330, 220,  92, 0.38],
  ];

  for (const [x, y, r, str] of blobs) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0,    `rgba(190, 220, 255, ${(0.65 * str).toFixed(2)})`);
    g.addColorStop(0.25, `rgba(130, 180, 255, ${(0.36 * str).toFixed(2)})`);
    g.addColorStop(0.60, `rgba( 80, 140, 255, ${(0.12 * str).toFixed(2)})`);
    g.addColorStop(1.00, 'rgba(50, 100, 240, 0.00)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
  }

  return new THREE.CanvasTexture(cv);
}

// ── Central glow texture (curiosity mechanic) ─────────────────────────────
function makeGlowTex(): THREE.CanvasTexture {
  const cv  = document.createElement('canvas');
  cv.width  = 512;
  cv.height = 512;
  const ctx = cv.getContext('2d')!;
  const cx = 256, cy = 256;

  // Outer haze
  const g0 = ctx.createRadialGradient(cx, cy, 0, cx, cy, 256);
  g0.addColorStop(0,    'rgba(100, 160, 255, 0.18)');
  g0.addColorStop(0.45, 'rgba( 60, 110, 255, 0.08)');
  g0.addColorStop(1.00, 'rgba( 30,  80, 220, 0.00)');
  ctx.fillStyle = g0;
  ctx.fillRect(0, 0, 512, 512);

  // Bright inner core
  const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90);
  g1.addColorStop(0,    'rgba(220, 240, 255, 0.55)');
  g1.addColorStop(0.40, 'rgba(140, 190, 255, 0.24)');
  g1.addColorStop(1.00, 'rgba( 80, 140, 255, 0.00)');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, 512, 512);

  return new THREE.CanvasTexture(cv);
}

// ── Cloud layout data ─────────────────────────────────────────────────────
interface CloudDatum {
  x: number; y: number; z: number;
  rotZ: number;
  sx: number; sy: number;
  spd: number; amp: number;
  alpha: number;
}

function makeCloudData(): CloudDatum[] {
  const rng = mkRng(42);
  return Array.from({ length: 36 }, (_, i) => {
    // Cluster more clouds around z 4-16 (camera flies through z 20→2)
    const zBias = i < 12 ? rng() * 8 + 8 : rng() * 18 - 2;
    return {
      x    : (rng() - 0.5) * 26,
      y    : (rng() - 0.5) * 12,
      z    : zBias,
      rotZ : rng() * Math.PI,
      sx   : 8 + rng() * 14,          // 8 – 22 units wide
      sy   : 3.5 + rng() * 6.5,
      spd  : 0.022 + rng() * 0.038,
      amp  : 0.28  + rng() * 0.45,
      alpha: 0.12  + rng() * 0.18,    // 0.12 – 0.30  (additive stacking)
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
export default function HeroCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);
  // Mouse parallax target (normalised -1..1)
  const mouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!mountRef.current) return;
    gsap.registerPlugin(ScrollTrigger);

    const container = mountRef.current;
    const W = container.clientWidth;
    const H = container.clientHeight;

    // ── Renderer ─────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x0d1826, 1);
    container.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%',
      display : 'block',
    });

    // ── Scene ─────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1826);
    scene.fog        = new THREE.Fog(0x0d1826, 5, 24);

    // ── Camera ────────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(62, W / H, 0.1, 1000);
    camera.position.set(0, 2, 20);

    // ── Lights ────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x2050b8, 2.2));
    const dirLight = new THREE.DirectionalLight(0xa0c8ff, 0.9);
    dirLight.position.set(3, 8, 6);
    scene.add(dirLight);

    // ── Cloud meshes ──────────────────────────────────────────────────────
    const cloudTex  = makeCloudTex();
    const cloudData = makeCloudData();
    const meshes: THREE.Mesh[] = [];

    for (const c of cloudData) {
      const geo = new THREE.PlaneGeometry(c.sx, c.sy);
      const mat = new THREE.MeshBasicMaterial({
        map        : cloudTex,
        transparent: true,
        opacity    : c.alpha,
        depthWrite : false,
        blending   : THREE.AdditiveBlending,  // clouds glow into each other
        side       : THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(c.x, c.y, c.z);
      mesh.rotation.z = c.rotZ;
      scene.add(mesh);
      meshes.push(mesh);
    }

    // ── Center glow planes (curiosity mechanic) ───────────────────────────
    const glowTex = makeGlowTex();
    const glowPlanes: THREE.Mesh[] = [];
    const GLOWS = [
      { z: 4,  s: 24, alpha: 0.62 },
      { z: 7,  s: 18, alpha: 0.44 },
      { z: 11, s: 28, alpha: 0.32 },
    ];
    for (const g of GLOWS) {
      const geo = new THREE.PlaneGeometry(g.s, g.s);
      const mat = new THREE.MeshBasicMaterial({
        map        : glowTex,
        transparent: true,
        opacity    : g.alpha,
        depthWrite : false,
        blending   : THREE.AdditiveBlending,
        side       : THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, 0, g.z);
      scene.add(mesh);
      glowPlanes.push(mesh);
    }

    // ── Scroll state ──────────────────────────────────────────────────────
    let scrollProgress = 0;

    const st = ScrollTrigger.create({
      trigger: '#hero-scroll',
      start  : 'top top',
      end    : 'bottom top',
      scrub  : 1.5,
      onUpdate: (self) => { scrollProgress = self.progress; },
    });

    // ── Mouse parallax ────────────────────────────────────────────────────
    const onMouseMove = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth  - 0.5) * 2;
      mouse.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', onMouseMove, { passive: true });

    // ── Resize ────────────────────────────────────────────────────────────
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // ── rAF loop ──────────────────────────────────────────────────────────
    let raf = 0;
    let t   = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      t += dt;
      const p = scrollProgress;

      // Scroll-driven camera targets
      const tZ = 20 - p * 18;   // 20 → 2
      const tY =  2 - p *  7;   //  2 → -5

      // Idle drift (fades as scroll progresses)
      const idleStrength = 1 - Math.min(1, p * 3.5);
      const driftX = Math.sin(t * 0.10) * 0.6  * idleStrength;
      const driftY = Math.cos(t * 0.07) * 0.26 * idleStrength;

      // Mouse parallax (also fades with scroll)
      const pxMul = 0.9 * idleStrength;
      const pxX   = mouse.current.x * pxMul;
      const pxY   = mouse.current.y * pxMul * 0.5;

      // Smooth lerp
      const k = Math.min(1, dt * 3.8);
      camera.position.x += (driftX + pxX      - camera.position.x) * k;
      camera.position.y += (tY + driftY + pxY - camera.position.y) * k;
      camera.position.z += (tZ                - camera.position.z) * k;

      // Fog clears on scroll
      if (scene.fog instanceof THREE.Fog) {
        const fk = Math.min(1, dt * 2.8);
        scene.fog.near += ((5  + p * 22) - scene.fog.near) * fk;
        scene.fog.far  += ((24 + p * 65) - scene.fog.far)  * fk;
      }

      // Cloud drift + scroll fade
      for (let i = 0; i < meshes.length; i++) {
        const mesh = meshes[i];
        const c    = cloudData[i];
        mesh.position.x = c.x + Math.sin(t * c.spd + i * 1.7) * c.amp;
        mesh.position.y = c.y + Math.cos(t * c.spd * 0.6 + i)  * c.amp * 0.3;
        (mesh.material as THREE.MeshBasicMaterial).opacity =
          c.alpha * Math.max(0, 1 - p * 1.3);
      }

      // Glow planes fade with scroll and slowly pulse
      const pulse = 0.08 * Math.sin(t * 0.55);
      for (let i = 0; i < glowPlanes.length; i++) {
        const baseAlpha = GLOWS[i].alpha;
        (glowPlanes[i].material as THREE.MeshBasicMaterial).opacity =
          (baseAlpha + pulse) * Math.max(0, 1 - p * 1.5);
      }

      // Directional light brightens on scroll
      dirLight.intensity = 0.9 + p * 1.8;

      renderer.render(scene, camera);
    };

    animate();

    // ── Cleanup ───────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf);
      st.kill();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouseMove);
      meshes.forEach(m => {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
      glowPlanes.forEach(m => {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
      cloudTex.dispose();
      glowTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{ position: 'fixed', inset: 0, zIndex: 0 }}
    />
  );
}
