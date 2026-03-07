'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

const NAV_LINKS = [
  { label: 'Explore', href: '/explore' },
  { label: 'Analytics', href: '/analytics' },
  { label: 'Simulation', href: '/simulation' },
];

export function Navbar() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-5"
    >
      {/* Logo */}
      <Link
        href="/"
        className="text-[11px] font-bold tracking-[0.4em] uppercase text-[#1A1A1A]"
      >
        SYNCITY
      </Link>

      {/* Nav links */}
      <nav className="hidden md:flex items-center gap-8">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-[11px] font-medium tracking-[0.25em] uppercase text-[#1A1A1A]/50
                       hover:text-[#1A1A1A] transition-colors duration-200"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {/* Status dot */}
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[10px] tracking-[0.2em] uppercase text-[#1A1A1A]/40">
          Live
        </span>
      </div>
    </motion.header>
  );
}
