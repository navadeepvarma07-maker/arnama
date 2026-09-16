'use client';

import { useEffect, useState } from 'react';
import { Coins, Star, Zap, LogIn, X, Check } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { VIBE_EMOJIS, todayStr } from '@/lib/vibe';

type Vibe = {
  id: string;
  user_id: string;
  user_email: string;
  emoji: string;
  text: string | null;
  date: string;
};

export function PlayerCard() {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [joinedAt, setJoinedAt] = useState<string | null>(null);
  const [coinCount, setCoinCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // vibe state
  const [vibe, setVibe] = useState<Vibe | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);
  const [vibeText, setVibeText] = useState('');
  const [savingVibe, setSavingVibe] = useState(false);

  const today = todayStr();

  // auth + message count
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);
      setEmail(user.email ?? null);
      setJoinedAt(user.created_at ?? null);

      if (user.email) {
        supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('user_email', user.email)
          .then(({ count }) => {
            const n =
              typeof count === 'number' && Number.isFinite(count) ? count : 0;
            setCoinCount(n);
            setLoading(false);
          });
      } else {
        setLoading(false);
      }
    });
  }, []);

  // load today's vibe
  useEffect(() => {
    if (!email) return;
    function load() {
      supabase
        .from('vibe_checks')
        .select('*')
        .eq('user_email', email)
        .eq('date', today)
        .maybeSingle()
        .then(({ data }) => {
          setVibe(data as Vibe | null);
        });
    }
    load();

    const ch = supabase
      .channel('my-vibe-self')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vibe_checks' },
        (payload: any) => {
          const row = payload.new ?? payload.old;
          if (row?.user_email === email && row?.date === today) load();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [email, today]);

  function openPicker() {
    setSelectedEmoji(vibe?.emoji ?? null);
    setVibeText(vibe?.text ?? '');
    setPickerOpen(true);
  }

  async function saveVibe() {
    if (!userId || !email || !selectedEmoji) return;
    setSavingVibe(true);
    const cleanText = vibeText.trim().slice(0, 60) || null;

    try {
      if (vibe) {
        const { error } = await supabase
          .from('vibe_checks')
          .update({
            emoji: selectedEmoji,
            text: cleanText,
            updated_at: new Date().toISOString(),
          })
          .eq('id', vibe.id);
        if (error) alert('⚠️ ' + error.message);
      } else {
        const { error } = await supabase.from('vibe_checks').insert({
          user_id: userId,
          user_email: email,
          emoji: selectedEmoji,
          text: cleanText,
          date: today,
        });
        if (error) alert('⚠️ ' + error.message);
      }
    } finally {
      setSavingVibe(false);
      setPickerOpen(false);
    }
  }

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
        <p className="text-sm font-bold" style={{ color: 'rgba(0,0,0,0.5)' }}>
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
  const safeCount = Number.isFinite(coinCount) && coinCount > 0 ? coinCount : 0;
  const xpPercent = Math.max(0, Math.min(100, safeCount));
  const xpDisplay = `${safeCount} / ${xpGoal}`;

  return (
    <>
      <div className="rounded-3xl border-4 p-5" style={cardStyle}>
        <div className="flex items-center gap-4">
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
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[0.7rem]" style={{ color: '#000' }}>
              {displayName}
            </p>
            <p className="mt-1 text-sm font-bold" style={{ color: 'rgba(0,0,0,0.55)' }}>
              arnama member
            </p>
          </div>
        </div>

        {/* VIBE ROW */}
        <div
          className="mt-4"
          style={{
            border: '2px solid black',
            borderRadius: '14px',
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: vibe
              ? `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFF5BA`
              : `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFFDF5`,
            boxShadow: '2px 2px 0 0 black',
          }}
        >
          {vibe ? (
            <>
              <span style={{ fontSize: '22px', lineHeight: 1, flexShrink: 0 }}>
                {vibe.emoji}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
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
                  today's vibe
                </p>
                <p
                  style={{
                    margin: '2px 0 0',
                    fontSize: '12px',
                    fontWeight: 800,
                    color: '#000',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontStyle: vibe.text ? 'normal' : 'italic',
                  }}
                >
                  {vibe.text || 'no words needed'}
                </p>
              </div>
              <button
                onClick={openPicker}
                style={{
                  padding: '5px 10px',
                  border: '2px solid black',
                  borderRadius: '999px',
                  background: '#FFFDF5',
                  color: '#000',
                  fontWeight: 900,
                  fontSize: '10px',
                  cursor: 'pointer',
                  boxShadow: '2px 2px 0 0 black',
                  flexShrink: 0,
                }}
              >
                ✏️ edit
              </button>
            </>
          ) : (
            <>
              <span style={{ fontSize: '22px', lineHeight: 1, flexShrink: 0 }}>
                ✨
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: '11px',
                    fontWeight: 800,
                    color: '#000',
                  }}
                >
                  how are you feeling?
                </p>
                <p
                  style={{
                    margin: '2px 0 0',
                    fontSize: '9px',
                    fontWeight: 700,
                    color: 'rgba(0,0,0,0.5)',
                  }}
                >
                  drop your daily vibe
                </p>
              </div>
              <button
                onClick={openPicker}
                style={{
                  padding: '5px 12px',
                  border: '2px solid black',
                  borderRadius: '999px',
                  background: `
                    linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
                    #FFD1DC
                  `,
                  color: '#000',
                  fontWeight: 900,
                  fontSize: '10px',
                  cursor: 'pointer',
                  boxShadow: '2px 2px 0 0 black',
                  flexShrink: 0,
                }}
              >
                + check in
              </button>
            </>
          )}
        </div>

        {/* XP */}
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
          <div
            className="h-4 w-full rounded-full border-4 border-black overflow-hidden"
            style={{
              position: 'relative',
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
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                width: `${xpPercent}%`,
                background: `
                  linear-gradient(
                    180deg,
                    rgba(255, 255, 255, 0.35) 0%,
                    rgba(255, 255, 255, 0) 50%
                  ),
                  #7FB89B
                `,
                borderRadius: xpPercent >= 99 ? '0' : '0 999px 999px 0',
                transition: 'width 0.5s ease',
              }}
            />
          </div>
        </div>

        {/* stat stickers */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div
            className="flex items-center gap-2 rounded-2xl border-4 border-black px-3 py-2.5"
            style={{
              background: `
                linear-gradient(180deg, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0) 55%),
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
                {safeCount}
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
                linear-gradient(180deg, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0) 55%),
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

      {/* VIBE PICKER MODAL */}
      {pickerOpen && (
        <>
          <div
            onClick={() => setPickerOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(26,11,46,0.55)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              zIndex: 1000,
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%,-50%)',
              width: 'min(400px, calc(100vw - 32px))',
              background: `
                linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
                rgba(255,253,245,0.98)
              `,
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              border: '4px solid black',
              borderRadius: '22px',
              boxShadow: '10px 10px 0 0 black',
              padding: '18px',
              zIndex: 1001,
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: '13px',
                  fontWeight: 900,
                  color: '#000',
                }}
              >
                {vibe ? 'update your vibe' : 'how are you feeling today?'}
              </p>
              <button
                onClick={() => setPickerOpen(false)}
                style={{
                  width: '28px',
                  height: '28px',
                  border: '2px solid black',
                  borderRadius: '999px',
                  background: '#FFD1DC',
                  color: '#000',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-label="Close"
              >
                <X className="size-3" strokeWidth={3} />
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '8px',
              }}
            >
              {VIBE_EMOJIS.map((emoji) => {
                const active = selectedEmoji === emoji;
                return (
                  <button
                    key={emoji}
                    onClick={() => setSelectedEmoji(emoji)}
                    style={{
                      aspectRatio: '1 / 1',
                      border: '3px solid black',
                      borderRadius: '14px',
                      background: active
                        ? 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FF8BA7'
                        : 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFFDF5',
                      cursor: 'pointer',
                      fontSize: '26px',
                      lineHeight: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: active
                        ? '3px 3px 0 0 black'
                        : '2px 2px 0 0 black',
                      padding: 0,
                    }}
                    aria-label={emoji}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>

            <input
              type="text"
              value={vibeText}
              onChange={(e) => setVibeText(e.target.value)}
              placeholder="one line? (optional, 60 chars)"
              maxLength={60}
              style={{
                width: '100%',
                border: '2px solid black',
                borderRadius: '14px',
                background: '#FFFDF5',
                color: '#000',
                fontSize: '13px',
                padding: '10px 14px',
                outline: 'none',
                fontWeight: 700,
              }}
            />

            <button
              onClick={saveVibe}
              disabled={!selectedEmoji || savingVibe}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '11px',
                border: '3px solid black',
                borderRadius: '999px',
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #E2F0D9',
                color: '#000',
                fontWeight: 900,
                fontSize: '12px',
                boxShadow: '3px 3px 0 0 black',
                cursor:
                  !selectedEmoji || savingVibe ? 'not-allowed' : 'pointer',
                opacity: !selectedEmoji || savingVibe ? 0.5 : 1,
              }}
            >
              <Check className="size-4" strokeWidth={3} />
              {savingVibe ? 'saving...' : vibe ? 'update vibe' : 'save vibe'}
            </button>
          </div>
        </>
      )}
    </>
  );
}