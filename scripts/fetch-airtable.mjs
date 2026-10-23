// Pulls the Videos and Channel Snapshots tables from Airtable and writes site/data/data.json.
// Runs inside GitHub Actions with AIRTABLE_TOKEN + AIRTABLE_BASE_ID secrets, so the token never reaches the browser.
import { writeFile, mkdir } from 'node:fs/promises';

const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE = process.env.AIRTABLE_BASE_ID;
if (!TOKEN || !BASE) {
  console.error('Missing AIRTABLE_TOKEN or AIRTABLE_BASE_ID');
  process.exit(1);
}

const MAPS = {
  Videos: {
    'Video ID': 'video_id', Title: 'title', Category: 'category', Published: 'published',
    'Watch hours': 'watch_hours', Subscribers: 'subscribers', 'Avg % viewed': 'avg_pct_viewed', 'Avg view (s)': 'avg_view_s',
    Impressions: 'impressions', CTR: 'ctr', Views: 'views', 'Unique viewers': 'unique_viewers', 'Engaged views': 'engaged_views',
    'Stayed to watch %': 'stayed_pct', 'Swiped away %': 'swiped_pct',
    'How viewers find': 'traffic', 'External sites or apps': 'external', 'YouTube search terms': 'search_terms',
  },
  'Channel Snapshots': {
    Label: 'label', 'Snapshot date': 'snapshot_date', 'Total subscribers': 'subs_total',
    'YPP qualified watch hours (365d)': 'ypp_watch_hours', 'YPP qualified Shorts views (90d)': 'ypp_shorts_views',
    'Shorts viewed %': 'shorts_viewed_pct',
  },
};
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

async function fetchTable(name) {
  const rows = [];
  let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(name)}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
    const body = await res.json();
    const map = MAPS[name];
    for (const r of body.records) {
      const o = {};
      for (const [k, v] of Object.entries(r.fields)) o[map[k] ?? slug(k)] = v;
      rows.push(o);
    }
    offset = body.offset;
  } while (offset);
  return rows;
}

const [videos, channel] = await Promise.all([fetchTable('Videos'), fetchTable('Channel Snapshots')]);
await mkdir('site/data', { recursive: true });
await writeFile('site/data/data.json', JSON.stringify({
  generated_at: new Date().toISOString(),
  videos: videos.filter((v) => v.video_id),
  channel: channel.filter((c) => c.snapshot_date).sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)),
}, null, 1));
console.log(`videos=${videos.length} channel=${channel.length}`);
