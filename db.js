// Small SQLite database using Node's built-in sqlite module.
// On Railway the data folder should sit on a volume (set DATA_DIR=/data).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS churches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  city TEXT DEFAULT '',
  office_phone TEXT NOT NULL,
  office_email TEXT DEFAULT '',
  website TEXT DEFAULT '',
  leader_title TEXT DEFAULT 'Pastor',
  staff_json TEXT NOT NULL DEFAULT '[]',
  rules_json TEXT NOT NULL DEFAULT '{}',
  extra_note TEXT DEFAULT '',
  admin_email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'trial',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  verdict TEXT NOT NULL,
  flags TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  verdict TEXT NOT NULL,
  sender TEXT DEFAULT '',
  message TEXT DEFAULT '',
  member_note TEXT DEFAULT '',
  seen INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE TABLE IF NOT EXISTS owners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  session_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_checks_church ON checks(church_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_church ON reports(church_id, created_at);
`);

// Add columns to churches made by the first version.
const churchCols = db.prepare('PRAGMA table_info(churches)').all().map(c => c.name);
const addCol = (name, def) => { if (!churchCols.includes(name)) db.exec(`ALTER TABLE churches ADD COLUMN ${name} ${def}`); };
addCol('session_version', 'INTEGER NOT NULL DEFAULT 1');
addCol('owner_note', "TEXT NOT NULL DEFAULT ''");
addCol('paid_until', "TEXT NOT NULL DEFAULT ''");
addCol('handed_off_at', 'TEXT');
addCol('trial_ends_at', 'TEXT');
addCol('stripe_customer_id', "TEXT NOT NULL DEFAULT ''");
addCol('stripe_subscription_id', "TEXT NOT NULL DEFAULT ''");
addCol('first_member_check_at', 'TEXT');

const checkCols = db.prepare('PRAGMA table_info(checks)').all().map(c => c.name);
if (!checkCols.includes('is_test')) db.exec('ALTER TABLE checks ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0');

db.exec(`
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_name TEXT NOT NULL,
  city TEXT DEFAULT '',
  contact_name TEXT DEFAULT '',
  contact_role TEXT DEFAULT '',
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  note TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  church_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id INTEGER,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  emailed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_once ON events(church_id, kind, ref) WHERE ref <> '';
CREATE TABLE IF NOT EXISTS stripe_seen (event_id TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT (datetime('now')));
`);

// Churches that existed before the free-month clock: start their clock now with at least two weeks left,
// so nobody gets paused without warning. Churches that already ended up paid or cancelled are left alone.
if (!churchCols.includes('trial_ends_at')) {
  db.exec(`UPDATE churches SET trial_ends_at = MAX(datetime(COALESCE(handed_off_at, created_at), '+30 days'), datetime('now', '+14 days'))
           WHERE plan = 'trial' AND slug <> 'demo'`);
}

export const PLANS = ['trial', 'paid', 'cancelled'];
export const TRIAL_DAYS = 30;
export const GRACE_DAYS = 7;

// ---------- dates ----------
// SQLite stores UTC as "YYYY-MM-DD HH:MM:SS". A paid-through date is a plain "YYYY-MM-DD".
export function toDate(s) {
  if (!s) return null;
  const str = String(s);
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(str) ? `${str}T23:59:59Z` : str.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(str) ? '' : 'Z'));
  return isNaN(d) ? null : d;
}
export const sqlDate = d => d.toISOString().slice(0, 19).replace('T', ' ');
const DAY = 86_400_000;

// Where a church stands right now. Everything that turns a page on or off goes through here.
//   setup   - Steve made it, not handed to the church yet (no clock running)
//   trial   - free month running
//   grace   - free month over, 7 more days before the page pauses
//   paid    - paid (by card or by hand); no date means it never expires
//   paused  - members' page is off
export function accessState(c, now = new Date()) {
  if (!c) return { state: 'paused' };
  if (c.slug === 'demo') return { state: 'paid' };
  if (c.plan === 'cancelled') return { state: 'paused', reason: 'cancelled' };
  if (c.plan === 'paid') {
    const until = toDate(c.paid_until);
    if (!until) return { state: 'paid', until: null };
    if (now <= until) return { state: 'paid', until };
    const pausesAt = new Date(until.getTime() + GRACE_DAYS * DAY);
    if (now <= pausesAt) return { state: 'grace', reason: 'renewal', endedAt: until, pausesAt };
    return { state: 'paused', reason: 'renewal', pausesAt };
  }
  const ends = toDate(c.trial_ends_at);
  if (!ends) return { state: 'setup' };
  if (now <= ends) return { state: 'trial', endsAt: ends, daysLeft: Math.max(0, Math.ceil((ends - now) / DAY)) };
  const pausesAt = new Date(ends.getTime() + GRACE_DAYS * DAY);
  if (now <= pausesAt) return { state: 'grace', reason: 'trial', endedAt: ends, pausesAt };
  return { state: 'paused', reason: 'trial', pausesAt };
}
export const pageIsOn = c => accessState(c).state !== 'paused';

export const LEADER_TITLES = ['Pastor', 'Father', 'Reverend', 'Minister', 'Elder', 'Bishop', 'Rabbi'];
export function cleanTitle(t) {
  const hit = LEADER_TITLES.find(x => x.toLowerCase() === String(t || '').trim().toLowerCase());
  return hit || 'Pastor';
}

function hydrate(row) {
  if (!row) return null;
  return {
    ...row,
    leader_title: cleanTitle(row.leader_title),
    staff: JSON.parse(row.staff_json || '[]'),
    rules: JSON.parse(row.rules_json || '{}'),
  };
}

export function getChurchBySlug(slug) {
  return hydrate(db.prepare('SELECT * FROM churches WHERE slug = ?').get(slug));
}
export function getChurchById(id) {
  return hydrate(db.prepare('SELECT * FROM churches WHERE id = ?').get(id));
}
export function getChurchByEmail(email) {
  return hydrate(db.prepare('SELECT * FROM churches WHERE admin_email = ?').get(email));
}
export function slugTaken(slug) {
  return !!db.prepare('SELECT 1 FROM churches WHERE slug = ?').get(slug);
}

export function createChurch(c) {
  const info = db.prepare(`INSERT INTO churches
    (slug, name, city, office_phone, office_email, website, leader_title, staff_json, rules_json, extra_note, admin_email, password_hash)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    c.slug, c.name, c.city, c.office_phone, c.office_email, c.website, c.leader_title,
    JSON.stringify(c.staff), JSON.stringify(c.rules), c.extra_note, c.admin_email, c.password_hash);
  return getChurchById(Number(info.lastInsertRowid));
}

export function updateChurch(id, c) {
  db.prepare(`UPDATE churches SET name=?, city=?, office_phone=?, office_email=?, website=?, leader_title=?,
    staff_json=?, rules_json=?, extra_note=? WHERE id=?`).run(
    c.name, c.city, c.office_phone, c.office_email, c.website, c.leader_title,
    JSON.stringify(c.staff), JSON.stringify(c.rules), c.extra_note, id);
  return getChurchById(id);
}

// Logs a check. Returns true the first time a church gets a check from a member
// (not from its own office or from Steve while logged in).
export function logCheck(churchId, verdict, flags, isTest = false) {
  db.prepare('INSERT INTO checks (church_id, verdict, flags, is_test) VALUES (?,?,?,?)').run(churchId, verdict, flags.join(','), isTest ? 1 : 0);
  if (isTest) return false;
  const r = db.prepare("UPDATE churches SET first_member_check_at = datetime('now') WHERE id = ? AND first_member_check_at IS NULL").run(churchId);
  return r.changes > 0;
}

export function checkStats(churchId) {
  const total = db.prepare('SELECT COUNT(*) n FROM checks WHERE church_id = ?').get(churchId).n;
  const last30 = db.prepare(`SELECT COUNT(*) n FROM checks WHERE church_id = ? AND created_at >= datetime('now','-30 days')`).get(churchId).n;
  const scams30 = db.prepare(`SELECT COUNT(*) n FROM checks WHERE church_id = ? AND verdict = 'scam' AND created_at >= datetime('now','-30 days')`).get(churchId).n;
  const today = db.prepare(`SELECT COUNT(*) n FROM checks WHERE church_id = ? AND created_at >= datetime('now','-1 day')`).get(churchId).n;
  return { total, last30, scams30, today };
}

export function addReport(churchId, r) {
  db.prepare('INSERT INTO reports (church_id, verdict, sender, message, member_note) VALUES (?,?,?,?,?)')
    .run(churchId, r.verdict, r.sender, r.message, r.member_note);
}
export function listReports(churchId, limit = 50) {
  return db.prepare('SELECT * FROM reports WHERE church_id = ? ORDER BY id DESC LIMIT ?').all(churchId, limit);
}
export function unseenReportCount(churchId) {
  return db.prepare('SELECT COUNT(*) n FROM reports WHERE church_id = ? AND seen = 0').get(churchId).n;
}
export function markReportsSeen(churchId) {
  db.prepare('UPDATE reports SET seen = 1 WHERE church_id = ?').run(churchId);
}
export function clearActivity(churchId) {
  db.prepare('DELETE FROM checks WHERE church_id = ?').run(churchId);
  db.prepare('DELETE FROM reports WHERE church_id = ?').run(churchId);
}
export function deleteReport(churchId, id) {
  db.prepare('DELETE FROM reports WHERE church_id = ? AND id = ?').run(churchId, id);
}

// ---------- church logins: hand-off and reset links ----------
// The church takes over its page. The first hand-off starts the free month.
export function setChurchLogin(id, email, passwordHash) {
  db.prepare(`UPDATE churches SET admin_email = ?, password_hash = ?, session_version = session_version + 1,
    handed_off_at = COALESCE(handed_off_at, datetime('now')),
    trial_ends_at = CASE WHEN plan = 'trial' THEN COALESCE(trial_ends_at, datetime('now', '+${TRIAL_DAYS} days')) ELSE trial_ends_at END
    WHERE id = ?`).run(email, passwordHash, id);
  db.prepare("UPDATE invites SET used_at = COALESCE(used_at, datetime('now')) WHERE church_id = ?").run(id);
}
export function createInvite(churchId, email, tokenHash, days = 7) {
  db.prepare(`INSERT INTO invites (church_id, token_hash, email, expires_at) VALUES (?,?,?, datetime('now', ?))`)
    .run(churchId, tokenHash, email, `+${days} days`);
}
export function getInvite(tokenHash) {
  return db.prepare(`SELECT * FROM invites WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')`).get(tokenHash) || null;
}

// ---------- owner ----------
export function ownerCount() { return db.prepare('SELECT COUNT(*) n FROM owners').get().n; }
export function createOwner(email, passwordHash) {
  db.prepare('INSERT INTO owners (email, password_hash) VALUES (?,?)').run(email, passwordHash);
}
export function getOwnerByEmail(email) { return db.prepare('SELECT * FROM owners WHERE email = ?').get(email) || null; }
export function getOwnerById(id) { return db.prepare('SELECT * FROM owners WHERE id = ?').get(id) || null; }
export function firstOwnerEmail() { return (db.prepare('SELECT email FROM owners ORDER BY id LIMIT 1').get() || {}).email || ''; }

export function listChurchesForOwner() {
  return db.prepare(`
    SELECT c.id, c.slug, c.name, c.city, c.office_phone, c.admin_email, c.plan, c.paid_until, c.owner_note,
           c.created_at, c.handed_off_at, c.trial_ends_at, c.stripe_subscription_id, c.first_member_check_at,
           (SELECT COUNT(*) FROM checks k WHERE k.church_id = c.id AND k.is_test = 0) AS checks_total,
           (SELECT COUNT(*) FROM checks k WHERE k.church_id = c.id AND k.is_test = 0 AND k.created_at >= datetime('now','-30 days')) AS checks_30,
           (SELECT COUNT(*) FROM checks k WHERE k.church_id = c.id AND k.is_test = 1) AS checks_test,
           (SELECT MAX(created_at) FROM checks k WHERE k.church_id = c.id AND k.is_test = 0) AS last_check
    FROM churches c ORDER BY c.created_at DESC`).all();
}
export function updateBilling(id, plan, paidUntil, trialEnds, note) {
  db.prepare('UPDATE churches SET plan = ?, paid_until = ?, trial_ends_at = COALESCE(?, trial_ends_at), owner_note = ? WHERE id = ?')
    .run(plan, paidUntil, trialEnds, note, id);
}
export function deleteChurch(id) {
  db.prepare("DELETE FROM churches WHERE id = ? AND slug <> 'demo'").run(id);
  db.prepare('DELETE FROM events WHERE church_id = ?').run(id);
  db.prepare("UPDATE requests SET church_id = NULL WHERE church_id = ?").run(id);
}
export function allChurches() {
  return db.prepare("SELECT * FROM churches WHERE slug <> 'demo'").all().map(hydrate);
}

// ---------- Stripe ----------
export function getChurchBySubscription(subId) {
  return hydrate(db.prepare('SELECT * FROM churches WHERE stripe_subscription_id = ?').get(subId));
}
export function setStripePaid(id, customerId, subscriptionId, paidUntil) {
  db.prepare(`UPDATE churches SET plan = 'paid', stripe_customer_id = ?, stripe_subscription_id = ?, paid_until = ? WHERE id = ?`)
    .run(customerId || '', subscriptionId || '', paidUntil, id);
}
export function setPaidUntil(id, paidUntil) {
  db.prepare(`UPDATE churches SET plan = 'paid', paid_until = ? WHERE id = ?`).run(paidUntil, id);
}
export function setCancelled(id) {
  db.prepare(`UPDATE churches SET plan = 'cancelled' WHERE id = ?`).run(id);
}
// Each Stripe event is handled once, even if Stripe sends it twice.
export function stripeEventIsNew(eventId) {
  return db.prepare('INSERT OR IGNORE INTO stripe_seen (event_id) VALUES (?)').run(eventId).changes > 0;
}

// ---------- requests to join ----------
export function addRequest(r) {
  const info = db.prepare(`INSERT INTO requests (church_name, city, contact_name, contact_role, email, phone, note) VALUES (?,?,?,?,?,?,?)`)
    .run(r.church_name, r.city, r.contact_name, r.contact_role, r.email, r.phone, r.note);
  return Number(info.lastInsertRowid);
}
export function getRequest(id) { return db.prepare('SELECT * FROM requests WHERE id = ?').get(id) || null; }
export function openRequests() { return db.prepare("SELECT * FROM requests WHERE status = 'open' ORDER BY id DESC").all(); }
export function closeRequest(id, churchId = null) {
  db.prepare("UPDATE requests SET status = 'done', church_id = COALESCE(?, church_id) WHERE id = ?").run(churchId, id);
}

// ---------- activity log (what Steve gets told about) ----------
// With a ref, the same notice is only ever logged once per church. Returns the new event id, or 0 if it was already logged.
export function addEvent(churchId, kind, text, ref = '') {
  const info = db.prepare('INSERT OR IGNORE INTO events (church_id, kind, ref, text) VALUES (?,?,?,?)').run(churchId, kind, ref, text);
  return info.changes ? Number(info.lastInsertRowid) : 0;
}
export function markEventEmailed(id) { db.prepare('UPDATE events SET emailed = 1 WHERE id = ?').run(id); }
export function recentEvents(limit = 25) {
  return db.prepare(`SELECT e.*, c.name AS church_name FROM events e LEFT JOIN churches c ON c.id = e.church_id ORDER BY e.id DESC LIMIT ?`).all(limit);
}

export { DATA_DIR };
