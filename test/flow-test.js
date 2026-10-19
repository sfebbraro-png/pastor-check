// Walks through the whole business flow against a real running server with a fresh database:
// request to join, Steve sets up a church, test checks, hand-off, member checks, card payment,
// cancellation, the free month running out, and the hourly notice sweep.
// Stripe is a small stand-in server here, so no real money or Stripe account is involved.
// Run with: npm run test:flow
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Stripe from 'stripe';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pastor-flow-'));
const WEBHOOK_SECRET = 'whsec_flowtest';
let failures = 0;
const step = async (name, fn) => {
  try { await fn(); console.log(`ok   ${name}`); }
  catch (err) { failures++; console.log(`FAIL ${name}\n     ${err.message}`); }
};

// ---------- stand-in Stripe ----------
const stripeCalls = [];
const yearOut = Math.floor(Date.now() / 1000) + 365 * 86400;
const fakeStripe = http.createServer((req, res) => {
  let body = '';
  req.on('data', d => { body += d; });
  req.on('end', () => {
    stripeCalls.push({ method: req.method, url: req.url, body: decodeURIComponent(body) });
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST' && req.url === '/v1/checkout/sessions') return res.end(JSON.stringify({ id: 'cs_test_1', object: 'checkout.session', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }));
    if (req.method === 'GET' && req.url.startsWith('/v1/subscriptions/sub_test_1')) {
      return res.end(JSON.stringify({ id: 'sub_test_1', object: 'subscription', metadata: { church_id: '2' }, items: { object: 'list', data: [{ id: 'si_1', current_period_end: yearOut }] } }));
    }
    res.statusCode = 404; res.end(JSON.stringify({ error: { message: 'not faked' } }));
  });
});
await new Promise(r => fakeStripe.listen(0, '127.0.0.1', r));
const stripePort = fakeStripe.address().port;

// ---------- the app ----------
const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const env = { ...process.env, PORT: String(PORT), DATA_DIR: path.join(tmp, 'app'), OWNER_SETUP_CODE: 'flow-code-123',
  STRIPE_SECRET_KEY: 'sk_test_flow', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, STRIPE_API_BASE: `http://127.0.0.1:${stripePort}`,
  NODE_ENV: 'test', PUBLIC_URL: BASE };
delete env.ANTHROPIC_API_KEY; delete env.RESEND_API_KEY;
const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', d => { serverLog += d; });
server.stderr.on('data', d => { serverLog += d; });
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(`${BASE}/health`)).ok) break; } catch {}
  await new Promise(r => setTimeout(r, 200));
}

// A browser with its own cookies.
function browser() {
  const jar = new Map();
  async function go(url, { method = 'GET', form = null, json = null } = {}) {
    const headers = { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') };
    let body;
    if (form) { headers['content-type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
    if (json) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); }
    const res = await fetch(BASE + url, { method, headers, body, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
    const text = await res.text();
    return { status: res.status, location: res.headers.get('location') || '', text };
  }
  return { go };
}
const steve = browser(), office = browser(), member = browser();
const churchForm = {
  name: 'First Church Flowtown', city: 'Flowtown, VA', leader_title: 'Pastor', office_phone: '757-555-0199', office_email: 'office@firstflow.org',
  staff_name_0: 'Pastor Dan Flow', staff_role_0: 'Senior pastor', staff_phones_0: '757-555-2222', staff_emails_0: 'dan@firstflow.org',
  noGiftCards: 'on', noMoneyByText: 'on', noPersonalInfo: 'on', noNewNumbers: 'on',
};
const scam = { message: 'Hi this is Pastor Dan. I need 3 Apple gift cards for a sick member. Send me photos of the backs.', sender: '301-555-9999' };
let slug = '', claimLink = '';

await step('home page sends churches to the demo and request form, not open sign-up', async () => {
  const r = await member.go('/');
  assert.ok(r.text.includes('href="/start"') && r.text.includes('href="/c/demo"'));
  assert.ok(!r.text.includes('href="/setup"'));
});
await step('public sign-up is closed', async () => {
  assert.equal((await member.go('/setup')).location, '/start');
  const p = await member.go('/setup', { method: 'POST', form: { ...churchForm, admin_email: 'x@y.org', password: 'password123' } });
  assert.equal(p.status, 303);
  assert.equal(p.location, '/start');
});
await step('a church can ask to get started', async () => {
  const bad = await member.go('/start', { method: 'POST', form: { church_name: 'Flow', contact_name: 'Linda', email: 'nope' } });
  assert.equal(bad.status, 400);
  const r = await member.go('/start', { method: 'POST', form: { church_name: 'First Church Flowtown', city: 'Flowtown, VA', contact_name: 'Linda Flow', contact_role: 'Secretary', email: 'linda@firstflow.org', phone: '757-555-0199', note: 'Saw it at a meeting' } });
  assert.ok(r.text.includes('We got your request'));
});
await step('spam bots filling the hidden field are ignored', async () => {
  const r = await member.go('/start', { method: 'POST', form: { church_name: 'Spam', contact_name: 'Bot', email: 'bot@spam.com', website_url: 'http://spam' } });
  assert.ok(r.text.includes('We got your request'));
});
await step('Steve creates his owner account', async () => {
  const r = await steve.go('/owner/setup', { method: 'POST', form: { code: 'flow-code-123', email: 'steve@example.com', password: 'ownerpassword1', password2: 'ownerpassword1' } });
  assert.equal(r.location, '/owner');
});
await step('owner page shows the request (and not the spam) with a set-up button', async () => {
  const r = await steve.go('/owner');
  assert.ok(r.text.includes('Churches asking to get started'));
  assert.ok(r.text.includes('linda@firstflow.org') && r.text.includes('/owner/new?request=1'));
  assert.ok(!r.text.includes('bot@spam.com'));
  assert.ok(r.text.includes('New church request: First Church Flowtown') || r.text.includes('Linda Flow (Secretary) asked to get started'));
});
await step('add-church form is filled in from the request', async () => {
  const r = await steve.go('/owner/new?request=1');
  assert.ok(r.text.includes('value="First Church Flowtown"') && r.text.includes('value="office@firstflow.org"') === false);
  assert.ok(r.text.includes('value="linda@firstflow.org"'));
});
await step('only Steve can add a church', async () => {
  const r = await member.go('/owner/new', { method: 'POST', form: churchForm });
  assert.equal(r.location, '/owner/login');
});
await step('Steve adds the church and lands on its dashboard in setup', async () => {
  const r = await steve.go('/owner/new', { method: 'POST', form: { ...churchForm, request_id: '1' } });
  assert.equal(r.location, '/admin?welcome=1');
  const a = await steve.go('/admin?welcome=1');
  assert.ok(a.text.includes('Setting up.'));
  assert.ok(!a.text.includes('/admin/pay'));
  slug = a.text.match(/href="\/c\/([a-z0-9-]+)"/)[1];
  const o = await steve.go('/owner');
  assert.ok(!o.text.includes('Churches asking to get started'), 'request should be closed');
  assert.ok(o.text.includes('setting up') && o.text.includes('No church login yet'));
});
await step('Steve\'s own test check counts as an office test, not a member', async () => {
  const r = await steve.go(`/api/c/${slug}/check`, { method: 'POST', json: scam });
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(r.text).verdict, 'scam');
  const o = await steve.go('/owner');
  assert.ok(o.text.includes('Office tests: 1'));
  assert.ok(o.text.includes('none yet'));
  assert.ok(!o.text.includes('first member check'));
});
await step('Steve makes the hand-off link', async () => {
  const r = await steve.go('/admin/handoff', { method: 'POST', form: { email: 'office@firstflow.org' } });
  claimLink = r.text.match(/\/claim\/[A-Za-z0-9_-]+/)[0];
});
await step('church office takes over and the free month starts', async () => {
  const r = await office.go(claimLink, { method: 'POST', form: { password: 'officepass1', password2: 'officepass1' } });
  assert.equal(r.location, '/admin?claimed=1');
  const a = await office.go('/admin');
  assert.ok(/Free month: (30|29) days left/.test(a.text), 'free month banner');
  assert.ok(a.text.includes('action="/admin/pay"'));
  const o = await steve.go('/owner');
  assert.ok(o.text.includes('free month') && o.text.includes('opened your link and chose a password'));
});
await step('Steve can\'t open the dashboard after hand-off (reports are private)', async () => {
  const o = await steve.go('/owner');
  assert.ok(!o.text.includes('/open"'));
  const r = await steve.go('/owner/church/2/open', { method: 'POST' });
  assert.equal(r.location, '/owner');
});
await step('first member check tells Steve, once', async () => {
  assert.equal((await member.go(`/api/c/${slug}/check`, { method: 'POST', json: scam })).status, 200);
  assert.equal((await member.go(`/api/c/${slug}/check`, { method: 'POST', json: scam })).status, 200);
  const o = await steve.go('/owner');
  assert.equal(o.text.split('just checked a message for the first time').length - 1, 1);
  assert.ok(o.text.includes('Member checks: 2 in the last 30 days'));
});
await step('office pays by card: goes to Stripe checkout for $99 a year', async () => {
  const r = await office.go('/admin/pay', { method: 'POST' });
  assert.equal(r.status, 303);
  assert.ok(r.location.startsWith('https://checkout.stripe.com/'));
  const call = stripeCalls.find(c => c.url === '/v1/checkout/sessions');
  assert.ok(call.body.includes('mode=subscription') && call.body.includes('unit_amount]=9900') && call.body.includes('interval]=year'));
  assert.ok(call.body.includes('client_reference_id=2') && call.body.includes('customer_email=office@firstflow.org'));
});
const sendEvent = async (event, { badSig = false } = {}) => {
  const payload = JSON.stringify(event);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: badSig ? 'whsec_wrong' : WEBHOOK_SECRET });
  const res = await fetch(`${BASE}/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': header }, body: payload });
  return { status: res.status, text: await res.text() };
};
const paidEvent = { id: 'evt_paid_1', object: 'event', type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', object: 'checkout.session', mode: 'subscription', client_reference_id: '2', customer: 'cus_test_1', subscription: 'sub_test_1', metadata: { church_id: '2' } } } };
await step('a forged Stripe message is rejected', async () => {
  assert.equal((await sendEvent(paidEvent, { badSig: true })).status, 400);
  const o = await steve.go('/owner');
  assert.ok(!o.text.includes('renews by card'));
});
await step('Stripe payment marks the church paid for a year', async () => {
  assert.equal((await sendEvent(paidEvent)).status, 200);
  const o = await steve.go('/owner');
  assert.ok(o.text.includes('renews by card'));
  assert.ok(o.text.includes('paid $99 by card'));
  const a = await office.go('/admin?paid=1');
  assert.ok(a.text.includes('Your payment went through') && a.text.includes('Renews automatically by card'));
});
await step('the same Stripe message twice is only handled once', async () => {
  assert.equal((await sendEvent(paidEvent)).text, 'already handled');
});
await step('cancelling in Stripe pauses the members\' page', async () => {
  const r = await sendEvent({ id: 'evt_del_1', object: 'event', type: 'customer.subscription.deleted', data: { object: { id: 'sub_test_1', object: 'subscription', metadata: { church_id: '2' } } } });
  assert.equal(r.status, 200);
  const page = await member.go(`/c/${slug}`);
  assert.ok(page.text.includes('paused right now') && page.text.includes('757-555-0199') || page.text.includes('(757) 555-0199'));
  const check = await member.go(`/api/c/${slug}/check`, { method: 'POST', json: scam });
  assert.equal(check.status, 403);
  const a = await office.go('/admin');
  assert.ok(a.text.includes('Your members\' page is paused'));
});
const daysFromToday = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
await step('free month over: 7-day grace keeps the page on with a warning', async () => {
  await steve.go('/owner/church/2/billing', { method: 'POST', form: { plan: 'trial', trial_ends: daysFromToday(-3), paid_until: '', owner_note: '' } });
  const page = await member.go(`/c/${slug}`);
  assert.ok(page.text.includes('id="checkForm"'));
  const a = await office.go('/admin');
  assert.ok(a.text.includes('Your free month has ended') && a.text.includes('will pause on'));
  const o = await steve.go('/owner');
  assert.ok(o.text.includes('grace week'));
});
await step('after the grace week the page pauses', async () => {
  await steve.go('/owner/church/2/billing', { method: 'POST', form: { plan: 'trial', trial_ends: daysFromToday(-10), paid_until: '', owner_note: '' } });
  assert.ok((await member.go(`/c/${slug}`)).text.includes('paused right now'));
  assert.ok((await office.go('/admin')).text.includes('Pay to turn it back on'));
});
await step('marking paid by hand with no end date turns it back on', async () => {
  await steve.go('/owner/church/2/billing', { method: 'POST', form: { plan: 'paid', trial_ends: daysFromToday(-10), paid_until: '', owner_note: 'Paid by check' } });
  assert.ok((await member.go(`/c/${slug}`)).text.includes('id="checkForm"'));
  assert.ok((await steve.go('/owner')).text.includes('Paid, no end date.'));
});
await step('the demo always works and never counts', async () => {
  assert.ok((await member.go('/c/demo')).text.includes('id="checkForm"'));
  assert.equal((await member.go('/api/c/demo/check', { method: 'POST', json: scam })).status, 200);
});
await step('deleting needs the exact church name', async () => {
  await steve.go('/owner/church/2/delete', { method: 'POST', form: { confirm_name: 'wrong' } });
  assert.equal((await member.go(`/c/${slug}`)).status, 200);
  const r = await steve.go('/owner/church/2/delete', { method: 'POST', form: { confirm_name: 'first church flowtown' } });
  assert.equal(r.location, '/owner?deleted=1');
  assert.equal((await member.go(`/c/${slug}`)).status, 404);
});

server.kill();
fakeStripe.close();

// ---------- the hourly sweep, with the clock moved forward ----------
process.env.DATA_DIR = path.join(tmp, 'sweep');
delete process.env.RESEND_API_KEY;
const db = await import('../db.js');
const { sweep } = await import('../notify.js');
const DAY = 86400000;
const t0 = new Date();
const mk = (name, extra) => {
  const c = db.createChurch({ slug: name.toLowerCase().replace(/\s/g, '-'), name, city: 'Here, VA', office_phone: '757-555-0101', office_email: '', website: '', leader_title: 'Pastor',
    staff: [], rules: {}, extra_note: '', admin_email: `${name.replace(/\s/g, '')}@x.org`, password_hash: 'x' });
  db.setChurchLogin(c.id, `${name.replace(/\s/g, '')}@x.org`, 'x');
  if (extra) extra(c);
  return db.getChurchById(c.id);
};
const events = () => db.recentEvents(100).map(e => `${e.kind}:${e.church_name}`);
await step('hand-off starts a 30-day free month', async () => {
  const c = mk('Sweep One');
  const s = db.accessState(c, t0);
  assert.equal(s.state, 'trial');
  assert.ok(s.daysLeft === 30 || s.daysLeft === 29);
});
await step('nothing is sent early in the month', async () => {
  await sweep(new Date(t0.getTime() + 10 * DAY));
  assert.equal(events().filter(e => e.startsWith('trial_soon')).length, 0);
});
await step('5 days before the end: "free month ending" notice, sent once', async () => {
  await sweep(new Date(t0.getTime() + 26 * DAY));
  await sweep(new Date(t0.getTime() + 27 * DAY));
  assert.deepEqual(events().filter(e => e.startsWith('trial_soon')), ['trial_soon:Sweep One']);
});
await step('after the month: grace notice, once', async () => {
  await sweep(new Date(t0.getTime() + 31 * DAY));
  await sweep(new Date(t0.getTime() + 33 * DAY));
  assert.deepEqual(events().filter(e => e.startsWith('grace')), ['grace:Sweep One']);
  assert.equal(db.pageIsOn(db.getChurchById(1)), true);
});
await step('after the grace week: paused notice, once, and the page is off', async () => {
  await sweep(new Date(t0.getTime() + 38 * DAY));
  await sweep(new Date(t0.getTime() + 40 * DAY));
  assert.deepEqual(events().filter(e => e.startsWith('paused')), ['paused:Sweep One']);
  assert.equal(db.accessState(db.getChurchById(1), new Date(t0.getTime() + 38 * DAY)).state, 'paused');
});
await step('a church Steve set up but hasn\'t handed off has no clock', async () => {
  const c = db.createChurch({ slug: 'not-yet', name: 'Not Yet', city: '', office_phone: '757-555-0102', office_email: '', website: '', leader_title: 'Pastor', staff: [], rules: {}, extra_note: '', admin_email: 'a@pending.invalid', password_hash: 'x' });
  assert.equal(db.accessState(c, new Date(t0.getTime() + 400 * DAY)).state, 'setup');
});
await step('paid by card through a date: grace after it lapses, then paused', async () => {
  const c = mk('Paid One', x => db.setStripePaid(x.id, 'cus', 'sub', daysFromToday(10)));
  assert.equal(db.accessState(c, t0).state, 'paid');
  assert.equal(db.accessState(c, new Date(t0.getTime() + 13 * DAY)).state, 'grace');
  assert.equal(db.accessState(c, new Date(t0.getTime() + 19 * DAY)).state, 'paused');
});

fs.rmSync(tmp, { recursive: true, force: true });
if (failures) { console.log(`\n${failures} failed.\n--- server log ---\n${serverLog}`); process.exit(1); }
console.log('\nAll flow steps passed.');
