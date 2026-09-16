'use client';

import { useEffect, useRef, useState } from 'react';

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

  const viewportRef = useRef<HTMLDivElement>(null);

  // Refs so native listeners always read fresh values
  const indexRef = useRef(index);
  const countRef = useRef(slides.length);
  const onIndexChangeRef = useRef(onIndexChange);

  const startX = useRef(0);
  const startY = useRef(0);
  const axis = useRef<'x' | 'y' | null>(null);
  const active = useRef(false);
  const lastOffset = useRef(0);
  const wasDragging = useRef(false);

  useEffect(() => {
    indexRef.current = index;
    countRef.current = slides.length;
    onIndexChangeRef.current = onIndexChange;
  }, [index, slides.length, onIndexChange]);

  // Native touch + mouse listeners
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const THRESHOLD = 55;
    const MIN_MOVE = 8;

    function resetState() {
      startX.current = 0;
      startY.current = 0;
      axis.current = null;
      active.current = false;
      lastOffset.current = 0;
      wasDragging.current = false;
      setDragOffset(0);
      setIsDragging(false);
    }

    function onStart(x: number, y: number) {
      startX.current = x;
      startY.current = y;
      axis.current = null;
      active.current = true;
      lastOffset.current = 0;
      wasDragging.current = false;
      setDragOffset(0);
      setIsDragging(false);
    }

    function onMove(x: number, y: number, touchEvt?: TouchEvent) {
      if (!active.current) return;

      const dx = x - startX.current;
      const dy = y - startY.current;

      // Decide axis on first meaningful move
      if (axis.current === null) {
        if (Math.abs(dx) > MIN_MOVE || Math.abs(dy) > MIN_MOVE) {
          axis.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
          if (axis.current === 'x') {
            wasDragging.current = true;
            setIsDragging(true);
          }
        }
        return;
      }

      if (axis.current !== 'x') return;

      // 🎯 KEY FIX — stop the browser from scrolling while we drag horizontally
      if (touchEvt && touchEvt.cancelable) {
        touchEvt.preventDefault();
      }

      const cur = indexRef.current;
      const cnt = countRef.current;
      let off = dx;
      if ((cur === 0 && dx > 0) || (cur === cnt - 1 && dx < 0)) {
        off = dx * 0.3;
      }
      lastOffset.current = off;
      setDragOffset(off);
    }

    function onEnd() {
      if (!active.current) return;

      const cur = indexRef.current;
      const cnt = countRef.current;
      const off = lastOffset.current;

      if (axis.current === 'x' && wasDragging.current) {
        if (off < -THRESHOLD && cur < cnt - 1) {
          onIndexChangeRef.current(cur + 1);
        } else if (off > THRESHOLD && cur > 0) {
          onIndexChangeRef.current(cur - 1);
        }
      }
      resetState();
    }

    // Touch handlers
    function handleTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      onStart(t.clientX, t.clientY);
    }

    function handleTouchMove(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      onMove(t.clientX, t.clientY, e);
    }

    function handleTouchEnd() {
      onEnd();
    }

    // Mouse handlers (desktop)
    function handleMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      onStart(e.clientX, e.clientY);
    }

    function handleMouseMove(e: MouseEvent) {
      if (!active.current) return;
      onMove(e.clientX, e.clientY);
    }

    function handleMouseUp() {
      onEnd();
    }

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);
    el.addEventListener('touchcancel', handleTouchEnd);

    el.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);

      el.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

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
      {/* Segmented glass tab bar */}
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
        ref={viewportRef}
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