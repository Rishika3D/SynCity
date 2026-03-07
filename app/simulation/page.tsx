import Link from 'next/link';

export const metadata = { title: 'Simulation — SYNCITY' };

export default function SimulationPage() {
  return (
    <main className="min-h-screen bg-[#F5F6F8] flex flex-col items-center justify-center gap-8">
      <div className="text-center space-y-3">
        <p className="text-[10px] tracking-[0.35em] uppercase text-[#1A1A1A]/35">
          Module · 03
        </p>
        <h1 className="text-4xl font-bold tracking-[0.2em] text-[#1A1A1A]">
          SIMULATION
        </h1>
        <p className="text-sm text-[#1A1A1A]/40 tracking-wide">
          Predictive city simulation engine — coming soon
        </p>
      </div>
      <Link
        href="/"
        className="text-[11px] font-medium tracking-[0.3em] uppercase text-[#1A1A1A]/40
                   border border-[#1A1A1A]/12 px-5 py-2.5 hover:text-[#1A1A1A]
                   hover:border-[#1A1A1A]/25 transition-all duration-300"
      >
        ← Back
      </Link>
    </main>
  );
}
