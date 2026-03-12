import type { Metadata } from 'next';
import { Bebas_Neue, Cormorant_Garamond, Playfair_Display, Cinzel, Inter } from 'next/font/google';
import './globals.css';

/**
 * Bebas Neue — hero display font.
 * Ultra-bold condensed, zero-gap, maximum impact.
 */
const bebas = Bebas_Neue({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-bebas',
  display: 'swap',
});

/**
 * Cormorant Garamond — kept for analytics / editorial sections.
 */
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-playfair',
  display: 'swap',
});

const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-cinzel',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SYNCITY — Urban Intelligence Platform',
  description:
    'A digital twin platform that monitors, predicts, and understands urban systems. Renaissance intelligence meets modern AI.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${bebas.variable} ${cormorant.variable} ${playfair.variable} ${cinzel.variable} ${inter.variable}`}
    >
      <head>
        {/* Pre-establish connections to Google Maps servers so the first
            request doesn't wait for DNS + TCP + TLS handshakes */}
        <link rel="preconnect" href="https://maps.googleapis.com" />
        <link rel="preconnect" href="https://maps.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://maps.googleapis.com" />
        <link rel="dns-prefetch" href="https://maps.gstatic.com" />
        <link rel="dns-prefetch" href="https://tile.googleapis.com" />
      </head>
      <body>{children}</body>
    </html>
  );
}
