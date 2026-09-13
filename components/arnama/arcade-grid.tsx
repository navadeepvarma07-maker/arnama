'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
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
import { supabase } from '@/lib/supabase'

const cartridges = [
  {
    title: 'ARCADE',
    subtitle: 'Play games together',
    icon: Gamepad2,
    color: 'lavender' as const,
    large: true,
    tilt: 'none' as const,
  },
  {
    title: 'CHAT',
    subtitle: 'The group chaos',
    icon: MessagesSquare,
    color: 'mint' as const,
    tilt: 'left' as const,
    href: '/chat',
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
    href: '/tunes',
  },
  {
    title: 'VAULT',
    subtitle: 'Secret keeper',
    icon: Lock,
    color: 'lavender' as const,
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
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !user.email) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('last_seen_at')
        .eq('id', user.id)
        .single()

      const lastSeen = profile?.last_seen_at ?? '1970-01-01T00:00:00Z'

      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .gt('created_at', lastSeen)
        .neq('user_email', user.email)

      setUnread(count ?? 0)

      channel = supabase
        .channel('unread-badge-live')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          (payload) => {
            const msg = payload.new as { user_email: string }
            if (msg.user_email !== user.email) {
              setUnread((c) => c + 1)
            }
          }
        )
        .subscribe()
    }

    init()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  return (
    <section aria-label="Portal menu">
      <div className="mb-4 flex items-center gap-2">
        <span className="size-3 animate-blink rounded-full border-2 border-ink bg-pink-deep" />
        <h2 className="font-display text-xs text-ink">SELECT A MACHINE</h2>
      </div>
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
        {cartridges.map((c) => {
          const { href, ...rest } = c as typeof c & { href?: string }
          const badge =
            rest.title === 'CHAT' && unread > 0
              ? unread
              : undefined

          const card = <Cartridge key={rest.title} {...rest} badge={badge} />
          return href ? (
            <Link key={rest.title} href={href} className="contents">
              {card}
            </Link>
          ) : (
            card
          )
        })}
      </div>
    </section>
  )
}