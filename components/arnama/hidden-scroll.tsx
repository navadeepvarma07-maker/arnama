'use client';

import { useRef } from 'react';

/**
 * Absolute-fills its parent, scrolls vertically, scrollbar is invisible.
 * Parent MUST have `position: relative` and a definite height.
 */
export function HiddenScroll({
  children,
  sidePadding = 0,
  bottomPadding = 0,
  topPadding = 0,
  onScroll,
  style,
  className,
}: {
  children: React.ReactNode;
  sidePadding?: number;
  bottomPadding?: number;
  topPadding?: number;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  style?: React.CSSProperties;
  className?: string;
}) {
  const idRef = useRef(`hs-${Math.random().toString(36).slice(2, 10)}`);
  const id = idRef.current;

  return (
    <>
      <style>{`
        #${id} {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        #${id}::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }
      `}</style>
      <div
        id={id}
        className={className}
        onScroll={onScroll}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingTop: topPadding ? `${topPadding}px` : undefined,
          paddingLeft: sidePadding ? `${sidePadding}px` : undefined,
          paddingRight: sidePadding ? `${sidePadding}px` : undefined,
          paddingBottom: bottomPadding ? `${bottomPadding}px` : undefined,
          WebkitOverflowScrolling: 'touch',
          ...style,
        }}
      >
        {children}
      </div>
    </>
  );
}