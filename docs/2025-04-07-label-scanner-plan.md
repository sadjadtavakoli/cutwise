# Label Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Scan Label" button that uses Tesseract.js OCR to photograph a lumber shelf label and auto-fill a stock row with extracted dimensions, price, and name.

**Architecture:** New `js/scanner.js` module handles OCR + text parsing. Tesseract.js loaded from CDN, lazy-initialized on first scan. `app.js` wires the button to scanner output and feeds it to the existing `addStockRow`. No changes to the optimizer, models, or storage.

**Tech Stack:** Tesseract.js v5 (CDN), vanilla JS ES modules.

---

## File Structure

```
cutwise/
├── index.html              — Add Tesseract CDN script, scan button, file input, preview area
├── css/style.css           — Add scanner preview, spinner, status styles
├── js/
│   ├── scanner.js          — NEW: OCR + text parsing (scanImage, parseLabelText)
│   └── app.js              — Wire scan button → scanner → addStockRow
└── tests/
    └── test-scanner.js     — NEW: Unit tests for text parsing (no OCR in tests)
```

---

### Task 1: Text parser with tests

**Files:**
- Create: `js/scanner.js`
- Create: `tests/test-scanner.js`

The parser is the core logic — it takes raw OCR text and extracts structured data. We test this independently of Tesseract.

- [ ] **Step 1: Write failing tests for parseLabelText**

Create `tests/test-scanner.js`:

```js
import assert from 'node:assert/strict';
import { parseLabelText } from '../js/scanner.js';

// Test 1: Standard shelf label "2 x 4 x 8" with price
{
  const result = parseLabelText('Whitewood 2 x 4 x 8 $3.98');
  assert.equal(result.thickness, 1.5);  // nominal 2 → actual 1.5
  assert.equal(result.width, 3.5);      // nominal 4 → actual 3.5
  assert.equal(result.length, 96);      // 8ft → 96 inches
  assert.equal(result.price, 3.98);
  assert.equal(result.name, 'Whitewood');
  assert.equal(result.type, 'dimensional');
}

// Test 2: Label with "x" separator and ft marker
{
  const result = parseLabelText('1 x 6 x 10 ft  Premium Pine  $12.49/each');
  assert.equal(result.thickness, 0.75);
  assert.equal(result.width, 5.5);
  assert.equal(result.length, 120);
  assert.equal(result.price, 12.49);
  assert.equal(result.name, 'Pine');
}

// Test 3: Label with unicode × and inch/foot marks
{
  const result = parseLabelText('2"×6"×12\' Cedar $9.97');
  assert.equal(result.thickness, 1.5);
  assert.equal(result.width, 5.5);
  assert.equal(result.length, 144);
  assert.equal(result.price, 9.97);
  assert.equal(result.name, 'Cedar');
}

// Test 4: Non-nominal actual dimensions
{
  const result = parseLabelText('0.75 x 5.5 x 96 Oak $11.00');
  assert.equal(result.thickness, 0.75);
  assert.equal(result.width, 5.5);
  assert.equal(result.length, 96);
  assert.equal(result.price, 11.00);
  assert.equal(result.name, 'Oak');
}

// Test 5: Only price found
{
  const result = parseLabelText('SOME GARBLED TEXT $4.50');
  assert.equal(result.price, 4.50);
  assert.equal(result.thickness, null);
  assert.equal(result.width, null);
  assert.equal(result.length, null);
}

// Test 6: Only dimensions found, no price
{
  const result = parseLabelText('2 x 4 x 8');
  assert.equal(result.thickness, 1.5);
  assert.equal(result.width, 3.5);
  assert.equal(result.length, 96);
  assert.equal(result.price, null);
}

// Test 7: Nothing recognizable
{
  const result = parseLabelText('XYZZY BLORP');
  assert.equal(result.thickness, null);
  assert.equal(result.width, null);
  assert.equal(result.length, null);
  assert.equal(result.price, null);
  assert.equal(result.name, '');
}

// Test 8: Two-part nominal "2x4" without length
{
  const result = parseLabelText('2x4 Spruce $2.50');
  assert.equal(result.thickness, 1.5);
  assert.equal(result.width, 3.5);
  assert.equal(result.length, null);
  assert.equal(result.price, 2.50);
  assert.equal(result.name, 'Spruce');
}

// Test 9: Dimensions with "in" and "ft" units
{
  const result = parseLabelText('1 in x 4 in x 6 ft Poplar $5.25');
  assert.equal(result.thickness, 0.75);
  assert.equal(result.width, 3.5);
  assert.equal(result.length, 72);
  assert.equal(result.price, 5.25);
  assert.equal(result.name, 'Poplar');
}

// Test 10: Nominal mapping for all standard sizes
{
  const r = parseLabelText('1x12x8');
  assert.equal(r.thickness, 0.75);
  assert.equal(r.width, 11.25);
  assert.equal(r.length, 96);
}

console.log('test-scanner: all passed');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/test-scanner.js`
Expected: FAIL with `Cannot find module '../js/scanner.js'`

- [ ] **Step 3: Implement parseLabelText in scanner.js**

Create `js/scanner.js`:

```js
/**
 * Nominal-to-actual dimension mapping for standard lumber.
 * Key is the nominal inch value, value is the actual inch value.
 */
const NOMINAL_MAP = {
  1: 0.75,
  2: 1.5,
  3: 2.5,
  4: 3.5,
  6: 5.5,
  8: 7.25,
  10: 9.25,
  12: 11.25,
};

/**
 * Species/product keywords to look for in label text.
 */
const SPECIES_KEYWORDS = [
  'Pine', 'Oak', 'Poplar', 'Cedar', 'Spruce', 'Walnut', 'Maple',
  'Birch', 'Cherry', 'Ash', 'Fir', 'Hemlock',
  'Whitewood', 'Premium', 'Select', 'Common',
];

/**
 * Check if a number is a standard nominal lumber size.
 */
function isNominal(n) {
  return Number.isInteger(n) && n in NOMINAL_MAP;
}

/**
 * Convert a dimension value, applying nominal mapping if all dimensions
 * in the set appear to be nominal integers.
 */
function toActual(n) {
  if (isNominal(n)) return NOMINAL_MAP[n];
  return n;
}

/**
 * Detect if a set of dimensions looks like nominal lumber sizes.
 * Nominal if: the first two values are small integers in the nominal map.
 */
function looksNominal(dims) {
  if (dims.length < 2) return false;
  return isNominal(dims[0]) && isNominal(dims[1]);
}

/**
 * Convert a length value to inches. If it appears to be in feet
 * (value <= 20 and is an integer, and is the third dimension), convert.
 */
function lengthToInches(value, isFeet) {
  if (isFeet) return value * 12;
  return value;
}

/**
 * Parse raw OCR text from a lumber shelf label.
 * Extracts: name, thickness, width, length, price, type.
 *
 * @param {string} text - Raw text from Tesseract OCR
 * @returns {{ name: string, thickness: number|null, width: number|null,
 *             length: number|null, price: number|null, type: string }}
 */
export function parseLabelText(text) {
  const result = {
    name: '',
    thickness: null,
    width: null,
    length: null,
    price: null,
    type: 'dimensional',
  };

  if (!text || !text.trim()) return result;

  // --- Extract price ---
  const priceMatch = text.match(/\$\s*(\d+\.?\d*)/);
  if (priceMatch) {
    result.price = parseFloat(priceMatch[1]);
  }

  // --- Extract dimensions ---
  // Normalize separators: ×, X, x, *, spaces around them
  const normalized = text
    .replace(/×/g, 'x')
    .replace(/\*/g, 'x')
    .replace(/X/g, 'x');

  // Pattern: three numbers separated by 'x' with optional units
  // Matches: "2 x 4 x 8", "2x4x8", '2"x4"x8\'', "1 in x 6 in x 8 ft"
  const dimPattern3 = /(\d+\.?\d*)\s*(?:"|in|inches?)?\s*x\s*(\d+\.?\d*)\s*(?:"|in|inches?)?\s*x\s*(\d+\.?\d*)\s*(ft|'|feet|foot)?/i;
  const match3 = normalized.match(dimPattern3);

  if (match3) {
    const d1 = parseFloat(match3[1]);
    const d2 = parseFloat(match3[2]);
    const d3 = parseFloat(match3[3]);
    const d3Unit = match3[4] || '';
    const isFeet = /ft|'|feet|foot/i.test(d3Unit);

    if (looksNominal([d1, d2])) {
      result.thickness = toActual(d1);
      result.width = toActual(d2);
      // Third dimension: if nominal and looks like feet (small integer), convert
      const len = (isNominal(d3) || d3 <= 20) && !d3.toString().includes('.')
        ? d3 * 12
        : d3;
      result.length = isFeet ? d3 * 12 : len;
    } else {
      // Actual dimensions — no conversion
      result.thickness = d1;
      result.width = d2;
      result.length = isFeet ? d3 * 12 : d3;
    }
  } else {
    // Try two-part pattern: "2x4"
    const dimPattern2 = /(\d+\.?\d*)\s*(?:"|in)?\s*x\s*(\d+\.?\d*)\s*(?:"|in)?/i;
    const match2 = normalized.match(dimPattern2);
    if (match2) {
      const d1 = parseFloat(match2[1]);
      const d2 = parseFloat(match2[2]);
      if (looksNominal([d1, d2])) {
        result.thickness = toActual(d1);
        result.width = toActual(d2);
      } else {
        result.thickness = d1;
        result.width = d2;
      }
    }
  }

  // --- Extract name/species ---
  for (const keyword of SPECIES_KEYWORDS) {
    const regex = new RegExp('\\b' + keyword + '\\b', 'i');
    if (regex.test(text)) {
      result.name = keyword;
      break;
    }
  }

  return result;
}

/**
 * Scan an image file using Tesseract.js OCR and parse the label text.
 * Lazy-loads Tesseract on first call.
 *
 * @param {File} imageFile - Image file from file input
 * @returns {Promise<{ name, thickness, width, length, price, type, rawText }>}
 */
export async function scanImage(imageFile) {
  // Tesseract is loaded via CDN <script> tag — available as window.Tesseract
  if (typeof Tesseract === 'undefined') {
    throw new Error('Scanner unavailable — Tesseract.js not loaded');
  }

  const worker = await Tesseract.createWorker('eng');
  const { data: { text } } = await worker.recognize(imageFile);
  await worker.terminate();

  const parsed = parseLabelText(text);
  parsed.rawText = text;
  return parsed;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/test-scanner.js`
Expected: `test-scanner: all passed`

- [ ] **Step 5: Commit**

```bash
git add js/scanner.js tests/test-scanner.js
git commit -m "Add label text parser with OCR support"
```

---

### Task 2: HTML and CSS for scan UI

**Files:**
- Modify: `index.html`
- Modify: `css/style.css`

- [ ] **Step 1: Add Tesseract.js CDN script and scan UI elements to index.html**

In `index.html`, add the Tesseract CDN script before the app module script (line 115):

```html
  <script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>
  <script type="module" src="js/app.js"></script>
```

Add the scan button and preview area after the `btn-add-stock` button (line 73):

```html
      <button id="btn-add-stock">+ Add Stock</button>
      <button id="btn-scan-label">Scan Label</button>
      <input type="file" id="scan-file" accept="image/*" capture="environment" hidden>
      <div id="scan-preview" hidden>
        <img id="scan-image" alt="Label preview">
        <span id="scan-status">Scanning...</span>
      </div>
```

- [ ] **Step 2: Add scanner styles to css/style.css**

Append to `css/style.css`:

```css
/* Scanner */
#btn-scan-label {
  background: #40c057;
  color: white;
  border-color: #37b24d;
}

#btn-scan-label:hover {
  background: #37b24d;
}

#scan-preview {
  margin-top: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

#scan-image {
  max-width: 120px;
  max-height: 80px;
  border-radius: 4px;
  border: 1px solid #dee2e6;
}

#scan-status {
  font-size: 0.875rem;
  color: #6c757d;
}

#scan-status.error {
  color: #dc3545;
}

#scan-status.success {
  color: #40c057;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

#scan-status.scanning::before {
  content: '';
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid #6c757d;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-right: 0.5rem;
  vertical-align: middle;
}
```

- [ ] **Step 3: Commit**

```bash
git add index.html css/style.css
git commit -m "Add scan label button and preview UI"
```

---

### Task 3: Wire scan button to scanner and stock row

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Add scan button wiring to app.js**

Add after the `btn-load-presets` event listener (around line 35) in `js/app.js`:

```js
// --- Scan Label ---
const scanFile = document.getElementById('scan-file');
const scanPreview = document.getElementById('scan-preview');
const scanImage = document.getElementById('scan-image');
const scanStatus = document.getElementById('scan-status');

document.getElementById('btn-scan-label').addEventListener('click', () => {
  scanFile.click();
});

scanFile.addEventListener('change', async () => {
  const file = scanFile.files[0];
  if (!file) return;

  // Show preview
  scanPreview.hidden = false;
  scanImage.src = URL.createObjectURL(file);
  scanStatus.textContent = 'Scanning...';
  scanStatus.className = 'scanning';

  try {
    const { scanImage: doScan } = await import('./scanner.js');
    const result = await doScan(file);

    if (!result.thickness && !result.width && !result.length && !result.price) {
      scanStatus.textContent = "Couldn't read label — try a clearer photo";
      scanStatus.className = 'error';
    } else {
      scanStatus.textContent = 'Done! Review the row below.';
      scanStatus.className = 'success';
      addStockRow(stockBody, {
        name: result.name || '',
        type: result.type || 'dimensional',
        length: result.length || '',
        width: result.width || '',
        thickness: result.thickness || '',
        price: result.price || '',
        quantity: null,
      });
    }
  } catch (e) {
    scanStatus.textContent = 'Scanner unavailable';
    scanStatus.className = 'error';
    console.error('Scan error:', e);
  }

  scanFile.value = '';
});
```

Also add the import at the top of `app.js` — actually, since we're using dynamic `import()` in the handler above, no top-level import needed. The dynamic import keeps Tesseract lazy.

- [ ] **Step 2: Test manually in browser**

1. Serve with `python3 -m http.server 8070` from the cutwise directory
2. Open http://localhost:8070
3. Click "Scan Label" — file picker should open
4. Select a photo of a lumber shelf label
5. Preview image should appear with "Scanning..." spinner
6. After a few seconds, a new stock row should be filled with extracted data

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "Wire scan button to Tesseract OCR and stock row"
```

---

### Task 4: End-to-end test and polish

**Files:**
- Possibly modify: `js/scanner.js` (if parsing issues found)

- [ ] **Step 1: Test with real shelf label photos**

Find 2-3 photos of lumber shelf labels (Home Depot / Lowes style) online. Save them locally. Test each one:

1. Click "Scan Label"
2. Select the photo
3. Verify extracted data is reasonable
4. Note any parsing failures

- [ ] **Step 2: Fix any parsing issues found**

If specific label formats aren't parsed correctly, add regex patterns to `parseLabelText` and corresponding tests to `test-scanner.js`.

- [ ] **Step 3: Run all tests**

```bash
node tests/test-scanner.js
node tests/test-models.js
node tests/test-cost.js
node tests/test-greedy.js
node tests/test-optimizer.js
node tests/test-storage.js
node tests/test-ilp.js
```

All should pass.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "Fix label parsing issues found during testing"
```

(Only if fixes were needed.)
