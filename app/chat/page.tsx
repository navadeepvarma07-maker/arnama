'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Message = {
  id: string;
  user_email: string;
  content: string;
  created_at: string;
};

export default function ChatPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const e = data.user?.email ?? null;
      setEmail(e);
      if (!e) window.location.href = '/login';
      else setLoading(false);
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
        else setMessages(data ?? []);
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
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [email]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      <div className="min-h-screen bg-[#1a0b2e] flex items-center justify-center text-white font-mono">
        loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a0b2e] p-4 sm:p-6 font-mono flex flex-col">
      <div className="w-full max-w-2xl mx-auto flex flex-col flex-1 min-h-0 gap-4">

        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <h1 className="text-xl sm:text-2xl font-black text-white">💬 squad chat</h1>
          <Link
            href="/"
            className="inline-flex items-center border-4 border-black bg-[#E2F0D9] text-black font-black rounded-xl shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:shadow-[7px_7px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition"
            style={{ padding: '10px 20px', gap: '10px' }}
          >
            <span className="text-base leading-none">←</span>
            <span className="text-sm leading-none">back</span>
          </Link>
        </div>

        {/* Messages window */}
        <div className="border-4 border-black bg-white rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col flex-1 min-h-0 overflow-hidden">

          {/* Scrollable message list */}
          <div className="overflow-y-auto flex-1" style={{ padding: '20px 24px' }}>
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
                const time = new Date(m.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={m.id}
                    className="flex"
                    style={{
                      justifyContent: mine ? 'flex-end' : 'flex-start',
                      width: '100%',
                      marginTop: isNewGroup && i > 0 ? '12px' : '0',
                    }}
                  >
                    <div
                      className="flex flex-col"
                      style={{
                        maxWidth: '75%',
                        alignItems: mine ? 'flex-end' : 'flex-start',
                      }}
                    >
                      {isNewGroup && (
                        <div
                          className="text-[10px] font-black uppercase tracking-wider text-black/40"
                          style={{
                            marginBottom: '6px',
                            paddingLeft: '4px',
                            paddingRight: '4px',
                          }}
                        >
                          {mine ? 'you' : sender} · {time}
                        </div>
                      )}
                      <div
                        className={`inline-block border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] rounded-2xl ${
                          mine ? 'bg-[#E2F0D9]' : 'bg-[#FFD1DC]'
                        }`}
                        style={{ padding: '10px 16px' }}
                      >
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
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
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
              className="inline-flex items-center border-2 border-black bg-[#E2F0D9] text-black text-xs font-black rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] transition disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] shrink-0"
              style={{ padding: '11px 18px', gap: '8px' }}
            >
              <span className="text-sm leading-none">{sending ? '···' : '▶'}</span>
              <span className="leading-none tracking-wider">
                {sending ? 'SENDING' : 'SEND'}
              </span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}