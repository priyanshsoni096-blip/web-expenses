/* Small helpers. Everything that can be plain HTML is plain HTML — forms POST
   and the server redirects — so this file only covers things that genuinely
   need the client: charts, and toggling a panel open. */

   const THEME = {
    text: '#E6E9EF', muted: '#7C8494', grid: '#232A38',
    accent: '#22C55E', surface: '#171C27', bg: 'rgba(0,0,0,0)',
  };
  
  function baseLayout(extra) {
    return Object.assign({
      paper_bgcolor: THEME.bg,
      plot_bgcolor: THEME.bg,
      font: { color: THEME.text, family: 'JetBrains Mono, monospace', size: 12 },
      margin: { l: 10, r: 10, t: 10, b: 10 },
      autosize: true,
      hoverlabel: { bgcolor: THEME.surface, bordercolor: THEME.grid,
                    font: { color: THEME.text, size: 12 } },
    }, extra || {});
  }
  
  const CONFIG = { displayModeBar: false, responsive: true };
  
  function drawDonut(id, labels, values, colors, total) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!values.length) { el.innerHTML = '<div class="empty">No data yet.</div>'; return; }
    /* On a phone the card is ~330px wide. A legend pinned to the right of the pie
       leaves the chart itself a sliver, so below 420px it moves underneath and
       runs horizontally instead. Measured from the element, not the viewport, so a
       collapsed sidebar on a laptop gets the roomier version. */
    const narrow = el.clientWidth > 0 && el.clientWidth < 420;
    const legend = narrow
      ? { orientation: 'h', x: 0.5, xanchor: 'center', y: -0.05, yanchor: 'top',
          font: { size: 10, color: THEME.text } }
      : { orientation: 'v', x: 1, xanchor: 'left', y: 0.5, yanchor: 'middle',
          font: { size: 11, color: THEME.text } };
  
    Plotly.newPlot(el, [{
      type: 'pie', hole: 0.62, labels: labels, values: values,
      sort: false, direction: 'clockwise', textinfo: 'none',
      marker: { colors: colors, line: { color: '#12161F', width: 2 } },
      hovertemplate: '%{label}: ₹%{value:,.0f}<extra></extra>',
    }], baseLayout({
      showlegend: true,
      margin: narrow ? { l: 4, r: 4, t: 4, b: 46 } : { l: 10, r: 10, t: 10, b: 10 },
      legend: legend,
      annotations: [{
        text: '₹' + Math.round(total).toLocaleString('en-IN') +
              "<br><span style='font-size:9px;color:" + THEME.muted + "'>TOTAL</span>",
        x: 0.5, y: 0.5, showarrow: false,
        font: { size: 18, color: THEME.text }, xref: 'paper', yref: 'paper',
      }],
    }), CONFIG);
  }
  
  function drawTrend(id, x, y, xTitle) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!x.length) { el.innerHTML = '<div class="empty">No data yet.</div>'; return; }
    const isDate = typeof x[0] === 'string';
    Plotly.newPlot(el, [{
      type: 'scatter', mode: 'lines+markers', x: x, y: y,
      line: { color: THEME.accent, width: 2 },
      marker: { size: 6, color: THEME.accent },
      fill: 'tozeroy', fillcolor: 'rgba(34,197,94,0.10)',
      hovertemplate: (isDate ? '%{x|%d %b %Y}' : xTitle + ' %{x}') + ': ₹%{y:,.0f}<extra></extra>',
    }], baseLayout({
      /* dtick pinned to whole days stops Plotly inventing fractional day numbers
         (9.2, 9.4) or hourly ticks when only a couple of days have data */
      xaxis: Object.assign({ showgrid: false, gridcolor: THEME.grid, automargin: true,
                             tickfont: { color: THEME.muted } },
                           isDate ? { type: 'date', dtick: 86400000, tickformat: '%d %b' }
                                  : { dtick: 1, tickformat: 'd' }),
      yaxis: { showgrid: true, gridcolor: THEME.grid, automargin: true, rangemode: 'tozero',
               tickprefix: '₹', separatethousands: true, tickfont: { color: THEME.muted } },
    }), CONFIG);
  }
  
  function drawBars(id, labels, values) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!values.length) { el.innerHTML = '<div class="empty">No data yet.</div>'; return; }
    Plotly.newPlot(el, [{
      type: 'bar', x: labels, y: values, marker: { color: THEME.accent },
      hovertemplate: '%{x}: ₹%{y:,.0f}<extra></extra>',
    }], baseLayout({
      xaxis: { showgrid: false, tickfont: { color: THEME.muted }, automargin: true },
      yaxis: { gridcolor: THEME.grid, tickprefix: '₹', separatethousands: true,
               automargin: true, tickfont: { color: THEME.muted } },
    }), CONFIG);
  }
  
  /* Full-screen toggle: swap one class and tell Plotly to re-measure. */
  function toggleChart(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('fullscreen');
    if (window.Plotly) Plotly.Plots.resize(el);
  }
  
  function toggleEdit(id) {
    const form = document.getElementById('edit-' + id);
    if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
  }
  
  function fillExample(text) {
    const box = document.getElementById('expense-text');
    if (!box) return;
    box.value = text.trim();
    box.focus();
    updateCounter();
  }
  
  function updateCounter() {
    const box = document.getElementById('expense-text');
    const out = document.getElementById('counter');
    if (box && out) out.textContent = box.value.length + '/300';
  }
  
  function initCounter() {
    const box = document.getElementById('expense-text');
    if (!box) return;
    box.addEventListener('input', updateCounter);
    /* A textarea does not submit on Enter the way an input does, so wire it up:
       Enter submits, Shift+Enter still inserts a newline. */
    box.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        const form = document.getElementById('parse-form');
        if (form && box.value.trim()) { e.preventDefault(); form.submit(); }
      }
    });
    updateCounter();
  }
  
  /* =========================================================================
     MOBILE NAVIGATION DRAWER
  
     Toggling two classes; the animation and positioning are entirely CSS. Also
     locks the page behind so it cannot scroll under the open drawer, and keeps
     aria-expanded accurate for screen readers.
     ========================================================================= */
  
  function setSidebar(open) {
    const bar = document.getElementById('sidebar');
    const scrim = document.getElementById('scrim');
    const btn = document.getElementById('menu-btn');
    if (!bar) return;
    bar.classList.toggle('open', open);
    if (scrim) scrim.classList.toggle('open', open);
    document.body.classList.toggle('nav-open', open);
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  
  function toggleSidebar() {
    const bar = document.getElementById('sidebar');
    setSidebar(!(bar && bar.classList.contains('open')));
  }
  
  function closeSidebar() { setSidebar(false); }
  
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeSidebar();
  });
  
  /* If the window grows past the breakpoint while the drawer is open, drop the
     classes so the desktop sidebar is not left with a scrim over the page. */
  window.addEventListener('resize', function () {
    if (window.innerWidth > 760) closeSidebar();
  });
  
  /* =========================================================================
     SIDEBAR PROFILE — edit name
     ========================================================================= */
  
  function toggleNameEdit(editing) {
    const view = document.getElementById('profile-view');
    const form = document.getElementById('profile-edit');
    if (!view || !form) return;
    view.style.display = editing ? 'none' : 'flex';
    form.style.display = editing ? 'flex' : 'none';
    if (editing) {
      const input = document.getElementById('profile-name-input');
      if (input) { input.focus(); input.select(); }
    }
  }
  
  /* =========================================================================
     MONTHLY BUDGET — edit on demand
  
     The card shows the figures plus an Edit button; the input and Save appear only
     after you choose to edit, and Cancel puts it back without touching anything.
     ========================================================================= */
  
  function toggleBudgetEdit(editing) {
    const view = document.getElementById('budget-view');
    const form = document.getElementById('budget-edit');
    if (!view || !form) return;
    view.style.display = editing ? 'none' : 'block';
    form.style.display = editing ? 'block' : 'none';
    if (editing) {
      const input = document.getElementById('budget-amount');
      if (input) { input.focus(); input.select(); }
    }
  }
  
  /* =========================================================================
     TYPE / SPEAK MODE
     ========================================================================= */
  
  function setMode(mode) {
    const speak = mode === 'speak';
    const ps = document.getElementById('panel-speak');
    const pt = document.getElementById('panel-type');
    if (ps) ps.style.display = speak ? 'block' : 'none';
    if (pt) pt.style.display = speak ? 'none' : 'block';
  
    const bs = document.getElementById('mode-speak');
    const bt = document.getElementById('mode-type');
    if (bs) bs.classList.toggle('active', speak);
    if (bt) bt.classList.toggle('active', !speak);
  
    const field = document.getElementById('mode-field');
    if (field) field.value = mode;
  
    const title = document.getElementById('step1-title');
    if (title) title.textContent = speak ? '1. Speak your expense' : '1. Describe your expense';
  
    if (!speak) stopDictation();
  }
  
  function toggleHelp() {
    const box = document.getElementById('help-box');
    if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
  }
  
  /* =========================================================================
     VOICE INPUT — browser SpeechRecognition
  
     Not a port of voice_input.py. That recorded audio and posted it to
     recognize_google(), Google's free UNKEYED endpoint: unofficial, rate limited,
     and it failed intermittently. Sending audio to the server would also need WAV
     encoding in JS (MediaRecorder emits webm/opus, which the Python library cannot
     read) or ffmpeg installed server-side.
  
     The browser API supports hi-IN and en-IN natively and returns text directly,
     so no audio leaves the machine. Chrome, Edge and Safari implement it; Firefox
     does not, and the button says so instead of failing silently.
     ========================================================================= */
  
  let recognition = null;
  let listening = false;
  
  function speechSupported() {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }
  
  function setVoiceStatus(msg, tone) {
    const el = document.getElementById('voice-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'voice-status' + (tone ? ' ' + tone : '');
  }
  
  function setRecordingUI(on) {
    const btn = document.getElementById('voice-btn');
    const target = document.getElementById('mic-target');
    if (btn) {
      btn.textContent = on ? '\u23F9 Stop Recording' : '\uD83C\uDFA4 Start Recording';
      btn.classList.toggle('recording', on);
    }
    if (target) target.classList.toggle('live', on);
  }
  
  function showTranscript(text, langLabel) {
    const box = document.getElementById('transcript');
    const t = document.getElementById('transcript-text');
    const l = document.getElementById('transcript-lang');
    if (!box || !t) return;
    t.textContent = '"' + text + '"';
    if (l) l.textContent = langLabel ? '(' + langLabel + ')' : '';
    box.style.display = 'flex';
  }
  
  function toggleDictation() {
    /* Every failure path below sets a visible status message. A silent dead button
       was the previous symptom, and it was caused by the status element being
       unstyled and effectively invisible. */
    if (listening) { stopDictation(); return; }
  
    if (!window.isSecureContext) {
      setVoiceStatus('Microphone needs a secure page. Use http://127.0.0.1:8000 '
        + '(not your LAN IP) locally, or HTTPS when deployed.', 'error');
      return;
    }
    if (!speechSupported()) {
      setVoiceStatus('This browser has no speech recognition. Chrome, Edge or Safari '
        + 'will work; on Firefox use the Type tab.', 'error');
      return;
    }
  
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    const langEl = document.getElementById('voice-lang');
    const langLabel = langEl ? langEl.options[langEl.selectedIndex].text : 'English';
  
    try {
      recognition = new Ctor();
    } catch (e) {
      setVoiceStatus('Could not start speech recognition: ' + e.message, 'error');
      return;
    }
  
    recognition.lang = langEl ? langEl.value : 'en-IN';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
  
    const box = document.getElementById('expense-text');
  
    recognition.onstart = function () {
      listening = true;
      setRecordingUI(true);
      setVoiceStatus('Listening\u2026 say something like "500 at McDonald\'s".', 'live');
    };
  
    recognition.onresult = function (event) {
      let finalText = '', interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += chunk; else interim += chunk;
      }
      const heard = (finalText || interim).trim();
      if (box && heard) { box.value = heard; updateCounter(); }
      if (finalText) {
        showTranscript(finalText.trim(), langLabel);
        /* Deliberately NOT submitting automatically - you review what was heard and
           press Enter yourself. The preview card names the text it was built from,
           so a result left over from an earlier Enter cannot be mistaken for the
           current one. */
        setVoiceStatus('Heard "' + finalText.trim()
          + '" \u2014 check it, then press Enter.', 'live');
      }
    };
  
    recognition.onerror = function (event) {
      const messages = {
        'no-speech': "Didn't catch anything. Tap record and speak a little louder.",
        'not-allowed': 'Microphone permission denied. Allow the mic for this site, '
                     + 'then reload. On macOS also check System Settings \u2192 '
                     + 'Privacy & Security \u2192 Microphone.',
        'service-not-allowed': 'The OS blocked speech recognition. On macOS enable '
                     + 'System Settings \u2192 Keyboard \u2192 Dictation.',
        'audio-capture': 'No microphone found.',
        'network': 'Speech service unreachable \u2014 check your internet connection.',
        'aborted': 'Recording stopped.',
      };
      setVoiceStatus(messages[event.error] || ('Speech error: ' + event.error), 'error');
      listening = false;
      setRecordingUI(false);
    };
  
    recognition.onend = function () {
      listening = false;
      setRecordingUI(false);
    };
  
    try {
      recognition.start();
      /* onstart can be slow to fire; show feedback immediately so the button never
         looks unresponsive. */
      setVoiceStatus('Starting the microphone\u2026', 'live');
    } catch (e) {
      setVoiceStatus('Could not open the microphone: ' + e.message, 'error');
      listening = false;
      setRecordingUI(false);
    }
  }
  
  function stopDictation() {
    if (recognition) { try { recognition.stop(); } catch (e) {} }
    listening = false;
    setRecordingUI(false);
  }
  
  function initVoice() {
    const btn = document.getElementById('voice-btn');
    if (!btn) return;
    if (!window.isSecureContext) {
      setVoiceStatus('Open the app at http://127.0.0.1:8000 so the browser treats it '
        + 'as a secure page and allows the microphone.', 'error');
    } else if (!speechSupported()) {
      btn.disabled = true;
      setVoiceStatus('Voice input needs Chrome, Edge or Safari. Use the Type tab here.', 'error');
    } else {
      setVoiceStatus('Ready \u2014 tap Start Recording.');
    }
  }
  
  /* =========================================================================
     BOOTSTRAP
     Charts read their data from data-* attributes rather than Jinja inside a
     <script> tag: editors' JS linters flag {{ ... }} as invalid JavaScript, and
     keeping script out of the templates leaves room for a CSP later.
     ========================================================================= */
  
  function readJSON(el, name, fallback) {
    const raw = el.dataset[name];
    if (raw === undefined || raw === '') return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }
  
  function initCharts() {
    document.querySelectorAll('[data-chart]').forEach(function (el) {
      const kind = el.dataset.chart;
      if (kind === 'donut') {
        drawDonut(el.id, readJSON(el, 'labels', []), readJSON(el, 'values', []),
                  readJSON(el, 'colors', []), readJSON(el, 'total', 0));
      } else if (kind === 'trend') {
        drawTrend(el.id, readJSON(el, 'x', []), readJSON(el, 'y', []),
                  el.dataset.xlabel || 'Day');
      } else if (kind === 'bars') {
        drawBars(el.id, readJSON(el, 'labels', []), readJSON(el, 'values', []));
      }
    });
  }
  
  /* Rotating a phone crosses the 420px threshold, so the charts are rebuilt after
     a resize settles. Debounced because resize fires continuously while dragging. */
  let resizeTimer = null;
  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(initCharts, 250);
  });
  
  document.addEventListener('DOMContentLoaded', function () {
    initCharts();
    initCounter();
    initVoice();
    /* If the budget save was rejected, reopen the editor so the correction can be
       made where the error is shown, rather than needing another click. */
    if (window.location.search.indexOf('err=budget') !== -1) toggleBudgetEdit(true);
    if (window.location.search.indexOf('err=name') !== -1) toggleNameEdit(true);
  });
  
  /* =========================================================================
     RECEIPT ATTACHMENT
  
     The file is read, downscaled and base64-encoded in the browser, then posted as
     a hidden field. Doing it client-side means:
       - no multipart upload handling or image library on the server,
       - no separate storage bucket to enable and pay for,
       - a 4 MB phone photo becomes ~150 KB, which fits inside Firestore's 1 MiB
         document limit alongside the rest of the expense.
  
     PDFs cannot be downscaled, so they are size-checked and rejected if too large
     rather than silently failing on save.
     ========================================================================= */
  
  const RECEIPT_MAX_CHARS = 700000;   /* must match MAX_RECEIPT_CHARS in main.py */
  const RECEIPT_MAX_EDGE = 1400;      /* longest side after downscaling, px */
  const RECEIPT_QUALITY = 0.72;
  
  function setReceiptStatus(msg, tone) {
    const el = document.getElementById('receipt-status');
    if (!el) return;
    el.textContent = msg;
    el.style.color = tone === 'error' ? 'var(--red)'
                   : tone === 'ok' ? 'var(--accent)' : 'var(--muted)';
  }
  
  function clearReceipt() {
    ['receipt-data', 'receipt-name'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const file = document.getElementById('receipt-file');
    if (file) file.value = '';
    const img = document.getElementById('receipt-preview');
    if (img) { img.style.display = 'none'; img.removeAttribute('src'); }
    const clear = document.getElementById('receipt-clear');
    if (clear) clear.style.display = 'none';
    setReceiptStatus('Photo or PDF of the receipt \u2014 optional');
  }
  
  function storeReceipt(dataUrl, name) {
    if (dataUrl.length > RECEIPT_MAX_CHARS) {
      setReceiptStatus('That file is too large even after compressing. '
        + 'Try a photo instead of a scan, or crop it first.', 'error');
      clearReceipt();
      return;
    }
    document.getElementById('receipt-data').value = dataUrl;
    document.getElementById('receipt-name').value = name;
    const kb = Math.round(dataUrl.length * 0.75 / 1024);
    setReceiptStatus(name + ' \u2014 ' + kb + ' KB attached', 'ok');
    const clear = document.getElementById('receipt-clear');
    if (clear) clear.style.display = 'inline-flex';
    if (dataUrl.indexOf('data:image') === 0) {
      const img = document.getElementById('receipt-preview');
      if (img) { img.src = dataUrl; img.style.display = 'block'; }
    }
  }
  
  function handleReceipt(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    setReceiptStatus('Processing\u2026');
  
    if (file.type === 'application/pdf') {
      /* No way to shrink a PDF in the browser, so check the raw size. base64 is
         roughly 4/3 of the original, hence the 0.75 factor. */
      if (file.size > RECEIPT_MAX_CHARS * 0.75) {
        setReceiptStatus('PDF is too large (max about '
          + Math.round(RECEIPT_MAX_CHARS * 0.75 / 1024) + ' KB). '
          + 'A photo of the receipt will usually be smaller.', 'error');
        clearReceipt();
        return;
      }
      const reader = new FileReader();
      reader.onload = function () { storeReceipt(String(reader.result), file.name); };
      reader.onerror = function () { setReceiptStatus('Could not read that file.', 'error'); };
      reader.readAsDataURL(file);
      return;
    }
  
    if (file.type.indexOf('image/') !== 0) {
      setReceiptStatus('Only images and PDFs can be attached.', 'error');
      clearReceipt();
      return;
    }
  
    const reader = new FileReader();
    reader.onload = function () {
      const img = new Image();
      img.onload = function () {
        const scale = Math.min(1, RECEIPT_MAX_EDGE / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        let out = canvas.toDataURL('image/jpeg', RECEIPT_QUALITY);
        /* If it is still too big, step the quality down rather than refusing. */
        let q = RECEIPT_QUALITY;
        while (out.length > RECEIPT_MAX_CHARS && q > 0.3) {
          q -= 0.12;
          out = canvas.toDataURL('image/jpeg', q);
        }
        storeReceipt(out, file.name);
      };
      img.onerror = function () { setReceiptStatus('That image could not be read.', 'error'); };
      img.src = String(reader.result);
    };
    reader.onerror = function () { setReceiptStatus('Could not read that file.', 'error'); };
    reader.readAsDataURL(file);
  }