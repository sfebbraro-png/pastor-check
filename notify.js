// Tells Steve what's happening: logs every notice on the owner page, and emails it when email is set up.
// Email goes through Resend (resend.com). Railway variables:
//   RESEND_API_KEY  - from resend.com
//   NOTIFY_EMAIL    - where notices go (defaults to the owner login email)
//   EMAIL_FROM      - optional. Leave it out to send from Resend's test address, which can only
//                     email the address you signed up to Resend with.
import * as db from './db.js';

const fmt = d => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });

export function emailReady() { return !!process.env.RESEND_API_KEY; }

async function sendEmail(subject, text) {
  const to = process.env.NOTIFY_EMAIL || db.firstOwnerEmail();
  if (!emailReady() || !to) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || 'Is This Really Pastor <onboarding@resend.dev>', to: [to], subject, text }),
    });
    if (!res.ok) { console.error('email failed', res.status, await res.text()); return false; }
    return true;
  } catch (err) {
    console.error('email failed', err);
    return false;
  }
}

// Log a notice (once per ref) and email it. Safe to call often.
export async function notify(churchId, kind, subject, text, ref = '') {
  const id = db.addEvent(churchId, kind, text, ref);
  if (!id) return;
  if (await sendEmail(subject, `${text}\n\nOwner page: ${(process.env.PUBLIC_URL || 'https://isthisreallypastor.com').replace(/\/$/, '')}/owner`)) db.markEventEmailed(id);
}

// Runs every hour. Each notice has a ref tied to the date it's about, so it goes out once,
// and goes out again if Steve changes the date.
export async function sweep(now = new Date()) {
  for (const c of db.allChurches()) {
    const s = db.accessState(c, now);
    if (s.state === 'trial' && s.daysLeft <= 5) {
      await notify(c.id, 'trial_soon', `${c.name}: free month ends ${fmt(s.endsAt)}`,
        `${c.name} (${c.city || 'no city'}) has ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'} left in its free month. It ends ${fmt(s.endsAt)}.\nGood time to call the office (${c.office_phone}) and ask if they'll keep it for $99 a year.`,
        `trial_soon:${c.trial_ends_at}`);
    }
    if (s.state === 'grace') {
      const why = s.reason === 'renewal' ? 'paid year ended' : 'free month ended';
      await notify(c.id, 'grace', `${c.name}: ${why}, page pauses ${fmt(s.pausesAt)}`,
        `${c.name}'s ${why} and they haven't paid. Their members' page keeps working until ${fmt(s.pausesAt)}, then it pauses.`,
        `grace:${s.reason}:${s.reason === 'renewal' ? c.paid_until : c.trial_ends_at}`);
    }
    if (s.state === 'paused' && s.reason !== 'cancelled') {
      await notify(c.id, 'paused', `${c.name}: members' page paused`,
        `${c.name}'s members' page is now paused because they didn't pay. If they pay by card from their dashboard, it turns back on right away. If they pay you another way, mark them paid on the owner page.`,
        `paused:${s.reason}:${s.reason === 'renewal' ? c.paid_until : c.trial_ends_at}`);
    }
  }
}

export function startSweeper() {
  const run = () => sweep().catch(err => console.error('sweep failed', err));
  setTimeout(run, 10_000).unref();
  setInterval(run, 3_600_000).unref();
}
