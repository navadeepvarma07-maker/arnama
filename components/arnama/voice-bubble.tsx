'use client';

import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';

type Props = {
  url: string;
  duration: number;
  mine?: boolean;
};

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function VoiceBubble({ url, duration, mine }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [total, setTotal] = useState(duration);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setPosition(a.currentTime);
    const onEnd = () => {
      setPlaying(false);
      setPosition(0);
    };
    const onMeta = () => {
      if (a.duration && isFinite(a.duration)) setTotal(a.duration);
    };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('ended', onEnd);
    a.addEventListener('loadedmetadata', onMeta);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('ended', onEnd);
      a.removeEventListener('loadedmetadata', onMeta);
    };
  }, []);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.play().catch(() => {});
      setPlaying(true);
    }
  }

  const pct = total > 0 ? Math.min(100, (position / total) * 100) : 0;
  const bars = 28;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        minWidth: '220px',
        maxWidth: '260px',
      }}
    >
      {/* PLAY BUTTON — bigger, high-contrast */}
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        style={{
          width: '42px',
          height: '42px',
          borderRadius: '999px',
          border: '3px solid #000',
          background: mine ? '#FFFDF5' : '#FFD1DC',
          boxShadow: '2px 2px 0 0 black',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          padding: 0,
          lineHeight: 0,
          color: '#000',
        }}
      >
        {playing ? (
          <Pause
            size={18}
            strokeWidth={3}
            style={{ color: '#000', fill: '#000', display: 'block' }}
          />
        ) : (
          <Play
            size={18}
            strokeWidth={3}
            style={{ color: '#000', fill: '#000', display: 'block', marginLeft: '2px' }}
          />
        )}
      </button>

      {/* WAVEFORM + TIME */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '2px',
            height: '24px',
          }}
        >
          {Array.from({ length: bars }).map((_, i) => {
            const h = 4 + ((i * 7) % 18);
            const filled = (i / bars) * 100 <= pct;
            return (
              <span
                key={i}
                style={{
                  width: '2px',
                  height: `${h}px`,
                  borderRadius: '999px',
                  background: filled
                    ? mine
                      ? '#3A7A5E'
                      : '#7A4A9E'
                    : 'rgba(0,0,0,0.22)',
                  flexShrink: 0,
                }}
              />
            );
          })}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '2px',
            fontSize: '10px',
            fontWeight: 900,
            color: 'rgba(0,0,0,0.6)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span>{formatTime(position)}</span>
          <span>{formatTime(total)}</span>
        </div>
      </div>

      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        style={{ display: 'none' }}
      />
    </div>
  );
}