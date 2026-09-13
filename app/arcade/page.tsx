'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

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
    id: 'rps',
    title: 'ROCK · PAPER · SCISSORS',
    subtitle: 'best of 3',
    emoji: '✌️',
    color: '#FFF5BA',
    status: 'soon',
    players: '2 players',
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

export default function ArcadePage() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const e = data.user?.email ?? null;
      setEmail(e);
      if (!e) window.location.href = '/login';
      else setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a0b2e] flex items-center justify-center text-white font-mono">
        loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a0b2e] p-4 sm:p-6 font-mono flex flex-col">
      <div className="w-full max-w-3xl mx-auto flex flex-col gap-5">

        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <h1 className="text-xl sm:text-2xl font-black text-white">
            🎮 arcade
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

        <p
          className="font-bold"
          style={{ fontSize: '11px', color: 'rgba(255,253,245,0.55)', paddingLeft: '4px' }}
        >
          pick a game · some solo, some with the squad 🕹️
        </p>

        {/* Games grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {GAMES.map((g) => {
            const clickable = g.status === 'live' && g.href;
            const content = (
              <div
                className="border-4 border-black rounded-2xl flex items-center transition-all relative"
                style={{
                  backgroundColor: g.color,
                  padding: '16px',
                  gap: '14px',
                  boxShadow: '6px 6px 0 0 black',
                  opacity: g.status === 'soon' ? 0.65 : 1,
                  cursor: clickable ? 'pointer' : 'not-allowed',
                }}
              >
                <div
                  className="flex items-center justify-center border-4 border-black shrink-0 overflow-hidden"
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '14px',
                    backgroundColor: '#FFFDF5',
                    fontSize: '26px',
                    lineHeight: 1,
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
                      backgroundColor: '#7FB89B',
                      color: '#000',
                      padding: '3px 8px',
                      borderRadius: '999px',
                      textTransform: 'uppercase',
                    }}
                  >
                    play
                  </span>
                ) : (
                  <span
                    className="font-black border-2 border-black shrink-0"
                    style={{
                      fontSize: '9px',
                      backgroundColor: '#FFFDF5',
                      color: '#000',
                      padding: '3px 8px',
                      borderRadius: '999px',
                      textTransform: 'uppercase',
                    }}
                  >
                    soon
                  </span>
                )}
              </div>
            );

            return clickable ? (
              <Link
                key={g.id}
                href={g.href!}
                className="hover:-translate-y-1 active:translate-y-0 transition-transform"
              >
                {content}
              </Link>
            ) : (
              <div key={g.id}>{content}</div>
            );
          })}
        </div>

        <p
          className="text-center font-bold"
          style={{ fontSize: '10px', color: 'rgba(255,253,245,0.4)' }}
        >
          more games dropping soon · stay tuned 🎯
        </p>
      </div>
    </div>
  );
}