'use client';

/**
 * components/DashboardLayout.tsx
 *
 * Command-centre overlay shell — Premium Glassmorphism Edition.
 *
 * ┌──────────────────────────────────────────────────────┐
 * │               TopNavigation (h-14)                   │
 * ├─────────────┬────────────────────────┬───────────────┤
 * │             │                        │               │
 * │  Left Panel │   Centre (passthrough) │  Right Panel  │
 * │   (340px)   │   3D / decoration      │   (320px)     │
 * │             │                        │               │
 * ├─────────────┴────────────────────────┴───────────────┤
 * │              Bottom Panel (h-40)                     │
 * └──────────────────────────────────────────────────────┘
 *
 * pointer-events-none on the root keeps any 3D canvas underneath
 * fully interactive in the transparent centre region.
 * Each panel sets pointer-events-auto individually.
 *
 * v2 changes:
 *  - Removed CRT scanline overlay (conflicts with Apple/Tesla aesthetic)
 *  - Left panel:   320px → 340px for legibility
 *  - Right panel:  300px → 320px for legibility
 *  - Bottom panel: h-36  → h-40  for breathing room
 *  - Centre region updated to left-[340px] right-[320px]
 */

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

// ─── Slot props ───────────────────────────────────────────────────────────────

export interface DashboardLayoutProps {
  topNav?:      ReactNode;
  leftPanel?:   ReactNode;
  centerPanel?: ReactNode;
  rightPanel?:  ReactNode;
  bottomPanel?: ReactNode;
}

// ─── Shared entrance animation ────────────────────────────────────────────────

const panelVariants = {
  hidden:  { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function DashboardLayout({
  topNav,
  leftPanel,
  centerPanel,
  rightPanel,
  bottomPanel,
}: DashboardLayoutProps) {
  return (
    <div
      className="fixed inset-0 z-20 pointer-events-none"
      aria-label="Command Centre Dashboard"
    >

      {/* ── Top Navigation ─────────────────────────────────────────────── */}
      {topNav && (
        <motion.div
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          className="absolute top-0 left-0 right-0 h-14 pointer-events-auto z-30"
        >
          {topNav}
        </motion.div>
      )}

      {/* ── Left Panel (340px) ─────────────────────────────────────────── */}
      {leftPanel && (
        <motion.div
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.10 }}
          className="absolute top-14 bottom-40 left-0 w-[340px] pointer-events-auto overflow-hidden"
        >
          {leftPanel}
        </motion.div>
      )}

      {/* ── Centre (passthrough — 3D canvas stays fully interactive) ───── */}
      {centerPanel && (
        <motion.div
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.15 }}
          className="absolute top-14 bottom-40 left-[340px] right-[320px] pointer-events-none"
        >
          {centerPanel}
        </motion.div>
      )}

      {/* ── Right Panel (320px) ────────────────────────────────────────── */}
      {rightPanel && (
        <motion.div
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.20 }}
          className="absolute top-14 bottom-40 right-0 w-[320px] pointer-events-auto overflow-hidden"
        >
          {rightPanel}
        </motion.div>
      )}

      {/* ── Bottom Panel (h-40) ────────────────────────────────────────── */}
      {bottomPanel && (
        <motion.div
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.25 }}
          className="absolute bottom-0 left-0 right-0 h-40 pointer-events-auto"
        >
          {bottomPanel}
        </motion.div>
      )}

    </div>
  );
}
