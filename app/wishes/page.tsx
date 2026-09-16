'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { SwipeCarousel } from '@/components/arnama/swipe-carousel';
import { fireConfetti } from '@/lib/confetti';

type Wish = {
  id: string;
  user_email: string;
  content: string;
  created_at: string;
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

export default function WishesPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [tabIndex, setTabIndex] = useState(0);

  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const myWishCountRef = useRef<number | null>(null);

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
          .from('wishes')
          .select('*', { count: 'exact', head: true })
          .eq('user_email', e)
          .then(({ count }) => {
            myWishCountRef.current =
              typeof count === 'number' ? count : 0;
          });
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
      if (myWishCountRef.current === 0) {
        myWishCountRef.current = 1;
        fireConfetti({ count: 90 });
      } else if (myWishCountRef.current !== null) {
        myWishCountRef.current += 1;
      }
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
      <div className="fixed inset-0 bg-[#1a0b2e] flex items-center justify-center text-white font-mono">
        loading...
      </div>
    );
  }

  function renderWishCard(
    w: Wish,
    opts: { showRank?: number; isTopOne?: boolean } = {}
  ) {
    const bg = colorFor(w.id);
    const tilt = opts.isTopOne ? 0 : tiltFor(w.id);
    const liked = myLikes.has(w.id);
    const count = likeCounts[w.id] ?? 0;
    const mine = w.user_email === email;

    return (
      <div
        key={w.id}
        className="border-4 border-black"
        style={{
          background: `
            linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
            ${bg}
          `,
          padding: opts.isTopOne ? '22px 24px' : '16px 18px',
          transform: `rotate(${tilt}deg)`,
          boxShadow: opts.isTopOne
            ? `
              8px 8px 0 0 black,
              inset 0 1px 0 rgba(255,255,255,0.7)
            `
            : `
              5px 5px 0 0 black,
              inset 0 1px 0 rgba(255,255,255,0.7)
            `,
          position: 'relative',
        }}
      >
        {typeof opts.showRank === 'number' && opts.showRank > 0 && (
          <span
            className="gloss-shine"
            style={{
              position: 'absolute',
              top: '-12px',
              left: '-12px',
              width: '34px',
              height: '34px',
              borderRadius: '999px',
              border: '3px solid black',
              background:
                opts.showRank === 1
                  ? 'linear-gradient(180deg, #FFD700 0%, #FFA500 100%)'
                  : 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFFDF5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '13px',
              color: '#000',
              boxShadow: '3px 3px 0 0 black',
              zIndex: 2,
            }}
          >
            {opts.showRank}
          </span>
        )}

        <p
          className="font-bold whitespace-pre-wrap break-words"
          style={{
            color: '#000',
            fontSize: opts.isTopOne ? '15px' : '14px',
            lineHeight: 1.5,
            paddingRight: mine ? '32px' : '0',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {w.content}
        </p>

        <div
          className="flex items-center justify-between"
          style={{
            marginTop: opts.isTopOne ? '16px' : '12px',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <span
            className="font-bold uppercase tracking-wider"
            style={{ fontSize: '9px', color: 'rgba(0,0,0,0.5)' }}
          >
            {timeAgo(w.created_at)}
          </span>

          <button
            onClick={() => toggleLike(w.id)}
            className="inline-flex items-center border-2 border-black rounded-full transition hover:-translate-y-0.5 active:translate-y-0.5"
            style={{
              padding: '5px 12px',
              gap: '6px',
              background: liked
                ? 'linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 55%), #FF8BA7'
                : 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFFDF5',
              boxShadow: '2px 2px 0px 0px rgba(0,0,0,1)',
            }}
          >
            <span style={{ fontSize: '12px', lineHeight: 1 }}>
              {liked ? '❤️' : '🤍'}
            </span>
            <span className="font-black" style={{ fontSize: '11px', color: '#000' }}>
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
  }

  const wishesSlide = (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: '0 4px 16px',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <form
          onSubmit={handlePost}
          className="border-4 border-black rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col shrink-0"
          style={{
            background: `
              linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
              #E6E6FA
            `,
            padding: '16px',
            gap: '10px',
          }}
        >
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="drop a wish, a confession, a thought..."
            maxLength={280}
            disabled={posting}
            rows={3}
            style={{
              width: '100%',
              border: '2px solid black',
              borderRadius: '14px',
              backgroundColor: 'white',
              color: '#000',
              fontSize: '14px',
              padding: '11px 16px',
              outline: 'none',
              opacity: posting ? 0.5 : 1,
              fontFamily: 'inherit',
              resize: 'none',
              fontWeight: 600,
            }}
          />
          <div className="flex items-center justify-between">
            <span
              className="font-bold"
              style={{ fontSize: '10px', color: 'rgba(0,0,0,0.5)' }}
            >
              {content.length} / 280 · anonymous
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

        {wishes.length === 0 ? (
          <div
            className="border-4 border-black bg-[#FFFDF5] rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] text-center shrink-0"
            style={{ padding: '40px 20px' }}
          >
            <p className="text-black font-bold text-sm">
              no wishes yet — drop the first one ✨
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {wishes.map((w) => renderWishCard(w))}
          </div>
        )}
      </div>
    </div>
  );

  const likedWishes = wishes.filter((w) => myLikes.has(w.id));

  const likedSlide = (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: '0 4px 16px',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div
          className="border-4 border-black rounded-2xl shrink-0"
          style={{
            background: `
              linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
              rgba(255,209,220,0.92)
            `,
            backdropFilter: 'blur(14px) saturate(160%)',
            WebkitBackdropFilter: 'blur(14px) saturate(160%)',
            padding: '16px',
            boxShadow: `
              6px 6px 0 0 black,
              inset 0 1px 0 rgba(255,255,255,0.7)
            `,
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          <span
            className="gloss-shine"
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '999px',
              border: '4px solid black',
              background: `
                linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
                #FF8BA7
              `,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              boxShadow: '3px 3px 0 0 black',
              flexShrink: 0,
            }}
          >
            ❤️
          </span>
          <div>
            <p
              style={{
                margin: 0,
                fontSize: '11px',
                fontWeight: 900,
                color: '#000',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              your hearts
            </p>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: '22px',
                fontWeight: 900,
                color: '#000',
                lineHeight: 1,
              }}
            >
              {likedWishes.length}
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 800,
                  color: 'rgba(0,0,0,0.5)',
                  marginLeft: '6px',
                }}
              >
                wish{likedWishes.length === 1 ? '' : 'es'}
              </span>
            </p>
          </div>
        </div>

        {likedWishes.length === 0 ? (
          <div
            className="border-4 border-black bg-[#FFFDF5] rounded-2xl text-center"
            style={{ padding: '40px 20px', boxShadow: '6px 6px 0 0 black' }}
          >
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>🤍</div>
            <p className="text-black font-bold" style={{ fontSize: '13px', margin: 0 }}>
              nothing liked yet
            </p>
            <p
              className="text-black/50 font-bold"
              style={{ fontSize: '11px', marginTop: '8px' }}
            >
              tap ❤️ on wishes you love
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {likedWishes.map((w) => renderWishCard(w))}
          </div>
        )}
      </div>
    </div>
  );

  const rankedWishes = [...wishes]
    .map((w) => ({ wish: w, likes: likeCounts[w.id] ?? 0 }))
    .filter((x) => x.likes > 0)
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 20);

  const topSlide = (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: '0 4px 16px',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div
          className="border-4 border-black rounded-2xl shrink-0"
          style={{
            background: `
              linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
              rgba(255,245,186,0.92)
            `,
            backdropFilter: 'blur(14px) saturate(160%)',
            WebkitBackdropFilter: 'blur(14px) saturate(160%)',
            padding: '16px',
            boxShadow: `
              6px 6px 0 0 black,
              inset 0 1px 0 rgba(255,255,255,0.7)
            `,
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          <span
            className="gloss-shine"
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '999px',
              border: '4px solid black',
              background: `linear-gradient(180deg, #FFD700 0%, #FFA500 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              boxShadow: '3px 3px 0 0 black',
              flexShrink: 0,
            }}
          >
            🏆
          </span>
          <div>
            <p
              style={{
                margin: 0,
                fontSize: '11px',
                fontWeight: 900,
                color: '#000',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              hall of fame
            </p>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: '13px',
                fontWeight: 800,
                color: 'rgba(0,0,0,0.55)',
                lineHeight: 1.2,
              }}
            >
              the most-loved wishes of all time
            </p>
          </div>
        </div>

        {rankedWishes.length === 0 ? (
          <div
            className="border-4 border-black bg-[#FFFDF5] rounded-2xl text-center"
            style={{ padding: '40px 20px', boxShadow: '6px 6px 0 0 black' }}
          >
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>👑</div>
            <p className="text-black font-bold" style={{ fontSize: '13px', margin: 0 }}>
              no liked wishes yet
            </p>
            <p
              className="text-black/50 font-bold"
              style={{ fontSize: '11px', marginTop: '8px' }}
            >
              the top wish shows here once hearts arrive
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {rankedWishes.map((item, index) =>
              renderWishCard(item.wish, {
                showRank: index + 1,
                isTopOne: index === 0,
              })
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-[#1a0b2e] font-mono flex justify-center overflow-hidden">
      <div
        className="w-full max-w-3xl h-full flex flex-col p-3 sm:p-6 gap-3 sm:gap-4"
        style={{ minHeight: 0 }}
      >
        <div className="flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="gloss-shine flex size-10 sm:size-12 shrink-0 items-center justify-center rounded-2xl border-4 border-black"
              style={{
                background: `
                  linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
                  #E6E6FA
                `,
                fontSize: '20px',
              }}
            >
              ✨
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-black text-lg sm:text-2xl leading-tight text-white">
                wishes
              </h1>
              <p className="text-[10px] sm:text-xs font-bold leading-tight text-white/60">
                anonymous · {wishes.length} wish
                {wishes.length === 1 ? '' : 'es'}
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex items-center border-4 border-black bg-[#E2F0D9] text-black font-black rounded-xl shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition shrink-0"
            style={{ padding: '8px 16px', gap: '8px' }}
          >
            <span className="text-base leading-none">←</span>
            <span className="text-sm leading-none hidden sm:inline">back</span>
          </Link>
        </div>

        <SwipeCarousel
          mode="fill"
          index={tabIndex}
          onIndexChange={setTabIndex}
          labels={[
            '✨ wishes',
            `❤️ liked${likedWishes.length > 0 ? ` · ${likedWishes.length}` : ''}`,
            '🏆 top',
          ]}
          slides={[wishesSlide, likedSlide, topSlide]}
        />
      </div>
    </div>
  );
}