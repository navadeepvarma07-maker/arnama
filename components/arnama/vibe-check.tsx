'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { VIBE_EMOJIS, todayStr } from '@/lib/vibe';
import { X, Check } from 'lucide-react';

type Vibe = {
  id: string;
  user_id: string;
  user_email: string;
  emoji: string;
  text: string | null;
  date: string;
  created_at: string;
};

export function VibeCheck() {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [vibes, setVibes] = useState<Vibe[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const today = todayStr();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setEmail(data.user?.email ?? null);
    });
  }, []);

  function reload() {
    supabase
      .from('vibe_checks')
      .select('*')
      .eq('date', today)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error(error);
        else setVibes(data ?? []);
        setLoading(false);
      });
  }

  useEffect(() => {
    if (!email) return;
    reload();
  }, [email, today]);

  useEffect(() => {
    if (!email) return;
    const channel = supabase
      .channel('vibes-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vibe_checks' },
        () => reload()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [email, today]);

  const myVibe = vibes.find((v) => v.user_email === email);

  async function saveVibe() {
    if (!userId || !email || !selectedEmoji) return;
    setSaving(true);
    const cleanText = text.trim().slice(0, 60) || null;

    if (myVibe) {
      const { error } = await supabase
        .from('vibe_checks')
        .update({
          emoji: selectedEmoji,
          text: cleanText,
          updated_at: new Date().toISOString(),
        })
        .eq('id', myVibe.id);
      if (error) alert('⚠️ ' + error.message);
    } else {
      const { error } = await supabase.from('vibe_checks').insert({
        user_id: userId,
        user_email: email,
        emoji: selectedEmoji,
        text: cleanText,
        date: today,
      });
      if (error) alert('⚠️ ' + error.message);
    }
    setSaving(false);
    setPickerOpen(false);
  }

  function openPicker() {
    if (myVibe) {
      setSelectedEmoji(myVibe.emoji);
      setText(myVibe.text ?? '');
    } else {
      setSelectedEmoji(null);
      setText('');
    }
    setPickerOpen(true);
  }

  if (loading) return null;

  return (
    <>
      <div
        className="border-4 border-black rounded-2xl shrink-0"
        style={{
          background: `
            linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
            rgba(255,253,245,0.92)
          `,
          backdropFilter: 'blur(14px) saturate(160%)',
          WebkitBackdropFilter: 'blur(14px) saturate(160%)',
          boxShadow: `
            6px 6px 0 0 black,
            inset 0 1px 0 rgba(255,255,255,0.7)
          `,
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <div className="flex items-center justify-between">
          <p
            className="font-black"
            style={{
              margin: 0,
              fontSize: '11px',
              color: '#000',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            ✨ daily vibe
          </p>
          <button
            onClick={openPicker}
            className="border-2 border-black rounded-full font-black transition hover:-translate-y-0.5 active:translate-y-0.5"
            style={{
              padding: '4px 12px',
              fontSize: '10px',
              background: myVibe
                ? 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFF5BA'
                : 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFD1DC',
              color: '#000',
              boxShadow: '2px 2px 0 0 black',
              cursor: 'pointer',
            }}
          >
            {myVibe ? '✏️ edit' : '+ check in'}
          </button>
        </div>

        {vibes.length === 0 ? (
          <p
            style={{
              margin: 0,
              fontSize: '11px',
              fontWeight: 700,
              color: 'rgba(0,0,0,0.5)',
              fontStyle: 'italic',
            }}
          >
            nobody's checked in today. be the first ✨
          </p>
        ) : (
          <div className="flex flex-wrap" style={{ gap: '6px' }}>
            {vibes.map((v) => {
              const isMe = v.user_email === email;
              const name = v.user_email.split('@')[0];
              return (
                <button
                  key={v.id}
                  onClick={isMe ? openPicker : undefined}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '5px 10px',
                    border: '2px solid black',
                    borderRadius: '999px',
                    background: isMe
                      ? 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #E2F0D9'
                      : 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFFDF5',
                    boxShadow: '2px 2px 0 0 black',
                    cursor: isMe ? 'pointer' : 'default',
                    fontSize: '11px',
                    fontWeight: 800,
                    color: '#000',
                    lineHeight: 1,
                  }}
                  title={v.text ?? ''}
                >
                  <span style={{ fontSize: '14px' }}>{v.emoji}</span>
                  <span>{isMe ? 'you' : name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* PICKER MODAL */}
      {pickerOpen && (
        <>
          <div
            onClick={() => setPickerOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(26,11,46,0.55)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              zIndex: 1000,
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%,-50%)',
              width: 'min(400px, calc(100vw - 32px))',
              background: `
                linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
                rgba(255,253,245,0.98)
              `,
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              border: '4px solid black',
              borderRadius: '22px',
              boxShadow: '10px 10px 0 0 black',
              padding: '18px',
              zIndex: 1001,
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: '13px',
                  fontWeight: 900,
                  color: '#000',
                }}
              >
                how are you feeling today?
              </p>
              <button
                onClick={() => setPickerOpen(false)}
                style={{
                  width: '28px',
                  height: '28px',
                  border: '2px solid black',
                  borderRadius: '999px',
                  background: '#FFD1DC',
                  color: '#000',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X className="size-3" strokeWidth={3} />
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '8px',
              }}
            >
              {VIBE_EMOJIS.map((emoji) => {
                const active = selectedEmoji === emoji;
                return (
                  <button
                    key={emoji}
                    onClick={() => setSelectedEmoji(emoji)}
                    style={{
                      aspectRatio: '1 / 1',
                      border: '3px solid black',
                      borderRadius: '14px',
                      background: active
                        ? 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FF8BA7'
                        : 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFFDF5',
                      cursor: 'pointer',
                      fontSize: '26px',
                      lineHeight: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: active
                        ? '3px 3px 0 0 black'
                        : '2px 2px 0 0 black',
                      padding: 0,
                    }}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>

            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="one line? (optional)"
              maxLength={60}
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
              }}
            />

            <button
              onClick={saveVibe}
              disabled={!selectedEmoji || saving}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '11px',
                border: '3px solid black',
                borderRadius: '999px',
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #E2F0D9',
                color: '#000',
                fontWeight: 900,
                fontSize: '12px',
                boxShadow: '3px 3px 0 0 black',
                cursor:
                  !selectedEmoji || saving ? 'not-allowed' : 'pointer',
                opacity: !selectedEmoji || saving ? 0.5 : 1,
              }}
            >
              <Check className="size-4" strokeWidth={3} />
              {saving ? 'saving...' : myVibe ? 'update vibe' : 'save vibe'}
            </button>
          </div>
        </>
      )}
    </>
  );
}