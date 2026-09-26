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
};

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export function useVoiceChat(roomId: string, userId: string | null, email: string | null) {
  const [micOn, setMicOn] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [mutedPeers, setMutedPeers] = useState<Set<string>>(new Set());
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [debug, setDebug] = useState<string>('');

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, {
    pc: RTCPeerConnection;
    pendingIce: RTCIceCandidateInit[];
    audioEl: HTMLAudioElement;
    stream: MediaStream | null;
  }>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<Map<string, { analyser: AnalyserNode; data: Uint8Array }>>(new Map());
  const mutedPeersRef = useRef<Set<string>>(new Set());

  const log = useCallback((msg: string) => {
    console.log('[voice]', msg);
    setDebug(msg);
  }, []);

  // -------- Unlock audio on any user gesture --------
  useEffect(() => {
    function unlock() {
      if (!audioCtxRef.current) {
        try { audioCtxRef.current = new AudioContext(); } catch {}
      }
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      // Try to resume every peer audio element
      peersRef.current.forEach((p) => {
        p.audioEl.play().catch(() => {});
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
  }, []);

  // -------- Close peer --------
  const closePeer = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (!peer) return;
    try { peer.pc.close(); } catch {}
    try { peer.audioEl.pause(); } catch {}
    peer.audioEl.srcObject = null;
    peersRef.current.delete(peerId);
    analysersRef.current.delete(peerId);
    setParticipants((prev) => prev.filter((p) => p.id !== peerId));
  }, []);

  // -------- Create peer --------
  const createPeer = useCallback((peerId: string, peerEmail: string, initiator: boolean) => {
    if (!userId || !email || !localStreamRef.current || !channelRef.current) {
      log('createPeer blocked: no local stream yet');
      return null;
    }
    const existing = peersRef.current.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    localStreamRef.current.getTracks().forEach((track) => {
      try { pc.addTrack(track, localStreamRef.current!); } catch (e) {
        console.error('[voice] addTrack failed', e);
      }
    });

    // Append to DOM (some mobile browsers require this for playback)
    const audioEl = document.createElement('audio');
    audioEl.autoplay = true;
    audioEl.setAttribute('playsinline', 'true');
    audioEl.volume = mutedPeersRef.current.has(peerId) ? 0 : 1;
    audioEl.style.display = 'none';
    document.body.appendChild(audioEl);

    const peer = { pc, pendingIce: [] as RTCIceCandidateInit[], audioEl, stream: null as MediaStream | null };
    peersRef.current.set(peerId, peer);

    log(`peer ${peerEmail} created (${initiator ? 'offerer' : 'answerer'})`);

    pc.ontrack = (e) => {
      log(`got track from ${peerEmail}`);
      peer.stream = e.streams[0];
      audioEl.srcObject = e.streams[0];
      audioEl.play().catch((err) => {
        log(`autoplay blocked for ${peerEmail} — tap anywhere to unlock`);
      });

      // Analyzer for speaking detection
      try {
        if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        const src = ctx.createMediaStreamSource(e.streams[0]);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        analysersRef.current.set(peerId, { analyser, data: new Uint8Array(analyser.frequencyBinCount) });
      } catch (err) {
        console.error('[voice] analyser failed', err);
      }

      setParticipants((prev) =>
        prev.some((p) => p.id === peerId)
          ? prev.map((p) => (p.id === peerId ? { ...p, hasAudio: true, connected: true } : p))
          : [...prev, { id: peerId, email: peerEmail, speaking: false, hasAudio: true, connected: true, iceState: pc.iceConnectionState }]
      );
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'ice',
          payload: { from: userId, to: peerId, candidate: e.candidate.toJSON() },
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      log(`ICE ${peerEmail}: ${pc.iceConnectionState}`);
      setParticipants((prev) =>
        prev.map((p) => (p.id === peerId ? { ...p, iceState: pc.iceConnectionState } : p))
      );
      if (pc.iceConnectionState === 'failed') {
        // Try restart
        try {
          pc.restartIce();
        } catch {}
      }
      if (pc.iceConnectionState === 'closed') {
        closePeer(peerId);
      }
    };

    pc.onconnectionstatechange = () => {
      log(`conn ${peerEmail}: ${pc.connectionState}`);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        closePeer(peerId);
      }
    };

    setParticipants((prev) =>
      prev.some((p) => p.id === peerId)
        ? prev
        : [...prev, {
            id: peerId,
            email: peerEmail,
            speaking: false,
            hasAudio: false,
            connected: false,
            iceState: pc.iceConnectionState,
          }]
    );

    if (initiator) {
      (async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          channelRef.current?.send({
            type: 'broadcast',
            event: 'offer',
            payload: { from: userId, to: peerId, sdp: offer },
          });
          log(`offer sent to ${peerEmail}`);
        } catch (err) {
          console.error('[voice] offer failed', err);
          log(`offer failed: ${(err as any)?.message}`);
        }
      })();
    }

    return peer;
  }, [userId, email, closePeer, log]);

  // -------- Main setup --------
  useEffect(() => {
    if (!userId || !email) return;
    let cancelled = false;
    log('starting…');

    async function setup() {
      // 1. Grab mic
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        localStreamRef.current = stream;
        stream.getAudioTracks().forEach((t) => (t.enabled = false));
        setConnected(true);
        log('mic ready (muted by default)');
      } catch (err: any) {
        const msg =
          err?.name === 'NotAllowedError' ? 'mic permission denied'
          : err?.name === 'NotFoundError' ? 'no microphone found'
          : err?.name === 'NotReadableError' ? 'mic busy (another tab using it?)'
          : `mic failed: ${err?.name}`;
        setError(msg);
        log(`error: ${msg}`);
        return;
      }

      // 2. Signalling channel
      const ch = supabase.channel(`voice-${roomId}`, {
        config: { presence: { key: userId } },
      });
      channelRef.current = ch;

      ch.on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState();
        const liveIds = Object.keys(state);
        log(`presence sync — ${liveIds.length} online`);

        liveIds.forEach((id) => {
          if (id === userId) return;
          if (peersRef.current.has(id)) return;
          const meta: any = (state[id] as any)?.[0] ?? {};
          const peerEmail = meta.email ?? 'someone';
          const initiator = userId > id;
          createPeer(id, peerEmail, initiator);
        });

        peersRef.current.forEach((_, id) => {
          if (!liveIds.includes(id)) closePeer(id);
        });
      });

      ch.on('broadcast', { event: 'offer' }, async ({ payload }: any) => {
        if (payload?.to !== userId) return;
        log(`offer received from ${payload.from?.slice(0, 6)}`);
        const peer = createPeer(payload.from, 'someone', false);
        if (!peer) return;
        try {
          await peer.pc.setRemoteDescription(payload.sdp);
          for (const c of peer.pendingIce) {
            try { await peer.pc.addIceCandidate(c); } catch {}
          }
          peer.pendingIce = [];
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          ch.send({
            type: 'broadcast',
            event: 'answer',
            payload: { from: userId, to: payload.from, sdp: answer },
          });
          log(`answer sent`);
        } catch (err) {
          console.error('[voice] answer failed', err);
        }
      });

      ch.on('broadcast', { event: 'answer' }, async ({ payload }: any) => {
        if (payload?.to !== userId) return;
        log(`answer received`);
        const peer = peersRef.current.get(payload.from);
        if (!peer) return;
        try {
          await peer.pc.setRemoteDescription(payload.sdp);
          for (const c of peer.pendingIce) {
            try { await peer.pc.addIceCandidate(c); } catch {}
          }
          peer.pendingIce = [];
        } catch (err) {
          console.error('[voice] setRemote(answer) failed', err);
        }
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
        log(`channel: ${status}`);
        if (status === 'SUBSCRIBED') {
          await ch.track({ user_id: userId, email });
        }
      });
    }

    setup();

    return () => {
      cancelled = true;
      log('cleanup');
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      peersRef.current.forEach((peer) => {
        try { peer.pc.close(); } catch {}
        try { peer.audioEl.pause(); } catch {}
        try { peer.audioEl.remove(); } catch {}
      });
      peersRef.current.clear();
      analysersRef.current.clear();
      if (channelRef.current) {
        try { channelRef.current.untrack(); } catch {}
        supabase.removeChannel(channelRef.current);
      }
      channelRef.current = null;
      setConnected(false);
    };
  }, [roomId, userId, email, createPeer, closePeer, log]);

  // -------- Speaking detection --------
  useEffect(() => {
    const i = setInterval(() => {
      const updates: Record<string, boolean> = {};

      if (localStreamRef.current && micOn && !analysersRef.current.has('me')) {
        try {
          if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
          const ctx = audioCtxRef.current;
          if (ctx.state === 'suspended') ctx.resume().catch(() => {});
          const src = ctx.createMediaStreamSource(localStreamRef.current);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          src.connect(analyser);
          analysersRef.current.set('me', { analyser, data: new Uint8Array(analyser.frequencyBinCount) });
        } catch {}
      }

      analysersRef.current.forEach(({ analyser, data }, id) => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        updates[id] = sum / data.length > 12;
      });

      setParticipants((prev) =>
        prev.map((p) => ({ ...p, speaking: !!updates[p.id] }))
      );
    }, 150);
    return () => clearInterval(i);
  }, [micOn]);

  // -------- Mic toggle (also unlocks autoplay) --------
  const toggleMic = useCallback(() => {
    if (!localStreamRef.current) return;
    const next = !micOn;
    localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);

    // Unlock audio context + every peer's audio element (user gesture)
    if (next) {
      if (!audioCtxRef.current) {
        try { audioCtxRef.current = new AudioContext(); } catch {}
      }
      audioCtxRef.current?.resume().catch(() => {});
      peersRef.current.forEach((p) => {
        p.audioEl.play().catch(() => {});
      });
      log('mic ON');
    } else {
      log('mic OFF');
    }
  }, [micOn, log]);

  // -------- Peer mute (local) --------
  const togglePeerMute = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (!peer) return;
    const next = !mutedPeersRef.current.has(peerId);
    if (next) mutedPeersRef.current.add(peerId);
    else mutedPeersRef.current.delete(peerId);
    peer.audioEl.volume = next ? 0 : 1;
    setMutedPeers(new Set(mutedPeersRef.current));
  }, []);

  return {
    micOn,
    toggleMic,
    participants,
    connected,
    error,
    togglePeerMute,
    mutedPeers,
    debug,
  };
}