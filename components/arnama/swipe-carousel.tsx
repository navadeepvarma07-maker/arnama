'use client';

import { useRef, useState } from 'react';

export function SwipeCarousel({
  slides,
  labels,
  index,
  onIndexChange,
  mode = 'fill',
}: {
  slides: React.ReactNode[];
  labels: string[];
  index: number;
  onIndexChange: (i: number) => void;
  mode?: 'fill' | 'auto';
}) {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const axis = useRef<'x' | 'y' | null>(null);
  const pointerDown = useRef(false);
  const count = slides.length;

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointerDown.current = true;
    startX.current = e.clientX;
    startY.current = e.clientY;
    axis.current = null;
    setIsDragging(false);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointerDown.current) return;

    if (axis.current === null) {
      const dx = e.clientX - startX.current;
      const dy = e.clientY - startY.current;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        axis.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if (axis.current === 'x') {
          setIsDragging(true);
          try {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          } catch {}
        }
      }
      return;
    }

    if (axis.current !== 'x') return;

    const dx = e.clientX - startX.current;
    let offset = dx;
    if ((index === 0 && dx > 0) || (index === count - 1 && dx < 0)) {
      offset = dx * 0.3;
    }
    setDragOffset(offset);
  }

  function endDrag() {
    pointerDown.current = false;

    if (axis.current === 'x' && isDragging) {
      const threshold = 60;
      if (dragOffset < -threshold && index < count - 1) {
        onIndexChange(index + 1);
      } else if (dragOffset > threshold && index > 0) {
        onIndexChange(index - 1);
      }
    }
    setDragOffset(0);
    setIsDragging(false);
    axis.current = null;
  }

  function onPointerUp(e: React.PointerEvent) {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    endDrag();
  }

  function onPointerCancel() {
    endDrag();
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        width: '100%',
        ...(mode === 'fill' ? { flex: 1 } : {}),
      }}
    >
      {/* Segmented glass tab bar — full width */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          padding: '6px',
          border: '4px solid black',
          borderRadius: '999px',
          background: `
            linear-gradient(
              180deg,
              rgba(255, 255, 255, 0.5) 0%,
              rgba(255, 255, 255, 0) 60%
            ),
            rgba(255, 253, 245, 0.75)
          `,
          backdropFilter: 'blur(14px) saturate(170%)',
          WebkitBackdropFilter: 'blur(14px) saturate(170%)',
          boxShadow: `
            5px 5px 0 0 black,
            inset 0 1px 0 rgba(255, 255, 255, 0.7)
          `,
          flexShrink: 0,
          marginBottom: '12px',
          userSelect: 'none',
        }}
      >
        {labels.map((label, i) => {
          const isActive = i === index;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onIndexChange(i)}
              style={{
                flex: 1,
                padding: '10px',
                border: '2px solid black',
                borderRadius: '999px',
                fontWeight: 900,
                fontSize: '12px',
                background: isActive
                  ? `
                    linear-gradient(
                      180deg,
                      rgba(255, 255, 255, 0.55) 0%,
                      rgba(255, 255, 255, 0) 60%
                    ),
                    #D4F0F0
                  `
                  : 'transparent',
                color: '#000',
                boxShadow: isActive
                  ? `
                    3px 3px 0 0 black,
                    inset 0 1px 0 rgba(255, 255, 255, 0.85)
                  `
                  : 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Slides viewport */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        style={{
          position: 'relative',
          overflow: 'hidden',
          width: '100%',
          flex: mode === 'fill' ? 1 : undefined,
          minHeight: 0,
          touchAction: 'pan-y',
          cursor: isDragging ? 'grabbing' : 'default',
        }}
      >
        {slides.map((slide, i) => {
          const basePercent = (i - index) * 100;
          const dragPx = isDragging ? dragOffset : 0;
          const isActive = i === index;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                transform: `translateX(calc(${basePercent}% + ${dragPx}px))`,
                transition: isDragging
                  ? 'none'
                  : 'transform 0.4s cubic-bezier(0.34, 1.15, 0.64, 1)',
                overflow: 'hidden',
                pointerEvents: isActive ? 'auto' : 'none',
              }}
            >
              {slide}
            </div>
          );
        })}
      </div>
    </div>
  );
}