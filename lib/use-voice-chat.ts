'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

type Participant = {
  id: string;
  email: string;
  speaking: boolean;
  hasAudio: boolean;
};

type Peer = {
  pc: RTCPeerConnection;
  pendingIce: RTCIceCandidateInit[];
  audioEl: HTMLAudioElement;
  stream: MediaStream | null;
  muted: boolean;
};

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function useVoiceChat(roomId: string, userId: string | null, email: string | null) {
  const [micOn, setMicOn] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, Peer>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<Map<string, { analyser: AnalyserNode; data: Uint8Array }>>(new Map());
  const mutedPeersRef = useRef<Set<string>>(new Set());

  // -------- Cleanup helper --------
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

  // -------- Create a peer connection --------
  const createPeer = useCallback((peerId: string, peerEmail: string, initiator: boolean): Peer | null => {
    if (!userId || !email || !localStreamRef.current || !channelRef.current) return null;
    const existing = peersRef.current.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Push local audio tracks
    localStreamRef.current.getTracks().forEach((track) => {
      try { pc.addTrack(track, localStreamRef.current!); } catch {}
    });

    const audioEl = new Audio();
    audioEl.autoplay = true;
    audioEl.volume = mutedPeersRef.current.has(peerId) ? 0 : 1;

    const peer: Peer = { pc, pendingIce: [], audioEl, stream: null, muted: false };
    peersRef.current.set(peerId, peer);

    // Incoming audio
    pc.ontrack = (e) => {
      peer.stream = e.streams[0];
      audioEl.srcObject = e.streams[0];
      audioEl.play().catch(() => {});
      // attach analyser for speaking detection
      try {
        if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        const src = ctx.createMediaStreamSource(e.streams[0]);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        analysersRef.current.set(peerId, { analyser, data: new Uint8Array(analyser.frequencyBinCount) });
      } catch {}
      setParticipants((prev) =>
        prev.some((p) => p.id === peerId)
          ? prev.map((p) => (p.id === peerId ? { ...p, hasAudio: true } : p))
          : [...prev, { id: peerId, email: peerEmail, speaking: false, hasAudio: true }]
      );
    };

    // ICE candidates → broadcast
    pc.onicecandidate = (e) => {
      if (e.candidate && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'ice',
          payload: { from: userId, to: peerId, candidate: e.candidate.toJSON() },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        closePeer(peerId);
      }
    };

    // Track this peer in state
    setParticipants((prev) =>
      prev.some((p) => p.id === peerId)
        ? prev
        : [...prev, { id: peerId, email: peerEmail, speaking: false, hasAudio: false }]
    );

    // Initiate offer
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
        } catch (err) {
          console.error('[voice] offer failed:', err);
        }
      })();
    }

    return peer;
  }, [userId, email, closePeer]);

  // -------- Main effect: set up channel + presence + signalling --------
  useEffect(() => {
    if (!userId || !email) return;
    let cancelled = false;

    async function setup() {
      // 1. Local mic (only if user turns it on — we get the stream lazily below)
      //    Actually, get it upfront so we can add tracks immediately when connecting.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        // Start muted
        stream.getAudioTracks().forEach((t) => (t.enabled = false));
        setConnected(true);
      } catch (err: any) {
        const msg =
          err?.name === 'NotAllowedError'
            ? 'mic permission denied'
            : err?.name === 'NotFoundError'
            ? 'no microphone found'
            : 'could not access mic';
        setError(msg);
        return;
      }

      // 2. Channel
      const ch = supabase.channel(`voice-${roomId}`, {
        config: { presence: { key: userId } },
      });
      channelRef.current = ch;

      // 3. Presence sync — decide who initiates
      ch.on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState();
        const liveIds = Object.keys(state);

        // Connect to new peers
        liveIds.forEach((id) => {
          if (id === userId) return;
          if (peersRef.current.has(id)) return;
          const meta: any = (state[id] as any)?.[0] ?? {};
          const peerEmail = meta.email ?? 'someone';
          // Lower id initiates to avoid double offers
          const initiator = userId > id;
          createPeer(id, peerEmail, initiator);
        });

        // Drop departed peers
        peersRef.current.forEach((_, id) => {
          if (!liveIds.includes(id)) closePeer(id);
        });
      });

      // 4. Signalling handlers
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
          console.error('[voice] answer failed:', err);
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
          console.error('[voice] setRemote(answer) failed:', err);
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

      // 5. Subscribe + track presence
      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({ user_id: userId, email });
        }
      });
    }

    setup();

    return () => {
      cancelled = true;
      // Stop mic
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      // Close all peers
      peersRef.current.forEach((_, id) => closePeer(id));
      // Leave channel
      if (channelRef.current) {
        try { channelRef.current.untrack(); } catch {}
        supabase.removeChannel(channelRef.current);
      }
      channelRef.current = null;
      setConnected(false);
    };
  }, [roomId, userId, email, createPeer, closePeer]);

  // -------- Speaking detection loop --------
  useEffect(() => {
    const i = setInterval(() => {
      const updates: Record<string, boolean> = {};

      // Local analyser (self)
      if (localStreamRef.current && micOn) {
        if (!analysersRef.current.has('me')) {
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
      }

      analysersRef.current.forEach(({ analyser, data }, id) => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length;
        updates[id] = avg > 12;
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
  }, [micOn]);

  // -------- Per-peer local mute --------
  const togglePeerMute = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (!peer) return;
    const next = !mutedPeersRef.current.has(peerId);
    if (next) mutedPeersRef.current.add(peerId);
    else mutedPeersRef.current.delete(peerId);
    peer.muted = next;
    peer.audioEl.volume = next ? 0 : 1;
    // Force re-render of participants row (muted state not shown in state, but we
    // can nudge by creating new array ref)
    setParticipants((prev) => [...prev]);
  }, []);

  return {
    micOn,
    toggleMic,
    participants,
    connected,
    error,
    togglePeerMute,
    mutedPeers: mutedPeersRef.current,
  };
}