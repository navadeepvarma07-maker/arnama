'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/lib/use-profile';
import { BgPickerButton, getBgStyle, MessageBg } from '@/components/message-bg';

type Note = {
  id: string;
  user_id: string;
  title: string | null;
  content: string;
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

type Profile = {
  id: string;
  email: string;
};

type ContextMenu = {
  message: DM;
  x: number;
  y: number;
} | null;

const NOTE_COLORS = ['#FFF5BA', '#FFD1DC', '#E2F0D9', '#E6E6FA', '#D4F0F0'];

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
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatTime(iso: string, timeFormat: string = '12h'): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: timeFormat !== '24h',
  });
}

function VaultContent() {
  const searchParams = useSearchParams();
  const threadParam = searchParams.get('thread');

  const { profile } = useProfile();
  const timeFormat = profile?.time_format ?? '12h';
  const vaultBg: MessageBg = (((profile as any)?.vault_bg) ?? 'plain') as MessageBg;

  const [tab, setTab] = useState<'notes' | 'messages'>(
    threadParam ? 'messages' : 'notes'
  );
  const [pendingThreadId, setPendingThreadId] = useState<string | null>(threadParam);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // NOTES
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState('');
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  // DMs
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeThread, setActiveThread] = useState<Profile | null>(null);
  const [dms, setDms] = useState<DM[]>([]);
  const [dmInput, setDmInput] = useState('');
  const [sendingDm, setSendingDm] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [unreadBySender, setUnreadBySender] = useState<Record<string, number>>({});

  // Reply + edit state
  const [replyTo, setReplyTo] = useState<DM | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // Context menu
  const [contextMenu, setContextMenu] = useState<ContextMenu>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const dmBottomRef = useRef<HTMLDivElement>(null);
  const dmScrollRef = useRef<HTMLDivElement>(null);
  const dmAtBottomRef = useRef(true);
  const dmInitialLoadDone = useRef(false);

  // React to URL param changes
  useEffect(() => {
    if (threadParam) {
      setPendingThreadId(threadParam);
      setTab('messages');
    }
  }, [threadParam]);

  // Auth
  useEffect(() => {
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
          .update({ last_seen_vault_at: new Date().toISOString() })
          .eq('id', user!.id)
          .then(({ error }) => {
            if (error) console.error('last_seen_vault update failed:', error);
          });
      }
    });
  }, []);

  // Notes
  useEffect(() => {
    if (!userId) return;
    supabase
      .from('vault_notes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error(error);
        else setNotes(data ?? []);
      });
  }, [userId]);

  // Profiles + unread + deep-link
  useEffect(() => {
    if (!userId) return;
    Promise.all([
      supabase
        .from('profiles')
        .select('id, email')
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

      if (pendingThreadId && loaded.length > 0) {
        const found = loaded.find((p) => p.id === pendingThreadId);
        if (found) {
          setActiveThread(found);
          setTab('messages');
        }
        setPendingThreadId(null);
      }

      if (unreadRes.error) console.error(unreadRes.error);
      else {
        const counts: Record<string, number> = {};
        (unreadRes.data ?? []).forEach((row: any) => {
          counts[row.sender_id] = (counts[row.sender_id] ?? 0) + 1;
        });
        setUnreadBySender(counts);
      }
    });
  }, [userId, pendingThreadId]);

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
          .select()
          .then(({ error }) => {
            if (error) console.error('Mark read failed:', error);
          });

        setUnreadBySender((prev) => {
          const next = { ...prev };
          delete next[activeThread.id];
          return next;
        });
      });
  }, [userId, activeThread]);

  // Realtime — insert + update + delete
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

  function handleDmScroll() {
    const el = dmScrollRef.current;
    if (!el) return;
    dmAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  // Notes actions
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
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingNote.id)
        .select()
        .single();
      if (error) setNoteError('⚠️ ' + error.message);
      else if (data) {
        setNotes((prev) =>
          prev.map((n) => (n.id === (data as Note).id ? (data as Note) : n))
        );
        cancelNoteEdit();
      }
    } else {
      const { data, error } = await supabase
        .from('vault_notes')
        .insert({ user_id: userId, title: t || null, content: c })
        .select()
        .single();
      if (error) setNoteError('⚠️ ' + error.message);
      else if (data) {
        setNotes((prev) => [data as Note, ...prev]);
        setNoteTitle('');
        setNoteContent('');
      }
    }
    setSavingNote(false);
  }

  function editNote(n: Note) {
    setEditingNote(n);
    setNoteTitle(n.title ?? '');
    setNoteContent(n.content);
  }

  function cancelNoteEdit() {
    setEditingNote(null);
    setNoteTitle('');
    setNoteContent('');
    setNoteError('');
  }

  async function deleteNote(n: Note) {
    if (!confirm('Delete this note?')) return;
    const { error } = await supabase.from('vault_notes').delete().eq('id', n.id);
    if (!error) setNotes((prev) => prev.filter((x) => x.id !== n.id));
  }

  // DM: send
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
    setTimeout(() => {
      dmBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 60);

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
      console.error(error);
      setDms((prev) => prev.filter((m) => m.id !== tempId));
      setDmInput(text);
      alert('⚠️ Failed to send: ' + error.message);
    } else if (data) {
      setDms((prev) => prev.map((m) => (m.id === tempId ? (data as DM) : m)));
    }
    setSendingDm(false);
  }

  // DM: edit
  async function saveEdit(messageId: string) {
    const text = editText.trim();
    if (!text) {
      setEditingId(null);
      setEditText('');
      return;
    }
    setDms((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, content: text, edited_at: new Date().toISOString() }
          : m
      )
    );
    setEditingId(null);
    setEditText('');

    const { error } = await supabase
      .from('vault_dms')
      .update({ content: text, edited_at: new Date().toISOString() })
      .eq('id', messageId);
    if (error) {
      console.error(error);
      alert('⚠️ Failed to edit: ' + error.message);
    }
  }

  // DM: delete
  async function deleteMessage(messageId: string) {
    if (!confirm('Delete this message?')) return;
    const backup = dms;
    setDms((prev) => prev.filter((m) => m.id !== messageId));

    const { error } = await supabase.from('vault_dms').delete().eq('id', messageId);
    if (error) {
      console.error(error);
      setDms(backup);
      alert('⚠️ Failed to delete: ' + error.message);
    }
  }

  // BG save
  async function handleBgChange(bg: MessageBg) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('profiles').update({ vault_bg: bg }).eq('id', user.id);
  }

  // Context menu
  function openContextMenu(message: DM, x: number, y: number) {
    const menuWidth = 180;
    const menuHeight = 180;
    const safeX = Math.min(x, window.innerWidth - menuWidth - 8);
    const safeY = Math.min(y, window.innerHeight - menuHeight - 8);
    setContextMenu({ message, x: safeX, y: safeY });
  }

  function handleRightClick(e: React.MouseEvent, message: DM) {
    e.preventDefault();
    openContextMenu(message, e.clientX, e.clientY);
  }

  function handleTouchStart(e: React.TouchEvent, message: DM) {
    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;
    longPressTimer.current = setTimeout(() => {
      openContextMenu(message, x, y);
    }, 500);
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
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'var(--bg-app, #1a0b2e)',
          color: 'var(--text-primary, #FFFDF5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'ui-monospace, monospace',
          fontWeight: 800,
        }}
      >
        loading...
      </div>
    );
  }

  const totalUnread = Object.values(unreadBySender).reduce((a, b) => a + b, 0);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--bg-app, #1a0b2e)',
        fontFamily: 'ui-monospace, monospace',
        display: 'flex',
        justifyContent: 'center',
        overflow: 'hidden',
        transition: 'background-color 0.2s ease',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '820px',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px',
          gap: '14px',
          minHeight: 0,
        }}
      >
        {/* HEADER */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '4px solid black',
                borderRadius: '999px',
                backgroundColor: '#E6E6FA',
                fontSize: '26px',
                boxShadow: '4px 4px 0 0 black',
                transform: 'rotate(-5deg)',
              }}
            >
              🔒
            </div>
            <div style={{ minWidth: 0 }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: '24px',
                  fontWeight: 900,
                  color: 'var(--text-primary, #FFFDF5)',
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                }}
              >
                vault
              </h1>
              <p
                style={{
                  margin: '7px 0 0',
                  fontSize: '10px',
                  fontWeight: 800,
                  color: 'var(--text-secondary, rgba(255,253,245,0.6))',
                  lineHeight: 1.2,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                }}
              >
                🔒 private · just for you
              </p>
            </div>
          </div>

          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 20px',
              border: '4px solid black',
              borderRadius: '999px',
              backgroundColor: '#E2F0D9',
              color: '#000',
              fontWeight: 900,
              fontSize: '13px',
              textDecoration: 'none',
              boxShadow: '4px 4px 0 0 black',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: '15px', lineHeight: 1 }}>←</span>
            <span>back</span>
          </Link>
        </div>

        {/* TABS */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '6px',
            border: '4px solid black',
            borderRadius: '999px',
            backgroundColor: '#FFFDF5',
            boxShadow: '5px 5px 0 0 black',
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => {
              setTab('notes');
              setActiveThread(null);
            }}
            style={{
              flex: 1,
              padding: '10px',
              border: '2px solid black',
              borderRadius: '999px',
              fontWeight: 900,
              fontSize: '12px',
              backgroundColor: tab === 'notes' ? '#FFF5BA' : 'transparent',
              color: '#000',
              boxShadow: tab === 'notes' ? '3px 3px 0 0 black' : 'none',
              cursor: 'pointer',
            }}
          >
            🔒 my notes
          </button>
          <button
            onClick={() => setTab('messages')}
            style={{
              flex: 1,
              padding: '10px',
              border: '2px solid black',
              borderRadius: '999px',
              fontWeight: 900,
              fontSize: '12px',
              backgroundColor: tab === 'messages' ? '#D4F0F0' : 'transparent',
              color: '#000',
              boxShadow: tab === 'messages' ? '3px 3px 0 0 black' : 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span>💬 messages</span>
            {totalUnread > 0 && (
              <span
                style={{
                  backgroundColor: '#FF8BA7',
                  color: '#000',
                  fontSize: '10px',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  fontWeight: 900,
                  lineHeight: 1.2,
                  border: '2px solid black',
                }}
              >
                {totalUnread}
              </span>
            )}
          </button>
        </div>

        {/* NOTES TAB */}
        {tab === 'notes' && (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              paddingRight: '4px',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <form
              onSubmit={saveNote}
              style={{
                border: '4px solid black',
                borderRadius: '22px',
                backgroundColor: '#FFF5BA',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                boxShadow: '6px 6px 0 0 black',
                flexShrink: 0,
              }}
            >
              <input
                type="text"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="title (optional)"
                maxLength={80}
                disabled={savingNote}
                style={{
                  width: '100%',
                  border: '2px solid black',
                  borderRadius: '14px',
                  backgroundColor: 'white',
                  color: '#000',
                  fontSize: '14px',
                  padding: '10px 16px',
                  outline: 'none',
                  opacity: savingNote ? 0.5 : 1,
                  fontWeight: 600,
                }}
              />
              <textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="write your private note..."
                rows={4}
                disabled={savingNote}
                style={{
                  width: '100%',
                  border: '2px solid black',
                  borderRadius: '14px',
                  backgroundColor: 'white',
                  color: '#000',
                  fontSize: '14px',
                  padding: '11px 16px',
                  outline: 'none',
                  opacity: savingNote ? 0.5 : 1,
                  fontFamily: 'inherit',
                  resize: 'none',
                }}
              />
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
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="submit"
                  disabled={savingNote || !noteContent.trim()}
                  style={{
                    flex: 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '11px 18px',
                    border: '2px solid black',
                    borderRadius: '999px',
                    backgroundColor: '#E2F0D9',
                    color: '#000',
                    fontWeight: 900,
                    fontSize: '12px',
                    boxShadow: '3px 3px 0 0 black',
                    cursor:
                      savingNote || !noteContent.trim() ? 'not-allowed' : 'pointer',
                    opacity: savingNote || !noteContent.trim() ? 0.5 : 1,
                  }}
                >
                  <span>{savingNote ? '···' : editingNote ? '✓' : '▶'}</span>
                  <span>
                    {savingNote
                      ? 'SAVING'
                      : editingNote
                      ? 'UPDATE NOTE'
                      : 'SAVE NOTE'}
                  </span>
                </button>
                {editingNote && (
                  <button
                    type="button"
                    onClick={cancelNoteEdit}
                    disabled={savingNote}
                    style={{
                      padding: '11px 18px',
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
                style={{
                  border: '4px solid black',
                  backgroundColor: '#FFFDF5',
                  borderRadius: '22px',
                  textAlign: 'center',
                  padding: '40px 20px',
                  boxShadow: '6px 6px 0 0 black',
                  flexShrink: 0,
                }}
              >
                <div style={{ fontSize: '36px', marginBottom: '10px' }}>🔒</div>
                <p style={{ margin: 0, color: '#000', fontWeight: 800, fontSize: '13px' }}>
                  no notes yet — write your first one
                </p>
                <p
                  style={{
                    margin: '8px 0 0',
                    color: 'rgba(0,0,0,0.5)',
                    fontWeight: 700,
                    fontSize: '11px',
                  }}
                >
                  only you can see these
                </p>
              </div>
            ) : (
              notes.map((n) => (
                <div
                  key={n.id}
                  style={{
                    border: '4px solid black',
                    borderRadius: '22px',
                    backgroundColor: colorFor(n.id),
                    padding: '16px 20px',
                    boxShadow: '5px 5px 0 0 black',
                    position: 'relative',
                    flexShrink: 0,
                  }}
                >
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
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: '14px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '9px',
                        color: 'rgba(0,0,0,0.5)',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                      }}
                    >
                      {timeAgo(n.updated_at)}
                    </span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => editNote(n)}
                        style={{
                          width: '28px',
                          height: '28px',
                          border: '2px solid black',
                          borderRadius: '999px',
                          backgroundColor: '#FFFDF5',
                          color: '#000',
                          fontWeight: 900,
                          fontSize: '12px',
                          lineHeight: 1,
                          boxShadow: '2px 2px 0 0 black',
                          cursor: 'pointer',
                        }}
                        aria-label="Edit note"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => deleteNote(n)}
                        style={{
                          width: '28px',
                          height: '28px',
                          border: '2px solid black',
                          borderRadius: '999px',
                          backgroundColor: '#FFFDF5',
                          color: '#000',
                          fontWeight: 900,
                          fontSize: '12px',
                          lineHeight: 1,
                          boxShadow: '2px 2px 0 0 black',
                          cursor: 'pointer',
                        }}
                        aria-label="Delete note"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* CONTACT LIST */}
        {tab === 'messages' && !activeThread && (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              paddingRight: '4px',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <p
              style={{
                margin: '0 0 4px',
                fontSize: '11px',
                fontWeight: 900,
                color: 'var(--text-secondary, rgba(255,253,245,0.6))',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                paddingLeft: '8px',
                flexShrink: 0,
              }}
            >
              pick someone to dm · private, 1-on-1
            </p>

            {profiles.length === 0 ? (
              <div
                style={{
                  border: '4px solid black',
                  backgroundColor: '#FFFDF5',
                  borderRadius: '22px',
                  textAlign: 'center',
                  padding: '40px 20px',
                  boxShadow: '6px 6px 0 0 black',
                }}
              >
                <p style={{ margin: 0, color: '#000', fontWeight: 800, fontSize: '13px' }}>
                  no other members yet
                </p>
              </div>
            ) : (
              profiles.map((p, i) => {
                const prefix = p.email.split('@')[0];
                const initials = prefix.slice(0, 2).toUpperCase();
                const colors = ['#E2F0D9', '#FFD1DC', '#E6E6FA'];
                const bg = colors[i % colors.length];
                const unread = unreadBySender[p.id] ?? 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => setActiveThread(p)}
                    style={{
                      border: '4px solid black',
                      borderRadius: '22px',
                      backgroundColor: '#FFFDF5',
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      textAlign: 'left',
                      boxShadow: '4px 4px 0 0 black',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div
                        style={{
                          width: '48px',
                          height: '48px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '999px',
                          border: '3px solid black',
                          backgroundColor: bg,
                          fontWeight: 900,
                          fontSize: '13px',
                          color: '#000',
                        }}
                      >
                        {initials}
                      </div>
                      {unread > 0 && (
                        <span
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
                        {prefix}
                      </p>
                      <p
                        style={{
                          margin: '2px 0 0',
                          fontSize: '10px',
                          fontWeight: 800,
                          color: unread > 0 ? '#C2185B' : 'rgba(0,0,0,0.5)',
                        }}
                      >
                        {unread > 0
                          ? `${unread} new message${unread > 1 ? 's' : ''}`
                          : 'tap to open dm'}
                      </p>
                    </div>
                    <span style={{ fontSize: '18px', color: '#000' }}>›</span>
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* DM THREAD */}
        {tab === 'messages' && activeThread && (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                border: '4px solid black',
                borderRadius: '22px',
                backgroundColor: '#FFFDF5',
                padding: '10px 14px',
                boxShadow: '5px 5px 0 0 black',
                flexShrink: 0,
              }}
            >
              <button
                onClick={() => setActiveThread(null)}
                style={{
                  width: '36px',
                  height: '36px',
                  border: '2px solid black',
                  borderRadius: '999px',
                  backgroundColor: '#FFD1DC',
                  color: '#000',
                  fontWeight: 900,
                  fontSize: '15px',
                  lineHeight: 1,
                  boxShadow: '2px 2px 0 0 black',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                aria-label="Back to list"
              >
                ‹
              </button>
              <BgPickerButton current={vaultBg} onChange={handleBgChange} />
              <p
                style={{
                  margin: 0,
                  fontWeight: 900,
                  fontSize: '15px',
                  color: '#000',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {activeThread.email.split('@')[0]}
              </p>
              <span
                style={{
                  fontSize: '9px',
                  color: 'rgba(0,0,0,0.4)',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  flexShrink: 0,
                }}
              >
                🔒 private
              </span>
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                border: '4px solid black',
                borderRadius: '28px',
                backgroundColor: '#FFFDF5',
                overflow: 'hidden',
                boxShadow: '8px 8px 0 0 black',
              }}
            >
              {/* DM scroll area — bg applied here */}
              <div
                ref={dmScrollRef}
                onScroll={handleDmScroll}
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  padding: '24px 20px 8px',
                  WebkitOverflowScrolling: 'touch',
                  ...getBgStyle(vaultBg),
                }}
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
                    loading...
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
                    <span style={{ fontSize: '44px' }}>🐱🐶</span>
                    <p
                      style={{
                        margin: 0,
                        textAlign: 'center',
                        fontStyle: 'italic',
                        color: 'rgba(0,0,0,0.5)',
                        fontSize: '13px',
                      }}
                    >
                      no messages yet — say hi 👋
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

                      return (
                        <div
                          key={m.id}
                          className={mine ? 'msg-mine' : 'msg-theirs'}
                          style={{
                            display: 'flex',
                            justifyContent: mine ? 'flex-end' : 'flex-start',
                            marginTop: isNewGroup && i > 0 ? '16px' : '0',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              maxWidth: '78%',
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
                                  color: 'rgba(0,0,0,0.4)',
                                  marginBottom: '7px',
                                  paddingLeft: '8px',
                                  paddingRight: '8px',
                                }}
                              >
                                {mine ? 'you' : 'them'} ·{' '}
                                {formatTime(m.created_at, timeFormat)}
                              </div>
                            )}
                            <div
                              onContextMenu={(e) => handleRightClick(e, m)}
                              onTouchStart={(e) => handleTouchStart(e, m)}
                              onTouchEnd={handleTouchEnd}
                              onTouchMove={handleTouchEnd}
                              style={{
                                border: '2px solid black',
                                borderRadius: mine
                                  ? '24px 24px 6px 24px'
                                  : '24px 24px 24px 6px',
                                padding: '10px 16px',
                                backgroundColor: mine ? '#E2F0D9' : '#D4F0F0',
                                boxShadow: '2px 2px 0 0 black',
                                cursor: 'pointer',
                                userSelect: 'none',
                                minWidth: '80px',
                              }}
                            >
                              {repliedTo && (
                                <div
                                  style={{
                                    borderLeft: '4px solid black',
                                    backgroundColor: 'rgba(0,0,0,0.08)',
                                    borderRadius: '8px',
                                    padding: '5px 8px',
                                    marginBottom: '6px',
                                  }}
                                >
                                  <p
                                    style={{
                                      fontSize: '9px',
                                      fontWeight: 900,
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.06em',
                                      color: 'rgba(0,0,0,0.5)',
                                      margin: 0,
                                    }}
                                  >
                                    {repliedTo.sender_id === userId
                                      ? 'you'
                                      : repliedTo.sender_email.split('@')[0]}
                                  </p>
                                  <p
                                    style={{
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      color: 'rgba(0,0,0,0.7)',
                                      margin: '2px 0 0',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {previewOf(repliedTo.content, 40)}
                                  </p>
                                </div>
                              )}

                              {isEditing ? (
                                <div
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px',
                                    minWidth: '180px',
                                  }}
                                >
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
                              ) : (
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
                                  {m.content}
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
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={dmBottomRef} style={{ height: '4px' }} />
                  </div>
                )}
              </div>

              {/* Reply preview bar */}
              {replyTo && (
                <div
                  style={{
                    borderTop: '4px solid black',
                    backgroundColor: '#FFF5BA',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    flexShrink: 0,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
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
                      replying to{' '}
                      {replyTo.sender_id === userId
                        ? 'yourself'
                        : replyTo.sender_email.split('@')[0]}
                    </p>
                    <p
                      style={{
                        margin: '3px 0 0',
                        fontSize: '12px',
                        color: 'rgba(0,0,0,0.6)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {previewOf(replyTo.content, 60)}
                    </p>
                  </div>
                  <button
                    onClick={() => setReplyTo(null)}
                    style={{
                      width: '28px',
                      height: '28px',
                      border: '2px solid black',
                      borderRadius: '8px',
                      backgroundColor: '#FFD1DC',
                      color: '#000',
                      fontWeight: 900,
                      fontSize: '13px',
                      lineHeight: 1,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                    aria-label="Cancel reply"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Input */}
              <form
                onSubmit={sendDm}
                style={{
                  flexShrink: 0,
                  borderTop: '4px solid black',
                  backgroundColor: '#E6E6FA',
                  display: 'flex',
                  alignItems: 'stretch',
                  padding: '12px',
                  gap: '10px',
                }}
              >
                <input
                  type="text"
                  value={dmInput}
                  onChange={(e) => setDmInput(e.target.value)}
                  placeholder="type a private message..."
                  disabled={sendingDm}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    border: '3px solid black',
                    borderRadius: '999px',
                    backgroundColor: 'white',
                    color: '#000',
                    fontSize: '14px',
                    padding: '11px 20px',
                    outline: 'none',
                    opacity: sendingDm ? 0.5 : 1,
                    fontWeight: 600,
                  }}
                />
                <button
                  type="submit"
                  disabled={sendingDm || !dmInput.trim()}
                  className="group"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                    padding: '11px 20px',
                    border: '3px solid black',
                    borderRadius: '999px',
                    backgroundColor: '#E2F0D9',
                    color: '#000',
                    fontWeight: 900,
                    fontSize: '12px',
                    boxShadow: '3px 3px 0 0 black',
                    cursor:
                      sendingDm || !dmInput.trim() ? 'not-allowed' : 'pointer',
                    opacity: sendingDm || !dmInput.trim() ? 0.5 : 1,
                    flexShrink: 0,
                  }}
                >
                  <span
                    className="animate-purr"
                    style={{ fontSize: '17px', lineHeight: 1 }}
                  >
                    🐱
                  </span>
                  <span style={{ letterSpacing: '0.06em' }}>
                    {sendingDm ? '...' : 'SEND'}
                  </span>
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      {/* CONTEXT MENU */}
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
            borderRadius: '14px',
            boxShadow: '5px 5px 0 0 black',
            padding: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            minWidth: '160px',
          }}
        >
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

          {contextMenu.message.sender_id === userId && (
            <>
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
            </>
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

export default function VaultPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'var(--bg-app, #1a0b2e)',
            color: 'var(--text-primary, #FFFDF5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'ui-monospace, monospace',
            fontWeight: 800,
          }}
        >
          loading...
        </div>
      }
    >
      <VaultContent />
    </Suspense>
  );
}