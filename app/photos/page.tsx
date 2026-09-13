'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Photo = {
  id: string;
  user_email: string;
  url: string;
  storage_path: string;
  caption: string | null;
  created_at: string;
};

function tiltFor(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const angles = [-4, -2, 0, 2, 4];
  return angles[Math.abs(hash) % angles.length];
}

const COLORS = ['#FFD1DC', '#E2F0D9', '#E6E6FA', '#FFF5BA', '#D4F0F0'];

function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 17 + id.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

export default function PhotosPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lightbox state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Auth + mark caught-up
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      const e = user?.email ?? null;
      setEmail(e);
      setUserId(user?.id ?? null);
      if (!e) {
        window.location.href = '/login';
      } else {
        setLoading(false);
        supabase
          .from('profiles')
          .update({ last_seen_photos_at: new Date().toISOString() })
          .eq('id', user!.id)
          .then(({ error }) => {
            if (error) console.error('last_seen_photos update failed:', error);
          });
      }
    });
  }, []);

  // Load photos
  useEffect(() => {
    if (!email) return;
    supabase
      .from('photos')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error(error);
        else setPhotos(data ?? []);
      });
  }, [email]);

  // Real-time
  useEffect(() => {
    if (!email) return;
    const channel = supabase
      .channel('photos-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'photos' },
        (payload) => {
          const p = payload.new as Photo;
          setPhotos((prev) => {
            if (prev.some((x) => x.id === p.id)) return prev;
            return [p, ...prev];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'photos' },
        (payload) => {
          const p = payload.old as { id: string };
          setPhotos((prev) => prev.filter((x) => x.id !== p.id));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [email]);

  // Preview URL
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Keyboard nav for lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightboxIndex(null);
      if (e.key === 'ArrowRight') {
        setLightboxIndex((i) =>
          i === null ? null : Math.min(photos.length - 1, i + 1)
        );
      }
      if (e.key === 'ArrowLeft') {
        setLightboxIndex((i) => (i === null ? null : Math.max(0, i - 1)));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIndex, photos.length]);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError('');
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      setError('⚠️ Max file size is 5 MB');
      return;
    }
    if (!f.type.startsWith('image/')) {
      setError('⚠️ Only images are allowed');
      return;
    }
    setFile(f);
  }

  function cancelUpload() {
    setFile(null);
    setCaption('');
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleUpload() {
    if (!file || !email || !userId) return;
    setUploading(true);
    setError('');

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const filename = `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;
      const path = `${userId}/${filename}`;

      const { error: upErr } = await supabase.storage
        .from('photos')
        .upload(path, file, { cacheControl: '3600', upsert: false });

      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage
        .from('photos')
        .getPublicUrl(path);

      const publicUrl = urlData.publicUrl;

      const { data, error: insErr } = await supabase
        .from('photos')
        .insert({
          user_email: email,
          url: publicUrl,
          storage_path: path,
          caption: caption.trim() || null,
        })
        .select()
        .single();

      if (insErr) {
        await supabase.storage.from('photos').remove([path]);
        throw insErr;
      }

      if (data) {
        setPhotos((prev) => {
          if (prev.some((x) => x.id === (data as Photo).id)) return prev;
          return [data as Photo, ...prev];
        });
      }

      cancelUpload();
    } catch (err: any) {
      console.error(err);
      setError('⚠️ ' + (err?.message ?? 'Upload failed'));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(p: Photo) {
    if (!confirm('Delete this photo?')) return;
    const { error: stErr } = await supabase.storage
      .from('photos')
      .remove([p.storage_path]);
    if (stErr) console.error('storage delete failed', stErr);
    const { error: dbErr } = await supabase
      .from('photos')
      .delete()
      .eq('id', p.id);
    if (!dbErr) {
      setPhotos((prev) => prev.filter((x) => x.id !== p.id));
      if (lightboxIndex !== null) setLightboxIndex(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a0b2e] flex items-center justify-center text-white font-mono">
        loading...
      </div>
    );
  }

  const current = lightboxIndex !== null ? photos[lightboxIndex] : null;

  return (
    <div className="min-h-screen bg-[#1a0b2e] p-4 sm:p-6 font-mono flex flex-col">
      <div className="w-full max-w-3xl mx-auto flex flex-col gap-4">

        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <h1 className="text-xl sm:text-2xl font-black text-white">📸 photo dump</h1>
          <Link
            href="/"
            className="inline-flex items-center border-4 border-black bg-[#E2F0D9] text-black font-black rounded-xl shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:shadow-[7px_7px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition"
            style={{ padding: '10px 20px', gap: '10px' }}
          >
            <span className="text-base leading-none">←</span>
            <span className="text-sm leading-none">back</span>
          </Link>
        </div>

        {/* Upload panel */}
        <div
          className="border-4 border-black rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
          style={{ backgroundColor: '#E6E6FA', padding: '16px' }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={pickFile}
            style={{ display: 'none' }}
          />

          {!file ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center border-4 border-dashed border-black rounded-xl bg-white/60 hover:bg-white transition"
              style={{ padding: '32px 20px', gap: '8px', cursor: 'pointer' }}
            >
              <span style={{ fontSize: '32px', lineHeight: 1 }}>＋</span>
              <span
                className="font-black uppercase tracking-wider"
                style={{ fontSize: '12px', color: 'black' }}
              >
                pick a photo
              </span>
              <span
                className="font-bold"
                style={{ fontSize: '10px', color: 'rgba(0,0,0,0.5)' }}
              >
                jpg · png · gif · webp · max 5 MB
              </span>
            </button>
          ) : (
            <div className="flex flex-col" style={{ gap: '12px' }}>
              <div
                className="border-4 border-black rounded-xl bg-black flex items-center justify-center overflow-hidden"
                style={{ maxHeight: '280px' }}
              >
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="preview"
                    style={{
                      maxHeight: '280px',
                      maxWidth: '100%',
                      display: 'block',
                    }}
                  />
                )}
              </div>
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="add a caption (optional)"
                maxLength={120}
                disabled={uploading}
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
              <div className="flex" style={{ gap: '10px' }}>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={uploading}
                  className="flex-1 inline-flex items-center justify-center border-2 border-black bg-[#E2F0D9] text-black text-xs font-black rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition disabled:opacity-50 disabled:hover:translate-y-0"
                  style={{ padding: '11px 18px', gap: '8px' }}
                >
                  <span className="text-sm leading-none">
                    {uploading ? '···' : '▶'}
                  </span>
                  <span className="leading-none tracking-wider">
                    {uploading ? 'UPLOADING' : 'POST PHOTO'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={cancelUpload}
                  disabled={uploading}
                  className="border-2 border-black bg-[#FFD1DC] text-black text-xs font-black rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition disabled:opacity-50"
                  style={{ padding: '11px 18px' }}
                >
                  cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Wall */}
        {photos.length === 0 ? (
          <div
            className="border-4 border-black bg-[#FFFDF5] rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] text-center"
            style={{ padding: '40px 20px' }}
          >
            <p className="text-black font-bold text-sm">
              no photos yet — be the first to post 📸
            </p>
          </div>
        ) : (
          <div
            className="grid gap-5"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              paddingTop: '8px',
            }}
          >
            {photos.map((p, i) => {
              const tilt = tiltFor(p.id);
              const color = colorFor(p.id);
              const mine = p.user_email === email;
              const addedBy = p.user_email.split('@')[0];
              return (
                <div
                  key={p.id}
                  className="relative border-4 border-black shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:z-10 transition-all"
                  style={{
                    backgroundColor: color,
                    padding: '10px 10px 56px 10px',
                    transform: `rotate(${tilt}deg)`,
                    transition: 'transform 0.2s, box-shadow 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = `rotate(0deg) scale(1.03)`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = `rotate(${tilt}deg)`;
                  }}
                >
                  {/* Poster sticker */}
                  <div
                    className="absolute border-2 border-black font-black truncate"
                    style={{
                      top: '-10px',
                      left: '10px',
                      backgroundColor: mine ? '#9BC5A8' : '#FFC9C9',
                      color: 'black',
                      fontSize: '10px',
                      padding: '3px 10px',
                      borderRadius: '10px',
                      textTransform: 'lowercase',
                      letterSpacing: '0.02em',
                      maxWidth: 'calc(100% - 60px)',
                      boxShadow: '2px 2px 0 0 black',
                    }}
                  >
                    {mine ? 'you' : addedBy}
                  </div>

                  {/* Image — click to open lightbox */}
                  <button
                    onClick={() => setLightboxIndex(i)}
                    className="border-2 border-black overflow-hidden bg-black block w-full cursor-zoom-in"
                    style={{ aspectRatio: '1 / 1', padding: 0 }}
                    aria-label={`View photo ${i + 1}`}
                  >
                    <img
                      src={p.url}
                      alt={p.caption ?? 'photo'}
                      loading="lazy"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                  </button>

                  {/* Caption */}
                  <div
                    className="absolute font-bold truncate"
                    style={{
                      bottom: '8px',
                      left: '12px',
                      right: '12px',
                      fontSize: '11px',
                      color: 'black',
                    }}
                  >
                    {p.caption || (
                      <span style={{ opacity: 0.4, fontStyle: 'italic' }}>
                        no caption
                      </span>
                    )}
                  </div>

                  {mine && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(p);
                      }}
                      className="absolute border-2 border-black bg-[#FFD1DC] text-black font-black hover:-translate-y-0.5 active:translate-y-0.5 transition"
                      style={{
                        top: '-10px',
                        right: '-10px',
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        fontSize: '12px',
                        lineHeight: 1,
                        zIndex: 5,
                      }}
                      aria-label="Delete photo"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {current && (
        <div
          onClick={() => setLightboxIndex(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(10,4,25,0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            zIndex: 100,
            cursor: 'zoom-out',
          }}
        >
          {/* Close */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLightboxIndex(null);
            }}
            className="border-4 border-black bg-[#FFD1DC] text-black font-black hover:-translate-y-0.5 active:translate-y-0.5 transition"
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              width: '44px',
              height: '44px',
              borderRadius: '14px',
              fontSize: '18px',
              lineHeight: 1,
              boxShadow: '4px 4px 0 0 black',
              zIndex: 2,
            }}
            aria-label="Close"
          >
            ✕
          </button>

          {/* Prev */}
          {lightboxIndex !== null && lightboxIndex > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex(lightboxIndex - 1);
              }}
              className="border-4 border-black bg-[#E6E6FA] text-black font-black hover:-translate-y-0.5 active:translate-y-0.5 transition"
              style={{
                position: 'absolute',
                left: '20px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '44px',
                height: '44px',
                borderRadius: '14px',
                fontSize: '18px',
                lineHeight: 1,
                boxShadow: '4px 4px 0 0 black',
                zIndex: 2,
              }}
              aria-label="Previous"
            >
              ‹
            </button>
          )}

          {/* Next */}
          {lightboxIndex !== null && lightboxIndex < photos.length - 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex(lightboxIndex + 1);
              }}
              className="border-4 border-black bg-[#E6E6FA] text-black font-black hover:-translate-y-0.5 active:translate-y-0.5 transition"
              style={{
                position: 'absolute',
                right: '20px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '44px',
                height: '44px',
                borderRadius: '14px',
                fontSize: '18px',
                lineHeight: 1,
                boxShadow: '4px 4px 0 0 black',
                zIndex: 2,
              }}
              aria-label="Next"
            >
              ›
            </button>
          )}

          {/* Content */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              cursor: 'default',
            }}
          >
            <img
              src={current.url}
              alt={current.caption ?? 'photo'}
              style={{
                maxWidth: '90vw',
                maxHeight: '75vh',
                border: '4px solid black',
                borderRadius: '12px',
                boxShadow: '8px 8px 0 0 rgba(0,0,0,1)',
                backgroundColor: '#000',
                display: 'block',
              }}
            />
            <div
              className="border-4 border-black font-bold text-center"
              style={{
                backgroundColor: '#FFFDF5',
                color: 'black',
                padding: '10px 18px',
                borderRadius: '12px',
                boxShadow: '4px 4px 0 0 black',
                maxWidth: '90vw',
              }}
            >
              <p style={{ fontSize: '13px', margin: 0 }}>
                {current.caption || (
                  <em style={{ opacity: 0.4 }}>no caption</em>
                )}
              </p>
              <p
                style={{
                  fontSize: '10px',
                  margin: '4px 0 0',
                  color: 'rgba(0,0,0,0.55)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                posted by{' '}
                {current.user_email === email
                  ? 'you'
                  : current.user_email.split('@')[0]}{' '}
                ·{' '}
                {new Date(current.created_at).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                })}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}