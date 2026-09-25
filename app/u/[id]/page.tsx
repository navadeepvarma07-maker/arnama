'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { displayLabel, initialsFor } from '@/lib/use-profile';

type ProfileRow = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_color: string;
  created_at: string;
};

type Photo = {
  id: string;
  url: string;
  caption: string | null;
  created_at: string;
};

type Wish = {
  id: string;
  content: string;
  created_at: string;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

function joinedLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function ProfilePage() {
  const params = useParams();
  const id = (params?.id as string) ?? '';

  const [myEmail, setMyEmail] = useState<string | null>(null);
  const [target, setTarget] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [stats, setStats] = useState({
    messages: 0,
    wishes: 0,
    photos: 0,
    tttWins: 0,
    rpsWins: 0,
  });

  const [recentPhotos, setRecentPhotos] = useState<Photo[]>([]);
  const [recentWishes, setRecentWishes] = useState<Wish[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setMyEmail(data.user?.email ?? null);
    });
  }, []);

  useEffect(() => {
    if (!id) return;

    async function load() {
      const { data: profileRow, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !profileRow) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const targetEmail = profileRow.email;
      setTarget(profileRow as ProfileRow);

      const [msgRes, wishRes, photoRes, tttRes, rpsRes, photoListRes, wishListRes] =
        await Promise.all([
          supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('user_email', targetEmail),
          supabase
            .from('wishes')
            .select('*', { count: 'exact', head: true })
            .eq('user_email', targetEmail),
          supabase
            .from('photos')
            .select('*', { count: 'exact', head: true })
            .eq('user_email', targetEmail),
          supabase
            .from('arcade_ttt')
            .select('winner, player_x_email, player_o_email')
            .eq('status', 'finished'),
          supabase
            .from('arcade_rps')
            .select('winner, player_a_email, player_b_email')
            .eq('status', 'finished'),
          supabase
            .from('photos')
            .select('id, url, caption, created_at')
            .eq('user_email', targetEmail)
            .order('created_at', { ascending: false })
            .limit(6),
          supabase
            .from('wishes')
            .select('id, content, created_at')
            .eq('user_email', targetEmail)
            .order('created_at', { ascending: false })
            .limit(3),
        ]);

      let tttWins = 0;
      (tttRes.data ?? []).forEach((g: any) => {
        if (g.winner === 'X' && g.player_x_email === targetEmail) tttWins++;
        if (g.winner === 'O' && g.player_o_email === targetEmail) tttWins++;
      });
      let rpsWins = 0;
      (rpsRes.data ?? []).forEach((g: any) => {
        if (g.winner === 'A' && g.player_a_email === targetEmail) rpsWins++;
        if (g.winner === 'B' && g.player_b_email === targetEmail) rpsWins++;
      });

      setStats({
        messages: msgRes.count ?? 0,
        wishes: wishRes.count ?? 0,
        photos: photoRes.count ?? 0,
        tttWins,
        rpsWins,
      });

      setRecentPhotos((photoListRes.data ?? []) as Photo[]);
      setRecentWishes((wishListRes.data ?? []) as Wish[]);

      setLoading(false);
    }

    load();
  }, [id]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#1a0b2e] flex items-center justify-center text-white font-mono">
        loading... 🐱
      </div>
    );
  }

  if (notFound || !target) {
    return (
      <div className="fixed inset-0 bg-[#1a0b2e] font-mono flex items-center justify-center p-4">
        <div
          className="border-4 border-black bg-[#FFFDF5] rounded-2xl text-center"
          style={{
            padding: '40px 24px',
            boxShadow: '8px 8px 0 0 black',
            maxWidth: 360,
          }}
        >
          <div style={{ fontSize: '44px', marginBottom: '10px' }}>👻</div>
          <p className="font-black" style={{ fontSize: '15px', color: '#000', margin: 0 }}>
            user not found
          </p>
          <Link
            href="/"
            className="inline-flex mt-4 border-2 border-black bg-[#E2F0D9] text-black font-black text-xs rounded-lg shadow-[3px_3px_0_0_black] hover:-translate-y-0.5 active:translate-y-0.5 transition"
            style={{ padding: '10px 18px', textDecoration: 'none' }}
          >
            ← back home
          </Link>
        </div>
      </div>
    );
  }

  const isMe = !!myEmail && myEmail === target.email;
  const label = displayLabel(target.email, target.display_name);
  const initials = initialsFor(target.email, target.display_name);
  const avatarBg = target.avatar_color || '#E2F0D9';
  const totalWins = stats.tttWins + stats.rpsWins;

  return (
    <div className="fixed inset-0 bg-[#1a0b2e] font-mono flex justify-center overflow-hidden">
      <div
        className="w-full max-w-3xl h-full flex flex-col p-3 sm:p-6 gap-3 sm:gap-4 overflow-y-auto"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between shrink-0 gap-2">
          <p
            className="font-black text-white/60 uppercase"
            style={{ fontSize: '10px', letterSpacing: '0.14em' }}
          >
            👤 profile
          </p>
          <Link
            href="/"
            className="inline-flex items-center border-4 border-black bg-[#E2F0D9] text-black font-black rounded-xl shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition shrink-0"
            style={{ padding: '8px 16px', gap: '8px' }}
          >
            <span className="text-base leading-none">←</span>
            <span className="text-sm leading-none hidden sm:inline">back</span>
          </Link>
        </div>

        {/* Hero */}
        <div
          className="border-4 border-black rounded-2xl shrink-0"
          style={{
            background: `
              linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
              rgba(230,230,250,0.92)
            `,
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            boxShadow: `8px 8px 0 0 black, inset 0 1px 0 rgba(255,255,255,0.7)`,
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div className="flex items-center gap-4">
            <div
              className="gloss-shine flex items-center justify-center rounded-full border-4 border-black font-display"
              style={{
                width: '72px',
                height: '72px',
                flexShrink: 0,
                background: `
                  linear-gradient(180deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.1) 55%, rgba(255,255,255,0) 100%),
                  ${avatarBg}
                `,
                color: '#000',
                fontSize: '22px',
                boxShadow: '4px 4px 0 0 black',
              }}
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="font-black truncate"
                style={{ fontSize: '18px', color: '#000', lineHeight: 1.1 }}
              >
                {label}
                {isMe && ' (you)'}
              </p>
              <p
                style={{
                  margin: '6px 0 0',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'rgba(0,0,0,0.5)',
                }}
              >
                arnama member 🐱
              </p>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: 'rgba(0,0,0,0.45)',
                }}
              >
                joined {joinedLabel(target.created_at)}
              </p>
            </div>
          </div>

          {!isMe && (
            <Link
              href={`/vault?thread=${target.id}`}
              className="border-2 border-black font-black text-xs rounded-lg hover:-translate-y-0.5 active:translate-y-0.5 transition inline-flex items-center justify-center"
              style={{
                padding: '11px 18px',
                background: `
                  linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
                  #E2F0D9
                `,
                color: '#000',
                boxShadow: '3px 3px 0 0 black',
                gap: '8px',
                textDecoration: 'none',
              }}
            >
              🔒 send a dm 🐾
            </Link>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: '10px' }}>
          <StatCard emoji="💬" label="messages" value={stats.messages} color="#E2F0D9" />
          <StatCard emoji="✨" label="wishes" value={stats.wishes} color="#E6E6FA" />
          <StatCard emoji="📸" label="photos" value={stats.photos} color="#FFD1DC" />
          <StatCard emoji="🏆" label="wins" value={totalWins} color="#FFF5BA" />
        </div>

        {/* Game wins */}
        {(stats.tttWins > 0 || stats.rpsWins > 0) && (
          <div
            className="border-4 border-black rounded-2xl shrink-0"
            style={{
              background: `
                linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
                rgba(255,245,186,0.9)
              `,
              boxShadow: '5px 5px 0 0 black',
              padding: '14px 16px',
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: '10px',
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'rgba(0,0,0,0.55)',
                marginBottom: '10px',
              }}
            >
              🎮 game wins
            </p>
            <div className="flex flex-wrap" style={{ gap: '8px' }}>
              {stats.tttWins > 0 && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    border: '2px solid black',
                    borderRadius: '999px',
                    background: '#FFFDF5',
                    boxShadow: '2px 2px 0 0 black',
                    fontSize: '12px',
                    fontWeight: 900,
                    color: '#000',
                  }}
                >
                  ⭕ {stats.tttWins} tic-tac-toe
                </span>
              )}
              {stats.rpsWins > 0 && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    border: '2px solid black',
                    borderRadius: '999px',
                    background: '#FFFDF5',
                    boxShadow: '2px 2px 0 0 black',
                    fontSize: '12px',
                    fontWeight: 900,
                    color: '#000',
                  }}
                >
                  ✌️ {stats.rpsWins} rps
                </span>
              )}
            </div>
          </div>
        )}

        {/* Recent photos */}
        {recentPhotos.length > 0 && (
          <div className="shrink-0">
            <p
              style={{
                margin: '0 0 12px',
                fontSize: '11px',
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: 'rgba(255,253,245,0.55)',
                paddingLeft: '8px',
              }}
            >
              📸 recent photos
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '10px',
              }}
            >
              {recentPhotos.map((p) => (
                <Link
                  key={p.id}
                  href="/photos"
                  style={{
                    aspectRatio: '1 / 1',
                    border: '3px solid black',
                    borderRadius: '14px',
                    overflow: 'hidden',
                    background: '#000',
                    boxShadow: '3px 3px 0 0 black',
                    display: 'block',
                    textDecoration: 'none',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={p.caption ?? ''}
                    referrerPolicy="no-referrer"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                    loading="lazy"
                  />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent wishes */}
        {recentWishes.length > 0 && (
          <div className="shrink-0 pb-4">
            <p
              style={{
                margin: '0 0 12px',
                fontSize: '11px',
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: 'rgba(255,253,245,0.55)',
                paddingLeft: '8px',
              }}
            >
              ✨ recent wishes
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {recentWishes.map((w) => (
                <div
                  key={w.id}
                  style={{
                    border: '3px solid black',
                    borderRadius: '16px',
                    background: `
                      linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
                      rgba(230,230,250,0.9)
                    `,
                    boxShadow: '3px 3px 0 0 black',
                    padding: '12px 14px',
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: '13px',
                      fontWeight: 700,
                      color: '#000',
                      lineHeight: 1.4,
                      wordBreak: 'break-word',
                    }}
                  >
                    {w.content}
                  </p>
                  <p
                    style={{
                      margin: '6px 0 0',
                      fontSize: '9px',
                      fontWeight: 800,
                      color: 'rgba(0,0,0,0.5)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    {timeAgo(w.created_at)} 🐾
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  emoji,
  label,
  value,
  color,
}: {
  emoji: string;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      style={{
        border: '4px solid black',
        borderRadius: '18px',
        background: `
          linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
          ${color}
        `,
        padding: '12px',
        boxShadow: `4px 4px 0 0 black, inset 0 1px 0 rgba(255,255,255,0.7)`,
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        minHeight: '88px',
      }}
    >
      <span style={{ fontSize: '18px', lineHeight: 1 }}>{emoji}</span>
      <p
        style={{
          margin: 0,
          fontSize: '9px',
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'rgba(0,0,0,0.5)',
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: 0,
          fontSize: '20px',
          fontWeight: 900,
          color: '#000',
          lineHeight: 1,
        }}
      >
        {value}
      </p>
    </div>
  );
}