'use client';

import { useEffect } from 'react';

export function SWRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => console.log('[sw] registered', reg.scope))
      .catch((err) => console.error('[sw] register failed:', err));
  }, []);

  return null;
}