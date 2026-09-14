'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/lib/use-profile';
import { playDing } from '@/lib/ding';

type Notif = {
  id: string;
  kind: 'chat' | 'wish' | 'photo' | 'plan' | 'dm' | 'tune' | 'arcade';
  text: string;
  href: string;
  at: string;
  color: string;
  emoji: string;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

export function NotificationBell() {
  const router = useRouter();
  const { profile } = useProfile();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [lastSeen, setLastSeen] = useState<string>('1970-01-01T00:00:00Z');
  const [isMobile, setIsMobile] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const settingsRef = useRef({
    notify_chat: true,
    notify_tunes: true,
    notify_photos: true,
    notify_wishes: true,
    notify_plans: true,
    notify_vault: true,
    notify_arcade: true,
    sound_enabled: true,
  });

  useEffect(() => {
    if (!profile) return;
    settingsRef.current = {
      notify_chat: profile.notify_chat ?? true,
      notify_tunes: profile.notify_tunes ?? true,
      notify_photos: profile.notify_photos ?? true,
      notify_wishes: profile.notify_wishes ?? true,
      notify_plans: profile.notify_plans ?? true,
      notify_vault: profile.notify_vault ?? true,
      notify_arcade: profile.notify_arcade ?? true,
      sound_enabled: profile.sound_enabled ?? true,
    };
  }, [profile]);

  const liveSettings = useMemo(
    () => ({
      notify_chat: profile?.notify_chat ?? true,
      notify_tunes: profile?.notify_tunes ?? true,
      notify_photos: profile?.notify_photos ?? true,
      notify_wishes: profile?.notify_wishes ?? true,
      notify_plans: profile?.notify_plans ?? true,
      notify_vault: profile?.notify_vault ?? true,
      notify_arcade: profile?.notify_arcade ?? true,
      sound_enabled: profile?.sound_enabled ?? true,
    }),
    [profile]
  );

  useEffect(() => {
    function check() {
      setIsMobile(window.innerWidth < 640);
    }
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Initial load
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !user.email || cancelled) return;
      setUserId(user.id);
      const myEmail = user.email;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('last_seen_notifications_at')
        .eq('id', user.id)
        .single();

      const lastSeenAt =
        profileData?.last_seen_notifications_at ?? '1970-01-01T00:00:00Z';
      setLastSeen(lastSeenAt);

      const [msgs, wishes, photos, plans, dms, tunes, waitingGames] =
        await Promise.all([
          supabase.from('messages').select('id, user_email, content, created_at').neq('user_email', myEmail).order('created_at', { ascending: false }).limit(8),
          supabase.from('wishes').select('id, user_email, content, created_at').neq('user_email', myEmail).order('created_at', { ascending: false }).limit(5),
          supabase.from('photos').select('id, user_email, caption, created_at').neq('user_email', myEmail).order('created_at', { ascending: false }).limit(5),
          supabase.from('plans').select('id, user_email, title, event_date, created_at').neq('user_email', myEmail).order('created_at', { ascending: false }).limit(5),
          // ⬇️ ADDED sender_id to the select
          supabase.from('vault_dms').select('id, sender_id, sender_email, content, created_at, read_at').eq('recipient_id', user.id).order('created_at', { ascending: false }).limit(5),
          supabase.from('tunes').select('id, user_email, title, created_at').neq('user_email', myEmail).order('created_at', { ascending: false }).limit(5),
          supabase.from('arcade_ttt').select('id, player_x_email, created_at').eq('status', 'waiting').neq('player_x_id', user.id).order('created_at', { ascending: false }).limit(3),
        ]);

      const notifs: Notif[] = [];

      (msgs.data ?? []).forEach((m: any) => {
        const sender = m.user_email.split('@')[0];
        const preview = m.content.length > 40 ? m.content.slice(0, 40) + '…' : m.content;
        notifs.push({ id: `chat-${m.id}`, kind: 'chat', text: `${sender}: ${preview}`, href: '/chat', at: m.created_at, color: '#E2F0D9', emoji: '💬' });
      });
      (wishes.data ?? []).forEach((w: any) => {
        const sender = w.user_email.split('@')[0];
        const preview = w.content.length > 35 ? w.content.slice(0, 35) + '…' : w.content;
        notifs.push({ id: `wish-${w.id}`, kind: 'wish', text: `${sender} dropped a wish: ${preview}`, href: '/wishes', at: w.created_at, color: '#E6E6FA', emoji: '✨' });
      });
      (photos.data ?? []).forEach((p: any) => {
        const sender = p.user_email.split('@')[0];
        const caption = p.caption ? (p.caption.length > 30 ? p.caption.slice(0, 30) + '…' : p.caption) : '';
        notifs.push({ id: `photo-${p.id}`, kind: 'photo', text: caption ? `${sender} posted a photo: ${caption}` : `${sender} posted a photo`, href: '/photos', at: p.created_at, color: '#FFD1DC', emoji: '📸' });
      });
      (plans.data ?? []).forEach((p: any) => {
        const sender = p.user_email.split('@')[0];
        notifs.push({ id: `plan-${p.id}`, kind: 'plan', text: `${sender} planned "${p.title}"`, href: '/plans', at: p.created_at, color: '#FFF5BA', emoji: '📅' });
      });
      // ⬇️ FIXED: DM href now points to specific thread
      (dms.data ?? []).forEach((d: any) => {
        const sender = d.sender_email.split('@')[0];
        const preview = d.content.length > 40 ? d.content.slice(0, 40) + '…' : d.content;
        notifs.push({
          id: `dm-${d.id}`,
          kind: 'dm',
          text: `${sender} sent you: ${preview}`,
          href: `/vault?thread=${d.sender_id}`,
          at: d.created_at,
          color: '#D4F0F0',
          emoji: '🔒',
        });
      });
      (tunes.data ?? []).forEach((t: any) => {
        const sender = t.user_email.split('@')[0];
        notifs.push({ id: `tune-${t.id}`, kind: 'tune', text: `${sender} added "${t.title}"`, href: '/tunes', at: t.created_at, color: '#E2F0D9', emoji: '🎵' });
      });
      (waitingGames.data ?? []).forEach((g: any) => {
        const sender = g.player_x_email.split('@')[0];
        notifs.push({ id: `arcade-${g.id}`, kind: 'arcade', text: `${sender} is waiting for a tic-tac-toe match`, href: '/arcade/tictactoe', at: g.created_at, color: '#E6E6FA', emoji: '🎮' });
      });

      notifs.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      if (!cancelled) {
        setItems(notifs.slice(0, 20));
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // Realtime
  useEffect(() => {
    if (!userId) return;
    const channels: ReturnType<typeof supabase.channel>[] = [];

    function tryPush(n: Notif): boolean {
      const s = settingsRef.current;
      const allowed =
        (n.kind === 'chat' && s.notify_chat) ||
        (n.kind === 'wish' && s.notify_wishes) ||
        (n.kind === 'photo' && s.notify_photos) ||
        (n.kind === 'plan' && s.notify_plans) ||
        (n.kind === 'dm' && s.notify_vault) ||
        (n.kind === 'tune' && s.notify_tunes) ||
        (n.kind === 'arcade' && s.notify_arcade);
      if (!allowed) return false;

      setItems((prev) => {
        if (prev.some((x) => x.id === n.id)) return prev;
        return [n, ...prev].slice(0, 20);
      });
      if (s.sound_enabled) playDing();
      return true;
    }

    async function setup() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !user.email) return;
      const myEmail = user.email;
      const suffix = Math.random().toString(36).slice(2, 8);
      const ch = supabase.channel(`notifs-${suffix}`);

      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new as any;
        if (m.user_email === myEmail) return;
        const sender = m.user_email.split('@')[0];
        const preview = m.content.length > 40 ? m.content.slice(0, 40) + '…' : m.content;
        tryPush({ id: `chat-${m.id}`, kind: 'chat', text: `${sender}: ${preview}`, href: '/chat', at: m.created_at, color: '#E2F0D9', emoji: '💬' });
      });

      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wishes' }, (payload) => {
        const w = payload.new as any;
        if (w.user_email === myEmail) return;
        const sender = w.user_email.split('@')[0];
        const preview = w.content.length > 35 ? w.content.slice(0, 35) + '…' : w.content;
        tryPush({ id: `wish-${w.id}`, kind: 'wish', text: `${sender} dropped a wish: ${preview}`, href: '/wishes', at: w.created_at, color: '#E6E6FA', emoji: '✨' });
      });

      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'photos' }, (payload) => {
        const p = payload.new as any;
        if (p.user_email === myEmail) return;
        const sender = p.user_email.split('@')[0];
        const caption = p.caption ? `: ${p.caption.slice(0, 30)}` : '';
        tryPush({ id: `photo-${p.id}`, kind: 'photo', text: `${sender} posted a photo${caption}`, href: '/photos', at: p.created_at, color: '#FFD1DC', emoji: '📸' });
      });

      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'plans' }, (payload) => {
        const p = payload.new as any;
        if (p.user_email === myEmail) return;
        const sender = p.user_email.split('@')[0];
        tryPush({ id: `plan-${p.id}`, kind: 'plan', text: `${sender} planned "${p.title}"`, href: '/plans', at: p.created_at, color: '#FFF5BA', emoji: '📅' });
      });

      // ⬇️ FIXED: DM realtime handler also points to specific thread
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vault_dms' }, (payload) => {
        const d = payload.new as any;
        if (d.recipient_id !== user.id) return;
        const sender = d.sender_email.split('@')[0];
        const preview = d.content.length > 40 ? d.content.slice(0, 40) + '…' : d.content;
        tryPush({
          id: `dm-${d.id}`,
          kind: 'dm',
          text: `${sender} sent you: ${preview}`,
          href: `/vault?thread=${d.sender_id}`,
          at: d.created_at,
          color: '#D4F0F0',
          emoji: '🔒',
        });
      });

      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tunes' }, (payload) => {
        const t = payload.new as any;
        if (t.user_email === myEmail) return;
        const sender = t.user_email.split('@')[0];
        tryPush({ id: `tune-${t.id}`, kind: 'tune', text: `${sender} added "${t.title}"`, href: '/tunes', at: t.created_at, color: '#E2F0D9', emoji: '🎵' });
      });

      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'arcade_ttt' }, (payload) => {
        const g = payload.new as any;
        if (g.player_x_id === user.id) return;
        if (g.status !== 'waiting') return;
        const sender = g.player_x_email.split('@')[0];
        tryPush({ id: `arcade-${g.id}`, kind: 'arcade', text: `${sender} is waiting for a tic-tac-toe match`, href: '/arcade/tictactoe', at: g.created_at, color: '#E6E6FA', emoji: '🎮' });
      });

      ch.subscribe();
      channels.push(ch);
    }

    setup();
    return () => {
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, [userId]);

  const visibleItems = items.filter((n) => {
    if (n.kind === 'chat') return liveSettings.notify_chat;
    if (n.kind === 'wish') return liveSettings.notify_wishes;
    if (n.kind === 'photo') return liveSettings.notify_photos;
    if (n.kind === 'plan') return liveSettings.notify_plans;
    if (n.kind === 'dm') return liveSettings.notify_vault;
    if (n.kind === 'tune') return liveSettings.notify_tunes;
    if (n.kind === 'arcade') return liveSettings.notify_arcade;
    return true;
  });

  const unreadCount = visibleItems.filter(
    (i) => new Date(i.at).getTime() > new Date(lastSeen).getTime()
  ).length;
  const hasUnread = unreadCount > 0;

  async function handleOpen() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && userId) {
      const now = new Date().toISOString();
      setLastSeen(now);
      await supabase
        .from('profiles')
        .update({ last_seen_notifications_at: now })
        .eq('id', userId);
    }
  }

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  const panelStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        top: '80px',
        left: '12px',
        right: '12px',
        backgroundColor: '#FFFDF5',
        border: '4px solid black',
        borderRadius: '16px',
        boxShadow: '8px 8px 0 0 black',
        zIndex: 300,
        maxHeight: 'calc(100vh - 100px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }
    : {
        position: 'absolute',
        top: 'calc(100% + 8px)',
        right: 0,
        width: '360px',
        backgroundColor: '#FFFDF5',
        border: '4px solid black',
        borderRadius: '16px',
        boxShadow: '8px 8px 0 0 black',
        zIndex: 200,
        maxHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      };

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Notifications"
        className="relative flex size-11 items-center justify-center rounded-2xl border-4 border-black shadow-brutal-sm transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
        style={{ backgroundColor: '#E6E6FA', color: '#000' }}
      >
        <Bell className="size-5" strokeWidth={2.75} />
        {hasUnread && (
          <span
            className="absolute flex items-center justify-center border-2 border-black font-black"
            style={{
              top: '-6px',
              right: '-6px',
              minWidth: '20px',
              height: '20px',
              padding: '0 4px',
              backgroundColor: '#FF8BA7',
              color: '#000',
              fontSize: '10px',
              borderRadius: '999px',
              boxShadow: '2px 2px 0 0 black',
              lineHeight: 1,
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          <div
            className="flex items-center justify-between border-b-4 border-black shrink-0"
            style={{ backgroundColor: '#E6E6FA', padding: '10px 14px' }}
          >
            <p className="font-black" style={{ fontSize: '12px', color: '#000' }}>
              🔔 activity
            </p>
            <button
              onClick={() => setOpen(false)}
              className="border-2 border-black bg-[#FFD1DC] text-black font-black rounded-lg hover:-translate-y-0.5 active:translate-y-0.5 transition"
              style={{
                width: '24px',
                height: '24px',
                fontSize: '11px',
                lineHeight: 1,
                boxShadow: '2px 2px 0 0 black',
              }}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div style={{ overflowY: 'auto', padding: '8px' }}>
            {loading ? (
              <p
                className="text-center font-bold"
                style={{ color: 'rgba(0,0,0,0.4)', fontSize: '11px', padding: '24px 0' }}
              >
                loading...
              </p>
            ) : visibleItems.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: '32px', marginBottom: '8px' }}>🕊️</p>
                <p className="font-black" style={{ fontSize: '12px', color: '#000' }}>
                  all quiet
                </p>
                <p
                  className="font-bold"
                  style={{ fontSize: '10px', color: 'rgba(0,0,0,0.5)', marginTop: '4px' }}
                >
                  {items.length > 0 ? 'muted — check settings' : 'no activity yet'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col" style={{ gap: '6px' }}>
                {visibleItems.map((n) => {
                  const isNew = new Date(n.at).getTime() > new Date(lastSeen).getTime();
                  return (
                    <button
                      key={n.id}
                      onClick={() => go(n.href)}
                      className="flex items-start border-2 border-black rounded-xl text-left hover:-translate-y-0.5 active:translate-y-0.5 transition"
                      style={{
                        backgroundColor: n.color,
                        padding: '8px 10px',
                        gap: '10px',
                        boxShadow: '2px 2px 0 0 black',
                        position: 'relative',
                      }}
                    >
                      <span
                        className="flex items-center justify-center border-2 border-black shrink-0"
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          backgroundColor: '#FFFDF5',
                          fontSize: '16px',
                          lineHeight: 1,
                        }}
                      >
                        {n.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className="font-bold"
                          style={{
                            fontSize: '11px',
                            color: '#000',
                            lineHeight: 1.4,
                            wordBreak: 'break-word',
                          }}
                        >
                          {n.text}
                        </p>
                        <p
                          className="font-bold"
                          style={{
                            fontSize: '9px',
                            color: 'rgba(0,0,0,0.5)',
                            marginTop: '2px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                          }}
                        >
                          {timeAgo(n.at)}
                        </p>
                      </div>
                      {isNew && (
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: '#FF8BA7',
                            border: '1.5px solid black',
                            flexShrink: 0,
                            marginTop: '4px',
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}