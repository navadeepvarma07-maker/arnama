'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Profile = {
  id: string;
  email: string;
  created_at: string;
};

const COLOR_CYCLE = ['bg-mint', 'bg-pink', 'bg-lavender'] as const;

export function FriendsStrip() {
  const [myId, setMyId] = useState<string | null>(null);
  const [myEmail, setMyEmail] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. Get my user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setMyId(data.user?.id ?? null);
      setMyEmail(data.user?.email ?? null);
    });
  }, []);

  // 2. Load all profiles
  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error(error);
        else setProfiles(data ?? []);
        setLoading(false);
      });
  }, []);

  // 3. Subscribe to presence (who's online right now)
  useEffect(() => {
    if (!myId || !myEmail) return;

    const channel = supabase.channel('arnama-online', {
      config: { presence: { key: myId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setOnlineIds(Object.keys(state));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: myId, email: myEmail });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [myId, myEmail]);

  const onlineCount = onlineIds.length;

  if (loading) {
    return (
      <div className="rounded-3xl border-4 border-ink bg-card p-5 shadow-brutal">
        <p className="text-sm font-bold text-ink/60">loading crew...</p>
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="rounded-3xl border-4 border-ink bg-card p-5 shadow-brutal">
        <h2 className="font-display text-[0.7rem] text-ink mb-3">THE CREW</h2>
        <p className="text-sm font-bold text-ink/60">no members yet</p>
      </div>
    );
  }

  // sort: online first, then me, then alphabetical
  const sorted = [...profiles].sort((a, b) => {
    const aOnline = onlineIds.includes(a.id);
    const bOnline = onlineIds.includes(b.id);
    if (aOnline !== bOnline) return aOnline ? -1 : 1;
    if (a.id === myId) return -1;
    if (b.id === myId) return 1;
    return a.email.localeCompare(b.email);
  });

  return (
    <div className="rounded-3xl border-4 border-ink bg-card p-5 shadow-brutal">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-[0.7rem] text-ink">THE CREW</h2>
        <span className="flex items-center gap-1.5 rounded-full border-2 border-ink bg-mint px-2.5 py-1 text-xs font-bold text-ink">
          <span className="size-2 rounded-full border border-ink bg-mint-deep" />
          {onlineCount} on
        </span>
      </div>

      <ul className="flex flex-col gap-3">
        {sorted.map((p, idx) => {
          const isMe = p.id === myId;
          const isOnline = onlineIds.includes(p.id);
          const prefix = p.email.split('@')[0];
          const initials = prefix.slice(0, 2).toUpperCase();
          const color = COLOR_CYCLE[idx % COLOR_CYCLE.length];

          return (
            <li key={p.id} className="flex items-center gap-3">
              <div className="relative">
                <div
                  className={`flex size-11 items-center justify-center rounded-xl border-4 border-ink font-display text-[0.6rem] text-ink ${color}`}
                >
                  {initials}
                </div>
                <span
                  className={`absolute -bottom-1 -right-1 size-4 rounded-full border-2 border-ink ${
                    isOnline ? 'bg-mint-deep' : 'bg-cream'
                  }`}
                />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink">
                  {isMe ? `${prefix} (you)` : prefix}
                </p>
                <p className="text-xs font-semibold text-ink/50">
                  {isOnline ? 'in the portal' : 'away'}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}