'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/lib/use-profile';

type Message = {
  id: string;
  user_email: string;
  content: string;
  created_at: string;
};

export default function ChatPage() {
  const { profile } = useProfile();
  const timeFormat = profile?.time_format ?? '12h';

  const [email, setEmail] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newBelow, setNewBelow] = useState(0);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const initialLoadDone = useRef(false);

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
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [email]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    isAtBottomRef.current = atBottom;
    if (atBottom) setNewBelow(0);
  }

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setNewBelow(0);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || !email) return;
    setSending(true);
    setInput('');

    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      user_email: email,
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    isAtBottomRef.current = true;
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 60);

    const { data, error } = await supabase
      .from('messages')
      .insert({ user_email: email, content: text })
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
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontWeight: 800,
        }}
      >
        loading...
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--bg-app, #1a0b2e)',
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
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
          gap: '18px',
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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              minWidth: 0,
            }}
          >
            {/* Oval avatar */}
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
              💬
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
                squad chat
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
                🐶 the whole crew · {messages.length} messages 🐱
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

        {/* ===== CHAT CONTAINER ===== */}
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
            position: 'relative',
          }}
        >
          {/* Scrollable messages */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: '24px 20px 8px',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {messages.length === 0 && (
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
                    textAlign: 'center',
                    fontStyle: 'italic',
                    color: 'rgba(0,0,0,0.5)',
                    fontSize: '13px',
                    margin: 0,
                  }}
                >
                  no messages yet — say hi 👋
                </p>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              {messages.map((m, i) => {
                const mine = m.user_email === email;
                const sender = m.user_email.split('@')[0];
                const prev = messages[i - 1];
                const isNewGroup =
                  !prev || prev.user_email !== m.user_email;
                const time = new Date(m.created_at).toLocaleTimeString(
                  'en-IN',
                  {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: timeFormat !== '24h',
                  }
                );

                return (
                  <div
                    key={m.id}
                    className={mine ? 'msg-mine' : 'msg-theirs'}
                    style={{
                      display: 'flex',
                      justifyContent: mine ? 'flex-end' : 'flex-start',
                      width: '100%',
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
                          {mine ? 'you' : sender} · {time}
                        </div>
                      )}
                      <div
                        style={{
                          display: 'inline-block',
                          border: '2px solid black',
                          borderRadius: mine
                            ? '24px 24px 6px 24px'
                            : '24px 24px 24px 6px',
                          padding: '10px 16px',
                          backgroundColor: mine ? '#E2F0D9' : '#FFD1DC',
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
              <div ref={bottomRef} style={{ height: '4px' }} />
            </div>
          </div>

          {/* New messages pill */}
          {newBelow > 0 && (
            <button
              onClick={scrollToBottom}
              style={{
                position: 'absolute',
                bottom: '92px',
                left: '50%',
                transform: 'translateX(-50%)',
                padding: '8px 18px',
                border: '3px solid black',
                borderRadius: '999px',
                backgroundColor: '#FF8BA7',
                color: '#000',
                fontWeight: 900,
                fontSize: '11px',
                boxShadow: '3px 3px 0 0 black',
                zIndex: 5,
                cursor: 'pointer',
                animation: 'fade-up 0.25s ease-out both',
              }}
            >
              ↓ {newBelow} new message{newBelow > 1 ? 's' : ''}
            </button>
          )}

          {/* Input bar */}
          <form
            onSubmit={handleSend}
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
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="type a message..."
              disabled={sending}
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
                opacity: sending ? 0.5 : 1,
                fontWeight: 600,
              }}
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
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
                  sending || !input.trim() ? 'not-allowed' : 'pointer',
                opacity: sending || !input.trim() ? 0.5 : 1,
                flexShrink: 0,
                transition:
                  'transform 0.15s ease, box-shadow 0.15s ease',
              }}
            >
              <span
                className="animate-purr"
                style={{ fontSize: '17px', lineHeight: 1 }}
              >
                🐱
              </span>
              <span style={{ letterSpacing: '0.06em' }}>
                {sending ? '...' : 'SEND'}
              </span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}