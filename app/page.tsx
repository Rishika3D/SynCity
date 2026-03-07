import dynamic from 'next/dynamic';

// Three.js requires a browser environment — skip SSR entirely
const HeroCanvas = dynamic(
  () => import('@/components/hero/HeroCanvas'),
  { ssr: false }
);

export default function HomePage() {
  return (
    <main className="w-full h-screen overflow-hidden">
      <HeroCanvas />
    </main>
  );
}
