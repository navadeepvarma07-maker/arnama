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

  // GLASS — bright pastel + top shine + blur + inner highlight
  const cardStyle: React.CSSProperties = {
    background: `
      linear-gradient(
        180deg,
        rgba(255, 255, 255, 0.5) 0%,
        rgba(255, 255, 255, 0.15) 25%,
        rgba(255, 255, 255, 0) 55%
      ),
      rgba(230, 230, 250, 0.88)
    `,
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    borderColor: '#000',
    boxShadow: `
      8px 8px 0px 0px rgba(0, 0, 0, 1),
      inset 0 1px 0 rgba(255, 255, 255, 0.7),
      inset 0 -1px 0 rgba(0, 0, 0, 0.05)
    `,
  };

  if (loading) {
    return (
      <div className="rounded-3xl border-4 p-5" style={cardStyle}>
        <p
          className="text-sm font-bold"
          style={{ color: 'rgba(0,0,0,0.5)' }}
        >
          loading...
        </p>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="rounded-3xl border-4 p-5 text-center" style={cardStyle}>
        <p className="font-display text-sm mb-3" style={{ color: '#000' }}>
          not signed in
        </p>
        <Link
          href="/login"
          className="btn-gloss inline-flex items-center gap-2 px-4 py-2.5 border-4 border-black bg-[#FFD1DC] font-display text-xs rounded-2xl hover:-translate-y-0.5 active:translate-y-0.5 transition"
          style={{ color: '#000', boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}
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
    <div className="rounded-3xl border-4 p-5" style={cardStyle}>
      <div className="flex items-center gap-4">
        {/* Avatar — glass with pastel shine */}
        <div
          className="gloss-shine flex size-16 shrink-0 animate-float items-center justify-center rounded-2xl border-4 font-display text-lg"
          style={{
            background: `
              linear-gradient(
                180deg,
                rgba(255, 255, 255, 0.8) 0%,
                rgba(255, 255, 255, 0.2) 45%,
                rgba(255, 255, 255, 0) 100%
              ),
              #FFFDF5
            `,
            borderColor: '#000',
            color: '#000',
          }}
        >
          {initials}
        </div>
        <div className="min-w-0">
          <p
            className="truncate font-display text-[0.7rem]"
            style={{ color: '#000' }}
          >
            {displayName}
          </p>
          <p
            className="mt-1 text-sm font-bold"
            style={{ color: 'rgba(0,0,0,0.55)' }}
          >
            arnama member
          </p>
        </div>
      </div>

      {/* XP bar */}
      <div className="mt-5">
        <div
          className="mb-1.5 flex items-center justify-between text-xs font-bold"
          style={{ color: '#000' }}
        >
          <span className="flex items-center gap-1">
            <Zap className="size-3.5" strokeWidth={3} /> XP
          </span>
          <span style={{ color: 'rgba(0,0,0,0.55)' }}>{xpDisplay}</span>
        </div>
        {/* XP track — glass with top shine */}
        <div
          className="h-4 w-full overflow-hidden rounded-full border-4 border-black"
          style={{
            background: `
              linear-gradient(
                180deg,
                rgba(0, 0, 0, 0.08) 0%,
                rgba(255, 255, 255, 0.4) 100%
              ),
              #FFFDF5
            `,
          }}
        >
          <div
            className="h-full rounded-r-full transition-all duration-500"
            style={{
              background: `
                linear-gradient(
                  180deg,
                  rgba(255, 255, 255, 0.35) 0%,
                  rgba(255, 255, 255, 0) 50%
                ),
                #7FB89B
              `,
            }}
          />
        </div>
      </div>

      {/* stat stickers — glass pastels */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div
          className="flex items-center gap-2 rounded-2xl border-4 border-black px-3 py-2.5"
          style={{
            background: `
              linear-gradient(
                180deg,
                rgba(255, 255, 255, 0.55) 0%,
                rgba(255, 255, 255, 0) 55%
              ),
              rgba(255, 209, 220, 0.9)
            `,
            backdropFilter: 'blur(10px) saturate(160%)',
            WebkitBackdropFilter: 'blur(10px) saturate(160%)',
            boxShadow: `
              3px 3px 0px 0px rgba(0,0,0,1),
              inset 0 1px 0 rgba(255, 255, 255, 0.6)
            `,
          }}
        >
          <Coins className="size-5" strokeWidth={2.75} style={{ color: '#000' }} />
          <div className="leading-none">
            <p className="font-display text-[0.65rem]" style={{ color: '#000' }}>
              {coinCount}
            </p>
            <p
              className="mt-1 text-[0.7rem] font-bold"
              style={{ color: 'rgba(0,0,0,0.6)' }}
            >
              messages
            </p>
          </div>
        </div>
        <div
          className="flex items-center gap-2 rounded-2xl border-4 border-black px-3 py-2.5"
          style={{
            background: `
              linear-gradient(
                180deg,
                rgba(255, 255, 255, 0.55) 0%,
                rgba(255, 255, 255, 0) 55%
              ),
              rgba(226, 240, 217, 0.9)
            `,
            backdropFilter: 'blur(10px) saturate(160%)',
            WebkitBackdropFilter: 'blur(10px) saturate(160%)',
            boxShadow: `
              3px 3px 0px 0px rgba(0,0,0,1),
              inset 0 1px 0 rgba(255, 255, 255, 0.6)
            `,
          }}
        >
          <Star className="size-5" strokeWidth={2.75} style={{ color: '#000' }} />
          <div className="leading-none">
            <p className="font-display text-[0.65rem]" style={{ color: '#000' }}>
              {joinedLabel}
            </p>
            <p
              className="mt-1 text-[0.7rem] font-bold"
              style={{ color: 'rgba(0,0,0,0.6)' }}
            >
              joined
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}