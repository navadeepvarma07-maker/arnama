'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useMusic } from '@/lib/music-context';
import { Play, Pause, Music, X } from 'lucide-react';

const HIDE_MINI_ON = ['/tunes'];

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

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

  useEffect(() => {
    if (currentVideoId) {
      const t = setTimeout(() => setVisible(true), 10);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
    }
  }, [currentVideoId]);

  const hideMini = HIDE_MINI_ON.some((p) => pathname?.startsWith(p));

  if (!currentVideoId || hideMini) return null;

  const displayedPosition = dragging ? dragPos : position;
  const pct =
    duration > 0 ? Math.min(100, (displayedPosition / duration) * 100) : 0;

  function computeFromEvent(e: React.PointerEvent<HTMLDivElement>): number {
    const el = barRef.current;
    if (!el || !duration) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width)
    );
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

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const p = computeFromEvent(e);
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    if (duration > 0) seek(p);
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 'max(12px, env(safe-area-inset-bottom))',
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
        transition:
          'transform 0.25s cubic-bezier(0.34, 1.4, 0.64, 1), opacity 0.2s',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* TOP ROW — thumb + info + times + play + close */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 10px 6px',
        }}
      >
        {/* Thumbnail */}
        <button
          onClick={() => router.push('/tunes')}
          style={{
            width: '48px',
            height: '48px',
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

        {/* Title + artist + times */}
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
            {/* TIME STAMPS */}
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

        {/* Play / pause */}
        <button
          onPointerUp={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggle();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          style={{
            width: '48px',
            height: '48px',
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

        {/* Close */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            clear();
          }}
          aria-label="Close player"
          style={{
            width: '32px',
            height: '32px',
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

      {/* BOTTOM ROW — SEEK BAR (visible, tappable, draggable) */}
      <div
        ref={barRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          height: '18px',
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
        {/* Scrubber knob */}
        {duration > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: `${pct}%`,
              width: '22px',
              height: '22px',
              marginLeft: '-11px',
              marginTop: '-11px',
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