'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Tune = {
  id: string;
  user_email: string;
  title: string;
  url: string;
  created_at: string;
};

function getEmbedUrl(url: string): string | null {
  const trimmed = url.trim();

  // Spotify track
  const spTrack = trimmed.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
  if (spTrack) return `https://open.spotify.com/embed/track/${spTrack[1]}`;

  // Spotify album
  const spAlbum = trimmed.match(/open\.spotify\.com\/album\/([a-zA-Z0-9]+)/);
  if (spAlbum) return `https://open.spotify.com/embed/album/${spAlbum[1]}`;

  // Spotify playlist
  const spList = trimmed.match(/open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
  if (spList) return `https://open.spotify.com/embed/playlist/${spList[1]}`;

  // YouTube
  const yt = trimmed.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/
  );
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;

  return null;
}

export default function TunesPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [tunes, setTunes] = useState<Tune[]>([]);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

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
      .from('tunes')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error(error);
        else setTunes(data ?? []);
      });
  }, [email]);

  useEffect(() => {
    if (!email) return;
    const channel = supabase
      .channel('tunes-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tunes' },
        (payload) => {
          const t = payload.new as Tune;
          setTunes((prev) => {
            if (prev.some((x) => x.id === t.id)) return prev;
            return [t, ...prev];
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [email]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const t = title.trim();
    const u = url.trim();
    if (!t || !u || !email) return;

    const embed = getEmbedUrl(u);
    if (!embed) {
      setError('⚠️ Only Spotify or YouTube links work');
      return;
    }

    setAdding(true);
    const { data, error } = await supabase
      .from('tunes')
      .insert({ user_email: email, title: t, url: u })
      .select()
      .single();

    if (error) {
      setError('⚠️ ' + error.message);
    } else if (data) {
      setTunes((prev) => [data as Tune, ...prev]);
      setTitle('');
      setUrl('');
    }
    setAdding(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this tune?')) return;
    const { error } = await supabase.from('tunes').delete().eq('id', id);
    if (!error) setTunes((prev) => prev.filter((t) => t.id !== id));
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
      <div className="w-full max-w-2xl mx-auto flex flex-col gap-4">

        <div className="flex items-center justify-between shrink-0">
          <h1 className="text-xl sm:text-2xl font-black text-white">🎵 shared tunes</h1>
          <Link
            href="/"
            className="inline-flex items-center border-4 border-black bg-[#E2F0D9] text-black font-black rounded-xl shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:shadow-[7px_7px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition"
            style={{ padding: '10px 20px', gap: '10px' }}
          >
            <span className="text-base leading-none">←</span>
            <span className="text-sm leading-none">back</span>
          </Link>
        </div>

        {/* Add form */}
        <form
          onSubmit={handleAdd}
          className="border-4 border-black bg-[#E6E6FA] rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col"
          style={{ padding: '16px', gap: '10px' }}
        >
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="what's it called?"
            disabled={adding}
            className="w-full border-2 border-black rounded-lg bg-white text-black text-sm focus:outline-none disabled:opacity-50"
            style={{ padding: '11px 16px' }}
          />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="paste spotify or youtube link"
            disabled={adding}
            className="w-full border-2 border-black rounded-lg bg-white text-black text-sm focus:outline-none disabled:opacity-50"
            style={{ padding: '11px 16px' }}
          />
          {error && (
            <div
              className="border-2 border-black bg-white text-black text-sm font-bold rounded-lg"
              style={{ padding: '10px 14px' }}
            >
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={adding || !title.trim() || !url.trim()}
            className="inline-flex items-center justify-center border-2 border-black bg-[#E2F0D9] text-black text-xs font-black rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition disabled:opacity-50 disabled:hover:translate-y-0"
            style={{ padding: '11px 18px', gap: '8px' }}
          >
            <span className="text-sm leading-none">{adding ? '···' : '▶'}</span>
            <span className="leading-none tracking-wider">
              {adding ? 'ADDING' : 'ADD TUNE'}
            </span>
          </button>
        </form>

        {/* Tunes list */}
        {tunes.length === 0 ? (
          <div
            className="border-4 border-black bg-[#FFFDF5] rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] text-center"
            style={{ padding: '32px 20px' }}
          >
            <p className="text-black font-bold text-sm">
              no tunes yet — drop the first one 🎧
            </p>
          </div>
        ) : (
          <div className="flex flex-col" style={{ gap: '16px' }}>
            {tunes.map((t) => {
              const embed = getEmbedUrl(t.url);
              const addedBy = t.user_email.split('@')[0];
              const mine = t.user_email === email;
              return (
                <div
                  key={t.id}
                  className="border-4 border-black bg-[#FFFDF5] rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col"
                  style={{ padding: '14px', gap: '10px' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p
                        className="font-black text-black truncate"
                        style={{ fontSize: '14px' }}
                      >
                        {t.title}
                      </p>
                      <p
                        className="text-black/50 font-bold"
                        style={{ fontSize: '11px' }}
                      >
                        added by {mine ? 'you' : addedBy}
                      </p>
                    </div>
                    {mine && (
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="shrink-0 border-2 border-black bg-[#FFD1DC] text-black rounded-lg font-black hover:-translate-y-0.5 active:translate-y-0.5 transition"
                        style={{ padding: '6px 10px', fontSize: '11px' }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {embed && (
                    <iframe
                      src={embed}
                      width="100%"
                      height="80"
                      frameBorder="0"
                      allow="encrypted-media; clipboard-write; picture-in-picture"
                      style={{
                        border: '2px solid black',
                        borderRadius: '8px',
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}