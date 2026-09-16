'use client';

import { useEffect, useRef } from 'react';

/**
 * Adds a red dot to the favicon and a (N) prefix to the document title
 * whenever `count` is > 0. Restores both when it drops to 0.
 */
export function useTabBadge(count: number) {
  const originalTitleRef = useRef<string | null>(null);
  const originalFaviconRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    // Cache originals once
    if (originalTitleRef.current === null) {
      originalTitleRef.current = document.title || 'arnama';
    }
    if (originalFaviconRef.current === null) {
      const link = document.querySelector(
        "link[rel*='icon']"
      ) as HTMLLinkElement | null;
      originalFaviconRef.current = link?.href ?? '/icon.svg';
    }

    const badge = count > 0 ? count : 0;

    // 1. Title prefix
    document.title =
      badge > 0
        ? `(${badge > 99 ? '99+' : badge}) ${originalTitleRef.current}`
        : originalTitleRef.current;

    // 2. Favicon dot
    (async () => {
      const links = document.querySelectorAll("link[rel*='icon']");
      if (links.length === 0) return;

      // No badge → restore original
      if (badge === 0) {
        links.forEach((l: any) => {
          if (originalFaviconRef.current) l.href = originalFaviconRef.current;
        });
        return;
      }

      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Try to draw the base icon, but never fail if it doesn't load
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = originalFaviconRef.current ?? '/icon.svg';
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          setTimeout(() => resolve(), 400);
        });
        if (img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, 0, 0, size, size);
        }
      } catch {}

      // Red dot in the top-right with white halo + black ring
      const cx = size - 14;
      const cy = 14;
      const r = 11;

      ctx.beginPath();
      ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
      ctx.fillStyle = 'white';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#FF3B30';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      ctx.stroke();

      const url = canvas.toDataURL('image/png');
      links.forEach((l: any) => {
        l.href = url;
      });
    })();
  }, [count]);
}