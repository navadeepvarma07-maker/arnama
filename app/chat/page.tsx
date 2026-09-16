'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useProfile, displayLabel, initialsFor } from '@/lib/use-profile';
import { BgPickerButton, getBgStyle, isDarkBg, MessageBg } from '@/components/message-bg';
import { SwipeCarousel } from '@/components/arnama/swipe-carousel';

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

type CrewProfile = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_color: string;
};

const AVATAR_COLORS = ['#E2F0D9', '#FFD1DC', '#E6E6FA', '#FFF5BA', '#D4F0F0'];

export default function ChatPage() {
  const { profile } = useProfile();
  const timeFormat = profile?.time_format ?? '12h';
  const chatBg: MessageBg = (((profile as any)?.chat_bg) ??
    'plain') as MessageBg;
  const chatBgDark = isDarkBg(chatBg);
  const chatMetaColor = chatBgDark
    ? 'rgba(255,255,255,0.65)'
    : 'rgba(0,0,0,0.4)';

  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newBelow, setNewBelow] = useState(0);

  // Slides: 0 = chat, 1 = crew, 2 = pulse
  const [tabIndex, setTabIndex] = useState(0);

  // Reply / Edit
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  // Highlight
  const [highlight, setHighlight] = useState<{ id: number; key: number } | null>(
    null
  );

  // Context menu
  const [contextMenu, setContextMenu] = useState<ContextMenu>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const initialLoadDone = useRef(false);

  // Crew slide
  const [crewProfiles, setCrewProfiles] = useState<CrewProfile[]>([]);
  const [crewOnlineIds, setCrewOnlineIds] = useState<string[]>([]);
  const [crewCounts, setCrewCounts] = useState<Record<string, number>>({});
  const [crewLoading, setCrewLoading] = useState(true);

  // Pulse slide
  const [pulseTotal, setPulseTotal] = useState(0);
  const [pulseToday, setPulseToday] = useState(0);
  const [pulseWeek, setPulseWeek] = useState(0);
  const [pulseTopSender, setPulseTopSender] = useState<{
    email: string;
    count: number;
  } | null>(null);
  const [pulseBusiestHour, setPulseBusiestHour] = useState<number | null>(null);
  const [pulseLoading, setPulseLoading] = useState(true);

  // =========================
  // AUTH
  // =========================
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      const e = user?.email ?? null;
      setEmail(e);
      setUserId(user?.id ?? null);
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

  // =========================
  // LOAD MESSAGES
  // =========================
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

  // =========================
  // REALTIME MESSAGES
  // =========================
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

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // =========================
  // CREW DATA
  // =========================
  useEffect(() => {
    if (!email) return;
    Promise.all([
      supabase
        .from('profiles')
        .select('id, email, display_name, avatar_color')
        .order('email', { ascending: true }),
      supabase.from('messages').select('user_email'),
    ]).then(([pRes, mRes]) => {
      if (pRes.error) console.error(pRes.error);
      else setCrewProfiles((pRes.data ?? []) as CrewProfile[]);

      if (mRes.error) console.error(mRes.error);
      else {
        const counts: Record<string, number> = {};
        (mRes.data ?? []).forEach((m: any) => {
          counts[m.user_email] = (counts[m.user_email] ?? 0) + 1;
        });
        setCrewCounts(counts);
      }
      setCrewLoading(false);
    });
  }, [email]);

  // Crew presence
  useEffect(() => {
    if (!userId || !email) return;
    const ch = supabase.channel('chat-crew-presence', {
      config: { presence: { key: userId } },
    });
    ch.on('presence', { event: 'sync' }, () => {
      setCrewOnlineIds(Object.keys(ch.presenceState()));
    }).subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ user_id: userId, email });
      }
    });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, email]);

  // =========================
  // PULSE DATA (accurate)
  // =========================
  useEffect(() => {
    if (!email) return;

    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    const sevenDaysAgo = startOfDay - 6 * 24 * 60 * 60 * 1000;

    Promise.all([
      // 1. Total count — exact, no limit
      supabase.from('messages').select('*', { count: 'exact', head: true }),
      // 2. Recent messages (last 7 days) for daily/weekly/top/hour stats
      supabase
        .from('messages')
        .select('user_email, created_at')
        .gte('created_at', new Date(sevenDaysAgo).toISOString())
        .order('created_at', { ascending: false })
        .limit(2000),
    ]).then(([totalRes, recentRes]) => {
      if (typeof totalRes.count === 'number') {
        setPulseTotal(totalRes.count);
      }

      if (recentRes.error) {
        console.error(recentRes.error);
        setPulseLoading(false);
        return;
      }

      const rows = recentRes.data ?? [];
      let today = 0;
      const bySender: Record<string, number> = {};
      const byHour: number[] = new Array(24).fill(0);

      rows.forEach((r: any) => {
        const t = new Date(r.created_at).getTime();
        if (t >= startOfDay) today++;
        bySender[r.user_email] = (bySender[r.user_email] ?? 0) + 1;
        const h = new Date(r.created_at).getHours();
        byHour[h]++;
      });

      setPulseToday(today);
      setPulseWeek(rows.length);

      const top = Object.entries(bySender).sort((a, b) => b[1] - a[1])[0];
      if (top) setPulseTopSender({ email: top[0], count: top[1] });

      if (rows.length > 0) {
        const busiest = byHour.indexOf(Math.max(...byHour));
        setPulseBusiestHour(busiest);
      }

      setPulseLoading(false);
    });
  }, [email]);

  // =========================
  // SCROLL
  // =========================
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

  // =========================
  // JUMP TO REPLY
  // =========================
  function jumpToMessage(id: number) {
    const el = document.getElementById(`msg-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlight({ id, key: Date.now() });
    setTimeout(() => {
      setHighlight((prev) => (prev && prev.id === id ? null : prev));
    }, 1600);
  }

  // =========================
  // SEND
  // =========================
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

  // =========================
  // EDIT
  // =========================
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

  // =========================
  // DELETE
  // =========================
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

  // =========================
  // BG
  // =========================
  async function handleBgChange(bg: MessageBg) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('profiles').update({ chat_bg: bg }).eq('id', user.id);
  }

  // =========================
  // CONTEXT MENU
  // =========================
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
    longPressTimer.current = setTimeout(() => {
      openContextMenu(message, touch.clientX, touch.clientY);
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

  // =========================
  // HELPERS
  // =========================
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

  // ====================================
  // SLIDE 1: CHAT
  // ====================================
  const chatSlide = (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        padding: '0 4px',
      }}
    >
      <div
        className="flex-1 min-h-0 flex flex-col border-4 border-black bg-white rounded-2xl overflow-hidden relative"
        style={{ boxShadow: '8px 8px 0px 0px rgba(0,0,0,1)' }}
      >
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
                          textShadow: chatBgDark
                            ? '0 1px 2px rgba(0,0,0,0.8)'
                            : 'none',
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
                        <div
                          className="flex flex-col"
                          style={{ gap: '6px', minWidth: '180px' }}
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
                          <div className="flex" style={{ gap: '6px' }}>
                            <button
                              onClick={() => saveEdit(m.id)}
                              className="border-2 border-black rounded-lg font-black"
                              style={{
                                padding: '4px 12px',
                                fontSize: '11px',
                                backgroundColor: '#E2F0D9',
                                color: '#000',
                              }}
                            >
                              save
                            </button>
                            <button
                              onClick={() => {
                                setEditingId(null);
                                setEditText('');
                              }}
                              className="border-2 border-black rounded-lg font-black"
                              style={{
                                padding: '4px 12px',
                                fontSize: '11px',
                                backgroundColor: '#FFD1DC',
                                color: '#000',
                              }}
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
            style={{
              backgroundColor: '#FFF5BA',
              padding: '8px 12px',
              gap: '10px',
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
                replying to{' '}
                {replyTo.user_email === email
                  ? 'yourself'
                  : replyTo.user_email.split('@')[0]}
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
              style={{
                width: '28px',
                height: '28px',
                lineHeight: 1,
                fontSize: '13px',
              }}
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
            <span className="text-sm leading-none">
              {sending ? '···' : '▶'}
            </span>
            <span className="leading-none tracking-wider hidden sm:inline">
              {sending ? 'SENDING' : 'SEND'}
            </span>
          </button>
        </form>
      </div>
    </div>
  );

  // ====================================
  // SLIDE 2: CREW
  // ====================================
  const crewSlide = (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: '0 4px 16px',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {/* Header card */}
        <div
          style={{
            border: '4px solid black',
            borderRadius: '22px',
            background: `
              linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
              rgba(230,230,250,0.92)
            `,
            backdropFilter: 'blur(14px) saturate(160%)',
            WebkitBackdropFilter: 'blur(14px) saturate(160%)',
            padding: '16px',
            boxShadow: `
              6px 6px 0 0 black,
              inset 0 1px 0 rgba(255,255,255,0.7)
            `,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: '11px',
                fontWeight: 900,
                color: '#000',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              👥 in the portal
            </p>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: '22px',
                fontWeight: 900,
                color: '#000',
                lineHeight: 1,
              }}
            >
              {crewOnlineIds.length}
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 800,
                  color: 'rgba(0,0,0,0.5)',
                  marginLeft: '6px',
                }}
              >
                online
              </span>
            </p>
          </div>
          <span
            className="gloss-shine"
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '999px',
              border: '4px solid black',
              background: `
                linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
                #E2F0D9
              `,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              boxShadow: '3px 3px 0 0 black',
              flexShrink: 0,
            }}
          >
            🟢
          </span>
        </div>

        {/* Crew list */}
        {crewLoading ? (
          <p
            style={{
              textAlign: 'center',
              color: 'rgba(255,253,245,0.5)',
              fontSize: '12px',
              padding: '30px 0',
              fontWeight: 700,
              margin: 0,
            }}
          >
            loading crew...
          </p>
        ) : (
          [...crewProfiles]
            .sort((a, b) => {
              const aOn = crewOnlineIds.includes(a.id);
              const bOn = crewOnlineIds.includes(b.id);
              if (aOn !== bOn) return aOn ? -1 : 1;
              const aCount = crewCounts[a.email] ?? 0;
              const bCount = crewCounts[b.email] ?? 0;
              return bCount - aCount;
            })
            .map((p, i) => {
              const isOnline = crewOnlineIds.includes(p.id);
              const isMe = p.id === userId;
              const label = displayLabel(p.email, p.display_name);
              const initials = initialsFor(p.email, p.display_name);
              const avatarBg =
                p.avatar_color || AVATAR_COLORS[i % AVATAR_COLORS.length];
              const count = crewCounts[p.email] ?? 0;

              return (
                <div
                  key={p.id}
                  style={{
                    border: '4px solid black',
                    borderRadius: '22px',
                    background: `
                      linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
                      #FFFDF5
                    `,
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    boxShadow: '4px 4px 0 0 black',
                  }}
                >
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div
                      className="gloss-shine"
                      style={{
                        width: '48px',
                        height: '48px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '999px',
                        border: '3px solid black',
                        background: `
                          linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
                          ${avatarBg}
                        `,
                        fontWeight: 900,
                        fontSize: '13px',
                        color: '#000',
                      }}
                    >
                      {initials}
                    </div>
                    <span
                      style={{
                        position: 'absolute',
                        bottom: '-2px',
                        right: '-2px',
                        width: '16px',
                        height: '16px',
                        borderRadius: '999px',
                        border: '3px solid black',
                        backgroundColor: isOnline ? '#7FB89B' : '#D8D0C0',
                      }}
                    />
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
                      {isMe ? `${label} (you)` : label}
                    </p>
                    <p
                      style={{
                        margin: '3px 0 0',
                        fontSize: '10px',
                        fontWeight: 800,
                        color: isOnline ? '#3A7A5E' : 'rgba(0,0,0,0.45)',
                      }}
                    >
                      {isOnline ? 'in the portal' : 'away'} · {count}{' '}
                      message{count === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
              );
            })
        )}
      </div>
    </div>
  );

  // ====================================
  // SLIDE 3: PULSE
  // ====================================
  const pulseSlide = (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: '0 4px 16px',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {pulseLoading ? (
        <p
          style={{
            textAlign: 'center',
            color: 'rgba(255,253,245,0.5)',
            fontSize: '12px',
            padding: '40px 0',
            fontWeight: 700,
            margin: 0,
          }}
        >
          loading pulse...
        </p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '12px',
          }}
        >
          <StatCard
            emoji="💬"
            label="total"
            value={pulseTotal.toString()}
            color="#E2F0D9"
          />
          <StatCard
            emoji="🔥"
            label="today"
            value={pulseToday.toString()}
            color="#FFD1DC"
          />
          <StatCard
            emoji="📅"
            label="last 7 days"
            value={pulseWeek.toString()}
            color="#FFF5BA"
          />
          <StatCard
            emoji="⏰"
            label="busiest hour"
            value={
              pulseBusiestHour === null
                ? '—'
                : formatHour(pulseBusiestHour)
            }
            color="#D4F0F0"
          />

          {/* Top sender — full width */}
          <div style={{ gridColumn: '1 / -1' }}>
            {pulseTopSender ? (
              <div
                style={{
                  border: '4px solid black',
                  borderRadius: '22px',
                  background: `
                    linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
                    rgba(230,230,250,0.92)
                  `,
                  backdropFilter: 'blur(14px) saturate(160%)',
                  WebkitBackdropFilter: 'blur(14px) saturate(160%)',
                  padding: '18px 20px',
                  boxShadow: `
                    6px 6px 0 0 black,
                    inset 0 1px 0 rgba(255,255,255,0.7)
                  `,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                }}
              >
                <span
                  className="gloss-shine"
                  style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '999px',
                    border: '4px solid black',
                    background: `
                      linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
                      #FF8BA7
                    `,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '22px',
                    boxShadow: '3px 3px 0 0 black',
                    flexShrink: 0,
                  }}
                >
                  👑
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '10px',
                      fontWeight: 900,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'rgba(0,0,0,0.5)',
                    }}
                  >
                    top talker · last 7 days
                  </p>
                  <p
                    style={{
                      margin: '4px 0 0',
                      fontSize: '16px',
                      fontWeight: 900,
                      color: '#000',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {pulseTopSender.email.split('@')[0]}
                  </p>
                  <p
                    style={{
                      margin: '2px 0 0',
                      fontSize: '11px',
                      fontWeight: 800,
                      color: 'rgba(0,0,0,0.55)',
                    }}
                  >
                    {pulseTopSender.count} messages
                  </p>
                </div>
              </div>
            ) : (
              <div
                style={{
                  border: '4px solid black',
                  borderRadius: '22px',
                  background: '#FFFDF5',
                  padding: '30px 20px',
                  boxShadow: '6px 6px 0 0 black',
                  textAlign: 'center',
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontWeight: 800,
                    fontSize: '13px',
                    color: '#000',
                  }}
                >
                  no messages yet — say something!
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  function formatHour(h: number): string {
    if (h === 0) return '12 AM';
    if (h < 12) return `${h} AM`;
    if (h === 12) return '12 PM';
    return `${h - 12} PM`;
  }

  return (
    <div className="fixed inset-0 bg-[#1a0b2e] font-mono flex justify-center overflow-hidden">
      <div
        className="w-full max-w-3xl h-full flex flex-col p-3 sm:p-6 gap-3 sm:gap-4"
        style={{ minHeight: 0 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="gloss-shine flex size-10 sm:size-12 shrink-0 items-center justify-center rounded-2xl border-4 border-black"
              style={{
                background: `
                  linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
                  #E6E6FA
                `,
                fontSize: '20px',
              }}
            >
              💬
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-black text-lg sm:text-2xl leading-tight text-white">
                squad chat
              </h1>
              <p className="text-[10px] sm:text-xs font-bold leading-tight text-white/60">
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
              <span className="text-sm leading-none hidden sm:inline">
                back
              </span>
            </Link>
          </div>
        </div>

        {/* CAROUSEL: chat ↔ crew ↔ pulse */}
        <SwipeCarousel
          mode="fill"
          index={tabIndex}
          onIndexChange={setTabIndex}
          labels={['💬 chat', '👥 crew', '📊 pulse']}
          slides={[chatSlide, crewSlide, pulseSlide]}
        />
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
            onClick={() => {
              setReplyTo(contextMenu.message);
              closeContextMenu();
            }}
            className="text-left font-black rounded-lg hover:bg-[#E2F0D9] transition"
            style={{
              padding: '8px 12px',
              fontSize: '12px',
              color: '#000',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
            }}
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
                style={{
                  padding: '8px 12px',
                  fontSize: '12px',
                  color: '#000',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
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
                className="text-left font-black rounded-lg hover:bg-[#FFD1DC] transition"
                style={{
                  padding: '8px 12px',
                  fontSize: '12px',
                  color: '#C2185B',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              >
                ✕ delete
              </button>
            </>
          )}

          <button
            onClick={() => {
              navigator.clipboard
                .writeText(contextMenu.message.content)
                .catch(() => {});
              closeContextMenu();
            }}
            className="text-left font-black rounded-lg hover:bg-[#E6E6FA] transition"
            style={{
              padding: '8px 12px',
              fontSize: '12px',
              color: '#000',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            📋 copy
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({
  emoji,
  label,
  value,
  color,
}: {
  emoji: string;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      style={{
        border: '4px solid black',
        borderRadius: '22px',
        background: `
          linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
          ${color}
        `,
        padding: '16px',
        boxShadow: `
          5px 5px 0 0 black,
          inset 0 1px 0 rgba(255,255,255,0.7)
        `,
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        minHeight: '110px',
      }}
    >
      <span style={{ fontSize: '22px', lineHeight: 1 }}>{emoji}</span>
      <p
        style={{
          margin: 0,
          fontSize: '10px',
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'rgba(0,0,0,0.5)',
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: 0,
          fontSize: '22px',
          fontWeight: 900,
          color: '#000',
          lineHeight: 1,
        }}
      >
        {value}
      </p>
    </div>
  );
}