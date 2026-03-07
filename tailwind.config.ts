import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './three/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      screens: {
        xs: '480px',
      },
      fontFamily: {
        sans:  ['var(--font-space-grotesk)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-playfair)', 'Georgia', 'serif'],
        mono:  ['var(--font-space-mono)', 'monospace'],
      },
      colors: {
        space:  '#0B0C10',
        pearl:  '#F2EDE4',
        'neon-cyan':  '#00EEFF',
        'neon-amber': '#FF7722',
        'neon-violet':'#8844EE',
      },
    },
  },
  plugins: [],
};

export default config;
