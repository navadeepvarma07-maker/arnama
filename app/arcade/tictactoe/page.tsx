'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { fireConfetti } from '@/lib/confetti';

type Match = {
  id: string;
  player_x_id: string;
  player_x_email: string;
  player_o_id: string | null;
  player_o_email: string | null;
  board: string[];
  current_turn: string;
  status: string;
  winner: string | null;
  created_at: string;
  updated_at: string;
};

const WIN_LINES: number[][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function detectWinner(board: string[]): 'X' | 'O' | 'draw' | null {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a] as 'X' | 'O';
    }
  }
  if (board.every((c) => c !== '')) return 'draw';
  return null;
}

function shortName(email: string): string {
  return email.split('@')[0];
}

function findWinningMove(board: string[], mark: 'X' | 'O'): number | null {
  for (const [a, b, c] of WIN_LINES) {
    const cells = [board[a], board[b], board[c]];
    const markCount = cells.filter((x) => x === mark).length;
    const emptyCount = cells.filter((x) => x === '').length;
    if (markCount === 2 && emptyCount === 1) {
      if (board[a] === '') return a;
      if (board[b] === '') return b;
      if (board[c] === '') return c;
    }
  }
  return null;
}

function botMove(board: string[]): number {
  const win = findWinningMove(board, 'O');
  if (win !== null) return win;

  const block = findWinningMove(board, 'X');
  if (block !== null) return block;

  if (board[4] === '') return 4;

  const corners = [0, 2, 6, 8].filter((i) => board[i] === '');
  if (corners.length > 0) {
    return corners[Math.floor(Math.random() * corners.length)];
  }

  const empties = board
    .map((c, i) => (c === '' ? i : -1))
    .filter((i) => i >= 0);
  return empties[Math.floor(Math.random() * empties.length)];
}

export default function TicTacToePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [match, setMatch] = useState<Match | null>(null);
  const [isBotMode, setIsBotMode] = useState(false);
  const [botThinking, setBotThinking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  // 🎉 prevents confetti from firing twice for the same game
  const confettiFiredRef = useRef<Set<string>>(new Set());

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

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('arcade_ttt')
      .select('*')
      .or(`player_x_id.eq.${userId},player_o_id.eq.${userId}`)
      .in('status', ['waiting', 'playing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (error) console.error(error);
        else setMatch(data && data.length > 0 ? (data[0] as Match) : null);
      });
  }, [userId]);

  useEffect(() => {
    if (!match || isBotMode) return;
    const channel = supabase
      .channel(`ttt-${match.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'arcade_ttt', filter: `id=eq.${match.id}` },
        (payload) => setMatch(payload.new as Match)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [match?.id, isBotMode]);

  useEffect(() => {
    if (!isBotMode || !match) return;
    if (match.status !== 'playing') return;
    if (match.current_turn !== 'O') return;

    setBotThinking(true);
    const timer = setTimeout(() => {
      setMatch((prev) => {
        if (!prev) return prev;
        const move = botMove(prev.board);
        const nextBoard = [...prev.board];
        nextBoard[move] = 'O';
        const winner = detectWinner(nextBoard);

        // 🎉 if bot wins and that's you (i.e. you're X and O wins → actually bot wins, no confetti)
        // Confetti only fires when YOU win, handled in tapCell

        const next: Match = {
          ...prev,
          board: nextBoard,
          current_turn: winner ? prev.current_turn : 'X',
          status: winner ? 'finished' : 'playing',
          winner: winner,
          updated_at: new Date().toISOString(),
        };
        return next;
      });
      setBotThinking(false);
    }, 600);

    return () => clearTimeout(timer);
  }, [isBotMode, match?.current_turn, match?.status, match?.board]);

  function startBotMatch() {
    if (!userId || !email) return;
    setError('');
    const now = new Date().toISOString();
    setMatch({
      id: `bot-${Date.now()}`,
      player_x_id: userId,
      player_x_email: email,
      player_o_id: 'BOT',
      player_o_email: 'bot@arnama',
      board: ['', '', '', '', '', '', '', '', ''],
      current_turn: 'X',
      status: 'playing',
      winner: null,
      created_at: now,
      updated_at: now,
    });
    setIsBotMode(true);
  }

  async function quickMatch() {
    if (!userId || !email) return;
    setError('');
    setCreating(true);

    const { data: openGames, error: findErr } = await supabase
      .from('arcade_ttt')
      .select('*')
      .eq('status', 'waiting')
      .neq('player_x_id', userId)
      .order('created_at', { ascending: true })
      .limit(1);

    if (findErr) {
      setError('⚠️ ' + findErr.message);
      setCreating(false);
      return;
    }

    if (openGames && openGames.length > 0) {
      const target = openGames[0];
      const { data, error } = await supabase
        .from('arcade_ttt')
        .update({
          player_o_id: userId,
          player_o_email: email,
          status: 'playing',
          updated_at: new Date().toISOString(),
        })
        .eq('id', target.id)
        .select();

      if (error) setError('⚠️ ' + error.message);
      else if (!data || data.length === 0)
        setError('⚠️ Could not join this game — try again');
      else setMatch(data[0] as Match);
    } else {
      const { data, error } = await supabase
        .from('arcade_ttt')
        .insert({
          player_x_id: userId,
          player_x_email: email,
          status: 'waiting',
        })
        .select();

      if (error) setError('⚠️ ' + error.message);
      else if (!data || data.length === 0)
        setError('⚠️ Could not create game');
      else setMatch(data[0] as Match);
    }
    setCreating(false);
  }

  async function tapCell(index: number) {
    if (!match || !userId) return;
    if (match.status !== 'playing') return;
    if (match.board[index] !== '') return;

    const isX = match.player_x_id === userId;
    const isO = match.player_o_id === userId;
    if (!isX && !isO) return;

    const myMark = isX ? 'X' : 'O';
    if (match.current_turn !== myMark) return;

    const nextBoard = [...match.board];
    nextBoard[index] = myMark;
    const winner = detectWinner(nextBoard);
    const nextTurn = myMark === 'X' ? 'O' : 'X';

    const updates: Partial<Match> = {
      board: nextBoard,
      current_turn: winner ? match.current_turn : nextTurn,
      updated_at: new Date().toISOString(),
    };
    if (winner) {
      updates.status = 'finished';
      updates.winner = winner;
    }

    setMatch((prev) => (prev ? ({ ...prev, ...updates } as Match) : prev));

    // 🎉 confetti when you win
    if (winner && winner !== 'draw' && winner === myMark) {
      const key = match.id;
      if (!confettiFiredRef.current.has(key)) {
        confettiFiredRef.current.add(key);
        setTimeout(() => fireConfetti({ count: 110 }), 200);
      }
    }

    if (isBotMode) return;

    const { error } = await supabase
      .from('arcade_ttt')
      .update(updates)
      .eq('id', match.id);
    if (error) console.error(error);
  }

  async function leaveMatch() {
    if (!match) return;
    if (!confirm('Leave this match?')) return;

    if (isBotMode) {
      setMatch(null);
      setIsBotMode(false);
      setBotThinking(false);
      return;
    }

    await supabase.from('arcade_ttt').delete().eq('id', match.id);
    setMatch(null);
  }

  function playAgain() {
    if (!match) return;

    if (isBotMode) {
      setMatch((prev) =>
        prev
          ? {
              ...prev,
              board: ['', '', '', '', '', '', '', '', ''],
              current_turn: 'X',
              status: 'playing',
              winner: null,
              updated_at: new Date().toISOString(),
            }
          : prev
      );
      setBotThinking(false);
      return;
    }

    // Friend mode → KEEP the finished match as history, start a fresh one
    setMatch(null);
    setTimeout(() => quickMatch(), 100);
  }

  const myMark: 'X' | 'O' | null = useMemo(() => {
    if (!match || !userId) return null;
    if (match.player_x_id === userId) return 'X';
    if (match.player_o_id === userId) return 'O';
    return null;
  }, [match, userId]);

  const isMyTurn =
    match && match.status === 'playing' && match.current_turn === myMark;

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
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white">
              ❌⭕ tic-tac-toe
            </h1>
            <p
              className="font-bold"
              style={{
                fontSize: '10px',
                color: 'rgba(255,253,245,0.5)',
                marginTop: '2px',
              }}
            >
              {isBotMode
                ? 'playing vs bot 🤖'
                : myMark === 'X'
                ? 'you are X (first)'
                : myMark === 'O'
                ? 'you are O'
                : 'playing as guest'}
            </p>
          </div>
          <Link
            href="/arcade"
            className="inline-flex items-center border-4 border-black bg-[#E2F0D9] text-black font-black rounded-xl shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:shadow-[7px_7px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition"
            style={{ padding: '10px 20px', gap: '10px' }}
          >
            <span className="text-base leading-none">←</span>
            <span className="text-sm leading-none">back</span>
          </Link>
        </div>

        {!match && (
          <div
            className="border-4 border-black rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] text-center flex flex-col items-center"
            style={{
              backgroundColor: '#FFFDF5',
              padding: '40px 24px',
              gap: '14px',
            }}
          >
            <span style={{ fontSize: '40px' }}>🎮</span>
            <p className="font-black" style={{ fontSize: '16px', color: '#000' }}>
              ready to play?
            </p>
            <p
              className="font-bold"
              style={{
                fontSize: '11px',
                color: 'rgba(0,0,0,0.55)',
                maxWidth: '320px',
              }}
            >
              play against a friend, or warm up against the bot
            </p>

            {error && (
              <div
                className="border-2 border-black bg-white text-black text-xs font-bold rounded-lg w-full"
                style={{ padding: '8px 12px' }}
              >
                {error}
              </div>
            )}

            <div
              className="flex flex-col sm:flex-row w-full"
              style={{ gap: '10px' }}
            >
              <button
                onClick={quickMatch}
                disabled={creating}
                className="flex-1 inline-flex items-center justify-center border-2 border-black bg-[#E2F0D9] text-black font-black text-sm rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition disabled:opacity-50"
                style={{ padding: '14px 20px', gap: '10px' }}
              >
                <span style={{ fontSize: '18px' }}>{creating ? '···' : '👥'}</span>
                <span className="tracking-wider">
                  {creating ? 'FINDING' : 'VS FRIEND'}
                </span>
              </button>

              <button
                onClick={startBotMatch}
                className="flex-1 inline-flex items-center justify-center border-2 border-black bg-[#FFD1DC] text-black font-black text-sm rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition"
                style={{ padding: '14px 20px', gap: '10px' }}
              >
                <span style={{ fontSize: '18px' }}>🤖</span>
                <span className="tracking-wider">VS BOT</span>
              </button>
            </div>
          </div>
        )}

        {match && match.status === 'waiting' && (
          <div
            className="border-4 border-black rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center"
            style={{
              backgroundColor: '#FFF5BA',
              padding: '40px 24px',
              gap: '14px',
            }}
          >
            <div className="animate-pulse font-black" style={{ fontSize: '40px' }}>
              ⏳
            </div>
            <p className="font-black" style={{ fontSize: '16px', color: '#000' }}>
              waiting for an opponent...
            </p>
            <p
              className="font-bold text-center"
              style={{
                fontSize: '11px',
                color: 'rgba(0,0,0,0.55)',
                maxWidth: '300px',
              }}
            >
              you're X. as soon as a friend taps "vs friend", the game begins
            </p>
            <button
              onClick={leaveMatch}
              className="border-2 border-black bg-[#FFD1DC] text-black font-black text-xs rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition"
              style={{ padding: '10px 20px' }}
            >
              cancel
            </button>
          </div>
        )}

        {match && match.status !== 'waiting' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <PlayerChip
                label={shortName(match.player_x_email)}
                mark="X"
                isMe={match.player_x_id === userId}
                isTurn={match.status === 'playing' && match.current_turn === 'X'}
                isWinner={match.status === 'finished' && match.winner === 'X'}
              />
              <PlayerChip
                label={
                  isBotMode
                    ? 'bot'
                    : match.player_o_email
                    ? shortName(match.player_o_email)
                    : '???'
                }
                mark="O"
                isMe={false}
                isTurn={match.status === 'playing' && match.current_turn === 'O'}
                isWinner={match.status === 'finished' && match.winner === 'O'}
              />
            </div>

            <div
              className="border-4 border-black rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] mx-auto"
              style={{
                backgroundColor: '#FFFDF5',
                padding: '14px',
                width: '100%',
                maxWidth: '400px',
              }}
            >
              <div
                className="grid"
                style={{
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '8px',
                  aspectRatio: '1 / 1',
                }}
              >
                {match.board.map((cell, i) => {
                  const empty = cell === '';
                  const clickable = empty && isMyTurn;
                  return (
                    <button
                      key={i}
                      onClick={() => clickable && tapCell(i)}
                      disabled={!clickable}
                      className="border-4 border-black rounded-xl flex items-center justify-center transition-transform"
                      style={{
                        backgroundColor:
                          cell === 'X'
                            ? '#FFD1DC'
                            : cell === 'O'
                            ? '#D4F0F0'
                            : '#FFFDF5',
                        fontSize: 'clamp(40px, 12vw, 72px)',
                        lineHeight: 1,
                        fontWeight: 900,
                        color: '#000',
                        cursor: clickable
                          ? 'pointer'
                          : empty
                          ? 'not-allowed'
                          : 'default',
                        boxShadow: clickable ? '0 4px 0 0 black' : 'none',
                        transform: clickable ? 'translateY(-2px)' : 'none',
                      }}
                    >
                      {cell === 'X' ? '✕' : cell === 'O' ? '◯' : ''}
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              className="border-4 border-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-center"
              style={{
                backgroundColor:
                  match.status === 'finished'
                    ? match.winner === 'draw'
                      ? '#FFF5BA'
                      : match.winner === myMark
                      ? '#E2F0D9'
                      : '#FFD1DC'
                    : isMyTurn
                    ? '#E2F0D9'
                    : '#E6E6FA',
                padding: '16px',
              }}
            >
              {match.status === 'playing' && (
                <p className="font-black" style={{ fontSize: '14px', color: '#000' }}>
                  {isMyTurn
                    ? '🎯 your turn!'
                    : botThinking
                    ? '🤖 bot is thinking...'
                    : `⏳ waiting for ${shortName(
                        match.current_turn === 'X'
                          ? match.player_x_email
                          : match.player_o_email ?? ''
                      )}...`}
                </p>
              )}
              {match.status === 'finished' && (
                <p className="font-black" style={{ fontSize: '16px', color: '#000' }}>
                  {match.winner === 'draw'
                    ? "🤝 it's a draw"
                    : match.winner === myMark
                    ? '🏆 you win!'
                    : isBotMode
                    ? '🤖 bot wins!'
                    : '😔 you lost'}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              {match.status === 'finished' && (
                <button
                  onClick={playAgain}
                  className="flex-1 border-2 border-black bg-[#E2F0D9] text-black font-black text-xs rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition"
                  style={{ padding: '12px' }}
                >
                  ▶ play again
                </button>
              )}
              <button
                onClick={leaveMatch}
                className="flex-1 border-2 border-black bg-[#FFD1DC] text-black font-black text-xs rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition"
                style={{ padding: '12px' }}
              >
                {match.status === 'finished' ? 'exit' : 'leave match'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PlayerChip({
  label,
  mark,
  isMe,
  isTurn,
  isWinner,
}: {
  label: string;
  mark: 'X' | 'O';
  isMe: boolean;
  isTurn: boolean;
  isWinner: boolean;
}) {
  const bg = mark === 'X' ? '#FFD1DC' : '#D4F0F0';
  return (
    <div
      className="border-4 border-black rounded-2xl flex items-center transition-all"
      style={{
        backgroundColor: isWinner ? '#E2F0D9' : bg,
        padding: '10px 12px',
        gap: '10px',
        boxShadow: isTurn
          ? '0 0 0 4px #FF8BA7, 4px 4px 0 0 black'
          : '4px 4px 0 0 black',
        transform: isTurn ? 'translateY(-2px)' : 'none',
      }}
    >
      <span
        className="flex items-center justify-center border-2 border-black font-black shrink-0"
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '10px',
          backgroundColor: '#FFFDF5',
          fontSize: '18px',
          lineHeight: 1,
          color: '#000',
        }}
      >
        {mark === 'X' ? '✕' : '◯'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-black truncate" style={{ fontSize: '12px', color: '#000' }}>
          {label}
        </p>
        <p className="font-bold" style={{ fontSize: '9px', color: 'rgba(0,0,0,0.55)' }}>
          {isMe ? 'you' : 'opponent'}
          {isWinner ? ' · 🏆 winner' : isTurn ? ' · their turn' : ''}
        </p>
      </div>
    </div>
  );
}