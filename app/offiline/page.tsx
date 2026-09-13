'use client';

import Link from 'next/link';

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-[#1a0b2e] flex items-center justify-center p-6 font-mono">
      <div className="border-4 border-black bg-[#FFFDF5] p-8 rounded-2xl shadow-[8px_8px_0_0_rgba(0,0,0,1)] text-center max-w-md">
        <div style={{ fontSize: '56px', marginBottom: '12px' }}>🐱</div>
        <h1 className="text-2xl font-black text-black mb-2">offline</h1>
        <p className="text-black/60 font-bold text-sm mb-6">
          no internet right now — but arnama is still here
        </p>
        <Link
          href="/"
          className="inline-block px-5 py-3 border-4 border-black bg-[#E2F0D9] font-black rounded-xl shadow-[4px_4px_0_0_rgba(0,0,0,1)] text-black transition hover:-translate-y-0.5"
        >
          ← try home
        </Link>
      </div>
    </div>
  );
}