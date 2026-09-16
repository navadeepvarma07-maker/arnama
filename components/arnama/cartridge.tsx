'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type CartridgeColor = 'lavender' | 'mint' | 'pink';

const colorMap: Record<CartridgeColor, string> = {
  lavender: 'bg-lavender',
  mint: 'bg-mint',
  pink: 'bg-pink',
};

const stickerMap: Record<CartridgeColor, string> = {
  lavender: 'bg-lavender-deep',
  mint: 'bg-mint-deep',
  pink: 'bg-pink-deep',
};

interface CartridgeProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  color: CartridgeColor;
  badge?: number;
  large?: boolean;
  tilt?: 'left' | 'right' | 'none';
}

export function Cartridge({
  title,
  subtitle,
  icon: Icon,
  color,
  badge,
  large = false,
  tilt = 'none',
}: CartridgeProps) {
  const tiltClass =
    tilt === 'left' ? '-rotate-1' : tilt === 'right' ? 'rotate-1' : 'rotate-0';

  return (
    <button
      type="button"
      className={cn(
        'group relative block w-full text-left',
        large ? 'sm:col-span-2' : '',
        tiltClass
      )}
    >
      <span
        className={cn(
          'relative flex h-full flex-col gap-3 rounded-3xl border-4 border-ink p-4 shadow-brutal',
          'transition-transform duration-150 ease-out',
          'group-hover:-translate-x-1 group-hover:-translate-y-1 group-hover:shadow-brutal-lg',
          'group-active:translate-x-1 group-active:translate-y-1 group-active:shadow-brutal-sm',
          colorMap[color]
        )}
        style={{ overflow: 'hidden' }}
      >
        {/* GLASS TOP SHINE — subtle white gradient from top */}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: `
              linear-gradient(
                180deg,
                rgba(255, 255, 255, 0.5) 0%,
                rgba(255, 255, 255, 0.15) 25%,
                rgba(255, 255, 255, 0) 55%
              )
            `,
            borderRadius: 'inherit',
            zIndex: 0,
          }}
        />

        {/* GLASS INNER HIGHLIGHT — thin bright line on top edge */}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: '2px',
            left: '10px',
            right: '10px',
            height: '3px',
            borderRadius: '999px',
            background:
              'linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />

        {/* Everything below sits above the shine layers */}
        <span
          aria-hidden
          className="relative flex gap-1.5"
          style={{ zIndex: 2 }}
        >
          <span
            className="h-1.5 w-8 rounded-full"
            style={{
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 100%), rgba(0,0,0,0.7)',
            }}
          />
          <span
            className="h-1.5 w-8 rounded-full"
            style={{
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 100%), rgba(0,0,0,0.4)',
            }}
          />
          <span
            className="h-1.5 w-4 rounded-full"
            style={{
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 100%), rgba(0,0,0,0.25)',
            }}
          />
        </span>

        {/* Icon sticker — has gloss-shine already */}
        <span
          className={cn(
            'gloss-shine relative flex items-center justify-center rounded-2xl border-4 border-ink bg-cream',
            large ? 'size-20' : 'size-14'
          )}
          style={{
            zIndex: 2,
            background: `
              linear-gradient(
                180deg,
                rgba(255, 255, 255, 0.75) 0%,
                rgba(255, 255, 255, 0.2) 45%,
                rgba(255, 255, 255, 0) 100%
              ),
              #FFFDF5
            `,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)',
          }}
        >
          <Icon
            className={cn('text-ink relative', large ? 'size-10' : 'size-7')}
            strokeWidth={2.75}
            style={{ zIndex: 1 }}
          />
        </span>

        <span
          className="mt-auto flex flex-col gap-1 relative"
          style={{ zIndex: 2 }}
        >
          <span
            className={cn(
              'font-display leading-tight text-ink',
              large ? 'text-base' : 'text-[0.7rem]'
            )}
          >
            {title}
          </span>
          <span className="text-sm font-semibold text-ink/70">{subtitle}</span>
        </span>

        {/* Press-to-play tab */}
        <span
          className={cn(
            'absolute -bottom-3 left-1/2 h-3 w-16 -translate-x-1/2 rounded-b-lg border-4 border-t-0 border-ink',
            stickerMap[color]
          )}
          style={{ zIndex: 2 }}
        />

        {typeof badge === 'number' && badge > 0 && (
          <span
            className="badge-pulse absolute -right-3 -top-3 flex size-9 items-center justify-center rounded-full border-4 border-ink bg-cream font-display text-[0.6rem] text-ink shadow-brutal-sm"
            style={{ zIndex: 3 }}
          >
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </span>
    </button>
  );
}