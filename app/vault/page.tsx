'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/lib/use-profile';

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
};

type Profile = {
  id: string;
  email: string;
};

const NOTE_COLORS = ['#FFF5BA', '#FFD1DC', '#E2F0D9', '#E6E6FA', '#D4F0F0'];

function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++)
    hash = (hash * 17 + id.charCodeAt(i)) | 0;
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

export default function VaultPage() {
  const { profile } = useProfile();
  const timeFormat = profile?.time_format ?? '12h';

  const [tab, setTab] = useState<'notes' | 'messages'>('notes');
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
  const dmBottomRef = useRef<HTMLDivElement>(null);
  const dmScrollRef = useRef<HTMLDivElement>(null);
  const dmAtBottomRef = useRef(true);
  const dmInitialLoadDone = useRef(false);

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

  // Profiles + unread counts
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
      if (profilesRes.error) console.error(profilesRes.error);
      else setProfiles(profilesRes.data ?? []);

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

  // Load DMs for thread
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
          .then(({ data, error }) => {
            if (error) console.error('❌ Mark read failed:', error);
            else console.log(`✓ Marked ${data?.length ?? 0} DM(s) as read`);
          });

        setUnreadBySender((prev) => {
          const next = { ...prev };
          delete next[activeThread.id];
          return next;
        });
      });
  }, [userId, activeThread]);

  // Realtime
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
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, activeThread]);

  function handleDmScroll() {
    const el = dmScrollRef.current;
    if (!el) return;
    dmAtBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
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

  // DM action
  async function sendDm(e: React.FormEvent) {
    e.preventDefault();
    const text = dmInput.trim();
    if (!text || !userId || !email || !activeThread) return;
    setSendingDm(true);
    setDmInput('');

    const optimistic: DM = {
      id: `temp-${Date.now()}`,
      sender_id: userId,
      sender_email: email,
      recipient_id: activeThread.id,
      recipient_email: activeThread.email,
      content: text,
      created_at: new Date().toISOString(),
      read_at: null,
    };
    setDms((prev) => [...prev, optimistic]);
    dmAtBottomRef.current = true;
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
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      setDms((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDmInput(text);
      alert('⚠️ Failed to send: ' + error.message);
    } else if (data) {
      setDms((prev) =>
        prev.map((m) => (m.id === optimistic.id ? (data as DM) : m))
      );
    }
    setSendingDm(false);
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
        {/* ===== HEADER ===== */}
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

        {/* ===== TABS ===== */}
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

        {/* ============ NOTES TAB ============ */}
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
                      savingNote || !noteContent.trim()
                        ? 'not-allowed'
                        : 'pointer',
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

        {/* ============ CONTACT LIST (no active thread) ============ */}
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

        {/* ============ DM THREAD ============ */}
        {tab === 'messages' && activeThread && (
          <>
            {/* Thread header */}
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

            {/* DM window */}
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
              <div
                ref={dmScrollRef}
                onScroll={handleDmScroll}
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  padding: '24px 20px 8px',
                  WebkitOverflowScrolling: 'touch',
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
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    {dms.map((m, i) => {
                      const mine = m.sender_id === userId;
                      const prev = dms[i - 1];
                      const isNewGroup = !prev || prev.sender_id !== m.sender_id;
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
                              style={{
                                border: '2px solid black',
                                borderRadius: mine
                                  ? '24px 24px 6px 24px'
                                  : '24px 24px 24px 6px',
                                padding: '10px 16px',
                                backgroundColor: mine ? '#E2F0D9' : '#D4F0F0',
                                boxShadow: '2px 2px 0 0 black',
                              }}
                            >
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
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={dmBottomRef} style={{ height: '4px' }} />
                  </div>
                )}
              </div>

              {/* DM input */}
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
    </div>
  );
}