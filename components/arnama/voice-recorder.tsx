'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, X, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Props = {
  userId: string;
  disabled?: boolean;
  onSend: (url: string, duration: number) => void;
};

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function VoiceRecorder({ userId, disabled, onSend }: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const cancelRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      try {
        mediaRecorderRef.current?.stop();
      } catch {}
    };
  }, []);

  async function start() {
    setError('');

    // 1. Browser support
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setError('mic not supported in this browser');
      return;
    }

    // 2. Check if we're in an iframe (StackBlitz preview)
    const inIframe = typeof window !== 'undefined' && window.self !== window.top;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      cancelRef.current = false;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (cancelRef.current) {
          setRecording(false);
          setSeconds(0);
          return;
        }
        await upload();
      };

      mr.start();
      startTimeRef.current = Date.now();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => {
        setSeconds((Date.now() - startTimeRef.current) / 1000);
      }, 200);
    } catch (err: any) {
      const name = err?.name ?? '';
      let msg = 'mic access denied';
      if (name === 'NotAllowedError' && inIframe) {
        msg = 'blocked in preview — open in a new tab to test';
      } else if (name === 'NotAllowedError') {
        msg = 'allow mic in browser settings';
      } else if (name === 'NotFoundError') {
        msg = 'no mic found';
      } else if (name === 'NotReadableError') {
        msg = 'mic is busy (another app using it)';
      } else if (name === 'SecurityError') {
        msg = 'needs HTTPS';
      }
      setError(msg);
      console.error('getUserMedia error:', err);
    }
  }

  function stop() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
    }
  }

  function cancel() {
    cancelRef.current = true;
    stop();
  }

  async function upload() {
    const duration = Math.max(
      1,
      Math.round((Date.now() - startTimeRef.current) / 1000)
    );
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    setRecording(false);
    setSeconds(0);

    if (blob.size < 1000) {
      setError('too short');
      return;
    }

    setUploading(true);
    try {
      const path = `${userId}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.webm`;
      const { error: upErr } = await supabase.storage
        .from('voice-notes')
        .upload(path, blob, { cacheControl: '3600', upsert: false });
      if (upErr) {
        setError('upload failed: ' + upErr.message);
        setUploading(false);
        return;
      }
      const { data: pub } = supabase.storage
        .from('voice-notes')
        .getPublicUrl(path);
      onSend(pub.publicUrl, duration);
    } catch (err) {
      setError('upload failed');
      console.error(err);
    }
    setUploading(false);
  }

  // Recording UI
  if (recording) {
    return (
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          border: '2px solid black',
          borderRadius: '14px',
          background: '#FFD1DC',
          padding: '6px 10px',
        }}
      >
        <span
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '999px',
            background: '#C2185B',
            border: '2px solid black',
            animation: 'voice-pulse 1s ease-in-out infinite',
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontWeight: 900,
            fontSize: '15px',
            color: '#000',
            fontVariantNumeric: 'tabular-nums',
            flexShrink: 0,
          }}
        >
          {formatTime(seconds)}
        </span>
        <span
          style={{
            flex: 1,
            fontSize: '10px',
            fontWeight: 700,
            color: 'rgba(0,0,0,0.55)',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          recording...
        </span>
        <button
          type="button"
          onClick={cancel}
          aria-label="Cancel"
          style={{
            border: '2px solid black',
            borderRadius: '999px',
            background: '#FFFDF5',
            color: '#000',
            fontWeight: 900,
            fontSize: '11px',
            padding: '6px 10px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            flexShrink: 0,
          }}
        >
          <X className="size-3" strokeWidth={3} />
        </button>
        <button
          type="button"
          onClick={stop}
          style={{
            border: '2px solid black',
            borderRadius: '999px',
            background: '#E2F0D9',
            color: '#000',
            fontWeight: 900,
            fontSize: '11px',
            padding: '6px 12px',
            cursor: 'pointer',
            boxShadow: '2px 2px 0 0 black',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            flexShrink: 0,
          }}
        >
          <Send className="size-3" strokeWidth={3} />
          send
        </button>
      </div>
    );
  }

  // Idle button
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => {
          if (!disabled && !uploading) start();
        }}
        disabled={disabled || uploading}
        aria-label="Record voice note"
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          border: '2px solid black',
          background: uploading
            ? '#FFF5BA'
            : `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFD1DC`,
          boxShadow: '3px 3px 0 0 black',
          cursor: disabled || uploading ? 'not-allowed' : 'pointer',
          opacity: disabled || uploading ? 0.5 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          touchAction: 'manipulation',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <Mic className="size-5" strokeWidth={2.75} />
      </button>
      {error && (
        <div
          style={{
            position: 'absolute',
            bottom: '70px',
            left: '10px',
            right: '10px',
            border: '2px solid black',
            background: '#FFF5BA',
            color: '#000',
            fontSize: '11px',
            fontWeight: 800,
            borderRadius: '12px',
            padding: '8px 12px',
            boxShadow: '3px 3px 0 0 black',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <span style={{ minWidth: 0 }}>🎤 {error}</span>
          <button
            onClick={() => setError('')}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontWeight: 900,
              fontSize: '11px',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}