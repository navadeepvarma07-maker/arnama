'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { SwipeCarousel } from '@/components/arnama/swipe-carousel';
import { HiddenScroll } from '@/components/arnama/hidden-scroll';
import {
  Upload,
  X,
  ChevronLeft,
  ChevronRight,
  Camera,
  Pencil,
  Check,
} from 'lucide-react';

type Photo = {
  id: string;
  user_email: string;
  url: string;
  caption: string | null;
  created_at: string;
};

const AVATAR_COLORS = ['#E2F0D9', '#FFD1DC', '#E6E6FA', '#FFF5BA', '#D4F0F0'];
const PAPER_COLORS = ['#FFFDF5', '#FFF8EC', '#F8F4E9', '#F3F0E4', '#FFF5F7'];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

function colorFor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++)
    hash = (hash * 17 + str.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function paperFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++)
    hash = (hash * 13 + id.charCodeAt(i)) | 0;
  return PAPER_COLORS[Math.abs(hash) % PAPER_COLORS.length];
}

function tiltFor(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++)
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const angles = [-3.2, -2.1, -1.2, 1.2, 2.1, 3.2];
  return angles[Math.abs(hash) % angles.length];
}

/** Renders an image with a graceful fallback if the URL is broken. */
function SafeImg({
  src,
  alt,
  fallbackLabel,
}: {
  src: string | null | undefined;
  alt?: string;
  fallbackLabel?: string;
}) {
  const [broken, setBroken] = useState(false);
  const valid = !!src && src.trim().length > 0;

  if (!valid || broken) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: `
            linear-gradient(135deg, rgba(255,139,167,0.35) 0%, rgba(230,230,250,0.35) 100%),
            #000
          `,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          color: '#fff',
          textAlign: 'center',
          padding: '8px',
        }}
      >
        <span style={{ fontSize: '22px', lineHeight: 1 }}>📷</span>
        <span
          style={{
            fontSize: '9px',
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            opacity: 0.75,
          }}
        >
          {fallbackLabel ?? 'no preview'}
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt ?? ''}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setBroken(true)}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        display: 'block',
      }}
    />
  );
}

export default function PhotosPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);

  const [tabIndex, setTabIndex] = useState(0);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [captionDraft, setCaptionDraft] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxList, setLightboxList] = useState<Photo[]>([]);
  const [editingLightboxCaption, setEditingLightboxCaption] = useState(false);
  const [lightboxCaptionDraft, setLightboxCaptionDraft] = useState('');

  const [openPersonEmail, setOpenPersonEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      const e = user?.email ?? null;
      setEmail(e);
      setUserId(user?.id ?? null);
      if (!e) window.location.href = '/login';
      else {
        setLoading(false);
        supabase
          .from('profiles')
          .update({ last_seen_photos_at: new Date().toISOString() })
          .eq('id', user!.id)
          .then(() => {});
      }
    });
  }, []);

  useEffect(() => {
    if (!email) return;
    supabase
      .from('photos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (error) console.error(error);
        else setPhotos(data ?? []);
      });
  }, [email]);

  useEffect(() => {
    if (!email) return;
    const ch = supabase
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
        { event: 'UPDATE', schema: 'public', table: 'photos' },
        (payload) => {
          const p = payload.new as Photo;
          setPhotos((prev) => prev.map((x) => (x.id === p.id ? p : x)));
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
      supabase.removeChannel(ch);
    };
  }, [email]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !email || !userId) return;
    setUploadError('');
    setUploading(true);
    const captionForBatch = captionDraft.trim() || null;

    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        if (file.size > 8 * 1024 * 1024) {
          setUploadError('⚠️ One file is over 8 MB — skipped');
          continue;
        }
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `${userId}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from('photos')
          .upload(path, file, { cacheControl: '3600', upsert: false });

        if (upErr) {
          setUploadError('⚠️ Upload failed: ' + upErr.message);
          continue;
        }
        const { data: pub } = supabase.storage
          .from('photos')
          .getPublicUrl(path);

        const { data: row, error: insErr } = await supabase
          .from('photos')
          .insert({
            user_email: email,
            url: pub.publicUrl,
            caption: captionForBatch,
          })
          .select()
          .single();

        if (insErr) setUploadError('⚠️ Save failed: ' + insErr.message);
        else if (row) {
          setPhotos((prev) => {
            if (prev.some((x) => x.id === (row as Photo).id)) return prev;
            return [row as Photo, ...prev];
          });
        }
      }
      setCaptionDraft('');
    } catch (err: any) {
      setUploadError('⚠️ ' + (err?.message ?? 'unknown error'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDelete(p: Photo) {
    if (!confirm('Delete this photo?')) return;
    const { error } = await supabase.from('photos').delete().eq('id', p.id);
    if (error) {
      alert('⚠️ ' + error.message);
      return;
    }
    setPhotos((prev) => prev.filter((x) => x.id !== p.id));
    if (lightboxIndex !== null) setLightboxIndex(null);
  }

  async function saveCaption(photoId: string, text: string) {
    const trimmed = text.trim();
    const newCaption = trimmed.length > 0 ? trimmed : null;
    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, caption: newCaption } : p))
    );
    const { error } = await supabase
      .from('photos')
      .update({ caption: newCaption })
      .eq('id', photoId);
    if (error) alert('⚠️ Failed to save caption: ' + error.message);
  }

  function openLightbox(list: Photo[], index: number) {
    setLightboxList(list);
    setLightboxIndex(index);
    setEditingLightboxCaption(false);
  }

  function closeLightbox() {
    setLightboxIndex(null);
    setEditingLightboxCaption(false);
  }

  function lbPrev() {
    if (lightboxIndex === null) return;
    setEditingLightboxCaption(false);
    setLightboxIndex(
      (lightboxIndex - 1 + lightboxList.length) % lightboxList.length
    );
  }
  function lbNext() {
    if (lightboxIndex === null) return;
    setEditingLightboxCaption(false);
    setLightboxIndex((lightboxIndex + 1) % lightboxList.length);
  }

  useEffect(() => {
    if (lightboxIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (editingLightboxCaption) setEditingLightboxCaption(false);
        else closeLightbox();
      }
      if (editingLightboxCaption) return;
      if (e.key === 'ArrowLeft') lbPrev();
      if (e.key === 'ArrowRight') lbNext();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIndex, lightboxList, editingLightboxCaption]);

  const recentPhotos = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return photos.filter((p) => new Date(p.created_at).getTime() >= cutoff);
  }, [photos]);

  const byPerson = useMemo(() => {
    const groups: Record<string, Photo[]> = {};
    photos.forEach((p) => {
      if (!groups[p.user_email]) groups[p.user_email] = [];
      groups[p.user_email].push(p);
    });
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }, [photos]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#1a0b2e] flex items-center justify-center text-white font-mono">
        loading...
      </div>
    );
  }

  function PolaroidGrid({
    list,
    emptyMessage,
  }: {
    list: Photo[];
    emptyMessage: string;
  }) {
    if (list.length === 0) {
      return (
        <div
          className="border-4 border-black text-center shrink-0"
          style={{
            borderRadius: '18px',
            background: '#FFFDF5',
            padding: '40px 20px',
            boxShadow: '4px 4px 0 0 black',
          }}
        >
          <div style={{ fontSize: '36px', marginBottom: '10px' }}>📸</div>
          <p
            style={{
              margin: 0,
              color: '#000',
              fontWeight: 800,
              fontSize: '13px',
            }}
          >
            {emptyMessage}
          </p>
        </div>
      );
    }

    return (
      <div
        className="grid grid-cols-2 sm:grid-cols-3"
        style={{ gap: '20px 14px', paddingTop: '6px' }}
      >
        {list.map((p, i) => {
          const mine = p.user_email === email;
          const paper = paperFor(p.id);
          const tilt = tiltFor(p.id);
          return (
            <div
              key={p.id}
              className="group relative"
              style={{
                transform: `rotate(${tilt}deg)`,
                transition: 'transform 0.2s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.transform =
                  'rotate(0deg) scale(1.03)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.transform =
                  `rotate(${tilt}deg)`;
              }}
            >
              <div
                className="border-4 border-black"
                style={{
                  background: paper,
                  borderRadius: '6px',
                  boxShadow: '4px 4px 0 0 black',
                  padding: '10px 10px 0',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <button
                  onClick={() => openLightbox(list, i)}
                  style={{
                    width: '100%',
                    aspectRatio: '1 / 1',
                    border: '2px solid black',
                    borderRadius: '3px',
                    overflow: 'hidden',
                    padding: 0,
                    background: '#000',
                    cursor: 'pointer',
                    display: 'block',
                  }}
                >
                  <SafeImg
                    src={p.url}
                    alt={p.caption ?? ''}
                    fallbackLabel="tap to retry"
                  />
                </button>
                <div
                  style={{
                    padding: '10px 4px 12px',
                    minHeight: '42px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {p.caption ? (
                    <p
                      style={{
                        margin: 0,
                        fontSize: '10.5px',
                        fontWeight: 700,
                        color: '#000',
                        lineHeight: 1.3,
                        textAlign: 'center',
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        wordBreak: 'break-word',
                        maxWidth: '100%',
                      }}
                    >
                      {p.caption}
                    </p>
                  ) : (
                    <span
                      style={{
                        fontSize: '16px',
                        color: 'rgba(0,0,0,0.18)',
                        letterSpacing: '0.15em',
                      }}
                    >
                      ···
                    </span>
                  )}
                </div>
              </div>

              {mine && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(p);
                  }}
                  aria-label="Delete photo"
                  style={{
                    position: 'absolute',
                    top: '-8px',
                    right: '-8px',
                    width: '26px',
                    height: '26px',
                    borderRadius: '999px',
                    border: '2px solid black',
                    background: '#FFD1DC',
                    color: '#000',
                    fontWeight: 900,
                    fontSize: '11px',
                    lineHeight: 1,
                    boxShadow: '2px 2px 0 0 black',
                    cursor: 'pointer',
                    zIndex: 3,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: 'rotate(8deg)',
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // SLIDE 1: PHOTOS
  const photosSlide = (
    <div style={{ height: '100%', position: 'relative' }}>
      <HiddenScroll sidePadding={14} topPadding={4} bottomPadding={24}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Upload card */}
          <div
            className="border-4 border-black shrink-0"
            style={{
              borderRadius: '18px',
              background: `
                linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
                rgba(255,209,220,0.92)
              `,
              boxShadow: `
                4px 4px 0 0 black,
                inset 0 1px 0 rgba(255,255,255,0.7)
              `,
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '10px',
                background: 'transparent',
                border: 'none',
                cursor: uploading ? 'wait' : 'pointer',
                opacity: uploading ? 0.6 : 1,
                textAlign: 'left',
                width: '100%',
              }}
            >
              <span
                className="gloss-shine"
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '999px',
                  border: '4px solid black',
                  background: `
                    linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
                    #FF8BA7
                  `,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '3px 3px 0 0 black',
                }}
              >
                <Camera
                  className="size-5"
                  strokeWidth={2.75}
                  style={{ color: '#000' }}
                />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: '14px',
                    fontWeight: 900,
                    color: '#000',
                  }}
                >
                  {uploading ? 'uploading...' : 'drop some photos'}
                </p>
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'rgba(0,0,0,0.55)',
                  }}
                >
                  tap to pick from your phone · up to 8 MB
                </p>
              </div>
              <Upload
                className="size-5"
                strokeWidth={2.75}
                style={{ color: '#000', flexShrink: 0 }}
              />
            </button>

            <div
              style={{
                borderTop: '3px dashed rgba(0,0,0,0.2)',
                paddingTop: '10px',
              }}
            >
              <input
                type="text"
                value={captionDraft}
                onChange={(e) => setCaptionDraft(e.target.value)}
                placeholder="caption for this batch (optional)"
                maxLength={140}
                disabled={uploading}
                style={{
                  width: '100%',
                  border: '2px solid black',
                  borderRadius: '14px',
                  background: '#FFFDF5',
                  color: '#000',
                  fontSize: '13px',
                  padding: '10px 14px',
                  outline: 'none',
                  fontWeight: 700,
                  fontFamily: 'inherit',
                }}
              />
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            style={{ display: 'none' }}
          />

          {uploadError && (
            <div
              style={{
                border: '2px solid black',
                background: '#FFFDF5',
                color: '#000',
                fontSize: '13px',
                fontWeight: 800,
                borderRadius: '12px',
                padding: '10px 14px',
              }}
            >
              {uploadError}
            </div>
          )}

          {photos.length === 0 ? (
            <PolaroidGrid
              list={[]}
              emptyMessage="no photos yet — drop the first one 📸"
            />
          ) : (
            <>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: '11px',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: 'rgba(255,253,245,0.55)',
                  paddingLeft: '4px',
                }}
              >
                📷 the wall
              </p>
              <PolaroidGrid list={photos} emptyMessage="no photos yet" />
            </>
          )}
        </div>
      </HiddenScroll>
    </div>
  );

  // SLIDE 2: RECENT
  const recentSlide = (
    <div style={{ height: '100%', position: 'relative' }}>
      <HiddenScroll sidePadding={14} topPadding={4} bottomPadding={24}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {recentPhotos.length === 0 ? (
            <div
              className="border-4 border-black text-center"
              style={{
                borderRadius: '18px',
                background: '#FFFDF5',
                padding: '40px 20px',
                boxShadow: '4px 4px 0 0 black',
              }}
            >
              <div style={{ fontSize: '36px', marginBottom: '10px' }}>🎞️</div>
              <p
                style={{
                  margin: 0,
                  color: '#000',
                  fontWeight: 800,
                  fontSize: '13px',
                }}
              >
                no new photos this week
              </p>
            </div>
          ) : (
            <>
              <div
                className="border-4 border-black shrink-0"
                style={{
                  borderRadius: '18px',
                  background: `
                    linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
                    rgba(226,240,217,0.92)
                  `,
                  boxShadow: `
                    5px 5px 0 0 black,
                    inset 0 1px 0 rgba(255,255,255,0.75)
                  `,
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    paddingLeft: '4px',
                  }}
                >
                  <span
                    className="gloss-shine"
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '999px',
                      border: '3px solid black',
                      background: `
                        linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
                        ${colorFor(recentPhotos[0].user_email)}
                      `,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                      fontSize: '11px',
                      color: '#000',
                      flexShrink: 0,
                    }}
                  >
                    {recentPhotos[0].user_email.slice(0, 2).toUpperCase()}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '12px',
                        fontWeight: 900,
                        color: '#000',
                      }}
                    >
                      ⭐ freshest moment
                    </p>
                    <p
                      style={{
                        margin: '2px 0 0',
                        fontSize: '10px',
                        fontWeight: 800,
                        color: 'rgba(0,0,0,0.55)',
                      }}
                    >
                      {recentPhotos[0].user_email.split('@')[0]} ·{' '}
                      {timeAgo(recentPhotos[0].created_at)}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <div style={{ maxWidth: '340px', width: '100%' }}>
                    {(() => {
                      const hp = recentPhotos[0];
                      return (
                        <div
                          className="border-4 border-black"
                          style={{
                            background: paperFor(hp.id),
                            borderRadius: '6px',
                            boxShadow: '5px 5px 0 0 black',
                            padding: '10px 10px 0',
                            transform: 'rotate(-1.5deg)',
                          }}
                        >
                          <button
                            onClick={() => openLightbox(recentPhotos, 0)}
                            style={{
                              width: '100%',
                              aspectRatio: '1 / 1',
                              border: '2px solid black',
                              borderRadius: '3px',
                              overflow: 'hidden',
                              padding: 0,
                              background: '#000',
                              cursor: 'pointer',
                              display: 'block',
                            }}
                          >
                            <SafeImg src={hp.url} />
                          </button>
                          <div
                            style={{
                              padding: '10px 4px 12px',
                              minHeight: '42px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {hp.caption ? (
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  color: '#000',
                                  lineHeight: 1.3,
                                  textAlign: 'center',
                                  overflow: 'hidden',
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  wordBreak: 'break-word',
                                }}
                              >
                                {hp.caption}
                              </p>
                            ) : (
                              <span
                                style={{
                                  fontSize: '16px',
                                  color: 'rgba(0,0,0,0.18)',
                                  letterSpacing: '0.15em',
                                }}
                              >
                                ···
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {recentPhotos.length > 1 && (
                <>
                  <p
                    style={{
                      margin: '4px 0 0',
                      fontSize: '11px',
                      fontWeight: 900,
                      textTransform: 'uppercase',
                      letterSpacing: '0.12em',
                      color: 'rgba(255,253,245,0.55)',
                      paddingLeft: '4px',
                    }}
                  >
                    🌱 earlier this week
                  </p>
                  <PolaroidGrid list={recentPhotos.slice(1)} emptyMessage="" />
                </>
              )}
            </>
          )}
        </div>
      </HiddenScroll>
    </div>
  );

  // SLIDE 3: BY PERSON
  const openPersonPhotos = openPersonEmail
    ? byPerson.find(([e]) => e === openPersonEmail)?.[1] ?? []
    : [];

  const byPersonSlide = (
    <div style={{ height: '100%', position: 'relative' }}>
      <HiddenScroll sidePadding={14} topPadding={4} bottomPadding={24}>
        {openPersonEmail ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              className="border-4 border-black shrink-0"
              style={{
                borderRadius: '18px',
                background: `
                  linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
                  rgba(255,253,245,0.92)
                `,
                boxShadow: `
                  4px 4px 0 0 black,
                  inset 0 1px 0 rgba(255,255,255,0.75)
                `,
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <button
                onClick={() => setOpenPersonEmail(null)}
                aria-label="Back to people"
                style={{
                  width: '36px',
                  height: '36px',
                  border: '2px solid black',
                  borderRadius: '999px',
                  background: '#FFD1DC',
                  color: '#000',
                  fontWeight: 900,
                  fontSize: '15px',
                  lineHeight: 1,
                  boxShadow: '2px 2px 0 0 black',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                ‹
              </button>
              <span
                className="gloss-shine"
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '999px',
                  border: '3px solid black',
                  background: `
                    linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
                    ${colorFor(openPersonEmail)}
                  `,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  fontSize: '12px',
                  color: '#000',
                  flexShrink: 0,
                }}
              >
                {openPersonEmail.slice(0, 2).toUpperCase()}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: '14px',
                    fontWeight: 900,
                    color: '#000',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {openPersonEmail === email
                    ? `${openPersonEmail.split('@')[0]} (you)`
                    : openPersonEmail.split('@')[0]}
                </p>
                <p
                  style={{
                    margin: '2px 0 0',
                    fontSize: '10px',
                    fontWeight: 800,
                    color: 'rgba(0,0,0,0.5)',
                  }}
                >
                  {openPersonPhotos.length} photo
                  {openPersonPhotos.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>

            <PolaroidGrid
              list={openPersonPhotos}
              emptyMessage="no photos from this person"
            />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {byPerson.length === 0 ? (
              <div
                className="border-4 border-black text-center"
                style={{
                  borderRadius: '18px',
                  background: '#FFFDF5',
                  padding: '40px 20px',
                  boxShadow: '4px 4px 0 0 black',
                }}
              >
                <div style={{ fontSize: '36px', marginBottom: '10px' }}>👥</div>
                <p
                  style={{
                    margin: 0,
                    color: '#000',
                    fontWeight: 800,
                    fontSize: '13px',
                  }}
                >
                  no photos yet
                </p>
              </div>
            ) : (
              <>
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: '11px',
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                    color: 'rgba(255,253,245,0.55)',
                    paddingLeft: '4px',
                  }}
                >
                  👥 tap a person to see their photos
                </p>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '20px 14px',
                    paddingTop: '6px',
                  }}
                >
                  {byPerson.map(([personEmail, list]) => {
                    const isMe = personEmail === email;
                    const prefix = personEmail.split('@')[0];
                    const initials = prefix.slice(0, 2).toUpperCase();
                    const avatarBg = colorFor(personEmail);
                    const latest = list[0];
                    const tilt = 0;

                    return (
                      <button
                        key={personEmail}
                        onClick={() => setOpenPersonEmail(personEmail)}
                        className="border-4 border-black hover:-translate-y-0.5 active:translate-y-0.5 transition"
                        style={{
                          borderRadius: '6px',
                          background: paperFor(personEmail),
                          boxShadow: '4px 4px 0 0 black',
                          padding: '10px 10px 0',
                          display: 'flex',
                          flexDirection: 'column',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transform: `rotate(${tilt}deg)`,
                        }}
                      >
                        <div
                          style={{
                            width: '100%',
                            aspectRatio: '1 / 1',
                            border: '2px solid black',
                            borderRadius: '3px',
                            overflow: 'hidden',
                            background: '#000',
                          }}
                        >
                          <SafeImg
                            src={latest?.url}
                            fallbackLabel={prefix}
                          />
                        </div>

                        <div
                          style={{
                            padding: '10px 4px 12px',
                            minHeight: '42px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            justifyContent: 'center',
                          }}
                        >
                          <span
                            className="gloss-shine"
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '999px',
                              border: '2px solid black',
                              background: `
                                linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
                                ${avatarBg}
                              `,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 900,
                              fontSize: '9px',
                              color: '#000',
                              flexShrink: 0,
                            }}
                          >
                            {initials}
                          </span>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <p
                              style={{
                                margin: 0,
                                fontSize: '11px',
                                fontWeight: 900,
                                color: '#000',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {isMe ? `${prefix} (you)` : prefix}
                            </p>
                            <p
                              style={{
                                margin: '1px 0 0',
                                fontSize: '9px',
                                fontWeight: 800,
                                color: 'rgba(0,0,0,0.5)',
                              }}
                            >
                              {list.length} photo{list.length === 1 ? '' : 's'}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </HiddenScroll>
    </div>
  );

  const lightboxPhoto =
    lightboxIndex !== null ? lightboxList[lightboxIndex] : null;
  const lightboxMine = lightboxPhoto?.user_email === email;

  return (
    <div className="fixed inset-0 bg-[#1a0b2e] font-mono flex flex-col overflow-hidden">
      <div
        className="mx-auto flex w-full max-w-3xl flex-1 min-h-0 flex-col gap-2 sm:gap-4"
        style={{
          paddingTop: 'max(8px, env(safe-area-inset-top))',
          paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
          paddingLeft: 'max(8px, env(safe-area-inset-left))',
          paddingRight: 'max(8px, env(safe-area-inset-right))',
        }}
      >
        <div className="flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="gloss-shine flex size-10 shrink-0 items-center justify-center rounded-2xl border-4 border-black"
              style={{
                background: `
                  linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
                  #FFD1DC
                `,
                fontSize: '18px',
              }}
            >
              📸
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-black text-lg leading-tight text-white">
                photos
              </h1>
              <p className="text-[10px] font-bold leading-tight text-white/60 truncate">
                {photos.length} photo{photos.length === 1 ? '' : 's'} ·{' '}
                {recentPhotos.length} this week
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex items-center justify-center border-4 border-black bg-[#E2F0D9] text-black font-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition shrink-0"
            style={{
              padding: '8px 12px',
              fontSize: '14px',
              minWidth: '44px',
              minHeight: '44px',
            }}
          >
            ←
          </Link>
        </div>

        <SwipeCarousel
          mode="fill"
          index={tabIndex}
          onIndexChange={(i) => {
            setTabIndex(i);
            if (i !== 2) setOpenPersonEmail(null);
          }}
          labels={[
            '📸 photos',
            `🎞️ recent${
              recentPhotos.length > 0 ? ` · ${recentPhotos.length}` : ''
            }`,
            '👥 by person',
          ]}
          slides={[photosSlide, recentSlide, byPersonSlide]}
        />
      </div>

      {lightboxPhoto && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(26, 11, 46, 0.92)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            gap: '14px',
          }}
          onClick={closeLightbox}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: '20px',
              left: '16px',
              right: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
            }}
          >
            <div
              style={{
                background: 'rgba(255,253,245,0.92)',
                border: '3px solid black',
                borderRadius: '999px',
                padding: '6px 14px',
                fontSize: '11px',
                fontWeight: 900,
                color: '#000',
                boxShadow: '2px 2px 0 0 black',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              {lightboxPhoto.user_email.split('@')[0]} ·{' '}
              {timeAgo(lightboxPhoto.created_at)}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {lightboxMine && (
                <button
                  onClick={() => handleDelete(lightboxPhoto)}
                  style={{
                    height: '40px',
                    padding: '0 14px',
                    borderRadius: '999px',
                    border: '3px solid black',
                    background: '#FF8BA7',
                    color: '#000',
                    fontWeight: 900,
                    fontSize: '11px',
                    cursor: 'pointer',
                    boxShadow: '3px 3px 0 0 black',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  🗑 delete
                </button>
              )}
              <button
                onClick={closeLightbox}
                aria-label="Close"
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '999px',
                  border: '3px solid black',
                  background: '#FFD1DC',
                  color: '#000',
                  cursor: 'pointer',
                  boxShadow: '3px 3px 0 0 black',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <X className="size-5" strokeWidth={3} />
              </button>
            </div>
          </div>

          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '100%',
              maxHeight: '65vh',
              border: '4px solid black',
              borderRadius: '20px',
              overflow: 'hidden',
              background: '#000',
              boxShadow: '8px 8px 0 0 black',
            }}
          >
            <SafeImg src={lightboxPhoto.url} />
          </div>

          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '480px',
              width: '100%',
              background: 'rgba(255,253,245,0.95)',
              border: '3px solid black',
              borderRadius: '16px',
              padding: '12px 16px',
              boxShadow: '4px 4px 0 0 black',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
            }}
          >
            {editingLightboxCaption ? (
              <>
                <input
                  type="text"
                  value={lightboxCaptionDraft}
                  onChange={(e) => setLightboxCaptionDraft(e.target.value)}
                  autoFocus
                  maxLength={140}
                  placeholder="add a caption..."
                  style={{
                    flex: 1,
                    minWidth: 0,
                    border: '2px solid black',
                    borderRadius: '10px',
                    background: '#FFFDF5',
                    color: '#000',
                    fontSize: '13px',
                    padding: '8px 12px',
                    outline: 'none',
                    fontWeight: 700,
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      saveCaption(lightboxPhoto.id, lightboxCaptionDraft);
                      setEditingLightboxCaption(false);
                    }
                    if (e.key === 'Escape') {
                      setEditingLightboxCaption(false);
                    }
                  }}
                />
                <button
                  onClick={() => {
                    saveCaption(lightboxPhoto.id, lightboxCaptionDraft);
                    setEditingLightboxCaption(false);
                  }}
                  style={{
                    height: '34px',
                    padding: '0 12px',
                    borderRadius: '10px',
                    border: '2px solid black',
                    background: '#E2F0D9',
                    color: '#000',
                    fontWeight: 900,
                    fontSize: '11px',
                    cursor: 'pointer',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Check className="size-3" strokeWidth={3} />
                  save
                </button>
              </>
            ) : (
              <>
                <p
                  style={{
                    flex: 1,
                    minWidth: 0,
                    margin: 0,
                    fontSize: '13px',
                    fontWeight: 700,
                    color: lightboxPhoto.caption ? '#000' : 'rgba(0,0,0,0.4)',
                    lineHeight: 1.4,
                    wordBreak: 'break-word',
                    fontStyle: lightboxPhoto.caption ? 'normal' : 'italic',
                  }}
                >
                  {lightboxPhoto.caption || 'no caption yet'}
                </p>
                {lightboxMine && (
                  <button
                    onClick={() => {
                      setLightboxCaptionDraft(lightboxPhoto.caption ?? '');
                      setEditingLightboxCaption(true);
                    }}
                    aria-label="Edit caption"
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '10px',
                      border: '2px solid black',
                      background: '#FFF5BA',
                      color: '#000',
                      cursor: 'pointer',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Pencil className="size-4" strokeWidth={2.75} />
                  </button>
                )}
              </>
            )}
          </div>

          {lightboxList.length > 1 && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                display: 'flex',
                gap: '14px',
                alignItems: 'center',
              }}
            >
              <button
                onClick={lbPrev}
                aria-label="Previous"
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '999px',
                  border: '3px solid black',
                  background: '#E2F0D9',
                  color: '#000',
                  cursor: 'pointer',
                  boxShadow: '3px 3px 0 0 black',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ChevronLeft className="size-6" strokeWidth={3} />
              </button>
              <div
                style={{
                  background: 'rgba(255,253,245,0.92)',
                  border: '3px solid black',
                  borderRadius: '999px',
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: 900,
                  color: '#000',
                  boxShadow: '2px 2px 0 0 black',
                }}
              >
                {lightboxIndex! + 1} / {lightboxList.length}
              </div>
              <button
                onClick={lbNext}
                aria-label="Next"
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '999px',
                  border: '3px solid black',
                  background: '#E2F0D9',
                  color: '#000',
                  cursor: 'pointer',
                  boxShadow: '3px 3px 0 0 black',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ChevronRight className="size-6" strokeWidth={3} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}