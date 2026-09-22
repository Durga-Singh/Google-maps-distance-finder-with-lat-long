# Branch Pin Audit

Compares branch coordinates from your spreadsheet against what Google
currently has for that listing, flags any pin that has drifted past a
threshold you set, and writes a report with a ready-to-open Google Maps
link for every flagged branch.

## Why

Dragging a pin in Google Business Profile can't be done from lat/long —
it's drag-only, and there's no bulk API for repositioning a listing that
already exists (see notes at the bottom). This script doesn't move pins
for you; it does the tedious part — figuring out *which* of hundreds of
branches actually need a manual fix — so your team only drags pins that
are genuinely wrong.

## Setup

1. **Get a Google Maps API key**
   - Go to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   - Create (or pick) a project, enable the **Places API**
   - Create an API key, and ideally restrict it to the Places API
   - Note: this is billed per request after a free monthly quota — check
     [current Places API pricing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)
     before running it against a large sheet.

2. **Clone this repo and install dependencies**
   ```bash
   git clone <your-repo-url>
   cd branch-pin-audit
   python -m venv venv
   source venv/bin/activate   # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Add your API key**
   ```bash
   cp .env.example .env
   # then edit .env and paste your key
   ```

## Usage

```bash
python audit.py --input branches.xlsx --output report.xlsx --threshold 20
```

- `--input` — CSV or XLSX with columns `branch_code`, `branch_name`,
  `excel_lat`, `excel_long`, and optionally `address` and `place_id`
  (see `sample_input.csv` for the exact format).
- `--output` — where to write the report (CSV or XLSX).
- `--threshold` — meters of drift allowed before a branch is flagged
  (default 20; GPS noise is typically under 5m, so 15–20m is a
  reasonable starting cutoff — tune it to what your team considers a
  meaningful mismatch).
- `--api-key` — optional, overrides the `.env` value.
- `--delay` — seconds between requests (default 0.05), raise this if you
  hit rate-limit errors.

Try it on the bundled sample first:
```bash
python audit.py --input sample_input.csv --output sample_report.csv
```

## Output columns

| Column | Meaning |
|---|---|
| `current_lat` / `current_lng` | What Google has right now |
| `distance_m` | Distance between your coordinate and Google's, in meters |
| `status` | `OK`, `NEEDS CORRECTION`, or `NOT FOUND` |
| `maps_link` | `google.com/maps?q=lat,long` — only filled for flagged rows, so the field team can open it and drag the pin to match |
| `match_confidence` | `place_id` (most reliable — you supplied it), `text_search` (matched by name/address), or `not_found` |

**Tip:** if you have Place IDs for your branches (e.g. from Google
Business Profile exports), include them — matching by `place_id` is far
more reliable than a name/address text search, which can occasionally
match the wrong branch of the same bank in the same city.

## Known limitations

- **This does not move pins.** There's no supported way to reposition a
  pin on an *existing* Google Business Profile listing via API — Google
  restricts that `latlng` field to approved partner integrations. Manual
  correction (drag the pin in Business Profile → Adjust) is still
  required for anything flagged.
- **Text search can mismatch** for branches with generic names in dense
  areas — always double-check `match_confidence: text_search` results
  before treating "NEEDS CORRECTION" as final, or supply `place_id`
  where you have it.
- **Rate limits / cost** scale with the number of rows — batch large
  sheets and monitor usage in the Cloud Console.
