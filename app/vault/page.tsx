'use client';
import { CutePet } from '@/components/arnama/cute-pet';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useProfile, displayLabel, initialsFor } from '@/lib/use-profile';
import { BgPickerButton, getBgStyle, isDarkBg, MessageBg } from '@/components/message-bg';
import { SwipeCarousel } from '@/components/arnama/swipe-carousel';
import { HiddenScroll } from '@/components/arnama/hidden-scroll';
import { playDing } from '@/lib/ding';
import { parseStoryShare } from '@/components/arnama/story-context';
import { VoiceRecorder } from '@/components/arnama/voice-recorder';
import { VoiceBubble } from '@/components/arnama/voice-bubble';
import { ImagePicker } from '@/components/arnama/image-picker';
import { formatVoiceContent, parseVoiceContent } from '@/lib/voice';
import { Lock, Globe, Pencil, X } from 'lucide-react';

type Note = {
  id: string;
  user_id: string;
  title: string | null;
  content: string;
  visibility: 'private' | 'shared' | null;
  created_at: string;
  updated_at: string;
};

type DM = {
  id: string;
  sender_id: string;
  sender_email: string;
  recipient_id: string;
  recipient_email: string;
  content: string;
  created_at: string;
  read_at: string | null;
  reply_to_id: string | null;
  edited_at: string | null;
};

type Profile = { id: string; email: string; display_name?: string | null };

type ContextMenu = { message: DM; x: number; y: number } | null;

type ReactionsMap = Record<string, Record<string, string[]>>;

const NOTE_COLORS = ['#FFF5BA', '#FFD1DC', '#E2F0D9', '#E6E6FA', '#D4F0F0'];
const REACTION_EMOJIS = ['❤️', '🔥', '😂', '👍', '😮', '😭'];

function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 17 + id.charCodeAt(i)) | 0;
  return NOTE_COLORS[Math.abs(hash) % NOTE_COLORS.length];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

function formatTime(iso: string, timeFormat: string = '12h'): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: timeFormat !== '24h',
  });
}

function VaultContent() {
  const [threadParam, setThreadParam] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setThreadParam(params.get('thread'));
  }, []);

  const { profile } = useProfile();
  const timeFormat = profile?.time_format ?? '12h';
  const vaultBg: MessageBg = (((profile as any)?.vault_bg) ?? 'plain') as MessageBg;
  const vaultBgDark = isDarkBg(vaultBg);
  const vaultMetaColor = vaultBgDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.4)';

  const [tabIndex, setTabIndex] = useState(0);
  const [pendingThreadId, setPendingThreadId] = useState<string | null>(threadParam);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [notes, setNotes] = useState<Note[]>([]);
  const [sharedNotes, setSharedNotes] = useState<Note[]>([]);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteVisibility, setNoteVisibility] = useState<'private' | 'shared'>('private');
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState('');
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeThread, setActiveThread] = useState<Profile | null>(null);
  const [dms, setDms] = useState<DM[]>([]);
  const [dmInput, setDmInput] = useState('');
  const [sendingDm, setSendingDm] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [unreadBySender, setUnreadBySender] = useState<Record<string, number>>({});

  const [replyTo, setReplyTo] = useState<DM | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [highlight, setHighlight] = useState<{ id: string; key: number } | null>(null);

  const [contextMenu, setContextMenu] = useState<ContextMenu>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [reactions, setReactions] = useState<ReactionsMap>({});

  const dmBottomRef = useRef<HTMLDivElement>(null);
  const dmScrollRef = useRef<HTMLDivElement>(null);
  const dmAtBottomRef = useRef(true);
  const dmInitialLoadDone = useRef(false);

  useEffect(() => {
    if (threadParam) {
      setPendingThreadId(threadParam);
      setTabIndex(0);
    }
  }, [threadParam]);

  // AUTH + heartbeat
  useEffect(() => {
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      const e = user?.email ?? null;
      setUserId(user?.id ?? null);
      setEmail(e);
      if (!e) {
        window.location.href = '/login';
      } else {
        setLoading(false);
        supabase
          .from('profiles')
          .update({
            last_seen_vault_at: new Date().toISOString(),
            last_active_at: new Date().toISOString(),
          })
          .eq('id', user!.id)
          .then(() => {});

        heartbeat = setInterval(() => {
          supabase
            .from('profiles')
            .update({ last_active_at: new Date().toISOString() })
            .eq('id', user!.id)
            .then(() => {});
        }, 20000);
      }
    });

    return () => {
      if (heartbeat) clearInterval(heartbeat);
    };
  }, []);

  // Load notes
  useEffect(() => {
    if (!userId) return;
    supabase
      .from('vault_notes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error(error);
        else setNotes((data ?? []) as Note[]);
      });
  }, [userId]);

  // Load shared notes
  useEffect(() => {
    if (!userId) return;
    supabase
      .from('vault_notes')
      .select('*')
      .eq('visibility', 'shared')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) console.error(error);
        else setSharedNotes((data ?? []) as Note[]);
      });
  }, [userId]);

  // Realtime shared notes
  useEffect(() => {
    if (!email) return;
    const ch = supabase
      .channel('shared-notes-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vault_notes' },
        (payload) => {
          const n = payload.new as Note;
          if (n.visibility !== 'shared') return;
          setSharedNotes((prev) => {
            if (prev.some((x) => x.id === n.id)) return prev;
            return [n, ...prev];
          });
          if (n.user_id === userId) {
            setNotes((prev) => {
              if (prev.some((x) => x.id === n.id)) return prev;
              return [n, ...prev];
            });
          }
          if (n.user_id !== userId && typeof document !== 'undefined' && document.visibilityState === 'visible') {
            playDing();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'vault_notes' },
        (payload) => {
          const n = payload.new as Note;
          if (n.visibility !== 'shared') {
            setSharedNotes((prev) => prev.filter((x) => x.id !== n.id));
          } else {
            setSharedNotes((prev) => {
              const exists = prev.some((x) => x.id === n.id);
              if (exists) return prev.map((x) => (x.id === n.id ? n : x));
              return [n, ...prev];
            });
          }
          if (n.user_id === userId) {
            setNotes((prev) => prev.map((x) => (x.id === n.id ? n : x)));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'vault_notes' },
        (payload) => {
          const n = payload.old as { id: string };
          setSharedNotes((prev) => prev.filter((x) => x.id !== n.id));
          if (userId) setNotes((prev) => prev.filter((x) => x.id !== n.id));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [email, userId]);

  // Profiles + unread + deep link (fast open)
  useEffect(() => {
    if (!userId || !pendingThreadId) return;
    setActiveThread({
      id: pendingThreadId,
      email: '',
      display_name: null,
    });
    setTabIndex(0);
    setPendingThreadId(null);
  }, [userId, pendingThreadId]);

  useEffect(() => {
    if (!userId) return;
    Promise.all([
      supabase
        .from('profiles')
        .select('id, email, display_name')
        .neq('id', userId)
        .order('email', { ascending: true }),
      supabase
        .from('vault_dms')
        .select('sender_id')
        .eq('recipient_id', userId)
        .is('read_at', null),
    ]).then(([profilesRes, unreadRes]) => {
      const loaded = (profilesRes.data ?? []) as Profile[];
      if (profilesRes.error) console.error(profilesRes.error);
      else setProfiles(loaded);

      if (unreadRes.error) console.error(unreadRes.error);
      else {
        const counts: Record<string, number> = {};
        (unreadRes.data ?? []).forEach((row: any) => {
          counts[row.sender_id] = (counts[row.sender_id] ?? 0) + 1;
        });
        setUnreadBySender(counts);
      }
    });
  }, [userId]);

  // Enrich active thread when profile arrives
  useEffect(() => {
    if (!activeThread) return;
    if (activeThread.email) return;
    const found = profiles.find((p) => p.id === activeThread.id);
    if (found) setActiveThread(found);
  }, [profiles, activeThread]);

  // Load DMs
  useEffect(() => {
    if (!userId || !activeThread) {
      setDms([]);
      return;
    }
    setThreadLoading(true);
    dmInitialLoadDone.current = false;
    supabase
      .from('vault_dms')
      .select('*')
      .or(
        `and(sender_id.eq.${userId},recipient_id.eq.${activeThread.id}),and(sender_id.eq.${activeThread.id},recipient_id.eq.${userId})`
      )
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error(error);
        else {
          setDms(data ?? []);
          setTimeout(() => {
            dmBottomRef.current?.scrollIntoView({ behavior: 'auto' });
            dmInitialLoadDone.current = true;
          }, 80);
        }
        setThreadLoading(false);

        supabase
          .from('vault_dms')
          .update({ read_at: new Date().toISOString() })
          .eq('recipient_id', userId)
          .eq('sender_id', activeThread.id)
          .is('read_at', null)
          .then(() => {});

        setUnreadBySender((prev) => {
          const next = { ...prev };
          delete next[activeThread.id];
          return next;
        });
      });
  }, [userId, activeThread]);

  // Realtime DMs
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('vault-dms-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vault_dms' },
        (payload) => {
          const m = payload.new as DM;
          if (m.sender_id !== userId && m.recipient_id !== userId) return;
          if (m.recipient_id === userId) {
            if (!activeThread || m.sender_id !== activeThread.id) {
              setUnreadBySender((prev) => ({
                ...prev,
                [m.sender_id]: (prev[m.sender_id] ?? 0) + 1,
              }));
            }
          }
          if (
            activeThread &&
            ((m.sender_id === userId && m.recipient_id === activeThread.id) ||
              (m.sender_id === activeThread.id && m.recipient_id === userId))
          ) {
            setDms((prev) => {
              if (prev.some((x) => x.id === m.id)) return prev;
              return [...prev, m];
            });
            if (m.sender_id !== userId && typeof document !== 'undefined' && document.visibilityState === 'visible') {
              playDing();
            }
            if (dmAtBottomRef.current) {
              setTimeout(() => {
                dmBottomRef.current?.scrollIntoView({
                  behavior: dmInitialLoadDone.current ? 'smooth' : 'auto',
                });
              }, 60);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'vault_dms' },
        (payload) => {
          const updated = payload.new as DM;
          if (updated.sender_id !== userId && updated.recipient_id !== userId) return;
          setDms((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'vault_dms' },
        (payload) => {
          const removed = payload.old as { id: string };
          setDms((prev) => prev.filter((m) => m.id !== removed.id));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, activeThread]);

  // Reactions
  useEffect(() => {
    if (!email) return;
    supabase
      .from('reactions')
      .select('message_id, user_email, emoji')
      .eq('source', 'vault')
      .then(({ data, error }) => {
        if (error) return;
        const map: ReactionsMap = {};
        (data ?? []).forEach((r: any) => {
          const mid = String(r.message_id);
          if (!map[mid]) map[mid] = {};
          if (!map[mid][r.emoji]) map[mid][r.emoji] = [];
          map[mid][r.emoji].push(r.user_email);
        });
        setReactions(map);
      });

    const ch = supabase
      .channel('vault-reactions-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reactions' },
        (payload) => {
          const r = payload.new as any;
          if (r.source !== 'vault') return;
          const mid = String(r.message_id);
          setReactions((prev) => {
            const next = { ...prev };
            const byEmoji = { ...(next[mid] ?? {}) };
            const emails = new Set(byEmoji[r.emoji] ?? []);
            emails.add(r.user_email);
            byEmoji[r.emoji] = Array.from(emails);
            next[mid] = byEmoji;
            return next;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'reactions' },
        (payload) => {
          const r = payload.old as any;
          if (r.source !== 'vault') return;
          const mid = String(r.message_id);
          setReactions((prev) => {
            const next = { ...prev };
            const byEmoji = { ...(next[mid] ?? {}) };
            const emails = (byEmoji[r.emoji] ?? []).filter((e) => e !== r.user_email);
            if (emails.length === 0) delete byEmoji[r.emoji];
            else byEmoji[r.emoji] = emails;
            if (Object.keys(byEmoji).length === 0) delete next[mid];
            else next[mid] = byEmoji;
            return next;
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [email]);

  function handleDmScroll() {
    const el = dmScrollRef.current;
    if (!el) return;
    dmAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  function jumpToMessage(id: string) {
    const el = document.getElementById(`vault-msg-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlight({ id, key: Date.now() });
    setTimeout(() => {
      setHighlight((prev) => (prev && prev.id === id ? null : prev));
    }, 1600);
  }

  // NOTES
  async function saveNote(e: React.FormEvent) {
    e.preventDefault();
    setNoteError('');
    const c = noteContent.trim();
    const t = noteTitle.trim();
    if (!c || !userId) return;

    setSavingNote(true);
    if (editingNote) {
      const { data, error } = await supabase
        .from('vault_notes')
        .update({
          title: t || null,
          content: c,
          visibility: noteVisibility,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingNote.id)
        .select()
        .single();
      if (error) setNoteError('⚠️ ' + error.message);
      else if (data) {
        setNotes((prev) => prev.map((n) => (n.id === (data as Note).id ? (data as Note) : n)));
        cancelNoteEdit();
      }
    } else {
      const { data, error } = await supabase
        .from('vault_notes')
        .insert({
          user_id: userId,
          title: t || null,
          content: c,
          visibility: noteVisibility,
        })
        .select()
        .single();
      if (error) setNoteError('⚠️ ' + error.message);
      else if (data) {
        setNotes((prev) => [data as Note, ...prev]);
        setNoteTitle('');
        setNoteContent('');
        setNoteVisibility('private');
      }
    }
    setSavingNote(false);
  }

  function editNote(n: Note) {
    setEditingNote(n);
    setNoteTitle(n.title ?? '');
    setNoteContent(n.content);
    setNoteVisibility((n.visibility as 'private' | 'shared') ?? 'private');
  }

  function cancelNoteEdit() {
    setEditingNote(null);
    setNoteTitle('');
    setNoteContent('');
    setNoteVisibility('private');
    setNoteError('');
  }

  async function deleteNote(n: Note) {
    if (!confirm('Delete this entry?')) return;
    const { error } = await supabase.from('vault_notes').delete().eq('id', n.id);
    if (!error) {
      setNotes((prev) => prev.filter((x) => x.id !== n.id));
      setSharedNotes((prev) => prev.filter((x) => x.id !== n.id));
    }
  }

  // DMs
  async function sendDm(e: React.FormEvent) {
    e.preventDefault();
    const text = dmInput.trim();
    if (!text || !userId || !email || !activeThread) return;
    setSendingDm(true);
    setDmInput('');

    const tempId = `temp-${Date.now()}`;
    const optimistic: DM = {
      id: tempId,
      sender_id: userId,
      sender_email: email,
      recipient_id: activeThread.id,
      recipient_email: activeThread.email,
      content: text,
      created_at: new Date().toISOString(),
      read_at: null,
      reply_to_id: replyTo?.id ?? null,
      edited_at: null,
    };
    setDms((prev) => [...prev, optimistic]);
    dmAtBottomRef.current = true;
    setReplyTo(null);
    setTimeout(() => dmBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);

    const { data, error } = await supabase
      .from('vault_dms')
      .insert({
        sender_id: userId,
        sender_email: email,
        recipient_id: activeThread.id,
        recipient_email: activeThread.email,
        content: text,
        reply_to_id: optimistic.reply_to_id,
      })
      .select()
      .single();

    if (error) {
      setDms((prev) => prev.filter((m) => m.id !== tempId));
      setDmInput(text);
      alert('⚠️ Failed to send: ' + error.message);
    } else if (data) {
      setDms((prev) => prev.map((m) => (m.id === tempId ? (data as DM) : m)));
    }
    setSendingDm(false);
  }

  async function sendDmContent(content: string) {
    if (!userId || !email || !activeThread) return;
    const tempId = `temp-${Date.now()}`;
    const optimistic: DM = {
      id: tempId,
      sender_id: userId,
      sender_email: email,
      recipient_id: activeThread.id,
      recipient_email: activeThread.email,
      content,
      created_at: new Date().toISOString(),
      read_at: null,
      reply_to_id: replyTo?.id ?? null,
      edited_at: null,
    };
    setDms((prev) => [...prev, optimistic]);
    dmAtBottomRef.current = true;
    setReplyTo(null);
    setTimeout(() => dmBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);

    const { data, error } = await supabase
      .from('vault_dms')
      .insert({
        sender_id: userId,
        sender_email: email,
        recipient_id: activeThread.id,
        recipient_email: activeThread.email,
        content,
        reply_to_id: optimistic.reply_to_id,
      })
      .select()
      .single();
    if (error) {
      setDms((prev) => prev.filter((m) => m.id !== tempId));
      alert('⚠️ ' + error.message);
    } else if (data) {
      setDms((prev) => prev.map((m) => (m.id === tempId ? (data as DM) : m)));
    }
  }

  async function saveEdit(messageId: string) {
    const text = editText.trim();
    if (!text) {
      setEditingId(null);
      setEditText('');
      return;
    }
    setDms((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, content: text, edited_at: new Date().toISOString() } : m
      )
    );
    setEditingId(null);
    setEditText('');

    const { error } = await supabase
      .from('vault_dms')
      .update({ content: text, edited_at: new Date().toISOString() })
      .eq('id', messageId);
    if (error) alert('⚠️ Failed to edit: ' + error.message);
  }

  async function deleteMessage(messageId: string) {
    if (!confirm('Delete this message?')) return;
    const backup = dms;
    setDms((prev) => prev.filter((m) => m.id !== messageId));
    const { data, error } = await supabase
      .from('vault_dms')
      .delete()
      .eq('id', messageId)
      .select();
    if (error || !data || data.length === 0) {
      setDms(backup);
      alert('⚠️ Delete blocked — check RLS policies');
    }
  }

  async function handleBgChange(bg: MessageBg) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('profiles').update({ vault_bg: bg }).eq('id', user.id);
  }

  function hasMyReaction(messageId: string, emoji: string): boolean {
    if (!email) return false;
    const mid = String(messageId);
    return (reactions[mid]?.[emoji] ?? []).includes(email);
  }

  async function toggleReaction(messageId: string, emoji: string) {
    if (!email) return;
    const mid = String(messageId);
    const mine = hasMyReaction(messageId, emoji);

    setReactions((prev) => {
      const next = { ...prev };
      const byEmoji = { ...(next[mid] ?? {}) };
      const emails = new Set(byEmoji[emoji] ?? []);
      if (mine) emails.delete(email);
      else emails.add(email);
      if (emails.size === 0) delete byEmoji[emoji];
      else byEmoji[emoji] = Array.from(emails);
      if (Object.keys(byEmoji).length === 0) delete next[mid];
      else next[mid] = byEmoji;
      return next;
    });

    if (mine) {
      await supabase
        .from('reactions')
        .delete()
        .eq('source', 'vault')
        .eq('message_id', mid)
        .eq('user_email', email)
        .eq('emoji', emoji);
    } else {
      await supabase.from('reactions').insert({
        source: 'vault',
        message_id: mid,
        user_email: email,
        emoji,
      });
    }
  }

  function openContextMenu(message: DM, x: number, y: number) {
    const menuWidth = 240, menuHeight = 260;
    const safeX = Math.min(x, window.innerWidth - menuWidth - 8);
    const safeY = Math.min(y, window.innerHeight - menuHeight - 8);
    setContextMenu({ message, x: Math.max(8, safeX), y: Math.max(8, safeY) });
  }
  function handleRightClick(e: React.MouseEvent, message: DM) {
    e.preventDefault();
    openContextMenu(message, e.clientX, e.clientY);
  }
  function handleTouchStart(e: React.TouchEvent, message: DM) {
    const touch = e.touches[0];
    longPressTimer.current = setTimeout(
      () => openContextMenu(message, touch.clientX, touch.clientY),
      500
    );
  }
  function handleTouchEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }
  function closeContextMenu() {
    setContextMenu(null);
  }

  useEffect(() => {
    if (!contextMenu) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeContextMenu();
    }
    function onClick() {
      closeContextMenu();
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onClick);
    window.addEventListener('scroll', onClick, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick);
      window.removeEventListener('scroll', onClick, true);
    };
  }, [contextMenu]);

  function findDmById(id: string | null): DM | null {
    if (!id) return null;
    return dms.find((m) => m.id === id) ?? null;
  }

  function previewOf(text: string, max = 60): string {
    const t = text.trim();
    return t.length > max ? t.slice(0, max) + '…' : t;
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#1a0b2e] flex items-center justify-center text-white font-mono">
        loading... 🐱
      </div>
    );
  }

  const totalUnread = Object.values(unreadBySender).reduce((a, b) => a + b, 0);

  // ============================================================
  // FULL-SCREEN DM THREAD
  // ============================================================
  if (activeThread) {
    return (
      <div className="fixed inset-0 bg-[#1a0b2e] font-mono flex flex-col overflow-hidden">
        <div
          className="mx-auto flex w-full max-w-3xl flex-1 min-h-0 flex-col gap-2"
          style={{
            paddingTop: 'max(8px, env(safe-area-inset-top))',
            paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
            paddingLeft: 'max(8px, env(safe-area-inset-left))',
            paddingRight: 'max(8px, env(safe-area-inset-right))',
          }}
        >
          {/* Thread header */}
          <div
            className="border-4 border-black shrink-0"
            style={{
              borderRadius: '18px',
              background: `linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%), rgba(230,230,250,0.92)`,
              backdropFilter: 'blur(14px) saturate(160%)',
              WebkitBackdropFilter: 'blur(14px) saturate(160%)',
              padding: '10px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '4px 4px 0 0 black',
            }}
          >
            <button
              onClick={() => setActiveThread(null)}
              aria-label="Back to vault"
              style={{
                width: '36px',
                height: '36px',
                border: '2px solid black',
                borderRadius: '999px',
                background: '#FFD1DC',
                color: '#000',
                fontWeight: 900,
                fontSize: '15px',
                lineHeight: 1,
                boxShadow: '2px 2px 0 0 black',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              ‹
            </button>
            <span
              className="gloss-shine"
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '999px',
                border: '3px solid black',
                background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #E6E6FA`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: '13px',
                color: '#000',
                flexShrink: 0,
              }}
            >
              {initialsFor(activeThread.email, activeThread.display_name ?? null)}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p
                style={{
                  margin: 0,
                  fontWeight: 900,
                  fontSize: '14px',
                  color: '#000',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {displayLabel(activeThread.email, activeThread.display_name)}
              </p>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: '10px',
                  fontWeight: 800,
                  color: 'rgba(0,0,0,0.5)',
                }}
              >
                🔒 private · {dms.length} message{dms.length === 1 ? '' : 's'} 🐱
              </p>
            </div>
            <BgPickerButton current={vaultBg} onChange={handleBgChange} />
          </div>

          {/* Messages window */}
          <div
            className="flex-1 min-h-0 flex flex-col border-4 border-black bg-white rounded-2xl overflow-hidden relative"
            style={{ boxShadow: '5px 5px 0px 0px rgba(0,0,0,1)' }}
          >
            <div
              ref={dmScrollRef}
              onScroll={handleDmScroll}
              style={{ flex: 1, minHeight: 0, position: 'relative' }}
            >
              <HiddenScroll
                sidePadding={14}
                topPadding={14}
                bottomPadding={8}
                style={getBgStyle(vaultBg)}
              >
                {threadLoading ? (
                  <p
                    style={{
                      textAlign: 'center',
                      color: 'rgba(0,0,0,0.4)',
                      fontSize: '12px',
                      padding: '20px 0',
                      fontWeight: 700,
                      margin: 0,
                    }}
                  >
                    loading... 🐾
                  </p>
                ) : dms.length === 0 ? (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      gap: '10px',
                    }}
                  >
                    <span style={{ fontSize: '56px' }}>🐱🐶</span>
                    <p
                      style={{
                        margin: 0,
                        textAlign: 'center',
                        fontStyle: 'italic',
                        color: 'rgba(0,0,0,0.5)',
                        fontSize: '13px',
                      }}
                    >
                      no purrs yet — say hi 🐾
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {dms.map((m, i) => {
                      const mine = m.sender_id === userId;
                      const prev = dms[i - 1];
                      const isNewGroup = !prev || prev.sender_id !== m.sender_id;
                      const isEditing = editingId === m.id;
                      const repliedTo = findDmById(m.reply_to_id);
                      const isHighlighted = highlight?.id === m.id;
                      const parsed = parseStoryShare(m.content);
                      const voice = parseVoiceContent(m.content);

                      const msgReactions = reactions[String(m.id)] ?? {};
                      const reactionEntries = Object.entries(msgReactions)
                        .filter(([, emails]) => emails.length > 0)
                        .sort((a, b) => b[1].length - a[1].length);

                      return (
                        <div
                          key={m.id}
                          id={`vault-msg-${m.id}`}
                          className={mine ? 'msg-mine' : 'msg-theirs'}
                          style={{
                            display: 'flex',
                            justifyContent: mine ? 'flex-end' : 'flex-start',
                            marginTop: isNewGroup && i > 0 ? '12px' : '0',
                            scrollMarginTop: '60px',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              maxWidth: '82%',
                              alignItems: mine ? 'flex-end' : 'flex-start',
                            }}
                          >
                            {isNewGroup && (
                              <div
                                className="msg-meta"
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 900,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.1em',
                                  color: vaultMetaColor,
                                  marginBottom: '6px',
                                  paddingLeft: '6px',
                                  paddingRight: '6px',
                                  textShadow: vaultBgDark ? '0 1px 2px rgba(0,0,0,0.8)' : 'none',
                                }}
                              >
                                {mine ? 'you 🐱' : 'them 🐾'} · {formatTime(m.created_at, timeFormat)}
                              </div>
                            )}
                            <div
                              onContextMenu={(e) => handleRightClick(e, m)}
                              onTouchStart={(e) => handleTouchStart(e, m)}
                              onTouchEnd={handleTouchEnd}
                              onTouchMove={handleTouchEnd}
                              style={{
                                border: '2px solid black',
                                borderRadius: mine ? '20px 20px 6px 20px' : '20px 20px 20px 6px',
                                padding: '8px 12px',
                                backgroundColor: mine ? '#E2F0D9' : '#D4F0F0',
                                boxShadow: '2px 2px 0 0 black',
                                cursor: 'pointer',
                                userSelect: 'none',
                                minWidth: '70px',
                                position: 'relative',
                              }}
                            >
                              {isHighlighted && (
                                <div
                                  key={highlight?.key}
                                  aria-hidden
                                  style={{
                                    position: 'absolute',
                                    inset: -8,
                                    border: '4px solid #FF8BA7',
                                    borderRadius: 22,
                                    background: 'rgba(255,245,186,0.55)',
                                    pointerEvents: 'none',
                                    boxShadow: '0 0 20px rgba(255,139,167,0.7)',
                                    animation: 'msg-flash-fade 1.6s ease-out forwards',
                                    zIndex: 10,
                                  }}
                                />
                              )}

                              {repliedTo && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    jumpToMessage(repliedTo.id);
                                  }}
                                  style={{
                                    backgroundColor: 'rgba(0,0,0,0.08)',
                                    borderRadius: '8px',
                                    padding: '3px 8px',
                                    marginBottom: '5px',
                                    maxWidth: '100%',
                                    cursor: 'pointer',
                                    display: 'block',
                                    width: '100%',
                                    textAlign: 'left',
                                    border: 'none',
                                    borderLeft: '4px solid black',
                                  }}
                                >
                                  <p
                                    style={{
                                      fontSize: '8px',
                                      fontWeight: 900,
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.06em',
                                      color: 'rgba(0,0,0,0.5)',
                                      margin: 0,
                                      lineHeight: 1.2,
                                    }}
                                  >
                                    {repliedTo.sender_id === userId ? 'you' : repliedTo.sender_email.split('@')[0]}
                                  </p>
                                  <p
                                    style={{
                                      fontSize: '10px',
                                      fontWeight: 700,
                                      color: 'rgba(0,0,0,0.65)',
                                      margin: '1px 0 0',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      lineHeight: 1.3,
                                    }}
                                  >
                                    {previewOf(repliedTo.content, 25)}
                                  </p>
                                </button>
                              )}

                              {isEditing ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '180px' }}>
                                  <textarea
                                    value={editText}
                                    onChange={(e) => setEditText(e.target.value)}
                                    autoFocus
                                    rows={2}
                                    style={{
                                      border: '2px solid black',
                                      borderRadius: '8px',
                                      padding: '6px 10px',
                                      fontSize: '13.5px',
                                      fontFamily: 'inherit',
                                      resize: 'none',
                                      outline: 'none',
                                      backgroundColor: 'white',
                                      color: '#000',
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        saveEdit(m.id);
                                      }
                                      if (e.key === 'Escape') {
                                        setEditingId(null);
                                        setEditText('');
                                      }
                                    }}
                                  />
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                      onClick={() => saveEdit(m.id)}
                                      style={{
                                        padding: '4px 12px',
                                        fontSize: '11px',
                                        border: '2px solid black',
                                        borderRadius: '8px',
                                        backgroundColor: '#E2F0D9',
                                        color: '#000',
                                        fontWeight: 900,
                                        cursor: 'pointer',
                                      }}
                                    >
                                      save
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingId(null);
                                        setEditText('');
                                      }}
                                      style={{
                                        padding: '4px 12px',
                                        fontSize: '11px',
                                        border: '2px solid black',
                                        borderRadius: '8px',
                                        backgroundColor: '#FFD1DC',
                                        color: '#000',
                                        fontWeight: 900,
                                        cursor: 'pointer',
                                      }}
                                    >
                                      cancel
                                    </button>
                                  </div>
                                </div>
                              ) : voice ? (
                                <VoiceBubble url={voice.url} duration={voice.duration} mine={mine} />
                              ) : (
                                <div>
                                  <p
                                    style={{
                                      margin: 0,
                                      color: '#000',
                                      fontSize: '13.5px',
                                      lineHeight: 1.45,
                                      wordBreak: 'break-word',
                                      whiteSpace: 'pre-wrap',
                                    }}
                                  >
                                    {parsed.text}
                                    {m.edited_at && (
                                      <span
                                        style={{
                                          fontSize: '9px',
                                          color: 'rgba(0,0,0,0.4)',
                                          marginLeft: '6px',
                                          fontWeight: 700,
                                        }}
                                      >
                                        (edited)
                                      </span>
                                    )}
                                  </p>
                                  {parsed.imageUrl && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={parsed.imageUrl}
                                      alt="shared image"
                                      referrerPolicy="no-referrer"
                                      onClick={() => window.open(parsed.imageUrl!, '_blank')}
                                      style={{
                                        marginTop: '8px',
                                        maxWidth: '220px',
                                        width: '100%',
                                        borderRadius: '10px',
                                        border: '2px solid black',
                                        cursor: 'pointer',
                                        display: 'block',
                                        boxShadow: '2px 2px 0 0 black',
                                      }}
                                    />
                                  )}
                                </div>
                              )}
                            </div>
                            {mine && m.read_at && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 900,
                                  color: '#3A7A5E',
                                  marginTop: '3px',
                                  paddingRight: '4px',
                                }}
                              >
                                ✓✓ seen
                              </span>
                            )}

                            {reactionEntries.length > 0 && (
                              <div
                                style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  gap: '4px',
                                  marginTop: '4px',
                                  justifyContent: mine ? 'flex-end' : 'flex-start',
                                }}
                              >
                                {reactionEntries.map(([emoji, emails]) => {
                                  const isMine = !!email && emails.includes(email);
                                  return (
                                    <button
                                      key={emoji}
                                      onClick={() => toggleReaction(m.id, emoji)}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px',
                                        padding: '2px 8px',
                                        border: '2px solid black',
                                        borderRadius: '999px',
                                        background: isMine
                                          ? 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FF8BA7'
                                          : 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFFDF5',
                                        cursor: 'pointer',
                                        boxShadow: '2px 2px 0 0 black',
                                        fontSize: '11px',
                                        fontWeight: 900,
                                        color: '#000',
                                        lineHeight: 1.2,
                                      }}
                                    >
                                      <span style={{ fontSize: '12px', lineHeight: 1 }}>{emoji}</span>
                                      <span style={{ fontSize: '10px' }}>{emails.length}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={dmBottomRef} style={{ height: '4px' }} />
                  </div>
                )}
              </HiddenScroll>
            </div>

            {replyTo && (
              <div
                className="border-t-4 border-black flex items-center"
                style={{
                  backgroundColor: '#FFF5BA',
                  padding: '8px 10px',
                  gap: '8px',
                  flexShrink: 0,
                }}
              >
                <div className="flex-1 min-w-0">
                  <p
                    style={{
                      margin: 0,
                      fontSize: '10px',
                      fontWeight: 900,
                      color: '#000',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    replying to {replyTo.sender_id === userId ? 'yourself 🐱' : 'them 🐾'}
                  </p>
                  <p
                    style={{
                      margin: '3px 0 0',
                      fontSize: '11px',
                      color: 'rgba(0,0,0,0.6)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {previewOf(replyTo.content, 50)}
                  </p>
                </div>
                <button
                  onClick={() => setReplyTo(null)}
                  aria-label="Cancel reply"
                  style={{
                    width: '26px',
                    height: '26px',
                    border: '2px solid black',
                    borderRadius: '8px',
                    backgroundColor: '#FFD1DC',
                    color: '#000',
                    fontWeight: 900,
                    fontSize: '12px',
                    lineHeight: 1,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  ✕
                </button>
              </div>
            )}

<form
              onSubmit={sendDm}
              className="border-t-4 border-black bg-[#E6E6FA] flex shrink-0 items-stretch"
              style={{ padding: '10px', gap: '8px' }}
            >
              {userId && (
                <ImagePicker
                  userId={userId}
                  disabled={sendingDm}
                  onSend={async (url) => {
                    await sendDmContent(url);
                  }}
                />
              )}

<div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                <CutePet
                  size={20}
                  variant="peek"
                  style={{
                    position: 'absolute',
                    top: '-16px',
                    right: '10px',
                    zIndex: 2,
                  }}
                />
                <input
                  type="text"
                  value={dmInput}
                  onChange={(e) => setDmInput(e.target.value)}
                  placeholder="type a private message... 🐱"
                  disabled={sendingDm}
                  className="w-full border-2 border-black rounded-lg bg-white text-black text-sm focus:outline-none disabled:opacity-50"
                  style={{ padding: '11px 14px' }}
                />
              </div>

              {dmInput.trim() ? (
                <div style={{ position: 'relative', flexShrink: 0 }}>
                <CutePet
                  size={16}
                  variant="wiggle"
                  style={{
                    position: 'absolute',
                    top: '-14px',
                    left: '50%',
                    marginLeft: '-8px',
                    zIndex: 2,
                  }}
                />
                <button
                  type="submit"
                  disabled={sendingDm}
                  className="inline-flex items-center justify-center border-2 border-black bg-[#E2F0D9] text-black text-xs font-black rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition disabled:opacity-50"
                  style={{ padding: '11px 18px', minWidth: '56px' }}
                >
                  <span className="text-sm leading-none">{sendingDm ? '···' : '▶'}</span>
                </button>
              </div>
              ) : userId ? (
                <VoiceRecorder
                  userId={userId}
                  disabled={sendingDm}
                  onSend={async (voiceUrl, duration) => {
                    const content = formatVoiceContent(voiceUrl, duration);
                    await sendDmContent(content);
                  }}
                />
              ) : null}
            </form>
          </div>
        </div>

        {contextMenu && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: contextMenu.y,
              left: contextMenu.x,
              zIndex: 500,
              backgroundColor: '#FFFDF5',
              border: '3px solid black',
              borderRadius: '18px',
              boxShadow: '5px 5px 0 0 black',
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              minWidth: '220px',
              maxWidth: 'calc(100vw - 16px)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '2px',
                padding: '4px 4px 8px',
                borderBottom: '3px dashed rgba(0,0,0,0.18)',
                marginBottom: '2px',
              }}
            >
              {REACTION_EMOJIS.map((emoji) => {
                const active = hasMyReaction(contextMenu.message.id, emoji);
                return (
                  <button
                    key={emoji}
                    onClick={() => {
                      toggleReaction(contextMenu.message.id, emoji);
                      closeContextMenu();
                    }}
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '999px',
                      border: active ? '2px solid black' : '2px solid transparent',
                      background: active
                        ? 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FF8BA7'
                        : 'transparent',
                      cursor: 'pointer',
                      fontSize: '18px',
                      lineHeight: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                      boxShadow: active ? '2px 2px 0 0 black' : 'none',
                    }}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => {
                setReplyTo(contextMenu.message);
                closeContextMenu();
              }}
              style={{
                padding: '8px 12px',
                fontSize: '12px',
                color: '#000',
                border: 'none',
                background: 'transparent',
                textAlign: 'left',
                fontWeight: 900,
                cursor: 'pointer',
                borderRadius: '8px',
              }}
            >
              ↩️ reply
            </button>

            {contextMenu.message.sender_id === userId &&
              !parseVoiceContent(contextMenu.message.content) && (
                <button
                  onClick={() => {
                    setEditingId(contextMenu.message.id);
                    setEditText(contextMenu.message.content);
                    closeContextMenu();
                  }}
                  style={{
                    padding: '8px 12px',
                    fontSize: '12px',
                    color: '#000',
                    border: 'none',
                    background: 'transparent',
                    textAlign: 'left',
                    fontWeight: 900,
                    cursor: 'pointer',
                    borderRadius: '8px',
                  }}
                >
                  ✎ edit
                </button>
              )}

            {contextMenu.message.sender_id === userId && (
              <button
                onClick={() => {
                  const id = contextMenu.message.id;
                  closeContextMenu();
                  deleteMessage(id);
                }}
                style={{
                  padding: '8px 12px',
                  fontSize: '12px',
                  color: '#C2185B',
                  border: 'none',
                  background: 'transparent',
                  textAlign: 'left',
                  fontWeight: 900,
                  cursor: 'pointer',
                  borderRadius: '8px',
                }}
              >
                ✕ delete
              </button>
            )}

            <button
              onClick={() => {
                navigator.clipboard.writeText(contextMenu.message.content).catch(() => {});
                closeContextMenu();
              }}
              style={{
                padding: '8px 12px',
                fontSize: '12px',
                color: '#000',
                border: 'none',
                background: 'transparent',
                textAlign: 'left',
                fontWeight: 900,
                cursor: 'pointer',
                borderRadius: '8px',
              }}
            >
              📋 copy
            </button>
          </div>
        )}
      </div>
    );
  }

  // ============================================================
  // TABBED MODE
  // ============================================================

  const messagesListSlide = (
    <div style={{ height: '100%', position: 'relative' }}>
      <HiddenScroll sidePadding={14} topPadding={4} bottomPadding={20}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: '11px',
              fontWeight: 900,
              color: 'rgba(255,253,245,0.55)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              paddingLeft: '4px',
            }}
          >
            🐾 pick someone to dm · private, 1-on-1
          </p>

          {profiles.length === 0 ? (
            <div
              style={{
                border: '4px solid black',
                backgroundColor: '#FFFDF5',
                borderRadius: '18px',
                textAlign: 'center',
                padding: '40px 20px',
                boxShadow: '4px 4px 0 0 black',
              }}
            >
              <p style={{ margin: 0, fontSize: '44px' }}>🐱</p>
              <p style={{ margin: '10px 0 0', color: '#000', fontWeight: 800, fontSize: '13px' }}>
                no other members yet
              </p>
            </div>
          ) : (
            profiles.map((p, i) => {
              const name = displayLabel(p.email, p.display_name);
              const initials = initialsFor(p.email, p.display_name);
              const colors = ['#E2F0D9', '#FFD1DC', '#E6E6FA'];
              const bg = colors[i % colors.length];
              const unread = unreadBySender[p.id] ?? 0;
              return (
                <button
                  key={p.id}
                  onClick={() => setActiveThread(p)}
                  style={{
                    border: '4px solid black',
                    borderRadius: '18px',
                    background: `linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%), #FFFDF5`,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'left',
                    boxShadow: '4px 4px 0 0 black',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div
                      className="gloss-shine"
                      style={{
                        width: '44px',
                        height: '44px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '999px',
                        border: '3px solid black',
                        background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), ${bg}`,
                        fontWeight: 900,
                        fontSize: '12px',
                        color: '#000',
                      }}
                    >
                      {initials}
                    </div>
                    {unread > 0 && (
                      <span
                        className="badge-pulse"
                        style={{
                          position: 'absolute',
                          top: '-6px',
                          right: '-6px',
                          backgroundColor: '#FF8BA7',
                          color: '#000',
                          fontSize: '10px',
                          minWidth: '22px',
                          height: '22px',
                          padding: '0 6px',
                          borderRadius: '999px',
                          lineHeight: '18px',
                          textAlign: 'center',
                          boxShadow: '2px 2px 0 0 black',
                          border: '2px solid black',
                          fontWeight: 900,
                        }}
                      >
                        {unread}
                      </span>
                    )}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p
                      style={{
                        margin: 0,
                        fontWeight: 900,
                        fontSize: '14px',
                        color: '#000',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {name}
                    </p>
                    <p
                      style={{
                        margin: '2px 0 0',
                        fontSize: '10px',
                        fontWeight: 800,
                        color: unread > 0 ? '#C2185B' : 'rgba(0,0,0,0.5)',
                      }}
                    >
                      {unread > 0 ? `${unread} new message${unread > 1 ? 's' : ''}` : 'tap to open dm 🐾'}
                    </p>
                  </div>
                  <span style={{ fontSize: '18px', color: '#000', flexShrink: 0 }}>›</span>
                </button>
              );
            })
          )}
        </div>
      </HiddenScroll>
    </div>
  );

  const myDiarySlide = (
    <div style={{ height: '100%', position: 'relative' }}>
      <HiddenScroll sidePadding={14} topPadding={4} bottomPadding={20}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <form
            onSubmit={saveNote}
            className="border-4 border-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col shrink-0"
            style={{
              background: `linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%), #FFF5BA`,
              padding: '14px',
              gap: '10px',
            }}
          >
            <input
              type="text"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="title (optional) 🐱"
              maxLength={80}
              disabled={savingNote}
              style={{
                width: '100%',
                border: '2px solid black',
                borderRadius: '12px',
                backgroundColor: 'white',
                color: '#000',
                fontSize: '14px',
                padding: '10px 14px',
                outline: 'none',
                opacity: savingNote ? 0.5 : 1,
                fontWeight: 600,
              }}
            />
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="write today's entry... 🐾"
              rows={4}
              disabled={savingNote}
              style={{
                width: '100%',
                border: '2px solid black',
                borderRadius: '12px',
                backgroundColor: 'white',
                color: '#000',
                fontSize: '14px',
                padding: '11px 14px',
                outline: 'none',
                opacity: savingNote ? 0.5 : 1,
                fontFamily: 'inherit',
                resize: 'none',
              }}
            />

            <div
              style={{
                display: 'flex',
                gap: '6px',
                padding: '4px',
                border: '2px solid black',
                borderRadius: '999px',
                background: 'rgba(255,255,255,0.6)',
              }}
            >
              <button
                type="button"
                onClick={() => setNoteVisibility('private')}
                disabled={savingNote}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  border: '2px solid black',
                  borderRadius: '999px',
                  fontSize: '11px',
                  fontWeight: 900,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  background: noteVisibility === 'private'
                    ? 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #D4F0F0'
                    : 'transparent',
                  color: '#000',
                  boxShadow: noteVisibility === 'private' ? '2px 2px 0 0 black' : 'none',
                  cursor: 'pointer',
                }}
              >
                <Lock className="size-3" strokeWidth={3} />
                private
              </button>
              <button
                type="button"
                onClick={() => setNoteVisibility('shared')}
                disabled={savingNote}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  border: '2px solid black',
                  borderRadius: '999px',
                  fontSize: '11px',
                  fontWeight: 900,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  background: noteVisibility === 'shared'
                    ? 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFD1DC'
                    : 'transparent',
                  color: '#000',
                  boxShadow: noteVisibility === 'shared' ? '2px 2px 0 0 black' : 'none',
                  cursor: 'pointer',
                }}
              >
                <Globe className="size-3" strokeWidth={3} />
                share with crew
              </button>
            </div>

            {noteError && (
              <div
                style={{
                  border: '2px solid black',
                  backgroundColor: 'white',
                  color: '#000',
                  fontSize: '13px',
                  fontWeight: 800,
                  borderRadius: '12px',
                  padding: '10px 14px',
                }}
              >
                {noteError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="submit"
                disabled={savingNote || !noteContent.trim()}
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '11px 14px',
                  border: '2px solid black',
                  borderRadius: '999px',
                  backgroundColor: '#E2F0D9',
                  color: '#000',
                  fontWeight: 900,
                  fontSize: '12px',
                  boxShadow: '3px 3px 0 0 black',
                  cursor: savingNote || !noteContent.trim() ? 'not-allowed' : 'pointer',
                  opacity: savingNote || !noteContent.trim() ? 0.5 : 1,
                }}
              >
                <span>{savingNote ? '···' : editingNote ? '✓' : '🐱'}</span>
                <span>{savingNote ? 'SAVING' : editingNote ? 'UPDATE ENTRY' : 'SAVE ENTRY'}</span>
              </button>
              {editingNote && (
                <button
                  type="button"
                  onClick={cancelNoteEdit}
                  disabled={savingNote}
                  style={{
                    padding: '11px 14px',
                    border: '2px solid black',
                    borderRadius: '999px',
                    backgroundColor: '#FFD1DC',
                    color: '#000',
                    fontWeight: 900,
                    fontSize: '12px',
                    boxShadow: '3px 3px 0 0 black',
                    cursor: savingNote ? 'not-allowed' : 'pointer',
                    opacity: savingNote ? 0.5 : 1,
                  }}
                >
                  cancel
                </button>
              )}
            </div>
          </form>

          {notes.length === 0 ? (
            <div
              className="border-4 border-black text-center shrink-0"
              style={{ borderRadius: '18px', backgroundColor: '#FFFDF5', padding: '40px 20px', boxShadow: '4px 4px 0 0 black' }}
            >
              <div style={{ fontSize: '44px', marginBottom: '10px' }}>🐱📔</div>
              <p style={{ margin: 0, color: '#000', fontWeight: 800, fontSize: '13px' }}>
                no diary entries yet
              </p>
              <p style={{ margin: '8px 0 0', color: 'rgba(0,0,0,0.5)', fontWeight: 700, fontSize: '11px' }}>
                write something to start 🐾
              </p>
            </div>
          ) : (
            notes.map((n) => (
              <div
                key={n.id}
                style={{
                  border: '4px solid black',
                  borderRadius: '18px',
                  backgroundColor: colorFor(n.id),
                  padding: '14px 16px',
                  boxShadow: '4px 4px 0 0 black',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      border: '2px solid black',
                      fontSize: '9px',
                      fontWeight: 900,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      background: n.visibility === 'shared' ? '#FFD1DC' : '#FFFDF5',
                      color: '#000',
                    }}
                  >
                    {n.visibility === 'shared' ? (
                      <>
                        <Globe className="size-2.5" strokeWidth={3} /> shared
                      </>
                    ) : (
                      <>
                        <Lock className="size-2.5" strokeWidth={3} /> private
                      </>
                    )}
                  </span>
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 800,
                      color: 'rgba(0,0,0,0.5)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      marginLeft: 'auto',
                    }}
                  >
                    {timeAgo(n.updated_at)} 🐾
                  </span>
                </div>

                {n.title && (
                  <p
                    style={{
                      margin: '0 0 6px',
                      fontWeight: 900,
                      color: '#000',
                      fontSize: '14px',
                      paddingRight: '32px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {n.title}
                  </p>
                )}
                <p
                  style={{
                    margin: 0,
                    fontWeight: 700,
                    color: 'rgba(0,0,0,0.85)',
                    fontSize: '13px',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    paddingRight: '32px',
                  }}
                >
                  {n.content}
                </p>

                <div style={{ display: 'flex', gap: '6px', marginTop: '12px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => editNote(n)}
                    aria-label="Edit entry"
                    style={{
                      width: '28px',
                      height: '28px',
                      border: '2px solid black',
                      borderRadius: '999px',
                      backgroundColor: '#FFFDF5',
                      color: '#000',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '2px 2px 0 0 black',
                    }}
                  >
                    <Pencil className="size-3.5" strokeWidth={2.75} />
                  </button>
                  <button
                    onClick={() => deleteNote(n)}
                    aria-label="Delete entry"
                    style={{
                      width: '28px',
                      height: '28px',
                      border: '2px solid black',
                      borderRadius: '999px',
                      backgroundColor: '#FFFDF5',
                      color: '#000',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '2px 2px 0 0 black',
                    }}
                  >
                    <X className="size-3.5" strokeWidth={3} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </HiddenScroll>
    </div>
  );

  const sharedSlide = (
    <div style={{ height: '100%', position: 'relative' }}>
      <HiddenScroll sidePadding={14} topPadding={4} bottomPadding={20}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div
            className="border-4 border-black shrink-0"
            style={{
              borderRadius: '18px',
              background: `linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%), rgba(255,209,220,0.92)`,
              padding: '14px',
              boxShadow: `4px 4px 0 0 black, inset 0 1px 0 rgba(255,255,255,0.7)`,
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <span
              className="gloss-shine"
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '999px',
                border: '4px solid black',
                background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FF8BA7`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
                boxShadow: '3px 3px 0 0 black',
                flexShrink: 0,
              }}
            >
              🐱
            </span>
            <div>
              <p style={{ margin: 0, fontSize: '11px', fontWeight: 900, color: '#000', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                shared with the crew
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '13px', fontWeight: 800, color: 'rgba(0,0,0,0.55)', lineHeight: 1.3 }}>
                {sharedNotes.length} shared entr{sharedNotes.length === 1 ? 'y' : 'ies'} — everyone can read 🐾
              </p>
            </div>
          </div>

          {sharedNotes.length === 0 ? (
            <div
              className="border-4 border-black text-center shrink-0"
              style={{ borderRadius: '18px', backgroundColor: '#FFFDF5', padding: '40px 20px', boxShadow: '4px 4px 0 0 black' }}
            >
              <div style={{ fontSize: '44px', marginBottom: '10px' }}>🐱🌐</div>
              <p style={{ margin: 0, color: '#000', fontWeight: 800, fontSize: '13px' }}>
                nothing shared yet
              </p>
              <p style={{ margin: '8px 0 0', color: 'rgba(0,0,0,0.5)', fontWeight: 700, fontSize: '11px' }}>
                flip a diary entry to "share with crew" 🐾
              </p>
            </div>
          ) : (
            sharedNotes.map((n) => {
              const author = profiles.find((p) => p.id === n.user_id);
              const authorLabel = author
                ? displayLabel(author.email, author.display_name)
                : n.user_id === userId
                ? 'you'
                : 'someone';
              const mine = n.user_id === userId;

              return (
                <div
                  key={n.id}
                  style={{
                    border: '4px solid black',
                    borderRadius: '18px',
                    backgroundColor: colorFor(n.id),
                    padding: '14px 16px',
                    boxShadow: '4px 4px 0 0 black',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span
                      className="gloss-shine"
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '999px',
                        border: '2px solid black',
                        background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #E6E6FA`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 900,
                        fontSize: '9px',
                        color: '#000',
                        flexShrink: 0,
                      }}
                    >
                      {initialsFor(author?.email ?? n.user_id, author?.display_name ?? null)}
                    </span>
                    <p style={{ margin: 0, fontSize: '12px', fontWeight: 900, color: '#000' }}>
                      {authorLabel} 🐱
                    </p>
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 800,
                        color: 'rgba(0,0,0,0.5)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        marginLeft: 'auto',
                      }}
                    >
                      {timeAgo(n.updated_at)}
                    </span>
                  </div>

                  {n.title && (
                    <p
                      style={{
                        margin: '0 0 6px',
                        fontWeight: 900,
                        color: '#000',
                        fontSize: '14px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {n.title}
                    </p>
                  )}
                  <p
                    style={{
                      margin: 0,
                      fontWeight: 700,
                      color: 'rgba(0,0,0,0.85)',
                      fontSize: '13px',
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {n.content}
                  </p>

                  {mine && (
                    <button
                      onClick={() => deleteNote(n)}
                      aria-label="Delete entry"
                      style={{
                        position: 'absolute',
                        top: '-8px',
                        right: '-8px',
                        width: '26px',
                        height: '26px',
                        border: '2px solid black',
                        borderRadius: '999px',
                        backgroundColor: '#FFFDF5',
                        color: '#000',
                        fontWeight: 900,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '2px 2px 0 0 black',
                        zIndex: 5,
                      }}
                    >
                      <X className="size-3.5" strokeWidth={3} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </HiddenScroll>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-[#1a0b2e] font-mono flex flex-col overflow-hidden">
      <div
        className="mx-auto flex w-full max-w-3xl flex-1 min-h-0 flex-col gap-2"
        style={{
          paddingTop: 'max(8px, env(safe-area-inset-top))',
          paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
          paddingLeft: 'max(8px, env(safe-area-inset-left))',
          paddingRight: 'max(8px, env(safe-area-inset-right))',
        }}
      >
        <div className="flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="gloss-shine flex size-10 shrink-0 items-center justify-center rounded-2xl border-4 border-black"
              style={{
                background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #E6E6FA`,
                fontSize: '18px',
              }}
            >
              🐱
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-black text-lg leading-tight text-white">vault</h1>
              <p className="text-[10px] font-bold leading-tight text-white/60 truncate">
                🔒 private · {notes.length} entr{notes.length === 1 ? 'y' : 'ies'} 🐾
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex items-center justify-center border-4 border-black bg-[#E2F0D9] text-black font-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition shrink-0"
            style={{ padding: '8px 12px', fontSize: '14px', minWidth: '44px', minHeight: '44px' }}
          >
            ←
          </Link>
        </div>

        <SwipeCarousel
          mode="fill"
          index={tabIndex}
          onIndexChange={(i) => setTabIndex(i)}
          labels={[
            `💬 messages${totalUnread > 0 ? ` · ${totalUnread}` : ''}`,
            '📖 my diary',
            `🌐 shared${sharedNotes.length > 0 ? ` · ${sharedNotes.length}` : ''}`,
          ]}
          slides={[messagesListSlide, myDiarySlide, sharedSlide]}
        />
      </div>
    </div>
  );
}

export default function VaultPage() {
  return <VaultContent />;
}