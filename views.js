// HTML pages. Plain server-rendered HTML so it works on any phone or computer.
import { formatPhone, digitsOnly } from './check.js';

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
  <div class="btn-row"><a class="btn" href="/setup">Set up your church</a><a class="btn secondary" href="/c/demo">See the member page</a></div>
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
    <div class="card"><div class="num">1</div><h3>The church office signs up</h3><p>Enter your real phone numbers and emails for the office and staff, and the promises your church makes, like "we never ask for gift cards."</p></div>
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
  <h2>Free while we're in our pilot</h2>
  <p class="muted">Setting up takes about five minutes.</p>
  <a class="btn" href="/setup">Set up your church</a>
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
    <div class="field"><label for="leader_title">What members call your pastor <span class="hint">Pastor, Father, Reverend</span></label><input type="text" id="leader_title" name="leader_title" value="${esc(c.leader_title || 'Pastor')}"></div>
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

export function setupPage({ values = {}, error = '' } = {}) {
  const body = `
<div class="wrap section">
  <h1>Set up your church</h1>
  <p class="muted">This takes about five minutes. You can change anything later.</p>
  ${error ? `<div class="error" role="alert">${esc(error)}</div>` : ''}
  <form method="post" action="/setup">
    ${churchFields(values, { isNew: true })}
    <button class="btn big" type="submit">Create our church page</button>
  </form>
</div>`;
  return layout({ title: `Set up your church | ${APP_NAME}`, body, nav: publicNav });
}

export function loginPage({ error = '', email = '' } = {}) {
  const body = `
<div class="wrap section" style="max-width:520px">
  <h1>Church office login</h1>
  ${error ? `<div class="error" role="alert">${esc(error)}</div>` : ''}
  <form method="post" action="/login" class="card">
    <div class="field"><label for="email">Email</label><input type="email" id="email" name="email" value="${esc(email)}" required autocapitalize="off" autocomplete="username"></div>
    <div class="field"><label for="password">Password</label><input type="password" id="password" name="password" required autocomplete="current-password"></div>
    <button class="btn big" type="submit">Log in</button>
  </form>
  <p class="muted small" style="margin-top:16px">New here? <a href="/setup">Set up your church</a>.</p>
</div>`;
  return layout({ title: `Log in | ${APP_NAME}`, body, nav: publicNav });
}

// ---------- admin ----------
export function adminPage({ church, memberUrl, stats, reports, unseen, saved = false, welcome = false, cleared = false, error = '', qrSvg }) {
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
  ${welcome ? '<div class="notice" role="status"><strong>Your page is ready.</strong> Open it and try a sample scam text first. Then print the flyer for Sunday\'s bulletin and share the link in your next newsletter.</div>' : ''}
  ${error ? `<div class="error" role="alert">${esc(error)}</div>` : ''}
  <h1>${esc(church.name)}</h1>
  <p class="muted">${esc(church.city)}</p>

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
