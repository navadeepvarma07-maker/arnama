'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { SwipeCarousel } from '@/components/arnama/swipe-carousel';
import { Calendar as CalIcon, Plus, X } from 'lucide-react';

type Plan = {
  id: string;
  user_email: string;
  title: string;
  event_date: string;
  event_time: string | null;
  created_at: string;
};

const CARD_COLORS = ['#FFD1DC', '#E2F0D9', '#E6E6FA', '#FFF5BA', '#D4F0F0'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++)
    hash = (hash * 17 + id.charCodeAt(i)) | 0;
  return CARD_COLORS[Math.abs(hash) % CARD_COLORS.length];
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function humanDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function humanDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatTime12(t: string | null | undefined): string {
  if (!t) return '';
  const [hh, mm] = t.split(':').map(Number);
  const isPM = hh >= 12;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${pad(mm)} ${isPM ? 'PM' : 'AM'}`;
}

function daysAway(dateStr: string): string {
  const today = new Date(todayStr() + 'T00:00:00').getTime();
  const target = new Date(dateStr + 'T00:00:00').getTime();
  const diff = Math.round((target - today) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff > 1) return `in ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}

function to24h(hour12: number, minute: number, ampm: 'AM' | 'PM'): string {
  const h24 =
    ampm === 'AM'
      ? hour12 === 12
        ? 0
        : hour12
      : hour12 === 12
      ? 12
      : hour12 + 12;
  return `${pad(h24)}:${pad(minute)}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}
function firstWeekday(y: number, m: number): number {
  return new Date(y, m, 1).getDay();
}

export default function PlansPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  const [tabIndex, setTabIndex] = useState(0);

  // Calendar view state
  const today = todayStr();
  const todayDate = new Date();
  const [viewMonth, setViewMonth] = useState(todayDate.getMonth());
  const [viewYear, setViewYear] = useState(todayDate.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string>(today);

  // Calendar swipe
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const pointerDownRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const axisRef = useRef<'x' | 'y' | null>(null);

  // Composer
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState(today);
  const [hour12, setHour12] = useState(7);
  const [minute, setMinute] = useState(0);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('PM');
  const [addTime, setAddTime] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  // AUTH
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
          .then(() => {});
      }
    });
  }, []);

  // LOAD
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

  // REALTIME
  useEffect(() => {
    if (!email) return;
    const ch = supabase
      .channel('plans-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'plans' },
        (payload) => {
          const p = payload.new as Plan;
          setPlans((prev) => {
            if (prev.some((x) => x.id === p.id)) return prev;
            return [...prev, p].sort((a, b) =>
              a.event_date.localeCompare(b.event_date)
            );
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
      supabase.removeChannel(ch);
    };
  }, [email]);

  // HANDLERS
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const t = title.trim();
    if (!t || !email || !userId || !eventDate) return;

    setPosting(true);
    try {
      const timeValue = addTime ? to24h(hour12, minute, ampm) : null;
      const { data, error } = await supabase
        .from('plans')
        .insert({
          user_id: userId,
          user_email: email,
          title: t,
          event_date: eventDate,
          event_time: timeValue,
        })
        .select()
        .single();

      if (error) setError('⚠️ ' + error.message);
      else if (data) {
        setPlans((prev) =>
          [...prev, data as Plan].sort((a, b) =>
            a.event_date.localeCompare(b.event_date)
          )
        );
        setTitle('');
        setAddTime(false);
        setComposerOpen(false);
        setSelectedDate(eventDate);
        // Jump calendar to that month
        const d = new Date(eventDate + 'T00:00:00');
        setViewMonth(d.getMonth());
        setViewYear(d.getFullYear());
      }
    } catch (err: any) {
      setError('⚠️ ' + (err?.message ?? 'unknown error'));
    } finally {
      setPosting(false);
    }
  }

  async function handleDelete(p: Plan) {
    if (!confirm(`Delete "${p.title}"?`)) return;
    const { error } = await supabase.from('plans').delete().eq('id', p.id);
    if (!error) setPlans((prev) => prev.filter((x) => x.id !== p.id));
  }

  function addToCalendar(p: Plan) {
    const date = p.event_date.replace(/-/g, '');
    const time = p.event_time;
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//arnama//plans//EN',
      'BEGIN:VEVENT',
      `UID:${p.id}@arnama`,
      `DTSTAMP:${new Date()
        .toISOString()
        .replace(/[-:.]/g, '')
        .slice(0, 15)}Z`,
    ];
    if (time) {
      const [hh, mm] = time.split(':');
      lines.push(`DTSTART:${date}T${hh}${mm}00`);
      lines.push(`DTEND:${date}T${hh}${mm}00`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${date}`);
      lines.push(`DTEND;VALUE=DATE:${date}`);
    }
    lines.push(`SUMMARY:${p.title.replace(/[,;\\]/g, ' ')}`);
    lines.push('END:VEVENT');
    lines.push('END:VCALENDAR');
    const ics = lines.join('\r\n');
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${p.title.replace(/[^a-z0-9]/gi, '_')}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // CALENDAR SWIPE HANDLERS
  function calPointerDown(e: React.PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointerDownRef.current = true;
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    axisRef.current = null;
    setDragging(false);
  }

  function calPointerMove(e: React.PointerEvent) {
    if (!pointerDownRef.current) return;
    const dx = e.clientX - startXRef.current;
    const dy = e.clientY - startYRef.current;

    if (axisRef.current === null) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        axisRef.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if (axisRef.current === 'x') {
          setDragging(true);
          try {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          } catch {}
        }
      }
      return;
    }
    if (axisRef.current !== 'x') return;
    setDragX(dx);
  }

  function calPointerUp(e: React.PointerEvent) {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    pointerDownRef.current = false;

    if (axisRef.current === 'x' && dragging) {
      const threshold = 60;
      if (dragX < -threshold) nextMonth();
      else if (dragX > threshold) prevMonth();
    }
    setDragX(0);
    setDragging(false);
    axisRef.current = null;
  }

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  }
  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  }

  // COMPUTED
  const plansByDate = useMemo(() => {
    const map: Record<string, Plan[]> = {};
    plans.forEach((p) => {
      if (!map[p.event_date]) map[p.event_date] = [];
      map[p.event_date].push(p);
    });
    Object.keys(map).forEach((k) =>
      map[k].sort((a, b) =>
        (a.event_time ?? '').localeCompare(b.event_time ?? '')
      )
    );
    return map;
  }, [plans]);

  const selectedDatePlans = plansByDate[selectedDate] ?? [];

  const upcomingPlans = useMemo(
    () =>
      plans
        .filter((p) => p.event_date >= today)
        .sort((a, b) => {
          if (a.event_date !== b.event_date)
            return a.event_date.localeCompare(b.event_date);
          return (a.event_time ?? '').localeCompare(b.event_time ?? '');
        }),
    [plans, today]
  );

  const pastPlans = useMemo(
    () =>
      plans
        .filter((p) => p.event_date < today)
        .sort((a, b) => b.event_date.localeCompare(a.event_date)),
    [plans, today]
  );

  const nextPlan = upcomingPlans[0];

  // BUILD CALENDAR CELLS
  const calendarCells: (number | null)[] = [];
  const total = daysInMonth(viewYear, viewMonth);
  const firstDay = firstWeekday(viewYear, viewMonth);
  for (let i = 0; i < firstDay; i++) calendarCells.push(null);
  for (let d = 1; d <= total; d++) calendarCells.push(d);
  while (calendarCells.length < 42) calendarCells.push(null);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#1a0b2e] flex items-center justify-center text-white font-mono">
        loading...
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    border: '2px solid black',
    borderRadius: '14px',
    background: '#FFFDF5',
    color: '#000',
    fontSize: '14px',
    padding: '11px 16px',
    outline: 'none',
    fontWeight: 700,
    fontFamily: 'inherit',
  };

  // PLAN CARD
  function renderPlanCard(p: Plan) {
    const bg = colorFor(p.id);
    const mine = p.user_email === email;
    const isPast = p.event_date < today;
    const isToday = p.event_date === today;

    return (
      <div
        key={p.id}
        className="border-4 border-black relative"
        style={{
          background: `
            linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
            ${bg}
          `,
          borderRadius: '22px',
          padding: '16px 18px',
          boxShadow: `
            5px 5px 0 0 black,
            inset 0 1px 0 rgba(255,255,255,0.7)
          `,
          opacity: isPast ? 0.55 : 1,
        }}
      >
        <div
          className="absolute"
          style={{
            top: '-12px',
            left: '14px',
            border: '3px solid black',
            borderRadius: '10px',
            padding: '3px 10px',
            fontSize: '10px',
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            background: isToday
              ? 'linear-gradient(180deg, #FFD700 0%, #FFA500 100%)'
              : 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFFDF5',
            color: '#000',
            boxShadow: '2px 2px 0 0 black',
            zIndex: 2,
          }}
        >
          {isToday ? '★ TODAY' : humanDate(p.event_date)}
        </div>

        <div style={{ marginTop: '4px' }}>
          <p
            className="font-black"
            style={{
              margin: 0,
              fontSize: '15px',
              color: '#000',
              lineHeight: 1.3,
              wordBreak: 'break-word',
              paddingRight: mine ? '32px' : '0',
            }}
          >
            {p.title}
          </p>
          {p.event_time && (
            <p
              style={{
                margin: '6px 0 0',
                fontSize: '13px',
                fontWeight: 900,
                color: '#000',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%), rgba(255,255,255,0.75)',
                border: '2px solid black',
                borderRadius: '999px',
                padding: '2px 10px',
                boxShadow: '1px 1px 0 0 black',
              }}
            >
              ⏰ {formatTime12(p.event_time)}
            </p>
          )}
          <p
            style={{
              margin: '6px 0 0',
              fontSize: '10px',
              fontWeight: 800,
              color: 'rgba(0,0,0,0.55)',
            }}
          >
            {mine ? 'added by you' : `added by ${p.user_email.split('@')[0]}`}{' '}
            · {daysAway(p.event_date)}
          </p>
        </div>

        <div
          className="flex items-center"
          style={{ gap: '6px', marginTop: '12px' }}
        >
          <button
            onClick={() => addToCalendar(p)}
            className="border-2 border-black rounded-lg font-black transition hover:-translate-y-0.5 active:translate-y-0.5"
            style={{
              padding: '5px 10px',
              fontSize: '10px',
              background: `
                linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
                #FFFDF5
              `,
              color: '#000',
              boxShadow: '2px 2px 0 0 black',
            }}
          >
            📅 add to calendar
          </button>
        </div>

        {mine && (
          <button
            onClick={() => handleDelete(p)}
            className="absolute border-2 border-black bg-[#FFFDF5] text-black font-black hover:-translate-y-0.5 active:translate-y-0.5 transition"
            style={{
              top: '-10px',
              right: '-10px',
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              fontSize: '11px',
              lineHeight: 1,
              boxShadow: '2px 2px 0px 0px rgba(0,0,0,1)',
              zIndex: 5,
            }}
            aria-label="Delete plan"
          >
            ✕
          </button>
        )}
      </div>
    );
  }

  // ============================
  // SLIDE 1: CALENDAR
  // ============================
  const calendarSlide = (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: '0 4px 16px',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* CALENDAR CARD */}
        <div
          className="border-4 border-black shrink-0"
          style={{
            borderRadius: '22px',
            background: `
              linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
              rgba(255,253,245,0.95)
            `,
            backdropFilter: 'blur(14px) saturate(160%)',
            WebkitBackdropFilter: 'blur(14px) saturate(160%)',
            boxShadow: `
              7px 7px 0 0 black,
              inset 0 1px 0 rgba(255,255,255,0.75)
            `,
            padding: '14px',
            overflow: 'hidden',
          }}
        >
          {/* Month header */}
          <div
            className="flex items-center justify-between"
            style={{ marginBottom: '12px', gap: '8px' }}
          >
            <button
              onClick={prevMonth}
              className="border-2 border-black rounded-full font-black transition hover:-translate-y-0.5 active:translate-y-0.5"
              style={{
                width: '34px',
                height: '34px',
                fontSize: '15px',
                lineHeight: 1,
                background: `
                  linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
                  #FFD1DC
                `,
                boxShadow: '2px 2px 0 0 black',
                cursor: 'pointer',
                flexShrink: 0,
              }}
              aria-label="Previous month"
            >
              ‹
            </button>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                minWidth: 0,
              }}
            >
              <CalIcon
                className="size-5"
                strokeWidth={2.75}
                style={{ color: '#000', flexShrink: 0 }}
              />
              <p
                style={{
                  margin: 0,
                  fontSize: '16px',
                  fontWeight: 900,
                  color: '#000',
                  whiteSpace: 'nowrap',
                }}
              >
                {MONTH_NAMES[viewMonth]} {viewYear}
              </p>
            </div>

            <button
              onClick={nextMonth}
              className="border-2 border-black rounded-full font-black transition hover:-translate-y-0.5 active:translate-y-0.5"
              style={{
                width: '34px',
                height: '34px',
                fontSize: '15px',
                lineHeight: 1,
                background: `
                  linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
                  #E2F0D9
                `,
                boxShadow: '2px 2px 0 0 black',
                cursor: 'pointer',
                flexShrink: 0,
              }}
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          {/* Weekday labels */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '2px',
              marginBottom: '4px',
            }}
          >
            {WEEKDAYS.map((d, i) => (
              <div
                key={i}
                style={{
                  textAlign: 'center',
                  fontSize: '10px',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  color:
                    i === 0
                      ? '#C2185B'
                      : i === 6
                      ? '#3A7A5E'
                      : 'rgba(0,0,0,0.5)',
                  padding: '4px 0',
                }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day grid — swipeable */}
          <div
            onPointerDown={calPointerDown}
            onPointerMove={calPointerMove}
            onPointerUp={calPointerUp}
            onPointerCancel={calPointerUp}
            style={{
              touchAction: 'pan-y',
              cursor: dragging ? 'grabbing' : 'default',
              transform: `translateX(${dragX}px)`,
              transition: dragging
                ? 'none'
                : 'transform 0.3s cubic-bezier(0.34, 1.15, 0.64, 1)',
              userSelect: 'none',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: '3px',
              }}
            >
              {calendarCells.map((day, i) => {
                if (day === null)
                  return <div key={i} style={{ height: '42px' }} />;

                const cellYmd = ymd(viewYear, viewMonth, day);
                const isToday = cellYmd === today;
                const isSelected = cellYmd === selectedDate;
                const hasEvents = !!plansByDate[cellYmd];
                const weekday = new Date(cellYmd + 'T00:00:00').getDay();
                const isSunday = weekday === 0;
                const isSaturday = weekday === 6;

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      if (dragging) return;
                      setSelectedDate(cellYmd);
                    }}
                    style={{
                      position: 'relative',
                      height: '42px',
                      border: '2px solid black',
                      borderColor: isSelected ? 'black' : 'transparent',
                      borderRadius: '12px',
                      fontSize: '13px',
                      fontWeight: 900,
                      color: isSelected
                        ? '#000'
                        : isToday
                        ? '#000'
                        : isSunday
                        ? '#C2185B'
                        : isSaturday
                        ? '#3A7A5E'
                        : '#000',
                      cursor: 'pointer',
                      background: isSelected
                        ? 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #D4F0F0'
                        : isToday
                        ? 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FFF5BA'
                        : 'transparent',
                      boxShadow: isSelected
                        ? '3px 3px 0 0 black'
                        : isToday
                        ? '2px 2px 0 0 black'
                        : 'none',
                    }}
                  >
                    {day}
                    {hasEvents && (
                      <span
                        style={{
                          position: 'absolute',
                          bottom: '4px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          width: '5px',
                          height: '5px',
                          borderRadius: '999px',
                          background: '#FF8BA7',
                          border: '1px solid black',
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Hint */}
          <p
            style={{
              margin: '10px 0 0',
              textAlign: 'center',
              fontSize: '9px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'rgba(0,0,0,0.35)',
            }}
          >
            ← swipe to change month →
          </p>
        </div>

        {/* SELECTED DAY DETAILS */}
        <div
          className="border-4 border-black shrink-0"
          style={{
            borderRadius: '22px',
            background: `
              linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
              rgba(230,230,250,0.85)
            `,
            backdropFilter: 'blur(14px) saturate(160%)',
            WebkitBackdropFilter: 'blur(14px) saturate(160%)',
            padding: '14px 16px',
            boxShadow: `
              5px 5px 0 0 black,
              inset 0 1px 0 rgba(255,255,255,0.7)
            `,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: selectedDatePlans.length > 0 ? '12px' : '0',
            }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: '10px',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'rgba(0,0,0,0.55)',
                }}
              >
                {selectedDate === today ? '★ today' : 'selected'}
              </p>
              <p
                style={{
                  margin: '3px 0 0',
                  fontSize: '13px',
                  fontWeight: 900,
                  color: '#000',
                }}
              >
                {humanDateLong(selectedDate)}
              </p>
            </div>
            <button
              onClick={() => {
                setEventDate(selectedDate);
                setComposerOpen(true);
              }}
              className="inline-flex items-center border-2 border-black rounded-full font-black transition hover:-translate-y-0.5 active:translate-y-0.5"
              style={{
                padding: '6px 12px',
                gap: '4px',
                fontSize: '11px',
                background: `
                  linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
                  #E2F0D9
                `,
                color: '#000',
                boxShadow: '2px 2px 0 0 black',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <Plus className="size-3" strokeWidth={3} />
              add
            </button>
          </div>

          {selectedDatePlans.length === 0 ? (
            <p
              style={{
                margin: '10px 0 0',
                fontSize: '12px',
                fontWeight: 700,
                fontStyle: 'italic',
                color: 'rgba(0,0,0,0.45)',
                textAlign: 'center',
                padding: '8px 0',
              }}
            >
              no plans for this day
            </p>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              {selectedDatePlans.map((p) => {
                const mine = p.user_email === email;
                return (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      background: `
                        linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
                        #FFFDF5
                      `,
                      border: '2px solid black',
                      borderRadius: '14px',
                      padding: '10px 12px',
                      boxShadow: '2px 2px 0 0 black',
                    }}
                  >
                    <span
                      style={{
                        width: '6px',
                        height: '32px',
                        borderRadius: '999px',
                        background: colorFor(p.id),
                        border: '2px solid black',
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p
                        style={{
                          margin: 0,
                          fontWeight: 900,
                          fontSize: '13px',
                          color: '#000',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {p.title}
                      </p>
                      <p
                        style={{
                          margin: '2px 0 0',
                          fontSize: '10px',
                          fontWeight: 800,
                          color: 'rgba(0,0,0,0.5)',
                        }}
                      >
                        {p.event_time
                          ? `⏰ ${formatTime12(p.event_time)} · `
                          : ''}
                        {mine ? 'you' : p.user_email.split('@')[0]}
                      </p>
                    </div>
                    {mine && (
                      <button
                        onClick={() => handleDelete(p)}
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '999px',
                          border: '2px solid black',
                          background: '#FFD1DC',
                          color: '#000',
                          fontWeight: 900,
                          fontSize: '11px',
                          lineHeight: 1,
                          cursor: 'pointer',
                          flexShrink: 0,
                          boxShadow: '1px 1px 0 0 black',
                        }}
                        aria-label="Delete"
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

        {/* COMPOSER (collapsible) */}
        {composerOpen ? (
          <form
            onSubmit={handleAdd}
            className="border-4 border-black shrink-0"
            style={{
              borderRadius: '22px',
              background: `
                linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
                rgba(230,230,250,0.92)
              `,
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              boxShadow: `
                6px 6px 0 0 black,
                inset 0 1px 0 rgba(255,255,255,0.7)
              `,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '2px',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: '11px',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: '#000',
                }}
              >
                ✨ new plan
              </p>
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '999px',
                  border: '2px solid black',
                  background: '#FFD1DC',
                  color: '#000',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-label="Close"
              >
                <X className="size-3" strokeWidth={3} />
              </button>
            </div>

            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="what's the plan?"
              maxLength={120}
              disabled={posting}
              autoFocus
              style={inputStyle}
            />

            {/* Date with calendar icon */}
            <div style={{ position: 'relative' }}>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                disabled={posting}
                style={{
                  ...inputStyle,
                  paddingRight: '48px',
                }}
              />
              <CalIcon
                className="size-5"
                strokeWidth={2.75}
                style={{
                  position: 'absolute',
                  right: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#000',
                  pointerEvents: 'none',
                }}
              />
            </div>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: '12px',
                color: '#000',
                paddingLeft: '4px',
              }}
            >
              <input
                type="checkbox"
                checked={addTime}
                onChange={(e) => setAddTime(e.target.checked)}
                disabled={posting}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              ⏰ add a time
            </label>

            {addTime && (
              <div
                style={{
                  border: '3px dashed rgba(0,0,0,0.25)',
                  borderRadius: '14px',
                  padding: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  background: 'rgba(255,255,255,0.5)',
                }}
              >
                <select
                  value={hour12}
                  onChange={(e) => setHour12(Number(e.target.value))}
                  style={{
                    border: '2px solid black',
                    borderRadius: '10px',
                    background: '#FFFDF5',
                    color: '#000',
                    fontSize: '16px',
                    fontWeight: 900,
                    padding: '6px 10px',
                    outline: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    minWidth: '64px',
                    boxShadow: '2px 2px 0 0 black',
                  }}
                >
                  {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                <span
                  style={{ fontSize: '20px', fontWeight: 900, color: '#000' }}
                >
                  :
                </span>
                <select
                  value={minute}
                  onChange={(e) => setMinute(Number(e.target.value))}
                  style={{
                    border: '2px solid black',
                    borderRadius: '10px',
                    background: '#FFFDF5',
                    color: '#000',
                    fontSize: '16px',
                    fontWeight: 900,
                    padding: '6px 10px',
                    outline: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    minWidth: '64px',
                    boxShadow: '2px 2px 0 0 black',
                  }}
                >
                  {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                    <option key={m} value={m}>
                      {pad(m)}
                    </option>
                  ))}
                </select>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    marginLeft: '4px',
                  }}
                >
                  {(['AM', 'PM'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAmpm(v)}
                      style={{
                        border: '2px solid black',
                        borderRadius: '8px',
                        padding: '3px 10px',
                        fontSize: '11px',
                        fontWeight: 900,
                        color: '#000',
                        cursor: 'pointer',
                        background:
                          ampm === v
                            ? 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FF8BA7'
                            : '#FFFDF5',
                        boxShadow:
                          ampm === v
                            ? '2px 2px 0 0 black'
                            : '1px 1px 0 0 black',
                      }}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
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
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={posting || !title.trim() || !eventDate || !userId}
              className="inline-flex items-center justify-center border-2 border-black bg-[#E2F0D9] text-black text-xs font-black rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition disabled:opacity-50 disabled:hover:translate-y-0"
              style={{ padding: '12px 18px', gap: '8px' }}
            >
              <span className="text-sm leading-none">
                {posting ? '···' : '📅'}
              </span>
              <span className="leading-none tracking-wider">
                {posting ? 'ADDING' : 'ADD PLAN'}
              </span>
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setEventDate(selectedDate);
              setComposerOpen(true);
            }}
            className="inline-flex items-center justify-center border-4 border-black shrink-0 hover:-translate-y-0.5 active:translate-y-0.5 transition"
            style={{
              borderRadius: '22px',
              padding: '16px',
              background: `
                linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
                rgba(230,230,250,0.85)
              `,
              backdropFilter: 'blur(14px) saturate(160%)',
              WebkitBackdropFilter: 'blur(14px) saturate(160%)',
              boxShadow: `
                5px 5px 0 0 black,
                inset 0 1px 0 rgba(255,255,255,0.7)
              `,
              gap: '8px',
              color: '#000',
              fontSize: '13px',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            <Plus className="size-4" strokeWidth={3} />
            add a plan
          </button>
        )}

        {/* Upcoming preview */}
        {upcomingPlans.length > 0 && (
          <div style={{ paddingTop: '4px' }}>
            <p
              style={{
                margin: '0 0 12px',
                fontSize: '11px',
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: 'rgba(255,253,245,0.55)',
                paddingLeft: '8px',
              }}
            >
              🎯 coming up next
            </p>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '22px',
              }}
            >
              {upcomingPlans.slice(0, 3).map((p) => renderPlanCard(p))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ============================
  // SLIDE 2: UPCOMING
  // ============================
  const upcomingSlide = (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: '0 4px 16px',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
        <div
          className="border-4 border-black shrink-0"
          style={{
            borderRadius: '22px',
            background: `
              linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
              rgba(226,240,217,0.92)
            `,
            padding: '16px',
            boxShadow: `
              6px 6px 0 0 black,
              inset 0 1px 0 rgba(255,255,255,0.7)
            `,
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          <span
            className="gloss-shine"
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '999px',
              border: '4px solid black',
              background: `
                linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
                #E2F0D9
              `,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              boxShadow: '3px 3px 0 0 black',
              flexShrink: 0,
            }}
          >
            📆
          </span>
          <div>
            <p
              style={{
                margin: 0,
                fontSize: '11px',
                fontWeight: 900,
                color: '#000',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              on the horizon
            </p>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: '22px',
                fontWeight: 900,
                color: '#000',
                lineHeight: 1,
              }}
            >
              {upcomingPlans.length}
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 800,
                  color: 'rgba(0,0,0,0.5)',
                  marginLeft: '6px',
                }}
              >
                upcoming
              </span>
            </p>
          </div>
        </div>

        {upcomingPlans.length === 0 ? (
          <div
            className="border-4 border-black text-center"
            style={{
              borderRadius: '22px',
              background: '#FFFDF5',
              padding: '40px 20px',
              boxShadow: '6px 6px 0 0 black',
            }}
          >
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>🗓️</div>
            <p
              style={{
                margin: 0,
                color: '#000',
                fontWeight: 800,
                fontSize: '13px',
              }}
            >
              nothing planned yet
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '22px',
            }}
          >
            {upcomingPlans.map((p) => renderPlanCard(p))}
          </div>
        )}
      </div>
    </div>
  );

  // ============================
  // SLIDE 3: PAST
  // ============================
  const pastSlide = (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: '0 4px 16px',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
        <div
          className="border-4 border-black shrink-0"
          style={{
            borderRadius: '22px',
            background: `
              linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%),
              rgba(212,240,240,0.92)
            `,
            padding: '16px',
            boxShadow: `
              6px 6px 0 0 black,
              inset 0 1px 0 rgba(255,255,255,0.7)
            `,
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          <span
            className="gloss-shine"
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '999px',
              border: '4px solid black',
              background: `
                linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
                #D4F0F0
              `,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              boxShadow: '3px 3px 0 0 black',
              flexShrink: 0,
            }}
          >
            ⏰
          </span>
          <div>
            <p
              style={{
                margin: 0,
                fontSize: '11px',
                fontWeight: 900,
                color: '#000',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              the archive
            </p>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: '22px',
                fontWeight: 900,
                color: '#000',
                lineHeight: 1,
              }}
            >
              {pastPlans.length}
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 800,
                  color: 'rgba(0,0,0,0.5)',
                  marginLeft: '6px',
                }}
              >
                past
              </span>
            </p>
          </div>
        </div>

        {pastPlans.length === 0 ? (
          <div
            className="border-4 border-black text-center"
            style={{
              borderRadius: '22px',
              background: '#FFFDF5',
              padding: '40px 20px',
              boxShadow: '6px 6px 0 0 black',
            }}
          >
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>📜</div>
            <p
              style={{
                margin: 0,
                color: '#000',
                fontWeight: 800,
                fontSize: '13px',
              }}
            >
              no history yet
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '22px',
            }}
          >
            {pastPlans.map((p) => renderPlanCard(p))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-[#1a0b2e] font-mono flex justify-center overflow-hidden">
      <div
        className="w-full max-w-3xl h-full flex flex-col p-3 sm:p-6 gap-3 sm:gap-4"
        style={{ minHeight: 0 }}
      >
        <div className="flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="gloss-shine flex size-10 sm:size-12 shrink-0 items-center justify-center rounded-2xl border-4 border-black"
              style={{
                background: `
                  linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%),
                  #FFD1DC
                `,
                fontSize: '20px',
              }}
            >
              📅
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-black text-lg sm:text-2xl leading-tight text-white">
                plans
              </h1>
              <p className="text-[10px] sm:text-xs font-bold leading-tight text-white/60">
                {plans.length} plan{plans.length === 1 ? '' : 's'} ·{' '}
                {upcomingPlans.length} upcoming
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex items-center border-4 border-black bg-[#E2F0D9] text-black font-black rounded-xl shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition shrink-0"
            style={{ padding: '8px 16px', gap: '8px' }}
          >
            <span className="text-base leading-none">←</span>
            <span className="text-sm leading-none hidden sm:inline">back</span>
          </Link>
        </div>

        <SwipeCarousel
          mode="fill"
          index={tabIndex}
          onIndexChange={setTabIndex}
          labels={[
            '📅 calendar',
            `📆 upcoming${
              upcomingPlans.length > 0 ? ` · ${upcomingPlans.length}` : ''
            }`,
            '⏰ past',
          ]}
          slides={[calendarSlide, upcomingSlide, pastSlide]}
        />
      </div>
    </div>
  );
}