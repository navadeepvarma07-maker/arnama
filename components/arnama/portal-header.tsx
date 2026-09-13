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

  return (
    <header className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <div
          className="flex size-10 shrink-0 rotate-3 items-center justify-center rounded-2xl border-4 border-black bg-pink font-display text-base shadow-brutal-sm sm:size-12 sm:text-lg"
          style={{ color: '#000' }}
        >
          a
        </div>
        <div className="min-w-0 flex-1">
          <h1
            className="truncate font-display text-base leading-none sm:text-2xl"
            style={{ color: 'var(--text-primary)' }}
          >
            arnama
          </h1>
          <p
            className="mt-1 font-bold leading-tight sm:mt-1.5 sm:text-sm"
            style={{
              color: 'var(--text-secondary)',
              fontSize: '9.5px',
            }}
          >
            our little corner of the internet
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <NotificationBell />
        <button
          type="button"
          onClick={cycleTheme}
          aria-label="Toggle theme"
          className="flex size-10 items-center justify-center rounded-2xl border-4 border-black shadow-brutal-sm transition-transform hover:-translate-y-0.5 active:translate-y-0.5 sm:size-11"
          style={{ backgroundColor: '#FFF5BA', color: '#000' }}
          title={`Theme: ${theme}`}
        >
          <ThemeIcon className="size-4 sm:size-5" strokeWidth={2.75} />
        </button>
        <Link
          href="/settings"
          aria-label="Settings"
          className="flex size-10 items-center justify-center rounded-2xl border-4 border-black shadow-brutal-sm transition-transform hover:-translate-y-0.5 active:translate-y-0.5 sm:size-11"
          style={{ backgroundColor: '#E2F0D9', color: '#000' }}
        >
          <Settings className="size-4 sm:size-5" strokeWidth={2.75} />
        </Link>
      </div>
    </header>
  );
}