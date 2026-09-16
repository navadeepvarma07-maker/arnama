'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { SwipeCarousel } from '@/components/arnama/swipe-carousel';

type Game = {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  color: string;
  href?: string;
  status: 'live' | 'soon';
  players: string;
};

const GAMES: Game[] = [
  {
    id: 'ttt',
    title: 'TIC-TAC-TOE',
    subtitle: 'classic 1v1',
    emoji: '⭕',
    color: '#E6E6FA',
    href: '/arcade/tictactoe',
    status: 'live',
    players: '2 players',
  },
  {
    id: 'rps',
    title: 'ROCK · PAPER · SCISSORS',
    subtitle: 'best of 3',
    emoji: '✌️',
    color: '#FFF5BA',
    href: '/arcade/rps',
    status: 'live',
    players: '2 players',
  },
  {
    id: 'pixelwar',
    title: 'PIXEL WAR',
    subtitle: 'shared canvas',
    emoji: '🎨',
    color: '#FFD1DC',
    status: 'soon',
    players: 'everyone',
  },
  {
    id: 'reaction',
    title: 'REACTION RACE',
    subtitle: 'who is fastest?',
    emoji: '⚡',
    color: '#E2F0D9',
    status: 'soon',
    players: 'up to 6',
  },
  {
    id: 'connect4',
    title: 'CONNECT 4',
    subtitle: 'four in a row',
    emoji: '🔴',
    color: '#D4F0F0',
    status: 'soon',
    players: '2 players',
  },
  {
    id: 'trivia',
    title: 'GROUP TRIVIA',
    subtitle: 'quiz together',
    emoji: '🧠',
    color: '#E6E6FA',
    status: 'soon',
    players: 'up to 8',
  },
];

const AVATAR_COLORS = ['#E2F0D9', '#FFD1DC', '#E6E6FA', '#FFF5BA', '#D4F0F0'];

function colorFor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++)
    hash = (hash * 17 + str.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function tiltFor(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++)
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const angles = [-1.5, -1, 0, 1, 1.5];
  return angles[Math.abs(hash) % angles.length];
}

/** Winner email for a TTT row. Stores winner as 'X' | 'O' | 'draw'. */
function tttWinnerEmail(row: any): string | null {
  if (!row) return null;
  if (row.winner === 'X') return row.player_x_email ?? null;
  if (row.winner === 'O') return row.player_o_email ?? null;
  return null; // draw or unfinished
}

/** Winner email for an RPS row. Stores winner as 'A' | 'B'. */
function rpsWinnerEmail(row: any): string | null {
  if (!row) return null;
  if (row.winner === 'A') return row.player_a_email ?? null;
  if (row.winner === 'B') return row.player_b_email ?? null;
  return null;
}

export default function ArcadePage() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [tabIndex, setTabIndex] = useState(0);

  const [ttt, setTtt] = useState<any[]>([]);
  const [rps, setRps] = useState<any[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [schemaWarning, setSchemaWarning] = useState(false);

  // AUTH
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const e = data.user?.email ?? null;
      setEmail(e);
      if (!e) window.location.href = '/login';
      else setLoading(false);
    });
  }, []);

  // LOAD
  useEffect(() => {
    if (!email) return;
    async function load() {
      let warned = false;

      const tttRes = await supabase
        .from('arcade_ttt')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (tttRes.error) {
        console.error('arcade_ttt:', tttRes.error);
        warned = true;
      } else {
        setTtt(tttRes.data ?? []);
      }

      const rpsRes = await supabase
        .from('arcade_rps')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (rpsRes.error) {
        if (rpsRes.error.code !== '42P01') {
          console.error('arcade_rps:', rpsRes.error);
          warned = true;
        }
      } else {
        setRps(rpsRes.data ?? []);
      }

      setSchemaWarning(warned);
      setStatsLoading(false);
    }
    load();
  }, [email]);

  // LEADERBOARD
  const leaderboard = useMemo(() => {
    const wins: Record<string, number> = {};
    const games: Record<string, number> = {};

    function track(e: string | null | undefined) {
      if (!e) return;
      games[e] = (games[e] ?? 0) + 1;
    }
    function trackWin(e: string | null | undefined) {
      if (!e) return;
      wins[e] = (wins[e] ?? 0) + 1;
    }

    ttt.forEach((row) => {
      // Skip unfinished games (still waiting / playing)
      if (row.status !== 'finished') return;
      track(row.player_x_email);
      track(row.player_o_email);
      trackWin(tttWinnerEmail(row));
    });

    rps.forEach((row) => {
      if (row.status !== 'finished') return;
      track(row.player_a_email);
      track(row.player_b_email);
      trackWin(rpsWinnerEmail(row));
    });

    const all = new Set([...Object.keys(wins), ...Object.keys(games)]);

    return Array.from(all)
      .map((e) => ({
        email: e,
        wins: wins[e] ?? 0,
        games: games[e] ?? 0,
        winRate:
          (games[e] ?? 0) > 0
            ? Math.round(((wins[e] ?? 0) / (games[e] ?? 1)) * 100)
            : 0,
      }))
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        return b.winRate - a.winRate;
      });
  }, [ttt, rps]);

  // STATS
  const stats = useMemo(() => {
    const finishedTtt = ttt.filter((r) => r.status === 'finished');
    const finishedRps = rps.filter((r) => r.status === 'finished');
    const totalGames = finishedTtt.length + finishedRps.length;

    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent =
      finishedTtt.filter(
        (r) => new Date(r.created_at).getTime() >= cutoff
      ).length +
      finishedRps.filter(
        (r) => new Date(r.created_at).getTime() >= cutoff
      ).length;

    let myGames = 0;
    let myWins = 0;

    if (email) {
      finishedTtt.forEach((r) => {
        if (r.player_x_email === email || r.player_o_email === email)
          myGames++;
        if (tttWinnerEmail(r) === email) myWins++;
      });
      finishedRps.forEach((r) => {
        if (r.player_a_email === email || r.player_b_email === email)
          myGames++;
        if (rpsWinnerEmail(r) === email) myWins++;
      });
    }

    const myWinRate =
      myGames > 0 ? Math.round((myWins / myGames) * 100) : 0;

    return {
      totalGames,
      recent,
      myGames,
      myWins,
      myWinRate,
      tttCount: finishedTtt.length,
      rpsCount: finishedRps.length,
    };
  }, [ttt, rps, email]);

  const myRank = useMemo(() => {
    if (!email) return -1;
    const idx = leaderboard.findIndex((r) => r.email === email);
    return idx === -1 ? -1 : idx + 1;
  }, [leaderboard, email]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#1a0b2e] flex items-center justify-center text-white font-mono">
        loading...
      </div>
    );
  }

  // GAME CARD
  function GameCard({ g }: { g: Game }) {
    const clickable = g.status === 'live' && g.href;
    const tilt = tiltFor(g.id);

    const content = (
      <div
        className="border-4 border-black relative transition-all"
        style={{
          background: `
            linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
            ${g.color}
          `,
          borderRadius: '22px',
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          boxShadow: `
            6px 6px 0 0 black,
            inset 0 1px 0 rgba(255,255,255,0.75)
          `,
          opacity: g.status === 'soon' ? 0.68 : 1,
          cursor: clickable ? 'pointer' : 'not-allowed',
          transform: `rotate(${tilt}deg)`,
          overflow: 'hidden',
        }}
      >
        <div
          className="gloss-shine flex items-center justify-center border-4 border-black shrink-0"
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: `
              linear-gradient(180deg, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.2) 45%, rgba(255,255,255,0) 100%),
              #FFFDF5
            `,
            fontSize: '26px',
            lineHeight: 1,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)',
          }}
        >
          {g.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="font-black truncate"
            style={{ fontSize: '14px', color: '#000' }}
          >
            {g.title}
          </p>
          <p
            className="font-bold"
            style={{
              fontSize: '10px',
              color: 'rgba(0,0,0,0.55)',
              marginTop: '2px',
            }}
          >
            {g.subtitle}
          </p>
          <p
            className="font-bold"
            style={{
              fontSize: '9px',
              color: 'rgba(0,0,0,0.45)',
              marginTop: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            👥 {g.players}
          </p>
        </div>
        {g.status === 'live' ? (
          <span
            className="font-black border-2 border-black shrink-0"
            style={{
              fontSize: '9px',
              background: `
                linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
                #7FB89B
              `,
              color: '#000',
              padding: '3px 8px',
              borderRadius: '999px',
              textTransform: 'uppercase',
              boxShadow: '2px 2px 0 0 black',
            }}
          >
            play
          </span>
        ) : (
          <span
            className="font-black border-2 border-black shrink-0"
            style={{
              fontSize: '9px',
              background: '#FFFDF5',
              color: '#000',
              padding: '3px 8px',
              borderRadius: '999px',
              textTransform: 'uppercase',
              boxShadow: '2px 2px 0 0 black',
            }}
          >
            soon
          </span>
        )}
      </div>
    );

    return clickable ? (
      <Link
        href={g.href!}
        className="hover:-translate-y-1 active:translate-y-0 transition-transform block"
      >
        {content}
      </Link>
    ) : (
      <div>{content}</div>
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
    value: string;
    color: string;
  }) {
    return (
      <div
        style={{
          border: '4px solid black',
          borderRadius: '22px',
          background: `
            linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
            ${color}
          `,
          padding: '16px',
          boxShadow: `
            5px 5px 0 0 black,
            inset 0 1px 0 rgba(255,255,255,0.75)
          `,
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          minHeight: '110px',
        }}
      >
        <span style={{ fontSize: '22px', lineHeight: 1 }}>{emoji}</span>
        <p
          style={{
            margin: 0,
            fontSize: '10px',
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
            fontSize: '22px',
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

  function BreakdownRow({
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span
          className="gloss-shine"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '12px',
            border: '3px solid black',
            background: `
              linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
              ${color}
            `,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            flexShrink: 0,
            boxShadow: '2px 2px 0 0 black',
          }}
        >
          {emoji}
        </span>
        <p
          style={{
            margin: 0,
            fontSize: '12px',
            fontWeight: 900,
            color: '#000',
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </p>
        <span
          style={{
            fontSize: '14px',
            fontWeight: 900,
            color: '#000',
            padding: '4px 12px',
            border: '2px solid black',
            borderRadius: '999px',
            background: '#FFFDF5',
            boxShadow: '2px 2px 0 0 black',
            flexShrink: 0,
          }}
        >
          {value}
        </span>
      </div>
    );
  }

  // SLIDE 1: GAMES
  const gamesSlide = (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: '0 4px 16px',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <p
          style={{
            margin: 0,
            fontSize: '11px',
            fontWeight: 900,
            color: 'rgba(255,253,245,0.55)',
            paddingLeft: '8px',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
          }}
        >
          🕹️ pick a machine
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: '14px',
          }}
        >
          {GAMES.map((g) => (
            <GameCard key={g.id} g={g} />
          ))}
        </div>

        <p
          style={{
            textAlign: 'center',
            fontWeight: 800,
            fontSize: '10px',
            color: 'rgba(255,253,245,0.4)',
            paddingTop: '6px',
          }}
        >
          more games dropping soon · stay tuned 🎯
        </p>
      </div>
    </div>
  );

  // SLIDE 2: LEADERBOARD
  const leaderboardSlide = (
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
          className="border-4 border-black shrink-0"
          style={{
            borderRadius: '22px',
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
                fontSize: '22px',
                fontWeight: 900,
                color: '#000',
                lineHeight: 1,
              }}
            >
              {leaderboard.length}
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 800,
                  color: 'rgba(0,0,0,0.5)',
                  marginLeft: '6px',
                }}
              >
                player{leaderboard.length === 1 ? '' : 's'}
              </span>
            </p>
          </div>
        </div>

        {statsLoading ? (
          <p
            style={{
              textAlign: 'center',
              color: 'rgba(255,253,245,0.5)',
              fontSize: '12px',
              padding: '30px 0',
              fontWeight: 700,
              margin: 0,
            }}
          >
            loading...
          </p>
        ) : leaderboard.length === 0 ? (
          <div
            className="border-4 border-black text-center"
            style={{
              borderRadius: '22px',
              background: '#FFFDF5',
              padding: '40px 20px',
              boxShadow: '6px 6px 0 0 black',
            }}
          >
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>🏆</div>
            <p
              style={{
                margin: 0,
                color: '#000',
                fontWeight: 800,
                fontSize: '13px',
              }}
            >
              no finished games yet
            </p>
            <p
              style={{
                margin: '8px 0 0',
                color: 'rgba(0,0,0,0.5)',
                fontWeight: 700,
                fontSize: '11px',
              }}
            >
              play vs a friend to get on the board
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {leaderboard.map((row, i) => {
              const isMe = row.email === email;
              const prefix = row.email.split('@')[0];
              const initials = prefix.slice(0, 2).toUpperCase();
              const avatarBg = colorFor(row.email);
              const isTop = i === 0;

              return (
                <div
                  key={row.email}
                  className="border-4 border-black"
                  style={{
                    borderRadius: '22px',
                    background: isTop
                      ? `
                        linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
                        rgba(255,215,0,0.7)
                      `
                      : `
                        linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
                        #FFFDF5
                      `,
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    boxShadow: `
                      4px 4px 0 0 black,
                      inset 0 1px 0 rgba(255,255,255,0.7)
                    `,
                  }}
                >
                  <div
                    className="gloss-shine shrink-0"
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '999px',
                      border: '3px solid black',
                      background: isTop
                        ? 'linear-gradient(180deg, #FFD700 0%, #FFA500 100%)'
                        : 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFFDF5',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                      fontSize: '14px',
                      color: '#000',
                      boxShadow: '2px 2px 0 0 black',
                    }}
                  >
                    {i + 1}
                  </div>

                  <div
                    className="gloss-shine shrink-0"
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '999px',
                      border: '3px solid black',
                      background: `
                        linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
                        ${avatarBg}
                      `,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                      fontSize: '12px',
                      color: '#000',
                    }}
                  >
                    {initials}
                  </div>

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '14px',
                        fontWeight: 900,
                        color: '#000',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isMe ? `${prefix} (you)` : prefix}
                    </p>
                    <p
                      style={{
                        margin: '2px 0 0',
                        fontSize: '10px',
                        fontWeight: 800,
                        color: 'rgba(0,0,0,0.55)',
                      }}
                    >
                      {row.wins} win{row.wins === 1 ? '' : 's'} · {row.games}{' '}
                      game{row.games === 1 ? '' : 's'} · {row.winRate}%
                    </p>
                  </div>

                  {isTop && (
                    <span style={{ fontSize: '20px', flexShrink: 0 }}>👑</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {schemaWarning && (
          <p
            style={{
              textAlign: 'center',
              fontSize: '10px',
              fontWeight: 800,
              color: 'rgba(255,139,167,0.9)',
              paddingTop: '6px',
            }}
          >
            ⚠️ couldn't read all game data — check console
          </p>
        )}
      </div>
    </div>
  );

  // SLIDE 3: STATS
  const statsSlide = (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: '0 4px 16px',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {statsLoading ? (
        <p
          style={{
            textAlign: 'center',
            color: 'rgba(255,253,245,0.5)',
            fontSize: '12px',
            padding: '40px 0',
            fontWeight: 700,
            margin: 0,
          }}
        >
          loading stats...
        </p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '12px',
          }}
        >
          <StatCard
            emoji="🎮"
            label="total games"
            value={stats.totalGames.toString()}
            color="#E6E6FA"
          />
          <StatCard
            emoji="🔥"
            label="this week"
            value={stats.recent.toString()}
            color="#FFD1DC"
          />
          <StatCard
            emoji="🎯"
            label="your games"
            value={stats.myGames.toString()}
            color="#E2F0D9"
          />
          <StatCard
            emoji="🏅"
            label="your wins"
            value={stats.myWins.toString()}
            color="#FFF5BA"
          />
          <StatCard
            emoji="📊"
            label="your win rate"
            value={`${stats.myWinRate}%`}
            color="#D4F0F0"
          />
          <StatCard
            emoji="👑"
            label="your rank"
            value={myRank > 0 ? `#${myRank}` : '—'}
            color="#FF8BA7"
          />

          <div
            style={{
              gridColumn: '1 / -1',
              border: '4px solid black',
              borderRadius: '22px',
              background: `
                linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
                rgba(230,230,250,0.92)
              `,
              backdropFilter: 'blur(14px) saturate(160%)',
              WebkitBackdropFilter: 'blur(14px) saturate(160%)',
              padding: '16px',
              boxShadow: `
                6px 6px 0 0 black,
                inset 0 1px 0 rgba(255,255,255,0.7)
              `,
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: '11px',
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'rgba(0,0,0,0.55)',
                marginBottom: '12px',
              }}
            >
              🎯 by game
            </p>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <BreakdownRow
                emoji="⭕"
                label="tic-tac-toe"
                value={stats.tttCount}
                color="#E6E6FA"
              />
              <BreakdownRow
                emoji="✌️"
                label="rock · paper · scissors"
                value={stats.rpsCount}
                color="#FFF5BA"
              />
            </div>
          </div>
        </div>
      )}
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
              🎮
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-black text-lg sm:text-2xl leading-tight text-white">
                arcade
              </h1>
              <p className="text-[10px] sm:text-xs font-bold leading-tight text-white/60">
                {GAMES.filter((g) => g.status === 'live').length} live ·{' '}
                {stats.totalGames} finished
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
          labels={['🎮 games', '🏆 leaderboard', '📊 stats']}
          slides={[gamesSlide, leaderboardSlide, statsSlide]}
        />
      </div>
    </div>
  );
}