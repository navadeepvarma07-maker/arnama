'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function VaultPage() {
  const [tab, setTab] = useState<'notes' | 'messages'>('notes');
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // -------- NOTES --------
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState('');
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  // -------- DMs --------
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeThread, setActiveThread] = useState<Profile | null>(null);
  const [dms, setDms] = useState<DM[]>([]);
  const [dmInput, setDmInput] = useState('');
  const [sendingDm, setSendingDm] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const dmBottomRef = useRef<HTMLDivElement>(null);

  // Auth + mark caught-up
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
        else setNotes(data ?? []);
      });
  }, [userId]);

  // Load profiles for DM list
  useEffect(() => {
    if (!userId) return;
    supabase
      .from('profiles')
      .select('id, email')
      .neq('id', userId)
      .order('email', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error(error);
        else setProfiles(data ?? []);
      });
  }, [userId]);

  // Load DMs for active thread
  useEffect(() => {
    if (!userId || !activeThread) {
      setDms([]);
      return;
    }
    setThreadLoading(true);
    supabase
      .from('vault_dms')
      .select('*')
      .or(
        `and(sender_id.eq.${userId},recipient_id.eq.${activeThread.id}),and(sender_id.eq.${activeThread.id},recipient_id.eq.${userId})`
      )
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error(error);
        else setDms(data ?? []);
        setThreadLoading(false);

        // Mark incoming as read
        supabase
          .from('vault_dms')
          .update({ read_at: new Date().toISOString() })
          .eq('recipient_id', userId)
          .eq('sender_id', activeThread.id)
          .is('read_at', null)
          .then(({ error }) => {
            if (error) console.error(error);
          });
      });
  }, [userId, activeThread]);

  // Realtime DMs (only those involving me)
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
          // If it's part of the active thread, add it
          if (
            activeThread &&
            ((m.sender_id === userId && m.recipient_id === activeThread.id) ||
              (m.sender_id === activeThread.id && m.recipient_id === userId))
          ) {
            setDms((prev) => {
              if (prev.some((x) => x.id === m.id)) return prev;
              return [...prev, m];
            });
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, activeThread]);

  // Auto-scroll DMs
  useEffect(() => {
    dmBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dms]);

  // -------- NOTE ACTIONS --------
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  // -------- DM ACTIONS --------
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
      <div className="min-h-screen bg-[#1a0b2e] flex items-center justify-center text-white font-mono">
        loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a0b2e] p-4 sm:p-6 font-mono flex flex-col">
      <div className="w-full max-w-2xl mx-auto flex flex-col gap-4">

        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <h1 className="text-xl sm:text-2xl font-black text-white">🔒 vault</h1>
          <Link
            href="/"
            className="inline-flex items-center border-4 border-black bg-[#E2F0D9] text-black font-black rounded-xl shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:shadow-[7px_7px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition"
            style={{ padding: '10px 20px', gap: '10px' }}
          >
            <span className="text-base leading-none">←</span>
            <span className="text-sm leading-none">back</span>
          </Link>
        </div>

        {/* Tabs */}
        <div
          className="border-4 border-black rounded-2xl shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] flex"
          style={{ backgroundColor: '#FFFDF5', padding: '6px', gap: '6px' }}
        >
          <button
            onClick={() => setTab('notes')}
            className="flex-1 border-2 border-black rounded-xl font-black transition"
            style={{
              padding: '10px',
              fontSize: '12px',
              backgroundColor: tab === 'notes' ? '#FFF5BA' : '#FFFDF5',
              color: '#000',
              boxShadow: tab === 'notes' ? '3px 3px 0 0 black' : 'none',
            }}
          >
            🔒 my notes
          </button>
          <button
            onClick={() => setTab('messages')}
            className="flex-1 border-2 border-black rounded-xl font-black transition"
            style={{
              padding: '10px',
              fontSize: '12px',
              backgroundColor: tab === 'messages' ? '#D4F0F0' : '#FFFDF5',
              color: '#000',
              boxShadow: tab === 'messages' ? '3px 3px 0 0 black' : 'none',
            }}
          >
            💬 messages
          </button>
        </div>

        {/* ============ NOTES TAB ============ */}
        {tab === 'notes' && (
          <>
            <form
              onSubmit={saveNote}
              className="border-4 border-black rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col"
              style={{ backgroundColor: '#FFF5BA', padding: '16px', gap: '10px' }}
            >
              <input
                type="text"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="title (optional)"
                maxLength={80}
                disabled={savingNote}
                className="w-full border-2 border-black rounded-lg bg-white text-black text-sm focus:outline-none disabled:opacity-50"
                style={{ padding: '10px 14px' }}
              />
              <textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="write your private note..."
                rows={4}
                disabled={savingNote}
                className="w-full border-2 border-black rounded-lg bg-white text-black text-sm focus:outline-none disabled:opacity-50 resize-none"
                style={{ padding: '11px 14px', fontFamily: 'inherit' }}
              />
              {noteError && (
                <div
                  className="border-2 border-black bg-white text-black text-sm font-bold rounded-lg"
                  style={{ padding: '10px 14px' }}
                >
                  {noteError}
                </div>
              )}
              <div className="flex" style={{ gap: '10px' }}>
                <button
                  type="submit"
                  disabled={savingNote || !noteContent.trim()}
                  className="flex-1 inline-flex items-center justify-center border-2 border-black bg-[#E2F0D9] text-black text-xs font-black rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition disabled:opacity-50 disabled:hover:translate-y-0"
                  style={{ padding: '11px 18px', gap: '8px' }}
                >
                  <span className="text-sm leading-none">
                    {savingNote ? '···' : editingNote ? '✓' : '▶'}
                  </span>
                  <span className="leading-none tracking-wider">
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
                    className="border-2 border-black bg-[#FFD1DC] text-black text-xs font-black rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition disabled:opacity-50"
                    style={{ padding: '11px 18px' }}
                  >
                    cancel
                  </button>
                )}
              </div>
            </form>

            {notes.length === 0 ? (
              <div
                className="border-4 border-black bg-[#FFFDF5] rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] text-center"
                style={{ padding: '40px 20px' }}
              >
                <p className="text-black font-bold text-sm">
                  no notes yet — write your first one 🔒
                </p>
                <p
                  className="text-black/50 font-bold"
                  style={{ fontSize: '11px', marginTop: '8px' }}
                >
                  only you can see these
                </p>
              </div>
            ) : (
              <div className="flex flex-col" style={{ gap: '12px' }}>
                {notes.map((n) => (
                  <div
                    key={n.id}
                    className="border-4 border-black shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] relative"
                    style={{
                      backgroundColor: colorFor(n.id),
                      padding: '16px 18px',
                    }}
                  >
                    {n.title && (
                      <p
                        className="font-black truncate"
                        style={{
                          color: '#000',
                          fontSize: '14px',
                          marginBottom: '6px',
                          paddingRight: '32px',
                        }}
                      >
                        {n.title}
                      </p>
                    )}
                    <p
                      className="font-bold whitespace-pre-wrap break-words"
                      style={{
                        color: 'rgba(0,0,0,0.85)',
                        fontSize: '13px',
                        lineHeight: 1.5,
                        paddingRight: '32px',
                      }}
                    >
                      {n.content}
                    </p>
                    <div
                      className="flex items-center justify-between"
                      style={{ marginTop: '12px' }}
                    >
                      <span
                        className="font-bold uppercase tracking-wider"
                        style={{
                          fontSize: '9px',
                          color: 'rgba(0,0,0,0.5)',
                        }}
                      >
                        {timeAgo(n.updated_at)}
                      </span>
                      <div className="flex" style={{ gap: '6px' }}>
                        <button
                          onClick={() => editNote(n)}
                          className="border-2 border-black bg-[#FFFDF5] text-black font-black rounded-full hover:-translate-y-0.5 active:translate-y-0.5 transition"
                          style={{
                            width: '26px',
                            height: '26px',
                            fontSize: '11px',
                            lineHeight: 1,
                            boxShadow: '2px 2px 0 0 black',
                          }}
                          aria-label="Edit note"
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => deleteNote(n)}
                          className="border-2 border-black bg-[#FFFDF5] text-black font-black rounded-full hover:-translate-y-0.5 active:translate-y-0.5 transition"
                          style={{
                            width: '26px',
                            height: '26px',
                            fontSize: '11px',
                            lineHeight: 1,
                            boxShadow: '2px 2px 0 0 black',
                          }}
                          aria-label="Delete note"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ============ MESSAGES TAB ============ */}
        {tab === 'messages' && !activeThread && (
          <>
            <p
              className="font-black uppercase tracking-wider"
              style={{
                fontSize: '11px',
                color: 'rgba(255,253,245,0.6)',
                paddingLeft: '4px',
              }}
            >
              pick someone to dm · private, 1-on-1
            </p>

            {profiles.length === 0 ? (
              <div
                className="border-4 border-black bg-[#FFFDF5] rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] text-center"
                style={{ padding: '40px 20px' }}
              >
                <p className="text-black font-bold text-sm">
                  no other members yet
                </p>
              </div>
            ) : (
              <div className="flex flex-col" style={{ gap: '10px' }}>
                {profiles.map((p, i) => {
                  const prefix = p.email.split('@')[0];
                  const initials = prefix.slice(0, 2).toUpperCase();
                  const colors = ['#E2F0D9', '#FFD1DC', '#E6E6FA'];
                  const bg = colors[i % colors.length];
                  return (
                    <button
                      key={p.id}
                      onClick={() => setActiveThread(p)}
                      className="border-4 border-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center hover:-translate-y-0.5 active:translate-y-0.5 transition text-left"
                      style={{
                        backgroundColor: '#FFFDF5',
                        padding: '12px 14px',
                        gap: '12px',
                      }}
                    >
                      <div
                        className="flex items-center justify-center rounded-xl border-4 border-black font-display"
                        style={{
                          width: '44px',
                          height: '44px',
                          fontSize: '11px',
                          backgroundColor: bg,
                          color: '#000',
                          flexShrink: 0,
                        }}
                      >
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className="font-black truncate"
                          style={{ fontSize: '14px', color: '#000' }}
                        >
                          {prefix}
                        </p>
                        <p
                          className="font-bold"
                          style={{ fontSize: '10px', color: 'rgba(0,0,0,0.5)' }}
                        >
                          tap to open dm
                        </p>
                      </div>
                      <span style={{ fontSize: '18px', color: '#000' }}>›</span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ============ DM THREAD ============ */}
        {tab === 'messages' && activeThread && (
          <>
            <div
              className="border-4 border-black rounded-2xl shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] flex items-center"
              style={{
                backgroundColor: '#FFFDF5',
                padding: '10px 14px',
                gap: '12px',
              }}
            >
              <button
                onClick={() => setActiveThread(null)}
                className="border-2 border-black bg-[#FFD1DC] text-black font-black rounded-lg hover:-translate-y-0.5 active:translate-y-0.5 transition shrink-0"
                style={{
                  width: '32px',
                  height: '32px',
                  fontSize: '14px',
                  lineHeight: 1,
                  boxShadow: '2px 2px 0 0 black',
                }}
                aria-label="Back to list"
              >
                ‹
              </button>
              <p
                className="font-black truncate flex-1"
                style={{ fontSize: '14px', color: '#000' }}
              >
                {activeThread.email.split('@')[0]}
              </p>
              <span
                className="font-bold uppercase tracking-wider"
                style={{ fontSize: '9px', color: 'rgba(0,0,0,0.4)' }}
              >
                🔒 private
              </span>
            </div>

            <div
              className="border-4 border-black rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col"
              style={{ backgroundColor: '#FFFDF5', minHeight: '400px', maxHeight: '60vh' }}
            >
              <div
                className="overflow-y-auto flex-1"
                style={{ padding: '16px' }}
              >
                {threadLoading ? (
                  <p
                    className="text-center font-bold"
                    style={{ color: 'rgba(0,0,0,0.4)', fontSize: '12px', padding: '20px 0' }}
                  >
                    loading...
                  </p>
                ) : dms.length === 0 ? (
                  <p
                    className="text-center font-bold"
                    style={{ color: 'rgba(0,0,0,0.4)', fontSize: '12px', padding: '20px 0' }}
                  >
                    no messages yet — say hi 👋
                  </p>
                ) : (
                  <div className="flex flex-col" style={{ gap: '8px' }}>
                    {dms.map((m) => {
                      const mine = m.sender_id === userId;
                      return (
                        <div
                          key={m.id}
                          className="flex"
                          style={{ justifyContent: mine ? 'flex-end' : 'flex-start' }}
                        >
                          <div
                            className="border-2 border-black"
                            style={{
                              maxWidth: '75%',
                              padding: '8px 12px',
                              borderRadius: '14px',
                              backgroundColor: mine ? '#E2F0D9' : '#D4F0F0',
                              boxShadow: '2px 2px 0 0 black',
                            }}
                          >
                            <p
                              style={{
                                color: '#000',
                                fontSize: '13px',
                                lineHeight: 1.4,
                                wordBreak: 'break-word',
                                whiteSpace: 'pre-wrap',
                                margin: 0,
                              }}
                            >
                              {m.content}
                            </p>
                            <p
                              style={{
                                color: 'rgba(0,0,0,0.4)',
                                fontSize: '9px',
                                margin: '4px 0 0',
                                fontWeight: 700,
                                textAlign: mine ? 'right' : 'left',
                              }}
                            >
                              {formatTime(m.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={dmBottomRef} />
                  </div>
                )}
              </div>

              <form
                onSubmit={sendDm}
                className="border-t-4 border-black flex items-stretch shrink-0"
                style={{ backgroundColor: '#E6E6FA', padding: '10px', gap: '8px' }}
              >
                <input
                  type="text"
                  value={dmInput}
                  onChange={(e) => setDmInput(e.target.value)}
                  placeholder="type a private message..."
                  disabled={sendingDm}
                  className="flex-1 min-w-0 border-2 border-black rounded-lg bg-white text-black text-sm focus:outline-none disabled:opacity-50"
                  style={{ padding: '10px 14px' }}
                />
                <button
                  type="submit"
                  disabled={sendingDm || !dmInput.trim()}
                  className="inline-flex items-center border-2 border-black bg-[#E2F0D9] text-black text-xs font-black rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition disabled:opacity-50 disabled:hover:translate-y-0 shrink-0"
                  style={{ padding: '10px 16px', gap: '6px' }}
                >
                  <span className="text-sm leading-none">
                    {sendingDm ? '···' : '▶'}
                  </span>
                  <span className="leading-none tracking-wider">
                    {sendingDm ? 'SENDING' : 'SEND'}
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