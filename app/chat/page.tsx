'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/lib/use-profile';
import { BgPickerButton, getBgStyle, isDarkBg, MessageBg } from '@/components/message-bg';

type Message = {
  id: number;
  user_email: string;
  content: string;
  created_at: string;
  reply_to_id: number | null;
  edited_at: string | null;
};

type ContextMenu = {
  message: Message;
  x: number;
  y: number;
} | null;

export default function ChatPage() {
  const { profile } = useProfile();
  const timeFormat = profile?.time_format ?? '12h';
  const chatBg: MessageBg = (((profile as any)?.chat_bg) ?? 'plain') as MessageBg;
  const chatBgDark = isDarkBg(chatBg);
  const chatMetaColor = chatBgDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.4)';

  const [email, setEmail] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newBelow, setNewBelow] = useState(0);

  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  // Highlight: { id, key } — key forces a fresh render so the animation restarts
  const [highlight, setHighlight] = useState<{ id: number; key: number } | null>(null);

  const [contextMenu, setContextMenu] = useState<ContextMenu>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const initialLoadDone = useRef(false);

  // AUTH
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      const e = user?.email ?? null;
      setEmail(e);
      if (!e) {
        window.location.href = '/login';
      } else {
        setLoading(false);
        supabase
          .from('profiles')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', user!.id)
          .then(({ error }) => {
            if (error) console.error('last_seen update failed:', error);
          });
      }
    });
  }, []);

  // LOAD MESSAGES
  useEffect(() => {
    if (!email) return;
    supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(200)
      .then(({ data, error }) => {
        if (error) console.error(error);
        else {
          setMessages(data ?? []);
          setTimeout(() => {
            bottomRef.current?.scrollIntoView({ behavior: 'auto' });
            initialLoadDone.current = true;
          }, 80);
        }
      });
  }, [email]);

  // REALTIME
  useEffect(() => {
    if (!email) return;
    const channel = supabase
      .channel('messages-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const incoming = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
          if (isAtBottomRef.current) {
            setTimeout(() => {
              bottomRef.current?.scrollIntoView({
                behavior: initialLoadDone.current ? 'smooth' : 'auto',
              });
            }, 60);
          } else if (incoming.user_email !== email) {
            setNewBelow((c) => c + 1);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          const updated = payload.new as Message;
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? updated : m))
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload) => {
          const removed = payload.old as { id: number };
          setMessages((prev) => prev.filter((m) => m.id !== removed.id));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [email]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // SCROLL
  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    isAtBottomRef.current = atBottom;
    if (atBottom) setNewBelow(0);
  }

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setNewBelow(0);
  }

  // JUMP TO REPLY — fresh key every call so animation restarts
  function jumpToMessage(id: number) {
    const el = document.getElementById(`msg-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    // Trigger highlight with a new key — forces React to remount the overlay
    setHighlight({ id, key: Date.now() });
    setTimeout(() => {
      // Clear only if this is still the current highlight
      setHighlight((prev) => (prev && prev.id === id ? null : prev));
    }, 1600);
  }

  // SEND
  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || !email) return;
    setSending(true);
    setInput('');

    const tempId = -Date.now();
    const optimistic: Message = {
      id: tempId,
      user_email: email,
      content: text,
      created_at: new Date().toISOString(),
      reply_to_id: replyTo?.id ?? null,
      edited_at: null,
    };
    setMessages((prev) => [...prev, optimistic]);
    isAtBottomRef.current = true;
    setReplyTo(null);
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 60);

    const { data, error } = await supabase
      .from('messages')
      .insert({
        user_email: email,
        content: text,
        reply_to_id: optimistic.reply_to_id,
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(text);
      alert('⚠️ Failed to send: ' + error.message);
    } else if (data) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? (data as Message) : m))
      );
    }
    setSending(false);
  }

  // EDIT
  async function saveEdit(messageId: number) {
    const text = editText.trim();
    if (!text) {
      setEditingId(null);
      setEditText('');
      return;
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, content: text, edited_at: new Date().toISOString() }
          : m
      )
    );
    setEditingId(null);
    setEditText('');

    const { error } = await supabase
      .from('messages')
      .update({ content: text, edited_at: new Date().toISOString() })
      .eq('id', messageId);
    if (error) {
      console.error(error);
      alert('⚠️ Failed to edit: ' + error.message);
    }
  }

  // DELETE
  async function deleteMessage(messageId: number) {
    if (!confirm('Delete this message?')) return;
    const backup = messages;
    setMessages((prev) => prev.filter((m) => m.id !== messageId));

    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId);
    if (error) {
      console.error(error);
      setMessages(backup);
      alert('⚠️ Failed to delete: ' + error.message);
    }
  }

  // BG
  async function handleBgChange(bg: MessageBg) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('profiles').update({ chat_bg: bg }).eq('id', user.id);
  }

  // CONTEXT MENU
  function openContextMenu(message: Message, x: number, y: number) {
    const menuWidth = 180;
    const menuHeight = 180;
    const safeX = Math.min(x, window.innerWidth - menuWidth - 8);
    const safeY = Math.min(y, window.innerHeight - menuHeight - 8);
    setContextMenu({ message, x: safeX, y: safeY });
  }

  function handleRightClick(e: React.MouseEvent, message: Message) {
    e.preventDefault();
    openContextMenu(message, e.clientX, e.clientY);
  }

  function handleTouchStart(e: React.TouchEvent, message: Message) {
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

  // HELPERS
  function findMessageById(id: number | null): Message | null {
    if (id === null || id === undefined) return null;
    return messages.find((m) => m.id === id) ?? null;
  }

  function previewOf(text: string, max = 60): string {
    const t = text.trim();
    return t.length > max ? t.slice(0, max) + '…' : t;
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#1a0b2e] flex items-center justify-center text-white font-mono">
        loading...
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#1a0b2e] font-mono flex justify-center overflow-hidden">
      <div className="w-full max-w-3xl h-full flex flex-col p-3 sm:p-6 gap-3 sm:gap-4">

        {/* Header */}
        <div className="flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex size-10 sm:size-12 shrink-0 items-center justify-center rounded-2xl border-4 border-black shadow-brutal-sm"
              style={{ backgroundColor: '#E6E6FA', fontSize: '20px' }}
            >
              💬
            </div>
            <div className="min-w-0">
              <h1
                className="truncate font-black text-lg sm:text-2xl leading-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                squad chat
              </h1>
              <p
                className="text-[10px] sm:text-xs font-bold leading-tight"
                style={{ color: 'var(--text-secondary)' }}
              >
                the whole crew · {messages.length} message
                {messages.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <BgPickerButton current={chatBg} onChange={handleBgChange} />
            <Link
              href="/"
              className="inline-flex items-center border-4 border-black bg-[#E2F0D9] text-black font-black rounded-xl shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition"
              style={{ padding: '8px 16px', gap: '8px' }}
            >
              <span className="text-base leading-none">←</span>
              <span className="text-sm leading-none hidden sm:inline">back</span>
            </Link>
          </div>
        </div>

        {/* Chat container */}
        <div
          className="flex-1 min-h-0 flex flex-col border-4 border-black bg-white rounded-2xl overflow-hidden relative"
          style={{ boxShadow: '8px 8px 0px 0px rgba(0,0,0,1)' }}
        >
          {/* Messages area */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 min-h-0 overflow-y-auto"
            style={{ padding: '20px 20px 8px', ...getBgStyle(chatBg) }}
          >
            {messages.length === 0 && (
              <p className="text-black/50 text-center italic py-8 text-sm">
                no messages yet — say hi 👋
              </p>
            )}

            <div className="flex flex-col" style={{ gap: '4px' }}>
              {messages.map((m, i) => {
                const mine = m.user_email === email;
                const sender = m.user_email.split('@')[0];
                const prev = messages[i - 1];
                const isNewGroup = !prev || prev.user_email !== m.user_email;
                const time = new Date(m.created_at).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: timeFormat !== '24h',
                });
                const isEditing = editingId === m.id;
                const repliedTo = findMessageById(m.reply_to_id);
                const isHighlighted = highlight?.id === m.id;

                return (
                  <div
                    key={m.id}
                    id={`msg-${m.id}`}
                    className={`flex ${mine ? 'msg-mine' : 'msg-theirs'}`}
                    style={{
                      justifyContent: mine ? 'flex-end' : 'flex-start',
                      width: '100%',
                      marginTop: isNewGroup && i > 0 ? '14px' : '0',
                      scrollMarginTop: '80px',
                    }}
                  >
                    <div
                      className="flex flex-col"
                      style={{
                        maxWidth: '78%',
                        alignItems: mine ? 'flex-end' : 'flex-start',
                      }}
                    >
                      {isNewGroup && (
                        <div
                          className="msg-meta text-[10px] font-black uppercase tracking-wider"
                          style={{
                            color: chatMetaColor,
                            marginBottom: '6px',
                            paddingLeft: '4px',
                            paddingRight: '4px',
                            textShadow: chatBgDark ? '0 1px 2px rgba(0,0,0,0.8)' : 'none',
                          }}
                        >
                          {mine ? 'you' : sender} · {time}
                        </div>
                      )}

                      <div
                        onContextMenu={(e) => handleRightClick(e, m)}
                        onTouchStart={(e) => handleTouchStart(e, m)}
                        onTouchEnd={handleTouchEnd}
                        onTouchMove={handleTouchEnd}
                        className="inline-block border-2 border-black rounded-2xl cursor-pointer select-none"
                        style={{
                          padding: '9px 14px',
                          backgroundColor: mine ? '#E2F0D9' : '#FFD1DC',
                          boxShadow: '2px 2px 0px 0px rgba(0,0,0,1)',
                          minWidth: '80px',
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
                              borderRadius: 24,
                              background: 'rgba(255,245,186,0.55)',
                              pointerEvents: 'none',
                              boxShadow: '0 0 20px rgba(255,139,167,0.7)',
                              animation: 'msg-flash-fade 1.6s ease-out forwards',
                              zIndex: 10,
                            }}
                          />
                        )}

                        {/* Reply preview — clickable to jump */}
                        {repliedTo && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              jumpToMessage(repliedTo.id);
                            }}
                            className="rounded-lg border-l-4 border-black text-left w-full"
                            style={{
                              backgroundColor: 'rgba(0,0,0,0.08)',
                              padding: '3px 8px',
                              marginBottom: '5px',
                              cursor: 'pointer',
                              display: 'block',
                              maxWidth: '100%',
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
                              {repliedTo.user_email === email
                                ? 'you'
                                : repliedTo.user_email.split('@')[0]}
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
                          <div className="flex flex-col" style={{ gap: '6px', minWidth: '180px' }}>
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
                            <div className="flex" style={{ gap: '6px' }}>
                              <button
                                onClick={() => saveEdit(m.id)}
                                className="border-2 border-black rounded-lg font-black"
                                style={{ padding: '4px 12px', fontSize: '11px', backgroundColor: '#E2F0D9', color: '#000' }}
                              >
                                save
                              </button>
                              <button
                                onClick={() => { setEditingId(null); setEditText(''); }}
                                className="border-2 border-black rounded-lg font-black"
                                style={{ padding: '4px 12px', fontSize: '11px', backgroundColor: '#FFD1DC', color: '#000' }}
                              >
                                cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p
                            className="text-black m-0"
                            style={{
                              fontSize: '13.5px',
                              lineHeight: 1.4,
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
            </div>
            <div ref={bottomRef} style={{ height: '4px' }} />
          </div>

          {/* New messages pill */}
          {newBelow > 0 && (
            <button
              onClick={scrollToBottom}
              className="absolute border-2 border-black bg-[#FF8BA7] text-black font-black rounded-full transition hover:-translate-y-0.5 active:translate-y-0.5"
              style={{
                bottom: replyTo ? '160px' : '76px',
                left: '50%',
                transform: 'translateX(-50%)',
                padding: '6px 14px',
                fontSize: '11px',
                boxShadow: '3px 3px 0 0 black',
                zIndex: 5,
                animation: 'fade-up 0.25s ease-out both',
              }}
            >
              ↓ {newBelow} new message{newBelow > 1 ? 's' : ''}
            </button>
          )}

          {/* Reply preview bar */}
          {replyTo && (
            <div
              className="border-t-4 border-black flex items-center"
              style={{ backgroundColor: '#FFF5BA', padding: '8px 12px', gap: '10px', flexShrink: 0 }}
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
                  replying to {replyTo.user_email === email ? 'yourself' : replyTo.user_email.split('@')[0]}
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
                className="border-2 border-black bg-[#FFD1DC] text-black font-black rounded-lg shrink-0"
                style={{ width: '28px', height: '28px', lineHeight: 1, fontSize: '13px' }}
                aria-label="Cancel reply"
              >
                ✕
              </button>
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={handleSend}
            className="border-t-4 border-black bg-[#E6E6FA] flex shrink-0 items-stretch"
            style={{ padding: '12px', gap: '10px' }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="type a message..."
              disabled={sending}
              className="flex-1 min-w-0 border-2 border-black rounded-lg bg-white text-black text-sm focus:outline-none disabled:opacity-50"
              style={{ padding: '11px 16px' }}
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="inline-flex items-center border-2 border-black bg-[#E2F0D9] text-black text-xs font-black rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition disabled:opacity-50 disabled:hover:translate-y-0 shrink-0"
              style={{ padding: '11px 18px', gap: '8px' }}
            >
              <span className="text-sm leading-none">{sending ? '···' : '▶'}</span>
              <span className="leading-none tracking-wider hidden sm:inline">
                {sending ? 'SENDING' : 'SEND'}
              </span>
            </button>
          </form>
        </div>
      </div>

      {/* Context Menu */}
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
            onClick={() => { setReplyTo(contextMenu.message); closeContextMenu(); }}
            className="text-left font-black rounded-lg hover:bg-[#E2F0D9] transition"
            style={{ padding: '8px 12px', fontSize: '12px', color: '#000', border: 'none', background: 'transparent', cursor: 'pointer' }}
          >
            ↩️ reply
          </button>

          {contextMenu.message.user_email === email && (
            <>
              <button
                onClick={() => {
                  setEditingId(contextMenu.message.id);
                  setEditText(contextMenu.message.content);
                  closeContextMenu();
                }}
                className="text-left font-black rounded-lg hover:bg-[#E2F0D9] transition"
                style={{ padding: '8px 12px', fontSize: '12px', color: '#000', border: 'none', background: 'transparent', cursor: 'pointer' }}
              >
                ✎ edit
              </button>
              <button
                onClick={() => {
                  const id = contextMenu.message.id;
                  closeContextMenu();
                  deleteMessage(id);
                }}
                className="text-left font-black rounded-lg hover:bg-[#FFD1DC] transition"
                style={{ padding: '8px 12px', fontSize: '12px', color: '#C2185B', border: 'none', background: 'transparent', cursor: 'pointer' }}
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
            className="text-left font-black rounded-lg hover:bg-[#E6E6FA] transition"
            style={{ padding: '8px 12px', fontSize: '12px', color: '#000', border: 'none', background: 'transparent', cursor: 'pointer' }}
          >
            📋 copy
          </button>
        </div>
      )}
    </div>
  );
}