'use client';

/**
 * HeroCanvas — Cinematic scroll-driven cloud flythrough.
 *
 * Uses raw Three.js (no R3F) for full renderer control.
 * Camera starts inside a volumetric cloud bank and flies forward on scroll.
 * GSAP ScrollTrigger drives camera position & fog. Idle drift keeps it alive.
 */

import { useEffect, useRef } from 'react';
import * as THREE             from 'three';
import gsap                   from 'gsap';
import { ScrollTrigger }      from 'gsap/ScrollTrigger';

// ── Seeded RNG ────────────────────────────────────────────────────────────
function mkRng(seed: number) {
  let s = seed;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Procedural cloud texture ──────────────────────────────────────────────
function makeCloudTex(): THREE.CanvasTexture {
  const cv  = document.createElement('canvas');
  cv.width  = 512;
  cv.height = 512;
  const ctx = cv.getContext('2d')!;

  // Build soft white blob clusters
  const blobs: [number, number, number][] = [
    [256, 256, 200], [130, 160, 140], [370, 140, 148],
    [168, 348, 118], [330, 330, 128], [68,  90,  96],
    [430, 410, 108], [88,  415, 90],  [415, 88,  94],
    [256, 115, 90],  [256, 395, 100],
  ];

  for (const [x, y, r] of blobs) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0,    'rgba(120, 170, 255, 0.55)');
    g.addColorStop(0.40, 'rgba( 90, 140, 255, 0.28)');
    g.addColorStop(0.75, 'rgba( 60, 110, 240, 0.10)');
    g.addColorStop(1.00, 'rgba( 40,  90, 220, 0.00)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
  }

  return new THREE.CanvasTexture(cv);
}

// ── Cloud data (deterministic) ────────────────────────────────────────────
interface CloudDatum {
  x: number; y: number; z: number;
  rotZ: number;
  sx: number; sy: number;
  spd: number; amp: number;
  alpha: number;
}

function makeCloudData(): CloudDatum[] {
  const rng = mkRng(42);
  return Array.from({ length: 28 }, () => ({
    x    : (rng() - 0.5) * 22,
    y    : (rng() - 0.5) * 10,
    z    : rng() * 18 - 4,       // z: -4 → 14  (camera starts at z=18)
    rotZ : rng() * Math.PI,
    sx   : 7 + rng() * 10,       // smaller: 7–17 units
    sy   : 3 + rng() * 5,
    spd  : 0.025 + rng() * 0.04,
    amp  : 0.3   + rng() * 0.4,
    alpha: 0.10  + rng() * 0.14, // 0.10 – 0.24  — very subtle
  }));
}

// ═════════════════════════════════════════════════════════════════════════
export default function HeroCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);

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
    renderer.setClearColor(0x060d1e, 1);
    // Deep-navy royal-blue atmosphere
    container.appendChild(renderer.domElement);

    // Style the canvas to fill fixed viewport
    Object.assign(renderer.domElement.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%',
      display: 'block',
    });

    // ── Scene & camera ────────────────────────────────────────────────────
    const scene  = new THREE.Scene();
    scene.background = new THREE.Color(0x060d1e);
    scene.fog        = new THREE.Fog(0x060d1e, 4, 22);

    const camera = new THREE.PerspectiveCamera(65, W / H, 0.1, 1000);
    camera.position.set(0, 2, 18);

    // ── Lights ────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x2040a0, 2.0));
    const dirLight = new THREE.DirectionalLight(0x90baf8, 0.8);
    dirLight.position.set(5, 10, 5);
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
        side       : THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(c.x, c.y, c.z);
      mesh.rotation.z = c.rotZ;
      scene.add(mesh);
      meshes.push(mesh);
    }

    // ── Scroll state ──────────────────────────────────────────────────────
    let scrollProgress = 0;

    const st = ScrollTrigger.create({
      trigger : '#hero-scroll',
      start   : 'top top',
      end     : 'bottom top',
      scrub   : 1.5,
      onUpdate: (self) => { scrollProgress = self.progress; },
    });

    // ── Resize ────────────────────────────────────────────────────────────
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // ── Animation loop ────────────────────────────────────────────────────
    let raf = 0;
    let t   = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      t += dt;
      const p = scrollProgress;

      // Camera targets (scroll-driven)
      const tZ = 18 - p * 16;   // 18 → 2
      const tY =  2 - p * 6;    //  2 → -4

      // Idle drift (fades as scroll progresses)
      const idle = 1 - Math.min(1, p * 4);
      const dX   = Math.sin(t * 0.10) * 0.55 * idle;
      const dY   = Math.cos(t * 0.07) * 0.24 * idle;

      // Smooth lerp
      const k = Math.min(1, dt * 3.5);
      camera.position.x += (dX      - camera.position.x) * k;
      camera.position.y += (tY + dY - camera.position.y) * k;
      camera.position.z += (tZ      - camera.position.z) * k;

      // Fog clears on scroll
      if (scene.fog instanceof THREE.Fog) {
        const fk = Math.min(1, dt * 2.5);
        scene.fog.near += ((4  + p * 20) - scene.fog.near) * fk;
        scene.fog.far  += ((22 + p * 60) - scene.fog.far)  * fk;
      }

      // Cloud drift + scroll fade
      for (let i = 0; i < meshes.length; i++) {
        const mesh = meshes[i];
        const c    = cloudData[i];
        mesh.position.x = c.x + Math.sin(t * c.spd + i * 1.7) * c.amp;
        mesh.position.y = c.y + Math.cos(t * c.spd * 0.6 + i) * c.amp * 0.3;
        (mesh.material as THREE.MeshBasicMaterial).opacity =
          c.alpha * Math.max(0, 1 - p * 1.2);
      }

      // Directional light brightens on scroll
      dirLight.intensity = 0.8 + p * 1.5;

      renderer.render(scene, camera);
    };

    animate();

    // ── Cleanup ───────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf);
      st.kill();
      window.removeEventListener('resize', onResize);
      meshes.forEach(m => { m.geometry.dispose(); (m.material as THREE.Material).dispose(); });
      cloudTex.dispose();
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
