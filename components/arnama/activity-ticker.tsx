'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type ActivityItem = {
  id: string
  text: string
}

export function ActivityTicker() {
  const [items, setItems] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function load() {
      const { data: msgs } = await supabase
        .from('messages')
        .select('id, user_email, content, created_at')
        .order('created_at', { ascending: false })
        .limit(20)

      const { data: profs } = await supabase
        .from('profiles')
        .select('id, email, created_at')
        .order('created_at', { ascending: false })
        .limit(5)

      const messageItems: (ActivityItem & { created_at: string })[] =
        (msgs ?? []).map((m) => {
          const name = m.user_email.split('@')[0]
          const preview =
            m.content.length > 40 ? m.content.slice(0, 40) + '…' : m.content
          return {
            id: `msg-${m.id}`,
            text: `${name}: ${preview}`,
            created_at: m.created_at,
          }
        })

      const joinItems: (ActivityItem & { created_at: string })[] =
        (profs ?? []).map((p) => {
          const name = p.email.split('@')[0]
          return {
            id: `join-${p.id}`,
            text: `${name} joined arnama`,
            created_at: p.created_at,
          }
        })

      const merged = [...messageItems, ...joinItems]
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
        .slice(-20)

      setItems(merged.map(({ id, text }) => ({ id, text })))
      setLoading(false)
    }

    load()

    channel = supabase
      .channel('ticker-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const m = payload.new as {
            id: string
            user_email: string
            content: string
          }
          const name = m.user_email.split('@')[0]
          const preview =
            m.content.length > 40 ? m.content.slice(0, 40) + '…' : m.content
          setItems((prev) => [
            ...prev.slice(-19),
            { id: `msg-${m.id}`, text: `${name}: ${preview}` },
          ])
        }
      )
      .subscribe()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  const shell = (inner: React.ReactNode) => (
    <div
      className="overflow-hidden rounded-3xl border-4 border-black"
      style={{
        backgroundColor: '#FFFDF5',
        boxShadow: '8px 8px 0px 0px rgba(0,0,0,1)',
      }}
    >
      <div className="flex items-stretch">
        <div
          className="flex shrink-0 items-center gap-2 border-r-4 border-black"
          style={{ backgroundColor: '#E6E6FA', padding: '12px 16px' }}
        >
          <span
            className="size-2.5 animate-blink rounded-full border-2 border-black"
            style={{ backgroundColor: '#E5989B' }}
          />
          <span
            className="font-display text-[0.6rem]"
            style={{ color: '#000' }}
          >
            LIVE
          </span>
        </div>
        {inner}
      </div>
    </div>
  )

  if (loading) {
    return shell(
      <div className="flex-1" style={{ padding: '12px 0 12px 32px' }}>
        <span
          className="text-sm font-bold"
          style={{ color: 'rgba(0,0,0,0.5)' }}
        >
          loading...
        </span>
      </div>
    )
  }

  if (items.length === 0) {
    return shell(
      <div className="flex-1" style={{ padding: '12px 0 12px 32px' }}>
        <span
          className="text-sm font-bold"
          style={{ color: 'rgba(0,0,0,0.5)' }}
        >
          quiet in here... say hi in chat 👋
        </span>
      </div>
    )
  }

  return shell(
    <div className="group relative flex-1 overflow-hidden" style={{ padding: '12px 0' }}>
      <ul className="flex w-max animate-[ticker_28s_linear_infinite] items-center gap-8 pl-8 group-hover:[animation-play-state:paused]">
        {[...items, ...items].map((item, i) => (
          <li
            key={`${item.id}-${i}`}
            className="flex items-center gap-3 whitespace-nowrap text-sm font-bold"
            style={{ color: '#000' }}
          >
            <span
              className="size-2 shrink-0 rotate-45 border-2 border-black"
              style={{ backgroundColor: '#9BC5A8' }}
            />
            {item.text}
          </li>
        ))}
      </ul>
    </div>
  )
}