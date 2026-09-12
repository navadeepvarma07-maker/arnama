'use client'

import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type CartridgeColor = 'lavender' | 'mint' | 'pink'

const colorMap: Record<CartridgeColor, string> = {
  lavender: 'bg-lavender',
  mint: 'bg-mint',
  pink: 'bg-pink',
}

const stickerMap: Record<CartridgeColor, string> = {
  lavender: 'bg-lavender-deep',
  mint: 'bg-mint-deep',
  pink: 'bg-pink-deep',
}

interface CartridgeProps {
  title: string
  subtitle: string
  icon: LucideIcon
  color: CartridgeColor
  badge?: number
  large?: boolean
  tilt?: 'left' | 'right' | 'none'
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
    tilt === 'left'
      ? '-rotate-1'
      : tilt === 'right'
        ? 'rotate-1'
        : 'rotate-0'

  return (
    <button
      type="button"
      className={cn(
        'group relative block w-full text-left',
        large ? 'sm:col-span-2' : '',
        tiltClass,
      )}
    >
      <span
        className={cn(
          'relative flex h-full flex-col gap-3 rounded-3xl border-4 border-ink p-4 shadow-brutal',
          'transition-transform duration-150 ease-out',
          'group-hover:-translate-x-1 group-hover:-translate-y-1 group-hover:shadow-brutal-lg',
          'group-active:translate-x-1 group-active:translate-y-1 group-active:shadow-brutal-sm',
          colorMap[color],
        )}
      >
        {/* cartridge grip ridges */}
        <span aria-hidden className="flex gap-1.5">
          <span className="h-1.5 w-8 rounded-full bg-ink/70" />
          <span className="h-1.5 w-8 rounded-full bg-ink/40" />
          <span className="h-1.5 w-4 rounded-full bg-ink/25" />
        </span>

        {/* icon sticker label */}
        <span
          className={cn(
            'flex items-center justify-center rounded-2xl border-4 border-ink bg-cream',
            large ? 'size-20' : 'size-14',
          )}
        >
          <Icon
            className={cn('text-ink', large ? 'size-10' : 'size-7')}
            strokeWidth={2.75}
          />
        </span>

        <span className="mt-auto flex flex-col gap-1">
          <span
            className={cn(
              'font-display leading-tight text-ink',
              large ? 'text-base' : 'text-[0.7rem]',
            )}
          >
            {title}
          </span>
          <span className="text-sm font-semibold text-ink/70">{subtitle}</span>
        </span>

        {/* press-to-play tab */}
        <span
          className={cn(
            'absolute -bottom-3 left-1/2 h-3 w-16 -translate-x-1/2 rounded-b-lg border-4 border-t-0 border-ink',
            stickerMap[color],
          )}
        />

        {typeof badge === 'number' && badge > 0 && (
          <span className="absolute -right-3 -top-3 flex size-9 items-center justify-center rounded-full border-4 border-ink bg-cream font-display text-[0.6rem] text-ink shadow-brutal-sm">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </span>
    </button>
  )
}
