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
