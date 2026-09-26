'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { displayLabel, initialsFor } from '@/lib/use-profile';

type RoomState = {
  id: string;
  status: 'lobby' | 'countdown' | 'results';
  green_at: string | null;
  round_number: number;
  winner_email: string | null;
  winner_ms: number | null;
  updated_at: string;
};

type Tap = {
  id: number;
  round_number: number;
  user_id: string;
  user_email: string;
  reaction_ms: number | null;
  false_start: boolean;
  created_at: string;
};

const AVATAR_COLORS = ['#E2F0D9', '#FFD1DC', '#E6E6FA', '#FFF5BA', '#D4F0F0'];
const TOTAL_ROUNDS = 5;

export default function ReactionRacePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [state, setState] = useState<RoomState | null>(null);
  const [taps, setTaps] = useState<Tap[]>([]);
  const [listeners, setListeners] = useState(1);

  const [green, setGreen] = useState(false);
  const [myTap, setMyTap] = useState<Tap | null>(null);
  const [myFalseStart, setMyFalseStart] = useState(false);

  const greenAtRef = useRef<number | null>(null);
  const tapScheduledRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetScheduledRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AUTH
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      const e = user?.email ?? null;
      setUserId(user?.id ?? null);
      setEmail(e);
      if (!e) window.location.href = '/login';
      else setLoading(false);
    });
  }, []);

  // LOAD state
  useEffect(() => {
    if (!email) return;
    supabase
      .from('arcade_reaction_state')
      .select('*')
      .eq('id', 'main')
      .single()
      .then(({ data, error }) => {
        if (error) console.error(error);
        else setState(data as RoomState);
      });
  }, [email]);

  // REALTIME state
  useEffect(() => {
    if (!email) return;
    const ch = supabase
      .channel('reaction-state-live')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'arcade_reaction_state' },
        (payload) => setState(payload.new as RoomState)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [email]);

  // LOAD taps for current round
  useEffect(() => {
    if (!email || !state) return;
    const r = state.round_number;
    if (r === 0) {
      setTaps([]);
      return;
    }
    supabase
      .from('arcade_reaction_taps')
      .select('*')
      .eq('round_number', r)
      .then(({ data }) => {
        setTaps((data ?? []) as Tap[]);
        const mine = (data ?? []).find((t: any) => t.user_email === email);
        setMyTap((mine as Tap) ?? null);
      });
  }, [email, state?.round_number]);

  // REALTIME taps
  useEffect(() => {
    if (!email || !state) return;
    const r = state.round_number;
    if (r === 0) return;
    const ch = supabase
      .channel(`reaction-taps-${r}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'arcade_reaction_taps' },
        (payload) => {
          const t = payload.new as Tap;
          if (t.round_number !== r) return;
          setTaps((prev) => {
            if (prev.some((x) => x.id === t.id)) return prev;
            return [...prev, t];
          });
          if (t.user_email === email) setMyTap(t);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [email, state?.round_number]);

  // GREEN TIMING — client-side schedule based on green_at
  useEffect(() => {
    if (tapScheduledRef.current) {
      clearTimeout(tapScheduledRef.current);
      tapScheduledRef.current = null;
    }
    setGreen(false);
    greenAtRef.current = null;

    if (!state) return;
    if (state.status !== 'countdown') return;
    if (!state.green_at) return;

    const ms = new Date(state.green_at).getTime() - Date.now();
    if (ms <= 0) {
      setGreen(true);
      greenAtRef.current = new Date(state.green_at).getTime();
      return;
    }
    tapScheduledRef.current = setTimeout(() => {
      setGreen(true);
      greenAtRef.current = state.green_at
        ? new Date(state.green_at).getTime()
        : Date.now();
    }, ms);

    return () => {
      if (tapScheduledRef.current) clearTimeout(tapScheduledRef.current);
    };
  }, [state?.status, state?.green_at, state?.round_number]);

  // AUTO-RESET from results → lobby
  useEffect(() => {
    if (!state || !email) return;
    if (state.status !== 'results') return;
    const since = Date.now() - new Date(state.updated_at).getTime();
    const wait = Math.max(0, 6000 - since);
    if (resetScheduledRef.current) clearTimeout(resetScheduledRef.current);
    resetScheduledRef.current = setTimeout(async () => {
      // Only one client actually writes — conditional update
      await supabase
        .from('arcade_reaction_state')
        .update({
          status: 'lobby',
          winner_email: null,
          winner_ms: null,
          green_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 'main')
        .eq('status', 'results')
        .lt('updated_at', new Date(Date.now() - 5500).toISOString());
    }, wait);
    return () => {
      if (resetScheduledRef.current) clearTimeout(resetScheduledRef.current);
    };
  }, [state?.status, state?.updated_at, email]);

  // PRESENCE
  useEffect(() => {
    if (!userId || !email) return;
    const ch = supabase.channel('reaction-presence', {
      config: { presence: { key: userId } },
    });
    ch.on('presence', { event: 'sync' }, () => {
      setListeners(Object.keys(ch.presenceState()).length);
    }).subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await ch.track({ user_id: userId, email });
    });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, email]);

  // START ROUND
  async function startRound() {
    if (!userId || !email || !state) return;
    const round = state.round_number + 1;
    const delay = 2000 + Math.floor(Math.random() * 3000); // 2-5s
    const greenAt = new Date(Date.now() + delay).toISOString();

    setGreen(false);
    setMyTap(null);
    setMyFalseStart(false);

    await supabase
      .from('arcade_reaction_state')
      .update({
        status: 'countdown',
        green_at: greenAt,
        round_number: round,
        winner_email: null,
        winner_ms: null,
        updated_at: new Date().toISOString(),
        updated_by: email,
      })
      .eq('id', 'main');
  }

  // TAP
  async function handleTap() {
    if (!userId || !email || !state) return;
    if (state.status !== 'countdown') return;
    if (myTap && !myTap.false_start) return;

    const greenAt = greenAtRef.current;
    const now = Date.now();

    if (!greenAt || now < greenAt) {
      // false start
      const { error } = await supabase.from('arcade_reaction_taps').insert({
        round_number: state.round_number,
        user_id: userId,
        user_email: email,
        reaction_ms: null,
        false_start: true,
      });
      if (!error) setMyFalseStart(true);
      return;
    }

    const reactionMs = now - greenAt;

    const { data, error } = await supabase
      .from('arcade_reaction_taps')
      .insert({
        round_number: state.round_number,
        user_id: userId,
        user_email: email,
        reaction_ms: reactionMs,
        false_start: false,
      })
      .select()
      .single();

    if (error || !data) return;

    // Try to become the round winner (only the first tap wins)
    await supabase
      .from('arcade_reaction_state')
      .update({
        status: 'results',
        winner_email: email,
        winner_ms: reactionMs,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'main')
      .eq('status', 'countdown')
      .is('winner_email', null);
  }

  // DERIVED
  const validTaps = taps.filter((t) => !t.false_start && t.reaction_ms != null);
  const falseStarts = taps.filter((t) => t.false_start);
  const isWinner = !!email && state?.winner_email === email;
  const isGameOver = (state?.round_number ?? 0) >= TOTAL_ROUNDS;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#1a0b2e] flex items-center justify-center text-white font-mono">
        loading...
      </div>
    );
  }

  const status = state?.status ?? 'lobby';

  return (
    <div className="fixed inset-0 bg-[#1a0b2e] font-mono flex justify-center overflow-hidden">
      <div
        className="w-full max-w-2xl h-full flex flex-col p-3 sm:p-6 gap-3 sm:gap-4 overflow-y-auto"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="gloss-shine flex size-10 sm:size-12 shrink-0 items-center justify-center rounded-2xl border-4 border-black"
              style={{
                background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFF5BA`,
                fontSize: '20px',
              }}
            >
              ⚡
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-black text-lg sm:text-2xl leading-tight text-white">
                reaction race
              </h1>
              <p className="text-[10px] sm:text-xs font-bold leading-tight text-white/60">
                {listeners} in room · best of {TOTAL_ROUNDS}
              </p>
            </div>
          </div>
          <Link
            href="/arcade"
            className="inline-flex items-center border-4 border-black bg-[#E2F0D9] text-black font-black rounded-xl shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition shrink-0"
            style={{ padding: '8px 16px', gap: '8px' }}
          >
            <span className="text-base leading-none">←</span>
            <span className="text-sm leading-none hidden sm:inline">back</span>
          </Link>
        </div>

        {/* Round + score */}
        <div className="grid grid-cols-2 gap-3 shrink-0">
          <div
            className="border-4 border-black rounded-2xl"
            style={{
              background: `linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%), #E6E6FA`,
              padding: '12px 14px',
              boxShadow: `4px 4px 0 0 black, inset 0 1px 0 rgba(255,255,255,0.7)`,
            }}
          >
            <p style={{ margin: 0, fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(0,0,0,0.5)' }}>
              round
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '24px', fontWeight: 900, color: '#000', lineHeight: 1 }}>
              {state?.round_number ?? 0} / {TOTAL_ROUNDS}
            </p>
          </div>
          <div
            className="border-4 border-black rounded-2xl"
            style={{
              background: `linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%), #E2F0D9`,
              padding: '12px 14px',
              boxShadow: `4px 4px 0 0 black, inset 0 1px 0 rgba(255,255,255,0.7)`,
            }}
          >
            <p style={{ margin: 0, fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(0,0,0,0.5)' }}>
              last time
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '24px', fontWeight: 900, color: '#000', lineHeight: 1 }}>
              {state?.winner_ms ? `${state.winner_ms}ms` : '—'}
            </p>
          </div>
        </div>

        {/* ARENA */}
        <div
          className="border-4 border-black rounded-2xl shrink-0 relative overflow-hidden"
          style={{
            background: green
              ? `linear-gradient(180deg, #7FE5A5 0%, #4DB87C 100%)`
              : status === 'results'
              ? `linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%), #FFF5BA`
              : `linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%), #FFD1DC`,
            transition: 'background 0.05s',
            boxShadow: `6px 6px 0 0 black, inset 0 1px 0 rgba(255,255,255,0.7)`,
            minHeight: '300px',
            cursor: status === 'countdown' && !myTap ? 'pointer' : 'default',
          }}
          onPointerDown={(e) => {
            if (status !== 'countdown') return;
            e.preventDefault();
            handleTap();
          }}
        >
          <div
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '300px',
              padding: '30px 20px',
              gap: '12px',
              textAlign: 'center',
            }}
          >
            {/* LOBBY */}
            {status === 'lobby' && !isGameOver && (
              <>
                <span style={{ fontSize: '56px', lineHeight: 1 }}>⚡</span>
                <p style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#000' }}>
                  ready to race?
                </p>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 800, color: 'rgba(0,0,0,0.55)', maxWidth: '320px' }}>
                  when green flashes, tap as fast as you can. best of {TOTAL_ROUNDS} rounds.
                </p>
                <button
                  onClick={startRound}
                  style={{
                    marginTop: '8px',
                    padding: '14px 26px',
                    border: '4px solid black',
                    borderRadius: '999px',
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #E2F0D9',
                    color: '#000',
                    fontWeight: 900,
                    fontSize: '14px',
                    boxShadow: '4px 4px 0 0 black',
                    cursor: 'pointer',
                  }}
                >
                  ▶ start round
                </button>
              </>
            )}

            {/* COUNTDOWN — before green */}
            {status === 'countdown' && !green && (
              <>
                <span
                  style={{
                    fontSize: '56px',
                    lineHeight: 1,
                    animation: 'voice-pulse 1.2s ease-in-out infinite',
                  }}
                >
                  ⏳
                </span>
                <p style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#000' }}>
                  wait for green…
                </p>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 800, color: 'rgba(0,0,0,0.55)' }}>
                  {falseStarts.length > 0
                    ? `⚠️ ${falseStarts.length} false start${falseStarts.length > 1 ? 's' : ''}`
                    : 'do NOT tap yet'}
                </p>
                {myFalseStart && (
                  <p
                    style={{
                      margin: 0,
                      marginTop: '6px',
                      padding: '6px 12px',
                      border: '2px solid black',
                      borderRadius: '999px',
                      background: '#FFFDF5',
                      fontSize: '11px',
                      fontWeight: 900,
                      color: '#C2185B',
                    }}
                  >
                    🚫 you tapped early
                  </p>
                )}
              </>
            )}

            {/* GREEN — tap! */}
            {status === 'countdown' && green && !myTap && (
              <>
                <span style={{ fontSize: '80px', lineHeight: 1 }}>🟢</span>
                <p style={{ margin: 0, fontSize: '32px', fontWeight: 900, color: '#FFF', textShadow: '2px 2px 0 rgba(0,0,0,0.7)' }}>
                  TAP!
                </p>
              </>
            )}

            {/* ALREADY TAPPED — waiting for others */}
            {status === 'countdown' && green && myTap && !myTap.false_start && (
              <>
                <span style={{ fontSize: '56px', lineHeight: 1 }}>✅</span>
                <p style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#FFF', textShadow: '2px 2px 0 rgba(0,0,0,0.7)' }}>
                  {myTap.reaction_ms}ms
                </p>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 800, color: 'rgba(255,255,255,0.9)' }}>
                  waiting for the others…
                </p>
              </>
            )}

            {/* RESULTS */}
            {status === 'results' && (
              <>
                <span style={{ fontSize: '56px', lineHeight: 1 }}>{isWinner ? '🏆' : '💨'}</span>
                <p style={{ margin: 0, fontSize: '22px', fontWeight: 900, color: '#000' }}>
                  {isWinner
                    ? 'you win this round!'
                    : state?.winner_email
                    ? `${state.winner_email.split('@')[0]} wins`
                    : 'round over'}
                </p>
                {state?.winner_ms && (
                  <p
                    style={{
                      margin: 0,
                      padding: '6px 14px',
                      border: '2px solid black',
                      borderRadius: '999px',
                      background: '#FFFDF5',
                      fontSize: '14px',
                      fontWeight: 900,
                      color: '#000',
                    }}
                  >
                    ⚡ {state.winner_ms}ms
                  </p>
                )}

                {/* Mini scoreboard */}
                {validTaps.length > 0 && (
                  <div
                    style={{
                      marginTop: '10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      width: '100%',
                      maxWidth: '340px',
                    }}
                  >
                    {[...validTaps]
                      .sort((a, b) => (a.reaction_ms ?? 0) - (b.reaction_ms ?? 0))
                      .slice(0, 5)
                      .map((t, i) => (
                        <div
                          key={t.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '6px 10px',
                            border: '2px solid black',
                            borderRadius: '12px',
                            background: i === 0 ? '#FFF5BA' : '#FFFDF5',
                            boxShadow: '2px 2px 0 0 black',
                          }}
                        >
                          <span style={{ fontSize: '14px' }}>
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '·'}
                          </span>
                          <span style={{ flex: 1, textAlign: 'left', fontSize: '12px', fontWeight: 900, color: '#000' }}>
                            {t.user_email === email ? 'you' : t.user_email.split('@')[0]}
                          </span>
                          <span style={{ fontSize: '12px', fontWeight: 900, color: '#000' }}>
                            {t.reaction_ms}ms
                          </span>
                        </div>
                      ))}
                    {falseStarts.length > 0 && (
                      <p
                        style={{
                          margin: '6px 0 0',
                          fontSize: '10px',
                          fontWeight: 800,
                          color: 'rgba(0,0,0,0.5)',
                        }}
                      >
                        ⚠️ {falseStarts.length} false start{falseStarts.length > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                )}

                <p
                  style={{
                    marginTop: '10px',
                    fontSize: '11px',
                    fontWeight: 800,
                    color: 'rgba(0,0,0,0.5)',
                  }}
                >
                  next round starting…
                </p>
              </>
            )}

            {/* GAME OVER */}
            {isGameOver && status === 'results' && (
              <button
                onClick={async () => {
                  await supabase
                    .from('arcade_reaction_state')
                    .update({
                      status: 'lobby',
                      round_number: 0,
                      winner_email: null,
                      winner_ms: null,
                      green_at: null,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', 'main');
                  await supabase
                    .from('arcade_reaction_taps')
                    .delete()
                    .neq('id', 0);
                }}
                style={{
                  marginTop: '12px',
                  padding: '12px 22px',
                  border: '3px solid black',
                  borderRadius: '999px',
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #E2F0D9',
                  color: '#000',
                  fontWeight: 900,
                  fontSize: '13px',
                  boxShadow: '3px 3px 0 0 black',
                  cursor: 'pointer',
                }}
              >
                🔄 play again
              </button>
            )}
          </div>
        </div>

        {/* Player chips */}
        <div className="flex flex-wrap shrink-0" style={{ gap: '8px' }}>
          {[...new Set(taps.map((t) => t.user_email))].map((e, i) => {
            const initials = initialsFor(e, null);
            const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
            return (
              <div
                key={e}
                className="flex items-center"
                style={{
                  padding: '4px 10px 4px 4px',
                  border: '2px solid black',
                  borderRadius: '999px',
                  background: '#FFFDF5',
                  boxShadow: '2px 2px 0 0 black',
                  gap: '6px',
                }}
              >
                <span
                  className="gloss-shine"
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '999px',
                    border: '2px solid black',
                    background: color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '8px',
                    fontWeight: 900,
                    color: '#000',
                  }}
                >
                  {initials}
                </span>
                <span style={{ fontSize: '11px', fontWeight: 900, color: '#000' }}>
                  {e === email ? 'you' : e.split('@')[0]}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}