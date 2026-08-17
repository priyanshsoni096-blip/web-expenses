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
    Plotly.newPlot(el, [{
      type: 'pie', hole: 0.62, labels: labels, values: values,
      sort: false, direction: 'clockwise', textinfo: 'none',
      marker: { colors: colors, line: { color: '#12161F', width: 2 } },
      hovertemplate: '%{label}: ₹%{value:,.0f}<extra></extra>',
    }], baseLayout({
      showlegend: true,
      legend: { orientation: 'v', x: 1, xanchor: 'left', y: 0.5, yanchor: 'middle',
                font: { size: 11, color: THEME.text } },
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
    updateCounter();
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
        setVoiceStatus('Got it. Press Parse to review.', 'live');
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
  
  document.addEventListener('DOMContentLoaded', function () {
    initCharts();
    initCounter();
    initVoice();
  });