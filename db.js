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

export const PLANS = ['trial', 'paid', 'cancelled'];

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

export function logCheck(churchId, verdict, flags) {
  db.prepare('INSERT INTO checks (church_id, verdict, flags) VALUES (?,?,?)').run(churchId, verdict, flags.join(','));
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
export function setChurchLogin(id, email, passwordHash) {
  db.prepare(`UPDATE churches SET admin_email = ?, password_hash = ?, session_version = session_version + 1,
    handed_off_at = COALESCE(handed_off_at, datetime('now')) WHERE id = ?`).run(email, passwordHash, id);
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
           c.created_at, c.handed_off_at,
           (SELECT COUNT(*) FROM checks k WHERE k.church_id = c.id) AS checks_total,
           (SELECT COUNT(*) FROM checks k WHERE k.church_id = c.id AND k.created_at >= datetime('now','-30 days')) AS checks_30,
           (SELECT MAX(created_at) FROM checks k WHERE k.church_id = c.id) AS last_check
    FROM churches c ORDER BY c.created_at DESC`).all();
}
export function updateBilling(id, plan, paidUntil, note) {
  db.prepare('UPDATE churches SET plan = ?, paid_until = ?, owner_note = ? WHERE id = ?').run(plan, paidUntil, note, id);
}

export { DATA_DIR };
