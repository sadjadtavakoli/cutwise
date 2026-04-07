// Nominal-to-actual dimension mapping (inches)
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

const NOMINAL_KEYS = new Set(Object.keys(NOMINAL_MAP).map(Number));

// Wood species and product name keywords
const NAME_KEYWORDS = [
  'Whitewood', 'Spruce', 'Pine', 'Oak', 'Cedar', 'Poplar', 'Douglas',
  'Fir', 'Hemlock', 'Maple', 'Birch', 'Walnut', 'Cherry', 'Ash',
  'Premium', 'Select', 'Common',
];

function nominalToActual(n) {
  return NOMINAL_MAP[n] ?? null;
}

function isNominalInteger(n) {
  return Number.isInteger(n) && NOMINAL_KEYS.has(n);
}

/**
 * Determine if a value is a nominal dimension (small integer in nominal map).
 * Decimals are treated as actual dimensions.
 */
function resolveThicknessOrWidth(raw, hasDecimal) {
  const n = Number(raw);
  if (hasDecimal) return n; // actual dimension
  if (isNominalInteger(n)) return nominalToActual(n);
  return n;
}

/**
 * parseLabelText(text)
 * Returns { name, thickness, width, length, price, type }
 */
export function parseLabelText(text) {
  let thickness = null;
  let width = null;
  let length = null;
  let price = null;
  let name = '';
  const type = 'dimensional';

  // 1. Extract price: $X.XX or $X
  const priceMatch = text.match(/\$(\d+(?:\.\d+)?)/);
  if (priceMatch) {
    price = parseFloat(priceMatch[1]);
  }

  // 2. Normalize separators: unicode ×, uppercase X → lowercase x
  //    Also strip inch/foot/unit markers that are inline (e.g., 2"×6"×12')
  //    We'll handle units per-token after splitting
  let normalized = text
    .replace(/×/g, 'x')
    .replace(/\bX\b/g, 'x');

  // 3. Try 3-part pattern: N[unit] x N[unit] x N[unit]
  //    Units: ", in, inch → inches; ', ft, feet → feet
  const unitPat = String.raw`(?:"|in(?:ch(?:es)?)?|')|(ft|feet)?`;
  // Match: number with optional decimal, optional unit suffix, separator, repeat
  const threePat = /(\d+(?:\.\d+)?)["']?(?:\s*(?:in(?:ch(?:es)?)?))?(?:\s*x\s*)(\d+(?:\.\d+)?)["']?(?:\s*(?:in(?:ch(?:es)?)?))?(?:\s*x\s*)(\d+(?:\.\d+)?)\s*(['"']|ft|feet|foot)?/i;
  const threeMatch = normalized.match(threePat);

  if (threeMatch) {
    const rawT = threeMatch[1];
    const rawW = threeMatch[2];
    const rawL = threeMatch[3];
    const lengthUnit = threeMatch[4];

    const hasDecimalT = rawT.includes('.');
    const hasDecimalW = rawW.includes('.');
    const hasDecimalL = rawL.includes('.');

    const tNum = Number(rawT);
    const wNum = Number(rawW);
    const lNum = Number(rawL);

    // Resolve thickness and width
    thickness = resolveThicknessOrWidth(rawT, hasDecimalT);
    width = resolveThicknessOrWidth(rawW, hasDecimalW);

    // Resolve length
    if (lengthUnit && (lengthUnit === "'" || /^f/i.test(lengthUnit))) {
      // explicit feet marker
      length = lNum * 12;
    } else if (!hasDecimalL && isNominalInteger(lNum) && lNum <= 20) {
      // Small integer with no decimal and no unit: treat as feet
      length = lNum * 12;
    } else {
      // Actual inches value
      length = lNum;
    }
  } else {
    // 4. Try 2-part pattern: NxN
    const twoPat = /(\d+(?:\.\d+)?)(?:["']|\s*in(?:ch(?:es)?)?)?\s*x\s*(\d+(?:\.\d+)?)(?:["']|\s*in(?:ch(?:es)?)?)?/i;
    const twoMatch = normalized.match(twoPat);
    if (twoMatch) {
      const rawT = twoMatch[1];
      const rawW = twoMatch[2];
      thickness = resolveThicknessOrWidth(rawT, rawT.includes('.'));
      width = resolveThicknessOrWidth(rawW, rawW.includes('.'));
    }
  }

  // 5. Handle "in" units in 3-part case for thickness/width when 'in' appears after numbers
  //    Re-check if we have inline "in" units that need ft conversion for length
  //    This covers: "1 in x 4 in x 6 ft"
  const fullUnitPat = /(\d+(?:\.\d+)?)\s*in\s*x\s*(\d+(?:\.\d+)?)\s*in\s*x\s*(\d+(?:\.\d+)?)\s*(ft|feet|foot|')?/i;
  const fullUnitMatch = text.match(fullUnitPat);
  if (fullUnitMatch) {
    const rawT = fullUnitMatch[1];
    const rawW = fullUnitMatch[2];
    const rawL = fullUnitMatch[3];
    const lUnit = fullUnitMatch[4];

    thickness = resolveThicknessOrWidth(rawT, rawT.includes('.'));
    width = resolveThicknessOrWidth(rawW, rawW.includes('.'));

    const lNum = Number(rawL);
    if (lUnit) {
      length = lNum * 12;
    } else if (!rawL.includes('.') && isNominalInteger(lNum) && lNum <= 20) {
      length = lNum * 12;
    } else {
      length = lNum;
    }
  }

  // 6. Handle inline quote/foot patterns like 2"×6"×12'
  const quotePat = /(\d+(?:\.\d+)?)[""]\s*x\s*(\d+(?:\.\d+)?)[""]\s*x\s*(\d+(?:\.\d+)?)['']/i;
  const quoteMatch = text.replace(/×/g, 'x').match(quotePat);
  if (quoteMatch) {
    const rawT = quoteMatch[1];
    const rawW = quoteMatch[2];
    const rawL = quoteMatch[3];

    thickness = resolveThicknessOrWidth(rawT, rawT.includes('.'));
    width = resolveThicknessOrWidth(rawW, rawW.includes('.'));
    length = Number(rawL) * 12; // foot marker present
  }

  // 7. Extract name: match against known keywords
  for (const keyword of NAME_KEYWORDS) {
    const re = new RegExp(`\\b${keyword}\\b`, 'i');
    if (re.test(text)) {
      name = keyword;
      break;
    }
  }

  return { name, thickness, width, length, price, type };
}

/**
 * scanImage(imageFile)
 * Takes a File, runs Tesseract OCR, returns parsed result + rawText.
 */
export async function scanImage(imageFile) {
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
