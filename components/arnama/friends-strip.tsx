'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { displayLabel, initialsFor } from '@/lib/use-profile';
import { todayStr } from '@/lib/vibe';
import { useStories } from './story-context';
import { StoryRing } from './story-ring';

type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_color: string;
  created_at: string;
};

type Vibe = {
  user_email: string;
  emoji: string;
  text: string | null;
};

const FALLBACK_AVATAR = ['#E2F0D9', '#FFD1DC', '#E6E6FA', '#FFF5BA', '#D4F0F0'];

export function FriendsStrip() {
  const { hasStory, allViewedByMe, openViewer } = useStories();

  const [myId, setMyId] = useState<string | null>(null);
  const [myEmail, setMyEmail] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [vibes, setVibes] = useState<Record<string, Vibe>>({});
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

  // Load today's vibes
  useEffect(() => {
    const today = todayStr();
    async function load() {
      const { data, error } = await supabase
        .from('vibe_checks')
        .select('user_email, emoji, text')
        .eq('date', today);
      if (error) return;
      const map: Record<string, Vibe> = {};
      (data ?? []).forEach((v: any) => {
        map[v.user_email] = v;
      });
      setVibes(map);
    }
    load();

    const ch = supabase
      .channel('crew-vibes-strip')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vibe_checks' },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  // Presence
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

  const cardStyle: React.CSSProperties = {
    background: `
      linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
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
        <h2 className="font-display text-[0.7rem] mb-3" style={{ color: '#000' }}>
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
            background: `linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 100%), rgba(255, 253, 245, 0.9)`,
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
          const avatarBg = p.avatar_color || FALLBACK_AVATAR[idx % FALLBACK_AVATAR.length];
          const vibe = vibes[p.email];
          const story = hasStory(p.id);
          const viewed = allViewedByMe(p.id);

          return (
            <li key={p.id}>
              <Link
                href={`/u/${p.id}`}
                className="flex items-center gap-3 hover:-translate-y-0.5 active:translate-y-0.5 transition-transform"
                style={{ textDecoration: 'none' }}
              >
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button
                    onClick={(e) => {
                      if (story) {
                        e.preventDefault();
                        e.stopPropagation();
                        openViewer(p.id);
                      }
                    }}
                    aria-label={story ? 'view story' : ''}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: story ? 'pointer' : 'default',
                      padding: 0,
                      display: 'block',
                    }}
                  >
                    <StoryRing hasStory={story} seen={viewed} size={48}>
                      <div
                        className="gloss-shine flex items-center justify-center font-display"
                        style={{
                          width: '100%',
                          height: '100%',
                          borderRadius: '999px',
                          border: '3px solid #000',
                          background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), ${avatarBg}`,
                          color: '#000',
                          fontSize: '11px',
                        }}
                      >
                        {initials}
                      </div>
                    </StoryRing>
                  </button>

                  {/* Vibe sticker — only when no story ring */}
                  {vibe && (
                    <span
                      title={vibe.text ?? ''}
                      style={{
                        position: 'absolute',
                        top: '-6px',
                        right: '-6px',
                        width: '20px',
                        height: '20px',
                        borderRadius: '999px',
                        border: '2px solid black',
                        background: '#FFFDF5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '11px',
                        lineHeight: 1,
                        boxShadow: '1.5px 1.5px 0 0 black',
                        zIndex: 3,
                      }}
                    >
                      {vibe.emoji}
                    </span>
                  )}

                  {/* Online dot */}
                  <span
                    className="absolute"
                    style={{
                      bottom: '-2px',
                      right: '-2px',
                      width: '14px',
                      height: '14px',
                      borderRadius: '999px',
                      border: '2px solid black',
                      backgroundColor: isOnline ? '#7FB89B' : '#D8D0C0',
                      zIndex: 3,
                    }}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm font-bold"
                    style={{ color: '#000' }}
                  >
                    {isMe ? `${label} (you)` : label}
                  </p>
                  <p
                    className="truncate text-xs font-semibold"
                    style={{
                      color: vibe?.text
                        ? '#7A4A9E'
                        : isOnline
                        ? '#3A7A5E'
                        : 'rgba(0,0,0,0.45)',
                      fontStyle: vibe?.text ? 'italic' : 'normal',
                    }}
                  >
                    {vibe?.text
                      ? `"${vibe.text}"`
                      : isOnline
                      ? 'in the portal'
                      : 'away'}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}