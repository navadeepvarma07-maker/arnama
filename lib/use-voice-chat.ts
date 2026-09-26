'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

type Participant = {
  id: string;
  email: string;
  speaking: boolean;
  hasAudio: boolean;
  connected: boolean;
  iceState: string;
  connState: string;
  audioLevel: number;
  audioState: string;
  trackState: string;
};

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

const MAX_RETRIES = 3;

export function useVoiceChat(roomId: string, userId: string | null, email: string | null) {
  const [micOn, setMicOn] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [mutedPeers, setMutedPeers] = useState<Set<string>>(new Set());
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [debug, setDebug] = useState<string>('booting…');

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // The stream we SEND to peers (always live, mute via gain)
  const localStreamRef = useRef<MediaStream | null>(null);
  // The raw mic stream (for cleanup)
  const rawMicRef = useRef<MediaStream | null>(null);
  // Mute gain node — 0 = muted, 1 = live
  const muteGainRef = useRef<GainNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const peersRef = useRef<
    Map<string, {
      pc: RTCPeerConnection;
      pendingIce: RTCIceCandidateInit[];
      audioEl: HTMLAudioElement | null;
      analyser: AnalyserNode | null;
      sourceNode: MediaStreamAudioSourceNode | null;
      retries: number;
      isInitiator: boolean;
      peerEmail: string;
      remoteTrack: MediaStreamTrack | null;
    }>
  >(new Map());

  const mutedPeersRef = useRef<Set<string>>(new Set());
  const localAnalyserRef = useRef<AnalyserNode | null>(null);

  const log = useCallback((msg: string) => {
    console.log('[voice]', msg);
    setDebug(msg);
  }, []);

  const ensureAudioCtx = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        const Ctor = (window.AudioContext || (window as any).webkitAudioContext);
        if (!Ctor) return null;
        audioCtxRef.current = new Ctor();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    function unlock() {
      ensureAudioCtx();
      peersRef.current.forEach((p) => {
        if (p.audioEl && p.audioEl.paused) {
          p.audioEl.play().catch(() => {});
        }
      });
    }
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, [ensureAudioCtx]);

  const closePeer = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (!peer) return;
    try { peer.pc.close(); } catch {}
    try { peer.sourceNode?.disconnect(); } catch {}
    if (peer.audioEl) {
      try { peer.audioEl.pause(); } catch {}
      try { peer.audioEl.remove(); } catch {}
    }
    peersRef.current.delete(peerId);
    setParticipants((prev) => prev.filter((p) => p.id !== peerId));
  }, []);

  const createPeer = useCallback(
    (peerId: string, peerEmail: string, initiator: boolean) => {
      if (!userId || !email || !localStreamRef.current || !channelRef.current) return null;
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;

      log(`connecting → ${peerEmail.split('@')[0]}…`);

      const pc = new RTCPeerConnection({
        iceServers: ICE_SERVERS,
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
      });

      // Add the LIVE track from our mute-gain stream (always enabled at the RTP level)
      localStreamRef.current.getTracks().forEach((track) => {
        try { pc.addTrack(track, localStreamRef.current!); } catch {}
      });

      const peer = {
        pc,
        pendingIce: [] as RTCIceCandidateInit[],
        audioEl: null as HTMLAudioElement | null,
        analyser: null as AnalyserNode | null,
        sourceNode: null as MediaStreamAudioSourceNode | null,
        retries: 0,
        isInitiator: initiator,
        peerEmail,
        remoteTrack: null as MediaStreamTrack | null,
      };
      peersRef.current.set(peerId, peer);

      pc.ontrack = (e) => {
        const track = e.track;
        peer.remoteTrack = track;
        const stream = e.streams[0] || new MediaStream([track]);

        log(`✓ track from ${peerEmail.split('@')[0]} — enabled=${track.enabled} muted=${track.muted}`);

        track.addEventListener('unmute', () => log(`▶ ${peerEmail.split('@')[0]} live`));
        track.addEventListener('mute', () => log(`✗ ${peerEmail.split('@')[0]} muted`));

        const audioEl = document.createElement('audio');
        audioEl.autoplay = true;
        audioEl.setAttribute('playsinline', 'true');
        audioEl.controls = true;
        audioEl.style.position = 'fixed';
        audioEl.style.bottom = '10px';
        audioEl.style.left = '10px';
        audioEl.style.zIndex = '99999';
        audioEl.style.width = '180px';
        audioEl.style.opacity = '0.85';
        audioEl.volume = mutedPeersRef.current.has(peerId) ? 0 : 1;
        audioEl.srcObject = stream;
        document.body.appendChild(audioEl);
        peer.audioEl = audioEl;

        audioEl.play()
          .then(() => log(`▶▶ playing ${peerEmail.split('@')[0]}`))
          .catch((err) => log(`autoplay blocked: ${err?.name}`));

        try {
          const ctx = ensureAudioCtx();
          if (ctx) {
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);
            peer.analyser = analyser;
            peer.sourceNode = source;
          }
        } catch {}

        setParticipants((prev) =>
          prev.some((p) => p.id === peerId)
            ? prev.map((p) => (p.id === peerId ? { ...p, hasAudio: true, connected: true, trackState: track.muted ? 'muted' : 'live' } : p))
            : [{
                id: peerId, email: peerEmail, speaking: false, hasAudio: true,
                connected: true, iceState: pc.iceConnectionState,
                connState: pc.connectionState, audioLevel: 0, audioState: 'playing',
                trackState: track.muted ? 'muted' : 'live',
              }]
        );
      };

      pc.onicecandidate = (e) => {
        if (e.candidate && channelRef.current) {
          channelRef.current.send({
            type: 'broadcast', event: 'ice',
            payload: { from: userId, to: peerId, candidate: e.candidate.toJSON() },
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        setParticipants((prev) =>
          prev.map((p) => (p.id === peerId ? { ...p, iceState: pc.iceConnectionState } : p))
        );
      };

      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        setParticipants((prev) =>
          prev.map((p) => (p.id === peerId ? { ...p, connState: st } : p))
        );
        if (st === 'connected') {
          log(`✓ connected to ${peerEmail.split('@')[0]}`);
          peer.retries = 0;
          if (peer.audioEl && peer.audioEl.paused) peer.audioEl.play().catch(() => {});
          return;
        }
        if (st === 'failed') {
          if (peer.retries < MAX_RETRIES) {
            peer.retries++;
            setTimeout(() => {
              closePeer(peerId);
              setTimeout(() => createPeer(peerId, peerEmail, initiator), 800);
            }, 1200);
          }
        }
      };

      setParticipants((prev) =>
        prev.some((p) => p.id === peerId)
          ? prev
          : [{
              id: peerId, email: peerEmail, speaking: false, hasAudio: false,
              connected: false, iceState: pc.iceConnectionState,
              connState: pc.connectionState, audioLevel: 0, audioState: 'no-el',
              trackState: 'no-track',
            }]
      );

      if (initiator) {
        setTimeout(async () => {
          try {
            const offer = await pc.createOffer({ offerToReceiveAudio: true });
            await pc.setLocalDescription(offer);
            channelRef.current?.send({
              type: 'broadcast', event: 'offer',
              payload: { from: userId, to: peerId, sdp: offer },
            });
          } catch (err) { console.error('[voice] offer failed', err); }
        }, 400);
      }

      return peer;
    },
    [userId, email, closePeer, log, ensureAudioCtx]
  );

  useEffect(() => {
    if (!userId || !email) return;
    let cancelled = false;
    log('starting…');

    async function setup() {
      try {
        // 1. Raw mic
        const raw = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
        if (cancelled) { raw.getTracks().forEach((t) => t.stop()); return; }
        rawMicRef.current = raw;

        // 2. Route mic → gain → destination stream.
        //    The dest.stream track is ALWAYS live (never disabled).
        //    Muting = set gain to 0. This is the fix.
        const ctx = ensureAudioCtx();
        if (!ctx) { setError('audio context failed'); return; }
        if (ctx.state === 'suspended') await ctx.resume().catch(() => {});

        const source = ctx.createMediaStreamSource(raw);
        const gain = ctx.createGain();
        gain.gain.value = 0; // start muted
        const dest = ctx.createMediaStreamDestination();
        source.connect(gain);
        gain.connect(dest);

        muteGainRef.current = gain;
        localStreamRef.current = dest.stream;

        setConnected(true);
        log('mic ready — mute via gain');
      } catch (err: any) {
        const msg =
          err?.name === 'NotAllowedError' ? 'mic permission denied'
          : err?.name === 'NotFoundError' ? 'no microphone found'
          : err?.name === 'NotReadableError' ? 'mic busy'
          : `mic failed: ${err?.name}`;
        setError(msg); log(`error: ${msg}`); return;
      }

      const ch = supabase.channel(`voice-${roomId}`, {
        config: { presence: { key: userId } },
      });
      channelRef.current = ch;

      ch.on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState();
        const liveIds = Object.keys(state);
        liveIds.forEach((id) => {
          if (id === userId) return;
          if (peersRef.current.has(id)) return;
          const meta: any = (state[id] as any)?.[0] ?? {};
          createPeer(id, meta.email ?? 'someone', userId > id);
        });
        peersRef.current.forEach((_, id) => {
          if (!liveIds.includes(id)) closePeer(id);
        });
      });

      ch.on('broadcast', { event: 'offer' }, async ({ payload }: any) => {
        if (payload?.to !== userId) return;
        const peer = createPeer(payload.from, 'someone', false);
        if (!peer) return;
        try {
          await peer.pc.setRemoteDescription(payload.sdp);
          for (const c of peer.pendingIce) { try { await peer.pc.addIceCandidate(c); } catch {} }
          peer.pendingIce = [];
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          ch.send({
            type: 'broadcast', event: 'answer',
            payload: { from: userId, to: payload.from, sdp: answer },
          });
        } catch (err) { console.error('[voice] answer failed', err); }
      });

      ch.on('broadcast', { event: 'answer' }, async ({ payload }: any) => {
        if (payload?.to !== userId) return;
        const peer = peersRef.current.get(payload.from);
        if (!peer) return;
        try {
          await peer.pc.setRemoteDescription(payload.sdp);
          for (const c of peer.pendingIce) { try { await peer.pc.addIceCandidate(c); } catch {} }
          peer.pendingIce = [];
        } catch (err) { console.error('[voice] setRemote(answer) failed', err); }
      });

      ch.on('broadcast', { event: 'ice' }, async ({ payload }: any) => {
        if (payload?.to !== userId) return;
        const peer = peersRef.current.get(payload.from);
        if (!peer) return;
        if (peer.pc.remoteDescription && peer.pc.remoteDescription.type) {
          try { await peer.pc.addIceCandidate(payload.candidate); } catch {}
        } else {
          peer.pendingIce.push(payload.candidate);
        }
      });

      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await ch.track({ user_id: userId, email });
      });
    }

    setup();

    return () => {
      cancelled = true;
      rawMicRef.current?.getTracks().forEach((t) => t.stop());
      rawMicRef.current = null;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      muteGainRef.current = null;
      peersRef.current.forEach((p) => {
        try { p.pc.close(); } catch {}
        try { p.sourceNode?.disconnect(); } catch {}
        if (p.audioEl) { try { p.audioEl.remove(); } catch {} }
      });
      peersRef.current.clear();
      if (channelRef.current) {
        try { channelRef.current.untrack(); } catch {}
        supabase.removeChannel(channelRef.current);
      }
      channelRef.current = null;
      setConnected(false);
    };
  }, [roomId, userId, email, createPeer, closePeer, log, ensureAudioCtx]);

  useEffect(() => {
    const i = setInterval(() => {
      const updates: Record<string, { level: number; speaking: boolean; audioState: string; trackState: string }> = {};

      if (rawMicRef.current && micOn) {
        const ctx = audioCtxRef.current;
        if (ctx && !localAnalyserRef.current) {
          try {
            const src = ctx.createMediaStreamSource(rawMicRef.current);
            const an = ctx.createAnalyser();
            an.fftSize = 512;
            src.connect(an);
            localAnalyserRef.current = an;
          } catch {}
        }
        const an = localAnalyserRef.current;
        if (an) {
          const data = new Uint8Array(an.frequencyBinCount);
          an.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          const level = Math.min(100, (sum / data.length) * 2);
          updates['me'] = { level, speaking: level > 15, audioState: 'mic', trackState: 'live' };
        }
      }

      peersRef.current.forEach((peer, id) => {
        let level = 0;
        const an = peer.analyser;
        if (an) {
          const data = new Uint8Array(an.frequencyBinCount);
          an.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          level = Math.min(100, (sum / data.length) * 2);
        }
        const el = peer.audioEl;
        let astate = 'no-el';
        if (el) {
          if (el.error) astate = 'error';
          else if (el.paused) astate = 'paused';
          else astate = 'playing';
        }
        const t = peer.remoteTrack;
        let tstate = 'no-track';
        if (t) {
          if (t.readyState === 'ended') tstate = 'ended';
          else if (t.muted) tstate = 'muted';
          else tstate = 'live';
        }
        updates[id] = { level, speaking: level > 15, audioState: astate, trackState: tstate };
      });

      setParticipants((prev) =>
        prev.map((p) => ({
          ...p,
          audioLevel: updates[p.id]?.level ?? 0,
          speaking: updates[p.id]?.speaking ?? false,
          audioState: updates[p.id]?.audioState ?? p.audioState,
          trackState: updates[p.id]?.trackState ?? p.trackState,
        }))
      );
    }, 200);
    return () => clearInterval(i);
  }, [micOn]);

  const toggleMic = useCallback(() => {
    if (!muteGainRef.current) return;
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    const next = !micOn;
    // The magic: just flip the gain node. The track stays live at RTP level.
    muteGainRef.current.gain.value = next ? 1 : 0;
    setMicOn(next);
    peersRef.current.forEach((p) => {
      if (p.audioEl && p.audioEl.paused) p.audioEl.play().catch(() => {});
    });
    log(next ? 'mic ON' : 'mic OFF');
  }, [micOn, log]);

  const togglePeerMute = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (!peer || !peer.audioEl) return;
    const next = !mutedPeersRef.current.has(peerId);
    if (next) mutedPeersRef.current.add(peerId);
    else mutedPeersRef.current.delete(peerId);
    peer.audioEl.volume = next ? 0 : 1;
    setMutedPeers(new Set(mutedPeersRef.current));
  }, []);

  const reconnect = useCallback(() => {
    log('retry…');
    Array.from(peersRef.current.entries()).forEach(([id, p]) => {
      try { p.pc.close(); } catch {}
      try { p.sourceNode?.disconnect(); } catch {}
      if (p.audioEl) { try { p.audioEl.remove(); } catch {} }
      peersRef.current.delete(id);
      setParticipants((prev) => prev.filter((x) => x.id !== id));
    });
    setTimeout(() => {
      const ch = channelRef.current;
      if (!ch) return;
      const state = ch.presenceState();
      Object.keys(state).forEach((id) => {
        if (id === userId) return;
        const meta: any = (state[id] as any)?.[0] ?? {};
        createPeer(id, meta.email ?? 'someone', userId > id);
      });
    }, 600);
  }, [userId, createPeer, log]);

  const playTestTone = useCallback(() => {
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = 440;
      g.gain.value = 0.15;
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start();
      setTimeout(() => { try { osc.stop(); } catch {} }, 400);
    } catch {}
  }, [ensureAudioCtx]);

  return {
    micOn, toggleMic, participants, connected, error,
    togglePeerMute, mutedPeers, debug, reconnect, playTestTone,
  };
}