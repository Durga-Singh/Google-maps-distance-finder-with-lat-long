# Google Business Profile Batch Updater

Bulk update Google Business Profile names, addresses and map pins from Excel using a Chrome or Brave extension. Search by store code, process locations in parallel, check saved coordinates and export a per-store report.

Built for teams maintaining multiple branches, shops or ATMs. The browser extension works through Business Profile Manager and does not require a paid Google Maps API key.

Current extension version: **6.0.15**.

[Download source ZIP](https://github.com/Durga-Singh/business-profile-batch-updater/archive/refs/heads/main.zip) · [Installation](#install-in-chrome-or-brave) · [Excel columns](#prepare-your-excel-file) · [Pause and resume](#pause-and-resume) · [Report a problem](https://github.com/Durga-Singh/business-profile-batch-updater/issues)

This project is independently maintained and is not affiliated with Google.

## What it does

- Searches listings by store code and processes eligible profiles sharing that code.
- Updates name, address, city, PIN code, state and coordinates in that order.
- Runs up to 20 separate windows.
- Checks saved coordinates, names and address fields after refreshing.
- Saves progress so a run can resume after closing the browser.

## Install in Chrome or Brave

You need a desktop browser and access to manage the Business Profiles you want to update. The supplied launchers are for Windows.

1. [Download the source ZIP](https://github.com/Durga-Singh/business-profile-batch-updater/archive/refs/heads/main.zip) and extract it.
2. Open `brave://extensions` or `chrome://extensions`.
3. Enable Developer mode, select **Load unpacked**, and choose the `extension` folder.
4. Open your Google Business Profile Manager store list in the correct account and group.
5. Open the extension, load your Excel file and choose a run option.

For parallel coordinate updates, close the browser and use the matching Windows launcher in `extension`. Start with a small batch and a low window count. Keep worker windows open.

## Prepare your Excel file

Use one row per store code. Keep latitude and longitude in separate columns and use decimal coordinates.

| Column | Purpose |
| --- | --- |
| Store | Store code used to find the listing in Business Manager |
| Business name | Desired business name |
| ADDRESS1 | Street address |
| CITY | City or town |
| STATE | State |
| PINCODE | Postal code |
| LATITUDE | Requested pin latitude |
| LONGITUDE | Requested pin longitude |

For this version, avoid including both `CITY` and `LOCALITY`: the importer currently prioritizes `LOCALITY`, which can compare a neighbourhood against Google's city field. Use a copy of your source sheet with just the intended city column.

The extension's coordinate validation currently targets locations in India. It is not yet a general-purpose worldwide updater.

## Run a small batch first

1. Open the correct account and location group in Business Profile Manager.
2. Import the spreadsheet into the extension.
3. Choose whether to update names and address details along with coordinates, or update coordinates and check the other fields.
4. Start with one window and a few stores. Inspect the exported results before increasing the batch size.
5. Use **Re-check all ATMs (read-only)** to check saved values without submitting another update.

Up to 20 worker windows are supported, but the practical limit depends on available memory and how quickly Google loads. A higher window count does not guarantee a faster run.

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

## Frequently asked questions

### Does this verify the public Google Maps pin?

No. The extension compares Excel coordinates with the saved Business Manager preview. A pending edit can still differ from the public listing. An OK result is not proof of public Maps publication.

### Does it need a Google Maps API key?

The browser extension does not. The separate Python audit script included in this repository uses the Google Places API and requires its own key.

### Can I resume after closing Brave or Chrome?

Yes, for runs started on version 6.0.15 or later. Reopen the same browser profile, open Business Manager, then select **Resume saved run (one store back)**. Do not import the sheet again.

### What happens when two profiles share a store code?

Eligible matching profiles are processed separately. Their results appear in the export. Listings requiring verification or marked as duplicates may be skipped.

### Why does a coordinate check say Unconfirmed?

The extension could not read a reliable saved coordinate value, or it could not reach the listing. Read the coordinate notes and refresh summary in the exported Excel to distinguish those cases. Unconfirmed does not establish that the pin is wrong.

## Reporting problems

[Open an issue](https://github.com/Durga-Singh/business-profile-batch-updater/issues) with the extension version, browser, number of worker windows, operation being run and exact error message. Include a small anonymized example if the issue depends on spreadsheet columns.

Remove account details, private store data and customer information from screenshots and spreadsheets before posting them in this public repository.

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
