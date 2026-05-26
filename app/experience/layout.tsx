import type { Metadata } from 'next';

export const metadata: Metadata = {
  title      : 'SYNCITY — The Living Digital Twin',
  description: 'A cinematic scroll-driven 3D experience of Bangalore\'s digital twin.',
};

export default function ExperienceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
