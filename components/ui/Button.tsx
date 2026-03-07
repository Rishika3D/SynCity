'use client';

import { forwardRef } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  href?: string;
  variant?: 'glass' | 'solid';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ href, variant = 'glass', children, className = '', ...props }, ref) => {
    const base =
      'inline-flex items-center justify-center px-6 py-3 text-[11px] font-medium ' +
      'tracking-[0.28em] uppercase transition-all duration-300 cursor-pointer select-none';

    const variants = {
      glass:
        'bg-white/10 backdrop-blur-md border border-[#1A1A1A]/12 text-[#1A1A1A] ' +
        'hover:bg-white/22 hover:border-[#1A1A1A]/22 active:scale-[0.97]',
      solid:
        'bg-[#1A1A1A] text-white hover:bg-[#333] active:scale-[0.97]',
    };

    const cls = `${base} ${variants[variant]} ${className}`;

    if (href) {
      return (
        <Link href={href} className={cls}>
          {children}
        </Link>
      );
    }

    return (
      <button ref={ref} className={cls} {...props}>
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
