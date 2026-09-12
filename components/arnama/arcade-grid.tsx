'use client'

import {
  Gamepad2,
  MessagesSquare,
  Images,
  Music4,
  Lock,
  CalendarHeart,
  Sparkles,
} from 'lucide-react'
import { Cartridge } from './cartridge'

const cartridges = [
  {
    title: 'ARCADE',
    subtitle: 'Play games together',
    icon: Gamepad2,
    color: 'lavender' as const,
    badge: 3,
    large: true,
    tilt: 'none' as const,
  },
  {
    title: 'CHAT',
    subtitle: 'The group chaos',
    icon: MessagesSquare,
    color: 'mint' as const,
    badge: 12,
    tilt: 'left' as const,
  },
  {
    title: 'PHOTOS',
    subtitle: 'The photo dump',
    icon: Images,
    color: 'pink' as const,
    tilt: 'right' as const,
  },
  {
    title: 'TUNES',
    subtitle: 'Shared playlists',
    icon: Music4,
    color: 'mint' as const,
    tilt: 'right' as const,
  },
  {
    title: 'VAULT',
    subtitle: 'Secret keeper',
    icon: Lock,
    color: 'lavender' as const,
    badge: 1,
    tilt: 'left' as const,
  },
  {
    title: 'PLANS',
    subtitle: 'Next hangout',
    icon: CalendarHeart,
    color: 'pink' as const,
    tilt: 'none' as const,
  },
  {
    title: 'WISHES',
    subtitle: 'Confession board',
    icon: Sparkles,
    color: 'lavender' as const,
    tilt: 'right' as const,
  },
]

export function ArcadeGrid() {
  return (
    <section aria-label="Portal menu">
      <div className="mb-4 flex items-center gap-2">
        <span className="size-3 animate-blink rounded-full border-2 border-ink bg-pink-deep" />
        <h2 className="font-display text-xs text-ink">SELECT A MACHINE</h2>
      </div>
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
        {cartridges.map((c) => (
          <Cartridge key={c.title} {...c} />
        ))}
      </div>
    </section>
  )
}
