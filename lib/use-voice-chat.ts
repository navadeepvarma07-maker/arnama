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
};

// STUN + free public TURN (OpenRelay). TURN relays audio when P2P fails.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
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
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<
    Map<
      string,
      {
        pc: RTCPeerConnection;
        pendingIce: RTCIceCandidateInit[];
        audioEl: HTMLAudioElement;
        stream: MediaStream | null;
        retries: number;
        isInitiator: boolean;
        peerEmail: string;
      }
    >
  >(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<Map<string, { analyser: AnalyserNode; data: Uint8Array }>>(new Map());
  const mutedPeersRef = useRef<Set<string>>(new Set());

  const log = useCallback((msg: string) => {
    console.log('[voice]', msg);
    setDebug(msg);
  }, []);

  // -------- Audio unlock on any user gesture --------
  useEffect(() => {
    function unlock() {
      try {
        if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
        if (audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume().catch(() => {});
        }
      } catch {}
      peersRef.current.forEach((p) => {
        if (p.audioEl.paused) p.audioEl.play().catch(() => {});
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
    try { peer.audioEl.remove(); } catch {}
    peersRef.current.delete(peerId);
    analysersRef.current.delete(peerId);
    setParticipants((prev) => prev.filter((p) => p.id !== peerId));
  }, []);

  // -------- Create peer --------
  const createPeer = useCallback(
    (peerId: string, peerEmail: string, initiator: boolean) => {
      if (!userId || !email || !localStreamRef.current || !channelRef.current) {
        log('createPeer blocked: no local stream');
        return null;
      }
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;

      log(`connecting to ${peerEmail.split('@')[0]}…`);

      const pc = new RTCPeerConnection({
        iceServers: ICE_SERVERS,
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
      });

      localStreamRef.current.getTracks().forEach((track) => {
        try { pc.addTrack(track, localStreamRef.current!); } catch {}
      });

      // DOM-attached audio element (some mobile browsers need this)
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.setAttribute('playsinline', 'true');
      audioEl.volume = mutedPeersRef.current.has(peerId) ? 0 : 1;
      audioEl.style.display = 'none';
      document.body.appendChild(audioEl);

      const peer = {
        pc,
        pendingIce: [] as RTCIceCandidateInit[],
        audioEl,
        stream: null as MediaStream | null,
        retries: 0,
        isInitiator: initiator,
        peerEmail,
      };
      peersRef.current.set(peerId, peer);

      pc.ontrack = (e) => {
        peer.stream = e.streams[0];
        audioEl.srcObject = e.streams[0];
        // Try immediate play
        audioEl.play().catch(() => {
          log(`autoplay blocked for ${peerEmail.split('@')[0]} — tap anywhere`);
        });

        try {
          if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
          const ctx = audioCtxRef.current;
          if (ctx.state === 'suspended') ctx.resume().catch(() => {});
          const src = ctx.createMediaStreamSource(e.streams[0]);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          src.connect(analyser);
          analysersRef.current.set(peerId, {
            analyser,
            data: new Uint8Array(analyser.frequencyBinCount),
          });
        } catch {}

        setParticipants((prev) =>
          prev.some((p) => p.id === peerId)
            ? prev.map((p) =>
                p.id === peerId ? { ...p, hasAudio: true, connected: true } : p
              )
            : [
                ...prev,
                {
                  id: peerId,
                  email: peerEmail,
                  speaking: false,
                  hasAudio: true,
                  connected: true,
                  iceState: pc.iceConnectionState,
                  connState: pc.connectionState,
                },
              ]
        );
        log(`✓ audio from ${peerEmail.split('@')[0]}`);
      };

      pc.onicecandidate = (e) => {
        if (e.candidate && channelRef.current) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'ice',
            payload: {
              from: userId,
              to: peerId,
              candidate: e.candidate.toJSON(),
            },
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        setParticipants((prev) =>
          prev.map((p) =>
            p.id === peerId ? { ...p, iceState: pc.iceConnectionState } : p
          )
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
          return;
        }

        if (st === 'failed') {
          if (peer.retries < MAX_RETRIES) {
            peer.retries++;
            log(
              `retry ${peer.retries}/${MAX_RETRIES} to ${peerEmail
                .split('@')[0]}…`
            );
            setTimeout(() => {
              closePeer(peerId);
              setTimeout(() => {
                createPeer(peerId, peerEmail, initiator);
              }, 800);
            }, 1200);
          } else {
            log(`gave up on ${peerEmail.split('@')[0]} — tap to retry`);
          }
        }
      };

      setParticipants((prev) =>
        prev.some((p) => p.id === peerId)
          ? prev
          : [
              ...prev,
              {
                id: peerId,
                email: peerEmail,
                speaking: false,
                hasAudio: false,
                connected: false,
                iceState: pc.iceConnectionState,
                connState: pc.connectionState,
              },
            ]
      );

      if (initiator) {
        // Small delay to avoid racing the other side's subscription
        setTimeout(async () => {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            channelRef.current?.send({
              type: 'broadcast',
              event: 'offer',
              payload: { from: userId, to: peerId, sdp: offer },
            });
          } catch (err) {
            console.error('[voice] offer failed', err);
          }
        }, 400);
      }

      return peer;
    },
    [userId, email, closePeer, log]
  );

  // -------- Main setup --------
  useEffect(() => {
    if (!userId || !email) return;
    let cancelled = false;
    log('starting…');

    async function setup() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        stream.getAudioTracks().forEach((t) => (t.enabled = false));
        setConnected(true);
        log('mic ready — muted until you tap 🎤');
      } catch (err: any) {
        const msg =
          err?.name === 'NotAllowedError'
            ? 'mic permission denied'
            : err?.name === 'NotFoundError'
            ? 'no microphone found'
            : err?.name === 'NotReadableError'
            ? 'mic busy (another tab using it?)'
            : `mic failed: ${err?.name}`;
        setError(msg);
        log(`error: ${msg}`);
        return;
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
        } catch (err) {
          console.error('[voice] answer failed', err);
        }
      });

      ch.on('broadcast', { event: 'answer' }, async ({ payload }: any) => {
        if (payload?.to !== userId) return;
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
        if (status === 'SUBSCRIBED') {
          await ch.track({ user_id: userId, email });
        }
      });
    }

    setup();

    return () => {
      cancelled = true;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      peersRef.current.forEach((p) => {
        try { p.pc.close(); } catch {}
        try { p.audioEl.pause(); } catch {}
        try { p.audioEl.remove(); } catch {}
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
          analysersRef.current.set('me', {
            analyser,
            data: new Uint8Array(analyser.frequencyBinCount),
          });
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

  // -------- Mic toggle --------
  const toggleMic = useCallback(() => {
    if (!localStreamRef.current) return;
    const next = !micOn;
    localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);

    if (next) {
      try {
        if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
        audioCtxRef.current.resume().catch(() => {});
      } catch {}
      peersRef.current.forEach((p) => p.audioEl.play().catch(() => {}));
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

  // -------- Manual retry --------
  const reconnect = useCallback(() => {
    log('manual retry — rebuilding peers');
    const peersCopy = Array.from(peersRef.current.entries());
    peersRef.current.clear();
    peersCopy.forEach(([id, p]) => {
      try { p.pc.close(); } catch {}
      try { p.audioEl.remove(); } catch {}
      setParticipants((prev) => prev.filter((x) => x.id !== id));
    });
    // Rebuild from presence
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

  return {
    micOn,
    toggleMic,
    participants,
    connected,
    error,
    togglePeerMute,
    mutedPeers,
    debug,
    reconnect,
  };
}