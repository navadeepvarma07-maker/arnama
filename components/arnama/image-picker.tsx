'use client';

import { useRef, useState } from 'react';
import { Image as ImageIcon, X, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Props = {
  userId: string;
  disabled?: boolean;
  onSend: (url: string, caption: string | null) => void;
};

export function ImagePicker({ userId, disabled, onSend }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFile(null);
    setCaption('');
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleFile(f: File | null) {
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setError('only images please');
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      setError('max 8MB');
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError('');
  }

  async function upload() {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${userId}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('chat-images')
        .upload(path, file, { cacheControl: '3600', upsert: false });
      if (upErr) {
        setError('upload failed: ' + upErr.message);
        setUploading(false);
        return;
      }
      const { data: pub } = supabase.storage
        .from('chat-images')
        .getPublicUrl(path);
      const trimmedCaption = caption.trim();
      onSend(pub.publicUrl, trimmedCaption.length > 0 ? trimmedCaption : null);
      reset();
    } catch (err: any) {
      setError('upload failed');
    }
    setUploading(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!disabled && !uploading) fileRef.current?.click();
        }}
        disabled={disabled || uploading}
        aria-label="Send photo"
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          border: '2px solid black',
          background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #D4F0F0`,
          boxShadow: '3px 3px 0 0 black',
          cursor: disabled || uploading ? 'not-allowed' : 'pointer',
          opacity: disabled || uploading ? 0.5 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          touchAction: 'manipulation',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <ImageIcon className="size-5" strokeWidth={2.75} />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        style={{ display: 'none' }}
      />

      {/* PREVIEW + CAPTION SHEET */}
      {preview && (
        <>
          <div
            onClick={() => !uploading && reset()}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(26,11,46,0.75)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              zIndex: 1300,
            }}
          />
          <div
            style={{
              position: 'fixed',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%,-50%)',
              width: 'min(440px, calc(100vw - 24px))',
              maxHeight: 'calc(100vh - 40px)',
              overflowY: 'auto',
              background: `
                linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
                rgba(255,253,245,0.98)
              `,
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              border: '4px solid black',
              borderRadius: '22px',
              boxShadow: '10px 10px 0 0 black',
              padding: '16px',
              zIndex: 1301,
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 900, color: '#000' }}>
                📸 send photo
              </p>
              <button
                onClick={() => !uploading && reset()}
                aria-label="Cancel"
                style={{
                  width: '28px',
                  height: '28px',
                  border: '2px solid black',
                  borderRadius: '999px',
                  background: '#FFD1DC',
                  color: '#000',
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X className="size-3" strokeWidth={3} />
              </button>
            </div>

            {/* Image preview */}
            <div
              style={{
                width: '100%',
                maxHeight: '300px',
                border: '3px solid black',
                borderRadius: '16px',
                overflow: 'hidden',
                background: '#000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt=""
                style={{
                  maxWidth: '100%',
                  maxHeight: '300px',
                  display: 'block',
                  objectFit: 'contain',
                }}
              />
            </div>

            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="add a caption (optional)"
              maxLength={200}
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
                opacity: uploading ? 0.5 : 1,
              }}
            />

            {error && (
              <div
                style={{
                  border: '2px solid black',
                  background: '#FFFDF5',
                  color: '#000',
                  fontSize: '12px',
                  fontWeight: 800,
                  borderRadius: '12px',
                  padding: '10px 14px',
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => !uploading && reset()}
                disabled={uploading}
                style={{
                  padding: '11px 16px',
                  border: '2px solid black',
                  borderRadius: '999px',
                  background: '#FFD1DC',
                  color: '#000',
                  fontWeight: 900,
                  fontSize: '12px',
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  opacity: uploading ? 0.5 : 1,
                  flexShrink: 0,
                }}
              >
                cancel
              </button>
              <button
                onClick={upload}
                disabled={uploading}
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '11px 16px',
                  border: '2px solid black',
                  borderRadius: '999px',
                  background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #E2F0D9`,
                  color: '#000',
                  fontWeight: 900,
                  fontSize: '12px',
                  boxShadow: '3px 3px 0 0 black',
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  opacity: uploading ? 0.5 : 1,
                }}
              >
                <Send className="size-4" strokeWidth={2.75} />
                {uploading ? 'sending...' : 'send photo'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}