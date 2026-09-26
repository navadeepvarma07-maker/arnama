'use client';

import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';

type AnyMsg = {
  id: number | string;
  user_email?: string;
  sender_email?: string;
  content: string;
  created_at: string;
};

type Props = {
  messages: AnyMsg[];
  myEmail: string;
  timeFormat?: string;
  onJump: (id: number | string) => void;
  onClose: () => void;
};

function formatTime(iso: string, timeFormat: string = '12h') {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: timeFormat !== '24h',
  });
}

function emailOf(m: AnyMsg): string {
  return m.user_email ?? m.sender_email ?? '';
}

export function MessageSearch({
  messages,
  myEmail,
  timeFormat = '12h',
  onJump,
  onClose,
}: Props) {
  const [q, setQ] = useState('');

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return messages
      .filter((m) => {
        if (!m.content) return false;
        if (m.content.startsWith('[VOICE]')) return false;
        return m.content.toLowerCase().includes(needle);
      })
      .slice()
      .reverse()
      .slice(0, 60);
  }, [q, messages]);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(26,11,46,0.65)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          zIndex: 1400,
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          width: 'min(500px, calc(100vw - 24px))',
          maxHeight: 'calc(100vh - 60px)',
          background: `
            linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
            rgba(255,253,245,0.98)
          `,
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '4px solid black',
          borderRadius: '22px',
          boxShadow: '10px 10px 0 0 black',
          zIndex: 1401,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 14px',
            borderBottom: '4px solid black',
            background: '#FFF5BA',
          }}
        >
          <Search className="size-4" strokeWidth={3} />
          <p style={{ margin: 0, fontSize: '13px', fontWeight: 900, color: '#000', flex: 1 }}>
            search messages
          </p>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: '28px',
              height: '28px',
              border: '2px solid black',
              borderRadius: '999px',
              background: '#FFD1DC',
              color: '#000',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X className="size-3" strokeWidth={3} />
          </button>
        </div>

        <div style={{ padding: '10px 14px', borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="type to search..."
            autoFocus
            style={{
              width: '100%',
              border: '2px solid black',
              borderRadius: '14px',
              background: '#FFFDF5',
              color: '#000',
              fontSize: '14px',
              padding: '11px 14px',
              outline: 'none',
              fontWeight: 700,
            }}
          />
          {q.trim().length > 0 && (
            <p
              style={{
                margin: '8px 0 0',
                fontSize: '10px',
                fontWeight: 800,
                color: 'rgba(0,0,0,0.5)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              {results.length} match{results.length === 1 ? '' : 'es'}
            </p>
          )}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px' }}>
          {q.trim().length === 0 ? (
            <div style={{ padding: '30px 16px', textAlign: 'center' }}>
              <p style={{ fontSize: '32px', margin: 0, marginBottom: '8px' }}>🔍</p>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 800, color: 'rgba(0,0,0,0.5)' }}>
                find a message by typing
              </p>
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: '30px 16px', textAlign: 'center' }}>
              <p style={{ fontSize: '32px', margin: 0, marginBottom: '8px' }}>🤷</p>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 800, color: 'rgba(0,0,0,0.5)' }}>
                nothing matches &quot;{q}&quot;
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {results.map((m) => {
                const msgEmail = emailOf(m);
                const mine = msgEmail === myEmail;
                const name = mine
                  ? 'you'
                  : msgEmail
                  ? msgEmail.split('@')[0]
                  : 'unknown';
                return (
                  <button
                    key={String(m.id)}
                    onClick={() => {
                      onJump(m.id);
                      onClose();
                    }}
                    style={{
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      padding: '10px 12px',
                      border: '2px solid black',
                      borderRadius: '14px',
                      background: mine
                        ? 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #E2F0D9'
                        : 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFD1DC',
                      boxShadow: '2px 2px 0 0 black',
                      cursor: 'pointer',
                      width: '100%',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '8px',
                        width: '100%',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 900,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: 'rgba(0,0,0,0.6)',
                        }}
                      >
                        {name}
                      </span>
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          color: 'rgba(0,0,0,0.4)',
                        }}
                      >
                        {formatTime(m.created_at, timeFormat)}
                      </span>
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '13px',
                        color: '#000',
                        lineHeight: 1.4,
                        wordBreak: 'break-word',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {m.content}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}