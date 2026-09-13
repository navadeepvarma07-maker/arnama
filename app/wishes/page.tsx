'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Wish = {
  id: string;
  user_email: string;
  content: string;
  created_at: string;
};

type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_color: string;
};

const CARD_COLORS = ['#FFD1DC', '#E2F0D9', '#E6E6FA', '#FFF5BA', '#D4F0F0'];

function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 17 + id.charCodeAt(i)) | 0;
  return CARD_COLORS[Math.abs(hash) % CARD_COLORS.length];
}

function tiltFor(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const angles = [-2, -1, 0, 1, 2];
  return angles[Math.abs(hash) % angles.length];
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
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

function labelFor(email: string, profiles: Record<string, Profile>): string {
  const p = profiles[email];
  if (p?.display_name?.trim()) return p.display_name.trim();
  return email.split('@')[0];
}

export default function WishesPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, Profile>>({});
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  // Auth + mark caught-up
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      const e = user?.email ?? null;
      setEmail(e);
      setUserId(user?.id ?? null);
      if (!e) {
        window.location.href = '/login';
      } else {
        setLoading(false);
        supabase
          .from('profiles')
          .update({ last_seen_wishes_at: new Date().toISOString() })
          .eq('id', user!.id)
          .then(({ error }) => {
            if (error) console.error('last_seen_wishes update failed:', error);
          });
      }
    });
  }, []);

  // Load all profiles (for name lookup)
  useEffect(() => {
    if (!email) return;
    supabase
      .from('profiles')
      .select('id, email, display_name, avatar_color')
      .then(({ data, error }) => {
        if (error) console.error(error);
        else {
          const map: Record<string, Profile> = {};
          (data ?? []).forEach((p: any) => {
            map[p.email] = p as Profile;
          });
          setProfilesMap(map);
        }
      });
  }, [email]);

  // Load wishes
  useEffect(() => {
    if (!email) return;
    supabase
      .from('wishes')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error(error);
        else setWishes(data ?? []);
      });
  }, [email]);

  // Load likes
  useEffect(() => {
    if (!email) return;
    supabase
      .from('wish_likes')
      .select('wish_id, user_email')
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          return;
        }
        const counts: Record<string, number> = {};
        const mine = new Set<string>();
        (data ?? []).forEach((row: any) => {
          counts[row.wish_id] = (counts[row.wish_id] ?? 0) + 1;
          if (row.user_email === email) mine.add(row.wish_id);
        });
        setLikeCounts(counts);
        setMyLikes(mine);
      });
  }, [email]);

  // Realtime
  useEffect(() => {
    if (!email) return;
    const channel = supabase
      .channel('wishes-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wishes' },
        (payload) => {
          const w = payload.new as Wish;
          setWishes((prev) => {
            if (prev.some((x) => x.id === w.id)) return prev;
            return [w, ...prev];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'wishes' },
        (payload) => {
          const w = payload.old as { id: string };
          setWishes((prev) => prev.filter((x) => x.id !== w.id));
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wish_likes' },
        (payload) => {
          const l = payload.new as { wish_id: string; user_email: string };
          if (l.user_email === email) return;
          setLikeCounts((prev) => ({
            ...prev,
            [l.wish_id]: (prev[l.wish_id] ?? 0) + 1,
          }));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'wish_likes' },
        (payload) => {
          const l = payload.old as { wish_id: string; user_email: string };
          if (l.user_email === email) return;
          setLikeCounts((prev) => ({
            ...prev,
            [l.wish_id]: Math.max(0, (prev[l.wish_id] ?? 1) - 1),
          }));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [email]);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const text = content.trim();
    if (!text || !email) return;
    if (text.length > 280) {
      setError('⚠️ Max 280 characters');
      return;
    }
    setPosting(true);
    const { data, error } = await supabase
      .from('wishes')
      .insert({ user_email: email, content: text })
      .select()
      .single();
    if (error) setError('⚠️ ' + error.message);
    else if (data) {
      setWishes((prev) => {
        if (prev.some((x) => x.id === (data as Wish).id)) return prev;
        return [data as Wish, ...prev];
      });
      setContent('');
    }
    setPosting(false);
  }

  async function handleDelete(w: Wish) {
    if (!confirm('Delete this wish?')) return;
    const { error } = await supabase.from('wishes').delete().eq('id', w.id);
    if (!error) setWishes((prev) => prev.filter((x) => x.id !== w.id));
  }

  async function toggleLike(wishId: string) {
    if (!email) return;
    const alreadyLiked = myLikes.has(wishId);
    if (alreadyLiked) {
      setMyLikes((prev) => {
        const next = new Set(prev);
        next.delete(wishId);
        return next;
      });
      setLikeCounts((prev) => ({
        ...prev,
        [wishId]: Math.max(0, (prev[wishId] ?? 1) - 1),
      }));
      const { error } = await supabase
        .from('wish_likes')
        .delete()
        .eq('wish_id', wishId)
        .eq('user_email', email);
      if (error) console.error(error);
    } else {
      setMyLikes((prev) => new Set(prev).add(wishId));
      setLikeCounts((prev) => ({
        ...prev,
        [wishId]: (prev[wishId] ?? 0) + 1,
      }));
      const { error } = await supabase
        .from('wish_likes')
        .insert({ wish_id: wishId, user_email: email });
      if (error) console.error(error);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a0b2e] flex items-center justify-center text-white font-mono">
        loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a0b2e] p-4 sm:p-6 font-mono flex flex-col">
      <div className="w-full max-w-2xl mx-auto flex flex-col gap-4">

        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <h1 className="text-xl sm:text-2xl font-black text-white">
            ✨ wishes
          </h1>
          <Link
            href="/"
            className="inline-flex items-center border-4 border-black bg-[#E2F0D9] text-black font-black rounded-xl shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:shadow-[7px_7px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition"
            style={{ padding: '10px 20px', gap: '10px' }}
          >
            <span className="text-base leading-none">←</span>
            <span className="text-sm leading-none">back</span>
          </Link>
        </div>

        {/* Composer */}
        <form
          onSubmit={handlePost}
          className="border-4 border-black bg-[#E6E6FA] rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col"
          style={{ padding: '16px', gap: '10px' }}
        >
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="drop a wish, a confession, a thought..."
            maxLength={280}
            disabled={posting}
            rows={3}
            className="w-full border-2 border-black rounded-lg bg-white text-black text-sm focus:outline-none disabled:opacity-50 resize-none"
            style={{ padding: '11px 16px', fontFamily: 'inherit' }}
          />
          <div className="flex items-center justify-between">
            <span
              className="font-bold"
              style={{ fontSize: '10px', color: 'rgba(0,0,0,0.5)' }}
            >
              {content.length} / 280 · signed
            </span>
            <button
              type="submit"
              disabled={posting || !content.trim()}
              className="inline-flex items-center justify-center border-2 border-black bg-[#E2F0D9] text-black text-xs font-black rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition disabled:opacity-50 disabled:hover:translate-y-0"
              style={{ padding: '10px 18px', gap: '8px' }}
            >
              <span className="text-sm leading-none">
                {posting ? '···' : '✨'}
              </span>
              <span className="leading-none tracking-wider">
                {posting ? 'POSTING' : 'POST WISH'}
              </span>
            </button>
          </div>
          {error && (
            <div
              className="border-2 border-black bg-white text-black text-sm font-bold rounded-lg"
              style={{ padding: '10px 14px' }}
            >
              {error}
            </div>
          )}
        </form>

        {/* Wishes list */}
        {wishes.length === 0 ? (
          <div
            className="border-4 border-black bg-[#FFFDF5] rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] text-center"
            style={{ padding: '40px 20px' }}
          >
            <p className="text-black font-bold text-sm">
              no wishes yet — drop the first one ✨
            </p>
          </div>
        ) : (
          <div className="flex flex-col" style={{ gap: '12px' }}>
            {wishes.map((w) => {
              const bg = colorFor(w.id);
              const tilt = tiltFor(w.id);
              const liked = myLikes.has(w.id);
              const count = likeCounts[w.id] ?? 0;
              const mine = w.user_email === email;
              const posterName = labelFor(w.user_email, profilesMap);
              const posterProfile = profilesMap[w.user_email];
              const avatarColor = posterProfile?.avatar_color ?? '#FFFDF5';
              const initials = posterName.slice(0, 2).toUpperCase();

              return (
                <div
                  key={w.id}
                  className="border-4 border-black shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] relative"
                  style={{
                    backgroundColor: bg,
                    padding: '16px 18px',
                    transform: `rotate(${tilt}deg)`,
                  }}
                >
                  {/* Poster row */}
                  <div
                    className="flex items-center"
                    style={{ gap: '8px', marginBottom: '10px' }}
                  >
                    <div
                      className="flex items-center justify-center border-2 border-black font-black shrink-0"
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '8px',
                        backgroundColor: avatarColor,
                        fontSize: '10px',
                        color: '#000',
                      }}
                    >
                      {initials}
                    </div>
                    <span
                      className="font-black truncate flex-1"
                      style={{ fontSize: '12px', color: '#000' }}
                    >
                      {mine ? `${posterName} (you)` : posterName}
                    </span>
                    <span
                      className="font-bold uppercase tracking-wider shrink-0"
                      style={{
                        fontSize: '9px',
                        color: 'rgba(0,0,0,0.5)',
                      }}
                    >
                      {timeAgo(w.created_at)}
                    </span>
                  </div>

                  <p
                    className="font-bold whitespace-pre-wrap break-words"
                    style={{
                      color: '#000',
                      fontSize: '14px',
                      lineHeight: 1.45,
                      paddingRight: mine ? '32px' : '0',
                    }}
                  >
                    {w.content}
                  </p>

                  <div
                    className="flex items-center justify-end"
                    style={{ marginTop: '12px' }}
                  >
                    <button
                      onClick={() => toggleLike(w.id)}
                      className="inline-flex items-center border-2 border-black rounded-full transition hover:-translate-y-0.5 active:translate-y-0.5"
                      style={{
                        padding: '5px 12px',
                        gap: '6px',
                        backgroundColor: liked ? '#FF8BA7' : '#FFFDF5',
                        boxShadow: '2px 2px 0px 0px rgba(0,0,0,1)',
                      }}
                    >
                      <span style={{ fontSize: '12px', lineHeight: 1 }}>
                        {liked ? '❤️' : '🤍'}
                      </span>
                      <span
                        className="font-black"
                        style={{ fontSize: '11px', color: '#000' }}
                      >
                        {count}
                      </span>
                    </button>
                  </div>

                  {mine && (
                    <button
                      onClick={() => handleDelete(w)}
                      className="absolute border-2 border-black bg-[#FFFDF5] text-black font-black hover:-translate-y-0.5 active:translate-y-0.5 transition"
                      style={{
                        top: '-10px',
                        right: '-10px',
                        width: '26px',
                        height: '26px',
                        borderRadius: '50%',
                        fontSize: '11px',
                        lineHeight: 1,
                        boxShadow: '2px 2px 0px 0px rgba(0,0,0,1)',
                        zIndex: 5,
                      }}
                      aria-label="Delete wish"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}