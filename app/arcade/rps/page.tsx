'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Choice = 'rock' | 'paper' | 'scissors';

type Match = {
  id: string;
  player_a_id: string;
  player_a_email: string;
  player_a_choice: Choice | null;
  player_b_id: string | null;
  player_b_email: string | null;
  player_b_choice: Choice | null;
  round_number: number;
  score_a: number;
  score_b: number;
  status: string;
  winner: string | null;
  created_at: string;
  updated_at: string;
};

const EMOJI: Record<Choice, string> = {
  rock: '✊',
  paper: '✋',
  scissors: '✌️',
};

const LABEL: Record<Choice, string> = {
  rock: 'rock',
  paper: 'paper',
  scissors: 'scissors',
};

const ALL_CHOICES: Choice[] = ['rock', 'paper', 'scissors'];

function resolveRound(a: Choice, b: Choice): 'a' | 'b' | 'draw' {
  if (a === b) return 'draw';
  if (
    (a === 'rock' && b === 'scissors') ||
    (a === 'scissors' && b === 'paper') ||
    (a === 'paper' && b === 'rock')
  )
    return 'a';
  return 'b';
}

function shortName(email: string): string {
  return email.split('@')[0];
}

function randomBotChoice(): Choice {
  return ALL_CHOICES[Math.floor(Math.random() * ALL_CHOICES.length)];
}

export default function RpsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [match, setMatch] = useState<Match | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  // ---- Bot mode state (fully local) ----
  const [isBotMode, setIsBotMode] = useState(false);
  const [botMyChoice, setBotMyChoice] = useState<Choice | null>(null);
  const [botOppChoice, setBotOppChoice] = useState<Choice | null>(null);
  const [botMyScore, setBotMyScore] = useState(0);
  const [botOppScore, setBotOppScore] = useState(0);
  const [botRound, setBotRound] = useState(1);
  const [botStatus, setBotStatus] = useState<'playing' | 'finished'>('playing');
  const [botWinner, setBotWinner] = useState<'me' | 'bot' | null>(null);
  const [botThinking, setBotThinking] = useState(false);

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

  // Load active online match
  useEffect(() => {
    if (!userId) return;
    if (isBotMode) return; // skip when playing bot
    supabase
      .from('arcade_rps')
      .select('*')
      .or(`player_a_id.eq.${userId},player_b_id.eq.${userId}`)
      .in('status', ['waiting', 'playing', 'round_end'])
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (error) console.error(error);
        else setMatch(data && data.length > 0 ? (data[0] as Match) : null);
      });
  }, [userId, isBotMode]);

  // Realtime updates (online mode only)
  useEffect(() => {
    if (!match || isBotMode) return;
    const channel = supabase
      .channel(`rps-${match.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'arcade_rps', filter: `id=eq.${match.id}` },
        (payload) => setMatch(payload.new as Match)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [match?.id, isBotMode]);

  // Auto-advance round when both online choices are in
  useEffect(() => {
    if (isBotMode) return;
    if (!match) return;
    if (match.status !== 'playing') return;
    if (!match.player_a_choice || !match.player_b_choice) return;

    const winner = resolveRound(match.player_a_choice, match.player_b_choice);
    const newScoreA = match.score_a + (winner === 'a' ? 1 : 0);
    const newScoreB = match.score_b + (winner === 'b' ? 1 : 0);
    const isMatchOver = newScoreA >= 2 || newScoreB >= 2;

    const timer = setTimeout(async () => {
      if (isMatchOver) {
        const matchWinner = newScoreA > newScoreB ? 'A' : 'B';
        await supabase
          .from('arcade_rps')
          .update({
            status: 'finished',
            winner: matchWinner,
            score_a: newScoreA,
            score_b: newScoreB,
            updated_at: new Date().toISOString(),
          })
          .eq('id', match.id);
        return;
      }

      await supabase
        .from('arcade_rps')
        .update({
          player_a_choice: null,
          player_b_choice: null,
          score_a: newScoreA,
          score_b: newScoreB,
          round_number: match.round_number + 1,
          status: 'playing',
          updated_at: new Date().toISOString(),
        })
        .eq('id', match.id);
    }, 2000);

    return () => clearTimeout(timer);
  }, [match?.player_a_choice, match?.player_b_choice, match?.status, isBotMode]);

  // ---- ONLINE MODE ----
  async function quickMatch() {
    if (!userId || !email) return;
    setError('');
    setCreating(true);

    const { data: openGames, error: findErr } = await supabase
      .from('arcade_rps')
      .select('*')
      .eq('status', 'waiting')
      .neq('player_a_id', userId)
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
        .from('arcade_rps')
        .update({
          player_b_id: userId,
          player_b_email: email,
          status: 'playing',
          updated_at: new Date().toISOString(),
        })
        .eq('id', target.id)
        .select();

      if (error) setError('⚠️ ' + error.message);
      else if (!data || data.length === 0) setError('⚠️ Could not join — try again');
      else setMatch(data[0] as Match);
    } else {
      const { data, error } = await supabase
        .from('arcade_rps')
        .insert({
          player_a_id: userId,
          player_a_email: email,
          status: 'waiting',
        })
        .select();

      if (error) setError('⚠️ ' + error.message);
      else if (!data || data.length === 0) setError('⚠️ Could not create game');
      else setMatch(data[0] as Match);
    }
    setCreating(false);
  }

  async function pickChoice(choice: Choice) {
    if (!match || !userId) return;
    if (match.status !== 'playing') return;

    const isA = match.player_a_id === userId;
    const isB = match.player_b_id === userId;
    if (!isA && !isB) return;
    if (isA && match.player_a_choice) return;
    if (isB && match.player_b_choice) return;

    const updates: Partial<Match> = {};
    if (isA) updates.player_a_choice = choice;
    else updates.player_b_choice = choice;

    setMatch((prev) => (prev ? ({ ...prev, ...updates } as Match) : prev));

    const { error } = await supabase
      .from('arcade_rps')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', match.id);
    if (error) console.error(error);
  }

  async function leaveMatch() {
    if (!match) return;
    if (!confirm('Leave this match?')) return;
    await supabase.from('arcade_rps').delete().eq('id', match.id);
    setMatch(null);
  }

  async function playAgain() {
    if (!match) return;
    await supabase.from('arcade_rps').delete().eq('id', match.id);
    setMatch(null);
    setTimeout(() => quickMatch(), 100);
  }

  // ---- BOT MODE ----
  function startBotMatch() {
    setError('');
    setBotMyChoice(null);
    setBotOppChoice(null);
    setBotMyScore(0);
    setBotOppScore(0);
    setBotRound(1);
    setBotStatus('playing');
    setBotWinner(null);
    setBotThinking(false);
    setIsBotMode(true);
  }

  function pickBotChoice(choice: Choice) {
    if (botStatus !== 'playing') return;
    if (botMyChoice) return; // already picked this round
    setBotMyChoice(choice);
    setBotThinking(true);

    // Bot "thinks" for ~700ms then reveals its choice
    setTimeout(() => {
      const botChoice = randomBotChoice();
      setBotOppChoice(botChoice);
      setBotThinking(false);

      const result = resolveRound(choice, botChoice);

      const newMine = botMyScore + (result === 'a' ? 1 : 0);
      const newBot = botOppScore + (result === 'b' ? 1 : 0);

      // Advance round after 2-second reveal
      setTimeout(() => {
        setBotMyScore(newMine);
        setBotOppScore(newBot);

        const isOver = newMine >= 2 || newBot >= 2;

        if (isOver) {
          setBotStatus('finished');
          setBotWinner(newMine > newBot ? 'me' : 'bot');
          // Keep choices visible on the finished screen
        } else {
          setBotRound(botRound + 1);
          setBotMyChoice(null);
          setBotOppChoice(null);
        }
      }, 2000);
    }, 700);
  }

  function botPlayAgain() {
    setBotMyChoice(null);
    setBotOppChoice(null);
    setBotMyScore(0);
    setBotOppScore(0);
    setBotRound(1);
    setBotStatus('playing');
    setBotWinner(null);
    setBotThinking(false);
  }

  function leaveBotMatch() {
    if (!confirm('Leave this match?')) return;
    setIsBotMode(false);
    setBotMyChoice(null);
    setBotOppChoice(null);
    setBotMyScore(0);
    setBotOppScore(0);
    setBotRound(1);
    setBotStatus('playing');
    setBotWinner(null);
    setBotThinking(false);
  }

  // ---- Derived (online) ----
  const myRole: 'A' | 'B' | null = useMemo(() => {
    if (!match || !userId) return null;
    if (match.player_a_id === userId) return 'A';
    if (match.player_b_id === userId) return 'B';
    return null;
  }, [match, userId]);

  const myChoice = myRole === 'A' ? match?.player_a_choice : match?.player_b_choice;
  const opponentChoice = myRole === 'A' ? match?.player_b_choice : match?.player_a_choice;
  const myScore = myRole === 'A' ? match?.score_a : match?.score_b;
  const opponentScore = myRole === 'A' ? match?.score_b : match?.score_a;

  const roundWinner = useMemo(() => {
    if (!match?.player_a_choice || !match?.player_b_choice) return null;
    return resolveRound(match.player_a_choice, match.player_b_choice);
  }, [match?.player_a_choice, match?.player_b_choice]);

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
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white">
              ✊✋✌️ rps
            </h1>
            <p
              className="font-bold"
              style={{ fontSize: '10px', color: 'rgba(255,253,245,0.5)', marginTop: '2px' }}
            >
              {isBotMode
                ? 'playing vs bot 🤖 · best of 3'
                : 'best of 3 · first to 2 wins'}
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

        {/* ---------- BOT MODE ---------- */}
        {isBotMode && (
          <>
            {/* Scoreboard */}
            <div className="grid grid-cols-2 gap-3">
              <PlayerChip
                label={email ? shortName(email) : 'you'}
                isMe={true}
                score={botMyScore}
                hasPicked={!!botMyChoice}
                isWinner={botStatus === 'finished' && botWinner === 'me'}
              />
              <PlayerChip
                label="bot"
                isMe={false}
                score={botOppScore}
                hasPicked={!!botOppChoice}
                isWinner={botStatus === 'finished' && botWinner === 'bot'}
              />
            </div>

            {/* Center panel */}
            <div
              className="border-4 border-black rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center"
              style={{
                backgroundColor: '#FFFDF5',
                padding: '32px 24px',
                minHeight: '220px',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              {botStatus === 'playing' && !botMyChoice && (
                <>
                  <p className="font-black" style={{ fontSize: '16px', color: '#000' }}>
                    pick your move
                  </p>
                  <div className="flex" style={{ gap: '12px' }}>
                    {ALL_CHOICES.map((c) => (
                      <button
                        key={c}
                        onClick={() => pickBotChoice(c)}
                        className="border-4 border-black rounded-2xl hover:-translate-y-1 active:translate-y-0.5 transition"
                        style={{
                          width: '80px',
                          height: '80px',
                          backgroundColor: '#E6E6FA',
                          fontSize: '40px',
                          lineHeight: 1,
                          boxShadow: '4px 4px 0 0 black',
                        }}
                        aria-label={LABEL[c]}
                      >
                        {EMOJI[c]}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {botStatus === 'playing' && botMyChoice && !botOppChoice && (
                <>
                  <p className="font-black" style={{ fontSize: '16px', color: '#000' }}>
                    you picked {LABEL[botMyChoice]} {EMOJI[botMyChoice]}
                  </p>
                  <p
                    className="font-bold animate-pulse"
                    style={{ fontSize: '12px', color: 'rgba(0,0,0,0.55)' }}
                  >
                    🤖 bot is thinking...
                  </p>
                </>
              )}

              {botStatus === 'playing' && botMyChoice && botOppChoice && (
                <>
                  <p className="font-black" style={{ fontSize: '14px', color: '#000' }}>
                    reveal!
                  </p>
                  <div className="flex items-center" style={{ gap: '20px' }}>
                    <div className="flex flex-col items-center" style={{ gap: '6px' }}>
                      <span style={{ fontSize: '56px', lineHeight: 1 }}>
                        {EMOJI[botMyChoice]}
                      </span>
                      <span className="font-bold" style={{ fontSize: '10px', color: 'rgba(0,0,0,0.55)' }}>
                        you
                      </span>
                    </div>
                    <span className="font-black" style={{ fontSize: '20px', color: '#000' }}>
                      vs
                    </span>
                    <div className="flex flex-col items-center" style={{ gap: '6px' }}>
                      <span style={{ fontSize: '56px', lineHeight: 1 }}>
                        {EMOJI[botOppChoice]}
                      </span>
                      <span className="font-bold" style={{ fontSize: '10px', color: 'rgba(0,0,0,0.55)' }}>
                        bot
                      </span>
                    </div>
                  </div>
                  <p className="font-black" style={{ fontSize: '16px', color: '#000', marginTop: '4px' }}>
                    {(() => {
                      const r = resolveRound(botMyChoice, botOppChoice);
                      if (r === 'draw') return "🤝 it's a tie!";
                      if (r === 'a') return '🎯 you take this round!';
                      return '🤖 bot takes this round';
                    })()}
                  </p>
                </>
              )}

              {botStatus === 'finished' && (
                <>
                  <span style={{ fontSize: '56px', lineHeight: 1 }}>
                    {botWinner === 'me' ? '🏆' : '😔'}
                  </span>
                  <p
                    className="font-black"
                    style={{ fontSize: '20px', color: '#000', textAlign: 'center' }}
                  >
                    {botWinner === 'me' ? 'you beat the bot!' : 'bot wins this time'}
                  </p>
                  <p className="font-bold" style={{ fontSize: '12px', color: 'rgba(0,0,0,0.55)' }}>
                    final score: {botMyScore} - {botOppScore}
                  </p>
                </>
              )}
            </div>

            {botStatus !== 'finished' && (
              <p
                className="text-center font-black uppercase tracking-wider"
                style={{ fontSize: '10px', color: 'rgba(255,253,245,0.55)' }}
              >
                round {botRound}
              </p>
            )}

            <div className="flex gap-3">
              {botStatus === 'finished' && (
                <button
                  onClick={botPlayAgain}
                  className="flex-1 border-2 border-black bg-[#E2F0D9] text-black font-black text-xs rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition"
                  style={{ padding: '12px' }}
                >
                  ▶ play again
                </button>
              )}
              <button
                onClick={leaveBotMatch}
                className="flex-1 border-2 border-black bg-[#FFD1DC] text-black font-black text-xs rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition"
                style={{ padding: '12px' }}
              >
                {botStatus === 'finished' ? 'exit' : 'leave match'}
              </button>
            </div>
          </>
        )}

        {/* ---------- NO MATCH — LOBBY ---------- */}
        {!isBotMode && !match && (
          <div
            className="border-4 border-black rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] text-center flex flex-col items-center"
            style={{ backgroundColor: '#FFFDF5', padding: '40px 24px', gap: '14px' }}
          >
            <span style={{ fontSize: '40px' }}>✊✋✌️</span>
            <p className="font-black" style={{ fontSize: '16px', color: '#000' }}>
              ready to duel?
            </p>
            <p
              className="font-bold"
              style={{ fontSize: '11px', color: 'rgba(0,0,0,0.55)', maxWidth: '320px' }}
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

            <div className="flex flex-col sm:flex-row w-full" style={{ gap: '10px' }}>
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

        {/* ---------- WAITING FOR OPPONENT ---------- */}
        {!isBotMode && match && match.status === 'waiting' && (
          <div
            className="border-4 border-black rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center"
            style={{ backgroundColor: '#FFF5BA', padding: '40px 24px', gap: '14px' }}
          >
            <div className="animate-pulse font-black" style={{ fontSize: '40px' }}>
              ⏳
            </div>
            <p className="font-black" style={{ fontSize: '16px', color: '#000' }}>
              waiting for an opponent...
            </p>
            <p
              className="font-bold text-center"
              style={{ fontSize: '11px', color: 'rgba(0,0,0,0.55)', maxWidth: '300px' }}
            >
              you're first. once a friend joins, you both pick at the same time
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

        {/* ---------- ONLINE: PLAYING / FINISHED ---------- */}
        {!isBotMode && match && match.status !== 'waiting' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <PlayerChip
                label={shortName(match.player_a_email)}
                isMe={match.player_a_id === userId}
                score={match.score_a}
                hasPicked={!!match.player_a_choice}
                isWinner={match.status === 'finished' && match.winner === 'A'}
              />
              <PlayerChip
                label={match.player_b_email ? shortName(match.player_b_email) : '???'}
                isMe={match.player_b_id === userId}
                score={match.score_b}
                hasPicked={!!match.player_b_choice}
                isWinner={match.status === 'finished' && match.winner === 'B'}
              />
            </div>

            <div
              className="border-4 border-black rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center"
              style={{
                backgroundColor: '#FFFDF5',
                padding: '32px 24px',
                minHeight: '220px',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              {match.status === 'playing' && !myChoice && !opponentChoice && (
                <>
                  <p className="font-black" style={{ fontSize: '16px', color: '#000' }}>
                    pick your move
                  </p>
                  <div className="flex" style={{ gap: '12px' }}>
                    {ALL_CHOICES.map((c) => (
                      <button
                        key={c}
                        onClick={() => pickChoice(c)}
                        className="border-4 border-black rounded-2xl hover:-translate-y-1 active:translate-y-0.5 transition"
                        style={{
                          width: '80px',
                          height: '80px',
                          backgroundColor: '#E6E6FA',
                          fontSize: '40px',
                          lineHeight: 1,
                          boxShadow: '4px 4px 0 0 black',
                        }}
                        aria-label={LABEL[c]}
                      >
                        {EMOJI[c]}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {match.status === 'playing' && myChoice && !opponentChoice && (
                <>
                  <p className="font-black" style={{ fontSize: '16px', color: '#000' }}>
                    you picked {LABEL[myChoice]} {EMOJI[myChoice]}
                  </p>
                  <p
                    className="font-bold animate-pulse"
                    style={{ fontSize: '12px', color: 'rgba(0,0,0,0.55)' }}
                  >
                    waiting for opponent to pick...
                  </p>
                </>
              )}

              {match.status === 'playing' && !myChoice && opponentChoice && (
                <>
                  <p className="font-black" style={{ fontSize: '16px', color: '#000' }}>
                    opponent already picked
                  </p>
                  <p
                    className="font-bold animate-pulse"
                    style={{ fontSize: '12px', color: 'rgba(0,0,0,0.55)' }}
                  >
                    it's your turn!
                  </p>
                </>
              )}

              {match.status === 'playing' && myChoice && opponentChoice && (
                <>
                  <p className="font-black" style={{ fontSize: '14px', color: '#000' }}>
                    reveal!
                  </p>
                  <div className="flex items-center" style={{ gap: '20px' }}>
                    <div className="flex flex-col items-center" style={{ gap: '6px' }}>
                      <span style={{ fontSize: '56px', lineHeight: 1 }}>
                        {EMOJI[myChoice]}
                      </span>
                      <span className="font-bold" style={{ fontSize: '10px', color: 'rgba(0,0,0,0.55)' }}>
                        you
                      </span>
                    </div>
                    <span className="font-black" style={{ fontSize: '20px', color: '#000' }}>
                      vs
                    </span>
                    <div className="flex flex-col items-center" style={{ gap: '6px' }}>
                      <span style={{ fontSize: '56px', lineHeight: 1 }}>
                        {EMOJI[opponentChoice]}
                      </span>
                      <span className="font-bold" style={{ fontSize: '10px', color: 'rgba(0,0,0,0.55)' }}>
                        opponent
                      </span>
                    </div>
                  </div>
                  <p className="font-black" style={{ fontSize: '16px', color: '#000', marginTop: '4px' }}>
                    {roundWinner === 'draw'
                      ? "🤝 it's a tie!"
                      : (roundWinner === 'a' && myRole === 'A') ||
                        (roundWinner === 'b' && myRole === 'B')
                      ? '🎯 you take this round!'
                      : '😬 opponent takes this round'}
                  </p>
                </>
              )}

              {match.status === 'finished' && (
                <>
                  <span style={{ fontSize: '56px', lineHeight: 1 }}>
                    {match.winner === myRole ? '🏆' : '😔'}
                  </span>
                  <p
                    className="font-black"
                    style={{ fontSize: '20px', color: '#000', textAlign: 'center' }}
                  >
                    {match.winner === myRole ? 'you win the duel!' : 'you lost the duel'}
                  </p>
                  <p className="font-bold" style={{ fontSize: '12px', color: 'rgba(0,0,0,0.55)' }}>
                    final score: {myScore} - {opponentScore}
                  </p>
                </>
              )}
            </div>

            {match.status !== 'finished' && (
              <p
                className="text-center font-black uppercase tracking-wider"
                style={{ fontSize: '10px', color: 'rgba(255,253,245,0.55)' }}
              >
                round {match.round_number}
              </p>
            )}

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
  isMe,
  score,
  hasPicked,
  isWinner,
}: {
  label: string;
  isMe: boolean;
  score: number;
  hasPicked: boolean;
  isWinner: boolean;
}) {
  return (
    <div
      className="border-4 border-black rounded-2xl flex items-center transition-all"
      style={{
        backgroundColor: isWinner ? '#E2F0D9' : isMe ? '#FFD1DC' : '#D4F0F0',
        padding: '10px 12px',
        gap: '10px',
        boxShadow: '4px 4px 0 0 black',
      }}
    >
      <div
        className="flex items-center justify-center border-2 border-black font-black shrink-0"
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '12px',
          backgroundColor: '#FFFDF5',
          fontSize: '20px',
          lineHeight: 1,
          color: '#000',
        }}
      >
        {score}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-black truncate" style={{ fontSize: '12px', color: '#000' }}>
          {label}
        </p>
        <p className="font-bold" style={{ fontSize: '9px', color: 'rgba(0,0,0,0.55)' }}>
          {isMe ? 'you' : 'opponent'}
          {isWinner ? ' · 🏆' : hasPicked ? ' · ready' : ''}
        </p>
      </div>
    </div>
  );
}