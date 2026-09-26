'use client';

import { Mic, MicOff, VolumeX, RefreshCw, Bell } from 'lucide-react';
import { initialsFor } from '@/lib/use-profile';

type Participant = {
  id: string;
  email: string;
  speaking: boolean;
  hasAudio: boolean;
  connected: boolean;
  iceState: string;
  connState: string;
  audioLevel: number;
};

type Props = {
  micOn: boolean;
  toggleMic: () => void;
  participants: Participant[];
  connected: boolean;
  error: string;
  myEmail: string | null;
  mutedPeers: Set<string>;
  togglePeerMute: (id: string) => void;
  debug?: string;
  onRetry?: () => void;
  onTestTone?: () => void;
  ctxState?: string;
};

const AVATAR_COLORS = ['#E2F0D9', '#FFD1DC', '#E6E6FA', '#FFF5BA', '#D4F0F0'];

export function VoiceChatBar({
  micOn,
  toggleMic,
  participants,
  connected,
  error,
  myEmail,
  mutedPeers,
  togglePeerMute,
  debug,
  onRetry,
  onTestTone,
  ctxState,
}: Props) {
  const totalInRoom = participants.length + (connected && myEmail ? 1 : 0);
  const anyFailed = participants.some(
    (p) => p.connState === 'failed' || p.connState === 'disconnected'
  );

  return (
    <div
      className="border-4 border-black shrink-0"
      style={{
        borderRadius: '18px',
        background: `linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%), #D4F0F0`,
        padding: '10px 12px',
        boxShadow: '4px 4px 0 0 black',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          onClick={toggleMic}
          disabled={!!error}
          aria-label={micOn ? 'Mute mic' : 'Unmute mic'}
          title={error || (micOn ? 'tap to mute' : 'tap to speak')}
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '999px',
            border: '3px solid black',
            background: error
              ? '#FFD1DC'
              : micOn
              ? `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #7FE5A5`
              : `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFFDF5`,
            color: '#000',
            cursor: error ? 'not-allowed' : 'pointer',
            boxShadow: '3px 3px 0 0 black',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            opacity: error ? 0.6 : 1,
            position: 'relative',
          }}
        >
          {micOn ? (
            <Mic className="size-5" strokeWidth={2.75} />
          ) : (
            <MicOff className="size-5" strokeWidth={2.75} />
          )}
          {micOn && (
            <span
              style={{
                position: 'absolute',
                inset: '-4px',
                borderRadius: '999px',
                border: '2px solid #3A7A5E',
                animation: 'voice-pulse 1.4s ease-in-out infinite',
                pointerEvents: 'none',
              }}
            />
          )}
        </button>

        <div style={{ minWidth: 0, flexShrink: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: '10px',
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'rgba(0,0,0,0.55)',
            }}
          >
            voice
          </p>
          <p style={{ margin: '2px 0 0', fontSize: '13px', fontWeight: 900, color: '#000' }}>
            {error ? '—' : totalInRoom}
          </p>
        </div>

        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            gap: '8px',
            overflowX: 'auto',
            paddingBottom: '2px',
          }}
        >
          {error ? (
            <p
              style={{
                margin: 0,
                fontSize: '11px',
                fontWeight: 800,
                color: '#C2185B',
                alignSelf: 'center',
              }}
            >
              ⚠️ {error}
            </p>
          ) : (
            <>
              {myEmail && (
                <ParticipantChip
                  email={myEmail}
                  speaking={micOn && participants.length >= 0}
                  mine
                  muted={!micOn}
                  color={AVATAR_COLORS[0]}
                  audioLevel={0}
                />
              )}
              {participants.map((p, i) => (
                <ParticipantChip
                  key={p.id}
                  email={p.email}
                  speaking={p.speaking}
                  muted={mutedPeers.has(p.id)}
                  onToggleMute={() => togglePeerMute(p.id)}
                  color={AVATAR_COLORS[(i + 1) % AVATAR_COLORS.length]}
                  iceState={p.iceState}
                  connState={p.connState}
                  hasAudio={p.hasAudio}
                  audioLevel={p.audioLevel}
                />
              ))}
            </>
          )}
        </div>

        {onTestTone && (
          <button
            onClick={onTestTone}
            title="Play test tone (check speakers)"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '999px',
              border: '2px solid black',
              background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #D4F0F0`,
              color: '#000',
              boxShadow: '2px 2px 0 0 black',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Bell className="size-4" strokeWidth={2.75} />
          </button>
        )}

        {anyFailed && onRetry && (
          <button
            onClick={onRetry}
            title="retry connection"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '999px',
              border: '2px solid black',
              background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFF5BA`,
              color: '#000',
              boxShadow: '2px 2px 0 0 black',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <RefreshCw className="size-4" strokeWidth={2.75} />
          </button>
        )}
      </div>

      {(debug || ctxState) && (
        <p
          style={{
            margin: 0,
            fontSize: '9px',
            fontWeight: 700,
            color: 'rgba(0,0,0,0.5)',
            textAlign: 'center',
            fontFamily: 'ui-monospace, monospace',
          }}
        >
          {debug}
          {ctxState ? ` · audio:${ctxState}` : ''}
        </p>
      )}
    </div>
  );
}

function ParticipantChip({
  email,
  speaking,
  mine,
  muted,
  onToggleMute,
  color,
  iceState,
  connState,
  hasAudio,
  audioLevel,
}: {
  email: string;
  speaking: boolean;
  mine?: boolean;
  muted?: boolean;
  onToggleMute?: () => void;
  color: string;
  iceState?: string;
  connState?: string;
  hasAudio?: boolean;
  audioLevel: number;
}) {
  const initials = initialsFor(email, null);
  const name = mine ? 'you' : email.split('@')[0];
  const ok = connState === 'connected';
  const bars = Math.max(0, Math.min(5, Math.round(audioLevel / 12)));

  return (
    <button
      onClick={onToggleMute}
      disabled={mine}
      title={
        mine
          ? 'you'
          : ok
          ? muted
            ? 'tap to unmute (local)'
            : 'tap to mute (local)'
          : `connecting… (${connState ?? '—'})`
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px 4px 4px',
        border: '2px solid black',
        borderRadius: '999px',
        background: speaking
          ? `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #7FE5A5`
          : `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFFDF5`,
        boxShadow: speaking
          ? '0 0 0 2px #3A7A5E, 2px 2px 0 0 black'
          : '2px 2px 0 0 black',
        cursor: mine ? 'default' : 'pointer',
        flexShrink: 0,
        transition: 'background 0.15s, box-shadow 0.15s',
        position: 'relative',
      }}
    >
      <span
        className="gloss-shine"
        style={{
          width: '24px',
          height: '24px',
          borderRadius: '999px',
          border: '2px solid black',
          background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), ${color}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '9px',
          fontWeight: 900,
          color: '#000',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        {initials}
        {!mine && (
          <span
            style={{
              position: 'absolute',
              bottom: '-2px',
              right: '-2px',
              width: '8px',
              height: '8px',
              borderRadius: '999px',
              border: '1.5px solid black',
              background: ok && hasAudio ? '#3A7A5E' : '#E0A800',
            }}
          />
        )}
      </span>
      <span
        style={{
          fontSize: '11px',
          fontWeight: 900,
          color: '#000',
          whiteSpace: 'nowrap',
          maxWidth: '80px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {name}
      </span>

      {/* VU meter (5 bars) */}
      {!mine && ok && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'flex-end',
            gap: '1px',
            height: '12px',
          }}
          aria-hidden
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              style={{
                width: '2px',
                height: `${4 + i * 2}px`,
                borderRadius: '999px',
                background: i < bars ? '#3A7A5E' : 'rgba(0,0,0,0.15)',
              }}
            />
          ))}
        </span>
      )}

      {muted && !mine && (
        <VolumeX className="size-3" strokeWidth={3} style={{ color: '#C2185B' }} />
      )}
    </button>
  );
}