// iCalendar feed of all editions with a date, for Google/Apple/Outlook subscriptions.
import type { APIRoute } from 'astro';
import { model } from '../lib/data';
import { editionName, editionUrl } from '../lib/site';

const esc = (s: string) => s.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
const day = (iso: string) => iso.replaceAll('-', '');
const nextDay = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replaceAll('-', '');
};

export const GET: APIRoute = ({ site }) => {
  const m = model();
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//carrom.cz//kalendar//CS', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Carrom ČCA', 'X-WR-TIMEZONE:Europe/Prague'];
  for (const e of m.editionList) {
    if (!e.start_date) continue;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id.replace('/', '-')}@carrom.cz`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day(e.start_date)}`,
      `DTEND;VALUE=DATE:${nextDay(e.end_date ?? e.start_date)}`,
      `SUMMARY:${esc(editionName(e))}`,
      ...(e.venue?.name ? [`LOCATION:${esc([e.venue.name, e.venue.address ?? e.venue.city].filter(Boolean).join(', '))}`] : []),
      `URL:${new URL(editionUrl(e), site).href}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return new Response(lines.join('\r\n'), { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } });
};
