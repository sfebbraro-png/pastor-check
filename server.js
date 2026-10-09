import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import * as db from './db.js';
import { checkMessage, digitsOnly, formatPhone, aiAvailable } from './check.js';
import * as views from './views.js';

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ---------- security headers ----------
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  });
  next();
});

app.use(express.static(path.join(process.cwd(), 'public'), { maxAge: '1h' }));
app.use('/api', express.json({ limit: '6mb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// ---------- sessions (signed cookie) ----------
function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(db.DATA_DIR, 'session.secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, s, { mode: 0o600 });
  return s;
}
const SECRET = loadSecret();
const sign = v => crypto.createHmac('sha256', SECRET).update(v).digest('base64url');

function setSession(res, churchId) {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 30;
  const v = `${churchId}.${exp}`;
  res.cookie('sid', `${v}.${sign(v)}`, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 30, path: '/' });
}
function readSession(req) {
  const raw = (req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith('sid='));
  if (!raw) return null;
  const [id, exp, sig] = decodeURIComponent(raw.slice(4)).split('.');
  if (!id || !exp || !sig) return null;
  const expected = sign(`${id}.${exp}`);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Number(exp) < Date.now()) return null;
  return db.getChurchById(Number(id));
}
function requireLogin(req, res, next) {
  const church = readSession(req);
  if (!church) return res.redirect('/login');
  req.church = church;
  next();
}

// ---------- passwords ----------
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
function verifyPassword(pw, stored) {
  const [, saltB64, hashB64] = String(stored).split('$');
  if (!saltB64 || !hashB64) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(saltB64, 'base64'), 64);
  const want = Buffer.from(hashB64, 'base64');
  return want.length === hash.length && crypto.timingSafeEqual(hash, want);
}

// ---------- simple rate limits (in memory) ----------
const buckets = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const list = (buckets.get(key) || []).filter(t => now - t < windowMs);
  if (list.length >= max) { buckets.set(key, list); return true; }
  list.push(now); buckets.set(key, list);
  return false;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of buckets) if (!v.some(t => now - t < 3_600_000)) buckets.delete(k); }, 600_000).unref();

// ---------- helpers ----------
function baseUrl(req) {
  return (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}
const split = s => String(s || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'church';
}
function uniqueSlug(name, city) {
  const base = slugify(`${name} ${String(city || '').split(',')[0]}`);
  if (base !== 'demo' && !db.slugTaken(base)) return base;
  for (let i = 2; i < 1000; i++) if (!db.slugTaken(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

function churchFromForm(body) {
  const staff = [];
  for (let i = 0; i < 6; i++) {
    const name = String(body[`staff_name_${i}`] || '').trim();
    if (!name) continue;
    staff.push({
      name: name.slice(0, 80),
      role: String(body[`staff_role_${i}`] || '').trim().slice(0, 80),
      phones: split(body[`staff_phones_${i}`]).slice(0, 4),
      emails: split(body[`staff_emails_${i}`]).map(e => e.toLowerCase()).slice(0, 4),
    });
  }
  return {
    name: String(body.name || '').trim().slice(0, 120),
    city: String(body.city || '').trim().slice(0, 80),
    office_phone: String(body.office_phone || '').trim().slice(0, 30),
    office_email: String(body.office_email || '').trim().toLowerCase().slice(0, 120),
    website: String(body.website || '').trim().slice(0, 200),
    leader_title: db.cleanTitle(body.leader_title),
    staff,
    rules: {
      noGiftCards: body.noGiftCards === 'on',
      noMoneyByText: body.noMoneyByText === 'on',
      noPersonalInfo: body.noPersonalInfo === 'on',
      noNewNumbers: body.noNewNumbers === 'on',
    },
    extra_note: String(body.extra_note || '').trim().slice(0, 600),
  };
}
function validateChurch(c) {
  if (!c.name) return 'Please enter your church name.';
  if (digitsOnly(c.office_phone).length !== 10) return 'Please enter the church office phone number, with area code.';
  if (!c.staff.length) return 'Please add at least one staff member, starting with your pastor.';
  for (const s of c.staff) {
    for (const p of s.phones) if (digitsOnly(p).length !== 10) return `The phone number "${p}" for ${s.name} doesn't look right. Use 10 digits with area code.`;
    for (const e of s.emails) if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return `The email "${e}" for ${s.name} doesn't look right.`;
  }
  if (c.office_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.office_email)) return 'The church office email doesn\'t look right.';
  return '';
}
async function qrSvgFor(url) {
  return QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } });
}

// ---------- demo church ----------
function ensureDemo() {
  if (db.getChurchBySlug('demo')) return;
  db.createChurch({
    slug: 'demo', name: 'Grace Fellowship Church (Demo)', city: 'Norfolk, VA', office_phone: '757-555-0100', office_email: 'office@gracefellowship-demo.org',
    website: '', leader_title: 'Pastor',
    staff: [
      { name: 'Pastor Mike Russo', role: 'Senior pastor', phones: ['757-555-4471'], emails: ['mike@gracefellowship-demo.org'] },
      { name: 'Linda Carter', role: 'Church secretary', phones: ['757-555-0100'], emails: ['office@gracefellowship-demo.org'] },
    ],
    rules: { noGiftCards: true, noMoneyByText: true, noPersonalInfo: true, noNewNumbers: true },
    extra_note: 'Online giving happens only through the Give button on our website.',
    admin_email: 'demo@example.invalid', password_hash: hashPassword(crypto.randomBytes(24).toString('hex')),
  });
}
ensureDemo();

// ---------- pages ----------
app.get('/', (req, res) => res.send(views.homePage()));
app.get('/health', (req, res) => res.json({ ok: true, ai: aiAvailable() }));

app.get('/setup', (req, res) => res.send(views.setupPage()));
app.post('/setup', (req, res) => {
  if (limited(`setup:${req.ip}`, 10, 3_600_000)) return res.status(429).send(views.setupPage({ error: 'Too many tries. Please wait an hour and try again.' }));
  const c = churchFromForm(req.body);
  const admin_email = String(req.body.admin_email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const values = { ...c, admin_email };
  let error = validateChurch(c);
  if (!error && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(admin_email)) error = 'Please enter a valid login email.';
  if (!error && password.length < 8) error = 'Your password needs at least 8 characters.';
  if (!error && db.getChurchByEmail(admin_email)) error = 'That email already has an account. Please log in instead.';
  if (error) return res.status(400).send(views.setupPage({ values, error }));
  const church = db.createChurch({ ...c, slug: uniqueSlug(c.name, c.city), admin_email, password_hash: hashPassword(password) });
  setSession(res, church.id);
  res.redirect('/admin?welcome=1');
});

app.get('/login', (req, res) => res.send(views.loginPage()));
app.post('/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (limited(`login:${req.ip}`, 10, 900_000)) return res.status(429).send(views.loginPage({ email, error: 'Too many tries. Please wait 15 minutes.' }));
  const church = db.getChurchByEmail(email);
  if (!church || church.slug === 'demo' || !verifyPassword(String(req.body.password || ''), church.password_hash)) {
    return res.status(401).send(views.loginPage({ email, error: 'That email and password don\'t match.' }));
  }
  setSession(res, church.id);
  res.redirect('/admin');
});
app.post('/logout', (req, res) => { res.clearCookie('sid', { path: '/' }); res.redirect('/'); });

app.get('/admin', requireLogin, async (req, res) => {
  const church = req.church;
  const memberUrl = `${baseUrl(req)}/c/${church.slug}`;
  const html = views.adminPage({
    church, memberUrl, stats: db.checkStats(church.id), reports: db.listReports(church.id),
    unseen: db.unseenReportCount(church.id), saved: req.query.saved === '1', welcome: req.query.welcome === '1', cleared: req.query.cleared === '1', qrSvg: await qrSvgFor(memberUrl),
  });
  db.markReportsSeen(church.id);
  res.send(html);
});
app.post('/admin', requireLogin, async (req, res) => {
  const c = churchFromForm(req.body);
  const error = validateChurch(c);
  if (error) {
    const church = { ...req.church, ...c };
    const memberUrl = `${baseUrl(req)}/c/${church.slug}`;
    return res.status(400).send(views.adminPage({ church, memberUrl, stats: db.checkStats(church.id), reports: db.listReports(church.id), unseen: db.unseenReportCount(church.id), error, qrSvg: await qrSvgFor(memberUrl) }));
  }
  db.updateChurch(req.church.id, c);
  res.redirect('/admin?saved=1');
});
app.post('/admin/clear', requireLogin, (req, res) => {
  db.clearActivity(req.church.id);
  res.redirect('/admin?cleared=1');
});
app.post('/admin/reports/:id/delete', requireLogin, (req, res) => {
  db.deleteReport(req.church.id, Number(req.params.id));
  res.redirect('/admin');
});

app.get('/c/:slug', (req, res) => {
  const church = db.getChurchBySlug(req.params.slug);
  if (!church) return res.status(404).send(views.notFoundPage());
  res.send(views.memberPage(church, { demo: church.slug === 'demo' }));
});
app.get('/c/:slug/flyer', async (req, res) => {
  const church = db.getChurchBySlug(req.params.slug);
  if (!church) return res.status(404).send(views.notFoundPage());
  const memberUrl = `${baseUrl(req)}/c/${church.slug}`;
  res.send(views.flyerPage(church, memberUrl, await qrSvgFor(memberUrl)));
});

// ---------- API ----------
app.post('/api/c/:slug/check', async (req, res) => {
  const church = db.getChurchBySlug(req.params.slug);
  if (!church) return res.status(404).json({ error: 'We could not find this church.' });
  if (limited(`check:${req.ip}`, 20, 600_000)) return res.status(429).json({ error: 'You have checked a lot of messages. Please wait a few minutes.' });
  if (limited(`church:${church.id}`, 500, 86_400_000)) return res.status(429).json({ error: 'This page is very busy today. Please call the church office.' });

  const { message = '', sender = '', image = null } = req.body || {};
  let img = null;
  if (image && typeof image.data === 'string' && image.data.length > 0) {
    if (!/^image\/(jpeg|png|gif|webp)$/.test(image.mediaType || '')) return res.status(400).json({ error: 'That picture type is not supported.' });
    if (image.data.length > 5_500_000) return res.status(400).json({ error: 'That picture is too large.' });
    img = { data: image.data, mediaType: image.mediaType };
  }
  if (!String(message).trim() && !img) return res.status(400).json({ error: 'Paste the message or add a screenshot first.' });

  try {
    const answer = await checkMessage(church, { message, sender, image: img });
    db.logCheck(church.id, answer.verdict, answer.flags);
    res.json({
      verdict: answer.verdict, headline: answer.headline, explanation: answer.explanation,
      redFlags: answer.redFlags, steps: answer.steps, contactHints: answer.contactHints,
      senderSeen: answer.senderSeen, officePhone: formatPhone(church.office_phone), officeDigits: digitsOnly(church.office_phone),
    });
  } catch (err) {
    console.error('check failed', err);
    res.status(500).json({ error: 'Something went wrong while checking.' });
  }
});

app.post('/api/c/:slug/report', (req, res) => {
  const church = db.getChurchBySlug(req.params.slug);
  if (!church) return res.status(404).json({ error: 'Not found' });
  if (limited(`report:${req.ip}`, 10, 3_600_000)) return res.status(429).json({ error: 'Too many reports.' });
  const b = req.body || {};
  db.addReport(church.id, {
    verdict: b.verdict === 'scam' ? 'scam' : 'caution',
    sender: String(b.sender || '').slice(0, 300),
    message: String(b.message || '').slice(0, 4000),
    member_note: String(b.member_note || '').slice(0, 300),
  });
  res.json({ ok: true });
});

app.use((req, res) => res.status(404).send(views.notFoundPage()));

app.listen(PORT, () => console.log(`Listening on port ${PORT}. AI ${aiAvailable() ? 'on' : 'off (no ANTHROPIC_API_KEY set)'}.`));
