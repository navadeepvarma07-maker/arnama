import { supabase } from './supabase';

type PlanLike = {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  event_time: string | null;
};

/** Escape special characters for ICS text fields */
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** Generate an ICS file content for a plan */
function buildICS(plan: PlanLike): string {
  // YYYY-MM-DD → YYYYMMDD
  const dateCompact = plan.event_date.replace(/-/g, '');

  // Default to 9:00 AM if no time set
  let startHH = '09';
  let startMM = '00';
  if (plan.event_time) {
    const [h, m] = plan.event_time.split(':');
    startHH = h.padStart(2, '0');
    startMM = m.padStart(2, '0');
  }

  // 1-hour event
  const startHour = parseInt(startHH, 10);
  const endHour = (startHour + 1) % 24;
  const endHH = endHour.toString().padStart(2, '0');

  const dtStart = `${dateCompact}T${startHH}${startMM}00`;
  const dtEnd = `${dateCompact}T${endHH}${startMM}00`;
  const dtStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const summary = esc(`arnama · ${plan.title}`);
  const description = esc(plan.description || 'plan from arnama');

  // \r\n line endings are REQUIRED by the ICS spec
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//arnama//plans//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${plan.id}@arnama`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT10M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(plan.title)} starting soon`,
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:PT0S',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(plan.title)} is now`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.join('\r\n');
}

/** Download an .ics file for the given plan */
export function downloadPlanReminder(plan: PlanLike) {
  const ics = buildICS(plan);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });

  // Filename: safe, short
  const safeTitle = plan.title
    .slice(0, 30)
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase() || 'plan';

  const filename = `arnama-${safeTitle}.ics`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}