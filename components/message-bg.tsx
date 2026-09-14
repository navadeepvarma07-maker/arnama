'use client';

import { useEffect, useRef, useState } from 'react';

export type MessageBg =
  // light
  | 'plain'
  | 'dots'
  | 'grid'
  | 'stripes'
  | 'hearts'
  | 'stars'
  | 'sunset'
  | 'mint'
  | 'candy'
  // dark
  | 'night'
  | 'planets'
  | 'aurora'
  | 'cosmic';

export const MESSAGE_BGS: {
  id: MessageBg;
  label: string;
  emoji: string;
  dark: boolean;
}[] = [
  // Light
  { id: 'plain', label: 'plain', emoji: '⬜', dark: false },
  { id: 'dots', label: 'dots', emoji: '⚬', dark: false },
  { id: 'grid', label: 'grid', emoji: '▦', dark: false },
  { id: 'stripes', label: 'stripes', emoji: '▨', dark: false },
  { id: 'hearts', label: 'hearts', emoji: '💕', dark: false },
  { id: 'stars', label: 'stars', emoji: '✨', dark: false },
  { id: 'sunset', label: 'sunset', emoji: '🌅', dark: false },
  { id: 'mint', label: 'mint', emoji: '🌿', dark: false },
  { id: 'candy', label: 'candy', emoji: '🍬', dark: false },
  // Dark
  { id: 'night', label: 'night', emoji: '🌌', dark: true },
  { id: 'planets', label: 'planets', emoji: '🪐', dark: true },
  { id: 'aurora', label: 'aurora', emoji: '🌠', dark: true },
  { id: 'cosmic', label: 'cosmic', emoji: '💫', dark: true },
];

export function isDarkBg(id: MessageBg | string | undefined): boolean {
  return MESSAGE_BGS.find((b) => b.id === id)?.dark ?? false;
}

// ============================================================
// SVG shapes (data URIs) — for real heart / star / sparkle
// Sizes chosen so the shapes tile cleanly and align at edges
// ============================================================

// Heart: 48px canvas, shape ~34px
const HEART_SVG =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'><path d='M24 41 C24 41 8 28 8 18 C8 12 12.5 7.5 18 7.5 C21 7.5 23.2 9.2 24 11 C24.8 9.2 27 7.5 30 7.5 C35.5 7.5 40 12 40 18 C40 28 24 41 24 41 Z' fill='%23FF8BA7' opacity='0.4'/></svg>\")";

// Star: 64px canvas, shape ~48px
const STAR_SVG =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'><polygon points='32,7 39,25 58,25 43,37 48,56 32,45 16,56 21,37 6,25 25,25' fill='%23FFD166' opacity='0.5'/></svg>\")";

// Sparkle: 32px canvas (half of star → aligns to grid center)
const SPARKLE_SVG =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path d='M16 4 L18.5 13.5 L28 16 L18.5 18.5 L16 28 L13.5 18.5 L4 16 L13.5 13.5 Z' fill='%239B8FD4' opacity='0.45'/></svg>\")";

export function getBgStyle(id: MessageBg | string): React.CSSProperties {
  switch (id) {
    // ============ LIGHT ============
    case 'dots':
      return {
        backgroundColor: '#FFFDF5',
        backgroundImage:
          'radial-gradient(circle, rgba(0,0,0,0.12) 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      };
    case 'grid':
      return {
        backgroundColor: '#FFFDF5',
        backgroundImage:
          'linear-gradient(to right, rgba(0,0,0,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.08) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      };
    case 'stripes':
      return {
        backgroundColor: '#FFFDF5',
        backgroundImage:
          'repeating-linear-gradient(45deg, rgba(0,0,0,0.05) 0 10px, transparent 10px 20px)',
      };
    case 'hearts':
      // 48px tiles, smaller hearts, tighter spacing
      return {
        backgroundColor: '#FFF5F7',
        backgroundImage: HEART_SVG,
        backgroundSize: '48px 48px',
      };
    case 'stars':
      // 64px base + 32px sparkle at centered offset → clean grid
      return {
        backgroundColor: '#F5F0FF',
        backgroundImage: `${STAR_SVG}, ${SPARKLE_SVG}`,
        backgroundSize: '64px 64px, 32px 32px',
        backgroundPosition: '0 0, 32px 32px',
        backgroundRepeat: 'repeat, repeat',
      };
    case 'sunset':
      return {
        backgroundImage: 'linear-gradient(180deg, #FFD1DC 0%, #FFE4B5 100%)',
      };
    case 'mint':
      return {
        backgroundImage: 'linear-gradient(180deg, #E2F0D9 0%, #E6E6FA 100%)',
      };
    case 'candy':
      return {
        backgroundColor: '#FFD1DC',
        backgroundImage:
          'repeating-linear-gradient(135deg, rgba(255,255,255,0.4) 0 12px, transparent 12px 24px), repeating-linear-gradient(45deg, rgba(230,230,250,0.5) 0 12px, transparent 12px 24px)',
      };

    // ============ DARK ============
    case 'night':
      return {
        backgroundColor: '#0a0a1a',
        backgroundImage: `
          radial-gradient(1.5px 1.5px at 20px 30px, #ffffff, transparent),
          radial-gradient(1px 1px at 70px 90px, #ffffff, transparent),
          radial-gradient(1px 1px at 130px 40px, #ffffff, transparent),
          radial-gradient(2px 2px at 180px 130px, #c8d4ff, transparent),
          radial-gradient(1px 1px at 40px 180px, #ffffff, transparent),
          radial-gradient(1.5px 1.5px at 100px 150px, #ffe6a8, transparent),
          radial-gradient(ellipse at top, #1a1535 0%, #050510 100%)
        `,
        backgroundSize:
          '220px 220px, 220px 220px, 220px 220px, 220px 220px, 220px 220px, 220px 220px, 100% 100%',
        backgroundAttachment: 'scroll, scroll, scroll, scroll, scroll, scroll, fixed',
      };
    case 'planets':
      return {
        backgroundColor: '#0f0a1e',
        backgroundImage: `
          radial-gradient(circle at 85% 20%, #9B8FD4 0%, #9B8FD4 3%, rgba(155,143,212,0.3) 6%, transparent 10%),
          radial-gradient(circle at 18% 78%, #FFB8D1 0%, #FFB8D1 2%, rgba(255,184,209,0.3) 5%, transparent 8%),
          radial-gradient(circle at 55% 55%, #7FB89B 0%, #7FB89B 1.5%, rgba(127,184,155,0.25) 3%, transparent 6%),
          radial-gradient(circle at 40% 15%, #FFE6A8 0%, #FFE6A8 1%, rgba(255,230,168,0.25) 3%, transparent 5%),
          radial-gradient(ellipse at center, #1a1030 0%, #050208 100%)
        `,
        backgroundSize: '100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 100%',
        backgroundRepeat: 'no-repeat',
      };
    case 'aurora':
      return {
        backgroundColor: '#06121a',
        backgroundImage: `
          radial-gradient(ellipse 60% 40% at 25% 20%, rgba(100,255,180,0.45) 0%, transparent 65%),
          radial-gradient(ellipse 55% 35% at 75% 35%, rgba(150,100,255,0.4) 0%, transparent 65%),
          radial-gradient(ellipse 70% 50% at 50% 100%, rgba(50,180,255,0.35) 0%, transparent 70%),
          radial-gradient(1px 1px at 30px 40px, #ffffff, transparent),
          radial-gradient(1px 1px at 120px 80px, #ffffff, transparent),
          radial-gradient(1.5px 1.5px at 190px 30px, #ffffff, transparent),
          linear-gradient(180deg, #0a1a2a 0%, #06121a 100%)
        `,
        backgroundSize:
          '100% 100%, 100% 100%, 100% 100%, 220px 220px, 220px 220px, 220px 220px, 100% 100%',
        backgroundRepeat:
          'no-repeat, no-repeat, no-repeat, repeat, repeat, repeat, no-repeat',
      };
    case 'cosmic':
      return {
        backgroundColor: '#0d0815',
        backgroundImage: `
          radial-gradient(circle at 30% 30%, rgba(255,139,167,0.35) 0%, transparent 35%),
          radial-gradient(circle at 75% 65%, rgba(155,143,212,0.45) 0%, transparent 38%),
          radial-gradient(circle at 45% 90%, rgba(100,200,255,0.3) 0%, transparent 30%),
          radial-gradient(1px 1px at 50px 60px, #ffffff, transparent),
          radial-gradient(1px 1px at 140px 100px, #ffffff, transparent),
          linear-gradient(135deg, #0d0815 0%, #1a0e2e 100%)
        `,
        backgroundSize:
          '100% 100%, 100% 100%, 100% 100%, 200px 200px, 200px 200px, 100% 100%',
        backgroundRepeat:
          'no-repeat, no-repeat, no-repeat, repeat, repeat, no-repeat',
      };

    case 'plain':
    default:
      return { backgroundColor: '#FFFFFF' };
  }
}

export function BgPickerButton({
  current,
  onChange,
}: {
  current: MessageBg | string;
  onChange: (bg: MessageBg) => void;
}) {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function check() {
      setIsMobile(window.innerWidth < 640);
    }
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const panelStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        bottom: '16px',
        left: '12px',
        right: '12px',
        backgroundColor: '#FFFDF5',
        border: '3px solid black',
        borderRadius: '18px',
        boxShadow: '5px 5px 0 0 black',
        padding: '12px',
        zIndex: 600,
        maxHeight: '55vh',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }
    : {
        position: 'absolute',
        top: 'calc(100% + 8px)',
        right: 0,
        backgroundColor: '#FFFDF5',
        border: '3px solid black',
        borderRadius: '14px',
        boxShadow: '5px 5px 0 0 black',
        padding: '10px',
        zIndex: 400,
        minWidth: '260px',
      };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '40px',
          height: '40px',
          border: '3px solid black',
          borderRadius: '999px',
          backgroundColor: '#FFF5BA',
          color: '#000',
          fontSize: '17px',
          lineHeight: 1,
          boxShadow: '3px 3px 0 0 black',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
        title="change background"
        aria-label="change background"
      >
        🎨
      </button>

      {open && (
        <>
          {isMobile && (
            <div
              onClick={() => setOpen(false)}
              style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(0,0,0,0.4)',
                zIndex: 599,
              }}
            />
          )}

          <div style={panelStyle}>
            <p
              style={{
                margin: '0 0 10px 4px',
                fontSize: '10px',
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#000',
              }}
            >
              pick a background
            </p>

            <p
              style={{
                margin: '0 0 6px 4px',
                fontSize: '9px',
                fontWeight: 900,
                color: 'rgba(0,0,0,0.5)',
              }}
            >
              ☀️ light
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '6px',
                marginBottom: '12px',
              }}
            >
              {MESSAGE_BGS.filter((b) => !b.dark).map((bg) => (
                <button
                  key={bg.id}
                  onClick={() => {
                    onChange(bg.id);
                    setOpen(false);
                  }}
                  style={{
                    border: '2px solid black',
                    borderRadius: '10px',
                    padding: '8px 4px',
                    fontSize: '9px',
                    fontWeight: 900,
                    color: '#000',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    ...getBgStyle(bg.id),
                    boxShadow:
                      current === bg.id
                        ? '0 0 0 2px #FF8BA7, 2px 2px 0 0 black'
                        : '2px 2px 0 0 black',
                  }}
                  title={bg.label}
                >
                  <span style={{ fontSize: '16px', lineHeight: 1 }}>{bg.emoji}</span>
                  <span>{bg.label}</span>
                </button>
              ))}
            </div>

            <p
              style={{
                margin: '0 0 6px 4px',
                fontSize: '9px',
                fontWeight: 900,
                color: 'rgba(0,0,0,0.5)',
              }}
            >
              🌙 dark
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '6px',
              }}
            >
              {MESSAGE_BGS.filter((b) => b.dark).map((bg) => (
                <button
                  key={bg.id}
                  onClick={() => {
                    onChange(bg.id);
                    setOpen(false);
                  }}
                  style={{
                    border: '2px solid black',
                    borderRadius: '10px',
                    padding: '8px 4px',
                    fontSize: '9px',
                    fontWeight: 900,
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    ...getBgStyle(bg.id),
                    boxShadow:
                      current === bg.id
                        ? '0 0 0 2px #FF8BA7, 2px 2px 0 0 black'
                        : '2px 2px 0 0 black',
                  }}
                  title={bg.label}
                >
                  <span style={{ fontSize: '16px', lineHeight: 1 }}>{bg.emoji}</span>
                  <span>{bg.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}