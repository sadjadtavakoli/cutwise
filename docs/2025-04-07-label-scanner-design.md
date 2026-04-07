# Label Scanner — Design Spec

## Overview

Add a "Scan Label" button to the stock section that lets users photograph a lumber shelf label and auto-fill a stock row with extracted dimensions, price, and name. Uses Tesseract.js for on-device OCR — free, offline, no data leaves the browser.

## User Flow

1. User clicks **"Scan Label"** button (next to "+ Add Stock")
2. Mobile: camera opens. Desktop: file picker. (`<input type="file" accept="image/*" capture="environment">`)
3. Image loads — small preview shown with "Scanning..." spinner
4. Tesseract.js extracts text from the image
5. Regex parser pulls out: name/species, dimensions (L×W×T), price
6. New stock row auto-filled with extracted data
7. User reviews, corrects if needed

If a field can't be extracted, it's left blank for manual entry. No error states — just partial fill.

## Text Parsing

### Dimensions

Regex patterns for common shelf label formats:

- `1 x 6 x 8`, `1×6×8`, `1"x6"x8'`
- `1 in x 6 in x 8 ft`
- Nominal sizes: "2x4" mapped to actual dimensions (1.5"×3.5")
- Numbers with `ft` or `'` suffix: multiply by 12 to convert to inches

Dimension order assumption: thickness × width × length (standard lumber labeling).

### Price

- `$8.50`, `$12.99/each`, `$5.49`
- Extract first dollar-amount found in the text

### Name/Species

Keyword matching against common species:
- Pine, Oak, Poplar, Cedar, Spruce, Walnut, Maple, Birch, Cherry, Ash, Fir, Hemlock
- Product names: Whitewood, Premium, Select, Common

If no keyword found, name left blank.

### Defaults

- Stock type: "dimensional" (shelf labels are for dimensional lumber)
- Quantity: null (unlimited)

## Nominal Size Mapping

Standard nominal-to-actual conversion:

| Nominal | Actual |
|---------|--------|
| 1× | 0.75" thick |
| 2× | 1.5" thick |
| 4× | 3.5" thick |
| 6× | 5.5" thick |
| 8× | 7.25" thick |
| 10× | 9.25" thick |
| 12× | 11.25" thick |

Applied when a "2x4" style format is detected.

## Technical Integration

### Dependencies

- Tesseract.js v5 — loaded from CDN via `<script>` tag
  - Core: ~200KB
  - WASM worker: ~2-4MB (downloaded on first scan, cached by browser)
  - Language data: English (`eng.traineddata`, ~4MB, cached)

### New Files

- `js/scanner.js` — self-contained module:
  - `scanImage(imageFile) → Promise<{ name, length, width, thickness, price, type, rawText }>`
  - Handles Tesseract initialization, OCR, text parsing
  - Lazy-loads Tesseract on first call

### Modified Files

- `index.html` — add "Scan Label" button, hidden file input, preview/spinner area
- `js/app.js` — wire button click → scanner → addStockRow
- `css/style.css` — preview image, spinner, scan status styles

### Unchanged Files

- models.js, optimizer.js, ilp-optimizer.js, storage.js, cost.js, ui.js, greedy.js, presets.js

### Tesseract Loading

Lazy-loaded on first scan (not on page load). The `<script>` tag loads the core library. The WASM worker and language data are fetched on first `scanImage()` call and cached by the browser for subsequent scans.

## Error Handling

- Image too small/blurry: Tesseract returns low-confidence text. Parser finds fewer fields. Row is partially filled. No error shown.
- No text found at all: Show brief "Couldn't read label — try a clearer photo" message. No row added.
- Tesseract fails to load (offline, CDN down): Show "Scanner unavailable" message. Manual entry still works.
