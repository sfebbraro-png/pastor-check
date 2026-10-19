// All email the app sends: notices to Steve, and messages to church offices.
// Email goes out through Resend (resend.com), sending as steve@isthisreallypastor.com.
// Replies land in that mailbox (Namecheap Private Email). Railway variables:
//   RESEND_API_KEY  - from resend.com (the isthisreallypastor.com domain must be verified there)
//   SUPPORT_EMAIL   - the address churches see and reply to (default steve@isthisreallypastor.com)
//   NOTIFY_EMAIL    - where notices to Steve go (default: SUPPORT_EMAIL)
//   EMAIL_FROM      - the "From" line (default: Is This Really Pastor <SUPPORT_EMAIL>)
import * as db from './db.js';

export const SITE = () => (process.env.PUBLIC_URL || 'https://isthisreallypastor.com').replace(/\/$/, '');
export const supportEmail = () => process.env.SUPPORT_EMAIL || 'steve@isthisreallypastor.com';
const ownerTo = () => process.env.NOTIFY_EMAIL || supportEmail();
const fromLine = () => process.env.EMAIL_FROM || `Is This Really Pastor <${supportEmail()}>`;
export const emailReady = () => !!process.env.RESEND_API_KEY;

export const fmtDay = d => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
const signoff = () => `\n\nSteve Febbraro\nIs This Really Pastor?\n${supportEmail()}`;

// Send one email. Returns true if Resend accepted it.
export async function sendEmail(to, subject, text) {
  if (!emailReady() || !to) return false;
  try {
    // RESEND_API_BASE is only for the automated tests, which point at a stand-in Resend.
    const res = await fetch(`${process.env.RESEND_API_BASE || 'https://api.resend.com'}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromLine(), to: [to], reply_to: supportEmail(), subject, text }),
    });
    if (!res.ok) { console.error('email failed', res.status, await res.text()); return false; }
    return true;
  } catch (err) {
    console.error('email failed', err);
    return false;
  }
}

// The address that reaches a church office: its login email once it has one, otherwise the office email.
export function churchAddress(c) {
  if (c.admin_email && !/@pending\.invalid$/.test(c.admin_email) && c.slug !== 'demo') return c.admin_email;
  return c.office_email || '';
}

// Messages to church offices, written once here.
export const toChurch = {
  welcome: (c, endsAt) => ({
    subject: `Your page is ready: ${c.name}`,
    text: `Hello,\n\nYour church's message checker is ready and it's yours now.\n\nYour members' page: ${SITE()}/c/${c.slug}\nPrintable flyer with QR code: ${SITE()}/c/${c.slug}/flyer\nYour dashboard: ${SITE()}/login (log in with ${c.admin_email})\n\nPut the link in your newsletter and the flyer in Sunday's bulletin. When a member taps "Tell the church office," you'll see it on your dashboard.${endsAt ? `\n\nYour free month runs until ${fmtDay(endsAt)}. After that it's $99 a year, paid by card from your dashboard.` : ''}\n\nQuestions? Just reply to this email.${signoff()}`,
  }),
  trialSoon: (c, s) => ({
    subject: `Your free month ends ${fmtDay(s.endsAt)}`,
    text: `Hello,\n\n${c.name}'s free month of Is This Really Pastor? ends ${fmtDay(s.endsAt)}.\n\nTo keep your members' page running, log in at ${SITE()}/login and press "Pay $99 a year by card." It renews once a year, and you can cancel any time by replying to this email.\n\nIf you'd rather not continue, you don't need to do anything.${signoff()}`,
  }),
  grace: (c, s) => ({
    subject: `Your members' page pauses ${fmtDay(s.pausesAt)}`,
    text: `Hello,\n\n${s.reason === 'renewal' ? `${c.name}'s paid year has ended` : `${c.name}'s free month has ended`}. Your members' page will keep working until ${fmtDay(s.pausesAt)}, then it pauses.\n\nTo keep it on, log in at ${SITE()}/login and press "Pay $99 a year by card."${signoff()}`,
  }),
  paused: c => ({
    subject: `Your members' page is paused`,
    text: `Hello,\n\n${c.name}'s members' page is now paused. Members who open it are told not to reply to suspicious messages and to contact the church office.\n\nYou can turn it back on any time: log in at ${SITE()}/login and press "Pay $99 a year by card." It comes back right away.${signoff()}`,
  }),
  paymentFailed: c => ({
    subject: `Your card payment didn't go through`,
    text: `Hello,\n\nWe couldn't charge the card on file for ${c.name}'s yearly payment. Stripe will try again over the next few days. If your card has changed, reply to this email and I'll help you update it.${signoff()}`,
  }),
};

// Log a notice for Steve (once per ref), email it to him, and optionally email the church office too.
// Returns true if this notice was new.
export async function notify(churchId, kind, subject, text, ref = '', churchMsg = null) {
  const id = db.addEvent(churchId, kind, text, ref);
  if (!id) return false;
  if (churchMsg) {
    const c = db.getChurchById(churchId);
    const to = c ? churchAddress(c) : '';
    if (to && await sendEmail(to, churchMsg.subject, churchMsg.text)) text += `\n\nWe emailed the church office (${to}).`;
  }
  if (await sendEmail(ownerTo(), subject, `${text}\n\nOwner page: ${SITE()}/owner`)) db.markEventEmailed(id);
  return true;
}

// Runs every hour. Each notice has a ref tied to the date it's about, so it goes out once,
// and goes out again if Steve changes the date.
export async function sweep(now = new Date()) {
  for (const c of db.allChurches()) {
    const s = db.accessState(c, now);
    if (s.state === 'trial' && s.daysLeft <= 5) {
      await notify(c.id, 'trial_soon', `${c.name}: free month ends ${fmtDay(s.endsAt)}`,
        `${c.name} (${c.city || 'no city'}) has ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'} left in its free month. It ends ${fmtDay(s.endsAt)}. They've been sent a reminder with how to pay.`,
        `trial_soon:${c.trial_ends_at}`, toChurch.trialSoon(c, s));
    }
    if (s.state === 'grace') {
      const why = s.reason === 'renewal' ? 'paid year ended' : 'free month ended';
      await notify(c.id, 'grace', `${c.name}: ${why}, page pauses ${fmtDay(s.pausesAt)}`,
        `${c.name}'s ${why} and they haven't paid. Their members' page keeps working until ${fmtDay(s.pausesAt)}, then it pauses.`,
        `grace:${s.reason}:${s.reason === 'renewal' ? c.paid_until : c.trial_ends_at}`, toChurch.grace(c, s));
    }
    if (s.state === 'paused' && s.reason !== 'cancelled') {
      await notify(c.id, 'paused', `${c.name}: members' page paused`,
        `${c.name}'s members' page is now paused because they didn't pay. If they pay by card from their dashboard, it turns back on right away. If they pay you another way, mark them paid on the owner page.`,
        `paused:${s.reason}:${s.reason === 'renewal' ? c.paid_until : c.trial_ends_at}`, toChurch.paused(c));
    }
  }
}

export function startSweeper() {
  const run = () => sweep().catch(err => console.error('sweep failed', err));
  setTimeout(run, 10_000).unref();
  setInterval(run, 3_600_000).unref();
}
