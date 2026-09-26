'use client';

import Link from 'next/link';

export function WatchCard() {
  return (
    <Link
      href="/watch"
      className="group relative overflow-hidden rounded-3xl border-4 border-black p-5 hover:-translate-y-1 active:translate-y-0.5 transition-transform"
      style={{
        background: `
          radial-gradient(ellipse at 50% 0%, rgba(255, 235, 180, 0.85) 0%, rgba(255, 235, 180, 0) 55%),
          linear-gradient(180deg, #FFE0B8 0%, #FFB888 45%, #FF8BA7 100%)
        `,
        boxShadow: '8px 8px 0 0 black',
        minHeight: '180px',
        display: 'flex',
        flexDirection: 'column',
        textDecoration: 'none',
      }}
    >
      {/* Top decorative bars — matches other cards */}
      <div className="flex gap-1.5">
        <span className="h-1.5 w-8 rounded-full bg-black/20" />
        <span className="h-1.5 w-8 rounded-full bg-black/20" />
        <span className="h-1.5 w-8 rounded-full bg-black/20" />
      </div>

      {/* TV icon */}
      <div
        className="mt-4 flex size-14 shrink-0 items-center justify-center rounded-2xl border-4 border-black"
        style={{
          background: `linear-gradient(180deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 60%), #FFFDF5`,
          boxShadow: '3px 3px 0 0 black',
        }}
      >
        <span style={{ fontSize: '26px', lineHeight: 1 }}>📺</span>
      </div>

      {/* Title */}
      <div className="mt-auto pt-4">
        <h3
          className="font-display text-lg leading-tight"
          style={{ color: '#000' }}
        >
          WATCH
        </h3>
        <p
          className="mt-1 text-xs font-bold"
          style={{ color: 'rgba(0,0,0,0.6)' }}
        >
          Movie night
        </p>
      </div>

      {/* Cartoony audience — Tom, Jerry, Rabbit hanging out watching */}
      <div className="absolute bottom-3 right-3 flex -space-x-2">
        <span
          style={{
            fontSize: '26px',
            lineHeight: 1,
            display: 'inline-block',
            transform: 'rotate(-10deg) translateY(-2px)',
            filter: 'drop-shadow(1px 2px 0 rgba(0,0,0,0.25))',
          }}
        >
          🐱
        </span>
        <span
          style={{
            fontSize: '24px',
            lineHeight: 1,
            display: 'inline-block',
            transform: 'translateY(2px) rotate(6deg)',
            filter: 'drop-shadow(1px 2px 0 rgba(0,0,0,0.25))',
          }}
        >
          🐭
        </span>
        <span
          style={{
            fontSize: '26px',
            lineHeight: 1,
            display: 'inline-block',
            transform: 'rotate(-4deg) translateY(-2px)',
            filter: 'drop-shadow(1px 2px 0 rgba(0,0,0,0.25))',
          }}
        >
          🐰
        </span>
      </div>

      {/* Popcorn floating top-right */}
      <span
        className="absolute top-4 right-4"
        style={{
          fontSize: '22px',
          lineHeight: 1,
          transform: 'rotate(18deg)',
          filter: 'drop-shadow(1px 2px 0 rgba(0,0,0,0.2))',
        }}
      >
        🍿
      </span>

      {/* Sparkles */}
      <span
        className="absolute top-10 right-14"
        style={{
          fontSize: '12px',
          lineHeight: 1,
          opacity: 0.7,
        }}
      >
        ✨
      </span>
    </Link>
  );
}