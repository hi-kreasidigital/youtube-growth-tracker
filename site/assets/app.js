(() => {
  'use strict';

  // ---------- helpers ----------
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
  const nf = new Intl.NumberFormat('en');
  const fInt = (v) => (v == null ? '—' : nf.format(Math.round(v)));
  const fPct = (v) => (v == null ? '—' : (v * 100).toFixed(1) + '%');
  const fHrs = (v) => (v == null ? '—' : new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(v));
  const fDur = (s) => (s == null ? '—' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
  const fDate = (s) => (s ? new Date(s + 'T00:00:00Z').toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—');
  const fMonth = (s) => (s ? new Date(s.slice(0, 7) + '-01T00:00:00Z').toLocaleDateString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
  const fSigned = (v) => (v == null ? '—' : (v > 0 ? '+' : '') + nf.format(v));
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const shortTitle = (t, n = 34) => (t && t.length > n ? t.slice(0, n - 1) + '…' : t || '');

  const CATS = ['All', 'Long-form', 'Shorts', 'Podcast'];
  const GROUPS = ['Traffic sources', 'External sites', 'Search terms', 'Viewer type', 'Subscriber watch time', 'Device (watch time)', 'Top geographies', 'Subtitles / CC', 'Age', 'Gender', 'Top content'];
  const METRICS = [
    { key: 'views', label: 'Views', fmt: fInt },
    { key: 'watch_hours', label: 'Watch hours', fmt: fHrs },
    { key: 'impressions', label: 'Impressions', fmt: fInt },
    { key: 'ctr', label: 'Click-through rate', fmt: fPct, pct: true },
    { key: 'avg_view_s', label: 'Avg view duration', fmt: fDur },
    { key: 'avg_pct_viewed', label: 'Avg % viewed', fmt: fPct, pct: true },
    { key: 'retention_30s', label: 'Still watching at 0:30', fmt: fPct, pct: true },
    { key: 'engaged_views', label: 'Engaged views', fmt: fInt },
    { key: 'unique_viewers', label: 'Unique viewers', fmt: fInt },
    { key: 'subscribers', label: 'Subscribers gained', fmt: fSigned },
    { key: 'likes_pct', label: 'Likes %', fmt: fPct, pct: true },
    { key: 'endscreen_ctr', label: 'End-screen click rate', fmt: fPct, pct: true },
  ];
  const NUMERIC = ['shorts_viewed_pct', 'length_s', 'hype_points', 'likes_channel_avg', 'endscreen_channel_avg', 'impr_engaged_views', 'impr_avg_view_s', 'impr_watch_hours', 'impr_from_recs', ...METRICS.map((m) => m.key)];

  const state = { tab: 'channel', cat: 'All', video: null, cmpCat: 'All', metric: 'views', sort: { key: 'published', dir: -1 }, month: null };
  let DATA = { videos: [], breakdowns: [], channel: [] };
  const charts = {};

  // ---------- load ----------
  fetch('data/data.json', { cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => {
      d.videos = (d.videos || []).map((v) => { const o = { ...v }; NUMERIC.forEach((k) => { o[k] = num(o[k]); }); return o; })
        .sort((a, b) => String(b.published).localeCompare(String(a.published)));
      d.breakdowns = (d.breakdowns || []).map((b) => ({ ...b, share: num(b.share), rank: num(b.rank) ?? 99, scope: b.scope || 'Video' }));
      const TEXT = ['label', 'snapshot_date', 'period', 'period_start', 'notes'];
      d.channel = (d.channel || []).filter((c) => c.snapshot_date).map((c) => { const o = { ...c }; Object.keys(o).forEach((k) => { if (!TEXT.includes(k)) o[k] = num(o[k]); }); return o; })
        .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
      DATA = d;
      $('#sample-banner').hidden = !d.sample;
      $('#updated').textContent = d.generated_at ? 'Updated ' + new Date(d.generated_at).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' }) : '';
      const hash = location.hash.slice(1);
      if (['video', 'compare', 'channel'].includes(hash)) state.tab = hash;
      init();
    })
    .catch((e) => { const h = document.querySelector('h1'); if (h) h.insertAdjacentText('afterend', ' Could not load data (' + e.message + ').'); });

  // ---------- chart defaults ----------
  function chartDefaults() {
    if (!window.Chart) return;
    Chart.defaults.font.family = css('--font-body');
    Chart.defaults.font.size = 13;
    Chart.defaults.color = css('--muted');
    Chart.defaults.borderColor = css('--line');
    Chart.defaults.plugins.legend.labels.boxWidth = 10;
    Chart.defaults.maintainAspectRatio = false;
  }
  const palette = () => ['--ocean', '--navy', '--ocean-soft', '--red'].map(css);
  const catColors = () => { const [o, n, s] = palette(); return { 'Long-form': o, Shorts: n, Podcast: s }; };
  function makeChart(id, config) {
    if (!window.Chart) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), config);
  }

  // ---------- tabs ----------
  function showTab(t) {
    state.tab = t;
    document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    ['video', 'compare', 'channel'].forEach((p) => { $('#page-' + p).hidden = p !== t; });
    history.replaceState(null, '', '#' + t);
    if (t === 'video') renderVideo();
    if (t === 'compare') renderCompare();
    if (t === 'channel') renderChannel();
  }

  function chips(box, current, onPick) {
    box.replaceChildren(...CATS.map((c) => {
      const n = c === 'All' ? DATA.videos.length : DATA.videos.filter((v) => v.category === c).length;
      const b = el('button', 'chip', `${c} (${n})`);
      b.setAttribute('aria-pressed', String(c === current));
      b.addEventListener('click', () => onPick(c));
      return b;
    }));
  }

  function barRow(label, share, alt) {
    const r = el('div', 'bar');
    const l = el('span', 'lbl', label); l.title = label;
    const t = el('div', 'track'); const f = el('div', 'fill' + (alt ? ' alt' : ''));
    f.style.width = Math.max(0, Math.min(1, share || 0)) * 100 + '%'; t.appendChild(f);
    r.append(l, t, el('span', 'pct', fPct(share)));
    return r;
  }

  function breakdownCards(box, rows) {
    const groups = GROUPS.filter((g) => rows.some((r) => r.group === g));
    if (!groups.length) { box.replaceChildren(el('div', 'card muted', 'No breakdowns recorded.')); return; }
    box.replaceChildren(...groups.map((g) => {
      const c = el('div', 'card'); c.appendChild(el('h3', null, g));
      const bars = el('div', 'bars');
      rows.filter((r) => r.group === g).sort((a, b) => a.rank - b.rank).forEach((r) => bars.appendChild(barRow(r.label, r.share)));
      c.appendChild(bars); return c;
    }));
  }

  // ---------- init ----------
  function init() {
    chartDefaults();
    document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    $('#video-select').addEventListener('change', (e) => { state.video = e.target.value; renderVideo(); });
    const ms = $('#cmp-metric');
    METRICS.forEach((m) => ms.appendChild(new Option(m.label, m.key)));
    ms.value = state.metric;
    ms.addEventListener('change', () => { state.metric = ms.value; renderCompare(); });
    const latest = DATA.videos[0];
    showTab(state.tab);
  }

  // ---------- VIDEO ----------
  function renderVideo() {
    chips($('#cat-chips'), state.cat, (c) => { state.cat = c; state.video = null; renderVideo(); });
    const list = state.cat === 'All' ? DATA.videos : DATA.videos.filter((v) => v.category === state.cat);
    const cur = list.find((v) => v.video_id === state.video) || list[0];
    const sel = $('#video-select');
    sel.replaceChildren(...list.map((v) => new Option(`${fDate(v.published)} · ${shortTitle(v.title, 60)}`, v.video_id)));
    sel.disabled = !list.length;
    if (!cur) {
      $('#v-cat').textContent = state.cat; $('#v-title').textContent = `No ${state.cat.toLowerCase()} videos recorded yet`;
      $('#v-dates').textContent = ''; $('#v-notes').textContent = '';
      ['#kpis', '#funnel', '#bench', '#breakdowns'].forEach((s) => $(s).replaceChildren());
      return;
    }
    state.video = cur.video_id; sel.value = cur.video_id;
    $('#v-cat').textContent = cur.category || '—'; $('#v-cat').className = 'badge ' + (cur.category || '');
    $('#v-dates').textContent = `Published ${fDate(cur.published)} · snapshot ${fDate(cur.snapshot)} · since published`;
    const t = $('#v-title'); t.replaceChildren();
    if (cur.url) { const a = el('a', null, cur.title); a.href = cur.url; a.target = '_blank'; a.rel = 'noopener'; a.style.color = 'inherit'; t.appendChild(a); } else t.textContent = cur.title;
    $('#v-notes').textContent = cur.notes || '';

    // KPIs with delta vs category average (other videos)
    const peers = DATA.videos.filter((v) => v.category === cur.category && v.video_id !== cur.video_id);
    const kpiDefs = ['views', 'watch_hours', 'impressions', 'ctr', 'avg_view_s', 'avg_pct_viewed', 'unique_viewers', 'subscribers'].map((k) => METRICS.find((m) => m.key === k));
    $('#kpis').replaceChildren(...kpiDefs.map((m) => {
      const k = el('div', 'kpi');
      k.append(el('div', 'muted', m.label), el('div', 'v', m.fmt(cur[m.key])));
      const pv = peers.map((p) => p[m.key]).filter((x) => x != null);
      if (pv.length && cur[m.key] != null) {
        const a = avg(pv); const diff = a ? (cur[m.key] - a) / Math.abs(a) : null;
        if (diff != null && Number.isFinite(diff)) {
          k.appendChild(el('div', 'd ' + (diff >= 0 ? 'good' : 'bad'), `${diff >= 0 ? '+' : ''}${(diff * 100).toFixed(0)}% vs ${cur.category} avg`));
        }
      }
      return k;
    }));

    // funnel
    const f = $('#funnel'); f.replaceChildren();
    if (cur.impressions) {
      const clicks = cur.ctr != null ? cur.impressions * cur.ctr : null;
      [['Thumbnail impressions', cur.impressions, fInt(cur.impressions)],
        [`Views from impressions (${fPct(cur.ctr)} CTR)`, clicks, clicks == null ? '—' : '≈ ' + fInt(clicks)],
        ['Engaged views from impressions', cur.impr_engaged_views, fInt(cur.impr_engaged_views)]].forEach(([lab, v, txt], i) => {
        const s = el('div', 'fstep'); const top = el('div', 'top'); top.append(el('span', null, lab), el('span', null, txt));
        const b = el('div', 'fbar' + (i === 0 ? ' first' : '')); b.style.width = ((v || 0) / cur.impressions) * 100 + '%';
        s.append(top, b); f.appendChild(s);
      });
      f.appendChild(el('div', 'muted', `${fDur(cur.impr_avg_view_s)} average view from impressions · ${fHrs(cur.impr_watch_hours)} watch hours · ${fPct(cur.impr_from_recs)} of impressions from YouTube recommending you`));
    } else f.appendChild(el('div', 'muted', 'No impression data recorded.'));

    // benchmarks
    const bench = $('#bench'); bench.replaceChildren();
    [['Likes (vs. dislikes)', cur.likes_pct, cur.likes_channel_avg], ['End-screen click rate', cur.endscreen_ctr, cur.endscreen_channel_avg]].forEach(([name, v, a]) => {
      if (v == null) return;
      const max = Math.max(v, a || 0, 1e-4);
      const head = el('div', 'muted', name);
      if (a != null) { const d = (v - a) * 100; head.append(' · ', el('span', d >= 0 ? 'good' : 'bad', `${d >= 0 ? '+' : ''}${d.toFixed(1)} pts vs channel`)); }
      const b1 = barRow('This video', v); b1.querySelector('.fill').style.width = (v / max) * 100 + '%';
      bench.append(head, b1);
      if (a != null) { const b2 = barRow('Channel average', a, true); b2.querySelector('.fill').style.width = (a / max) * 100 + '%'; bench.appendChild(b2); }
    });
    if (cur.retention_30s != null) bench.appendChild(el('div', 'muted', `${fPct(cur.retention_30s)} of viewers are still watching at 0:30.`));

    breakdownCards($('#breakdowns'), DATA.breakdowns.filter((b) => b.scope === 'Video' && b.video_id === cur.video_id));
  }

  // ---------- COMPARE ----------
  function renderCompare() {
    chips($('#cmp-chips'), state.cmpCat, (c) => { state.cmpCat = c; renderCompare(); });
    const m = METRICS.find((x) => x.key === state.metric);
    const list = (state.cmpCat === 'All' ? DATA.videos : DATA.videos.filter((v) => v.category === state.cmpCat))
      .filter((v) => v[m.key] != null).slice().sort((a, b) => String(a.published).localeCompare(String(b.published)));
    const [c1] = palette();
    const catColor = catColors();
    const a = avg(list.map((v) => v[m.key]));
    $('#cmp-title').textContent = `${m.label} — ${state.cmpCat === 'All' ? 'all videos' : state.cmpCat} side by side`;
    $('#cmp-note').textContent = list.length ? `${list.length} video${list.length > 1 ? 's' : ''}, oldest at top · average ${m.fmt(a)} (dashed line) · bar colour = format` : 'No videos with this metric yet.';
    const box = document.getElementById('cmp-chart').parentElement;
    box.style.height = Math.max(220, list.length * 46 + 70) + 'px';
    const narrow = window.innerWidth < 640;
    makeChart('cmp-chart', {
      type: 'bar',
      data: {
        labels: list.map((v) => [shortTitle(v.title, narrow ? 22 : 40), fDate(v.published)]),
        datasets: [{ label: m.label, data: list.map((v) => (m.pct ? v[m.key] * 100 : v[m.key])), backgroundColor: list.map((v) => catColor[v.category] || c1), borderRadius: 6, maxBarThickness: 30 }],
      },
      options: {
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { title: (it) => list[it[0].dataIndex].title, label: (it) => `${m.label}: ${m.fmt(m.pct ? it.raw / 100 : it.raw)} (${list[it.dataIndex].category})` } },
          avgLine: { value: a == null ? null : (m.pct ? a * 100 : a) },
        },
        scales: { x: { beginAtZero: true, ticks: { callback: (v) => (m.pct ? v + '%' : m.key === 'avg_view_s' ? fDur(v) : nf.format(v)) } }, y: { ticks: { font: { size: 11 } } } },
        onClick: (e, els) => { if (els.length) { state.video = list[els[0].index].video_id; state.cat = 'All'; showTab('video'); } },
      },
      plugins: [{
        id: 'avgLine',
        afterDatasetsDraw(chart, args, opts) {
          if (opts.value == null) return;
          const x = chart.scales.x.getPixelForValue(opts.value); const { top, bottom } = chart.chartArea; const ctx = chart.ctx;
          ctx.save(); ctx.strokeStyle = css('--muted'); ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); ctx.restore();
        },
      }],
    });

    const pts = DATA.videos.filter((v) => (state.cmpCat === 'All' || v.category === state.cmpCat) && v.ctr != null && v.avg_pct_viewed != null);
    makeChart('scatter-chart', {
      type: 'scatter',
      data: { datasets: ['Long-form', 'Shorts', 'Podcast'].map((cat) => ({ label: cat, data: pts.filter((v) => v.category === cat).map((v) => ({ x: v.ctr * 100, y: v.avg_pct_viewed * 100, t: v.title })), backgroundColor: catColor[cat], pointRadius: 6, pointHoverRadius: 8 })).filter((d) => d.data.length) },
      options: {
        plugins: { tooltip: { callbacks: { label: (it) => `${shortTitle(it.raw.t, 40)} — CTR ${it.raw.x.toFixed(1)}%, viewed ${it.raw.y.toFixed(1)}%` } } },
        scales: { x: { title: { display: true, text: 'Click-through rate' }, beginAtZero: true, ticks: { callback: (v) => v + '%' } }, y: { title: { display: true, text: 'Avg % viewed' }, beginAtZero: true, ticks: { callback: (v) => v + '%' } } },
      },
    });

    // format averages
    const cols = ['views', 'watch_hours', 'ctr', 'avg_pct_viewed', 'subscribers'].map((k) => METRICS.find((x) => x.key === k));
    const ft = $('#fmt-table');
    const hr = el('tr'); hr.append(el('th', null, 'Format'), el('th', 'num', 'Videos'), ...cols.map((c) => el('th', 'num', c.label)));
    ft.tHead.replaceChildren(hr);
    ft.tBodies[0].replaceChildren(...['Long-form', 'Shorts', 'Podcast'].map((cat) => {
      const vs = DATA.videos.filter((v) => v.category === cat);
      const tr = el('tr'); tr.append(el('td', null, cat), el('td', 'num', String(vs.length)));
      cols.forEach((c) => tr.appendChild(el('td', 'num', vs.length ? c.fmt(avg(vs.map((v) => v[c.key]).filter((x) => x != null))) : '—')));
      return tr;
    }));

    renderAllTable();
  }

  function renderAllTable() {
    const cols = [
      { key: 'title', label: 'Video', cls: 't', fmt: (v) => v },
      { key: 'category', label: 'Format', cls: 'hide-sm', fmt: (v) => v || '—' },
      { key: 'published', label: 'Published', cls: 'hide-sm', fmt: fDate },
      ...['views', 'watch_hours', 'ctr', 'avg_view_s', 'avg_pct_viewed', 'subscribers'].map((k) => { const m = METRICS.find((x) => x.key === k); return { key: k, label: m.label, cls: 'num', fmt: m.fmt }; }),
    ];
    const t = $('#all-table');
    const hr = el('tr');
    cols.forEach((c) => {
      const th = el('th', c.cls, c.label);
      if (state.sort.key === c.key) th.setAttribute('aria-sort', state.sort.dir > 0 ? 'ascending' : 'descending');
      th.addEventListener('click', () => { state.sort = { key: c.key, dir: state.sort.key === c.key ? -state.sort.dir : -1 }; renderAllTable(); });
      hr.appendChild(th);
    });
    t.tHead.replaceChildren(hr);
    const rows = DATA.videos.slice().sort((a, b) => {
      const x = a[state.sort.key], y = b[state.sort.key];
      if (x == null) return 1; if (y == null) return -1;
      return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * state.sort.dir;
    });
    t.tBodies[0].replaceChildren(...rows.map((v) => {
      const tr = el('tr', 'click');
      cols.forEach((c) => tr.appendChild(el('td', c.cls, c.fmt(v[c.key]))));
      tr.addEventListener('click', () => { state.video = v.video_id; state.cat = 'All'; showTab('video'); });
      return tr;
    }));
  }

  // ---------- CHANNEL & YPP ----------
  // YouTube Partner Program thresholds (check Studio > Earn for your channel's exact status).
  const YPP = {
    hours: [{ at: 3000, label: 'Fan funding' }, { at: 4000, label: 'Ad revenue' }],
    subs: [{ at: 500, label: 'Fan funding' }, { at: 1000, label: 'Ad revenue' }],
    shorts: [{ at: 3e6, label: 'Fan funding' }, { at: 10e6, label: 'Ad revenue' }],
  };
  const fCompact = (v) => (v == null ? '—' : new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v));
  const fChange = (v) => (v == null ? null : `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`);
  const snaps = (period) => DATA.channel.filter((c) => c.period === period);
  function latestSnap(period) { const s = snaps(period); return s[s.length - 1] || null; }
  const latestTotalSubs = () => { const s = DATA.channel.filter((c) => c.subs_total != null); return s[s.length - 1] || null; };

  function route(title, value, fmt, stops, note, missing) {
    const card = el('div', 'card route');
    const head = el('div', 'route-head');
    head.appendChild(el('h3', null, title));
    card.appendChild(head);
    if (value == null) { card.appendChild(el('div', 'route-missing', missing)); return card; }
    const goal = stops[stops.length - 1].at;
    const val = el('div', 'route-val', fmt(value)); val.appendChild(el('small', null, ` / ${fmt(goal)}`));
    card.appendChild(val);
    const tw = el('div', 'track-wrap');
    tw.appendChild(el('div', 'track-line'));
    const done = el('div', 'track-done'); done.style.width = Math.min(100, (value / goal) * 100) + '%'; tw.appendChild(done);
    [{ at: 0, label: 'Start' }, ...stops].forEach((s, i, arr) => {
      const w = el('div', 'waypoint' + (value >= s.at && s.at > 0 ? ' reached' : '') + (i === arr.length - 1 ? ' goal last' : '') + (i === 0 ? ' first' : ''));
      w.style.left = (s.at / goal) * 100 + '%';
      w.appendChild(el('span', 'dot'));
      if (i === arr.length - 1) { const f = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); f.setAttribute('viewBox', '0 0 14 16'); const u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#flag'); f.appendChild(u); w.appendChild(f); }
      w.appendChild(el('span', null, i === 0 ? '0' : fCompact(s.at)));
      tw.appendChild(w);
    });
    card.appendChild(tw);
    card.appendChild(el('div', 'route-legend', stops.map((st) => `${fCompact(st.at)} = ${st.label.toLowerCase()}`).join(' · ')));
    const next = stops.find((s) => value < s.at);
    card.appendChild(el('div', 'route-note', next ? `${fmt(next.at - value)} to go for ${next.label.toLowerCase()} (${value / next.at > 0 && value / next.at < 0.001 ? '<0.1%' : fPct(value / next.at)} of the way). ${note || ''}` : `Threshold reached. ${note || ''}`));
    return card;
  }

  function renderChannel() {
    const ch = DATA.channel;
    $('#channel-empty').hidden = ch.length > 0;
    $('#channel-body').hidden = ch.length === 0;
    if (!ch.length) return;
    const [ocean, navy, soft, red] = palette();
    const y = latestSnap('Last 365 days');
        const subsSnap = latestTotalSubs();

    // --- YPP routes
    const since = new Date(); since.setUTCDate(since.getUTCDate() - 90);
    const uploads90 = DATA.videos.filter((v) => v.published && new Date(v.published) >= since).length;
    $('#ypp-sub').textContent = `As of ${fDate((y || ch[ch.length - 1]).snapshot_date)}. Fan funding also needs 3 public uploads in the last 90 days — ${uploads90} tracked here so far. Either watch hours or Shorts views qualifies, not both.`;
    const latestWith = (k) => { const r = DATA.channel.filter((c) => c[k] != null); return r[r.length - 1] || null; };
    const qh = latestWith('ypp_watch_hours');
    const qs = latestWith('ypp_shorts_views');
    $('#ypp-routes').replaceChildren(
      route('Qualified watch hours · past 365 days', qh ? qh.ypp_watch_hours : null, (v) => fInt(v), YPP.hours,
        `Studio › Earn count, as of ${qh ? fDate(qh.snapshot_date) : '—'}.${y ? ` Total watch hours incl. Shorts/private: ${fHrs(y.watch_hours)}.` : ''}`,
        'Add “YPP qualified watch hours (365d)” from Studio › Earn to the latest snapshot in Airtable.'),
      route('Subscribers · total', subsSnap ? subsSnap.subs_total : null, (v) => fInt(v), YPP.subs,
        y ? `${fSigned(y.subs_gained)} in the past 12 months.` : '',
        'Add “Total subscribers” (Studio › Dashboard) to the latest snapshot in Airtable.'),
      route('Qualified Shorts views · past 90 days', qs ? qs.ypp_shorts_views : null, (v) => fInt(v), YPP.shorts,
        `Studio › Earn count, as of ${qs ? fDate(qs.snapshot_date) : '—'}.`,
        'Add “YPP qualified Shorts views (90d)” from Studio › Earn to the latest snapshot in Airtable.'),
    );

    // --- latest snapshot KPIs
    const s = y || ch[ch.length - 1];
    $('#snap-title').textContent = `${s.period || 'Snapshot'} · ${s.period_start ? fDate(s.period_start) + ' – ' : ''}${fDate(s.snapshot_date)}`;
    const kd = [
      ['Views', s.views, fInt, s.views_change], ['Watch hours', s.watch_hours, fHrs, s.watch_hours_change],
      ['Subscribers gained', s.subs_gained, fSigned, s.subs_change], ['Total subscribers', s.subs_total, fInt, null],
    ];
    $('#ch-kpis').replaceChildren(...kd.map(([label, v, fmt, chg]) => {
      const k = el('div', 'kpi'); k.append(el('div', 'muted', label), el('div', 'v', fmt(v)));
      if (chg != null) k.appendChild(el('div', 'd ' + (chg >= 0 ? 'up' : 'down'), `${fChange(chg)} vs previous period`));
      else if (v == null) k.appendChild(el('div', 'd muted', 'Not recorded'));
      return k;
    }));

    // --- growth charts (Last 365 days snapshots). Studio's "% vs previous period" gives one extra, derived point a year earlier.
    const ys = snaps('Last 365 days');
    const prevDate = (d) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCFullYear(t.getUTCFullYear() - 1); return t.toISOString().slice(0, 10); };
    const first = ys[0];
    const derived = (key, chgKey) => (first && first[key] != null && first[chgKey] != null && first[chgKey] > -1 ? first[key] / (1 + first[chgKey]) : null);
    const dHours = derived('watch_hours', 'watch_hours_change');
    const labels = [...(first && dHours != null ? [fDate(prevDate(first.snapshot_date)) + '*'] : []), ...ys.map((c) => fDate(c.snapshot_date))];
    const withPrev = (vals, prev) => (labels.length > ys.length ? [prev, ...vals] : vals);
    $('#growth-note').textContent = (ys.length < 2 ? 'One snapshot so far — a new point is added every month. ' : '') +
      (labels.length > ys.length ? '* Estimated from Studio’s “vs previous 365 days” change.' : '');
    const pointStyle = (n) => labels.map((_, i) => (labels.length > ys.length && i === 0 ? 'rectRot' : 'circle')).slice(0, n);
    const ref = (value, text) => ({ id: 'ref' + text, afterDatasetsDraw(c) { const sc = c.scales.y; if (value > sc.max) return; const yy = sc.getPixelForValue(value); const { left, right } = c.chartArea; const x = c.ctx; x.save(); x.strokeStyle = red; x.setLineDash([6, 4]); x.beginPath(); x.moveTo(left, yy); x.lineTo(right, yy); x.stroke(); x.fillStyle = red; x.font = '600 12px ' + css('--font-body'); x.fillText(text, left + 6, yy - 6); x.restore(); } });

    makeChart('ch-hours', {
      type: 'line',
      data: { labels, datasets: [{ type: 'line', label: 'Qualified for YPP', data: withPrev(ys.map((c) => c.ypp_watch_hours), null), borderColor: navy, backgroundColor: navy, borderWidth: 2.5, pointRadius: 6, spanGaps: true }, { label: 'All watch hours', data: withPrev(ys.map((c) => c.watch_hours), dHours), borderColor: ocean, backgroundColor: ocean, borderWidth: 2.5, pointRadius: 6, pointStyle: pointStyle(labels.length), tension: 0, segment: { borderDash: (ctx) => (labels.length > ys.length && ctx.p0DataIndex === 0 ? [5, 5] : undefined) } }] },
      options: { plugins: { legend: { display: true }, tooltip: { callbacks: { label: (it) => `${it.dataset.label}: ${fHrs(it.raw)} hours` } } }, scales: { y: { beginAtZero: true, ticks: { callback: (v) => nf.format(v) } } } },
    });
    // subscriber growth: one point per data entry that has a total
    const ss = DATA.channel.filter((c) => c.subs_total != null);
    makeChart('ch-subs', {
      data: { labels: ss.map((c) => fDate(c.snapshot_date)), datasets: [
        { type: 'line', label: 'Total subscribers', data: ss.map((c) => c.subs_total), borderColor: ocean, backgroundColor: ocean, borderWidth: 2.5, pointRadius: 6, tension: 0, yAxisID: 'y', order: 1 },
        { type: 'bar', label: 'Change since previous entry', data: ss.map((c, i) => (i ? c.subs_total - ss[i - 1].subs_total : null)), backgroundColor: ss.map((c, i) => (i && c.subs_total < ss[i - 1].subs_total ? red : soft)), borderRadius: 6, maxBarThickness: 44, yAxisID: 'y1', order: 2 },
      ] },
      options: {
        plugins: { tooltip: { callbacks: { label: (it) => (it.dataset.yAxisID === 'y1' ? `Change: ${fSigned(it.raw)}` : `Total: ${fInt(it.raw)}`) } } },
        scales: {
          y: { position: 'left', grace: '25%', title: { display: true, text: 'Total' }, ticks: { precision: 0 } },
          y1: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Change' }, ticks: { precision: 0 } },
        },
      },
    });

    // --- calendar months
    const ms = snaps('Calendar month');
    $('#monthly-card').hidden = ms.length === 0;
    if (ms.length) {
      makeChart('ch-monthly', {
        data: { labels: ms.map((c) => fMonth(c.snapshot_date)), datasets: [
          { type: 'bar', label: 'Views', data: ms.map((c) => c.views), backgroundColor: ocean, borderRadius: 6, maxBarThickness: 40, yAxisID: 'y' },
          { type: 'line', label: 'Watch hours', data: ms.map((c) => c.watch_hours), borderColor: navy, backgroundColor: navy, borderWidth: 2.5, pointRadius: 4, yAxisID: 'y1' },
        ] },
        options: { scales: { y: { beginAtZero: true }, y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false } } } },
      });
    }

    // --- format split
    const fs = $('#fmt-split'); fs.replaceChildren();
    if (y) {
      const tot = (y.videos_views || 0) + (y.shorts_views || 0) + (y.podcast_views || 0);
      const split = el('div', 'card navy');
      split.append(el('h3', null, 'Share of views'), el('div', 'muted', 'Past 12 months'));
      const bars = el('div', 'bars');
      [['Shorts', y.shorts_views], ['Long-form', y.videos_views], ['Podcast', y.podcast_views]].filter(([, v]) => v != null).forEach(([l, v]) => {
        const r = barRow(l, tot ? v / tot : 0); r.querySelector('.track').style.background = 'rgba(255,255,255,.18)'; r.querySelector('.fill').style.background = l === 'Shorts' ? '#FFFFFF' : ocean; bars.appendChild(r);
      });
      split.appendChild(bars);
      split.appendChild(el('div', 'muted', 'Shorts bring most views; YPP watch hours come only from long-form, so long-form is the lever for the 4,000-hour route.'));
      const card = (title, rows) => {
        const c = el('div', 'card mist'); c.appendChild(el('h3', null, title));
        const t = el('div', 'kpis two');
        rows.forEach(([label, v, fmt, chg]) => { const k = el('div', 'kpi'); k.style.background = '#fff'; k.append(el('div', 'muted', label), el('div', 'v', fmt(v))); if (chg != null) k.appendChild(el('div', 'd ' + (chg >= 0 ? 'up' : 'down'), fChange(chg))); t.appendChild(k); });
        c.appendChild(t); return c;
      };
      fs.append(split,
        card('Long-form videos', [['Views', y.videos_views, fCompact], ['Impressions', y.videos_impressions, fCompact, y.videos_impressions_change], ['Click-through', y.videos_ctr, fPct], ['Avg view', y.videos_avg_view_s, fDur]]),
        card('Shorts', [['Views', y.shorts_views, fCompact], ['Engaged views', y.shorts_engaged_views, fCompact, y.shorts_engaged_change], ['Likes', y.shorts_likes, fInt, y.shorts_likes_change], ['Subscribers', y.shorts_subs, fSigned, y.shorts_subs_change]]));
    }

    // --- channel breakdowns for the latest snapshot date
    const bd = DATA.breakdowns.filter((b) => b.scope === 'Channel' && s && String(b.snapshot_date || '') === s.snapshot_date);
    $('#ch-bd-section').hidden = bd.length === 0;
    if (bd.length) breakdownCards($('#ch-breakdowns'), bd);

    // --- snapshot table
    const t = $('#snap-table');
    const cols = [['Snapshot', (c) => fDate(c.snapshot_date)], ['Period', (c) => c.period || '—'], ['Views', (c) => fInt(c.views), 1], ['Watch hours', (c) => fHrs(c.watch_hours), 1], ['Subs gained', (c) => fSigned(c.subs_gained), 1], ['Total subs', (c) => fInt(c.subs_total), 1], ['YPP watch hrs', (c) => fHrs(c.ypp_watch_hours), 1], ['YPP Shorts (90d)', (c) => fInt(c.ypp_shorts_views), 1], ['Long-form views', (c) => fInt(c.videos_views), 1], ['Shorts views', (c) => fInt(c.shorts_views), 1]];
    const hr = el('tr'); cols.forEach(([h, , n]) => hr.appendChild(el('th', n ? 'num' : null, h))); t.tHead.replaceChildren(hr);
    t.tBodies[0].replaceChildren(...ch.slice().reverse().map((c) => { const tr = el('tr'); cols.forEach(([, f, n]) => tr.appendChild(el('td', n ? 'num' : null, f(c)))); return tr; }));
    renderChecks();
  }

  // ---------- MONTHLY CHECKS ----------
  // Targets from the Tara x Mattel goals: CTR ≥ 5%, avg % viewed ≥ 30%, Shorts viewed ≥ 50%,
  // and monthly output of 4 long-form + 4 Shorts + 1 podcast. Months come from each video's publish date.
  const CHECKS = { ctr: 0.05, avd: 0.30, shortsViewed: 0.50, cadence: { 'Long-form': 4, Shorts: 4, Podcast: 1 } };
  const OK = '✅', WARN = '⚠️';

  function monthlyChecks() {
    const byMonth = {};
    DATA.videos.forEach((v) => { if (v.published) (byMonth[v.published.slice(0, 7)] ||= []).push(v); });
    const keys = Object.keys(byMonth).sort();
    if (!keys.length) return [];
    // every month from the first tracked upload to this month, so a month with no uploads still shows up
    const months = [];
    const now = new Date(); const end = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    for (let [y, m] = keys[0].split('-').map(Number); ; m++) {
      if (m > 12) { m = 1; y++; }
      const k = `${y}-${String(m).padStart(2, '0')}`; months.push(k);
      if (k >= end || months.length > 120) break;
    }
    return months.reverse().map((k) => {
      const vs = byMonth[k] || [];
      const lf = vs.filter((v) => v.category === 'Long-form');
      const sh = vs.filter((v) => v.category === 'Shorts');
      const counts = { 'Long-form': lf.length, Shorts: sh.length, Podcast: vs.filter((v) => v.category === 'Podcast').length };
      // CTR weighted by impressions where known, otherwise a plain average
      const withImp = lf.filter((v) => v.ctr != null && v.impressions);
      const ctrList = lf.map((v) => v.ctr).filter((x) => x != null);
      const ctr = withImp.length ? withImp.reduce((s, v) => s + v.ctr * v.impressions, 0) / withImp.reduce((s, v) => s + v.impressions, 0) : avg(ctrList);
      const avd = avg(lf.map((v) => v.avg_pct_viewed).filter((x) => x != null));
      const sv = avg(sh.map((v) => v.shorts_viewed_pct).filter((x) => x != null));
      const cadenceMet = Object.entries(CHECKS.cadence).every(([c, n]) => counts[c] >= n);
      return { month: k, inProgress: k === end, counts, ctr, avd, sv, cadenceMet };
    });
  }

  function renderChecks() {
    let sec = document.getElementById('monthly-checks');
    if (!sec) {
      sec = el('div', 'section'); sec.id = 'monthly-checks';
      sec.innerHTML = '<div class="eyebrow"><svg><use href="#waves"/></svg>Monthly checks</div><h2>Did each month hit the targets?</h2>' +
        '<div class="muted">CTR 5%+ and average view duration 30%+ (long-form) · Shorts viewed 50%+ · cadence 4 long-form, 4 Shorts, 1 podcast. Each month counts the videos published in it.</div>' +
        '<div class="card"><div class="tablebox"><table id="checks-table"><thead></thead><tbody></tbody></table></div></div>';
      const body = document.getElementById('channel-body');
      const snapCard = document.getElementById('snap-table')?.closest('.card');
      body.insertBefore(sec, snapCard || null);
    }
    const rows = monthlyChecks();
    const t = document.getElementById('checks-table');
    const hr = el('tr');
    ['Month', 'Long-form · Shorts · Podcast', 'CTR', 'Avg view duration', 'Shorts viewed', 'Cadence'].forEach((h, i) => hr.appendChild(el('th', i > 1 ? 'num' : null, h)));
    t.tHead.replaceChildren(hr);
    if (!rows.length) { const tr = el('tr'); const td = el('td', 'muted', 'No videos tracked yet.'); td.colSpan = 6; tr.appendChild(td); t.tBodies[0].replaceChildren(tr); return; }
    const mark = (v, target) => (v == null ? '— no data' : `${v >= target ? OK : WARN} ${fPct(v)}`);
    t.tBodies[0].replaceChildren(...rows.map((r) => {
      const tr = el('tr');
      const mTd = el('td', null, fMonth(r.month + '-01')); if (r.inProgress) mTd.appendChild(el('span', 'muted', ' · in progress'));
      tr.appendChild(mTd);
      tr.appendChild(el('td', null, `${r.counts['Long-form']}/4 · ${r.counts.Shorts}/4 · ${r.counts.Podcast}/1`));
      [[r.ctr, CHECKS.ctr], [r.avd, CHECKS.avd], [r.sv, CHECKS.shortsViewed]].forEach(([v, tg]) => {
        const td = el('td', 'num', mark(v, tg)); if (v != null && v < tg) td.style.color = css('--red'); tr.appendChild(td);
      });
      const cd = el('td', 'num', r.cadenceMet ? `${OK} Met` : `${WARN} Short`); if (!r.cadenceMet) cd.style.color = css('--red');
      tr.appendChild(cd);
      return tr;
    }));
  }

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => Object.values(charts).forEach((c) => c.resize()), 150); });
})();
