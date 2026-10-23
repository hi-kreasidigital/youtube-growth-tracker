# Tara x Mattel — YouTube performance dashboard

This is a static dashboard for GitHub Pages. It reads its numbers from the **YouTube Analytics** base in Airtable.

```
Screenshots → Claude → Airtable (Videos · Channel Snapshots)
                              ↓  GitHub Action, every 6 hours or on demand
                       site/data/data.json → GitHub Pages
```

Your Airtable token stays in GitHub Secrets. The browser never sees it: the Action fetches the data and publishes it as a plain JSON file.

## One-time setup

1. **Create the repo.** Make a new GitHub repository (it can be private if your plan includes Pages for private repos). Upload everything in this folder, including the hidden `.github` folder.
2. **Create an Airtable token.** Go to <https://airtable.com/create/tokens> and create a token:
   - Scope: `data.records:read`
   - Access: the **YouTube Analytics** base only
3. **Add the repo secrets.** In the repo, go to Settings → Secrets and variables → Actions → *New repository secret*:
   - `AIRTABLE_TOKEN`: the token from step 2
   - `AIRTABLE_BASE_ID`: the base ID, which starts with `app…` (it's in the base's URL)
4. **Turn on Pages.** Go to Settings → Pages → Source and choose **GitHub Actions**.
5. **Run the workflow.** Go to Actions → *Sync Airtable & deploy dashboard* → **Run workflow**. Your dashboard is then live at `https://<user>.github.io/<repo>/`.

After that, the page refreshes itself every 6 hours. For an instant update after new data goes into Airtable, press **Run workflow** again.

## Tables in Airtable

| Table | One row per | Used for |
|---|---|---|
| Videos | video (Category = Long-form, Shorts or Podcast) | Videos, Shorts and Podcast tabs, monthly checks |
| Channel Snapshots | monthly snapshot (1st of each month) | Channel & YPP tab: YPP progress, growth chart, Shorts stayed-to-watch fallback |

Don't rename tables or fields. If you add a new field, it shows up in `data.json` automatically under a snake_case name.

## Changing the look

All colours and fonts are set at the top of `site/assets/style.css` under **BRAND TOKENS**. Logos (from the brand kit) live in `site/assets/`.

## Previewing locally

```
cd site && python3 -m http.server 8000
```

Then open <http://localhost:8000>. Until the Action has run, the page uses the bundled `site/data/data.json`.
