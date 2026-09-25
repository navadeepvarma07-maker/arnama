'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

type TuneMeta = {
  title: string;
  artist: string;
  artwork: string;
};

type DockRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type SetTrackOpts = {
  position?: number;
  autoplay?: boolean;
  meta?: TuneMeta | null;
};

type Ctx = {
  playerReady: boolean;
  isPlaying: boolean;
  position: number;
  duration: number;
  currentVideoId: string | null;
  currentTuneMeta: TuneMeta | null;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (s: number) => void;
  setTrack: (id: string | null, opts?: SetTrackOpts) => void;
  clear: () => void;
  movePlayerTo: (rect: DockRect | null) => void;
  playerRef: React.MutableRefObject<any>;
};

const MusicContext = createContext<Ctx | null>(null);

export function MusicProvider({ children }: { children: ReactNode }) {
  const [playerReady, setPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [currentTuneMeta, setCurrentTuneMeta] = useState<TuneMeta | null>(null);

  const playerRef = useRef<any>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pendingRef = useRef<SetTrackOpts | null>(null);

  // Create the wrapper ONCE, append to body, never move it again
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const wrap = document.createElement('div');
    wrap.id = 'yt-global-wrap';
    wrap.style.cssText = `
      position: fixed;
      top: -9999px;
      left: -9999px;
      width: 320px;
      height: 180px;
      pointer-events: none;
      z-index: -1;
      overflow: hidden;
      border-radius: 12px;
      transition: none;
      background: #000;
    `;
    const inner = document.createElement('div');
    inner.id = 'yt-global';
    inner.style.cssText = 'width:100%;height:100%;';
    wrap.appendChild(inner);
    document.body.appendChild(wrap);
    wrapRef.current = wrap;

    if (window.YT && window.YT.Player) {
      setPlayerReady(true);
    } else {
      if (!document.querySelector('script[src*="iframe_api"]')) {
        const s = document.createElement('script');
        s.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(s);
      }
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        setPlayerReady(true);
      };
    }

    return () => {
      try {
        playerRef.current?.destroy?.();
      } catch {}
      playerRef.current = null;
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    };
  }, []);

  // Create / recreate YT player when videoId changes
  useEffect(() => {
    if (!playerReady || !currentVideoId) return;
    const wrap = wrapRef.current;
    if (!wrap) return;

    // Ensure inner container exists (YT replaces it once created)
    let inner = wrap.querySelector('#yt-global');
    if (!inner) {
      const fresh = document.createElement('div');
      fresh.id = 'yt-global';
      fresh.style.cssText = 'width:100%;height:100%;';
      wrap.innerHTML = '';
      wrap.appendChild(fresh);
    }

    if (playerRef.current) {
      try { playerRef.current.destroy(); } catch {}
      playerRef.current = null;
    }

    const pending = pendingRef.current ?? { position: 0, autoplay: false };
    pendingRef.current = null;

    playerRef.current = new window.YT.Player('yt-global', {
      videoId: currentVideoId,
      playerVars: {
        controls: 0,
        disablekb: 1,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        iv_load_policy: 3,
        enablejsapi: 1,
        origin: typeof window !== 'undefined' ? window.location.origin : '',
      },
      events: {
        onReady: (event: any) => {
          setDuration(event.target.getDuration() || 0);
          const pos = pending.position ?? 0;
          if (pos > 0) {
            try { event.target.seekTo(pos, true); } catch {}
          }
          if (pending.autoplay) {
            try { event.target.playVideo(); } catch {}
          }
        },
        onStateChange: (event: any) => {
          const s = event.data;
          if (s === 1) setIsPlaying(true);
          else if (s === 2) setIsPlaying(false);
        },
      },
    });
  }, [playerReady, currentVideoId]);

  // Poll position while playing
  useEffect(() => {
    if (!isPlaying) return;
    const i = setInterval(() => {
      try {
        if (playerRef.current?.getCurrentTime) {
          setPosition(playerRef.current.getCurrentTime());
        }
        if (playerRef.current?.getDuration) {
          const d = playerRef.current.getDuration();
          if (d && d > 0) setDuration(d);
        }
      } catch {}
    }, 500);
    return () => clearInterval(i);
  }, [isPlaying]);

  // Media Session
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    if (!('mediaSession' in navigator)) return;
    if (!currentTuneMeta) return;

    try {
      const MM = (window as any).MediaMetadata;
      if (MM) {
        (navigator as any).mediaSession.metadata = new MM({
          title: currentTuneMeta.title,
          artist: currentTuneMeta.artist,
          album: 'arnama',
          artwork: currentTuneMeta.artwork
            ? [{ src: currentTuneMeta.artwork, sizes: '512x512', type: 'image/jpeg' }]
            : [],
        });
      }
      (navigator as any).mediaSession.setActionHandler('play', () => {
        try { playerRef.current?.playVideo(); } catch {}
      });
      (navigator as any).mediaSession.setActionHandler('pause', () => {
        try { playerRef.current?.pauseVideo(); } catch {}
      });
      (navigator as any).mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch {}
  }, [currentTuneMeta, isPlaying]);

  function play() {
    try { playerRef.current?.playVideo(); } catch {}
  }
  function pause() {
    try { playerRef.current?.pauseVideo(); } catch {}
  }
  function toggle() {
    if (isPlaying) pause();
    else play();
  }
  function seek(s: number) {
    try {
      playerRef.current?.seekTo(s, true);
      setPosition(s);
    } catch {}
  }
  function setTrack(id: string | null, opts?: SetTrackOpts) {
    if (opts?.meta !== undefined) setCurrentTuneMeta(opts.meta);
    if (id === currentVideoId) {
      if (opts?.position !== undefined) seek(opts.position);
      if (opts?.autoplay === true) play();
      else if (opts?.autoplay === false) pause();
      return;
    }
    pendingRef.current = opts ?? { position: 0, autoplay: false };
    setCurrentVideoId(id);
  }
  function clear() {
    try { playerRef.current?.stopVideo(); } catch {}
    setCurrentVideoId(null);
    setCurrentTuneMeta(null);
    setIsPlaying(false);
    setPosition(0);
    setDuration(0);
  }

  // Move the WRAPPER's visual position — NEVER move the iframe in the DOM
  function movePlayerTo(rect: DockRect | null) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (rect) {
      wrap.style.top = `${rect.top}px`;
      wrap.style.left = `${rect.left}px`;
      wrap.style.width = `${rect.width}px`;
      wrap.style.height = `${rect.height}px`;
      wrap.style.zIndex = '10';
      wrap.style.pointerEvents = 'auto';
    } else {
      wrap.style.top = '-9999px';
      wrap.style.left = '-9999px';
      wrap.style.width = '320px';
      wrap.style.height = '180px';
      wrap.style.zIndex = '-1';
      wrap.style.pointerEvents = 'none';
    }
  }

  return (
    <MusicContext.Provider
      value={{
        playerReady,
        isPlaying,
        position,
        duration,
        currentVideoId,
        currentTuneMeta,
        play,
        pause,
        toggle,
        seek,
        setTrack,
        clear,
        movePlayerTo,
        playerRef,
      }}
    >
      {children}
    </MusicContext.Provider>
  );
}

export function useMusic() {
  const ctx = useContext(MusicContext);
  if (!ctx) {
    return {
      playerReady: false,
      isPlaying: false,
      position: 0,
      duration: 0,
      currentVideoId: null,
      currentTuneMeta: null,
      play: () => {},
      pause: () => {},
      toggle: () => {},
      seek: () => {},
      setTrack: () => {},
      clear: () => {},
      movePlayerTo: () => {},
      playerRef: { current: null },
    } as unknown as Ctx;
  }
  return ctx;
}