// HTML pages. Plain server-rendered HTML so it works on any phone or computer.
import { formatPhone, digitsOnly } from './check.js';
import { LEADER_TITLES } from './db.js';

export const APP_NAME = process.env.APP_NAME || 'Is This Really Pastor?';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const LOGO = `<svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2 4 7v8c0 7.2 5 13 12 15 7-2 12-7.8 12-15V7L16 2z" fill="#234b6e"/><path d="m10.5 16.2 3.8 3.8 7.4-7.6" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function layout({ title, body, nav = '', wide = false, bodyClass = '', description = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ''}
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(LOGO.replace('width="34" height="34" ', 'xmlns="http://www.w3.org/2000/svg" '))}">
<link rel="stylesheet" href="/style.css">
</head>
<body class="${esc(bodyClass)}">
<header class="topbar"><div class="${wide ? 'wrap-wide' : 'wrap'}">
  <a class="brand" href="/">${LOGO}<span class="full">${esc(APP_NAME)}</span></a>
  <nav class="topnav">${nav}</nav>
</div></header>
<main>${body}</main>
<footer class="footer"><div class="${wide ? 'wrap-wide' : 'wrap'}">
  <p>${esc(APP_NAME)} helps church members spot messages that pretend to come from church leaders. It never tells you a request for money is safe. When in doubt, call your church office.</p>
</div></footer>
</body>
</html>`;
}

const publicNav = `<a href="/c/demo">Try the demo</a><a href="/login">Church login</a>`;

// ---------- home ----------
export function homePage() {
  const body = `
<section class="hero"><div class="wrap">
  <h1>Did that text really come from your pastor?</h1>
  <p class="lead">Scammers are texting church members while pretending to be the pastor, asking for gift cards. Give your members a simple page where they can check a message before they lose money.</p>
  <div class="btn-row"><a class="btn" href="/c/demo">Try the demo</a><a class="btn secondary" href="/start">Get started with your church</a></div>
</div></section>

<section class="section"><div class="wrap">
  <div class="card stack">
    <h2>The message your members are getting</h2>
    <div class="sample">Hi, this is Pastor Mike. Are you available? I'm in a meeting and can't talk. I need a quick favor.</div>
    <div class="sample">I need 4 Apple gift cards for a member in the hospital. Scratch the back and send me photos of the cards. I'll pay you back Sunday.</div>
    <p class="muted">Police departments and dioceses across the country have warned about this scam. Some members have lost hundreds of dollars. Some have lost thousands.</p>
  </div>
</div></section>

<section class="section"><div class="wrap">
  <h2>How it works</h2>
  <div class="steps">
    <div class="card"><div class="num">1</div><h3>We set up your page</h3><p>Try the demo, then send us a short request. We set up your church with your real office and staff phone numbers and emails, and the promises your church makes, like "we never ask for gift cards." Then we send your office a link to take it over.</p></div>
    <div class="card"><div class="num">2</div><h3>Print the QR code</h3><p>Put the flyer in the bulletin or on the bulletin board. Members save the page on their phone.</p></div>
    <div class="card"><div class="num">3</div><h3>Members check a message</h3><p>They paste the text or add a screenshot. In seconds they get a plain answer and your office number to call.</p></div>
  </div>
</div></section>

<section class="section"><div class="wrap">
  <div class="card">
    <h2>Why a general scam checker isn't enough</h2>
    <p>Free scam checkers don't know your pastor's real number. This page does. It compares the sender with the contacts your office gave us, then explains the warning signs in plain words, in large type, for members who aren't comfortable with technology.</p>
    <p>It never tells anyone a money request is safe. The best answer a message can get is "we can't confirm this, call the office."</p>
    <p>When a member reports a scam, your office sees it right away, so you can warn everyone that Sunday.</p>
  </div>
</div></section>

<section class="section"><div class="wrap center">
  <h2>Free for your first month</h2>
  <p class="muted">After that, $99 a year for your church, paid by card. Your first month starts the day your office takes over the page.</p>
  <div class="btn-row" style="justify-content:center"><a class="btn" href="/start">Get started with your church</a><a class="btn secondary" href="/c/demo">Try the demo</a></div>
</div></section>`;
  return layout({ title: `${APP_NAME} Scam check for church members`, body, nav: publicNav, description: 'A simple page church members use to check whether a text or email really came from their pastor.' });
}

// ---------- church setup / edit form ----------
function staffRows(staff = []) {
  const rows = [];
  const list = [...staff];
  while (list.length < 4) list.push({});
  list.slice(0, 6).forEach((s, i) => {
    rows.push(`
    <div class="staff-row">
      <div class="grid2">
        <div class="field"><label for="staff_name_${i}">Name${i === 0 ? ' <span class="hint">As members know them, like "Pastor Mike Russo"</span>' : ''}</label>
          <input type="text" id="staff_name_${i}" name="staff_name_${i}" value="${esc(s.name)}" ${i === 0 ? 'required' : ''}></div>
        <div class="field"><label for="staff_role_${i}">Role</label>
          <input type="text" id="staff_role_${i}" name="staff_role_${i}" value="${esc(s.role)}" placeholder="${i === 0 ? 'Senior pastor' : 'Associate pastor, secretary, treasurer'}"></div>
      </div>
      <div class="grid2">
        <div class="field"><label for="staff_phones_${i}">Real phone numbers <span class="hint">Separate more than one with commas</span></label>
          <input type="tel" id="staff_phones_${i}" name="staff_phones_${i}" value="${esc((s.phones || []).join(', '))}"></div>
        <div class="field"><label for="staff_emails_${i}">Real email addresses</label>
          <input type="text" id="staff_emails_${i}" name="staff_emails_${i}" value="${esc((s.emails || []).join(', '))}" autocapitalize="off"></div>
      </div>
    </div>`);
  });
  return rows.join('');
}

export function churchFields(c = {}, { isNew = true } = {}) {
  const r = c.rules || {};
  const chk = (key) => (r[key] === false ? '' : 'checked');
  return `
<fieldset>
  <legend>Your church</legend>
  <div class="field"><label for="name">Church name</label><input type="text" id="name" name="name" value="${esc(c.name)}" required></div>
  <div class="grid2">
    <div class="field"><label for="city">City and state</label><input type="text" id="city" name="city" value="${esc(c.city)}" placeholder="Norfolk, VA"></div>
    <div class="field"><label for="leader_title">Your pastor's title <span class="hint">The word, not the name. You'll enter names below.</span></label>
      <select id="leader_title" name="leader_title">${LEADER_TITLES.map(t => `<option${(c.leader_title || 'Pastor') === t ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
  </div>
  <div class="grid2">
    <div class="field"><label for="office_phone">Church office phone <span class="hint">Shown to members as the number to call</span></label><input type="tel" id="office_phone" name="office_phone" value="${esc(c.office_phone ? formatPhone(c.office_phone) : '')}" required></div>
    <div class="field"><label for="office_email">Church office email</label><input type="email" id="office_email" name="office_email" value="${esc(c.office_email)}" autocapitalize="off"></div>
  </div>
  <div class="field"><label for="website">Church website</label><input type="url" id="website" name="website" value="${esc(c.website)}" placeholder="https://"></div>
</fieldset>

<fieldset>
  <legend>Staff members scammers might pretend to be</legend>
  <p class="muted small">Members never see these full numbers. The page shows only the last four digits, like "Pastor Mike's real number ends in 4471," so members can tell a real text from a fake one.</p>
  ${staffRows(c.staff)}
</fieldset>

<fieldset>
  <legend>Promises your church makes</legend>
  <p class="muted small">Check every one that is true. The checker treats a message that breaks a promise as a scam.</p>
  <label class="check-row"><input type="checkbox" name="noGiftCards" ${chk('noGiftCards')}> We will never ask anyone to buy gift cards.</label>
  <label class="check-row"><input type="checkbox" name="noMoneyByText" ${chk('noMoneyByText')}> We will never ask for money, payments, or donations by text or email.</label>
  <label class="check-row"><input type="checkbox" name="noPersonalInfo" ${chk('noPersonalInfo')}> We will never ask for passwords, codes, or bank details by text or email.</label>
  <label class="check-row"><input type="checkbox" name="noNewNumbers" ${chk('noNewNumbers')}> Our staff will not text from a "new number" asking for help.</label>
  <div class="field"><label for="extra_note">Anything else members should know <span class="hint">Optional. Example: "Online giving is only through our website."</span></label>
    <textarea id="extra_note" name="extra_note" style="min-height:90px">${esc(c.extra_note)}</textarea></div>
</fieldset>
${isNew ? `
<fieldset>
  <legend>Your church office login</legend>
  <div class="field"><label for="admin_email">Email</label><input type="email" id="admin_email" name="admin_email" value="${esc(c.admin_email)}" required autocapitalize="off" autocomplete="username"></div>
  <div class="field"><label for="password">Password <span class="hint">At least 8 characters</span></label><input type="password" id="password" name="password" required minlength="8" autocomplete="new-password"></div>
</fieldset>` : ''}`;
}

// A church asks to get started. Steve sets it up from the owner page.
export function requestPage({ values = {}, error = '', sent = false } = {}) {
  const v = values;
  const body = sent ? `
<div class="wrap section" style="max-width:620px">
  <h1>Thank you. We got your request.</h1>
  <p>We'll email you within a day or two to set up your church's page. Your free month starts when your office takes it over.</p>
  <p>In the meantime, <a href="/c/demo">try the demo</a> with a text you've received.</p>
</div>` : `
<div class="wrap section" style="max-width:620px">
  <h1>Get started with your church</h1>
  <p class="muted">Tell us who you are and we'll set up your church's page with you. It's free for the first month, then $99 a year. Haven't tried it yet? <a href="/c/demo">Try the demo</a> first.</p>
  ${error ? `<div class="error" role="alert">${esc(error)}</div>` : ''}
  <form method="post" action="/start" class="card">
    <div class="field"><label for="church_name">Church name</label><input type="text" id="church_name" name="church_name" value="${esc(v.church_name)}" required></div>
    <div class="field"><label for="city">City and state</label><input type="text" id="city" name="city" value="${esc(v.city)}" placeholder="Norfolk, VA"></div>
    <div class="grid2">
      <div class="field"><label for="contact_name">Your name</label><input type="text" id="contact_name" name="contact_name" value="${esc(v.contact_name)}" required autocomplete="name"></div>
      <div class="field"><label for="contact_role">Your role <span class="hint">Like pastor or church secretary</span></label><input type="text" id="contact_role" name="contact_role" value="${esc(v.contact_role)}"></div>
    </div>
    <div class="grid2">
      <div class="field"><label for="email">Email</label><input type="email" id="email" name="email" value="${esc(v.email)}" required autocapitalize="off" autocomplete="email"></div>
      <div class="field"><label for="phone">Phone <span class="hint">Optional</span></label><input type="tel" id="phone" name="phone" value="${esc(v.phone)}" autocomplete="tel"></div>
    </div>
    <div class="field"><label for="note">Anything we should know <span class="hint">Optional</span></label><textarea id="note" name="note" style="min-height:90px">${esc(v.note)}</textarea></div>
    <div style="position:absolute;left:-5000px" aria-hidden="true"><label>Leave this empty <input type="text" name="website_url" tabindex="-1" autocomplete="off"></label></div>
    <button class="btn big" type="submit">Send my request</button>
  </form>
</div>`;
  return layout({ title: `Get started | ${APP_NAME}`, body, nav: publicNav });
}

export function ownerNewChurchPage({ values = {}, error = '', requestId = '', request = null } = {}) {
  const body = `
<div class="wrap section">
  <p><a href="/owner">Back to all churches</a></p>
  <h1>Add a church</h1>
  <p class="muted">Fill in what you know. After you save, you'll land on the church's dashboard so you can try a sample text and then hand it to the church office. Their free month starts when they take it over.</p>
  ${request ? `<div class="notice"><strong>From ${esc(request.contact_name)}${request.contact_role ? `, ${esc(request.contact_role)}` : ''}</strong>: ${esc(request.email)}${request.phone ? `, ${esc(request.phone)}` : ''}${request.note ? `<br>${esc(request.note)}` : ''}</div>` : ''}
  ${error ? `<div class="error" role="alert">${esc(error)}</div>` : ''}
  <form method="post" action="/owner/new">
    <input type="hidden" name="request_id" value="${esc(requestId)}">
    ${churchFields(values, { isNew: false })}
    <button class="btn big" type="submit">Create the church page</button>
  </form>
</div>`;
  return layout({ title: `Add a church | ${APP_NAME}`, body });
}

export function loginPage({ error = '', email = '', supportEmail = '' } = {}) {
  const body = `
<div class="wrap section" style="max-width:520px">
  <h1>Church office login</h1>
  ${error ? `<div class="error" role="alert">${esc(error)}</div>` : ''}
  <form method="post" action="/login" class="card">
    <div class="field"><label for="email">Email</label><input type="email" id="email" name="email" value="${esc(email)}" required autocapitalize="off" autocomplete="username"></div>
    <div class="field"><label for="password">Password</label><input type="password" id="password" name="password" required autocomplete="current-password"></div>
    <button class="btn big" type="submit">Log in</button>
  </form>
  <p class="muted small" style="margin-top:16px">Forgot your password? ${supportEmail ? `Email <a href="mailto:${esc(supportEmail)}">${esc(supportEmail)}</a> and we'll send you a link to choose a new one.` : 'Contact the person who set up your page for a new login link.'}</p>
  <p class="muted small">New here? <a href="/c/demo">Try the demo</a>, then <a href="/start">ask us to set up your church</a>.</p>
</div>`;
  return layout({ title: `Log in | ${APP_NAME}`, body, nav: publicNav });
}

// ---------- claim a page (hand-off or new password) ----------
export function claimPage({ church = null, email = '', error = '', expired = false, supportEmail = '' } = {}) {
  const body = expired ? `
<div class="wrap section" style="max-width:560px">
  <h1>This link has expired or was already used</h1>
  <p>Login links work once and last 7 days. ${supportEmail ? `Email <a href="mailto:${esc(supportEmail)}">${esc(supportEmail)}</a> for a new one.` : 'Ask the person who sent it for a new one.'}</p>
  <a class="btn secondary" href="/login">Go to church login</a>
</div>` : `
<div class="wrap section" style="max-width:560px">
  <h1>Welcome, ${esc(church.name)}</h1>
  <p>Choose a password for your church office. After this, you'll log in with <strong>${esc(email)}</strong> and this password. Anyone who used a different login for this page before will no longer have access.</p>
  ${error ? `<div class="error" role="alert">${esc(error)}</div>` : ''}
  <form method="post" class="card">
    <input type="text" name="username" value="${esc(email)}" autocomplete="username" hidden>
    <div class="field"><label for="password">New password <span class="hint">At least 8 characters</span></label><input type="password" id="password" name="password" required minlength="8" autocomplete="new-password"></div>
    <div class="field"><label for="password2">Type it again</label><input type="password" id="password2" name="password2" required minlength="8" autocomplete="new-password"></div>
    <button class="btn big" type="submit">Save my password</button>
  </form>
</div>`;
  return layout({ title: `Set your password | ${APP_NAME}`, body });
}

// ---------- owner pages ----------
export function ownerSetupPage({ ready = false, error = '', email = '' } = {}) {
  const body = `
<div class="wrap section" style="max-width:560px">
  <h1>Owner setup</h1>
  ${!ready ? '<p>Owner setup isn\'t turned on. Add an OWNER_SETUP_CODE variable in Railway first.</p>' : `
  <p>This creates the one owner account for the whole site. It works once.</p>
  ${error ? `<div class="error" role="alert">${esc(error)}</div>` : ''}
  <form method="post" class="card">
    <div class="field"><label for="code">Setup code</label><input type="text" id="code" name="code" required autocomplete="off" autocapitalize="off"></div>
    <div class="field"><label for="email">Your email</label><input type="email" id="email" name="email" value="${esc(email)}" required autocapitalize="off" autocomplete="username"></div>
    <div class="field"><label for="password">Owner password <span class="hint">At least 10 characters</span></label><input type="password" id="password" name="password" required minlength="10" autocomplete="new-password"></div>
    <div class="field"><label for="password2">Type it again</label><input type="password" id="password2" name="password2" required minlength="10" autocomplete="new-password"></div>
    <button class="btn big" type="submit">Create owner account</button>
  </form>`}
</div>`;
  return layout({ title: `Owner setup | ${APP_NAME}`, body });
}

export function ownerLoginPage({ error = '', email = '' } = {}) {
  const body = `
<div class="wrap section" style="max-width:520px">
  <h1>Owner login</h1>
  ${error ? `<div class="error" role="alert">${esc(error)}</div>` : ''}
  <form method="post" action="/owner/login" class="card">
    <div class="field"><label for="email">Email</label><input type="email" id="email" name="email" value="${esc(email)}" required autocapitalize="off" autocomplete="username"></div>
    <div class="field"><label for="password">Password</label><input type="password" id="password" name="password" required autocomplete="current-password"></div>
    <button class="btn big" type="submit">Log in</button>
  </form>
</div>`;
  return layout({ title: `Owner login | ${APP_NAME}`, body });
}

function shortDate(s) {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z'));
  return isNaN(d) ? esc(s) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
}

function stateLine(c) {
  const a = c.access;
  switch (a.state) {
    case 'setup': return { label: 'setting up', color: '#666', text: 'Not handed to the church yet. The free month starts when they take it over.' };
    case 'trial': return { label: 'free month', color: 'var(--caution)', text: `Free month ends ${longDate(a.endsAt)} (${a.daysLeft} day${a.daysLeft === 1 ? '' : 's'} left).` };
    case 'grace': return { label: 'grace week', color: 'var(--scam)', text: `${a.reason === 'renewal' ? 'Paid year' : 'Free month'} ended ${longDate(a.endedAt)}. Page pauses ${longDate(a.pausesAt)} unless they pay.` };
    case 'paused': return { label: 'paused', color: '#333', text: a.reason === 'cancelled' ? 'Cancelled. Members\' page is off.' : 'Didn\'t pay. Members\' page is off.' };
    default: return { label: 'paid', color: 'var(--ok)', text: a.until ? `Paid through ${longDate(a.until)}${c.stripe_subscription_id ? ', renews by card' : ''}.` : 'Paid, no end date.' };
  }
}

export function ownerPage({ owner, churches, plans, saved, linkFor, link, linkEmail, linkError, linkSent = false, requests = [], events = [], setup = {}, deleted = false }) {
  const real = churches.filter(c => c.slug !== 'demo');
  const count = st => real.filter(c => c.access.state === st).length;
  const dateInput = s => (s ? String(s).slice(0, 10) : '');

  const setupHtml = (!setup.email || !setup.stripe) ? `
  <div class="notice">
    <strong>Still to switch on:</strong>
    ${!setup.email ? '<p style="margin:8px 0 0">Email is off: no notices to you and no emails to churches. Until it\'s on, check "What\'s happened" at the bottom of this page and send hand-off links yourself.</p>' : ''}
    ${!setup.stripe ? '<p style="margin:8px 0 0">Card payments are off. Churches see your email address instead of a Pay button.</p>' : ''}
  </div>` : '';

  const reqHtml = requests.length ? `
  <div class="card" style="margin-bottom:24px">
    <h2>Churches asking to get started</h2>
    ${requests.map(r => `
    <div class="report new">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><strong>${esc(r.church_name)}${r.city ? `, ${esc(r.city)}` : ''}</strong><span class="muted small">${shortDate(r.created_at)}</span></div>
      <p class="small" style="margin:6px 0">${esc(r.contact_name)}${r.contact_role ? ` (${esc(r.contact_role)})` : ''} · <a href="mailto:${esc(r.email)}">${esc(r.email)}</a>${r.phone ? ` · ${esc(r.phone)}` : ''}</p>
      ${r.note ? `<p class="small" style="margin:0 0 8px">${esc(r.note)}</p>` : ''}
      <div class="btn-row"><a class="btn" href="/owner/new?request=${r.id}">Set up this church</a>
        <form method="post" action="/owner/requests/${r.id}/dismiss" onsubmit="return confirm('Remove this request from the list?')"><button class="btn secondary" type="submit">Dismiss</button></form></div>
    </div>`).join('')}
  </div>` : '';

  const rows = real.map(c => {
    const st = stateLine(c);
    return `
  <div class="card" id="church-${c.id}" style="margin-bottom:16px">
    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline">
      <h3 style="margin:0">${esc(c.name)} <span class="pill" style="background:${st.color}">${esc(st.label)}</span></h3>
      <span class="muted small">Added ${shortDate(c.created_at)}</span>
    </div>
    <p class="small" style="margin:8px 0"><strong>${esc(st.text)}</strong></p>
    <p class="small" style="margin:0 0 8px">${esc(c.city)}${c.city ? ' · ' : ''}Office ${esc(c.office_phone)} · ${c.pendingLogin ? '<span class="muted">No church login yet</span>' : `Login: ${esc(c.admin_email)}`}${c.handed_off_at ? ` · Handed to church ${shortDate(c.handed_off_at)}` : ''}</p>
    <p class="small" style="margin:0 0 12px">Member checks: ${c.checks_30} in the last 30 days, ${c.checks_total} all time${c.last_check ? `, last on ${shortDate(c.last_check)}` : ''}${c.first_member_check_at ? `, first on ${shortDate(c.first_member_check_at)}` : ', none yet'} · Office tests: ${c.checks_test} · <a href="${esc(c.memberUrl)}" target="_blank">Members' page</a></p>
    ${!c.handed_off_at ? `<form method="post" action="/owner/church/${c.id}/open" style="margin-bottom:12px"><button class="btn" type="submit">Open dashboard to test and hand off</button></form>` : ''}
    ${String(saved) === String(c.id) ? '<div class="notice" role="status">Saved.</div>' : ''}
    <form method="post" action="/owner/church/${c.id}/billing" class="grid2" style="align-items:end">
      <div class="field"><label for="plan-${c.id}">Status</label><select id="plan-${c.id}" name="plan">${plans.map(p => `<option${p === c.plan ? ' selected' : ''}>${p}</option>`).join('')}</select></div>
      <div class="field"><label for="trial-${c.id}">Free month ends <span class="hint">Change to give more time</span></label><input type="date" id="trial-${c.id}" name="trial_ends" value="${esc(dateInput(c.trial_ends_at))}"></div>
      <div class="field"><label for="paid-${c.id}">Paid through <span class="hint">Leave empty for paid with no end</span></label><input type="date" id="paid-${c.id}" name="paid_until" value="${esc(c.paid_until)}"></div>
      <div class="field"><label for="note-${c.id}">Your notes <span class="hint">Only you see these</span></label><input type="text" id="note-${c.id}" name="owner_note" value="${esc(c.owner_note)}" placeholder="Paid $99 by check Oct 15. Contact: Linda"></div>
      <div><button class="btn secondary" type="submit">Save</button></div>
    </form>
    <details style="margin-top:12px" ${linkFor === c.id ? 'open' : ''}>
      <summary>${c.handed_off_at ? 'Email a new login link' : 'Email the hand-off link'}</summary>
      <p class="small">${c.handed_off_at ? 'Use this when a church forgets its password or needs to change who logs in.' : 'Send this to the church office. When they open it and choose a password, the page is theirs and their free month starts.'} The link works once, for 7 days.</p>
      ${linkFor === c.id && linkError ? `<div class="error" role="alert">${esc(linkError)}</div>` : ''}
      ${linkFor === c.id && link ? `<div class="notice"><strong>${linkSent ? `We emailed this link to ${esc(linkEmail)}:` : `Email isn't working yet, so send this link to ${esc(linkEmail)} yourself:`}</strong><div class="linkbox" style="margin-top:8px"><code id="link-${c.id}">${esc(link)}</code><button class="btn secondary" type="button" onclick="navigator.clipboard.writeText(document.getElementById('link-${c.id}').textContent).then(()=>{this.textContent='Copied'})">Copy</button></div></div>` : ''}
      <form method="post" action="/owner/church/${c.id}/link" class="linkbox">
        <input type="email" name="email" value="${esc(linkFor === c.id && linkEmail ? linkEmail : (c.pendingLogin ? '' : c.admin_email))}" placeholder="office@theirchurch.org" aria-label="Email the church will log in with" style="flex:1 1 260px" autocapitalize="off">
        <button class="btn" type="submit">Email link</button>
      </form>
    </details>
    <details style="margin-top:12px">
      <summary>Delete this church</summary>
      <p class="small">For test churches or ones that never started. This erases the church, its checks, and its reports. It can't be undone. Type the church name to confirm.</p>
      <form method="post" action="/owner/church/${c.id}/delete" class="linkbox">
        <input type="text" name="confirm_name" placeholder="${esc(c.name)}" aria-label="Type the church name" style="flex:1 1 260px" autocomplete="off">
        <button class="btn secondary" type="submit">Delete</button>
      </form>
    </details>
  </div>`;
  }).join('');

  const eventHtml = events.length ? events.map(e => `
    <div style="padding:10px 0;border-top:1px solid #e4e4e4">
      <span class="muted small">${shortDate(e.created_at)}${e.emailed ? ' · emailed' : ''}</span>
      <p style="margin:4px 0 0;white-space:pre-line">${esc(e.text)}</p>
    </div>`).join('') : '<p class="muted">Nothing yet.</p>';

  const body = `
<div class="wrap-wide section">
  ${deleted ? '<div class="notice" role="status">Church deleted.</div>' : ''}
  <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
    <h1 style="margin:0">All churches</h1>
    <a class="btn" href="/owner/new">Add a church</a>
  </div>
  <p class="muted">Signed in as ${esc(owner.email)}. This page shows accounts and usage only. Members' messages and reports stay private to each church.</p>
  ${setupHtml}
  <div class="stats">
    <div class="stat"><div class="n">${count('trial') + count('setup')}</div><div class="l">Setting up or in free month</div></div>
    <div class="stat"><div class="n">${count('grace')}</div><div class="l">Free month over, not paid</div></div>
    <div class="stat"><div class="n">${count('paid')}</div><div class="l">Paid</div></div>
    <div class="stat"><div class="n">${real.reduce((n, c) => n + c.checks_30, 0)}</div><div class="l">Member checks, last 30 days</div></div>
  </div>
  ${reqHtml}
  ${rows || '<p class="muted">No churches yet.</p>'}
  <div class="card" style="margin-top:24px">
    <h2>What's happened</h2>
    ${eventHtml}
  </div>
</div>`;
  const nav = `<form method="post" action="/owner/logout" style="display:inline"><button type="submit" style="background:none;border:0;color:var(--brand);font:inherit;text-decoration:underline;cursor:pointer;padding:0">Log out</button></form>`;
  return layout({ title: `Owner | ${APP_NAME}`, body, nav, wide: true });
}

// ---------- admin ----------
const longDate = d => d ? d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }) : '';

// The billing box at the top of a church's dashboard.
function billingBox(church, access, billing, paidJustNow) {
  const payBtn = billing.stripe
    ? `<form method="post" action="/admin/pay" style="margin-top:12px"><button class="btn" type="submit">Pay ${esc(billing.price)} a year by card</button></form><p class="muted small" style="margin:8px 0 0">Secure payment through Stripe. It renews each year, and you can cancel any time by emailing us.</p>`
    : `<p style="margin:12px 0 0">To keep your page, ${billing.supportEmail ? `email <a href="mailto:${esc(billing.supportEmail)}">${esc(billing.supportEmail)}</a>` : 'contact us'} and we'll get you set up.</p>`;
  const thanks = paidJustNow
    ? (access.state === 'paid'
      ? '<div class="notice" role="status"><strong>Thank you! Your payment went through.</strong> Your members\' page stays on.</div>'
      : '<div class="notice" role="status"><strong>Thank you!</strong> Your payment is going through. This page will show it within a minute or two.</div>')
    : '';
  switch (access.state) {
    case 'setup':
      return thanks + '<div class="notice"><strong>Setting up.</strong> The free month hasn\'t started. It starts when the church office takes over this page with the hand-off link below.</div>';
    case 'trial':
      return thanks + `<div class="notice"><strong>Free month: ${access.daysLeft} day${access.daysLeft === 1 ? '' : 's'} left.</strong> It ends ${esc(longDate(access.endsAt))}. After that, your members' page costs ${esc(billing.price)} a year.${payBtn}</div>`;
    case 'grace':
      return thanks + `<div class="error" role="alert"><strong>${access.reason === 'renewal' ? 'Your paid year has ended.' : 'Your free month has ended.'}</strong> Your members' page will pause on ${esc(longDate(access.pausesAt))} unless you pay.${payBtn}</div>`;
    case 'paused':
      return thanks + `<div class="error" role="alert"><strong>Your members' page is paused.</strong> Members who open it are told to call your office instead. ${access.reason === 'cancelled' ? '' : 'Pay to turn it back on right away.'}${access.reason === 'cancelled' ? `<p style="margin:12px 0 0">Want it back? ${billing.supportEmail ? `Email <a href="mailto:${esc(billing.supportEmail)}">${esc(billing.supportEmail)}</a>.` : 'Contact us.'}</p>` : payBtn}</div>`;
    default:
      return thanks + (access.until ? `<p class="muted">Paid through ${esc(longDate(access.until))}.${church.stripe_subscription_id ? ' Renews automatically by card.' : ''}</p>` : '');
  }
}

export function adminPage({ church, memberUrl, stats, reports, unseen, saved = false, welcome = false, cleared = false, claimed = false, paid = false, access = { state: 'paid' }, billing = {}, error = '', qrSvg, handoffLink = '', handoffEmail = '', handoffError = '', handoffSent = false }) {
  const handedOff = !!church.handed_off_at;
  const handoffHtml = `
  <details class="card" style="margin-bottom:24px" ${handoffLink || handoffError ? 'open' : ''}>
    <summary>${handedOff ? 'Change who logs in' : 'Hand this page to the church'}</summary>
    <p style="margin-top:12px">${handedOff
      ? 'Use this when a new person takes over the church office. Enter their email and we\'ll email them a link. When they choose a password, the old login stops working.'
      : 'Enter the church office\'s email address and we\'ll email them a link. When they open it and choose a password, the page is theirs, their free month starts, and this setup login stops working. Their members\' page and QR code stay exactly the same.'}</p>
    ${handoffError ? `<div class="error" role="alert">${esc(handoffError)}</div>` : ''}
    ${handoffLink ? `<div class="notice"><strong>${handoffSent ? `We emailed the link to ${esc(handoffEmail)}.` : `Email isn't working yet, so send this link to ${esc(handoffEmail)} yourself.`}</strong> It works once, for 7 days.${handoffSent ? ' Here it is too, in case they need it again:' : ''}<div class="linkbox" style="margin-top:8px"><code id="handoffLink">${esc(handoffLink)}</code><button class="btn secondary" type="button" onclick="navigator.clipboard.writeText(document.getElementById('handoffLink').textContent).then(()=>{this.textContent='Copied'})">Copy link</button></div></div>` : ''}
    <form method="post" action="/admin/handoff" class="linkbox">
      <input type="email" name="email" value="${esc(handoffEmail)}" placeholder="office@theirchurch.org" aria-label="Church office email" required autocapitalize="off" style="flex:1 1 260px">
      <button class="btn" type="submit">Email the link</button>
    </form>
  </details>`;
  const reportHtml = reports.length ? reports.map(r => `
    <div class="report ${r.seen ? '' : 'new'}">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <span><span class="pill ${esc(r.verdict)}">${r.verdict === 'scam' ? 'Scam' : 'Unsure'}</span> ${r.seen ? '' : '<strong style="color:var(--scam)">New</strong>'}</span>
        <span class="muted small">${esc(r.created_at)} UTC</span>
      </div>
      ${r.sender ? `<p class="small" style="margin:8px 0 0"><strong>Sent from:</strong> ${esc(r.sender)}</p>` : ''}
      ${r.message ? `<pre>${esc(r.message)}</pre>` : '<p class="muted small">(Screenshot only, no text pasted.)</p>'}
      ${r.member_note ? `<p class="small"><strong>Member's note:</strong> ${esc(r.member_note)}</p>` : ''}
      <form method="post" action="/admin/reports/${r.id}/delete" onsubmit="return confirm('Remove this report?')"><button class="btn secondary" style="min-height:40px;padding:6px 14px;font-size:16px" type="submit">Remove</button></form>
    </div>`).join('') : '<p class="muted">No reports yet. When a member taps "Tell the church office," the message shows up here.</p>';

  const body = `
<div class="wrap-wide section">
  ${saved ? '<div class="notice" role="status">Saved.</div>' : ''}
  ${cleared ? '<div class="notice" role="status">Test checks and reports cleared. The counts start from zero.</div>' : ''}
  ${claimed ? `<div class="notice" role="status"><strong>Your password is saved.</strong> From now on, log in with ${esc(church.admin_email)}.</div>` : ''}
  ${welcome ? '<div class="notice" role="status"><strong>The church page is made.</strong> Open the members\' page and try a sample scam text. When it looks right, open "Hand this page to the church" below and make their link.</div>' : ''}
  ${error ? `<div class="error" role="alert">${esc(error)}</div>` : ''}
  <h1>${esc(church.name)}</h1>
  <p class="muted">${esc(church.city)}</p>
  ${billingBox(church, access, billing, paid)}
  ${billing.isOwner ? '<p class="small"><a href="/owner">Back to the owner page</a></p>' : ''}

  <div class="stats">
    <div class="stat"><div class="n">${stats.last30}</div><div class="l">Checks in the last 30 days</div></div>
    <div class="stat"><div class="n">${stats.scams30}</div><div class="l">Scams caught in the last 30 days</div></div>
    <div class="stat"><div class="n">${unseen}</div><div class="l">New reports from members</div></div>
    <div class="stat"><div class="n">${stats.total}</div><div class="l">Checks all time</div></div>
  </div>

  <div class="card stack" style="margin-bottom:24px">
    <h2>Your members' page</h2>
    <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:center">
      <div class="qr-preview">${qrSvg}</div>
      <div style="flex:1 1 300px" class="stack">
        <div class="linkbox"><code id="memberUrl">${esc(memberUrl)}</code>
          <button class="btn secondary" type="button" onclick="navigator.clipboard.writeText(document.getElementById('memberUrl').textContent).then(()=>{this.textContent='Copied'})">Copy link</button></div>
        <div class="btn-row"><a class="btn" href="/c/${esc(church.slug)}/flyer" target="_blank">Print the bulletin flyer</a><a class="btn secondary" href="/c/${esc(church.slug)}" target="_blank">Open the page</a></div>
        <p class="muted small">Put the link in your newsletter and on your website. Ask members to add the page to their phone's home screen.</p>
      </div>
    </div>
  </div>

  <div class="card" style="margin-bottom:24px">
    <h2>Reports from members</h2>
    ${reportHtml}
  </div>

  ${handoffHtml}

  <details class="card" style="margin-bottom:24px">
    <summary>Clear test data</summary>
    <p style="margin-top:12px">Done testing? This erases every check and report so far, and the counts start again at zero. Your church information stays.</p>
    <form method="post" action="/admin/clear" onsubmit="return confirm('Erase all checks and reports? This cannot be undone.')">
      <button class="btn secondary" type="submit">Clear all checks and reports</button>
    </form>
  </details>

  <details class="card">
    <summary>Edit your church information</summary>
    <form method="post" action="/admin" style="margin-top:16px">
      ${churchFields(church, { isNew: false })}
      <button class="btn big" type="submit">Save changes</button>
    </form>
  </details>
</div>`;
  const nav = `<a href="/c/${esc(church.slug)}" target="_blank">Members' page</a><form method="post" action="/logout" style="display:inline"><button type="submit" style="background:none;border:0;color:var(--brand);font:inherit;text-decoration:underline;cursor:pointer;padding:0">Log out</button></form>`;
  return layout({ title: `${church.name} | ${APP_NAME}`, body, nav, wide: true });
}

// ---------- member check page ----------
export function memberPage(church, { demo = false } = {}) {
  const office = formatPhone(church.office_phone);
  const leader = church.leader_title || 'Pastor';
  const body = `
<div class="wrap">
  <div class="church-head">
    <div class="eyebrow">${esc(church.name)}${church.city ? ` · ${esc(church.city)}` : ''}</div>
    <h1>Did this message really come from your ${esc(leader.toLowerCase())} or church?</h1>
    <p class="muted">Paste the text or email below, or add a screenshot. You'll get a plain answer in a few seconds.</p>
    ${demo ? '<div class="notice"><strong>This is a demo church.</strong> Try pasting a message like: "Hi, this is Pastor Mike. Are you available? I need a favor. Can you pick up 3 Apple gift cards for a sick member?"</div>' : ''}
  </div>

  <form id="checkForm" class="card" autocomplete="off">
    <div class="field">
      <label for="message">The message</label>
      <textarea id="message" name="message" placeholder="Paste the message here"></textarea>
    </div>
    <div class="or-line">and / or</div>
    <div class="field">
      <label for="shot">A screenshot of the message <span class="hint">Take a screenshot on your phone, then choose it here</span></label>
      <div class="upload"><input type="file" id="shot" accept="image/*"><img id="preview" class="preview-img" alt="Your screenshot"></div>
    </div>
    <div class="field">
      <label for="sender">Who sent it? <span class="hint">Optional. The phone number or email address it came from</span></label>
      <input type="text" id="sender" name="sender" inputmode="email" autocapitalize="off" placeholder="For example 757-555-1234">
    </div>
    <button class="btn big" type="submit" id="checkBtn">Check this message</button>
    <p class="muted small" style="margin:12px 0 0">We don't save what you check unless you choose to send it to the church office.</p>
  </form>

  <div id="result" aria-live="polite" style="margin-top:20px"></div>

  <div class="card" style="margin-top:24px">
    <h3>The short version</h3>
    <p>${esc(church.name)} will never ask you to buy gift cards or send money by text message or email. If a message does, it's a scam, even if it uses your ${esc(leader.toLowerCase())}'s name or photo.</p>
    <p style="margin:0">Not sure? Call the church office at <a href="tel:${esc(digitsOnly(church.office_phone))}"><strong>${esc(office)}</strong></a>.</p>
  </div>
</div>
<script>window.CHECK_SLUG = ${JSON.stringify(church.slug)};</script>
<script src="/check-page.js" defer></script>`;
  return layout({ title: `Check a message | ${church.name}`, body, nav: '', description: `Check whether a message really came from ${church.name}.` });
}

export function pausedMemberPage(church) {
  const office = formatPhone(church.office_phone);
  const body = `
<div class="wrap section">
  <div class="eyebrow">${esc(church.name)}${church.city ? ` · ${esc(church.city)}` : ''}</div>
  <h1>This message checker is paused right now</h1>
  <div class="card">
    <p>If you got a text or email that says it's from your ${esc((church.leader_title || 'Pastor').toLowerCase())} or the church and asks for gift cards, money, or a favor, don't reply and don't buy anything.</p>
    <p style="margin:0">Call the church office first at <a href="tel:${esc(digitsOnly(church.office_phone))}"><strong>${esc(office)}</strong></a>.</p>
  </div>
</div>`;
  return layout({ title: `Paused | ${church.name}`, body });
}

// ---------- printable flyer ----------
export function flyerPage(church, memberUrl, qrSvg) {
  const leader = church.leader_title || 'Pastor';
  const r = church.rules || {};
  const promises = [];
  if (r.noGiftCards !== false) promises.push('ask you to buy gift cards');
  if (r.noMoneyByText !== false) promises.push('ask for money or donations by text or email');
  if (r.noPersonalInfo !== false) promises.push('ask for passwords, codes, or bank details by text or email');
  if (r.noNewNumbers !== false) promises.push('text you from a "new number" asking for a favor');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Flyer | ${esc(church.name)}</title><link rel="stylesheet" href="/style.css"></head>
<body class="flyer-page">
<div class="print-bar"><button class="btn" onclick="window.print()">Print this flyer</button></div>
<div class="flyer">
  <h1>Got a text from "${esc(leader)}" asking for a favor?</h1>
  <p class="sub">Check it before you do anything. Scan this code with your phone's camera.</p>
  <div class="qr">${qrSvg}</div>
  <p class="url">${esc(memberUrl.replace(/^https?:\/\//, ''))}</p>
  ${promises.length ? `<div class="rules"><strong>${esc(church.name)} will never:</strong><ul>${promises.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}
  <p class="office">Not sure? Call the church office: <strong>${esc(formatPhone(church.office_phone))}</strong></p>
</div>
</body></html>`;
}

export function notFoundPage() {
  return layout({ title: 'Page not found', body: `<div class="wrap section"><h1>We couldn't find that page</h1><p>Check the link, or ask your church office for the right one.</p><a class="btn" href="/">Go to the home page</a></div>` });
}
