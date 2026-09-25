'use client';

import { useEffect, useState } from 'react';

const PETS = ['🐱', '🐶', '🐰', '🐼', '🐸', '🦊', '🐨', '🐹'];

let cachedPet: string | null = null;
function pickPet(): string {
  if (cachedPet) return cachedPet;
  cachedPet = PETS[Math.floor(Math.random() * PETS.length)];
  return cachedPet;
}

type Props = {
  size?: number;
  variant?: 'peek' | 'wiggle';
  style?: React.CSSProperties;
};

export function CutePet({ size = 16, variant = 'peek', style }: Props) {
  const [pet, setPet] = useState<string | null>(null);

  useEffect(() => {
    setPet(pickPet());
  }, []);

  if (!pet) return null;

  const anim =
    variant === 'peek'
      ? 'pet-peek 1.8s ease-in-out infinite'
      : 'pet-wiggle 1.6s ease-in-out infinite';

  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        fontSize: `${size}px`,
        lineHeight: 1,
        animation: anim,
        pointerEvents: 'none',
        userSelect: 'none',
        filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.15))',
        ...style,
      }}
    >
      {pet}
    </span>
  );
}