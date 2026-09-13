'use client';

import { useEffect, useState } from 'react';
import { Coins, Star, Zap, LogIn } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export function PlayerCard() {
  const [email, setEmail] = useState<string | null>(null);
  const [joinedAt, setJoinedAt] = useState<string | null>(null);
  const [coinCount, setCoinCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user) {
        setLoading(false);
        return;
      }
      setEmail(user.email ?? null);
      setJoinedAt(user.created_at ?? null);

      if (user.email) {
        supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('user_email', user.email)
          .then(({ count }) => {
            setCoinCount(count ?? 0);
            setLoading(false);
          });
      } else {
        setLoading(false);
      }
    });
  }, []);

  if (loading) {
    return (
      <div className="rounded-3xl border-4 border-ink bg-card p-5 shadow-brutal">
        <p className="text-sm font-bold text-ink/60">loading...</p>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="rounded-3xl border-4 border-ink bg-card p-5 shadow-brutal text-center">
        <p className="font-display text-sm text-ink mb-3">not signed in</p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-4 py-2.5 border-4 border-ink bg-pink text-ink font-display text-xs rounded-2xl shadow-brutal-sm hover:-translate-y-0.5 active:translate-y-0.5 transition"
        >
          <LogIn className="size-4" strokeWidth={2.75} />
          sign in
        </Link>
      </div>
    );
  }

  const prefix = email.split('@')[0];
  const initials = prefix.slice(0, 2).toUpperCase();
  const displayName = prefix;

  const joined = joinedAt ? new Date(joinedAt) : null;
  const joinedLabel = joined
    ? joined.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : '—';

  const xpGoal = 100;
  const xpPercent = Math.min(100, (coinCount / xpGoal) * 100);
  const xpDisplay = `${coinCount} / ${xpGoal}`;

  return (
    <div className="rounded-3xl border-4 border-ink bg-card p-5 shadow-brutal">
      <div className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 animate-float items-center justify-center rounded-2xl border-4 border-ink bg-lavender font-display text-lg text-ink">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-[0.7rem] text-ink">
            {displayName}
          </p>
          <p className="mt-1 text-sm font-bold text-ink/60">
            arnama member
          </p>
        </div>
      </div>

      {/* XP bar */}
      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between text-xs font-bold text-ink/60">
          <span className="flex items-center gap-1">
            <Zap className="size-3.5" strokeWidth={3} /> XP
          </span>
          <span>{xpDisplay}</span>
        </div>
        <div className="h-4 w-full overflow-hidden rounded-full border-4 border-ink bg-cream">
          <div
            className="h-full rounded-r-full bg-mint-deep transition-all duration-500"
            style={{ width: `${xpPercent}%` }}
          />
        </div>
      </div>

      {/* stat stickers */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2 rounded-2xl border-4 border-ink bg-pink px-3 py-2.5 shadow-brutal-sm">
          <Coins className="size-5 text-ink" strokeWidth={2.75} />
          <div className="leading-none">
            <p className="font-display text-[0.65rem] text-ink">{coinCount}</p>
            <p className="mt-1 text-[0.7rem] font-bold text-ink/60">messages</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border-4 border-ink bg-mint px-3 py-2.5 shadow-brutal-sm">
          <Star className="size-5 text-ink" strokeWidth={2.75} />
          <div className="leading-none">
            <p className="font-display text-[0.65rem] text-ink">{joinedLabel}</p>
            <p className="mt-1 text-[0.7rem] font-bold text-ink/60">joined</p>
          </div>
        </div>
      </div>
    </div>
  )
}