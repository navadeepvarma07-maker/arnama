'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

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
  updated_at: string;
  updated_by: string | null;
};

type Source = 'youtube' | 'spotify';

function detectSource(url: string): Source | null {
  const t = url.trim();
  if (/open\.spotify\.com/i.test(t)) return 'spotify';
  if (/(?:youtube\.com|youtu\.be|music\.youtube\.com)/i.test(t)) return 'youtube';
  return null;
}

function extractYouTubeId(url: string): string | null {
  const m = url
    .trim()
    .match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|music\.youtube\.com\/watch\?v=|youtube\.com\/shorts\/)([a-zA-Z0-9_-]+)/
    );
  return m ? m[1] : null;
}

function extractSpotifyEmbed(
  url: string
): { type: string; id: string; height: number } | null {
  const t = url.trim();
  const track = t.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
  if (track) return { type: 'track', id: track[1], height: 152 };
  const album = t.match(/open\.spotify\.com\/album\/([a-zA-Z0-9]+)/);
  if (album) return { type: 'album', id: album[1], height: 352 };
  const playlist = t.match(/open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
  if (playlist) return { type: 'playlist', id: playlist[1], height: 352 };
  return null;
}

function formatTime(sec: number): string {
  const s = Math.floor(sec || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export default function TunesPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [tunes, setTunes] = useState<Tune[]>([]);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [loading, setLoading] = useState(true);
  const [listeners, setListeners] = useState(1);

  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const [ytReady, setYtReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  const playerRef = useRef<any>(null);
  const suppressRef = useRef(false);

  const currentTune = room?.current_tune_id
    ? tunes.find((t) => t.id === room.current_tune_id) ?? null
    : null;

  const currentSource = currentTune ? detectSource(currentTune.url) : null;

  // Auth + mark tunes as caught-up
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
          .from('profiles')
          .update({ last_seen_tunes_at: new Date().toISOString() })
          .eq('id', user!.id)
          .then(({ error }) => {
            if (error) console.error('last_seen_tunes update failed:', error);
          });
      }
    });
  }, []);

  // Load tunes
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

  // Load room
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

  // Realtime room updates
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

  // Load YouTube API
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

  const ytVideoId =
    currentTune && currentSource === 'youtube'
      ? extractYouTubeId(currentTune.url)
      : null;

  // Create YT player when YouTube video changes
  useEffect(() => {
    if (!ytReady || !ytVideoId) return;
    if (playerRef.current) {
      try {
        playerRef.current.destroy();
      } catch {}
      playerRef.current = null;
    }

    playerRef.current = new window.YT.Player('yt-player', {
      videoId: ytVideoId,
      playerVars: {
        controls: 0,
        disablekb: 1,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        iv_load_policy: 3,
        enablejsapi: 1,
        origin: typeof window !== 'undefined' ? window.location.origin : '',
      },
      events: {
        onReady: (event: any) => {
          setDuration(event.target.getDuration() || 0);
          if (room?.is_playing) {
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
  }, [ytReady, ytVideoId]);

  // Apply room play/pause to YT player
  useEffect(() => {
    if (!playerRef.current || !room || currentSource !== 'youtube') return;
    if (suppressRef.current) {
      suppressRef.current = false;
      return;
    }
    try {
      if (room.is_playing) playerRef.current.playVideo();
      else playerRef.current.pauseVideo();
    } catch {}
  }, [room?.is_playing, room?.updated_at, currentSource]);

  // Poll position while playing
  useEffect(() => {
    if (!isPlaying || currentSource !== 'youtube') return;
    const i = setInterval(() => {
      try {
        if (playerRef.current?.getCurrentTime) {
          setPosition(playerRef.current.getCurrentTime());
        }
        if (playerRef.current?.getDuration) {
          setDuration(playerRef.current.getDuration());
        }
      } catch {}
    }, 500);
    return () => clearInterval(i);
  }, [isPlaying, currentSource]);

  // ==========================================
  // MEDIA SESSION — lock screen controls + art
  // ==========================================
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    if (!('mediaSession' in navigator)) return;

    if (!currentTune) {
      try {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
      } catch {}
      return;
    }

    const senderName =
      currentTune.user_email === email
        ? 'you'
        : currentTune.user_email.split('@')[0];

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTune.title,
        artist: `added by ${senderName}`,
        album: 'arnama · shared tunes',
        artwork: [
          {
            src: '/icon.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: '/icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
          },
        ],
      });
    } catch (err) {
      console.debug('MediaSession metadata error:', err);
    }

    if (currentSource === 'youtube') {
      const handlers: [
        MediaSessionAction,
        ((details: any) => void) | null
      ][] = [
        [
          'play',
          () => {
            try {
              playerRef.current?.playVideo();
            } catch {}
          },
        ],
        [
          'pause',
          () => {
            try {
              playerRef.current?.pauseVideo();
            } catch {}
          },
        ],
        [
          'seekbackward',
          (details: any) => {
            try {
              const t = playerRef.current?.getCurrentTime?.() ?? 0;
              playerRef.current?.seekTo(
                Math.max(0, t - (details?.seekOffset ?? 10)),
                true
              );
            } catch {}
          },
        ],
        [
          'seekforward',
          (details: any) => {
            try {
              const t = playerRef.current?.getCurrentTime?.() ?? 0;
              const dur = playerRef.current?.getDuration?.() ?? 0;
              playerRef.current?.seekTo(
                Math.min(dur, t + (details?.seekOffset ?? 10)),
                true
              );
            } catch {}
          },
        ],
        [
          'seekto',
          (details: any) => {
            try {
              if (details?.seekTime != null) {
                playerRef.current?.seekTo(details.seekTime, true);
              }
            } catch {}
          },
        ],
      ];

      for (const [action, handler] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, handler);
        } catch {}
      }
    } else {
      // Spotify — no JS control, clear actions
      const actions: MediaSessionAction[] = [
        'play',
        'pause',
        'seekbackward',
        'seekforward',
        'seekto',
      ];
      for (const action of actions) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {}
      }
    }

    return () => {
      if (!('mediaSession' in navigator)) return;
      const actions: MediaSessionAction[] = [
        'play',
        'pause',
        'seekbackward',
        'seekforward',
        'seekto',
      ];
      for (const action of actions) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {}
      }
    };
  }, [currentTune?.id, currentSource, email]);

  // Keep OS playback state in sync
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = isPlaying
        ? 'playing'
        : 'paused';
    } catch {}
  }, [isPlaying]);

  // Presence
  useEffect(() => {
    if (!email) return;
    const ch = supabase.channel('listening-presence', {
      config: { presence: { key: email } },
    });
    ch.on('presence', { event: 'sync' }, () => {
      setListeners(Object.keys(ch.presenceState()).length);
    }).subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ email, at: Date.now() });
      }
    });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [email]);

  async function updateRoom(updates: Partial<RoomState>) {
    if (!email) return;
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
    }
  }

  async function playTune(tune: Tune) {
    const source = detectSource(tune.url);
    if (!source) {
      alert('Only YouTube or Spotify links work');
      return;
    }
    const ytId = source === 'youtube' ? extractYouTubeId(tune.url) : null;

    await updateRoom({
      current_tune_id: tune.id,
      current_video_id: ytId,
      is_playing: source === 'youtube',
      position_seconds: 0,
    });
  }

  function togglePlay() {
    if (!playerRef.current || currentSource !== 'youtube') return;

    suppressRef.current = true;
    try {
      if (isPlaying) {
        playerRef.current.pauseVideo();
        setIsPlaying(false);
      } else {
        playerRef.current.playVideo();
        setIsPlaying(true);
      }
    } catch {}

    updateRoom({ is_playing: !isPlaying });
  }

  function seekTo(sec: number) {
    if (!playerRef.current || currentSource !== 'youtube') return;
    suppressRef.current = true;
    try {
      playerRef.current.seekTo(sec, true);
    } catch {}
    setPosition(sec);
    updateRoom({ position_seconds: sec });
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const t = title.trim();
    const u = url.trim();
    if (!t || !u || !email) return;

    const source = detectSource(u);
    if (!source) {
      setError('⚠️ Only YouTube or Spotify links work');
      return;
    }
    if (source === 'youtube' && !extractYouTubeId(u)) {
      setError('⚠️ That YouTube URL looks wrong');
      return;
    }
    if (source === 'spotify' && !extractSpotifyEmbed(u)) {
      setError('⚠️ That Spotify URL looks wrong');
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
      <div className="min-h-screen bg-[#1a0b2e] flex items-center justify-center text-white font-mono">
        loading...
      </div>
    );
  }

  const progressPercent = duration > 0 ? (position / duration) * 100 : 0;

  let mediaArea: React.ReactNode = null;

  if (currentTune && currentSource === 'youtube' && ytVideoId) {
    mediaArea = (
      <>
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
            key={ytVideoId}
            id="yt-player"
            style={{ width: '100%', height: '100%' }}
          />
        </div>

        {/* Custom controls */}
        <div className="flex items-center" style={{ gap: '12px' }}>
          <button
            onClick={togglePlay}
            className="shrink-0 inline-flex items-center justify-center border-2 border-black bg-[#E2F0D9] text-black font-black rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition"
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
                backgroundColor: '#F0EAD6',
                overflow: 'hidden',
                cursor: duration > 0 ? 'pointer' : 'default',
              }}
              onClick={(e) => {
                if (!duration) return;
                const rect = (
                  e.currentTarget as HTMLDivElement
                ).getBoundingClientRect();
                const ratio = (e.clientX - rect.left) / rect.width;
                seekTo(Math.max(0, Math.min(1, ratio)) * duration);
              }}
            >
              <div
                className="h-full transition-all"
                style={{
                  width: `${progressPercent}%`,
                  backgroundColor: '#9BC5A8',
                }}
              />
            </div>
            <div
              className="flex justify-between font-bold"
              style={{ fontSize: '10px', color: 'black' }}
            >
              <span>{formatTime(position)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </div>
      </>
    );
  } else if (currentTune && currentSource === 'spotify') {
    const sp = extractSpotifyEmbed(currentTune.url);
    mediaArea = sp ? (
      <div className="flex flex-col" style={{ gap: '8px' }}>
        <iframe
          src={`https://open.spotify.com/embed/${sp.type}/${sp.id}`}
          width="100%"
          height={sp.height}
          frameBorder="0"
          allow="encrypted-media; clipboard-write; picture-in-picture"
          style={{
            border: '3px solid black',
            borderRadius: '12px',
            display: 'block',
          }}
        />
        <p
          className="font-bold text-center"
          style={{ fontSize: '10px', color: 'black' }}
        >
          spotify plays in its own player — hit ▶ on your device
        </p>
      </div>
    ) : null;
  }

  return (
    <div className="min-h-screen bg-[#1a0b2e] p-4 sm:p-6 font-mono flex flex-col">
      <div className="w-full max-w-2xl mx-auto flex flex-col gap-4">

        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <h1 className="text-xl sm:text-2xl font-black text-white">
            🎵 shared tunes
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

        {/* Now playing */}
        <div
          className="border-4 border-black rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
          style={{ backgroundColor: '#FFFDF5', padding: '16px' }}
        >
          <div
            className="flex items-center justify-between"
            style={{ marginBottom: '12px' }}
          >
            <p
              className="font-black flex items-center"
              style={{ fontSize: '12px', gap: '8px', color: 'black' }}
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
              NOW PLAYING
            </p>
            <span
              className="font-bold"
              style={{ fontSize: '11px', color: 'black' }}
            >
              ● {listeners} listening
            </span>
          </div>

          {!currentTune ? (
            <p
              className="font-bold text-center"
              style={{
                padding: '24px 0',
                fontSize: '13px',
                color: 'rgba(0,0,0,0.5)',
              }}
            >
              nothing playing — pick a tune below 👇
            </p>
          ) : (
            <div className="flex flex-col" style={{ gap: '12px' }}>
              <div
                className="min-w-0 flex items-center"
                style={{ gap: '8px' }}
              >
                <span
                  className="shrink-0 font-black border-2 border-black rounded-full"
                  style={{
                    fontSize: '9px',
                    padding: '2px 8px',
                    backgroundColor:
                      currentSource === 'spotify' ? '#1DB954' : '#FF0000',
                    color: 'white',
                  }}
                >
                  {currentSource === 'spotify' ? 'SPOTIFY' : 'YOUTUBE'}
                </span>
                <p
                  className="font-black truncate"
                  style={{ fontSize: '15px', color: 'black' }}
                >
                  {currentTune.title}
                </p>
              </div>
              <p
                className="font-bold"
                style={{ fontSize: '11px', color: 'rgba(0,0,0,0.6)' }}
              >
                added by{' '}
                {currentTune.user_email === email
                  ? 'you'
                  : currentTune.user_email.split('@')[0]}
              </p>

              {mediaArea}
            </div>
          )}
        </div>

        {/* Add form */}
        <form
          onSubmit={handleAdd}
          className="border-4 border-black bg-[#E6E6FA] rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col"
          style={{ padding: '16px', gap: '10px' }}
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
            placeholder="paste youtube or spotify link"
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

        {/* Queue */}
        <div>
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
                const isCurrent = t.id === room?.current_tune_id;
                const addedBy = t.user_email.split('@')[0];
                const mine = t.user_email === email;
                const src = detectSource(t.url);
                return (
                  <div
                    key={t.id}
                    className="border-4 border-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center justify-between transition"
                    style={{
                      padding: '12px 14px',
                      gap: '12px',
                      backgroundColor: isCurrent ? '#E2F0D9' : '#FFFDF5',
                    }}
                  >
                    <button
                      onClick={() => playTune(t)}
                      className="flex items-center text-left min-w-0 flex-1"
                      style={{ gap: '12px' }}
                    >
                      <span
                        className="shrink-0 inline-flex items-center justify-center border-2 border-black font-black"
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          backgroundColor: isCurrent
                            ? '#9BC5A8'
                            : '#FFD1DC',
                          fontSize: '12px',
                          color: 'black',
                        }}
                      >
                        {isCurrent && src === 'youtube'
                          ? isPlaying
                            ? '⏸'
                            : '▶'
                          : '▶'}
                      </span>
                      <div className="min-w-0">
                        <p
                          className="font-black truncate"
                          style={{ fontSize: '13px', color: 'black' }}
                        >
                          {t.title}
                        </p>
                        <p
                          className="font-bold truncate"
                          style={{
                            fontSize: '10px',
                            color: 'rgba(0,0,0,0.5)',
                          }}
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
    </div>
  );
}