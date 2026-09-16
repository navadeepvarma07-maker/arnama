'use client';

import { useEffect, useState } from 'react';

const MONTHS_FULL = [
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
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseTime(t: string): { h: number; m: number; ampm: 'AM' | 'PM' } {
  if (!t) return { h: 12, m: 0, ampm: 'AM' };
  const [hh, mm] = t.split(':').map(Number);
  const isPM = hh >= 12;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return { h: h12, m: mm, ampm: isPM ? 'PM' : 'AM' };
}

export function DatePicker({
  value,
  timeValue,
  onChange,
  onTimeChange,
}: {
  value: string;
  timeValue: string;
  onChange: (date: string) => void;
  onTimeChange: (time: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const initialDate = value ? new Date(value + 'T00:00:00') : new Date();
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());

  const initP = parseTime(timeValue);
  const [hour12, setHour12] = useState(initP.h);
  const [minute, setMinute] = useState(initP.m);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>(initP.ampm);

  useEffect(() => {
    if (open) {
      const d = value ? new Date(value + 'T00:00:00') : new Date();
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
      const p = parseTime(timeValue);
      setHour12(p.h);
      setMinute(p.m);
      setAmpm(p.ampm);
    }
  }, [open, value, timeValue]);

  function fmtDisplay(): string {
    if (!value) return '📅 pick a date & time';
    const d = new Date(value + 'T00:00:00');
    const dateStr = d.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    if (!timeValue) return dateStr;
    const [hh, mm] = timeValue.split(':').map(Number);
    const isPM = hh >= 12;
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${dateStr} · ${h12}:${String(mm).padStart(2, '0')} ${
      isPM ? 'PM' : 'AM'
    }`;
  }

  function daysInMonth(y: number, m: number): number {
    return new Date(y, m + 1, 0).getDate();
  }
  function firstDayOfMonth(y: number, m: number): number {
    return new Date(y, m, 1).getDay();
  }

  const todayYMD = toYMD(new Date());

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else setViewMonth(viewMonth - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else setViewMonth(viewMonth + 1);
  }

  function pickDay(day: number) {
    const ymd = `${viewYear}-${String(viewMonth + 1).padStart(
      2,
      '0'
    )}-${String(day).padStart(2, '0')}`;
    onChange(ymd);
  }

  function confirm() {
    const h24 =
      ampm === 'AM'
        ? hour12 === 12
          ? 0
          : hour12
        : hour12 === 12
        ? 12
        : hour12 + 12;
    const t = `${String(h24).padStart(2, '0')}:${String(minute).padStart(
      2,
      '0'
    )}`;
    onTimeChange(t);
    if (!value) onChange(todayYMD);
    setOpen(false);
  }

  const totalDays = daysInMonth(viewYear, viewMonth);
  const firstDay = firstDayOfMonth(viewYear, viewMonth);
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length < 42) cells.push(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          flex: 1,
          border: '2px solid black',
          borderRadius: '14px',
          background: '#FFFDF5',
          color: value ? '#000' : 'rgba(0,0,0,0.45)',
          fontSize: '13px',
          padding: '11px 14px',
          outline: 'none',
          fontWeight: 700,
          fontFamily: 'inherit',
          textAlign: 'left',
          cursor: 'pointer',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {fmtDisplay()}
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(26, 11, 46, 0.55)',
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
              transform: 'translate(-50%, -50%)',
              width: 'min(360px, calc(100vw - 32px))',
              maxHeight: 'calc(100vh - 64px)',
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
              zIndex: 1001,
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
                gap: '10px',
              }}
            >
              <button
                type="button"
                onClick={prevMonth}
                style={{
                  width: '36px',
                  height: '36px',
                  border: '3px solid black',
                  borderRadius: '999px',
                  background: '#FFD1DC',
                  color: '#000',
                  fontWeight: 900,
                  fontSize: '16px',
                  lineHeight: 1,
                  boxShadow: '3px 3px 0 0 black',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                ‹
              </button>
              <p
                style={{
                  margin: 0,
                  fontSize: '15px',
                  fontWeight: 900,
                  color: '#000',
                }}
              >
                {MONTHS_FULL[viewMonth]} {viewYear}
              </p>
              <button
                type="button"
                onClick={nextMonth}
                style={{
                  width: '36px',
                  height: '36px',
                  border: '3px solid black',
                  borderRadius: '999px',
                  background: '#E2F0D9',
                  color: '#000',
                  fontWeight: 900,
                  fontSize: '16px',
                  lineHeight: 1,
                  boxShadow: '3px 3px 0 0 black',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                ›
              </button>
            </div>

            {/* Day-of-week */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: '4px',
                marginBottom: '6px',
              }}
            >
              {DAYS.map((d, i) => (
                <div
                  key={i}
                  style={{
                    textAlign: 'center',
                    fontSize: '10px',
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    color: 'rgba(0,0,0,0.5)',
                    padding: '4px 0',
                  }}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: '4px',
                marginBottom: '16px',
              }}
            >
              {cells.map((day, i) => {
                if (day === null) return <div key={i} style={{ height: '38px' }} />;
                const ymd = `${viewYear}-${String(viewMonth + 1).padStart(
                  2,
                  '0'
                )}-${String(day).padStart(2, '0')}`;
                const isSelected = ymd === value;
                const isToday = ymd === todayYMD;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pickDay(day)}
                    style={{
                      height: '38px',
                      border: '2px solid black',
                      borderColor:
                        isSelected || isToday ? 'black' : 'transparent',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: 900,
                      color: '#000',
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
                  </button>
                );
              })}
            </div>

            {/* Time */}
            <div
              style={{
                borderTop: '3px dashed rgba(0,0,0,0.2)',
                paddingTop: '14px',
                marginBottom: '14px',
              }}
            >
              <p
                style={{
                  margin: '0 0 10px',
                  fontSize: '10px',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'rgba(0,0,0,0.6)',
                }}
              >
                ⏰ pick a time
              </p>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <select
                  value={hour12}
                  onChange={(e) => setHour12(Number(e.target.value))}
                  style={{
                    border: '3px solid black',
                    borderRadius: '12px',
                    background: '#FFFDF5',
                    color: '#000',
                    fontSize: '16px',
                    fontWeight: 900,
                    padding: '8px 10px',
                    outline: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'center',
                    minWidth: '70px',
                    boxShadow: '3px 3px 0 0 black',
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
                    border: '3px solid black',
                    borderRadius: '12px',
                    background: '#FFFDF5',
                    color: '#000',
                    fontSize: '16px',
                    fontWeight: 900,
                    padding: '8px 10px',
                    outline: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'center',
                    minWidth: '70px',
                    boxShadow: '3px 3px 0 0 black',
                  }}
                >
                  {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                    <option key={m} value={m}>
                      {String(m).padStart(2, '0')}
                    </option>
                  ))}
                </select>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    marginLeft: '6px',
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
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 900,
                        color: '#000',
                        cursor: 'pointer',
                        background:
                          ampm === v
                            ? 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #FF8BA7'
                            : '#FFFDF5',
                        boxShadow:
                          ampm === v ? '2px 2px 0 0 black' : '1px 1px 0 0 black',
                      }}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  flex: 1,
                  border: '3px solid black',
                  borderRadius: '999px',
                  background: '#FFFDF5',
                  color: '#000',
                  fontWeight: 900,
                  fontSize: '13px',
                  padding: '10px',
                  cursor: 'pointer',
                  boxShadow: '3px 3px 0 0 black',
                }}
              >
                cancel
              </button>
              <button
                type="button"
                onClick={confirm}
                style={{
                  flex: 2,
                  border: '3px solid black',
                  borderRadius: '999px',
                  background:
                    'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%), #E2F0D9',
                  color: '#000',
                  fontWeight: 900,
                  fontSize: '13px',
                  padding: '10px',
                  cursor: 'pointer',
                  boxShadow: '3px 3px 0 0 black',
                }}
              >
                ✓ done
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}