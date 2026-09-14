'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { displayLabel, initialsFor } from '@/lib/use-profile';

type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_color: string;
  created_at: string;
};

const FALLBACK_AVATAR = ['#E2F0D9', '#FFD1DC', '#E6E6FA', '#FFF5BA', '#D4F0F0'];

export function FriendsStrip() {
  const [myId, setMyId] = useState<string | null>(null);
  const [myEmail, setMyEmail] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setMyId(data.user?.id ?? null);
      setMyEmail(data.user?.email ?? null);
    });
  }, []);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, email, display_name, avatar_color, created_at')
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error(error);
        else setProfiles((data ?? []) as Profile[]);
        setLoading(false);
      });
  }, []);

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

  // GLASS — mint + top shine + inner highlight
  const cardStyle: React.CSSProperties = {
    background: `
      linear-gradient(
        180deg,
        rgba(255, 255, 255, 0.5) 0%,
        rgba(255, 255, 255, 0.15) 25%,
        rgba(255, 255, 255, 0) 55%
      ),
      rgba(226, 240, 217, 0.88)
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
        <p className="text-sm font-bold" style={{ color: 'rgba(0,0,0,0.5)' }}>
          loading crew...
        </p>
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="rounded-3xl border-4 p-5" style={cardStyle}>
        <h2
          className="font-display text-[0.7rem] mb-3"
          style={{ color: '#000' }}
        >
          THE CREW
        </h2>
        <p className="text-sm font-bold" style={{ color: 'rgba(0,0,0,0.5)' }}>
          no members yet
        </p>
      </div>
    );
  }

  const sorted = [...profiles].sort((a, b) => {
    const aOnline = onlineIds.includes(a.id);
    const bOnline = onlineIds.includes(b.id);
    if (aOnline !== bOnline) return aOnline ? -1 : 1;
    if (a.id === myId) return -1;
    if (b.id === myId) return 1;
    return a.email.localeCompare(b.email);
  });

  return (
    <div className="rounded-3xl border-4 p-5" style={cardStyle}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-[0.7rem]" style={{ color: '#000' }}>
          THE CREW
        </h2>
        <span
          className="flex items-center gap-1.5 rounded-full border-2 border-black px-2.5 py-1 text-xs font-bold"
          style={{
            background: `
              linear-gradient(
                180deg,
                rgba(255, 255, 255, 0.6) 0%,
                rgba(255, 255, 255, 0) 100%
              ),
              rgba(255, 253, 245, 0.9)
            `,
            color: '#000',
          }}
        >
          <span
            className="size-2 rounded-full border border-black"
            style={{ backgroundColor: '#7FB89B' }}
          />
          {onlineCount} on
        </span>
      </div>

      <ul className="flex flex-col gap-3">
        {sorted.map((p, idx) => {
          const isMe = p.id === myId;
          const isOnline = onlineIds.includes(p.id);
          const label = displayLabel(p.email, p.display_name);
          const initials = initialsFor(p.email, p.display_name);
          const avatarBg =
            p.avatar_color || FALLBACK_AVATAR[idx % FALLBACK_AVATAR.length];

          return (
            <li key={p.id} className="flex items-center gap-3">
              <div className="relative">
                {/* Avatar — glass shine */}
                <div
                  className="gloss-shine flex size-11 items-center justify-center rounded-xl border-4 font-display text-[0.6rem]"
                  style={{
                    background: `
                      linear-gradient(
                        180deg,
                        rgba(255, 255, 255, 0.55) 0%,
                        rgba(255, 255, 255, 0) 55%
                      ),
                      ${avatarBg}
                    `,
                    borderColor: '#000',
                    color: '#000',
                  }}
                >
                  {initials}
                </div>
                <span
                  className="absolute -bottom-1 -right-1 size-4 rounded-full border-2 border-black"
                  style={{
                    backgroundColor: isOnline ? '#7FB89B' : '#D8D0C0',
                  }}
                />
              </div>
              <div className="min-w-0">
                <p
                  className="truncate text-sm font-bold"
                  style={{ color: '#000' }}
                >
                  {isMe ? `${label} (you)` : label}
                </p>
                <p
                  className="text-xs font-semibold"
                  style={{
                    color: isOnline ? '#3A7A5E' : 'rgba(0,0,0,0.45)',
                  }}
                >
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