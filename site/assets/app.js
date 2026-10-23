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
  const fCompact = (v) => (v == null ? '—' : new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v));
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const firstWord = (t) => (String(t || '').trim().split(/\s+/)[0] || '—');

  const TEXT_FIELDS = ['video_id', 'title', 'category', 'published', 'traffic', 'external', 'search_terms', 'label', 'snapshot_date'];
  const toNumbers = (o) => { const r = { ...o }; Object.keys(r).forEach((k) => { if (!TEXT_FIELDS.includes(k)) r[k] = num(r[k]); }); return r; };

  let DATA = { videos: [], channel: [] };
  const charts = {};
  const state = { tab: 'channel', growth: 'subs_total' };

  // ---------- tabs ----------
  const TABS = {
    channel: () => renderChannel(),
    videos: () => renderFormat('videos', 'Long-form'),
    shorts: () => renderFormat('shorts', 'Shorts'),
    podcast: () => renderFormat('podcast', 'Podcast'),
  };

  // ---------- load ----------
  fetch('data/data.json', { cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => {
      DATA = {
        videos: (d.videos || []).map(toNumbers),
        channel: (d.channel || []).filter((c) => c.snapshot_date).map(toNumbers).sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)),
      };
      $('#sample-banner').hidden = !d.sample;
      $('#updated').textContent = d.generated_at ? 'Updated ' + new Date(d.generated_at).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' }) : '';
      const hash = location.hash.slice(1);
      if (TABS[hash]) state.tab = hash;
      init();
    })
    .catch((e) => { $('#ypp-sub').textContent = 'Could not load data (' + e.message + ').'; });

  // ---------- charts ----------
  function chartDefaults() {
    if (!window.Chart) return;
    Chart.defaults.font.family = css('--font-body');
    Chart.defaults.font.size = 13;
    Chart.defaults.color = css('--muted');
    Chart.defaults.borderColor = css('--line');
    Chart.defaults.maintainAspectRatio = false;
  }
  function makeChart(id, config) {
    if (!window.Chart) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), config);
  }
  // Simple line chart: one line with dots, dashed horizontal gridlines, no legend.
  function lineChart(id, labels, values, { fmt = fInt, tick = (v) => nf.format(v), titles = labels } = {}) {
    const ocean = css('--ocean');
    makeChart(id, {
      type: 'line',
      data: { labels, datasets: [{ data: values, borderColor: ocean, backgroundColor: ocean, borderWidth: 3, pointRadius: 5, pointHoverRadius: 7, tension: 0, spanGaps: true, borderCapStyle: 'round', borderJoinStyle: 'round' }] },
      options: {
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => titles[it[0].dataIndex], label: (it) => fmt(it.raw) } } },
        scales: {
          x: { grid: { display: false }, border: { color: css('--line') }, ticks: { maxRotation: 0, autoSkip: true } },
          y: { beginAtZero: true, grace: '10%', border: { display: false, dash: [4, 4] }, grid: { color: css('--line') }, ticks: { callback: tick, maxTicksLimit: 6 } },
        },
      },
    });
  }

  function showTab(t) {
    state.tab = t;
    document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    Object.keys(TABS).forEach((p) => { $('#page-' + p).hidden = p !== t; });
    history.replaceState(null, '', '#' + t);
    TABS[t]();
  }

  function init() {
    chartDefaults();
    document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    $('#growth-metric').addEventListener('change', (e) => { state.growth = e.target.value; renderGrowth(); });
    showTab(state.tab);
  }

  // ---------- CHANNEL & YPP ----------
  // YouTube Partner Program thresholds (check Studio › Earn for your channel's exact status).
  const YPP = {
    hours: [{ at: 3000, label: 'Fan funding' }, { at: 4000, label: 'Ad revenue' }],
    subs: [{ at: 500, label: 'Fan funding' }, { at: 1000, label: 'Ad revenue' }],
    shorts: [{ at: 3e6, label: 'Fan funding' }, { at: 10e6, label: 'Ad revenue' }],
  };
  const latestWith = (k) => { const r = DATA.channel.filter((c) => c[k] != null); return r[r.length - 1] || null; };

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
    [{ at: 0 }, ...stops].forEach((s, i, arr) => {
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
    card.appendChild(el('div', 'route-note', next ? `${fmt(next.at - value)} to go for ${next.label.toLowerCase()} (${fPct(value / next.at)} of the way). ${note || ''}` : `Threshold reached. ${note || ''}`));
    return card;
  }

  function renderChannel() {
    const qh = latestWith('ypp_watch_hours');
    const subs = latestWith('subs_total');
    const qs = latestWith('ypp_shorts_views');
    const since = new Date(); since.setUTCDate(since.getUTCDate() - 90);
    const uploads90 = DATA.videos.filter((v) => v.published && new Date(v.published) >= since).length;
    const last = DATA.channel[DATA.channel.length - 1];
    $('#ypp-sub').textContent = `${last ? `As of ${fDate(last.snapshot_date)}. ` : ''}Fan funding also needs 3 public uploads in the last 90 days — ${uploads90} tracked here. Either watch hours or Shorts views qualifies, not both.`;
    $('#ypp-routes').replaceChildren(
      route('Qualified watch hours · past 365 days', qh ? qh.ypp_watch_hours : null, fInt, YPP.hours,
        qh ? `Studio › Earn, ${fDate(qh.snapshot_date)}.` : '', 'Add “YPP qualified watch hours (365d)” to the latest Channel Snapshot in Airtable.'),
      route('Subscribers · total', subs ? subs.subs_total : null, fInt, YPP.subs,
        subs ? `As of ${fDate(subs.snapshot_date)}.` : '', 'Add “Total subscribers” to the latest Channel Snapshot in Airtable.'),
      route('Qualified Shorts views · past 90 days', qs ? qs.ypp_shorts_views : null, fInt, YPP.shorts,
        qs ? `Studio › Earn, ${fDate(qs.snapshot_date)}.` : '', 'Add “YPP qualified Shorts views (90d)” to the latest Channel Snapshot in Airtable.'),
    );
    renderGrowth();
    renderChecks();
  }

  const GROWTH = {
    subs_total: { title: 'Total subscribers', fmt: (v) => `${fInt(v)} subscribers` },
    ypp_watch_hours: { title: 'Qualified watch hours (365 days)', fmt: (v) => `${fInt(v)} hours` },
    ypp_shorts_views: { title: 'Qualified Shorts views (90 days)', fmt: (v) => `${fInt(v)} views` },
  };
  function renderGrowth() {
    const g = GROWTH[state.growth];
    const rows = DATA.channel.filter((c) => c[state.growth] != null);
    $('#growth-title').textContent = g.title;
    $('#growth-metric').value = state.growth;
    $('#growth-note').textContent = rows.length < 2
      ? 'One data entry so far — the line grows with each monthly snapshot.'
      : `${rows.length} data entries · change since the first: ${fSigned(rows[rows.length - 1][state.growth] - rows[0][state.growth])}`;
    lineChart('growth-chart', rows.map((c) => fDate(c.snapshot_date)), rows.map((c) => c[state.growth]), { fmt: g.fmt, tick: (v) => fCompact(v) });
  }

  // ---------- MONTHLY CHECKS ----------
  // CTR ≥ 5% and AVD ≥ 30% (long-form), Shorts stayed to watch ≥ 50%, output 4 long-form + 4 Shorts + 1 podcast.
  const CHECKS = { ctr: 0.05, avd: 0.30, stayed: 0.50, cadence: { 'Long-form': 4, Shorts: 4, Podcast: 1 } };
  const OK = '✅', WARN = '⚠️';

  function monthlyChecks() {
    const byMonth = {};
    DATA.videos.forEach((v) => { if (v.published) (byMonth[v.published.slice(0, 7)] ||= []).push(v); });
    const keys = Object.keys(byMonth).sort();
    if (!keys.length) return [];
    const now = new Date(); const end = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const months = [];
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
      const withImp = lf.filter((v) => v.ctr != null && v.impressions);
      const ctr = withImp.length ? withImp.reduce((s, v) => s + v.ctr * v.impressions, 0) / withImp.reduce((s, v) => s + v.impressions, 0) : avg(lf.map((v) => v.ctr).filter((x) => x != null));
      const avd = avg(lf.map((v) => v.avg_pct_viewed).filter((x) => x != null));
      let stayed = avg(sh.map((v) => v.stayed_pct).filter((x) => x != null));
      if (stayed == null) {
        const snap = DATA.channel.filter((c) => c.shorts_viewed_pct != null && String(c.snapshot_date).slice(0, 7) === k).pop();
        if (snap) stayed = snap.shorts_viewed_pct;
      }
      const cadenceMet = Object.entries(CHECKS.cadence).every(([c, n]) => counts[c] >= n);
      return { month: k, inProgress: k === end, counts, ctr, avd, stayed, cadenceMet };
    });
  }

  function renderChecks() {
    const rows = monthlyChecks();
    const t = $('#checks-table');
    const hr = el('tr');
    ['Month', 'Long-form · Shorts · Podcast', 'CTR', 'Avg view duration', 'Shorts stayed to watch', 'Cadence'].forEach((h, i) => hr.appendChild(el('th', i > 1 ? 'num' : null, h)));
    t.tHead.replaceChildren(hr);
    if (!rows.length) { const tr = el('tr'); const td = el('td', 'muted', 'No videos tracked yet.'); td.colSpan = 6; tr.appendChild(td); t.tBodies[0].replaceChildren(tr); return; }
    const red = css('--red');
    const mark = (v, target) => (v == null ? '— no data' : `${v >= target ? OK : WARN} ${fPct(v)}`);
    t.tBodies[0].replaceChildren(...rows.map((r) => {
      const tr = el('tr');
      const mTd = el('td', null, fMonth(r.month + '-01')); if (r.inProgress) mTd.appendChild(el('span', 'muted', ' · in progress'));
      tr.appendChild(mTd);
      tr.appendChild(el('td', null, `${r.counts['Long-form']}/4 · ${r.counts.Shorts}/4 · ${r.counts.Podcast}/1`));
      [[r.ctr, CHECKS.ctr], [r.avd, CHECKS.avd], [r.stayed, CHECKS.stayed]].forEach(([v, tg]) => {
        const td = el('td', 'num', mark(v, tg)); if (v != null && v < tg) td.style.color = red; tr.appendChild(td);
      });
      const cd = el('td', 'num', r.cadenceMet ? `${OK} Met` : `${WARN} Short`); if (!r.cadenceMet) cd.style.color = red;
      tr.appendChild(cd);
      return tr;
    }));
  }

  // ---------- VIDEOS / SHORTS / PODCAST ----------
  const TXT = (v) => v || '—';
  const COLS_LONG = [
    ['Video title', 'title', TXT, 't'],
    ['Published', 'published', fDate],
    ['Watch time (hours)', 'watch_hours', fHrs, 'num'],
    ['Subscribers', 'subscribers', fSigned, 'num'],
    ['AVD (%)', 'avg_pct_viewed', fPct, 'num'],
    ['AVD', 'avg_view_s', fDur, 'num'],
    ['Thumbnail impressions', 'impressions', fInt, 'num'],
    ['Thumbnail CTR (%)', 'ctr', fPct, 'num'],
    ['Views', 'views', fInt, 'num'],
    ['Unique viewers', 'unique_viewers', fInt, 'num'],
    ['How viewers find this video', 'traffic', TXT, 'list'],
    ['External sites or apps', 'external', TXT, 'list'],
    ['YouTube search terms', 'search_terms', TXT, 'list'],
  ];
  const COLS_SHORTS = [
    ['Shorts title', 'title', TXT, 't'],
    ['Published', 'published', fDate],
    ['Watch time (hours)', 'watch_hours', fHrs, 'num'],
    ['Views', 'views', fInt, 'num'],
    ['Subscribers', 'subscribers', fSigned, 'num'],
    ['AVD (%)', 'avg_pct_viewed', fPct, 'num'],
    ['AVD', 'avg_view_s', fDur, 'num'],
    ['Engaged views', 'engaged_views', fInt, 'num'],
    ['Unique viewers', 'unique_viewers', fInt, 'num'],
    ['Stayed to watch (%)', 'stayed_pct', fPct, 'num'],
    ['Swiped away (%)', 'swiped_pct', fPct, 'num'],
    ['How viewers find this video', 'traffic', TXT, 'list'],
    ['External sites or apps', 'external', TXT, 'list'],
    ['YouTube search terms', 'search_terms', TXT, 'list'],
  ];
  const NAMES = { 'Long-form': ['Videos', 'videos'], Shorts: ['Shorts', 'Shorts'], Podcast: ['Podcast', 'podcast episodes'] };

  function renderFormat(tab, category) {
    const page = $('#page-' + tab);
    const list = DATA.videos.filter((v) => v.category === category).sort((a, b) => String(a.published).localeCompare(String(b.published)));
    const cols = category === 'Shorts' ? COLS_SHORTS : COLS_LONG;
    const [label, plural] = NAMES[category];
    page.replaceChildren();

    const sec = el('div', 'section');
    const eb = el('div', 'eyebrow'); eb.innerHTML = '<svg><use href="#waves"/></svg>'; eb.append(label);
    sec.append(eb, el('h2', null, `All ${plural}`),
      el('div', 'muted', `${list.length} tracked · charts run oldest to newest, labelled by the first word of each title · numbers are “since published” as of each screenshot`));
    page.appendChild(sec);

    if (!list.length) { page.appendChild(el('div', 'card empty', `No ${plural} in Airtable yet. Add a row to the Videos table with Category “${category}”.`)); return; }

    const grid = el('div', 'grid two');
    const chartCard = (title, id) => { const c = el('div', 'card'); c.appendChild(el('h3', null, title)); const b = el('div', 'chart-box'); const cv = el('canvas'); cv.id = id; b.appendChild(cv); c.appendChild(b); return c; };
    grid.append(chartCard('Views', `${tab}-views`), chartCard('AVD (%)', `${tab}-avd`));
    page.appendChild(grid);
    const labels = list.map((v) => firstWord(v.title));
    const titles = list.map((v) => `${v.title} · ${fDate(v.published)}`);
    lineChart(`${tab}-views`, labels, list.map((v) => v.views), { fmt: (x) => `${fInt(x)} views`, tick: (x) => fCompact(x), titles });
    lineChart(`${tab}-avd`, labels, list.map((v) => (v.avg_pct_viewed == null ? null : v.avg_pct_viewed * 100)), { fmt: (x) => `${x.toFixed(1)}% viewed`, tick: (x) => x + '%', titles });

    const card = el('div', 'card'); const box = el('div', 'tablebox'); const t = el('table');
    const hr = el('tr'); cols.forEach(([h, , , cls]) => hr.appendChild(el('th', cls === 'num' ? 'num' : null, h)));
    const thead = el('thead'); thead.appendChild(hr);
    const tbody = el('tbody');
    list.slice().reverse().forEach((v) => {
      const tr = el('tr');
      cols.forEach(([, k, f, cls]) => tr.appendChild(el('td', cls || null, f(v[k]))));
      tbody.appendChild(tr);
    });
    t.append(thead, tbody); box.appendChild(t); card.append(el('div', 'muted', 'Newest first · scroll sideways to see every column.'), box); page.appendChild(card);
  }

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => Object.values(charts).forEach((c) => c.resize()), 150); });
})();
