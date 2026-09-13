'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { playPop } from '@/lib/ding';
const AVATAR_COLORS = [
  '#E6E6FA', '#E2F0D9', '#FFD1DC', '#FFF5BA',
  '#D4F0F0', '#FFCFAF', '#FFB8D1', '#D9C7F0',
];

const ACCENT_COLORS = [
  '#FFD1DC', '#E2F0D9', '#E6E6FA', '#FFF5BA',
  '#D4F0F0', '#FF8BA7', '#7FB89B', '#9B8FD4',
];

type Settings = {
  display_name: string | null;
  avatar_color: string;
  accent_color: string;
  notify_chat: boolean;
  notify_tunes: boolean;
  notify_photos: boolean;
  notify_wishes: boolean;
  notify_plans: boolean;
  notify_vault: boolean;
  notify_arcade: boolean;
  sound_enabled: boolean;
  time_format: string;
  allow_dms: string;
};

const DEFAULT_SETTINGS: Settings = {
  display_name: null,
  avatar_color: '#E6E6FA',
  accent_color: '#FFD1DC',
  notify_chat: true,
  notify_tunes: true,
  notify_photos: true,
  notify_wishes: true,
  notify_plans: true,
  notify_vault: true,
  notify_arcade: true,
  sound_enabled: true,
  time_format: '12h',
  allow_dms: 'everyone',
};

export default function SettingsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [nameInput, setNameInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      const e = user?.email ?? null;
      setUserId(user?.id ?? null);
      setEmail(e);
      if (!e) {
        window.location.href = '/login';
        return;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select(
          'display_name, avatar_color, accent_color, notify_chat, notify_tunes, notify_photos, notify_wishes, notify_plans, notify_vault, notify_arcade, sound_enabled, time_format, allow_dms'
        )
        .eq('id', user!.id)
        .single();

      if (!error && profile) {
        const merged: Settings = {
          ...DEFAULT_SETTINGS,
          ...Object.fromEntries(
            Object.entries(profile).filter(([, v]) => v !== null && v !== undefined)
          ),
        };
        setSettings(merged);
        setNameInput(profile.display_name ?? '');
      }
      setLoading(false);
    });
  }, []);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 1500);
  }

  async function save(patch: Partial<Settings>) {
    if (!userId) return;
    const next = { ...settings, ...patch };
    setSettings(next);

    // Play a small pop for feedback — respects sound_enabled
    if (settings.sound_enabled) {
      playPop();
    }

    const { error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', userId);
    if (error) {
      console.error(error);
      flash('❌ ' + error.message);
    } else {
      flash('✓ saved');
    }
  }

  async function saveName() {
    const name = nameInput.trim();
    await save({ display_name: name || null });
  }

  function toggle(key: keyof Settings) {
    return async () => {
      const current = settings[key] as unknown as boolean;
      await save({ [key]: !current } as Partial<Settings>);
    };
  }

  async function signOutEverywhere() {
    if (!confirm('Sign out of all devices? You will need to log in again.')) return;
    await supabase.auth.signOut({ scope: 'global' });
    window.location.href = '/login';
  }

  async function deleteAccount() {
    if (!userId) return;
    const ok = confirm(
      '⚠️ DELETE ACCOUNT? This deletes your profile, notes, DMs, and everything else. Cannot be undone.'
    );
    if (!ok) return;

    await supabase.from('profiles').delete().eq('id', userId);
    await supabase.auth.signOut();
    alert(
      'Profile data deleted. You have been signed out. To fully remove the auth account, contact the admin.'
    );
    window.location.href = '/login';
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a0b2e] flex items-center justify-center text-white font-mono">
        loading...
      </div>
    );
  }

  const accent = settings.accent_color;

  return (
    <div className="min-h-screen bg-[#1a0b2e] p-4 sm:p-6 font-mono flex flex-col pb-24">
      <div className="w-full max-w-2xl mx-auto flex flex-col gap-4">

        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <h1 className="text-xl sm:text-2xl font-black text-white">
            ⚙️ settings
          </h1>
          <Link
            href="/"
            className="inline-flex items-center border-4 border-black bg-[#E2F0D9] text-black font-black rounded-xl shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:shadow-[7px_7px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition"
            style={{ padding: '10px 20px', gap: '10px' }}
          >
            <span className="text-base leading-none">←</span>
            <span className="text-sm leading-none">back</span>
          </Link>
        </div>

        {/* ===== PROFILE ===== */}
        <Section emoji="👤" title="profile">
          <Row label="signed in as" hint="you can't change this">
            <p
              className="font-bold break-all"
              style={{ fontSize: '12px', color: '#000' }}
            >
              {email}
            </p>
          </Row>

          <Row label="display name" hint="what friends see">
            <div className="flex w-full" style={{ gap: '8px' }}>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                maxLength={24}
                placeholder={email?.split('@')[0] ?? 'you'}
                className="flex-1 min-w-0 border-2 border-black rounded-lg bg-white text-black text-sm focus:outline-none"
                style={{ padding: '10px 12px' }}
              />
              <button
                onClick={saveName}
                className="border-2 border-black text-black font-black text-xs rounded-lg hover:-translate-y-0.5 active:translate-y-0.5 transition shrink-0"
                style={{
                  backgroundColor: accent,
                  padding: '10px 16px',
                  boxShadow: '2px 2px 0 0 black',
                }}
              >
                save
              </button>
            </div>
          </Row>

          <Row label="avatar color" hint="your sticker in the crew">
            <div className="flex flex-wrap w-full" style={{ gap: '8px' }}>
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => save({ avatar_color: c })}
                  className="border-2 border-black rounded-lg hover:-translate-y-0.5 active:translate-y-0.5 transition shrink-0"
                  style={{
                    width: '36px',
                    height: '36px',
                    backgroundColor: c,
                    boxShadow:
                      settings.avatar_color === c
                        ? '0 0 0 3px #000, 2px 2px 0 0 black'
                        : '2px 2px 0 0 black',
                  }}
                  aria-label={`Avatar color ${c}`}
                />
              ))}
            </div>
          </Row>
        </Section>

        {/* ===== APPEARANCE ===== */}
        <Section emoji="🎨" title="appearance">
          <Row label="accent color" hint="buttons, highlights everywhere">
            <div className="flex flex-wrap w-full" style={{ gap: '8px' }}>
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => save({ accent_color: c })}
                  className="border-2 border-black rounded-lg hover:-translate-y-0.5 active:translate-y-0.5 transition shrink-0"
                  style={{
                    width: '36px',
                    height: '36px',
                    backgroundColor: c,
                    boxShadow:
                      settings.accent_color === c
                        ? '0 0 0 3px #000, 2px 2px 0 0 black'
                        : '2px 2px 0 0 black',
                  }}
                  aria-label={`Accent color ${c}`}
                />
              ))}
            </div>
          </Row>
        </Section>

        {/* ===== NOTIFICATIONS ===== */}
        <Section emoji="🔔" title="notifications">
          <RowInline label="chat messages" hint="when someone types in squad chat">
            <Toggle checked={settings.notify_chat} onToggle={toggle('notify_chat')} accent={accent} />
          </RowInline>
          <RowInline label="private DMs" hint="vault messages">
            <Toggle checked={settings.notify_vault} onToggle={toggle('notify_vault')} accent={accent} />
          </RowInline>
          <RowInline label="photos" hint="new photo posts">
            <Toggle checked={settings.notify_photos} onToggle={toggle('notify_photos')} accent={accent} />
          </RowInline>
          <RowInline label="tunes" hint="new songs shared">
            <Toggle checked={settings.notify_tunes} onToggle={toggle('notify_tunes')} accent={accent} />
          </RowInline>
          <RowInline label="wishes" hint="anonymous confessions">
            <Toggle checked={settings.notify_wishes} onToggle={toggle('notify_wishes')} accent={accent} />
          </RowInline>
          <RowInline label="plans" hint="new events on the calendar">
            <Toggle checked={settings.notify_plans} onToggle={toggle('notify_plans')} accent={accent} />
          </RowInline>
          <RowInline label="arcade" hint="waiting games">
            <Toggle checked={settings.notify_arcade} onToggle={toggle('notify_arcade')} accent={accent} />
          </RowInline>
        </Section>

        {/* ===== PREFERENCES ===== */}
        <Section emoji="🎯" title="preferences">
          <RowInline label="notification sound" hint="play a ding on new activity">
            <Toggle checked={settings.sound_enabled} onToggle={toggle('sound_enabled')} accent={accent} />
          </RowInline>

          <RowInline label="time format" hint="how times appear">
            <div
              className="flex border-2 border-black rounded-lg overflow-hidden shrink-0"
              style={{ boxShadow: '2px 2px 0 0 black' }}
            >
              <button
                onClick={() => save({ time_format: '12h' })}
                className="font-black transition"
                style={{
                  padding: '8px 16px',
                  fontSize: '11px',
                  backgroundColor: settings.time_format === '12h' ? accent : '#FFFDF5',
                  color: '#000',
                }}
              >
                12H
              </button>
              <button
                onClick={() => save({ time_format: '24h' })}
                className="font-black transition"
                style={{
                  padding: '8px 16px',
                  fontSize: '11px',
                  backgroundColor: settings.time_format === '24h' ? accent : '#FFFDF5',
                  color: '#000',
                  borderLeft: '2px solid black',
                }}
              >
                24H
              </button>
            </div>
          </RowInline>
        </Section>

        {/* ===== PRIVACY ===== */}
        <Section emoji="🔒" title="privacy">
          <Row label="who can DM you" hint="vault messages">
            <div
              className="flex w-full border-2 border-black rounded-lg overflow-hidden"
              style={{ boxShadow: '2px 2px 0 0 black' }}
            >
              <button
                onClick={() => save({ allow_dms: 'everyone' })}
                className="flex-1 font-black transition"
                style={{
                  padding: '10px',
                  fontSize: '11px',
                  backgroundColor: settings.allow_dms === 'everyone' ? accent : '#FFFDF5',
                  color: '#000',
                }}
              >
                EVERYONE
              </button>
              <button
                onClick={() => save({ allow_dms: 'nobody' })}
                className="flex-1 font-black transition"
                style={{
                  padding: '10px',
                  fontSize: '11px',
                  backgroundColor: settings.allow_dms === 'nobody' ? accent : '#FFFDF5',
                  color: '#000',
                  borderLeft: '2px solid black',
                }}
              >
                NOBODY
              </button>
            </div>
          </Row>
        </Section>

        {/* ===== DANGER ZONE ===== */}
        <Section emoji="⚠️" title="danger zone">
          <RowInline label="sign out everywhere" hint="log out from all devices">
            <button
              onClick={signOutEverywhere}
              className="border-2 border-black bg-[#FFF5BA] text-black font-black text-xs rounded-lg hover:-translate-y-0.5 active:translate-y-0.5 transition shrink-0"
              style={{ padding: '10px 14px', boxShadow: '2px 2px 0 0 black' }}
            >
              sign out all
            </button>
          </RowInline>

          <RowInline label="delete account" hint="permanently removes your data">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="border-2 border-black bg-[#FFD1DC] text-black font-black text-xs rounded-lg hover:-translate-y-0.5 active:translate-y-0.5 transition shrink-0"
                style={{ padding: '10px 14px', boxShadow: '2px 2px 0 0 black' }}
              >
                delete
              </button>
            ) : (
              <div className="flex shrink-0" style={{ gap: '6px' }}>
                <button
                  onClick={deleteAccount}
                  className="border-2 border-black text-white font-black text-xs rounded-lg hover:-translate-y-0.5 active:translate-y-0.5 transition"
                  style={{
                    backgroundColor: '#C2185B',
                    padding: '10px 14px',
                    boxShadow: '2px 2px 0 0 black',
                  }}
                >
                  yes
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="border-2 border-black bg-[#FFFDF5] text-black font-black text-xs rounded-lg hover:-translate-y-0.5 active:translate-y-0.5 transition"
                  style={{ padding: '10px 14px', boxShadow: '2px 2px 0 0 black' }}
                >
                  no
                </button>
              </div>
            )}
          </RowInline>
        </Section>

        {/* ===== ABOUT ===== */}
        <Section emoji="💜" title="about">
          <RowInline label="version" hint="">
            <p className="font-black" style={{ fontSize: '12px', color: '#000' }}>
              arnama v1.0
            </p>
          </RowInline>
          <RowInline label="built with" hint="">
            <p className="font-bold" style={{ fontSize: '11px', color: 'rgba(0,0,0,0.6)' }}>
              next.js · supabase
            </p>
          </RowInline>
          <RowInline label="theme" hint="">
            <p className="font-bold" style={{ fontSize: '11px', color: 'rgba(0,0,0,0.6)' }}>
              🎨 neo-brutalist
            </p>
          </RowInline>
        </Section>

      </div>

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#E2F0D9',
            border: '3px solid black',
            borderRadius: '10px',
            padding: '10px 20px',
            boxShadow: '4px 4px 0 0 black',
            zIndex: 100,
            fontWeight: 900,
            fontSize: '12px',
            color: '#000',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function Section({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="border-4 border-black rounded-2xl overflow-hidden"
      style={{
        backgroundColor: '#FFFDF5',
        boxShadow: '6px 6px 0 0 black',
      }}
    >
      <div
        className="border-b-4 border-black"
        style={{ backgroundColor: '#E6E6FA', padding: '10px 14px' }}
      >
        <p className="font-black" style={{ fontSize: '12px', color: '#000' }}>
          {emoji} {title}
        </p>
      </div>
      <div>{children}</div>
    </div>
  );
}

/** Label on top, control below — works everywhere */
function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: '14px',
        borderBottom: '2px solid rgba(0,0,0,0.08)',
      }}
    >
      <p className="font-black" style={{ fontSize: '12px', color: '#000' }}>
        {label}
      </p>
      {hint && (
        <p
          className="font-bold"
          style={{
            fontSize: '10px',
            color: 'rgba(0,0,0,0.5)',
            marginTop: '2px',
            marginBottom: '10px',
          }}
        >
          {hint}
        </p>
      )}
      <div>{children}</div>
    </div>
  );
}

/** Label left, control right — only for compact items (toggles, small buttons) */
function RowInline({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center"
      style={{
        padding: '12px 14px',
        gap: '12px',
        borderBottom: '2px solid rgba(0,0,0,0.08)',
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="font-black" style={{ fontSize: '12px', color: '#000' }}>
          {label}
        </p>
        {hint && (
          <p
            className="font-bold"
            style={{
              fontSize: '10px',
              color: 'rgba(0,0,0,0.5)',
              marginTop: '2px',
            }}
          >
            {hint}
          </p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onToggle,
  accent,
}: {
  checked: boolean;
  onToggle: () => void;
  accent: string;
}) {
  return (
    <button
      onClick={onToggle}
      className="border-2 border-black rounded-full transition"
      style={{
        width: '48px',
        height: '26px',
        backgroundColor: checked ? accent : '#D8D0C0',
        boxShadow: '2px 2px 0 0 black',
        position: 'relative',
        padding: 0,
      }}
      aria-pressed={checked}
    >
      <span
        className="absolute border-2 border-black rounded-full transition-all"
        style={{
          width: '18px',
          height: '18px',
          backgroundColor: '#FFFDF5',
          top: '2px',
          left: checked ? '24px' : '2px',
        }}
      />
    </button>
  );
}