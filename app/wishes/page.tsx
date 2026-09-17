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
  const angles = [-1.5, -0.8, 0, 0.8, 1.5];
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

/**
 * Fills parent, scrolls vertically, scrollbar is invisible everywhere.
 * Uses a scoped <style> tag so no global CSS is needed.
 */
function HiddenScroll({
  children,
  bottomPadding = 24,
  sidePadding = 14,
}: {
  children: React.ReactNode;
  bottomPadding?: number;
  sidePadding?: number;
}) {
  const idRef = useRef(
    `hs-${Math.random().toString(36).slice(2, 10)}`
  );
  const id = idRef.current;

  return (
    <>
      <style>{`
        #${id} {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        #${id}::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }
        #${id}::-webkit-scrollbar-track,
        #${id}::-webkit-scrollbar-thumb {
          display: none;
          background: transparent;
        }
      `}</style>
      <div
        id={id}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingTop: '4px',
          paddingLeft: `${sidePadding}px`,
          paddingRight: `${sidePadding}px`,
          paddingBottom: `${bottomPadding}px`,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {children}
      </div>
    </>
  );
}

export default function WishesPage() {
  const [email, setEmail] = useState<string | null>(null);
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
      if (!e) {
        window.location.href = '/login';
      } else {
        setLoading(false);
        supabase
          .from('wishes')
          .select('*', { count: 'exact', head: true })
          .eq('user_email', e)
          .then(({ count }) => {
            myWishCountRef.current = typeof count === 'number' ? count : 0;
          });
        supabase
          .from('profiles')
          .update({ last_seen_wishes_at: new Date().toISOString() })
          .eq('id', user!.id)
          .then(() => {});
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

  // ====================================
  // STANDARD WISH CARD
  // ====================================
  function WishCard({ w }: { w: Wish }) {
    const bg = colorFor(w.id);
    const tilt = tiltFor(w.id);
    const liked = myLikes.has(w.id);
    const count = likeCounts[w.id] ?? 0;
    const mine = w.user_email === email;

    return (
      <div
        className="border-4 border-black"
        style={{
          background: `
            linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
            ${bg}
          `,
          borderRadius: '18px',
          padding: '16px 18px',
          transform: `rotate(${tilt}deg)`,
          boxShadow: `
            4px 4px 0 0 black,
            inset 0 1px 0 rgba(255,255,255,0.7)
          `,
          position: 'relative',
        }}
      >
        <p
          style={{
            margin: 0,
            fontWeight: 700,
            color: '#000',
            fontSize: '14px',
            lineHeight: 1.5,
            paddingRight: mine ? '30px' : '0',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
        >
          {w.content}
        </p>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '12px',
          }}
        >
          <span
            style={{
              fontSize: '9px',
              color: 'rgba(0,0,0,0.5)',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {timeAgo(w.created_at)}
          </span>

          <button
            onClick={() => toggleLike(w.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 12px',
              border: '2px solid black',
              borderRadius: '999px',
              background: liked
                ? 'linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 55%), #FF8BA7'
                : 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFFDF5',
              boxShadow: '2px 2px 0 0 black',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: '12px', lineHeight: 1 }}>
              {liked ? '❤️' : '🤍'}
            </span>
            <span
              style={{ fontSize: '11px', fontWeight: 900, color: '#000' }}
            >
              {count}
            </span>
          </button>
        </div>

        {mine && (
          <button
            onClick={() => handleDelete(w)}
            aria-label="Delete wish"
            style={{
              position: 'absolute',
              top: '-8px',
              right: '-8px',
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              border: '2px solid black',
              background: '#FFFDF5',
              color: '#000',
              fontWeight: 900,
              fontSize: '11px',
              lineHeight: 1,
              boxShadow: '2px 2px 0 0 black',
              cursor: 'pointer',
              zIndex: 5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        )}
      </div>
    );
  }

  // ====================================
  // RANKED WISH CARD
  // ====================================
  function RankedWishCard({ w, rank }: { w: Wish; rank: number }) {
    const bg = colorFor(w.id);
    const liked = myLikes.has(w.id);
    const count = likeCounts[w.id] ?? 0;
    const mine = w.user_email === email;
    const isTop1 = rank === 1;

    return (
      <div
        className="border-4 border-black"
        style={{
          background: `
            linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
            ${bg}
          `,
          borderRadius: '18px',
          padding: isTop1 ? '18px 20px' : '14px 16px',
          boxShadow: isTop1
            ? `
              6px 6px 0 0 black,
              inset 0 1px 0 rgba(255,255,255,0.7)
            `
            : `
              4px 4px 0 0 black,
              inset 0 1px 0 rgba(255,255,255,0.7)
            `,
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            marginBottom: '12px',
          }}
        >
          <span
            className="gloss-shine"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              height: '28px',
              padding: isTop1 ? '0 14px' : '0 12px',
              borderRadius: '999px',
              border: '2px solid black',
              background: isTop1
                ? 'linear-gradient(180deg, #FFD700 0%, #FFA500 100%)'
                : 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFFDF5',
              boxShadow: '2px 2px 0 0 black',
              fontWeight: 900,
              fontSize: isTop1 ? '12px' : '11px',
              color: '#000',
              lineHeight: 1,
            }}
          >
            {isTop1 && <span style={{ fontSize: '13px' }}>👑</span>}
            <span>#{rank}</span>
          </span>

          <button
            onClick={() => toggleLike(w.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 12px',
              border: '2px solid black',
              borderRadius: '999px',
              background: liked
                ? 'linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 55%), #FF8BA7'
                : 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFFDF5',
              boxShadow: '2px 2px 0 0 black',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: '12px', lineHeight: 1 }}>
              {liked ? '❤️' : '🤍'}
            </span>
            <span
              style={{ fontSize: '11px', fontWeight: 900, color: '#000' }}
            >
              {count}
            </span>
          </button>
        </div>

        <p
          style={{
            margin: 0,
            fontWeight: 700,
            color: '#000',
            fontSize: isTop1 ? '15px' : '13.5px',
            lineHeight: 1.5,
            paddingRight: mine ? '30px' : '0',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
        >
          {w.content}
        </p>

        <div style={{ marginTop: '10px' }}>
          <span
            style={{
              fontSize: '9px',
              color: 'rgba(0,0,0,0.5)',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {timeAgo(w.created_at)}
          </span>
        </div>

        {mine && (
          <button
            onClick={() => handleDelete(w)}
            aria-label="Delete wish"
            style={{
              position: 'absolute',
              top: '-8px',
              right: '-8px',
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              border: '2px solid black',
              background: '#FFFDF5',
              color: '#000',
              fontWeight: 900,
              fontSize: '11px',
              lineHeight: 1,
              boxShadow: '2px 2px 0 0 black',
              cursor: 'pointer',
              zIndex: 5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        )}
      </div>
    );
  }

  // ====================================
  // SLIDE 1: WISHES
  // ====================================
  const wishesSlide = (
    <HiddenScroll bottomPadding={24} sidePadding={14}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <form
          onSubmit={handlePost}
          className="border-4 border-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col shrink-0"
          style={{
            background: `
              linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
              #E6E6FA
            `,
            padding: '14px',
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
              padding: '11px 14px',
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
              style={{ padding: '10px 16px', gap: '6px' }}
            >
              <span className="text-sm leading-none">
                {posting ? '···' : '✨'}
              </span>
              <span className="leading-none tracking-wider">
                {posting ? 'POSTING' : 'POST'}
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
            className="border-4 border-black bg-[#FFFDF5] rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-center shrink-0"
            style={{ padding: '40px 20px' }}
          >
            <p className="text-black font-bold text-sm">
              no wishes yet — drop the first one ✨
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {wishes.map((w) => (
              <WishCard key={w.id} w={w} />
            ))}
          </div>
        )}
      </div>
    </HiddenScroll>
  );

  // ====================================
  // SLIDE 2: LIKED
  // ====================================
  const likedWishes = wishes.filter((w) => myLikes.has(w.id));

  const likedSlide = (
    <HiddenScroll bottomPadding={24} sidePadding={14}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div
          className="border-4 border-black rounded-2xl shrink-0"
          style={{
            background: `
              linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
              rgba(255,209,220,0.92)
            `,
            padding: '14px',
            boxShadow: `
              4px 4px 0 0 black,
              inset 0 1px 0 rgba(255,255,255,0.7)
            `,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span
            className="gloss-shine"
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '999px',
              border: '4px solid black',
              background: `
                linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
                #FF8BA7
              `,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
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
                margin: '4px 0 0',
                fontSize: '20px',
                fontWeight: 900,
                color: '#000',
                lineHeight: 1,
              }}
            >
              {likedWishes.length}
              <span
                style={{
                  fontSize: '12px',
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
            style={{ padding: '40px 20px', boxShadow: '4px 4px 0 0 black' }}
          >
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>🤍</div>
            <p
              className="text-black font-bold"
              style={{ fontSize: '13px', margin: 0 }}
            >
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
            {likedWishes.map((w) => (
              <WishCard key={w.id} w={w} />
            ))}
          </div>
        )}
      </div>
    </HiddenScroll>
  );

  // ====================================
  // SLIDE 3: TOP
  // ====================================
  const rankedWishes = [...wishes]
    .map((w) => ({ wish: w, likes: likeCounts[w.id] ?? 0 }))
    .filter((x) => x.likes > 0)
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 20);

  const topSlide = (
    <HiddenScroll bottomPadding={24} sidePadding={14}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div
          className="border-4 border-black rounded-2xl shrink-0"
          style={{
            background: `
              linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
              rgba(255,245,186,0.92)
            `,
            padding: '14px',
            boxShadow: `
              4px 4px 0 0 black,
              inset 0 1px 0 rgba(255,255,255,0.7)
            `,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span
            className="gloss-shine"
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '999px',
              border: '4px solid black',
              background: `linear-gradient(180deg, #FFD700 0%, #FFA500 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
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
                margin: '4px 0 0',
                fontSize: '11px',
                fontWeight: 800,
                color: 'rgba(0,0,0,0.55)',
                lineHeight: 1.3,
              }}
            >
              the most-loved wishes of all time
            </p>
          </div>
        </div>

        {rankedWishes.length === 0 ? (
          <div
            className="border-4 border-black bg-[#FFFDF5] rounded-2xl text-center"
            style={{ padding: '40px 20px', boxShadow: '4px 4px 0 0 black' }}
          >
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>👑</div>
            <p
              className="text-black font-bold"
              style={{ fontSize: '13px', margin: 0 }}
            >
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {rankedWishes.map((item, index) => (
              <RankedWishCard
                key={item.wish.id}
                w={item.wish}
                rank={index + 1}
              />
            ))}
          </div>
        )}
      </div>
    </HiddenScroll>
  );

  return (
    <div className="fixed inset-0 bg-[#1a0b2e] font-mono flex flex-col overflow-hidden">
      <div
        className="mx-auto flex w-full max-w-3xl flex-1 min-h-0 flex-col gap-2 sm:gap-4"
        style={{
          paddingTop: 'max(8px, env(safe-area-inset-top))',
          paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
          paddingLeft: 'max(8px, env(safe-area-inset-left))',
          paddingRight: 'max(8px, env(safe-area-inset-right))',
        }}
      >
        <div className="flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="gloss-shine flex size-10 shrink-0 items-center justify-center rounded-2xl border-4 border-black"
              style={{
                background: `
                  linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
                  #E6E6FA
                `,
                fontSize: '18px',
              }}
            >
              ✨
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-black text-lg leading-tight text-white">
                wishes
              </h1>
              <p className="text-[10px] font-bold leading-tight text-white/60 truncate">
                anonymous · {wishes.length} wish
                {wishes.length === 1 ? '' : 'es'}
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex items-center justify-center border-4 border-black bg-[#E2F0D9] text-black font-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition shrink-0"
            style={{
              padding: '8px 12px',
              fontSize: '14px',
              minWidth: '44px',
              minHeight: '44px',
            }}
          >
            ←
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