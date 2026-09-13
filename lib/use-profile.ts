'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_color: string;
  accent_color: string;
  notify_chat: boolean;
  notify_tunes: boolean;
  notify_photos: boolean;
  notify_wishes: boolean;
  notify_plans: boolean;
  notify_vault: boolean;
  notify_arcade: boolean;
  sound_enabled: boolean;
  time_format: string;
  allow_dms: string;
  created_at: string;
};

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }
      setUserId(user.id);
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (!cancelled) {
        setProfile(data ?? null);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`profile-self-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          setProfile(payload.new as Profile);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return { profile, loading };
}

export function formatTime(iso: string, timeFormat: string = '12h'): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: timeFormat !== '24h',
  });
}

export function displayLabel(
  email: string,
  displayName: string | null | undefined
): string {
  return displayName?.trim() || email.split('@')[0];
}

export function initialsFor(
  email: string,
  displayName: string | null | undefined
): string {
  const base = displayName?.trim() || email.split('@')[0];
  return base.slice(0, 2).toUpperCase();
}