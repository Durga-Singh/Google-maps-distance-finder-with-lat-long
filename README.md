# Business Profile Batch Updater

A Chrome and Brave extension for updating Google Business Profile locations from Excel. It handles business names, address fields and map pins, then exports the results back to Excel.

Current extension version: **6.0.15**.

## What it does

- Searches listings by store code and processes eligible profiles sharing that code.
- Updates name, address, city, PIN code, state and coordinates in that order.
- Runs up to 20 separate windows.
- Checks saved coordinates, names and address fields after refreshing.
- Saves progress so a run can resume after closing the browser.

## Install

1. Download this branch as a ZIP and extract it.
2. Open `brave://extensions` or `chrome://extensions`.
3. Enable Developer mode, select **Load unpacked**, and choose the `extension` folder.
4. Open your Google Business Profile Manager store list in the correct account and group.
5. Open the extension, load your Excel file and choose a run option.

For parallel coordinate updates, close the browser and use the matching Windows launcher in `extension`. Start with a small batch and a low window count. Keep worker windows open.

## Pause and resume

**Pause after current store** lets the current stores finish. **Stop at current ATM** pauses immediately.

After reopening the browser, open Business Manager and click **Resume saved run (one store back)** in the extension. Each unfinished window restores its assignment and checks the previous store before continuing. No Excel re-import is needed.

Interrupted saves are checked before work continues. If the saved values cannot be read reliably, that window stops with a message instead of assuming success.

Keep the same browser profile and extension installation. Removing the extension, clearing its data or importing a new queue discards the saved resume plan. Resume checkpoints are available for runs started on version 6.0.15 or later.

## Reading the results

The export includes saved latitude and longitude, distance from the requested pin, field checks and notes.

- **OK:** the saved coordinate reading is within 5 metres of the spreadsheet value.
- **Mismatch:** the reading is farther than 5 metres.
- **Unconfirmed:** the extension could not obtain a reliable saved reading.

These checks read the saved Business Manager preview. They do not prove that a pending change has appeared on public Google Maps.

## Address handling

The extension maps NCT of Delhi to Delhi and clears unused address lines. If Google returns the specific “more than 5 items” error, it first tries the full address without commas across up to five lines, each under 80 characters. Shortening is a last resort after that retry is rejected with the same error; removed text is recorded in the notes.

## Tests

Run from the repository root with Node.js:

```sh
node extension/tests/coordinate-readback.cjs
node extension/tests/resume.cjs
```

The tests cover coordinate readback guards and simulated restart recovery. A browser shutdown during a live production run has not been tested. Google UI changes can affect the automation.

## Earlier Python audit script

The original `audit.py` remains in the repository. It compares spreadsheet coordinates with Google Places results and writes a distance report. It is separate from the browser extension and requires a Google Maps API key.

```sh
pip install -r requirements.txt
python audit.py --input sample_input.csv --output sample_report.csv
```

Use `.env.example` for its configuration and `python audit.py --help` for options. The extension itself does not require a paid API key.
