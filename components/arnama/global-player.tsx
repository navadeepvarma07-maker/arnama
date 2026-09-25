'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useMusic } from '@/lib/music-context';
import { Play, Pause, Music, X, GripHorizontal } from 'lucide-react';

const HIDE_MINI_ON = ['/tunes'];
const POS_KEY = 'arnama-mini-pos';

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

type RoomState = {
  dj_user_id: string | null;
  is_playing: boolean;
  position_seconds: number;
  started_at: string | null;
  current_video_id: string | null;
};

export function GlobalPlayer() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    currentVideoId,
    isPlaying,
    position,
    duration,
    currentTuneMeta,
    toggle,
    seek,
    clear,
  } = useMusic();

  const [visible, setVisible] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragPos, setDragPos] = useState(0);
  const barRef = useRef<HTMLDivElement | null>(null);

  // Drag state for the whole bar
  const [userId, setUserId] = useState<string | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const barRefOuter = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const [draggingBar, setDraggingBar] = useState(false);

  // Room state (for DJ controls)
  const [room, setRoom] = useState<RoomState | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });

    // Load saved position
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(POS_KEY);
      if (saved) {
        try {
          setPos(JSON.parse(saved));
        } catch {}
      }
    }
  }, []);

  // Subscribe to room state
  useEffect(() => {
    if (!userId) return;
    supabase
      .from('listening_rooms')
      .select('dj_user_id, is_playing, position_seconds, started_at, current_video_id')
      .eq('id', 'main')
      .single()
      .then(({ data }) => {
        if (data) setRoom(data as RoomState);
      });

    const ch = supabase
      .channel('mini-player-room')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'listening_rooms' },
        (payload) => {
          setRoom(payload.new as RoomState);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId]);

  useEffect(() => {
    if (currentVideoId) {
      const t = setTimeout(() => setVisible(true), 10);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
    }
  }, [currentVideoId]);

  // The mini player is only relevant off /tunes
  const hideMini = HIDE_MINI_ON.some((p) => pathname?.startsWith(p));

  // Compute positioning styles
  const isFloating = !!pos;
  const barWidth = 340;
  const barHeight = 120;

  let barStyle: React.CSSProperties = {};
  if (isFloating && pos) {
    barStyle = {
      left: `${pos.x}px`,
      top: `${pos.y}px`,
      width: `${barWidth}px`,
      right: 'auto',
      bottom: 'auto',
    };
  }

  if (!currentVideoId || hideMini) return null;

  const isDJ = !!userId && room?.dj_user_id === userId;

  // Actual play/pause wrapper — becomes a room action when DJ
  async function handleToggle() {
    if (isDJ && room?.current_video_id === currentVideoId) {
      // We're off /tunes and we're the DJ — update the room so everyone follows
      const next = !isPlaying;
      let pos = 0;
      try {
        pos = (document.querySelector('audio') as any)?.currentTime || position;
      } catch {
        pos = position;
      }
      await supabase
        .from('listening_rooms')
        .update({
          is_playing: next,
          position_seconds: pos,
          started_at: next ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 'main');
      // Also apply locally for instant feedback
      if (next) toggle();
      else toggle();
    } else {
      toggle();
    }
  }

  const displayedPosition = dragging ? dragPos : position;
  const pct =
    duration > 0 ? Math.min(100, (displayedPosition / duration) * 100) : 0;

  function computeFromEvent(e: React.PointerEvent<HTMLDivElement>): number {
    const el = barRef.current;
    if (!el || !duration) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return ratio * duration;
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = computeFromEvent(e);
    setDragPos(p);
    setDragging(true);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDragPos(computeFromEvent(e));
  }

  async function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const p = computeFromEvent(e);
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    if (duration <= 0) return;

    if (isDJ && room?.current_video_id === currentVideoId) {
      await supabase
        .from('listening_rooms')
        .update({
          position_seconds: p,
          started_at: room.is_playing ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 'main');
    }
    seek(p);
  }

  // Whole-bar drag
  function handleBarDragStart(e: React.PointerEvent<HTMLDivElement>) {
    if (!barRefOuter.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = barRefOuter.current.getBoundingClientRect();
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      startX: rect.left,
      startY: rect.top,
    };
    setDraggingBar(true);
  }

  function handleBarDragMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingBar || !dragStartRef.current) return;
    const d = dragStartRef.current;
    const maxX = window.innerWidth - barWidth - 8;
    const maxY = window.innerHeight - 160;
    const nx = Math.max(8, Math.min(maxX, d.startX + (e.clientX - d.pointerX)));
    const ny = Math.max(8, Math.min(maxY, d.startY + (e.clientY - d.pointerY)));
    setPos({ x: nx, y: ny });
  }

  function handleBarDragEnd(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingBar) return;
    setDraggingBar(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    dragStartRef.current = null;
    if (pos && typeof window !== 'undefined') {
      window.localStorage.setItem(POS_KEY, JSON.stringify(pos));
    }
  }

  function resetPosition() {
    setPos(null);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(POS_KEY);
    }
  }

  return (
    <div
      ref={barRefOuter}
      style={{
        position: 'fixed',
        ...(isFloating
          ? barStyle
          : {
              left: 12,
              right: 12,
              bottom: 'max(12px, env(safe-area-inset-bottom))',
            }),
        borderRadius: '18px',
        border: '4px solid black',
        boxShadow: '5px 5px 0 0 black',
        background: `
          linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
          rgba(230, 230, 250, 0.95)
        `,
        backdropFilter: 'blur(16px) saturate(160%)',
        WebkitBackdropFilter: 'blur(16px) saturate(160%)',
        zIndex: 900,
        transform: visible ? 'translateY(0)' : 'translateY(120%)',
        opacity: visible ? 1 : 0,
        transition: draggingBar
          ? 'opacity 0.2s'
          : 'transform 0.25s cubic-bezier(0.34, 1.4, 0.64, 1), opacity 0.2s',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* DRAG HANDLE — small strip at the very top */}
      <div
        onPointerDown={handleBarDragStart}
        onPointerMove={handleBarDragMove}
        onPointerUp={handleBarDragEnd}
        onPointerCancel={handleBarDragEnd}
        onDoubleClick={resetPosition}
        title={isFloating ? 'double-tap to snap back to bottom' : 'drag to move'}
        style={{
          height: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: draggingBar ? 'grabbing' : 'grab',
          background: 'rgba(0,0,0,0.08)',
          touchAction: 'none',
        }}
      >
        <GripHorizontal className="size-3" strokeWidth={3} style={{ opacity: 0.5 }} />
      </div>

      {/* TOP ROW */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '8px 10px 6px',
        }}
      >
        <button
          onClick={() => router.push('/tunes')}
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            border: '3px solid black',
            background: '#FFFDF5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            overflow: 'hidden',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {currentTuneMeta?.artwork ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentTuneMeta.artwork}
              alt=""
              referrerPolicy="no-referrer"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <Music className="size-5" strokeWidth={2.75} />
          )}
        </button>

        <button
          onClick={() => router.push('/tunes')}
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: 'left',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: '12px',
              fontWeight: 900,
              color: '#000',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isPlaying && (
              <span
                style={{
                  display: 'inline-block',
                  width: '6px',
                  height: '6px',
                  borderRadius: '999px',
                  background: '#7FB89B',
                  border: '1px solid black',
                  flexShrink: 0,
                }}
              />
            )}
            {isDJ && (
              <span
                style={{
                  background: '#FF8BA7',
                  border: '1px solid black',
                  borderRadius: '999px',
                  padding: '1px 6px',
                  fontSize: '8px',
                  fontWeight: 900,
                  color: '#000',
                  flexShrink: 0,
                }}
              >
                DJ
              </span>
            )}
            {currentTuneMeta?.title ?? 'now playing'}
          </p>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              marginTop: '4px',
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: '10px',
                fontWeight: 700,
                color: 'rgba(0,0,0,0.55)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              {currentTuneMeta?.artist ?? 'arnama'}
            </p>
            <p
              style={{
                margin: 0,
                fontSize: '10px',
                fontWeight: 900,
                color: 'rgba(0,0,0,0.7)',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {formatTime(displayedPosition)} / {formatTime(duration)}
            </p>
          </div>
        </button>

        <button
          onPointerUp={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleToggle();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            border: '3px solid black',
            background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #E2F0D9`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '2px 2px 0 0 black',
            flexShrink: 0,
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {isPlaying ? (
            <Pause className="size-5" strokeWidth={3} />
          ) : (
            <Play className="size-5" strokeWidth={3} />
          )}
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            clear();
          }}
          aria-label="Close player"
          style={{
            width: '30px',
            height: '30px',
            borderRadius: '999px',
            border: '3px solid black',
            background: '#FFD1DC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
            padding: 0,
          }}
        >
          <X className="size-3" strokeWidth={3} />
        </button>
      </div>

      {/* SEEK BAR */}
      <div
        ref={barRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          height: '16px',
          width: '100%',
          background: 'rgba(0,0,0,0.15)',
          cursor: duration > 0 ? 'pointer' : 'default',
          position: 'relative',
          touchAction: 'none',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: `linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 60%), #7FB89B`,
            transition: dragging ? 'none' : 'width 0.15s linear',
          }}
        />
        {duration > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: `${pct}%`,
              width: '20px',
              height: '20px',
              marginLeft: '-10px',
              marginTop: '-10px',
              borderRadius: '999px',
              background: '#FFFDF5',
              border: '3px solid black',
              boxShadow: '2px 2px 0 0 black',
              pointerEvents: 'none',
              transition: dragging ? 'none' : 'left 0.15s linear',
              zIndex: 2,
            }}
          />
        )}
      </div>
    </div>
  );
}