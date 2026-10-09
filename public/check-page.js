// Member check page: sends the message (and a shrunken screenshot) to the server and shows the answer.
(function () {
  const form = document.getElementById('checkForm');
  const btn = document.getElementById('checkBtn');
  const fileInput = document.getElementById('shot');
  const preview = document.getElementById('preview');
  const resultEl = document.getElementById('result');
  const slug = window.CHECK_SLUG;
  let image = null; // { data, mediaType }
  let last = null;  // last request + answer, for reporting

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Shrink photos so they upload fast on a phone.
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const max = 1600;
        let { width, height } = img;
        const scale = Math.min(1, max / Math.max(width, height));
        width = Math.round(width * scale); height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve({ dataUrl, data: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as a picture.')); };
      img.src = url;
    });
  }

  // Safari can bring back old typing and results when the page is reopened. Always start clean.
  function clearAll() {
    form.reset(); image = null; last = null;
    preview.removeAttribute('src'); preview.style.display = 'none';
    resultEl.innerHTML = '';
    btn.disabled = false; btn.textContent = 'Check this message';
  }
  window.addEventListener('pageshow', clearAll);
  clearAll();

  fileInput.addEventListener('change', async () => {
    image = null; preview.style.display = 'none';
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    try {
      const s = await shrink(f);
      image = { data: s.data, mediaType: s.mediaType };
      preview.src = s.dataUrl; preview.style.display = 'block';
    } catch (e) {
      alert(e.message);
      fileInput.value = '';
    }
  });

  function render(a) {
    const isScam = a.verdict === 'scam';
    const tag = isScam ? 'Likely scam' : 'Be careful';
    const office = a.officePhone;
    resultEl.innerHTML = `
      <div class="result ${isScam ? 'scam' : 'caution'}" tabindex="-1" id="resultBox">
        <span class="tag">${tag}</span>
        <h2>${esc(a.headline)}</h2>
        <p>${esc(a.explanation)}</p>
        ${a.redFlags && a.redFlags.length ? `<h3 style="font-size:20px">Warning signs</h3><ul class="flags">${a.redFlags.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
        <h3 style="font-size:20px">What to do</h3>
        <ol>${a.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
        <div class="call-box">
          <div class="muted small">Church office</div>
          <a class="tel" href="tel:${esc(a.officeDigits)}">${esc(office)}</a>
          ${a.contactHints && a.contactHints.length ? `<div class="hints" style="margin-top:10px">${a.contactHints.map(h => `<div>${esc(h)}</div>`).join('')}</div>` : ''}
        </div>
        <div class="report-box" id="reportBox">
          <p style="margin-bottom:10px"><strong>Help protect others.</strong> Send this message to the church office so they can warn everyone.</p>
          <div class="field"><label for="memberNote">Your name or a note <span class="hint">Optional</span></label><input type="text" id="memberNote" maxlength="300"></div>
          <div class="btn-row"><button class="btn" type="button" id="reportBtn">Tell the church office</button><button class="btn secondary" type="button" id="againBtn">Check another message</button></div>
        </div>
      </div>`;
    document.getElementById('resultBox').focus();
    document.getElementById('resultBox').scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('againBtn').addEventListener('click', reset);
    document.getElementById('reportBtn').addEventListener('click', report);
  }

  function reset() {
    clearAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.getElementById('message').focus();
  }

  async function report() {
    const b = document.getElementById('reportBtn');
    b.disabled = true; b.textContent = 'Sending...';
    try {
      const res = await fetch(`/api/c/${encodeURIComponent(slug)}/report`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...last, member_note: document.getElementById('memberNote').value }),
      });
      if (!res.ok) throw new Error();
      document.getElementById('reportBox').innerHTML = '<p style="margin:0"><strong>Thank you.</strong> The church office has it. <button class="btn secondary" type="button" id="againBtn2" style="margin-top:12px">Check another message</button></p>';
      document.getElementById('againBtn2').addEventListener('click', reset);
    } catch {
      b.disabled = false; b.textContent = 'Tell the church office';
      alert('That did not go through. Please call the church office instead.');
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = document.getElementById('message').value.trim();
    const sender = document.getElementById('sender').value.trim();
    if (!message && !image) {
      alert('Paste the message or add a screenshot first.');
      return;
    }
    btn.disabled = true; btn.textContent = 'Checking...';
    resultEl.innerHTML = '';
    try {
      const res = await fetch(`/api/c/${encodeURIComponent(slug)}/check`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sender, image }),
      });
      const a = await res.json();
      if (!res.ok) throw new Error(a.error || 'Something went wrong.');
      last = { message, sender: a.senderSeen || sender, verdict: a.verdict };
      render(a);
    } catch (err) {
      resultEl.innerHTML = `<div class="result caution"><span class="tag">Could not check</span><h2>${esc(err.message)}</h2><p>To be safe, don't send money or gift cards. Call the church office.</p></div>`;
    } finally {
      btn.disabled = false; btn.textContent = 'Check this message';
    }
  });
})();
