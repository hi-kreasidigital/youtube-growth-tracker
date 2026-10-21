// Pulls the three YouTube Analytics tables from Airtable and writes site/data/data.json.
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
    'Video ID': 'video_id', Title: 'title', Category: 'category', Published: 'published', Snapshot: 'snapshot',
    'YouTube URL': 'url', 'Length (s)': 'length_s', Views: 'views', 'Watch hours': 'watch_hours',
    Subscribers: 'subscribers', Impressions: 'impressions', CTR: 'ctr', 'Unique viewers': 'unique_viewers',
    'Engaged views': 'engaged_views', 'Avg view (s)': 'avg_view_s', 'Avg % viewed': 'avg_pct_viewed',
    'Retention at 0:30': 'retention_30s', 'Likes %': 'likes_pct', 'Likes channel avg': 'likes_channel_avg',
    'End screen CTR': 'endscreen_ctr', 'End screen channel avg': 'endscreen_channel_avg',
    'Engaged views from impressions': 'impr_engaged_views', 'Avg view from impressions (s)': 'impr_avg_view_s',
    'Watch hours from impressions': 'impr_watch_hours', 'Impressions from recommendations': 'impr_from_recs',
    'Hype points': 'hype_points', 'Shorts viewed %': 'shorts_viewed_pct', Notes: 'notes',
  },
  Breakdowns: {
    Key: 'key', Scope: 'scope', 'Video ID': 'video_id', 'Snapshot date': 'snapshot_date', Group: 'group', Label: 'label', Share: 'share', Rank: 'rank',
  },
  'Channel Snapshots': {
    Label: 'label', 'Snapshot date': 'snapshot_date', Period: 'period', 'Period start': 'period_start',
    Views: 'views', 'Views change': 'views_change', 'Watch hours': 'watch_hours', 'Watch hours change': 'watch_hours_change',
    'Subscribers gained': 'subs_gained', 'Subscribers change': 'subs_change', 'Total subscribers': 'subs_total',
    'Videos views': 'videos_views', 'Videos impressions': 'videos_impressions', 'Videos impressions change': 'videos_impressions_change',
    'Videos CTR': 'videos_ctr', 'Videos avg view (s)': 'videos_avg_view_s', 'Shorts views': 'shorts_views',
    'Shorts engaged views': 'shorts_engaged_views', 'Shorts engaged views change': 'shorts_engaged_change',
    'Shorts likes': 'shorts_likes', 'Shorts likes change': 'shorts_likes_change', 'Shorts subscribers': 'shorts_subs',
    'Shorts subscribers change': 'shorts_subs_change', 'Podcast views': 'podcast_views', 'Shorts viewed %': 'shorts_viewed_pct', Notes: 'notes',
    'YPP qualified watch hours (365d)': 'ypp_watch_hours', 'YPP qualified Shorts views (90d)': 'ypp_shorts_views',
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

const [videos, breakdowns, channel] = await Promise.all([
  fetchTable('Videos'), fetchTable('Breakdowns'), fetchTable('Channel Snapshots'),
]);
await mkdir('site/data', { recursive: true });
await writeFile('site/data/data.json', JSON.stringify({
  generated_at: new Date().toISOString(),
  videos: videos.filter((v) => v.video_id),
  breakdowns: breakdowns.filter((b) => b.label),
  channel: channel.filter((c) => c.snapshot_date).sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)),
}, null, 1));
console.log(`videos=${videos.length} breakdowns=${breakdowns.length} channel=${channel.length}`);
