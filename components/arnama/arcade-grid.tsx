'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import {
  Gamepad2,
  MessagesSquare,
  Images,
  Music4,
  Lock,
  CalendarHeart,
  Sparkles,
  Moon,
} from 'lucide-react'
import { Cartridge } from './cartridge'
import { supabase } from '@/lib/supabase'

const cartridges = [
  { title: 'ARCADE', subtitle: 'Play games together', icon: Gamepad2, color: 'lavender' as const, large: true, tilt: 'none' as const, href: '/arcade' },
  { title: 'CHAT', subtitle: 'The group chaos', icon: MessagesSquare, color: 'mint' as const, tilt: 'left' as const, href: '/chat' },
  { title: 'PHOTOS', subtitle: 'The photo dump', icon: Images, color: 'pink' as const, tilt: 'right' as const, href: '/photos' },
  { title: 'TUNES', subtitle: 'Shared playlists', icon: Music4, color: 'mint' as const, tilt: 'right' as const, href: '/tunes' },
  { title: 'VAULT', subtitle: 'Secret keeper', icon: Lock, color: 'lavender' as const, tilt: 'left' as const, href: '/vault' },
  { title: 'PLANS', subtitle: 'Next hangout', icon: CalendarHeart, color: 'pink' as const, tilt: 'none' as const, href: '/plans' },
  { title: 'WISHES', subtitle: 'Confession board', icon: Sparkles, color: 'lavender' as const, tilt: 'right' as const, href: '/wishes' },
]

export function ArcadeGrid() {
  const [unreadChat, setUnreadChat] = useState(0)
  const [unreadTunes, setUnreadTunes] = useState(0)
  const [unreadPhotos, setUnreadPhotos] = useState(0)
  const [unreadWishes, setUnreadWishes] = useState(0)
  const [unreadVault, setUnreadVault] = useState(0)
  const [unreadPlans, setUnreadPlans] = useState(0)
  const [unreadArcade, setUnreadArcade] = useState(0)

  const refreshCounts = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !user.email) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('last_seen_at, last_seen_tunes_at, last_seen_photos_at, last_seen_wishes_at, last_seen_plans_at')
      .eq('id', user.id)
      .single()

    const L = '1970-01-01T00:00:00Z'
    const lastChat = profile?.last_seen_at ?? L
    const lastTunes = profile?.last_seen_tunes_at ?? L
    const lastPhotos = profile?.last_seen_photos_at ?? L
    const lastWishes = profile?.last_seen_wishes_at ?? L
    const lastPlans = profile?.last_seen_plans_at ?? L

    const [chatResult, tunesResult, photosResult, wishesResult, vaultResult, plansResult, arcadeResult] = await Promise.all([
      supabase.from('messages').select('*', { count: 'exact', head: true }).gt('created_at', lastChat).neq('user_email', user.email),
      supabase.from('tunes').select('*', { count: 'exact', head: true }).gt('created_at', lastTunes).neq('user_email', user.email),
      supabase.from('photos').select('*', { count: 'exact', head: true }).gt('created_at', lastPhotos).neq('user_email', user.email),
      supabase.from('wishes').select('*', { count: 'exact', head: true }).gt('created_at', lastWishes).neq('user_email', user.email),
      supabase.from('vault_dms').select('*', { count: 'exact', head: true }).eq('recipient_id', user.id).is('read_at', null),
      supabase.from('plans').select('*', { count: 'exact', head: true }).gt('created_at', lastPlans).neq('user_email', user.email),
      supabase.from('arcade_ttt').select('*', { count: 'exact', head: true }).eq('status', 'waiting').neq('player_x_id', user.id),
    ])

    setUnreadChat(chatResult.count ?? 0)
    setUnreadTunes(tunesResult.count ?? 0)
    setUnreadPhotos(photosResult.count ?? 0)
    setUnreadWishes(wishesResult.count ?? 0)
    setUnreadVault(vaultResult.count ?? 0)
    setUnreadPlans(plansResult.count ?? 0)
    setUnreadArcade(arcadeResult.count ?? 0)
  }, [])

  useEffect(() => {
    let chatChannel: ReturnType<typeof supabase.channel> | null = null
    let tunesChannel: ReturnType<typeof supabase.channel> | null = null
    let photosChannel: ReturnType<typeof supabase.channel> | null = null
    let wishesChannel: ReturnType<typeof supabase.channel> | null = null
    let vaultChannel: ReturnType<typeof supabase.channel> | null = null
    let plansChannel: ReturnType<typeof supabase.channel> | null = null
    let arcadeChannel: ReturnType<typeof supabase.channel> | null = null
    let myEmail: string | null = null
    let myId: string | null = null

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !user.email) return
      myEmail = user.email
      myId = user.id
      await refreshCounts()

      const suffix = Math.random().toString(36).slice(2, 8)

      chatChannel = supabase.channel(`unread-chat-${suffix}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
          const m = payload.new as { user_email: string }
          if (m.user_email !== myEmail) setUnreadChat((c) => c + 1)
        }).subscribe()

      tunesChannel = supabase.channel(`unread-tunes-${suffix}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tunes' }, (payload) => {
          const t = payload.new as { user_email: string }
          if (t.user_email !== myEmail) setUnreadTunes((c) => c + 1)
        }).subscribe()

      photosChannel = supabase.channel(`unread-photos-${suffix}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'photos' }, (payload) => {
          const p = payload.new as { user_email: string }
          if (p.user_email !== myEmail) setUnreadPhotos((c) => c + 1)
        }).subscribe()

      wishesChannel = supabase.channel(`unread-wishes-${suffix}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wishes' }, (payload) => {
          const w = payload.new as { user_email: string }
          if (w.user_email !== myEmail) setUnreadWishes((c) => c + 1)
        }).subscribe()

      vaultChannel = supabase.channel(`unread-vault-${suffix}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'vault_dms' },
          (payload) => {
            const m = payload.new as { recipient_id: string }
            if (m.recipient_id === myId) setUnreadVault((c) => c + 1)
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'vault_dms' },
          (payload) => {
            const m = payload.new as { recipient_id: string; read_at: string | null }
            if (m.recipient_id === myId && m.read_at) {
              setUnreadVault((c) => Math.max(0, c - 1))
            }
          }
        )
        .subscribe()

      plansChannel = supabase.channel(`unread-plans-${suffix}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'plans' },
          (payload) => {
            const p = payload.new as { user_email: string }
            if (p.user_email !== myEmail) setUnreadPlans((c) => c + 1)
          }
        )
        .subscribe()

      arcadeChannel = supabase.channel(`unread-arcade-${suffix}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'arcade_ttt' },
          (payload) => {
            const g = payload.new as { player_x_id: string; status: string }
            if (g.player_x_id !== myId && g.status === 'waiting') {
              setUnreadArcade((c) => c + 1)
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'arcade_ttt' },
          (payload) => {
            const g = payload.new as { status: string }
            if (g.status !== 'waiting') {
              setUnreadArcade((c) => Math.max(0, c - 1))
            }
          }
        )
        .subscribe()
    }

    init()

    const onFocus = () => refreshCounts()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshCounts()
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      if (chatChannel) supabase.removeChannel(chatChannel)
      if (tunesChannel) supabase.removeChannel(tunesChannel)
      if (photosChannel) supabase.removeChannel(photosChannel)
      if (wishesChannel) supabase.removeChannel(wishesChannel)
      if (vaultChannel) supabase.removeChannel(vaultChannel)
      if (plansChannel) supabase.removeChannel(plansChannel)
      if (arcadeChannel) supabase.removeChannel(arcadeChannel)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refreshCounts])

  return (
    <section aria-label="Portal menu">
      <div className="mb-4 flex items-center gap-2">
        <span
          className="size-3 animate-blink rounded-full border-2"
          style={{ backgroundColor: '#E5989B', borderColor: '#000' }}
        />
        <h2
          className="font-display text-xs"
          style={{ color: 'var(--text-primary)' }}
        >
          SELECT A MACHINE
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
        {cartridges.map((c) => {
          const { href, ...rest } = c as typeof c & { href?: string }
          let badge: number | undefined
          if (rest.title === 'ARCADE' && unreadArcade > 0) badge = unreadArcade
          if (rest.title === 'CHAT' && unreadChat > 0) badge = unreadChat
          if (rest.title === 'TUNES' && unreadTunes > 0) badge = unreadTunes
          if (rest.title === 'PHOTOS' && unreadPhotos > 0) badge = unreadPhotos
          if (rest.title === 'WISHES' && unreadWishes > 0) badge = unreadWishes
          if (rest.title === 'VAULT' && unreadVault > 0) badge = unreadVault
          if (rest.title === 'PLANS' && unreadPlans > 0) badge = unreadPlans

          const card = <Cartridge key={rest.title} {...rest} badge={badge} />
          return href ? (
            <Link key={rest.title} href={href} className="contents">
              {card}
            </Link>
          ) : (
            card
          )
        })}

        {/* WATCH — custom cartoony card */}
        <Link key="WATCH" href="/watch" className="contents">
          <WatchCartridge />
        </Link>
      </div>
    </section>
  )
}

/**
 * Cartoony Watch card — Tom + Jerry + Rabbit watching a movie,
 * with popcorn, warm sunset gradient, and a glossy TV icon.
 */
function WatchCartridge() {
  return (
    <div
      className="group relative overflow-hidden rounded-3xl border-4 border-black p-5 hover:-translate-y-1 active:translate-y-0.5 transition-transform"
      style={{
        // deep night sky: navy → purple → midnight blue
        background: `
          radial-gradient(ellipse at 80% 10%, rgba(180, 160, 255, 0.35) 0%, rgba(180, 160, 255, 0) 55%),
          radial-gradient(ellipse at 20% 100%, rgba(120, 100, 220, 0.4) 0%, rgba(120, 100, 220, 0) 60%),
          linear-gradient(165deg, #1B1548 0%, #2A1F5E 45%, #3A2A6E 100%)
        `,
        boxShadow: '8px 8px 0 0 black',
        minHeight: '180px',
        display: 'flex',
        flexDirection: 'column',
        textDecoration: 'none',
        position: 'relative',
      }}
    >
      {/* top 3 decorative bars — same as every other cartridge */}
      <div className="flex gap-1.5">
        <span
          className="h-1.5 w-8 rounded-full"
          style={{ background: 'rgba(255,255,255,0.22)' }}
        />
        <span
          className="h-1.5 w-8 rounded-full"
          style={{ background: 'rgba(255,255,255,0.22)' }}
        />
        <span
          className="h-1.5 w-8 rounded-full"
          style={{ background: 'rgba(255,255,255,0.22)' }}
        />
      </div>

      {/* Moon icon in the same circular style as other cartridges */}
      <div
        className="mt-4 flex size-14 shrink-0 items-center justify-center rounded-full border-4 border-black"
        style={{
          background: `linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 60%), #FFFDF5`,
          boxShadow: '3px 3px 0 0 black',
        }}
      >
        <Moon
          className="size-6"
          strokeWidth={2.75}
          style={{ color: '#1B1548', fill: '#1B1548' }}
        />
      </div>

      {/* title + subtitle */}
      <div className="mt-auto pt-4">
        <h3
          className="font-display text-lg leading-tight"
          style={{ color: '#FFFDF5' }}
        >
          WATCH
        </h3>
        <p
          className="mt-1 text-xs font-bold"
          style={{ color: 'rgba(255,253,245,0.7)' }}
        >
          Movie night
        </p>
      </div>

      {/* scattered stars — top right & middle */}
      <span
        className="absolute"
        style={{
          top: '18px',
          right: '20px',
          fontSize: '14px',
          lineHeight: 1,
          opacity: 0.9,
          filter: 'drop-shadow(0 0 4px rgba(255,255,200,0.9))',
        }}
      >
        ✨
      </span>
      <span
        className="absolute"
        style={{
          top: '34px',
          right: '56px',
          fontSize: '10px',
          lineHeight: 1,
          opacity: 0.75,
        }}
      >
        ⭐
      </span>
      <span
        className="absolute"
        style={{
          top: '58px',
          right: '24px',
          fontSize: '9px',
          lineHeight: 1,
          opacity: 0.7,
        }}
      >
        ✨
      </span>
      <span
        className="absolute"
        style={{
          top: '14px',
          left: '70px',
          fontSize: '8px',
          lineHeight: 1,
          opacity: 0.6,
        }}
      >
        ⭐
      </span>

      {/* tiny crescent moon peeking top-right */}
      <span
        className="absolute"
        style={{
          top: '-4px',
          right: '-4px',
          fontSize: '34px',
          lineHeight: 1,
          transform: 'rotate(-12deg)',
          filter: 'drop-shadow(0 2px 4px rgba(255,255,220,0.5))',
          opacity: 0.95,
        }}
      >
        🌙
      </span>

      {/* popcorn as a tiny floating snack — bottom-right */}
      <span
        className="absolute"
        style={{
          bottom: '14px',
          right: '16px',
          fontSize: '22px',
          lineHeight: 1,
          transform: 'rotate(14deg)',
          filter: 'drop-shadow(1px 2px 0 rgba(0,0,0,0.35))',
        }}
      >
        🍿
      </span>

      {/* audience — Tom, Jerry, Rabbit watching from below, tucked in */}
      <div
        className="absolute"
        style={{
          bottom: '14px',
          left: '18px',
          display: 'flex',
          gap: '-6px',
          alignItems: 'flex-end',
        }}
      >
        <span
          style={{
            fontSize: '20px',
            lineHeight: 1,
            transform: 'rotate(-8deg) translateY(0)',
            filter: 'drop-shadow(1px 2px 0 rgba(0,0,0,0.35))',
          }}
        >
          🐱
        </span>
        <span
          style={{
            fontSize: '18px',
            lineHeight: 1,
            transform: 'translateY(3px) rotate(5deg)',
            filter: 'drop-shadow(1px 2px 0 rgba(0,0,0,0.35))',
          }}
        >
          🐭
        </span>
        <span
          style={{
            fontSize: '20px',
            lineHeight: 1,
            transform: 'rotate(-3deg) translateY(-1px)',
            filter: 'drop-shadow(1px 2px 0 rgba(0,0,0,0.35))',
          }}
        >
          🐰
        </span>
      </div>

      {/* glass shine overlay — same recipe as other cartridges */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: `
            linear-gradient(
              180deg,
              rgba(255, 255, 255, 0.22) 0%,
              rgba(255, 255, 255, 0.05) 25%,
              rgba(255, 255, 255, 0) 55%
            )
          `,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}