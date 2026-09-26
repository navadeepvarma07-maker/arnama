'use client';
import { useVoiceChat } from '@/lib/use-voice-chat';
import { VoiceChatBar } from '@/components/arnama/voice-chat-bar';
import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
    Play, Pause, Crown, LogOut, FolderOpen,
    Send, Maximize2, Minimize2, GripHorizontal, MessageSquare,
  } from 'lucide-react';

type RoomState = {
  id: string;
  dj_user_id: string | null;
  dj_email: string | null;
  mode: 'youtube' | 'local';
  video_id: string | null;
  video_title: string | null;
  local_hint: string | null;
  is_playing: boolean;
  position_seconds: number;
  started_at: string | null;
  updated_at: string;
};

type WatchMessage = {
  id: number;
  user_id: string;
  user_email: string;
  content: string;
  created_at: string;
};

type FloatingReaction = {
  id: number;
  emoji: string;
  x: number;
  bornAt: number;
};

type PlayerLike = {
  getCurrentTime: () => number;
  getDuration: () => number;
  seekTo: (t: number) => void;
  isPlaying: () => boolean;
  play: () => void;
  pause: () => void;
};

const REACTION_EMOJIS = ['❤️', '🔥', '😂', '👍', '😮', '😭'];
const VIDEO_POS_KEY = 'arnama-watch-video-pos';

let ytPromise: Promise<any> | null = null;
function loadYT(): Promise<any> {
  if (ytPromise) return ytPromise;
  ytPromise = new Promise((resolve) => {
    if (typeof window === 'undefined') return;
    const w = window as any;
    if (w.YT?.Player) return resolve(w.YT);
    w.onYouTubeIframeAPIReady = () => resolve(w.YT);
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return ytPromise;
}

function extractYtId(input: string): string | null {
  const m = input.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export default function WatchPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [room, setRoom] = useState<RoomState | null>(null);
  const [listeners, setListeners] = useState(1);

  const [ytUrl, setYtUrl] = useState('');
  const [ytError, setYtError] = useState('');

  const [localFile, setLocalFile] = useState<File | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Chat
  const [messages, setMessages] = useState<WatchMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatOpen, setChatOpen] = useState(true);

  // Reactions (floaters)
  const [floaters, setFloaters] = useState<FloatingReaction[]>([]);

  // Floating video mode
  const [floating, setFloating] = useState(false);
  const [videoPos, setVideoPos] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [draggingVideo, setDraggingVideo] = useState(false);
  const [resizingVideo, setResizingVideo] = useState(false);
  const dragRef = useRef<{ px: number; py: number; sx: number; sy: number } | null>(null);
  const resizeRef = useRef<{ px: number; py: number; sw: number; sh: number } | null>(null);

  const ytPlayerRef = useRef<any>(null);
  const loadedYtIdRef = useRef<string | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatAtBottomRef = useRef(true);

  const isDJ = !!userId && room?.dj_user_id === userId;
  const voice = useVoiceChat('main', userId, email);
  // Load floating position from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(VIDEO_POS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setVideoPos(parsed);
        setFloating(true);
      }
    } catch {}
  }, []);

  // Persist floating position
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (floating && videoPos) {
      window.localStorage.setItem(VIDEO_POS_KEY, JSON.stringify(videoPos));
    }
  }, [floating, videoPos]);

  // AUTH
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      setUserId(u?.id ?? null);
      setEmail(u?.email ?? null);
      if (!u?.email) window.location.href = '/login';
      else setLoading(false);
    });
  }, []);

  // LOAD ROOM
  useEffect(() => {
    if (!email) return;
    supabase.from('watch_rooms').select('*').eq('id', 'main').single().then(({ data }) => {
      if (data) setRoom(data as RoomState);
    });
  }, [email]);

  // REALTIME room state
  useEffect(() => {
    if (!email) return;
    const ch = supabase
      .channel('watch-room-live')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'watch_rooms' }, (p) => {
        setRoom(p.new as RoomState);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [email]);

  // PRESENCE
  useEffect(() => {
    if (!userId || !email) return;
    const ch = supabase.channel('watch-presence', { config: { presence: { key: userId } } });
    ch.on('presence', { event: 'sync' }, () => {
      setListeners(Object.keys(ch.presenceState()).length);
    }).subscribe(async (s) => { if (s === 'SUBSCRIBED') await ch.track({ user_id: userId, email }); });
    return () => { supabase.removeChannel(ch); };
  }, [userId, email]);

  // LOAD messages
  useEffect(() => {
    if (!email) return;
    supabase.from('watch_messages').select('*').order('created_at', { ascending: true }).limit(200)
      .then(({ data }) => {
        if (data) setMessages(data as WatchMessage[]);
      });
  }, [email]);

  // Realtime messages + reactions
  useEffect(() => {
    if (!email) return;
    const suffix = Math.random().toString(36).slice(2, 8);

    const ch = supabase
      .channel(`watch-chat-${suffix}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'watch_messages' }, (p) => {
        const m = p.new as WatchMessage;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        if (chatAtBottomRef.current) {
          setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
        }
      })
      .subscribe();

    const chR = supabase
      .channel(`watch-rx-${suffix}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'watch_reactions' }, (p) => {
        const r = p.new as { id: number; emoji: string; x: number };
        setFloaters((prev) => [...prev, { id: r.id, emoji: r.emoji, x: r.x ?? 50, bornAt: Date.now() }]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
      supabase.removeChannel(chR);
    };
  }, [email]);

  // Expire floaters after 2.2s
  useEffect(() => {
    const i = setInterval(() => {
      const now = Date.now();
      setFloaters((prev) => prev.filter((f) => now - f.bornAt < 2200));
    }, 400);
    return () => clearInterval(i);
  }, []);

  // ----- YOUTUBE PLAYER -----
  useEffect(() => {
    if (!room || room.mode !== 'youtube' || !room.video_id) return;
    let cancelled = false;
    (async () => {
      const YT = await loadYT();
      if (cancelled) return;
      if (ytPlayerRef.current && loadedYtIdRef.current === room.video_id) return;
      try { ytPlayerRef.current?.destroy(); } catch {}
      ytPlayerRef.current = null;
      loadedYtIdRef.current = null;
      const container = ytContainerRef.current;
      if (!container) return;
      container.innerHTML = '';
      const player = new YT.Player(container, {
        videoId: room.video_id,
        playerVars: { controls: 0, disablekb: 1, modestbranding: 1, rel: 0, playsinline: 1 },
        events: {
          onReady: () => {
            if (cancelled) return;
            ytPlayerRef.current = player;
            loadedYtIdRef.current = room.video_id;
            const r = room;
            const computed =
              (r.position_seconds ?? 0) +
              (r.is_playing && r.started_at
                ? (Date.now() - new Date(r.started_at).getTime()) / 1000
                : 0);
            try { player.seekTo(computed, true); } catch {}
            if (r.is_playing) { try { player.playVideo(); } catch {} }
            else { try { player.pauseVideo(); } catch {} }
          },
        },
      });
    })();
    return () => { cancelled = true; };
  }, [room?.mode, room?.video_id]);

  useEffect(() => () => { try { ytPlayerRef.current?.destroy(); } catch {} }, []);

  // ----- PLAYER ABSTRACTION -----
  const getPlayer = useCallback((): PlayerLike | null => {
    if (room?.mode === 'youtube' && ytPlayerRef.current) {
      const yt = ytPlayerRef.current;
      return {
        getCurrentTime: () => yt.getCurrentTime?.() ?? 0,
        getDuration: () => yt.getDuration?.() ?? 0,
        seekTo: (t) => yt.seekTo?.(t, true),
        isPlaying: () => yt.getPlayerState?.() === 1,
        play: () => yt.playVideo?.(),
        pause: () => yt.pauseVideo?.(),
      };
    }
    if (room?.mode === 'local' && videoElRef.current) {
      const v = videoElRef.current;
      return {
        getCurrentTime: () => v.currentTime,
        getDuration: () => v.duration || 0,
        seekTo: (t) => { v.currentTime = t; },
        isPlaying: () => !v.paused && !v.ended,
        play: () => { v.play().catch(() => {}); },
        pause: () => v.pause(),
      };
    }
    return null;
  }, [room?.mode]);

  // ----- TICKER -----
  useEffect(() => {
    const i = setInterval(() => {
      const p = getPlayer();
      if (!p) return;
      setCurrentTime(p.getCurrentTime());
      setDuration(p.getDuration());
      setIsPlaying(p.isPlaying());
    }, 500);
    return () => clearInterval(i);
  }, [getPlayer]);

  // ----- SYNC LOOP (followers) — 800ms, tight drift threshold -----
  useEffect(() => {
    if (!room || isDJ) return;
    const i = setInterval(() => {
      const p = getPlayer();
      if (!p) return;
      const computed =
        (room.position_seconds ?? 0) +
        (room.is_playing && room.started_at
          ? (Date.now() - new Date(room.started_at).getTime()) / 1000
          : 0);
      const actual = p.getCurrentTime();
      const drift = Math.abs(actual - computed);
      const threshold = room.is_playing ? 1.5 : 0.3;
      if (drift > threshold) {
        try { p.seekTo(computed); } catch {}
      }
      // Immediate play/pause reaction
      if (room.is_playing && !p.isPlaying()) {
        try { p.play(); } catch {}
      } else if (!room.is_playing && p.isPlaying()) {
        try { p.pause(); } catch {}
      }
    }, 800);
    return () => clearInterval(i);
  }, [room, isDJ, getPlayer]);

  // ----- ACTIONS -----
  async function updateRoom(patch: Partial<RoomState>) {
    if (!userId || !email) return;
    await supabase.from('watch_rooms').update({
      ...patch,
      dj_user_id: userId,
      dj_email: email,
      updated_at: new Date().toISOString(),
    }).eq('id', 'main');
  }

  async function takeWheel() {
    if (!userId || !email) return;
    const p = getPlayer();
    const t = p?.getCurrentTime() ?? 0;
    await updateRoom({
      dj_user_id: userId,
      dj_email: email,
      position_seconds: t,
      started_at: room?.is_playing ? new Date().toISOString() : null,
    });
  }

  async function startYouTube() {
    const id = extractYtId(ytUrl.trim());
    if (!id) { setYtError('paste a valid youtube link'); return; }
    setYtError('');
    try { ytPlayerRef.current?.destroy(); } catch {}
    ytPlayerRef.current = null;
    loadedYtIdRef.current = null;
    await updateRoom({
      mode: 'youtube',
      video_id: id,
      video_title: null,
      local_hint: null,
      is_playing: false,
      position_seconds: 0,
      started_at: null,
    });
    setYtUrl('');
    if (localUrl) URL.revokeObjectURL(localUrl);
    setLocalUrl(null);
    setLocalFile(null);
  }

  function pickLocalFile(f: File | null) {
    if (!f) return;
    if (localUrl) URL.revokeObjectURL(localUrl);
    setLocalFile(f);
    const url = URL.createObjectURL(f);
    setLocalUrl(url);
    updateRoom({
      mode: 'local',
      video_id: null,
      video_title: f.name,
      local_hint: f.name,
      is_playing: false,
      position_seconds: 0,
      started_at: null,
    });
  }

  async function togglePlay() {
    const p = getPlayer();
    if (!p) return;

    // Follower: local play/pause only (DJ's room state drives the group)
    if (!isDJ) {
      if (p.isPlaying()) p.pause();
      else p.play();
      return;
    }

    // DJ: play/pause locally AND broadcast the new state
    const next = !p.isPlaying();
    const t = p.getCurrentTime();

    if (next) {
      try { p.play(); } catch {}
      await updateRoom({
        is_playing: true,
        position_seconds: t,
        started_at: new Date().toISOString(),
      });
    } else {
      try { p.pause(); } catch {}
      await updateRoom({
        is_playing: false,
        position_seconds: t,
        started_at: null,
      });
    }
  }

  async function seekTo(t: number) {
    const p = getPlayer();
    if (!p) return;
    p.seekTo(t);
    if (isDJ) {
      await updateRoom({
        position_seconds: t,
        started_at: room?.is_playing ? new Date().toISOString() : null,
      });
    }
  }

  async function leaveRoom() {
    // Reset the room
    await supabase.from('watch_rooms').update({
      dj_user_id: null, dj_email: null, is_playing: false,
      position_seconds: 0, started_at: null,
      video_id: null, video_title: null, local_hint: null,
      updated_at: new Date().toISOString(),
    }).eq('id', 'main');

    // Wipe the chat for everyone
    await supabase.from('watch_messages').delete().neq('id', 0);
    await supabase.from('watch_reactions').delete().neq('id', 0);

    // Local cleanup
    setLocalFile(null);
    if (localUrl) URL.revokeObjectURL(localUrl);
    setLocalUrl(null);
    try { ytPlayerRef.current?.destroy(); } catch {}
    ytPlayerRef.current = null;
    loadedYtIdRef.current = null;

    // Clear local view too
    setMessages([]);
    setFloaters([]);
  }

  // ----- CHAT -----
  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || !userId || !email) return;
    setChatInput('');
    chatAtBottomRef.current = true;
    const { error } = await supabase.from('watch_messages').insert({
      user_id: userId, user_email: email, content: text,
    });
    if (error) alert('⚠️ ' + error.message);
    setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
  }

  function handleChatScroll() {
    const el = chatScrollRef.current;
    if (!el) return;
    chatAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }

  // ----- REACTIONS -----
  async function sendReaction(emoji: string) {
    if (!email) return;
    const x = 20 + Math.random() * 60;
    await supabase.from('watch_reactions').insert({ user_email: email, emoji, x });
  }

  // ----- FLOATING DRAG / RESIZE -----
  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!videoPos) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, sx: videoPos.x, sy: videoPos.y };
    setDraggingVideo(true);
  }
  function onDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingVideo || !dragRef.current || !videoPos) return;
    const d = dragRef.current;
    const nx = Math.max(8, Math.min(window.innerWidth - videoPos.w - 8, d.sx + (e.clientX - d.px)));
    const ny = Math.max(8, Math.min(window.innerHeight - 60, d.sy + (e.clientY - d.py)));
    setVideoPos({ ...videoPos, x: nx, y: ny });
  }
  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingVideo) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    dragRef.current = null;
    setDraggingVideo(false);
  }

  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    if (!videoPos) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeRef.current = { px: e.clientX, py: e.clientY, sw: videoPos.w, sh: videoPos.h };
    setResizingVideo(true);
  }
  function onResize(e: React.PointerEvent<HTMLDivElement>) {
    if (!resizingVideo || !resizeRef.current || !videoPos) return;
    const r = resizeRef.current;
    const nw = Math.max(220, Math.min(window.innerWidth - 16, r.sw + (e.clientX - r.px)));
    const nh = Math.max(140, Math.min(window.innerHeight - 40, r.sh + (e.clientY - r.py)));
    setVideoPos({ ...videoPos, w: nw, h: nh });
  }
  function endResize(e: React.PointerEvent<HTMLDivElement>) {
    if (!resizingVideo) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    resizeRef.current = null;
    setResizingVideo(false);
  }

  function enterFloating() {
    const w = 360;
    const h = 202;
    const x = Math.max(8, window.innerWidth - w - 20);
    const y = Math.max(8, window.innerHeight - h - 100);
    setVideoPos({ x, y, w, h });
    setFloating(true);
  }
  function exitFloating() {
    setFloating(false);
  }

  // ----- SEEK BAR -----
  const barRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragPos, setDragPos] = useState(0);

  function computeFromEvent(e: React.PointerEvent<HTMLDivElement>): number {
    const el = barRef.current;
    if (!el || !duration) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return ratio * duration;
  }
  function onBarDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragPos(computeFromEvent(e));
    setDragging(true);
  }
  function onBarMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDragPos(computeFromEvent(e));
  }
  function onBarUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const t = computeFromEvent(e);
    setDragging(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    seekTo(t);
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#1a0b2e] flex items-center justify-center text-white font-mono">
        loading...
      </div>
    );
  }

  const displayedTime = dragging ? dragPos : currentTime;
  const pct = duration > 0 ? Math.min(100, (displayedTime / duration) * 100) : 0;

  const showYTPlayer = room?.mode === 'youtube' && !!room.video_id;
  const showLocalPlayer = room?.mode === 'local' && !!localUrl;
  const showLocalNeedFile = room?.mode === 'local' && !!room.local_hint && !localUrl && !isDJ;
  const showEmpty = !room?.video_id && !room?.local_hint;

  const VIDEO_BOX_STYLE_FLOATING: React.CSSProperties = videoPos
    ? {
        position: 'fixed',
        left: videoPos.x,
        top: videoPos.y,
        width: videoPos.w,
        height: videoPos.h,
        zIndex: 800,
        borderRadius: '18px',
        border: '4px solid black',
        boxShadow: '6px 6px 0 0 black',
        overflow: 'hidden',
        background: '#000',
      }
    : {};

  const VIDEO_BOX_STYLE_DOCKED: React.CSSProperties = {
    position: 'relative',
    background: '#000',
    aspectRatio: '16 / 9',
  };

  return (
    <div className="fixed inset-0 bg-[#1a0b2e] font-mono flex flex-col overflow-hidden">
      {/* FLOATING VIDEO PORTAL */}
      {floating && videoPos && (
        <div style={VIDEO_BOX_STYLE_FLOATING}>
          {/* drag bar */}
          <div
            onPointerDown={startDrag}
            onPointerMove={onDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: '18px',
              background: 'rgba(0,0,0,0.65)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: draggingVideo ? 'grabbing' : 'grab',
              zIndex: 4, touchAction: 'none',
            }}
          >
            <GripHorizontal className="size-3" strokeWidth={3} style={{ color: '#FFF', opacity: 0.7 }} />
          </div>

          {/* close button */}
          <button
            onClick={exitFloating}
            aria-label="Dock video"
            style={{
              position: 'absolute', top: '24px', right: '8px', width: '26px', height: '26px',
              border: '2px solid #FFF', borderRadius: '999px',
              background: 'rgba(0,0,0,0.6)', color: '#FFF',
              cursor: 'pointer', zIndex: 5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Minimize2 className="size-3" strokeWidth={3} />
          </button>

          {/* video */}
          <div style={{ position: 'absolute', inset: 0 }}>
            {showYTPlayer && (
              <div ref={ytContainerRef} style={{ width: '100%', height: '100%' }} />
            )}
            {showLocalPlayer && (
              <video
                ref={videoElRef}
                src={localUrl ?? undefined}
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
              />
            )}
            {showLocalNeedFile && (
              <div style={{
                width: '100%', height: '100%',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: '10px', padding: '14px', textAlign: 'center',
                background: '#000', color: '#FFF',
              }}>
                <p style={{ margin: 0, fontSize: '11px', fontWeight: 800 }}>
                  DJ playing: <strong>{room?.local_hint}</strong>
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: '8px 14px', border: '2px solid #FFF', borderRadius: '999px',
                    background: 'rgba(255,255,255,0.1)', color: '#FFF',
                    fontWeight: 900, fontSize: '11px', cursor: 'pointer',
                  }}
                >📂 open my copy</button>
              </div>
            )}
            {showEmpty && (
              <div style={{
                width: '100%', height: '100%',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: '6px', background: '#0f0620', color: '#FFF',
              }}>
                <span style={{ fontSize: '28px' }}>🎬</span>
                <p style={{ margin: 0, fontSize: '11px', fontWeight: 800 }}>nothing playing</p>
              </div>
            )}

            {/* floaters */}
            {floaters.map((f) => (
              <span key={f.id} aria-hidden style={{
                position: 'absolute',
                bottom: '20px',
                left: `${f.x}%`,
                fontSize: '28px',
                lineHeight: 1,
                pointerEvents: 'none',
                animation: 'reaction-float 2.2s ease-out forwards',
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))',
                zIndex: 6,
              }}>{f.emoji}</span>
            ))}
          </div>

          {/* resize handle */}
          <div
            onPointerDown={startResize}
            onPointerMove={onResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            style={{
              position: 'absolute', bottom: 0, right: 0, width: '24px', height: '24px',
              background: 'rgba(0,0,0,0.7)',
              cursor: 'nwse-resize', zIndex: 5, touchAction: 'none',
              borderTopLeftRadius: '12px',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
            }}
          >
            <span style={{ width: '10px', height: '10px', borderRight: '2px solid #FFF', borderBottom: '2px solid #FFF', margin: '0 3px 3px 0', borderRadius: '0 0 4px 0' }} />
          </div>
        </div>
      )}

      <div
        className="mx-auto flex w-full max-w-3xl flex-1 min-h-0 flex-col gap-2 overflow-y-auto"
        style={{
          paddingTop: 'max(8px, env(safe-area-inset-top))',
          paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
          paddingLeft: 'max(8px, env(safe-area-inset-left))',
          paddingRight: 'max(8px, env(safe-area-inset-right))',
        }}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="gloss-shine flex size-10 shrink-0 items-center justify-center rounded-2xl border-4 border-black"
              style={{ background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFD1DC`, fontSize: '18px' }}>
              🎬
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-black text-lg leading-tight text-white">watch room</h1>
              <p className="text-[10px] font-bold leading-tight text-white/60 truncate">{listeners} watching</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setChatOpen((v) => !v)}
              aria-label="Toggle chat"
              style={{
                width: '44px', height: '44px', border: '4px solid black',
                borderRadius: '14px', background: chatOpen ? '#FF8BA7' : '#E2F0D9',
                color: '#000', fontWeight: 900, cursor: 'pointer',
                boxShadow: '4px 4px 0 0 black',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <MessageSquare className="size-5" strokeWidth={2.75} />
            </button>
            <Link
              href="/"
              className="inline-flex items-center justify-center border-4 border-black bg-[#E2F0D9] text-black font-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition shrink-0"
              style={{ padding: '8px 12px', fontSize: '14px', minWidth: '44px', minHeight: '44px' }}
            >←</Link>
          </div>
        </div>

        {/* DOCKED VIDEO */}
        {!floating && (
          <div
            className="relative border-4 border-black rounded-2xl overflow-hidden shrink-0"
            style={{ ...VIDEO_BOX_STYLE_DOCKED, boxShadow: '6px 6px 0 0 black' }}
          >
            {showYTPlayer && (
              <div style={{ position: 'absolute', inset: 0 }}>
                <div ref={ytContainerRef} style={{ width: '100%', height: '100%' }} />
              </div>
            )}
            {showLocalPlayer && (
              <video
                ref={videoElRef}
                src={localUrl ?? undefined}
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
              />
            )}
            {showLocalNeedFile && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: '12px', padding: '20px', textAlign: 'center',
                background: '#000', color: '#FFF',
              }}>
                <span style={{ fontSize: '40px' }}>📁</span>
                <p style={{ margin: 0, fontSize: '13px', fontWeight: 800 }}>
                  DJ is playing: <strong>{room?.local_hint}</strong>
                </p>
                <p style={{ margin: 0, fontSize: '11px', color: 'rgba(255,255,255,0.6)', maxWidth: '320px' }}>
                  open your own copy of this file — nothing uploads, it plays from your device
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    marginTop: '8px', padding: '12px 22px',
                    border: '3px solid #FFF', borderRadius: '999px',
                    background: 'rgba(255,255,255,0.1)', color: '#FFF',
                    fontWeight: 900, fontSize: '12px', cursor: 'pointer',
                  }}
                >📂 open my copy</button>
              </div>
            )}
            {showEmpty && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: '12px', padding: '20px', textAlign: 'center',
                background: `linear-gradient(180deg, #2a1a3e 0%, #1a0b2e 100%)`,
                color: '#FFF',
              }}>
                <span style={{ fontSize: '48px' }}>🎬</span>
                <p style={{ margin: 0, fontSize: '16px', fontWeight: 900 }}>watch together</p>
                <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.6)', maxWidth: '320px' }}>
                  {isDJ ? 'paste a youtube link or open a local file below' : 'tap "take the wheel" to become DJ and start something'}
                </p>
              </div>
            )}

            {/* Floating reactions overlay */}
            {floaters.map((f) => (
              <span key={f.id} aria-hidden style={{
                position: 'absolute',
                bottom: '20px',
                left: `${f.x}%`,
                fontSize: '32px',
                lineHeight: 1,
                pointerEvents: 'none',
                animation: 'reaction-float 2.2s ease-out forwards',
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))',
                zIndex: 6,
              }}>{f.emoji}</span>
            ))}

            {/* Float / dock button */}
            {!showEmpty && (
              <button
                onClick={enterFloating}
                aria-label="Float video"
                style={{
                  position: 'absolute', top: '10px', right: '10px',
                  padding: '6px 10px', border: '2px solid #FFF', borderRadius: '999px',
                  background: 'rgba(0,0,0,0.55)', color: '#FFF',
                  fontSize: '11px', fontWeight: 900, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  zIndex: 5,
                }}
              >
                <Maximize2 className="size-3" strokeWidth={3} /> float
              </button>
            )}
          </div>
        )}
        {/* VOICE CHAT */}
        <VoiceChatBar
          micOn={voice.micOn}
          toggleMic={voice.toggleMic}
          participants={voice.participants}
          connected={voice.connected}
          error={voice.error}
          myEmail={email}
          mutedPeers={voice.mutedPeers}
          togglePeerMute={voice.togglePeerMute}
        />
        {/* REACTION ROW */}
        <div
          className="border-4 border-black shrink-0"
          style={{
            borderRadius: '18px',
            background: `linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%), #FFF5BA`,
            padding: '10px 12px',
            boxShadow: '4px 4px 0 0 black',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '10px', fontWeight: 900, color: 'rgba(0,0,0,0.55)', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>
            react
          </span>
          <div style={{ display: 'flex', gap: '4px', flex: 1, flexWrap: 'wrap' }}>
            {REACTION_EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => sendReaction(e)}
                style={{
                  width: '40px', height: '40px', border: '2px solid black',
                  borderRadius: '999px', background: '#FFFDF5',
                  cursor: 'pointer', fontSize: '20px', lineHeight: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '2px 2px 0 0 black', padding: 0,
                }}
              >{e}</button>
            ))}
          </div>
        </div>

        {/* CONTROLS */}
        <div
          className="border-4 border-black shrink-0"
          style={{
            borderRadius: '18px',
            background: `linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%), #E6E6FA`,
            padding: '12px',
            boxShadow: '4px 4px 0 0 black',
          }}
        >
          <div
            ref={barRef}
            onPointerDown={onBarDown} onPointerMove={onBarMove}
            onPointerUp={onBarUp} onPointerCancel={onBarUp}
            style={{
              height: '18px', width: '100%',
              background: 'rgba(0,0,0,0.15)',
              borderRadius: '999px', border: '2px solid black',
              position: 'relative', cursor: duration > 0 ? 'pointer' : 'default',
              touchAction: 'none',
            }}
          >
            <div style={{
              height: '100%', width: `${pct}%`,
              background: `linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 60%), #7FB89B`,
              borderRadius: '999px',
              transition: dragging ? 'none' : 'width 0.15s linear',
            }} />
            {duration > 0 && (
              <div style={{
                position: 'absolute', top: '50%', left: `${pct}%`,
                width: '22px', height: '22px',
                marginLeft: '-11px', marginTop: '-11px',
                borderRadius: '999px', background: '#FFFDF5',
                border: '3px solid black', boxShadow: '2px 2px 0 0 black',
                pointerEvents: 'none',
                transition: dragging ? 'none' : 'left 0.15s linear', zIndex: 2,
              }} />
            )}
          </div>

          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={togglePlay}
              disabled={!showYTPlayer && !showLocalPlayer}
              style={{
                width: '48px', height: '48px', borderRadius: '14px',
                border: '3px solid black',
                background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #E2F0D9`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: showYTPlayer || showLocalPlayer ? 'pointer' : 'not-allowed',
                boxShadow: '3px 3px 0 0 black',
                opacity: showYTPlayer || showLocalPlayer ? 1 : 0.5,
                flexShrink: 0,
              }}
            >
              {isPlaying ? (
                <Pause className="size-5" strokeWidth={3} style={{ color: '#000', fill: '#000' }} />
              ) : (
                <Play className="size-5" strokeWidth={3} style={{ color: '#000', fill: '#000', marginLeft: '2px' }} />
              )}
            </button>

            <div style={{
              flex: 1, textAlign: 'center',
              fontSize: '14px', fontWeight: 900, color: '#000',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {fmt(displayedTime)} / {fmt(duration)}
            </div>

            {isDJ ? (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '6px 12px', border: '3px solid black', borderRadius: '999px',
                background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FF8BA7`,
                fontSize: '10px', fontWeight: 900, color: '#000',
                boxShadow: '2px 2px 0 0 black', flexShrink: 0,
              }}>
                <Crown className="size-3" strokeWidth={3} /> DJ
              </span>
            ) : (
              <button
                onClick={takeWheel}
                style={{
                  padding: '8px 14px', border: '2px solid black', borderRadius: '999px',
                  background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFF5BA`,
                  fontSize: '10px', fontWeight: 900, color: '#000',
                  boxShadow: '2px 2px 0 0 black', cursor: 'pointer', flexShrink: 0,
                }}
              >
                ✋ take the wheel
              </button>
            )}
          </div>
        </div>

        {/* SOURCE PICKER (DJ only) */}
        {isDJ && (
          <div
            className="border-4 border-black shrink-0"
            style={{
              borderRadius: '18px',
              background: `linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%), #FFF5BA`,
              padding: '12px', boxShadow: '4px 4px 0 0 black',
              display: 'flex', flexDirection: 'column', gap: '10px',
            }}
          >
            <p style={{
              margin: 0, fontSize: '10px', fontWeight: 900,
              textTransform: 'uppercase', letterSpacing: '0.1em',
              color: 'rgba(0,0,0,0.55)',
            }}>play something</p>

            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{
                flex: 1, minWidth: 0,
                display: 'flex', alignItems: 'center', gap: '8px',
                border: '2px solid black', borderRadius: '12px',
                background: '#FFFDF5', padding: '0 12px',
              }}>
                <span
  style={{
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '16px',
    borderRadius: '4px',
    background: '#FF0000',
    border: '1.5px solid black',
    flexShrink: 0,
  }}
>
  <span style={{ fontSize: '9px', color: '#FFF', lineHeight: 1, marginLeft: '1px' }}>▶</span>
</span>
                <input
                  type="text" value={ytUrl}
                  onChange={(e) => { setYtUrl(e.target.value); setYtError(''); }}
                  placeholder="paste youtube link"
                  style={{
                    flex: 1, minWidth: 0, border: 'none', background: 'transparent',
                    color: '#000', fontSize: '13px', padding: '10px 0',
                    outline: 'none', fontWeight: 700,
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') startYouTube(); }}
                />
              </div>
              <button
                onClick={startYouTube}
                disabled={!ytUrl.trim()}
                style={{
                  padding: '10px 16px', border: '2px solid black', borderRadius: '12px',
                  background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #E2F0D9`,
                  color: '#000', fontWeight: 900, fontSize: '12px',
                  boxShadow: '2px 2px 0 0 black',
                  cursor: ytUrl.trim() ? 'pointer' : 'not-allowed',
                  opacity: ytUrl.trim() ? 1 : 0.5, flexShrink: 0,
                }}
              >play</button>
            </div>
            {ytError && (
              <p style={{ margin: 0, fontSize: '11px', fontWeight: 800, color: '#C2185B' }}>⚠️ {ytError}</p>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ flex: 1, height: '2px', background: 'rgba(0,0,0,0.15)' }} />
              <span style={{ fontSize: '10px', fontWeight: 900, color: 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>or</span>
              <div style={{ flex: 1, height: '2px', background: 'rgba(0,0,0,0.15)' }} />
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: '8px', padding: '12px',
                border: '2px solid black', borderRadius: '12px',
                background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #D4F0F0`,
                color: '#000', fontWeight: 900, fontSize: '12px',
                boxShadow: '2px 2px 0 0 black', cursor: 'pointer',
              }}
            >
              <FolderOpen className="size-4" strokeWidth={2.75} />
              {localFile ? `playing: ${localFile.name}` : 'open a local file (.mp4 .webm .mkv)'}
            </button>
            <input
              ref={fileInputRef} type="file"
              accept="video/mp4,video/webm,video/x-matroska,.mp4,.webm,.mkv,.mov"
              onChange={(e) => pickLocalFile(e.target.files?.[0] ?? null)}
              style={{ display: 'none' }}
            />
          </div>
        )}

        {/* CHAT PANEL */}
        {chatOpen && (
          <div
            className="border-4 border-black shrink-0"
            style={{
              borderRadius: '18px',
              background: `linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%), #FFFDF5`,
              boxShadow: '4px 4px 0 0 black',
              display: 'flex', flexDirection: 'column',
              minHeight: '260px', maxHeight: '360px',
              overflow: 'hidden',
            }}
          >
            <div style={{
              padding: '10px 14px',
              borderBottom: '3px solid black',
              background: '#E6E6FA',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <MessageSquare className="size-3.5" strokeWidth={3} />
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 900, color: '#000' }}>
                live chat · {messages.length}
              </p>
            </div>

            <div
              ref={chatScrollRef}
              onScroll={handleChatScroll}
              style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 14px' }}
            >
              {messages.length === 0 ? (
                <p style={{ textAlign: 'center', fontStyle: 'italic', color: 'rgba(0,0,0,0.4)', fontSize: '12px', margin: '20px 0' }}>
                  say something while you watch 🍿
                </p>
              ) : (
                messages.map((m) => {
                  const mine = m.user_email === email;
                  const name = mine ? 'you' : m.user_email.split('@')[0];
                  const time = new Date(m.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <div key={m.id} style={{
                      display: 'flex', gap: '8px', marginBottom: '8px',
                      justifyContent: mine ? 'flex-end' : 'flex-start',
                    }}>
                      <div style={{
                        maxWidth: '78%',
                        border: '2px solid black',
                        borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        background: mine ? '#E2F0D9' : '#FFD1DC',
                        padding: '6px 10px',
                        boxShadow: '2px 2px 0 0 black',
                      }}>
                        <p style={{ margin: 0, fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(0,0,0,0.55)' }}>
                          {name} · {time}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#000', lineHeight: 1.35, wordBreak: 'break-word' }}>
                          {m.content}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatBottomRef} style={{ height: '2px' }} />
            </div>

            <form
              onSubmit={sendChat}
              style={{
                borderTop: '3px solid black',
                background: '#E6E6FA',
                display: 'flex', alignItems: 'stretch',
                padding: '10px', gap: '8px',
              }}
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="say something..."
                style={{
                  flex: 1, minWidth: 0,
                  border: '2px solid black', borderRadius: '12px',
                  background: '#FFFDF5', color: '#000',
                  fontSize: '13px', padding: '10px 12px',
                  outline: 'none', fontWeight: 600,
                }}
              />
              <button
                type="submit"
                disabled={!chatInput.trim()}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  padding: '10px 14px', border: '2px solid black', borderRadius: '12px',
                  background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #E2F0D9`,
                  color: '#000', fontWeight: 900, fontSize: '12px',
                  boxShadow: '3px 3px 0 0 black',
                  cursor: chatInput.trim() ? 'pointer' : 'not-allowed',
                  opacity: chatInput.trim() ? 1 : 0.5,
                  flexShrink: 0, minWidth: '48px',
                }}
              >
                <Send className="size-4" strokeWidth={2.75} />
              </button>
            </form>
          </div>
        )}

        {/* FOOTER */}
        <div className="flex items-center justify-between gap-2 shrink-0">
          <p style={{ margin: 0, fontSize: '10px', fontWeight: 800, color: 'rgba(255,255,255,0.55)' }}>
            {room?.dj_email && !isDJ ? `🎙️ DJ: ${room.dj_email.split('@')[0]}` : ' '}
          </p>
          {(isDJ || room?.dj_user_id) && (
            <button
              onClick={leaveRoom}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '8px 12px', border: '2px solid black', borderRadius: '999px',
                background: '#FFD1DC', color: '#C2185B',
                fontWeight: 900, fontSize: '11px',
                boxShadow: '2px 2px 0 0 black', cursor: 'pointer',
              }}
            >
              <LogOut className="size-3" strokeWidth={3} />
              {isDJ ? 'end session' : 'leave'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}