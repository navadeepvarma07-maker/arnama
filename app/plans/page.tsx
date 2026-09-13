'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Plan = {
  id: string;
  user_id: string;
  user_email: string;
  title: string;
  description: string | null;
  event_date: string;
  event_time: string | null;
  created_at: string;
};

const COLORS = ['#FFD1DC', '#E2F0D9', '#E6E6FA', '#FFF5BA', '#D4F0F0'];

function colorFor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = (hash * 17 + email.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

function initialsFor(email: string): string {
  const prefix = email.split('@')[0];
  return prefix.slice(0, 2).toUpperCase();
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatTime12(t: string | null): string {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${ampm}`;
}

/** Convert 12-hour hour + minute + AM/PM to 24-hour "HH:MM" string */
function to24h(hour12: number, minute: number, ampm: 'AM' | 'PM'): string {
  let h = hour12 % 12;
  if (ampm === 'PM') h += 12;
  return `${pad(h)}:${pad(minute)}`;
}

/** Parse 24-hour "HH:MM" into 12-hour pieces */
function from24h(t: string | null): { hour: number; minute: number; ampm: 'AM' | 'PM' } {
  if (!t) return { hour: 9, minute: 0, ampm: 'AM' };
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const ampm: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { hour: h12, minute: m, ampm };
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

export default function PlansPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  // Calendar month state
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  // Modal state
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hour12, setHour12] = useState(9);
  const [minute, setMinute] = useState(0);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('AM');
  const [includeTime, setIncludeTime] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

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
          .update({ last_seen_plans_at: new Date().toISOString() })
          .eq('id', user!.id)
          .then(({ error }) => {
            if (error) console.error('last_seen_plans update failed:', error);
          });
      }
    });
  }, []);

  // Load plans
  useEffect(() => {
    if (!email) return;
    supabase
      .from('plans')
      .select('*')
      .order('event_date', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error(error);
        else setPlans(data ?? []);
      });
  }, [email]);

  // Realtime
  useEffect(() => {
    if (!email) return;
    const channel = supabase
      .channel('plans-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'plans' },
        (payload) => {
          const p = payload.new as Plan;
          setPlans((prev) => {
            if (prev.some((x) => x.id === p.id)) return prev;
            return [...prev, p];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'plans' },
        (payload) => {
          const p = payload.old as { id: string };
          setPlans((prev) => prev.filter((x) => x.id !== p.id));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [email]);

  // Build calendar grid
  const grid = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startDay = firstOfMonth.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const cells: (Date | null)[] = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(new Date(viewYear, viewMonth, d));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  // Group plans by date key
  const plansByDate = useMemo(() => {
    const map: Record<string, Plan[]> = {};
    plans.forEach((p) => {
      if (!map[p.event_date]) map[p.event_date] = [];
      map[p.event_date].push(p);
    });
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => (a.event_time ?? '').localeCompare(b.event_time ?? ''))
    );
    return map;
  }, [plans]);

  const todayKey = toDateKey(today);
  const activeDayPlans = openDate ? plansByDate[openDate] ?? [] : [];

  // Group active day's plans by user
  const groupedByUser = useMemo(() => {
    const map: Record<string, Plan[]> = {};
    activeDayPlans.forEach((p) => {
      if (!map[p.user_email]) map[p.user_email] = [];
      map[p.user_email].push(p);
    });
    return Object.entries(map).map(([uemail, items]) => ({
      email: uemail,
      plans: items,
    }));
  }, [activeDayPlans]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const t = title.trim();
    if (!t || !userId || !email || !openDate) return;
    if (t.length > 80) {
      setError('⚠️ Title max 80 chars');
      return;
    }
    setPosting(true);

    const timeValue = includeTime ? to24h(hour12, minute, ampm) : null;

    const { data, error } = await supabase
      .from('plans')
      .insert({
        user_id: userId,
        user_email: email,
        title: t,
        description: description.trim() || null,
        event_date: openDate,
        event_time: timeValue,
      })
      .select()
      .single();

    if (error) setError('⚠️ ' + error.message);
    else if (data) {
      setPlans((prev) => {
        if (prev.some((x) => x.id === (data as Plan).id)) return prev;
        return [...prev, data as Plan];
      });
      setTitle('');
      setDescription('');
      setIncludeTime(false);
      setHour12(9);
      setMinute(0);
      setAmpm('AM');
    }
    setPosting(false);
  }

  async function handleDelete(p: Plan) {
    if (!confirm(`Delete "${p.title}"?`)) return;
    const { error } = await supabase.from('plans').delete().eq('id', p.id);
    if (!error) setPlans((prev) => prev.filter((x) => x.id !== p.id));
  }

  function closeModal() {
    setOpenDate(null);
    setTitle('');
    setDescription('');
    setError('');
    setIncludeTime(false);
    setHour12(9);
    setMinute(0);
    setAmpm('AM');
  }

  function goPrevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  }

  function goNextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  }

  function goToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a0b2e] flex items-center justify-center text-white font-mono">
        loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a0b2e] p-3 sm:p-6 font-mono flex flex-col">
      <div className="w-full max-w-3xl mx-auto flex flex-col gap-3 sm:gap-4">

        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <h1 className="text-lg sm:text-2xl font-black text-white">
            📅 plans
          </h1>
          <Link
            href="/"
            className="inline-flex items-center border-4 border-black bg-[#E2F0D9] text-black font-black rounded-xl shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:shadow-[7px_7px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition"
            style={{ padding: '8px 16px', gap: '8px' }}
          >
            <span className="text-base leading-none">←</span>
            <span className="text-xs sm:text-sm leading-none">back</span>
          </Link>
        </div>

        {/* Month nav */}
        <div
          className="border-4 border-black rounded-2xl shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] flex items-center justify-between"
          style={{ backgroundColor: '#FFFDF5', padding: '10px 12px', gap: '8px' }}
        >
          <button
            onClick={goPrevMonth}
            className="border-2 border-black bg-[#FFD1DC] text-black font-black rounded-lg hover:-translate-y-0.5 active:translate-y-0.5 transition shrink-0"
            style={{ width: '36px', height: '36px', fontSize: '16px', lineHeight: 1, boxShadow: '2px 2px 0 0 black' }}
            aria-label="Previous month"
          >
            ‹
          </button>
          <button
            onClick={goToday}
            className="flex-1 text-center border-2 border-black bg-[#FFF5BA] text-black rounded-lg hover:-translate-y-0.5 active:translate-y-0.5 transition truncate"
            style={{ padding: '8px 10px', boxShadow: '2px 2px 0 0 black' }}
          >
            <span className="font-black" style={{ fontSize: '14px' }}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <span className="font-bold" style={{ fontSize: '9px', color: 'rgba(0,0,0,0.5)', display: 'block' }}>
              tap to jump to today
            </span>
          </button>
          <button
            onClick={goNextMonth}
            className="border-2 border-black bg-[#E2F0D9] text-black font-black rounded-lg hover:-translate-y-0.5 active:translate-y-0.5 transition shrink-0"
            style={{ width: '36px', height: '36px', fontSize: '16px', lineHeight: 1, boxShadow: '2px 2px 0 0 black' }}
            aria-label="Next month"
          >
            ›
          </button>
        </div>

        {/* Calendar grid */}
        <div
          className="border-4 border-black rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
          style={{ backgroundColor: '#FFFDF5', padding: '8px' }}
        >
          <div
            className="grid"
            style={{ gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '6px' }}
          >
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="text-center font-black"
                style={{ fontSize: '9px', color: 'rgba(0,0,0,0.5)', padding: '4px 0' }}
              >
                {w}
              </div>
            ))}
          </div>

          <div
            className="grid"
            style={{ gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}
          >
            {grid.map((d, i) => {
              if (!d) {
                return (
                  <div
                    key={`empty-${i}`}
                    style={{
                      aspectRatio: '1 / 1',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(0,0,0,0.03)',
                    }}
                  />
                );
              }
              const key = toDateKey(d);
              const isToday = key === todayKey;
              const dayPlans = plansByDate[key] ?? [];
              const visiblePlans = dayPlans.slice(0, 2);
              const extra = dayPlans.length - visiblePlans.length;

              return (
                <button
                  key={key}
                  onClick={() => setOpenDate(key)}
                  className="border-2 border-black rounded-lg transition hover:-translate-y-0.5 active:translate-y-0.5 relative text-left"
                  style={{
                    aspectRatio: '1 / 1',
                    padding: '4px',
                    backgroundColor: isToday ? '#FFF5BA' : '#FFFDF5',
                    boxShadow: '2px 2px 0 0 black',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    overflow: 'hidden',
                  }}
                >
                  <span
                    className="font-black"
                    style={{
                      fontSize: '11px',
                      color: isToday ? '#000' : 'rgba(0,0,0,0.75)',
                      lineHeight: 1,
                      padding: '1px 3px',
                      borderRadius: '4px',
                      display: 'inline-block',
                      alignSelf: 'flex-start',
                      backgroundColor: isToday ? '#FF8BA7' : 'transparent',
                    }}
                  >
                    {d.getDate()}
                  </span>
                  <div className="flex flex-col" style={{ gap: '2px' }}>
                    {visiblePlans.map((p) => (
                      <span
                        key={p.id}
                        className="truncate"
                        style={{
                          fontSize: '8px',
                          fontWeight: 800,
                          color: '#000',
                          backgroundColor: colorFor(p.user_email),
                          border: '1px solid black',
                          borderRadius: '3px',
                          padding: '1px 3px',
                          lineHeight: 1.2,
                        }}
                      >
                        {p.event_time ? `${formatTime12(p.event_time).split(' ')[0]} ` : ''}
                        {p.title}
                      </span>
                    ))}
                    {extra > 0 && (
                      <span
                        style={{
                          fontSize: '8px',
                          fontWeight: 900,
                          color: 'rgba(0,0,0,0.55)',
                          paddingLeft: '2px',
                        }}
                      >
                        +{extra} more
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <p
          className="text-center font-bold"
          style={{ fontSize: '10px', color: 'rgba(255,253,245,0.4)' }}
        >
          tap any day to see or add plans · everyone in arnama sees this
        </p>
      </div>

      {/* ============ MODAL ============ */}
      {openDate && (
        <div
          onClick={closeModal}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(10,4,25,0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 100,
            overflow: 'auto',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="border-4 border-black rounded-2xl"
            style={{
              backgroundColor: '#FFFDF5',
              boxShadow: '10px 10px 0 0 black',
              width: '100%',
              maxWidth: '460px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '20px',
              position: 'relative',
            }}
          >
            {/* Modal header */}
            <div className="flex items-start justify-between" style={{ gap: '10px', marginBottom: '14px' }}>
              <div className="min-w-0">
                <p className="font-black" style={{ fontSize: '16px', color: '#000', lineHeight: 1.2 }}>
                  {formatDayLabel(openDate)}
                </p>
                <p
                  className="font-bold"
                  style={{
                    fontSize: '10px',
                    color: 'rgba(0,0,0,0.5)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginTop: '4px',
                  }}
                >
                  {activeDayPlans.length === 0
                    ? 'no plans yet'
                    : `${activeDayPlans.length} plan${activeDayPlans.length > 1 ? 's' : ''} · ${groupedByUser.length} ${groupedByUser.length > 1 ? 'people' : 'person'}`}
                </p>
              </div>
              <button
                onClick={closeModal}
                className="border-2 border-black bg-[#FFD1DC] text-black font-black rounded-lg hover:-translate-y-0.5 active:translate-y-0.5 transition shrink-0"
                style={{
                  width: '32px',
                  height: '32px',
                  fontSize: '14px',
                  lineHeight: 1,
                  boxShadow: '2px 2px 0 0 black',
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Existing plans — grouped by user */}
            {groupedByUser.length > 0 && (
              <div className="flex flex-col" style={{ gap: '14px', marginBottom: '16px' }}>
                {groupedByUser.map((group) => {
                  const mine = group.email === email;
                  const bg = colorFor(group.email);
                  const initials = initialsFor(group.email);
                  const prefix = group.email.split('@')[0];
                  return (
                    <div key={group.email}>
                      {/* User header */}
                      <div
                        className="flex items-center"
                        style={{ gap: '8px', marginBottom: '8px' }}
                      >
                        <div
                          className="flex items-center justify-center border-2 border-black font-black shrink-0"
                          style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '8px',
                            backgroundColor: bg,
                            fontSize: '10px',
                            color: '#000',
                          }}
                        >
                          {initials}
                        </div>
                        <span
                          className="font-black truncate"
                          style={{ fontSize: '12px', color: '#000' }}
                        >
                          {mine ? `${prefix} (you)` : prefix}
                        </span>
                        <span
                          className="font-bold"
                          style={{
                            fontSize: '9px',
                            color: 'rgba(0,0,0,0.4)',
                            backgroundColor: '#FFF5BA',
                            border: '1px solid black',
                            padding: '1px 6px',
                            borderRadius: '6px',
                            marginLeft: 'auto',
                          }}
                        >
                          {group.plans.length}
                        </span>
                      </div>

                      {/* That user's plans */}
                      <div className="flex flex-col" style={{ gap: '8px', paddingLeft: '34px' }}>
                        {group.plans.map((p) => (
                          <div
                            key={p.id}
                            className="border-2 border-black relative"
                            style={{
                              padding: '10px 12px',
                              borderRadius: '10px',
                              backgroundColor: bg,
                              boxShadow: '3px 3px 0 0 black',
                            }}
                          >
                            <div
                              className="flex items-center"
                              style={{ gap: '6px', marginBottom: '4px' }}
                            >
                              {p.event_time && (
                                <span
                                  className="font-black"
                                  style={{
                                    fontSize: '10px',
                                    color: '#000',
                                    backgroundColor: '#FFFDF5',
                                    border: '2px solid black',
                                    borderRadius: '6px',
                                    padding: '1px 6px',
                                    lineHeight: 1.4,
                                  }}
                                >
                                  {formatTime12(p.event_time)}
                                </span>
                              )}
                              <span
                                className="font-black truncate flex-1"
                                style={{ fontSize: '13px', color: '#000' }}
                              >
                                {p.title}
                              </span>
                              {mine && (
                                <button
                                  onClick={() => handleDelete(p)}
                                  className="border-2 border-black bg-[#FFFDF5] text-black font-black rounded-full hover:-translate-y-0.5 active:translate-y-0.5 transition shrink-0"
                                  style={{
                                    width: '22px',
                                    height: '22px',
                                    fontSize: '10px',
                                    lineHeight: 1,
                                    boxShadow: '1px 1px 0 0 black',
                                  }}
                                  aria-label="Delete plan"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                            {p.description && (
                              <p
                                style={{
                                  fontSize: '11px',
                                  color: 'rgba(0,0,0,0.75)',
                                  lineHeight: 1.4,
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                  margin: 0,
                                }}
                              >
                                {p.description}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Divider */}
            <div
              style={{
                height: '3px',
                backgroundColor: '#000',
                marginBottom: '14px',
                borderRadius: '2px',
              }}
            />

            {/* Add form */}
            <form onSubmit={handleAdd} className="flex flex-col" style={{ gap: '10px' }}>
              <p
                className="font-black uppercase tracking-wider"
                style={{ fontSize: '10px', color: '#000' }}
              >
                ➕ add your plan
              </p>

              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="what's the plan?"
                maxLength={80}
                disabled={posting}
                className="w-full border-2 border-black rounded-lg bg-white text-black text-sm focus:outline-none disabled:opacity-50"
                style={{ padding: '10px 14px' }}
              />

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="details (optional)"
                rows={2}
                maxLength={300}
                disabled={posting}
                className="w-full border-2 border-black rounded-lg bg-white text-black text-sm focus:outline-none disabled:opacity-50 resize-none"
                style={{ padding: '10px 14px', fontFamily: 'inherit' }}
              />

              {/* Time toggle */}
              <label
                className="flex items-center select-none"
                style={{ gap: '8px', cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={includeTime}
                  onChange={(e) => setIncludeTime(e.target.checked)}
                  style={{
                    width: '16px',
                    height: '16px',
                    accentColor: '#000',
                    cursor: 'pointer',
                  }}
                />
                <span
                  className="font-black uppercase tracking-wider"
                  style={{ fontSize: '10px', color: '#000' }}
                >
                  add a time
                </span>
              </label>

              {/* Custom time picker */}
              {includeTime && (
                <div
                  className="border-2 border-black rounded-xl flex items-center"
                  style={{ backgroundColor: '#E6E6FA', padding: '10px', gap: '8px' }}
                >
                  {/* Hour */}
                  <select
                    value={hour12}
                    onChange={(e) => setHour12(parseInt(e.target.value, 10))}
                    disabled={posting}
                    className="border-2 border-black rounded-lg bg-white text-black font-black text-center focus:outline-none"
                    style={{ padding: '8px 6px', fontSize: '16px', flex: 1, appearance: 'none' }}
                  >
                    {HOURS.map((h) => (
                      <option key={h} value={h}>
                        {pad(h)}
                      </option>
                    ))}
                  </select>

                  <span className="font-black" style={{ fontSize: '16px', color: '#000' }}>:</span>

                  {/* Minute */}
                  <select
                    value={minute}
                    onChange={(e) => setMinute(parseInt(e.target.value, 10))}
                    disabled={posting}
                    className="border-2 border-black rounded-lg bg-white text-black font-black text-center focus:outline-none"
                    style={{ padding: '8px 6px', fontSize: '16px', flex: 1, appearance: 'none' }}
                  >
                    {MINUTES.map((m) => (
                      <option key={m} value={m}>
                        {pad(m)}
                      </option>
                    ))}
                  </select>

                  {/* AM/PM toggle */}
                  <div
                    className="border-2 border-black rounded-lg flex overflow-hidden shrink-0"
                    style={{ boxShadow: '2px 2px 0 0 black' }}
                  >
                    <button
                      type="button"
                      onClick={() => setAmpm('AM')}
                      className="font-black transition"
                      style={{
                        padding: '8px 12px',
                        fontSize: '12px',
                        backgroundColor: ampm === 'AM' ? '#FF8BA7' : '#FFFDF5',
                        color: '#000',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      AM
                    </button>
                    <button
                      type="button"
                      onClick={() => setAmpm('PM')}
                      className="font-black transition"
                      style={{
                        padding: '8px 12px',
                        fontSize: '12px',
                        backgroundColor: ampm === 'PM' ? '#FF8BA7' : '#FFFDF5',
                        color: '#000',
                        border: 'none',
                        borderLeft: '2px solid black',
                        cursor: 'pointer',
                      }}
                    >
                      PM
                    </button>
                  </div>
                </div>
              )}

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
                disabled={posting || !title.trim()}
                className="w-full inline-flex items-center justify-center border-2 border-black bg-[#E2F0D9] text-black text-xs font-black rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition disabled:opacity-50 disabled:hover:translate-y-0"
                style={{ padding: '12px 18px', gap: '8px' }}
              >
                <span className="text-sm leading-none">{posting ? '···' : '▶'}</span>
                <span className="leading-none tracking-wider">
                  {posting ? 'POSTING' : 'POST PLAN'}
                </span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}