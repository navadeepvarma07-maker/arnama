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
            // When a waiting game gets joined (status changes), decrement
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
      </div>
    </section>
  )
}