'use client';

import { ReactNode } from 'react';

export function StoryRing({
  hasStory,
  seen,
  size = 48,
  children,
}: {
  hasStory: boolean;
  seen: boolean;
  size?: number;
  children: ReactNode;
}) {
  if (!hasStory) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '999px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {children}
      </div>
    );
  }

  const ringThickness = Math.max(3, Math.round(size * 0.065));

  // BRIGHT: mint → cyan → blue → violet → lavender → mint
  const unseenGradient =
    'conic-gradient(from 180deg at 50% 50%, #4DD9C0 0deg, #7FB89B 40deg, #4DD9C0 80deg, #5B8DEF 140deg, #7C5CFF 195deg, #B58BFF 250deg, #7FB89B 310deg, #4DD9C0 360deg)';

  const seenGradient =
    'conic-gradient(from 180deg at 50% 50%, #C9C4BB, #DFDAD1, #C9C4BB, #C9C4BB)';

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '999px',
        padding: `${ringThickness}px`,
        background: seen ? seenGradient : unseenGradient,
        border: '2px solid #000',
        boxShadow: '2px 2px 0 0 black',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'background 0.25s ease',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '999px',
          background: '#FFFDF5',
          padding: '2px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '999px',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}