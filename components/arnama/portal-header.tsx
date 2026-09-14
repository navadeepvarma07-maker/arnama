'use client';

import Link from 'next/link';
import { Settings, Sun, Moon, Monitor } from 'lucide-react';
import { NotificationBell } from './notification-bell';
import { useTheme } from '@/lib/use-theme';
import { supabase } from '@/lib/supabase';

export function PortalHeader() {
  const { theme, resolved, setTheme } = useTheme();

  const ThemeIcon =
    theme === 'system' ? Monitor : resolved === 'light' ? Sun : Moon;

  async function cycleTheme() {
    const next =
      theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';

    setTheme(next);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('profiles').update({ theme: next }).eq('id', user.id);
    } catch (err) {
      console.error('theme save failed:', err);
    }
  }

  // Glass recipe — shared by both header buttons
  const glassYellow: React.CSSProperties = {
    background: `
      linear-gradient(
        180deg,
        rgba(255, 255, 255, 0.55) 0%,
        rgba(255, 255, 255, 0) 60%
      ),
      rgba(255, 245, 186, 0.88)
    `,
    backdropFilter: 'blur(14px) saturate(170%)',
    WebkitBackdropFilter: 'blur(14px) saturate(170%)',
    color: '#000',
  };

  const glassMint: React.CSSProperties = {
    background: `
      linear-gradient(
        180deg,
        rgba(255, 255, 255, 0.55) 0%,
        rgba(255, 255, 255, 0) 60%
      ),
      rgba(226, 240, 217, 0.88)
    `,
    backdropFilter: 'blur(14px) saturate(170%)',
    WebkitBackdropFilter: 'blur(14px) saturate(170%)',
    color: '#000',
  };

  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className="flex size-11 shrink-0 rotate-3 items-center justify-center rounded-2xl border-4 border-black bg-pink font-display text-lg shadow-brutal-sm sm:size-12"
          style={{ color: '#000' }}
        >
          a
        </div>
        <div className="min-w-0">
          <h1
            className="truncate font-display text-lg leading-none sm:text-2xl"
            style={{ color: 'var(--text-primary)' }}
          >
            arnama
          </h1>
          <p
            className="mt-1 truncate text-xs font-bold sm:mt-1.5 sm:text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            our little corner of the internet
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <NotificationBell />
        <button
          type="button"
          onClick={cycleTheme}
          aria-label="Toggle theme"
          className="flex size-11 items-center justify-center rounded-2xl border-4 border-black shadow-brutal-sm transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
          style={glassYellow}
          title={`Theme: ${theme}`}
        >
          <ThemeIcon className="size-5" strokeWidth={2.75} />
        </button>
        <Link
          href="/settings"
          aria-label="Settings"
          className="flex size-11 items-center justify-center rounded-2xl border-4 border-black shadow-brutal-sm transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
          style={glassMint}
        >
          <Settings className="size-5" strokeWidth={2.75} />
        </Link>
      </div>
    </header>
  );
}