'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useProfile, displayLabel } from '@/lib/use-profile';
import { SwipeCarousel } from '@/components/arnama/swipe-carousel';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

type Tune = {
  id: string;
  user_email: string;
  title: string;
  url: string;
  created_at: string;
};

type RoomState = {
  id: string;
  current_tune_id: string | null;
  current_video_id: string | null;
  is_playing: boolean;
  position_seconds: number;
  started_at: string | null;
  dj_user_id: string | null;
  dj_email: string | null;
  updated_at: string;
  updated_by: string | null;
};

function extractVideoId(url: string): string | null {
  const t = url.trim();
  const m = t.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/
  );
  return m ? m[1] : null;
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function expectedPosition(room: RoomState | null): number {
  if (!room) return 0;
  if (!room.is_playing || !room.started_at) return room.position_seconds ?? 0;
  const elapsed = (Date.now() - new Date(room.started_at).getTime()) / 1000;
  return (room.position_seconds ?? 0) + elapsed;
}

export default function TunesPage() {
  const { profile } = useProfile();
  const displayName = profile
    ? displayLabel(profile.email, profile.display_name)
    : '';

  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [tunes, setTunes] = useState<Tune[]>([]);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [loading, setLoading] = useState(true);
  const [listeners, setListeners] = useState(1);

  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  // 0 = room, 1 = solo
  const [tabIndex, setTabIndex] = useState(0);
  const roomMode = tabIndex === 0;

  // Solo mode state
  const [localVideoId, setLocalVideoId] = useState<string | null>(null);
  const [localTitle, setLocalTitle] = useState<string | null>(null);
  const localPositionRef = useRef(0);

  const [ytReady, setYtReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  const playerRef = useRef<any>(null);
  const suppressSyncRef = useRef(false);
  const roomRef = useRef<RoomState | null>(null);

  const roomVideoId = room?.current_video_id ?? null;
  const roomTune = room?.current_tune_id
    ? tunes.find((t) => t.id === room.current_tune_id) ?? null
    : null;
  const isDJ = !!userId && room?.dj_user_id === userId;
  const djName = room?.dj_email ? room.dj_email.split('@')[0] : null;

  // =========================
  // AUTH
  // =========================
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
      }
    });
  }, []);

  // =========================
  // LOAD TUNES
  // =========================
  useEffect(() => {
    if (!email) return;
    supabase
      .from('tunes')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error(error);
        else setTunes(data ?? []);
      });
  }, [email]);

  // =========================
  // LOAD ROOM
  // =========================
  useEffect(() => {
    if (!email) return;
    supabase
      .from('listening_rooms')
      .select('*')
      .eq('id', 'main')
      .single()
      .then(({ data, error }) => {
        if (error) console.error(error);
        else setRoom(data);
      });
  }, [email]);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  // =========================
  // ROOM REALTIME
  // =========================
  useEffect(() => {
    if (!email) return;
    const channel = supabase
      .channel('room-live')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'listening_rooms' },
        (payload) => {
          setRoom(payload.new as RoomState);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [email]);

  // =========================
  // YT IFRAME API
  // =========================
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.YT && window.YT.Player) {
      setYtReady(true);
      return;
    }
    if (!document.querySelector('script[src*="iframe_api"]')) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(s);
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      setYtReady(true);
    };
  }, []);

  // =========================
  // CREATE / RECREATE PLAYER
  // =========================
  useEffect(() => {
    if (!ytReady) return;

    // Destroy any existing player
    if (playerRef.current) {
      try {
        playerRef.current.destroy();
      } catch {}
      playerRef.current = null;
    }

    const activeVideoId = roomMode ? roomVideoId : localVideoId;
    if (!activeVideoId) return;

    const containerId = roomMode ? 'yt-player-room' : 'yt-player-solo';
    const container = document.getElementById(containerId);
    if (!container) {
      // Container not yet rendered — retry once on next tick
      const retry = setTimeout(() => {
        const c2 = document.getElementById(containerId);
        if (c2) createPlayer(c2, activeVideoId);
      }, 80);
      return () => clearTimeout(retry);
    }

    createPlayer(container, activeVideoId);

    function createPlayer(el: HTMLElement, videoId: string) {
      const r = roomRef.current;

      let initialPos = 0;
      let shouldAutoplay = false;

      if (roomMode) {
        initialPos = expectedPosition(r);
        shouldAutoplay = !!r?.is_playing;
      } else {
        initialPos = localPositionRef.current;
        shouldAutoplay = false;
      }

      playerRef.current = new window.YT.Player(containerId, {
        videoId,
        playerVars: {
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          iv_load_policy: 3,
          enablejsapi: 1,
          origin:
            typeof window !== 'undefined' ? window.location.origin : '',
        },
        events: {
          onReady: (event: any) => {
            setDuration(event.target.getDuration() || 0);
            if (initialPos > 0) {
              try {
                event.target.seekTo(initialPos, true);
              } catch {}
            }
            if (shouldAutoplay) {
              try {
                event.target.playVideo();
              } catch {}
            }
          },
          onStateChange: (event: any) => {
            const s = event.data;
            if (s === 1) setIsPlaying(true);
            else if (s === 2) setIsPlaying(false);
          },
        },
      });
    }
  }, [ytReady, roomMode, roomVideoId, localVideoId]);

  // =========================
  // SYNC ENGINE (room mode only)
  // =========================
  useEffect(() => {
    if (!roomMode) return;
    if (!playerRef.current || !room || !ytReady) return;
    if (!playerRef.current.getCurrentTime) return;

    if (suppressSyncRef.current) {
      suppressSyncRef.current = false;
      return;
    }

    const expected = expectedPosition(room);
    let current = 0;
    try {
      current = playerRef.current.getCurrentTime();
    } catch {
      return;
    }

    if (Math.abs(current - expected) > 2) {
      try {
        playerRef.current.seekTo(expected, true);
        setPosition(expected);
      } catch {}
    }

    try {
      const state = playerRef.current.getPlayerState();
      if (room.is_playing && state !== 1) {
        playerRef.current.playVideo();
      } else if (!room.is_playing && state === 1) {
        playerRef.current.pauseVideo();
      }
    } catch {}
  }, [room, ytReady, roomMode]);

  // =========================
  // POLL POSITION
  // =========================
  useEffect(() => {
    if (!isPlaying) return;
    const i = setInterval(() => {
      try {
        if (playerRef.current?.getCurrentTime) {
          const pos = playerRef.current.getCurrentTime();
          setPosition(pos);
          if (!roomMode) localPositionRef.current = pos;
        }
        if (playerRef.current?.getDuration) {
          const d = playerRef.current.getDuration();
          if (d && d > 0) setDuration(d);
        }
      } catch {}
    }, 500);
    return () => clearInterval(i);
  }, [isPlaying, roomMode]);

  // =========================
  // PRESENCE
  // =========================
  useEffect(() => {
    if (!email || !userId) return;
    const ch = supabase.channel('listening-presence', {
      config: { presence: { key: userId } },
    });
    ch.on('presence', { event: 'sync' }, () => {
      setListeners(Object.keys(ch.presenceState()).length);
    }).subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ user_id: userId, email });
      }
    });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [email, userId]);

  // =========================
  // ACTIONS
  // =========================
  async function updateRoom(updates: Partial<RoomState>) {
    if (!userId || !email) return;
    suppressSyncRef.current = true;
    const { error } = await supabase
      .from('listening_rooms')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
        updated_by: email,
      })
      .eq('id', 'main');
    if (error) {
      console.error(error);
      suppressSyncRef.current = false;
    }
  }

  async function takeTheWheel() {
    if (!userId || !email) return;
    await updateRoom({ dj_user_id: userId, dj_email: email });
  }

  async function playTune(tune: Tune) {
    const videoId = extractVideoId(tune.url);
    if (!videoId) {
      alert('Only YouTube links work in the player');
      return;
    }

    if (roomMode) {
      if (!isDJ) return;
      await updateRoom({
        current_tune_id: tune.id,
        current_video_id: videoId,
        is_playing: true,
        position_seconds: 0,
        started_at: new Date().toISOString(),
      });
    } else {
      // Solo mode — play locally
      localPositionRef.current = 0;
      setLocalVideoId(videoId);
      setLocalTitle(tune.title);
    }
  }

  function togglePlay() {
    if (!playerRef.current) return;
    if (roomMode && !isDJ) return;

    const next = !isPlaying;

    if (roomMode) {
      let pos = 0;
      try {
        pos = playerRef.current.getCurrentTime() || 0;
      } catch {}
      updateRoom({
        is_playing: next,
        position_seconds: pos,
        started_at: next ? new Date().toISOString() : null,
      });
    } else {
      try {
        if (next) playerRef.current.playVideo();
        else playerRef.current.pauseVideo();
      } catch {}
    }
  }

  function seekTo(sec: number) {
    if (!playerRef.current) return;
    if (roomMode && !isDJ) return;

    try {
      playerRef.current.seekTo(sec, true);
    } catch {}
    setPosition(sec);

    if (roomMode) {
      updateRoom({
        position_seconds: sec,
        started_at: room?.is_playing ? new Date().toISOString() : null,
      });
    } else {
      localPositionRef.current = sec;
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const t = title.trim();
    const u = url.trim();
    if (!t || !u || !email) return;
    const videoId = extractVideoId(u);
    if (!videoId) {
      setError('⚠️ Only YouTube links work in the player for now');
      return;
    }
    setAdding(true);
    const { data, error } = await supabase
      .from('tunes')
      .insert({ user_email: email, title: t, url: u })
      .select()
      .single();
    if (error) setError('⚠️ ' + error.message);
    else if (data) {
      setTunes((prev) => [data as Tune, ...prev]);
      setTitle('');
      setUrl('');
    }
    setAdding(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this tune?')) return;
    const { error } = await supabase.from('tunes').delete().eq('id', id);
    if (!error) setTunes((prev) => prev.filter((t) => t.id !== id));
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#1a0b2e] flex items-center justify-center text-white font-mono">
        loading...
      </div>
    );
  }

  const progressPercent = duration > 0 ? (position / duration) * 100 : 0;

  // =========================
  // RENDER A SLIDE (room or solo)
  // =========================
  function renderSlide(mode: 'room' | 'solo') {
    const modeIsRoom = mode === 'room';
    const isActive =
      (modeIsRoom && tabIndex === 0) || (!modeIsRoom && tabIndex === 1);

    const activeVideoId = modeIsRoom ? roomVideoId : localVideoId;
    const activeTune = modeIsRoom
      ? roomTune
      : localTitle
      ? ({
          id: 'solo',
          user_email: email ?? '',
          title: localTitle,
          url: '',
          created_at: '',
        } as Tune)
      : null;

    const controlsEnabled = modeIsRoom ? isDJ : true;

    return (
      <div
        style={{
          height: '100%',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          padding: '0 4px 16px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* NOW PLAYING CARD */}
        <div
          className="border-4 border-black rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] shrink-0"
          style={{
            background: `
              linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
              rgba(255,253,245,0.92)
            `,
            backdropFilter: 'blur(16px) saturate(160%)',
            WebkitBackdropFilter: 'blur(16px) saturate(160%)',
            padding: '16px',
          }}
        >
          <div
            className="flex items-center justify-between mb-3"
            style={{ gap: '8px' }}
          >
            <p
              className="font-black text-black flex items-center"
              style={{ fontSize: '12px', gap: '8px' }}
            >
              <span
                className="inline-block"
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: isPlaying ? '#9BC5A8' : '#E5989B',
                  border: '2px solid black',
                }}
              />
              {modeIsRoom ? 'NOW PLAYING' : 'PLAYING (SOLO)'}
            </p>
            {modeIsRoom && (
              <span
                className="font-bold text-black/60"
                style={{ fontSize: '10px' }}
              >
                ● {listeners} listening
              </span>
            )}
            {!modeIsRoom && (
              <span
                className="font-bold text-black/60"
                style={{ fontSize: '10px' }}
              >
                🎵 just you
              </span>
            )}
          </div>

          {!activeTune ? (
            <p
              className="text-black/50 font-bold text-center"
              style={{ padding: '24px 0', fontSize: '13px' }}
            >
              nothing playing — pick a tune below 👇
            </p>
          ) : (
            <div className="flex flex-col" style={{ gap: '12px' }}>
              <div className="flex items-start justify-between gap-2 min-w-0">
                <div className="min-w-0 flex-1">
                  <p
                    className="font-black text-black truncate"
                    style={{ fontSize: '15px' }}
                  >
                    {activeTune.title}
                  </p>
                  <p
                    className="text-black/50 font-bold truncate"
                    style={{ fontSize: '11px' }}
                  >
                    {modeIsRoom
                      ? `${
                          activeTune.user_email === email
                            ? 'added by you'
                            : `added by ${
                                activeTune.user_email.split('@')[0]
                              }`
                        }${
                          djName
                            ? ` · DJ: ${
                                djName === (displayName || '') ? 'you' : djName
                              }`
                            : ''
                        }`
                      : 'playing locally'}
                  </p>
                </div>

                {modeIsRoom && !isDJ && (
                  <button
                    onClick={takeTheWheel}
                    className="shrink-0 border-2 border-black bg-[#FFF5BA] text-black font-black rounded-full hover:-translate-y-0.5 active:translate-y-0.5 transition"
                    style={{
                      padding: '6px 12px',
                      fontSize: '10px',
                      boxShadow: '2px 2px 0 0 black',
                    }}
                  >
                    ✋ take the wheel
                  </button>
                )}
                {modeIsRoom && isDJ && (
                  <span
                    className="shrink-0 border-2 border-black bg-[#FF8BA7] text-black font-black rounded-full"
                    style={{
                      padding: '5px 11px',
                      fontSize: '10px',
                      boxShadow: '2px 2px 0 0 black',
                    }}
                  >
                    🎧 you're DJ
                  </span>
                )}
                {!modeIsRoom && (
                  <span
                    className="shrink-0 border-2 border-black bg-[#FFF5BA] text-black font-black rounded-full"
                    style={{
                      padding: '5px 11px',
                      fontSize: '10px',
                      boxShadow: '2px 2px 0 0 black',
                    }}
                  >
                    🎵 solo
                  </span>
                )}
              </div>

              {/* PLAYER — only rendered in the active slide */}
              {isActive && (
                <div
                  style={{
                    border: '3px solid black',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    backgroundColor: '#000',
                    aspectRatio: '16 / 9',
                    width: '100%',
                  }}
                >
                  <div
                    id={modeIsRoom ? 'yt-player-room' : 'yt-player-solo'}
                    style={{ width: '100%', height: '100%' }}
                  />
                </div>
              )}

              {/* CONTROLS */}
              <div className="flex items-center" style={{ gap: '12px' }}>
                <button
                  onClick={togglePlay}
                  disabled={!controlsEnabled}
                  className="shrink-0 inline-flex items-center justify-center border-2 border-black bg-[#E2F0D9] text-black font-black rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                  style={{ width: '48px', height: '48px', fontSize: '18px' }}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? '⏸' : '▶'}
                </button>

                <div className="flex-1 flex flex-col" style={{ gap: '4px' }}>
                  <div
                    className="relative w-full border-2 border-black rounded-full"
                    style={{
                      height: '12px',
                      background: `linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(255,255,255,0.4) 100%), #FFFDF5`,
                      overflow: 'hidden',
                      cursor:
                        duration > 0 && controlsEnabled ? 'pointer' : 'default',
                    }}
                    onClick={(e) => {
                      if (!duration || !controlsEnabled) return;
                      const rect = (
                        e.currentTarget as HTMLDivElement
                      ).getBoundingClientRect();
                      const ratio = (e.clientX - rect.left) / rect.width;
                      seekTo(Math.max(0, Math.min(1, ratio)) * duration);
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        bottom: 0,
                        width: `${progressPercent}%`,
                        background: `linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 50%), #9BC5A8`,
                        borderRadius:
                          progressPercent >= 99 ? '0' : '0 999px 999px 0',
                      }}
                    />
                  </div>
                  <div
                    className="flex justify-between font-bold text-black/60"
                    style={{ fontSize: '10px' }}
                  >
                    <span>{formatTime(position)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>
              </div>

              {modeIsRoom && !isDJ && (
                <p
                  className="text-center font-bold text-black/50"
                  style={{ fontSize: '10px' }}
                >
                  🔒 only the DJ can control playback · swipe right for solo
                </p>
              )}
              {!modeIsRoom && (
                <p
                  className="text-center font-bold text-black/50"
                  style={{ fontSize: '10px' }}
                >
                  🎵 you're listening alone · swipe left to join the room
                </p>
              )}
            </div>
          )}
        </div>

        {/* ADD FORM */}
        <form
          onSubmit={handleAdd}
          className="border-4 border-black rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col shrink-0"
          style={{
            background: `
              linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
              rgba(230,230,250,0.9)
            `,
            padding: '16px',
            gap: '10px',
          }}
        >
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="what's it called?"
            disabled={adding}
            className="w-full border-2 border-black rounded-lg bg-white text-black text-sm focus:outline-none disabled:opacity-50"
            style={{ padding: '11px 16px' }}
          />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="paste youtube link"
            disabled={adding}
            className="w-full border-2 border-black rounded-lg bg-white text-black text-sm focus:outline-none disabled:opacity-50"
            style={{ padding: '11px 16px' }}
          />
          {error && (
            <div
              className="border-2 border-black bg-white text-black text-sm font-bold rounded-lg"
              style={{ padding: '10px 14px' }}
            >
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={adding || !title.trim() || !url.trim()}
            className="inline-flex items-center justify-center border-2 border-black bg-[#E2F0D9] text-black text-xs font-black rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition disabled:opacity-50 disabled:hover:translate-y-0"
            style={{ padding: '11px 18px', gap: '8px' }}
          >
            <span className="text-sm leading-none">
              {adding ? '···' : '▶'}
            </span>
            <span className="leading-none tracking-wider">
              {adding ? 'ADDING' : 'ADD TUNE'}
            </span>
          </button>
        </form>

        {/* QUEUE */}
        <div className="shrink-0">
          <p
            className="font-black text-white uppercase tracking-wider"
            style={{
              fontSize: '11px',
              marginBottom: '10px',
              paddingLeft: '4px',
            }}
          >
            🎵 the queue
          </p>

          {tunes.length === 0 ? (
            <div
              className="border-4 border-black bg-[#FFFDF5] rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] text-center"
              style={{ padding: '32px 20px' }}
            >
              <p className="text-black font-bold text-sm">
                no tunes yet — drop the first one 🎧
              </p>
            </div>
          ) : (
            <div className="flex flex-col" style={{ gap: '10px' }}>
              {tunes.map((t) => {
                const isCurrentRoom =
                  modeIsRoom && t.id === room?.current_tune_id;
                const isCurrentSolo =
                  !modeIsRoom && localTitle === t.title;
                const isCurrent = isCurrentRoom || isCurrentSolo;
                const addedBy = t.user_email.split('@')[0];
                const mine = t.user_email === email;
                const canPlay = modeIsRoom ? isDJ : true;

                return (
                  <div
                    key={t.id}
                    className="border-4 border-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center justify-between transition"
                    style={{
                      padding: '12px 14px',
                      gap: '12px',
                      background: isCurrent
                        ? `linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%), #E2F0D9`
                        : `linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%), #FFFDF5`,
                    }}
                  >
                    <button
                      onClick={() => playTune(t)}
                      disabled={!canPlay}
                      className="flex items-center text-left min-w-0 flex-1 disabled:cursor-not-allowed"
                      style={{ gap: '12px' }}
                    >
                      <span
                        className="gloss-shine shrink-0 inline-flex items-center justify-center border-2 border-black font-black"
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: `
                            linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
                            ${isCurrent ? '#9BC5A8' : '#FFD1DC'}
                          `,
                          fontSize: '12px',
                        }}
                      >
                        {isCurrent && isPlaying ? '⏸' : '▶'}
                      </span>
                      <div className="min-w-0">
                        <p
                          className="font-black text-black truncate"
                          style={{ fontSize: '13px' }}
                        >
                          {t.title}
                        </p>
                        <p
                          className="font-bold text-black/50 truncate"
                          style={{ fontSize: '10px' }}
                        >
                          {isCurrent ? 'now playing · ' : ''}
                          added by {mine ? 'you' : addedBy}
                        </p>
                      </div>
                    </button>
                    {mine && (
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="shrink-0 border-2 border-black bg-[#FFD1DC] text-black rounded-lg font-black hover:-translate-y-0.5 active:translate-y-0.5 transition"
                        style={{ padding: '6px 10px', fontSize: '11px' }}
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

  return (
    <div className="fixed inset-0 bg-[#1a0b2e] font-mono flex justify-center overflow-hidden">
      <div
        className="w-full max-w-3xl h-full flex flex-col p-3 sm:p-6 gap-3 sm:gap-4"
        style={{ minHeight: 0 }}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="gloss-shine flex size-10 sm:size-12 shrink-0 items-center justify-center rounded-2xl border-4 border-black"
              style={{
                background: `
                  linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
                  #E2F0D9
                `,
                fontSize: '20px',
              }}
            >
              🎵
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-black text-lg sm:text-2xl leading-tight text-white">
                shared tunes
              </h1>
              <p className="text-[10px] sm:text-xs font-bold leading-tight text-white/60">
                {roomMode
                  ? `listening room · ${listeners} listening`
                  : 'solo mode · just you'}
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

        {/* CAROUSEL: room ↔ solo */}
        <SwipeCarousel
          mode="fill"
          index={tabIndex}
          onIndexChange={setTabIndex}
          labels={['🎧 room mode', '🎵 solo mode']}
          slides={[renderSlide('room'), renderSlide('solo')]}
        />
      </div>
    </div>
  );
}