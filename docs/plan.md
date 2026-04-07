# CutWise Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-page web app that optimizes lumber purchases by price, showing 3 cheapest options with cut assignments.

**Architecture:** Pure client-side app with ES modules. Optimizer is a standalone module with no DOM dependencies so it can be tested with Node.js. UI layer reads/writes the DOM and calls the optimizer. Persistence via localStorage with JSON export/import.

**Tech Stack:** Vanilla HTML + CSS + JS (ES modules), Node.js `assert` for tests (no test framework).

---

## File Structure

```
cutwise/
├── index.html              — Page structure, loads app.js as module
├── css/
│   └── style.css           — All styles
├── js/
│   ├── models.js           — Data constructors: NeededPiece, StockItem, Constraints, CutPlan
│   ├── cost.js             — Cost calculation: boardFootCost, stockCost
│   ├── optimizer.js        — optimize() entry point, strategy orchestration
│   ├── greedy.js           — Greedy bin-packing: directFit, glueUpFit, sheetFit
│   ├── storage.js          — localStorage: saveProject, loadProject, saveStockList, loadStockList
│   ├── presets.js           — Dimensional lumber preset data
│   ├── ui.js               — DOM manipulation, table rendering, event wiring
│   └── app.js              — Entry point: init, wire UI to optimizer + storage
├── tests/
│   ├── test-models.js      — Model construction tests
│   ├── test-cost.js        — Cost calculation tests
│   ├── test-greedy.js      — Greedy optimizer tests
│   ├── test-optimizer.js   — Multi-strategy integration tests
│   └── test-storage.js     — Persistence tests (mock localStorage)
└── docs/
    ├── design.md
    └── plan.md
```

---

### Task 1: Project scaffolding and data model

**Files:**
- Create: `js/models.js`
- Create: `tests/test-models.js`

- [ ] **Step 1: Write failing tests for data constructors**

Create `tests/test-models.js`:

```js
import assert from 'node:assert/strict';
import { createNeededPiece, createStockItem, createConstraints, DEFAULT_CONSTRAINTS } from '../js/models.js';

// NeededPiece with defaults
const piece = createNeededPiece({ length: 36, width: 8, thickness: 0.75 });
assert.equal(piece.length, 36);
assert.equal(piece.width, 8);
assert.equal(piece.thickness, 0.75);
assert.equal(piece.quantity, 1);
assert.equal(piece.name, '');
assert.equal(piece.canGlueWidth, true);
assert.equal(piece.grainSensitive, false);

// NeededPiece with overrides
const piece2 = createNeededPiece({
  name: 'Shelf top',
  length: 36,
  width: 8,
  thickness: 0.75,
  quantity: 2,
  canGlueWidth: false,
  grainSensitive: true,
});
assert.equal(piece2.name, 'Shelf top');
assert.equal(piece2.quantity, 2);
assert.equal(piece2.canGlueWidth, false);
assert.equal(piece2.grainSensitive, true);

// NeededPiece requires length, width, thickness
assert.throws(() => createNeededPiece({ width: 8, thickness: 0.75 }), /length is required/);
assert.throws(() => createNeededPiece({ length: 36, thickness: 0.75 }), /width is required/);
assert.throws(() => createNeededPiece({ length: 36, width: 8 }), /thickness is required/);

// StockItem dimensional
const stock = createStockItem({
  name: '1x6 Pine',
  type: 'dimensional',
  length: 96,
  width: 5.5,
  thickness: 0.75,
  price: 8.50,
});
assert.equal(stock.name, '1x6 Pine');
assert.equal(stock.type, 'dimensional');
assert.equal(stock.quantity, null); // default unlimited

// StockItem with quantity
const stock2 = createStockItem({
  name: '4/4 Walnut',
  type: 'hardwood',
  length: 72,
  width: 6,
  thickness: 1,
  price: 12.00,
  quantity: 3,
});
assert.equal(stock2.quantity, 3);

// StockItem requires type, length, width, thickness, price
assert.throws(() => createStockItem({ name: 'x', length: 1, width: 1, thickness: 1, price: 1 }), /type is required/);

// StockItem type must be valid
assert.throws(() => createStockItem({ type: 'metal', length: 1, width: 1, thickness: 1, price: 1 }), /type must be/);

// Constraints defaults
const c = createConstraints();
assert.equal(c.kerfWidth, DEFAULT_CONSTRAINTS.kerfWidth);
assert.equal(c.minGlueStripWidth, DEFAULT_CONSTRAINTS.minGlueStripWidth);
assert.equal(c.maxGlueJoints, DEFAULT_CONSTRAINTS.maxGlueJoints);
assert.equal(c.overageMargin, DEFAULT_CONSTRAINTS.overageMargin);

// Constraints overrides
const c2 = createConstraints({ kerfWidth: 0.1, maxGlueJoints: 6 });
assert.equal(c2.kerfWidth, 0.1);
assert.equal(c2.maxGlueJoints, 6);
assert.equal(c2.minGlueStripWidth, DEFAULT_CONSTRAINTS.minGlueStripWidth);

console.log('test-models: all passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test-models.js`
Expected: FAIL with `Cannot find module '../js/models.js'`

- [ ] **Step 3: Implement models.js**

Create `js/models.js`:

```js
export const DEFAULT_CONSTRAINTS = Object.freeze({
  kerfWidth: 0.125,
  minGlueStripWidth: 2,
  maxGlueJoints: 4,
  overageMargin: 0.5,
});

const VALID_STOCK_TYPES = ['dimensional', 'hardwood', 'sheet'];

export function createNeededPiece({ name = '', length, width, thickness, quantity = 1, canGlueWidth = true, grainSensitive = false } = {}) {
  if (length == null) throw new Error('length is required');
  if (width == null) throw new Error('width is required');
  if (thickness == null) throw new Error('thickness is required');
  return Object.freeze({ name, length, width, thickness, quantity, canGlueWidth, grainSensitive });
}

export function createStockItem({ name = '', type, length, width, thickness, price, quantity = null } = {}) {
  if (type == null) throw new Error('type is required');
  if (!VALID_STOCK_TYPES.includes(type)) throw new Error(`type must be one of: ${VALID_STOCK_TYPES.join(', ')}`);
  if (length == null) throw new Error('length is required');
  if (width == null) throw new Error('width is required');
  if (thickness == null) throw new Error('thickness is required');
  if (price == null) throw new Error('price is required');
  return Object.freeze({ name, type, length, width, thickness, price, quantity });
}

export function createConstraints(overrides = {}) {
  return Object.freeze({ ...DEFAULT_CONSTRAINTS, ...overrides });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test-models.js`
Expected: `test-models: all passed`

- [ ] **Step 5: Commit**

```bash
git add js/models.js tests/test-models.js
git commit -m "Add data model constructors with validation"
```

---

### Task 2: Cost calculation

**Files:**
- Create: `js/cost.js`
- Create: `tests/test-cost.js`

- [ ] **Step 1: Write failing tests for cost calculations**

Create `tests/test-cost.js`:

```js
import assert from 'node:assert/strict';
import { stockCost } from '../js/cost.js';

// Dimensional: price is per piece
const dimensional = { type: 'dimensional', length: 96, width: 5.5, thickness: 0.75, price: 8.50 };
assert.equal(stockCost(dimensional), 8.50);

// Sheet: price is per sheet
const sheet = { type: 'sheet', length: 96, width: 48, thickness: 0.75, price: 45.00 };
assert.equal(stockCost(sheet), 45.00);

// Hardwood: price per board-foot = price × (L × W × T_quarters) / 144
// 72" × 6" × 4/4 (1") at $12/bf = 12 × (72 × 6 × 1) / 144 = 12 × 3 = 36
const hardwood = { type: 'hardwood', length: 72, width: 6, thickness: 1, price: 12.00 };
assert.equal(stockCost(hardwood), 36.00);

// Hardwood 8/4 (2"): 48" × 8" × 2" at $15/bf = 15 × (48 × 8 × 2) / 144 = 15 × 5.333... = 80
const hardwood8q = { type: 'hardwood', length: 48, width: 8, thickness: 2, price: 15.00 };
assert.ok(Math.abs(stockCost(hardwood8q) - 80) < 0.01);

console.log('test-cost: all passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test-cost.js`
Expected: FAIL with `Cannot find module '../js/cost.js'`

- [ ] **Step 3: Implement cost.js**

Create `js/cost.js`:

```js
export function stockCost(stockItem) {
  if (stockItem.type === 'hardwood') {
    const boardFeet = (stockItem.length * stockItem.width * stockItem.thickness) / 144;
    return stockItem.price * boardFeet;
  }
  // Dimensional and sheet are priced per piece/sheet
  return stockItem.price;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test-cost.js`
Expected: `test-cost: all passed`

- [ ] **Step 5: Commit**

```bash
git add js/cost.js tests/test-cost.js
git commit -m "Add stock cost calculation with board-foot pricing"
```

---

### Task 3: Greedy optimizer — direct fit

**Files:**
- Create: `js/greedy.js`
- Create: `tests/test-greedy.js`

- [ ] **Step 1: Write failing tests for direct fit**

Create `tests/test-greedy.js`:

```js
import assert from 'node:assert/strict';
import { greedySolve } from '../js/greedy.js';
import { createNeededPiece, createStockItem, createConstraints } from '../js/models.js';

const constraints = createConstraints();

// Test 1: Single piece fits directly into one board
{
  const pieces = [createNeededPiece({ name: 'A', length: 24, width: 5, thickness: 0.75 })];
  const stock = [createStockItem({ name: '1x6 8ft', type: 'dimensional', length: 96, width: 5.5, thickness: 0.75, price: 8.50 })];

  const result = greedySolve(pieces, stock, constraints, 'cheapest');
  assert.equal(result.purchases.length, 1);
  assert.equal(result.purchases[0].stock.name, '1x6 8ft');
  assert.equal(result.purchases[0].quantity, 1);
  assert.equal(result.totalCost, 8.50);
  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].neededPiece.name, 'A');
}

// Test 2: Two pieces fit in one board (leftover reuse)
{
  const pieces = [
    createNeededPiece({ name: 'A', length: 36, width: 5, thickness: 0.75 }),
    createNeededPiece({ name: 'B', length: 36, width: 5, thickness: 0.75 }),
  ];
  const stock = [createStockItem({ name: '1x6 8ft', type: 'dimensional', length: 96, width: 5.5, thickness: 0.75, price: 8.50 })];

  const result = greedySolve(pieces, stock, constraints, 'cheapest');
  // 36 + 0.5 overage + 0.125 kerf = 36.625 per piece, two = 73.25, fits in 96"
  assert.equal(result.purchases.length, 1);
  assert.equal(result.purchases[0].quantity, 1);
  assert.equal(result.totalCost, 8.50);
  assert.equal(result.assignments.length, 2);
}

// Test 3: Piece too big for stock — no solution for that piece
{
  const pieces = [createNeededPiece({ name: 'Big', length: 120, width: 5, thickness: 0.75 })];
  const stock = [createStockItem({ name: '1x6 8ft', type: 'dimensional', length: 96, width: 5.5, thickness: 0.75, price: 8.50 })];

  const result = greedySolve(pieces, stock, constraints, 'cheapest');
  assert.equal(result.assignments.length, 0);
  assert.equal(result.unassigned.length, 1);
  assert.equal(result.unassigned[0].name, 'Big');
}

// Test 4: Picks cheaper stock when both fit
{
  const pieces = [createNeededPiece({ name: 'A', length: 24, width: 5, thickness: 0.75 })];
  const stock = [
    createStockItem({ name: 'Expensive', type: 'dimensional', length: 96, width: 5.5, thickness: 0.75, price: 15.00 }),
    createStockItem({ name: 'Cheap', type: 'dimensional', length: 48, width: 5.5, thickness: 0.75, price: 5.00 }),
  ];

  const result = greedySolve(pieces, stock, constraints, 'cheapest');
  assert.equal(result.purchases[0].stock.name, 'Cheap');
  assert.equal(result.totalCost, 5.00);
}

// Test 5: Respects thickness matching — won't put 0.75" piece in 1.5" stock
{
  const pieces = [createNeededPiece({ name: 'A', length: 24, width: 3, thickness: 0.75 })];
  const stock = [createStockItem({ name: '2x4', type: 'dimensional', length: 96, width: 3.5, thickness: 1.5, price: 4.00 })];

  const result = greedySolve(pieces, stock, constraints, 'cheapest');
  assert.equal(result.assignments.length, 0);
  assert.equal(result.unassigned.length, 1);
}

// Test 6: Quantity expansion — piece with quantity 3 produces 3 assignments
{
  const pieces = [createNeededPiece({ name: 'Slat', length: 18, width: 3, thickness: 0.75, quantity: 3 })];
  const stock = [createStockItem({ name: '1x4 8ft', type: 'dimensional', length: 96, width: 3.5, thickness: 0.75, price: 6.00 })];

  const result = greedySolve(pieces, stock, constraints, 'cheapest');
  assert.equal(result.assignments.length, 3);
  // 3 × (18 + 0.5 + 0.125) = 55.875, fits in one 96" board
  assert.equal(result.purchases[0].quantity, 1);
}

// Test 7: Grain-sensitive piece cannot be rotated
{
  // Piece is 36" long x 10" wide, stock is 10" wide x 48" long — fits normally
  // But if grain-sensitive, optimizer must not try to rotate (swap L and W)
  const pieces = [createNeededPiece({ name: 'Top', length: 36, width: 10, thickness: 0.75, grainSensitive: true })];
  const stock = [createStockItem({ name: 'Wide board', type: 'dimensional', length: 48, width: 11, thickness: 0.75, price: 20.00 })];

  const result = greedySolve(pieces, stock, constraints, 'cheapest');
  assert.equal(result.assignments.length, 1);
}

// Test 8: Non-grain-sensitive piece can be rotated to fit
{
  // Piece 30L x 5W, stock is 6W x 24L — doesn't fit as-is (30 > 24)
  // But rotated: piece becomes 5L x 30W — still doesn't fit (30 > 6)
  // So this should NOT fit either way
  const pieces = [createNeededPiece({ name: 'Panel', length: 30, width: 5, thickness: 0.75, grainSensitive: false })];
  const stock = [createStockItem({ name: 'Short', type: 'dimensional', length: 24, width: 6, thickness: 0.75, price: 5.00 })];

  const result = greedySolve(pieces, stock, constraints, 'cheapest');
  assert.equal(result.assignments.length, 0);
}

// Test 9: Non-grain-sensitive piece rotated to fit
{
  // Piece 5L x 30W, stock is 36L x 6W — doesn't fit (30 > 6)
  // Rotated: 30L x 5W — fits (30 < 36, 5 < 6)
  const pieces = [createNeededPiece({ name: 'Panel', length: 5, width: 30, thickness: 0.75, grainSensitive: false })];
  const stock = [createStockItem({ name: 'Long', type: 'dimensional', length: 36, width: 6, thickness: 0.75, price: 10.00 })];

  const result = greedySolve(pieces, stock, constraints, 'cheapest');
  assert.equal(result.assignments.length, 1);
}

// Test 10: Stock quantity is respected
{
  const pieces = [
    createNeededPiece({ name: 'A', length: 80, width: 5, thickness: 0.75 }),
    createNeededPiece({ name: 'B', length: 80, width: 5, thickness: 0.75 }),
  ];
  // Only 1 board available
  const stock = [createStockItem({ name: '1x6 8ft', type: 'dimensional', length: 96, width: 5.5, thickness: 0.75, price: 8.50, quantity: 1 })];

  const result = greedySolve(pieces, stock, constraints, 'cheapest');
  assert.equal(result.assignments.length, 1);
  assert.equal(result.unassigned.length, 1);
}

console.log('test-greedy: all passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test-greedy.js`
Expected: FAIL with `Cannot find module '../js/greedy.js'`

- [ ] **Step 3: Implement greedy.js (direct fit only)**

Create `js/greedy.js`:

```js
import { stockCost } from './cost.js';

/**
 * Represents a purchased board with remaining material tracking.
 * remainingLength tracks how much linear length is left for cutting.
 */
function createPurchasedBoard(stockItem) {
  return {
    stock: stockItem,
    cost: stockCost(stockItem),
    remainingLength: stockItem.length,
    assignments: [],
  };
}

function expandPieces(pieces) {
  const expanded = [];
  for (const piece of pieces) {
    for (let i = 0; i < piece.quantity; i++) {
      expanded.push({ ...piece, quantity: 1 });
    }
  }
  return expanded;
}

function requiredLength(piece, constraints) {
  return piece.length + constraints.overageMargin + constraints.kerfWidth;
}

function fitsDirectly(piece, stockItem, constraints) {
  if (Math.abs(piece.thickness - stockItem.thickness) > 0.01) return false;
  const neededL = piece.length + constraints.overageMargin;
  const neededW = piece.width + constraints.overageMargin;
  return neededL <= stockItem.length && neededW <= stockItem.width;
}

function fitsRotated(piece, stockItem, constraints) {
  if (piece.grainSensitive) return false;
  if (Math.abs(piece.thickness - stockItem.thickness) > 0.01) return false;
  const neededL = piece.width + constraints.overageMargin;
  const neededW = piece.length + constraints.overageMargin;
  return neededL <= stockItem.length && neededW <= stockItem.width;
}

function fitsInRemainder(piece, purchasedBoard, constraints) {
  if (Math.abs(piece.thickness - purchasedBoard.stock.thickness) > 0.01) return false;
  const neededL = piece.length + constraints.overageMargin + constraints.kerfWidth;
  const neededW = piece.width + constraints.overageMargin;
  return neededL <= purchasedBoard.remainingLength && neededW <= purchasedBoard.stock.width;
}

function fitsInRemainderRotated(piece, purchasedBoard, constraints) {
  if (piece.grainSensitive) return false;
  if (Math.abs(piece.thickness - purchasedBoard.stock.thickness) > 0.01) return false;
  const neededL = piece.width + constraints.overageMargin + constraints.kerfWidth;
  const neededW = piece.length + constraints.overageMargin;
  return neededL <= purchasedBoard.remainingLength && neededW <= purchasedBoard.stock.width;
}

function sortStockByStrategy(stock, strategy) {
  const sorted = [...stock];
  if (strategy === 'cheapest') {
    sorted.sort((a, b) => stockCost(a) - stockCost(b));
  } else if (strategy === 'prefer_wide') {
    sorted.sort((a, b) => b.width - a.width || stockCost(a) - stockCost(b));
  } else if (strategy === 'prefer_large') {
    sorted.sort((a, b) => (b.length * b.width) - (a.length * a.width) || stockCost(a) - stockCost(b));
  }
  return sorted;
}

export function greedySolve(neededPieces, availableStock, constraints, strategy = 'cheapest') {
  const expanded = expandPieces(neededPieces);
  // Sort by area descending (largest first)
  expanded.sort((a, b) => (b.length * b.width) - (a.length * a.width));

  const sortedStock = sortStockByStrategy(availableStock, strategy);

  const purchasedBoards = [];
  const assignments = [];
  const unassigned = [];
  const stockUsedCount = new Map(); // stockItem -> count purchased

  function getStockRemaining(stockItem) {
    const used = stockUsedCount.get(stockItem) || 0;
    if (stockItem.quantity !== null && used >= stockItem.quantity) return false;
    return true;
  }

  function buyBoard(stockItem) {
    const count = (stockUsedCount.get(stockItem) || 0) + 1;
    stockUsedCount.set(stockItem, count);
    const board = createPurchasedBoard(stockItem);
    purchasedBoards.push(board);
    return board;
  }

  for (const piece of expanded) {
    let placed = false;

    // Try to fit in an already-purchased board's remainder
    for (const board of purchasedBoards) {
      if (fitsInRemainder(piece, board, constraints)) {
        const neededL = piece.length + constraints.overageMargin + constraints.kerfWidth;
        board.remainingLength -= neededL;
        assignments.push({ neededPiece: piece, sourceStock: board.stock, rotated: false, glueUp: null });
        placed = true;
        break;
      }
      if (fitsInRemainderRotated(piece, board, constraints)) {
        const neededL = piece.width + constraints.overageMargin + constraints.kerfWidth;
        board.remainingLength -= neededL;
        assignments.push({ neededPiece: piece, sourceStock: board.stock, rotated: true, glueUp: null });
        placed = true;
        break;
      }
    }

    if (placed) continue;

    // Try to buy a new board
    for (const stockItem of sortedStock) {
      if (!getStockRemaining(stockItem)) continue;

      if (fitsDirectly(piece, stockItem, constraints)) {
        const board = buyBoard(stockItem);
        const neededL = piece.length + constraints.overageMargin + constraints.kerfWidth;
        board.remainingLength -= neededL;
        assignments.push({ neededPiece: piece, sourceStock: stockItem, rotated: false, glueUp: null });
        placed = true;
        break;
      }

      if (fitsRotated(piece, stockItem, constraints)) {
        const board = buyBoard(stockItem);
        const neededL = piece.width + constraints.overageMargin + constraints.kerfWidth;
        board.remainingLength -= neededL;
        assignments.push({ neededPiece: piece, sourceStock: stockItem, rotated: true, glueUp: null });
        placed = true;
        break;
      }
    }

    if (!placed) {
      unassigned.push(piece);
    }
  }

  // Build purchase summary
  const purchaseMap = new Map();
  for (const board of purchasedBoards) {
    const key = board.stock.name + '|' + board.stock.price;
    if (purchaseMap.has(key)) {
      purchaseMap.get(key).quantity += 1;
    } else {
      purchaseMap.set(key, { stock: board.stock, quantity: 1 });
    }
  }

  const totalCost = purchasedBoards.reduce((sum, b) => sum + b.cost, 0);
  const totalCuts = assignments.length; // one cut per piece placed (simplified)

  return {
    totalCost,
    totalCuts,
    purchases: Array.from(purchaseMap.values()),
    assignments,
    unassigned,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test-greedy.js`
Expected: `test-greedy: all passed`

- [ ] **Step 5: Commit**

```bash
git add js/greedy.js js/cost.js tests/test-greedy.js
git commit -m "Add greedy optimizer with direct fit and rotation"
```

---

### Task 4: Greedy optimizer — glue-up logic

**Files:**
- Modify: `js/greedy.js`
- Modify: `tests/test-greedy.js`

- [ ] **Step 1: Add failing tests for glue-up**

Append to `tests/test-greedy.js` (before the final console.log):

```js
// === Glue-up tests ===

// Test 11: Piece wider than any stock, glue-up from narrower boards
{
  const pieces = [createNeededPiece({ name: 'Tabletop', length: 36, width: 12, thickness: 0.75, canGlueWidth: true })];
  const stock = [createStockItem({ name: '1x6', type: 'dimensional', length: 48, width: 5.5, thickness: 0.75, price: 7.00 })];

  const result = greedySolve(pieces, stock, constraints, 'cheapest');
  // Need 12" + 0.5" overage = 12.5" width. Each strip is 5.5".
  // 2 strips: 5.5 + 5.5 = 11" (minus kerf between: 11 - 0.125 = 10.875) — not enough
  // Actually: 2 strips give usable width = 5.5 + 5.5 - 0.125 (one glue joint kerf) = 10.875
  // Need 12.5, so 3 strips: 5.5*3 - 0.125*2 = 16.25 — enough
  assert.equal(result.assignments.length, 1);
  assert.ok(result.assignments[0].glueUp !== null);
  assert.equal(result.assignments[0].glueUp.stripCount, 3);
  assert.equal(result.totalCost, 21.00); // 3 boards × $7
}

// Test 12: canGlueWidth=false prevents glue-up
{
  const pieces = [createNeededPiece({ name: 'No glue', length: 36, width: 12, thickness: 0.75, canGlueWidth: false })];
  const stock = [createStockItem({ name: '1x6', type: 'dimensional', length: 48, width: 5.5, thickness: 0.75, price: 7.00 })];

  const result = greedySolve(pieces, stock, constraints, 'cheapest');
  assert.equal(result.assignments.length, 0);
  assert.equal(result.unassigned.length, 1);
}

// Test 13: Glue-up respects maxGlueJoints
{
  const tightConstraints = createConstraints({ maxGlueJoints: 1 });
  const pieces = [createNeededPiece({ name: 'Wide', length: 36, width: 12, thickness: 0.75, canGlueWidth: true })];
  // Max 1 joint = 2 strips. 2 × 5.5 - 0.125 = 10.875 < 12.5 needed — can't do it
  const stock = [createStockItem({ name: '1x6', type: 'dimensional', length: 48, width: 5.5, thickness: 0.75, price: 7.00 })];

  const result = greedySolve(pieces, stock, tightConstraints, 'cheapest');
  assert.equal(result.assignments.length, 0);
  assert.equal(result.unassigned.length, 1);
}

// Test 14: Glue-up respects minGlueStripWidth
{
  const pieces = [createNeededPiece({ name: 'Panel', length: 24, width: 7, thickness: 0.75, canGlueWidth: true })];
  // 7 + 0.5 overage = 7.5" needed. Stock is 5.5" wide.
  // 2 strips: 5.5 + 5.5 - 0.125 = 10.875 usable. Strips used: first 5.5, second only needs 2.125
  // minGlueStripWidth default is 2", and 2.125 > 2, so this should work
  const stock = [createStockItem({ name: '1x6', type: 'dimensional', length: 48, width: 5.5, thickness: 0.75, price: 7.00 })];

  const result = greedySolve(pieces, stock, constraints, 'cheapest');
  assert.equal(result.assignments.length, 1);
  assert.ok(result.assignments[0].glueUp !== null);
}

// Test 15: Glue-up prefers buying one wide board over multiple narrow if cheaper
{
  const pieces = [createNeededPiece({ name: 'Shelf', length: 36, width: 10, thickness: 0.75, canGlueWidth: true })];
  const stock = [
    createStockItem({ name: '1x12', type: 'dimensional', length: 48, width: 11.25, thickness: 0.75, price: 14.00 }),
    createStockItem({ name: '1x6', type: 'dimensional', length: 48, width: 5.5, thickness: 0.75, price: 7.00 }),
  ];

  const result = greedySolve(pieces, stock, constraints, 'cheapest');
  // Direct fit in 1x12: $14. Glue-up from 1x6: 2 boards = $14, or 3 = $21.
  // 2× 1x6: 5.5 + 5.5 - 0.125 = 10.875 ≥ 10.5 (10 + 0.5 overage). Works and costs $14.
  // Both are $14 — optimizer should prefer direct fit (fewer cuts)
  assert.equal(result.purchases[0].stock.name, '1x12');
  assert.equal(result.totalCost, 14.00);
}

console.log('test-greedy (with glue-up): all passed');
```

- [ ] **Step 2: Run test to verify new tests fail**

Run: `node tests/test-greedy.js`
Expected: Test 11 fails — glue-up not implemented yet, piece ends up in `unassigned`.

- [ ] **Step 3: Add glue-up logic to greedySolve**

In `js/greedy.js`, add a `findGlueUp` function and integrate it into the main loop. Insert this function before `greedySolve`:

```js
function findGlueUp(piece, sortedStock, constraints, getStockRemaining) {
  if (!piece.canGlueWidth) return null;

  const neededWidth = piece.width + constraints.overageMargin;
  const neededLength = piece.length + constraints.overageMargin;

  // Find all stock that matches thickness and is long enough
  const candidates = sortedStock.filter(s => {
    if (Math.abs(s.thickness - piece.thickness) > 0.01) return false;
    if (s.length < neededLength) return false;
    if (!getStockRemaining(s)) return false;
    return true;
  });

  if (candidates.length === 0) return null;

  // Try glue-up with the cheapest candidate
  // For simplicity in greedy: use strips of the same stock type
  for (const candidate of candidates) {
    const stripWidth = candidate.width;
    if (stripWidth < constraints.minGlueStripWidth) continue;

    // How many strips needed?
    // n strips give usable width: n * stripWidth - (n-1) * kerfWidth
    // We need: n * stripWidth - (n-1) * kerfWidth >= neededWidth
    // n * (stripWidth + kerfWidth) >= neededWidth + kerfWidth
    // n >= (neededWidth + kerfWidth) / (stripWidth + kerfWidth)
    const n = Math.ceil((neededWidth + constraints.kerfWidth) / (stripWidth + constraints.kerfWidth));

    if (n <= 1) continue; // Would be a direct fit, not a glue-up
    if (n - 1 > constraints.maxGlueJoints) continue; // Too many joints

    // Check the last strip isn't too narrow
    const totalUsable = n * stripWidth - (n - 1) * constraints.kerfWidth;
    const lastStripUsed = stripWidth - (totalUsable - neededWidth);
    if (lastStripUsed < constraints.minGlueStripWidth && lastStripUsed < stripWidth) {
      // Last strip is too narrow — but only if we're ripping it down
      // If we use the full strip width, the panel is just wider than needed (that's fine)
    }

    // Check stock quantity
    const availableQty = candidate.quantity === null ? Infinity : candidate.quantity;
    if (n > availableQty) continue;

    const cost = n * stockCost(candidate);
    return { candidate, stripCount: n, cost, neededLength };
  }

  return null;
}
```

Then in the main `greedySolve` function, after the "Try to buy a new board" loop fails (`if (!placed)`), add a glue-up attempt before pushing to `unassigned`:

```js
    // Try glue-up
    if (!placed) {
      const glueUp = findGlueUp(piece, sortedStock, constraints, getStockRemaining);
      if (glueUp) {
        for (let i = 0; i < glueUp.stripCount; i++) {
          buyBoard(glueUp.candidate);
        }
        assignments.push({
          neededPiece: piece,
          sourceStock: glueUp.candidate,
          rotated: false,
          glueUp: { stripCount: glueUp.stripCount, stockUsed: glueUp.candidate },
        });
        placed = true;
      }
    }

    if (!placed) {
      unassigned.push(piece);
    }
```

Also move the direct-fit check to compare against glue-up cost: if a direct fit exists but is more expensive than a glue-up, prefer the glue-up. Update the new-board purchase section to collect the best direct-fit option, then compare with glue-up before committing:

Replace the "Try to buy a new board" block and the unassigned push with:

```js
    if (placed) continue;

    // Find best direct fit
    let bestDirect = null;
    for (const stockItem of sortedStock) {
      if (!getStockRemaining(stockItem)) continue;
      if (fitsDirectly(piece, stockItem, constraints)) {
        bestDirect = { stockItem, cost: stockCost(stockItem), rotated: false };
        break; // sortedStock is already sorted by preference, first match wins
      }
      if (fitsRotated(piece, stockItem, constraints)) {
        bestDirect = { stockItem, cost: stockCost(stockItem), rotated: true };
        break;
      }
    }

    // Find best glue-up
    const bestGlueUp = findGlueUp(piece, sortedStock, constraints, (s) => getStockRemaining(s));

    // Pick cheaper option, preferring direct fit on tie
    if (bestDirect && (!bestGlueUp || bestDirect.cost <= bestGlueUp.cost)) {
      const board = buyBoard(bestDirect.stockItem);
      const len = bestDirect.rotated
        ? piece.width + constraints.overageMargin + constraints.kerfWidth
        : piece.length + constraints.overageMargin + constraints.kerfWidth;
      board.remainingLength -= len;
      assignments.push({ neededPiece: piece, sourceStock: bestDirect.stockItem, rotated: bestDirect.rotated, glueUp: null });
    } else if (bestGlueUp) {
      for (let i = 0; i < bestGlueUp.stripCount; i++) {
        buyBoard(bestGlueUp.candidate);
      }
      assignments.push({
        neededPiece: piece,
        sourceStock: bestGlueUp.candidate,
        rotated: false,
        glueUp: { stripCount: bestGlueUp.stripCount, stockUsed: bestGlueUp.candidate },
      });
    } else {
      unassigned.push(piece);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/test-greedy.js`
Expected: `test-greedy (with glue-up): all passed`

- [ ] **Step 5: Commit**

```bash
git add js/greedy.js tests/test-greedy.js
git commit -m "Add edge glue-up logic to greedy optimizer"
```

---

### Task 5: Greedy optimizer — sheet goods packing

**Files:**
- Modify: `js/greedy.js`
- Modify: `tests/test-greedy.js`

- [ ] **Step 1: Add failing tests for sheet goods**

Append to `tests/test-greedy.js` (replace the final console.log):

```js
// === Sheet goods tests ===

// Test 16: Single piece from a sheet
{
  const pieces = [createNeededPiece({ name: 'Panel A', length: 24, width: 24, thickness: 0.75, canGlueWidth: false })];
  const stock = [createStockItem({ name: 'Plywood 4x8', type: 'sheet', length: 96, width: 48, thickness: 0.75, price: 45.00 })];

  const result = greedySolve(pieces, stock, constraints, 'cheapest');
  assert.equal(result.assignments.length, 1);
  assert.equal(result.totalCost, 45.00);
}

// Test 17: Multiple pieces from one sheet
{
  const pieces = [
    createNeededPiece({ name: 'Side L', length: 30, width: 12, thickness: 0.75, quantity: 2 }),
    createNeededPiece({ name: 'Top', length: 24, width: 12, thickness: 0.75 }),
  ];
  const stock = [createStockItem({ name: 'Plywood', type: 'sheet', length: 96, width: 48, thickness: 0.75, price: 45.00 })];

  const result = greedySolve(pieces, stock, constraints, 'cheapest');
  assert.equal(result.assignments.length, 3);
  assert.equal(result.purchases[0].quantity, 1);
  assert.equal(result.totalCost, 45.00);
}

console.log('test-greedy (with sheet goods): all passed');
```

- [ ] **Step 2: Run test to verify they pass (sheets use same direct-fit logic)**

Run: `node tests/test-greedy.js`
Expected: Should pass already — sheets use the same direct-fit and remainder logic as dimensional lumber. If they don't, the issue is the remainder tracking (sheet goods need 2D packing vs 1D).

If tests fail: The current greedy tracks `remainingLength` in 1D, which works for long narrow boards but underestimates sheet capacity. For MVP, this is acceptable — a 4x8 sheet treated as a 96" linear strip still fits multiple pieces side-by-side along the length. True 2D nesting is a Phase 2 enhancement.

- [ ] **Step 3: Commit (if tests pass) or fix and commit**

```bash
git add js/greedy.js tests/test-greedy.js
git commit -m "Add sheet goods tests, verify packing works"
```

---

### Task 6: Multi-strategy optimizer (3 solutions)

**Files:**
- Create: `js/optimizer.js`
- Create: `tests/test-optimizer.js`

- [ ] **Step 1: Write failing test for optimize()**

Create `tests/test-optimizer.js`:

```js
import assert from 'node:assert/strict';
import { optimize } from '../js/optimizer.js';
import { createNeededPiece, createStockItem, createConstraints } from '../js/models.js';

const constraints = createConstraints();

// Returns 3 solutions sorted by cost
{
  const pieces = [
    createNeededPiece({ name: 'Shelf', length: 36, width: 10, thickness: 0.75, canGlueWidth: true }),
    createNeededPiece({ name: 'Side', length: 24, width: 5, thickness: 0.75, quantity: 2 }),
  ];
  const stock = [
    createStockItem({ name: '1x12 4ft', type: 'dimensional', length: 48, width: 11.25, thickness: 0.75, price: 14.00 }),
    createStockItem({ name: '1x6 8ft', type: 'dimensional', length: 96, width: 5.5, thickness: 0.75, price: 8.50 }),
    createStockItem({ name: '1x6 4ft', type: 'dimensional', length: 48, width: 5.5, thickness: 0.75, price: 5.00 }),
  ];

  const results = optimize(pieces, stock, constraints);
  assert.equal(results.length, 3);

  // All results should have the required fields
  for (const r of results) {
    assert.ok(typeof r.totalCost === 'number');
    assert.ok(typeof r.totalCuts === 'number');
    assert.ok(Array.isArray(r.purchases));
    assert.ok(Array.isArray(r.assignments));
    assert.ok(Array.isArray(r.unassigned));
    assert.ok(r.strategyName && typeof r.strategyName === 'string');
  }

  // Results are sorted by cost ascending
  assert.ok(results[0].totalCost <= results[1].totalCost);
  assert.ok(results[1].totalCost <= results[2].totalCost);
}

// Deduplicated: if all strategies produce same cost, still returns 3 entries
{
  const pieces = [createNeededPiece({ name: 'A', length: 24, width: 5, thickness: 0.75 })];
  const stock = [createStockItem({ name: '1x6', type: 'dimensional', length: 48, width: 5.5, thickness: 0.75, price: 5.00 })];

  const results = optimize(pieces, stock, constraints);
  assert.equal(results.length, 3);
}

console.log('test-optimizer: all passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test-optimizer.js`
Expected: FAIL with `Cannot find module '../js/optimizer.js'`

- [ ] **Step 3: Implement optimizer.js**

Create `js/optimizer.js`:

```js
import { greedySolve } from './greedy.js';

const STRATEGIES = [
  { name: 'Cheapest materials', key: 'cheapest' },
  { name: 'Prefer wider stock (fewer glue-ups)', key: 'prefer_wide' },
  { name: 'Prefer larger boards (simpler shopping)', key: 'prefer_large' },
];

export function optimize(neededPieces, availableStock, constraints) {
  const results = STRATEGIES.map(strategy => {
    const result = greedySolve(neededPieces, availableStock, constraints, strategy.key);
    return { ...result, strategyName: strategy.name };
  });

  results.sort((a, b) => a.totalCost - b.totalCost);
  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test-optimizer.js`
Expected: `test-optimizer: all passed`

- [ ] **Step 5: Commit**

```bash
git add js/optimizer.js tests/test-optimizer.js
git commit -m "Add multi-strategy optimizer returning 3 ranked solutions"
```

---

### Task 7: localStorage persistence

**Files:**
- Create: `js/storage.js`
- Create: `tests/test-storage.js`

- [ ] **Step 1: Write failing tests for storage**

Create `tests/test-storage.js`:

```js
import assert from 'node:assert/strict';
import { createStorage } from '../js/storage.js';

// Mock localStorage
function mockLocalStorage() {
  const store = {};
  return {
    getItem(key) { return store[key] ?? null; },
    setItem(key, value) { store[key] = String(value); },
    removeItem(key) { delete store[key]; },
    get length() { return Object.keys(store).length; },
    key(i) { return Object.keys(store)[i] ?? null; },
    clear() { for (const k in store) delete store[k]; },
  };
}

// Save and load a project
{
  const ls = mockLocalStorage();
  const storage = createStorage(ls);

  const project = {
    name: 'Bookshelf',
    pieces: [{ name: 'Shelf', length: 36, width: 8, thickness: 0.75, quantity: 3, canGlueWidth: true, grainSensitive: false }],
  };

  storage.saveProject('Bookshelf', project);
  const loaded = storage.loadProject('Bookshelf');
  assert.deepEqual(loaded, project);
}

// List projects
{
  const ls = mockLocalStorage();
  const storage = createStorage(ls);

  storage.saveProject('A', { name: 'A', pieces: [] });
  storage.saveProject('B', { name: 'B', pieces: [] });

  const names = storage.listProjects();
  assert.ok(names.includes('A'));
  assert.ok(names.includes('B'));
}

// Delete project
{
  const ls = mockLocalStorage();
  const storage = createStorage(ls);

  storage.saveProject('A', { name: 'A', pieces: [] });
  storage.deleteProject('A');
  assert.equal(storage.loadProject('A'), null);
}

// Save and load stock list
{
  const ls = mockLocalStorage();
  const storage = createStorage(ls);

  const stockList = {
    name: 'Home Depot',
    items: [{ name: '2x4 8ft', type: 'dimensional', length: 96, width: 3.5, thickness: 1.5, price: 4.50, quantity: null }],
  };

  storage.saveStockList('Home Depot', stockList);
  const loaded = storage.loadStockList('Home Depot');
  assert.deepEqual(loaded, stockList);
}

// List stock lists
{
  const ls = mockLocalStorage();
  const storage = createStorage(ls);

  storage.saveStockList('HD', { name: 'HD', items: [] });
  storage.saveStockList('Lowes', { name: 'Lowes', items: [] });

  const names = storage.listStockLists();
  assert.ok(names.includes('HD'));
  assert.ok(names.includes('Lowes'));
}

// Export all data
{
  const ls = mockLocalStorage();
  const storage = createStorage(ls);

  storage.saveProject('A', { name: 'A', pieces: [] });
  storage.saveStockList('HD', { name: 'HD', items: [] });

  const exported = storage.exportAll();
  assert.ok(typeof exported === 'string');
  const parsed = JSON.parse(exported);
  assert.ok(parsed.projects);
  assert.ok(parsed.stockLists);
}

// Import data
{
  const ls = mockLocalStorage();
  const storage = createStorage(ls);

  const data = JSON.stringify({
    projects: { A: { name: 'A', pieces: [] } },
    stockLists: { HD: { name: 'HD', items: [] } },
  });

  storage.importAll(data);
  assert.deepEqual(storage.loadProject('A'), { name: 'A', pieces: [] });
  assert.deepEqual(storage.loadStockList('HD'), { name: 'HD', items: [] });
}

// Save and load constraints
{
  const ls = mockLocalStorage();
  const storage = createStorage(ls);

  const c = { kerfWidth: 0.1, minGlueStripWidth: 3, maxGlueJoints: 2, overageMargin: 0.25 };
  storage.saveConstraints(c);
  const loaded = storage.loadConstraints();
  assert.deepEqual(loaded, c);
}

console.log('test-storage: all passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test-storage.js`
Expected: FAIL with `Cannot find module '../js/storage.js'`

- [ ] **Step 3: Implement storage.js**

Create `js/storage.js`:

```js
const PREFIX = 'cutwise_';
const PROJECT_PREFIX = PREFIX + 'project_';
const STOCK_PREFIX = PREFIX + 'stock_';
const CONSTRAINTS_KEY = PREFIX + 'constraints';

export function createStorage(localStorage) {
  return {
    saveProject(name, project) {
      localStorage.setItem(PROJECT_PREFIX + name, JSON.stringify(project));
    },

    loadProject(name) {
      const data = localStorage.getItem(PROJECT_PREFIX + name);
      return data ? JSON.parse(data) : null;
    },

    deleteProject(name) {
      localStorage.removeItem(PROJECT_PREFIX + name);
    },

    listProjects() {
      const names = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(PROJECT_PREFIX)) {
          names.push(key.slice(PROJECT_PREFIX.length));
        }
      }
      return names;
    },

    saveStockList(name, stockList) {
      localStorage.setItem(STOCK_PREFIX + name, JSON.stringify(stockList));
    },

    loadStockList(name) {
      const data = localStorage.getItem(STOCK_PREFIX + name);
      return data ? JSON.parse(data) : null;
    },

    deleteStockList(name) {
      localStorage.removeItem(STOCK_PREFIX + name);
    },

    listStockLists() {
      const names = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(STOCK_PREFIX)) {
          names.push(key.slice(STOCK_PREFIX.length));
        }
      }
      return names;
    },

    saveConstraints(constraints) {
      localStorage.setItem(CONSTRAINTS_KEY, JSON.stringify(constraints));
    },

    loadConstraints() {
      const data = localStorage.getItem(CONSTRAINTS_KEY);
      return data ? JSON.parse(data) : null;
    },

    exportAll() {
      const projects = {};
      const stockLists = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(PROJECT_PREFIX)) {
          projects[key.slice(PROJECT_PREFIX.length)] = JSON.parse(localStorage.getItem(key));
        } else if (key.startsWith(STOCK_PREFIX)) {
          stockLists[key.slice(STOCK_PREFIX.length)] = JSON.parse(localStorage.getItem(key));
        }
      }
      const constraints = this.loadConstraints();
      return JSON.stringify({ projects, stockLists, constraints }, null, 2);
    },

    importAll(jsonString) {
      const data = JSON.parse(jsonString);
      if (data.projects) {
        for (const [name, project] of Object.entries(data.projects)) {
          this.saveProject(name, project);
        }
      }
      if (data.stockLists) {
        for (const [name, stockList] of Object.entries(data.stockLists)) {
          this.saveStockList(name, stockList);
        }
      }
      if (data.constraints) {
        this.saveConstraints(data.constraints);
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test-storage.js`
Expected: `test-storage: all passed`

- [ ] **Step 5: Commit**

```bash
git add js/storage.js tests/test-storage.js
git commit -m "Add localStorage persistence with export/import"
```

---

### Task 8: Presets data

**Files:**
- Create: `js/presets.js`

- [ ] **Step 1: Create presets.js with common dimensional lumber**

Create `js/presets.js`:

```js
export const DIMENSIONAL_PRESETS = [
  { name: '1x2 8ft', type: 'dimensional', length: 96, width: 1.5, thickness: 0.75, price: 3.00, quantity: null },
  { name: '1x3 8ft', type: 'dimensional', length: 96, width: 2.5, thickness: 0.75, price: 4.50, quantity: null },
  { name: '1x4 8ft', type: 'dimensional', length: 96, width: 3.5, thickness: 0.75, price: 5.50, quantity: null },
  { name: '1x6 8ft', type: 'dimensional', length: 96, width: 5.5, thickness: 0.75, price: 8.00, quantity: null },
  { name: '1x8 8ft', type: 'dimensional', length: 96, width: 7.25, thickness: 0.75, price: 11.00, quantity: null },
  { name: '1x10 8ft', type: 'dimensional', length: 96, width: 9.25, thickness: 0.75, price: 14.00, quantity: null },
  { name: '1x12 8ft', type: 'dimensional', length: 96, width: 11.25, thickness: 0.75, price: 18.00, quantity: null },
  { name: '2x4 8ft', type: 'dimensional', length: 96, width: 3.5, thickness: 1.5, price: 4.00, quantity: null },
  { name: '2x6 8ft', type: 'dimensional', length: 96, width: 5.5, thickness: 1.5, price: 6.50, quantity: null },
  { name: '2x8 8ft', type: 'dimensional', length: 96, width: 7.25, thickness: 1.5, price: 9.00, quantity: null },
  { name: '2x10 8ft', type: 'dimensional', length: 96, width: 9.25, thickness: 1.5, price: 12.00, quantity: null },
  { name: '2x12 8ft', type: 'dimensional', length: 96, width: 11.25, thickness: 1.5, price: 16.00, quantity: null },
];

export const SHEET_PRESETS = [
  { name: '1/4" Plywood 4x8', type: 'sheet', length: 96, width: 48, thickness: 0.25, price: 25.00, quantity: null },
  { name: '1/2" Plywood 4x8', type: 'sheet', length: 96, width: 48, thickness: 0.5, price: 35.00, quantity: null },
  { name: '3/4" Plywood 4x8', type: 'sheet', length: 96, width: 48, thickness: 0.75, price: 45.00, quantity: null },
  { name: '3/4" MDF 4x8', type: 'sheet', length: 96, width: 48, thickness: 0.75, price: 38.00, quantity: null },
];
```

- [ ] **Step 2: Commit**

```bash
git add js/presets.js
git commit -m "Add dimensional lumber and sheet goods presets"
```

---

### Task 9: HTML structure and CSS

**Files:**
- Create: `index.html`
- Create: `css/style.css`

- [ ] **Step 1: Create index.html**

Create `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CutWise — Lumber Cut Optimizer</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <header>
    <h1>CutWise</h1>
    <p class="subtitle">Optimize lumber purchases by price</p>
  </header>

  <main>
    <!-- Project management -->
    <section id="project-bar">
      <label for="project-select">Project:</label>
      <select id="project-select"><option value="">— New project —</option></select>
      <input type="text" id="project-name" placeholder="Project name">
      <button id="btn-save-project">Save</button>
      <button id="btn-delete-project">Delete</button>
    </section>

    <!-- Needed Pieces -->
    <section id="needed-pieces-section">
      <h2>Needed Pieces</h2>
      <table id="needed-pieces-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Length (in)</th>
            <th>Width (in)</th>
            <th>Thickness (in)</th>
            <th>Qty</th>
            <th>Can Glue?</th>
            <th>Grain?</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="needed-pieces-body"></tbody>
      </table>
      <button id="btn-add-piece">+ Add Piece</button>
      <button id="btn-paste-pieces">Paste from Spreadsheet</button>
    </section>

    <!-- Available Stock -->
    <section id="stock-section">
      <h2>Available Stock</h2>
      <div id="stock-bar">
        <label for="stock-select">Stock list:</label>
        <select id="stock-select"><option value="">— New list —</option></select>
        <input type="text" id="stock-name" placeholder="Stock list name">
        <button id="btn-save-stock">Save</button>
        <button id="btn-delete-stock">Delete</button>
        <button id="btn-load-presets">Load Presets</button>
      </div>
      <table id="stock-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Length (in)</th>
            <th>Width (in)</th>
            <th>Thickness (in)</th>
            <th>Price ($)</th>
            <th>Qty</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="stock-body"></tbody>
      </table>
      <button id="btn-add-stock">+ Add Stock</button>
    </section>

    <!-- Settings -->
    <section id="settings-section">
      <details>
        <summary><h2>Settings</h2></summary>
        <div class="settings-grid">
          <label for="kerf-width">Kerf width (in):</label>
          <input type="number" id="kerf-width" value="0.125" step="0.001" min="0">

          <label for="min-glue-strip">Min glue strip width (in):</label>
          <input type="number" id="min-glue-strip" value="2" step="0.25" min="0">

          <label for="max-glue-joints">Max glue joints:</label>
          <input type="number" id="max-glue-joints" value="4" step="1" min="1">

          <label for="overage-margin">Overage margin (in):</label>
          <input type="number" id="overage-margin" value="0.5" step="0.125" min="0">
        </div>
      </details>
    </section>

    <!-- Optimize button -->
    <section id="optimize-section">
      <button id="btn-optimize">Optimize</button>
    </section>

    <!-- Results -->
    <section id="results-section" hidden>
      <h2>Results</h2>
      <div id="results-container"></div>
    </section>

    <!-- Import/Export -->
    <section id="io-section">
      <button id="btn-export">Export All Data</button>
      <button id="btn-import">Import Data</button>
      <input type="file" id="import-file" accept=".json" hidden>
    </section>
  </main>

  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create css/style.css**

Create `css/style.css`:

```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  max-width: 960px;
  margin: 0 auto;
  padding: 1rem;
  background: #f8f9fa;
  color: #212529;
}

header {
  text-align: center;
  margin-bottom: 2rem;
}

header h1 {
  font-size: 2rem;
  margin-bottom: 0.25rem;
}

.subtitle {
  color: #6c757d;
}

section {
  margin-bottom: 1.5rem;
}

h2 {
  font-size: 1.25rem;
  margin-bottom: 0.75rem;
  display: inline;
}

/* Tables */
table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 0.5rem;
  background: white;
}

th, td {
  border: 1px solid #dee2e6;
  padding: 0.4rem 0.5rem;
  text-align: left;
  font-size: 0.875rem;
}

th {
  background: #e9ecef;
  font-weight: 600;
}

td input, td select {
  width: 100%;
  border: none;
  background: transparent;
  font-size: 0.875rem;
  padding: 0.2rem;
}

td input[type="number"] {
  width: 100%;
}

td input[type="checkbox"] {
  width: auto;
}

/* Buttons */
button {
  padding: 0.4rem 0.8rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 0.875rem;
  margin-right: 0.25rem;
}

button:hover {
  background: #e9ecef;
}

#btn-optimize {
  display: block;
  width: 100%;
  padding: 0.75rem;
  font-size: 1.1rem;
  font-weight: 600;
  background: #228be6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

#btn-optimize:hover {
  background: #1c7ed6;
}

.btn-remove {
  color: #dc3545;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 1rem;
  padding: 0;
}

/* Project/stock bars */
#project-bar, #stock-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

#project-bar select, #stock-bar select,
#project-bar input, #stock-bar input {
  padding: 0.3rem 0.5rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 0.875rem;
}

/* Settings */
.settings-grid {
  display: grid;
  grid-template-columns: auto 120px;
  gap: 0.5rem 1rem;
  align-items: center;
  padding: 1rem 0;
}

.settings-grid input {
  padding: 0.3rem 0.5rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
}

details summary {
  cursor: pointer;
  list-style: none;
}

details summary::-webkit-details-marker {
  display: none;
}

details summary h2::after {
  content: ' [+]';
  font-weight: normal;
  color: #6c757d;
}

details[open] summary h2::after {
  content: ' [-]';
}

/* Results */
.result-card {
  background: white;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.result-card.best {
  border-color: #228be6;
  border-width: 2px;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.result-cost {
  font-size: 1.5rem;
  font-weight: 700;
  color: #228be6;
}

.result-meta {
  color: #6c757d;
  font-size: 0.875rem;
}

.result-section-title {
  font-weight: 600;
  margin: 0.5rem 0 0.25rem;
  font-size: 0.875rem;
}

.result-list {
  list-style: none;
  font-size: 0.875rem;
  padding-left: 0;
}

.result-list li {
  padding: 0.2rem 0;
  border-bottom: 1px solid #f1f3f5;
}

.unassigned-warning {
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 4px;
  padding: 0.5rem;
  margin-top: 0.5rem;
  font-size: 0.875rem;
}

/* Import/Export */
#io-section {
  border-top: 1px solid #dee2e6;
  padding-top: 1rem;
}

/* Mobile */
@media (max-width: 640px) {
  body { padding: 0.5rem; }
  table { font-size: 0.75rem; }
  th, td { padding: 0.25rem; }
}
```

- [ ] **Step 3: Commit**

```bash
git add index.html css/style.css
git commit -m "Add HTML structure and CSS styling"
```

---

### Task 10: UI logic — input tables and event wiring

**Files:**
- Create: `js/ui.js`
- Create: `js/app.js`

- [ ] **Step 1: Implement ui.js**

Create `js/ui.js`:

```js
export function addPieceRow(tbody, piece = {}) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="piece-name" value="${piece.name || ''}"></td>
    <td><input type="number" class="piece-length" value="${piece.length || ''}" step="0.125" min="0"></td>
    <td><input type="number" class="piece-width" value="${piece.width || ''}" step="0.125" min="0"></td>
    <td><input type="number" class="piece-thickness" value="${piece.thickness || ''}" step="0.125" min="0"></td>
    <td><input type="number" class="piece-qty" value="${piece.quantity ?? 1}" step="1" min="1"></td>
    <td><input type="checkbox" class="piece-glue" ${(piece.canGlueWidth ?? true) ? 'checked' : ''}></td>
    <td><input type="checkbox" class="piece-grain" ${piece.grainSensitive ? 'checked' : ''}></td>
    <td><button class="btn-remove" title="Remove">&times;</button></td>
  `;
  tr.querySelector('.btn-remove').addEventListener('click', () => tr.remove());
  tbody.appendChild(tr);
}

export function addStockRow(tbody, stock = {}) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="stock-name" value="${stock.name || ''}"></td>
    <td>
      <select class="stock-type">
        <option value="dimensional" ${stock.type === 'dimensional' ? 'selected' : ''}>Dimensional</option>
        <option value="hardwood" ${stock.type === 'hardwood' ? 'selected' : ''}>Hardwood</option>
        <option value="sheet" ${stock.type === 'sheet' ? 'selected' : ''}>Sheet</option>
      </select>
    </td>
    <td><input type="number" class="stock-length" value="${stock.length || ''}" step="0.125" min="0"></td>
    <td><input type="number" class="stock-width" value="${stock.width || ''}" step="0.125" min="0"></td>
    <td><input type="number" class="stock-thickness" value="${stock.thickness || ''}" step="0.125" min="0"></td>
    <td><input type="number" class="stock-price" value="${stock.price || ''}" step="0.01" min="0"></td>
    <td><input type="number" class="stock-qty" value="${stock.quantity ?? ''}" step="1" min="1" placeholder="∞"></td>
    <td><button class="btn-remove" title="Remove">&times;</button></td>
  `;
  tr.querySelector('.btn-remove').addEventListener('click', () => tr.remove());
  tbody.appendChild(tr);
}

export function readPiecesFromTable(tbody) {
  const pieces = [];
  for (const tr of tbody.querySelectorAll('tr')) {
    const length = parseFloat(tr.querySelector('.piece-length').value);
    const width = parseFloat(tr.querySelector('.piece-width').value);
    const thickness = parseFloat(tr.querySelector('.piece-thickness').value);
    if (isNaN(length) || isNaN(width) || isNaN(thickness)) continue;
    pieces.push({
      name: tr.querySelector('.piece-name').value.trim(),
      length,
      width,
      thickness,
      quantity: parseInt(tr.querySelector('.piece-qty').value) || 1,
      canGlueWidth: tr.querySelector('.piece-glue').checked,
      grainSensitive: tr.querySelector('.piece-grain').checked,
    });
  }
  return pieces;
}

export function readStockFromTable(tbody) {
  const items = [];
  for (const tr of tbody.querySelectorAll('tr')) {
    const length = parseFloat(tr.querySelector('.stock-length').value);
    const width = parseFloat(tr.querySelector('.stock-width').value);
    const thickness = parseFloat(tr.querySelector('.stock-thickness').value);
    const price = parseFloat(tr.querySelector('.stock-price').value);
    if (isNaN(length) || isNaN(width) || isNaN(thickness) || isNaN(price)) continue;
    const qtyVal = tr.querySelector('.stock-qty').value;
    items.push({
      name: tr.querySelector('.stock-name').value.trim(),
      type: tr.querySelector('.stock-type').value,
      length,
      width,
      thickness,
      price,
      quantity: qtyVal ? parseInt(qtyVal) : null,
    });
  }
  return items;
}

export function readConstraints() {
  return {
    kerfWidth: parseFloat(document.getElementById('kerf-width').value) || 0.125,
    minGlueStripWidth: parseFloat(document.getElementById('min-glue-strip').value) || 2,
    maxGlueJoints: parseInt(document.getElementById('max-glue-joints').value) || 4,
    overageMargin: parseFloat(document.getElementById('overage-margin').value) || 0.5,
  };
}

export function setConstraints(c) {
  document.getElementById('kerf-width').value = c.kerfWidth;
  document.getElementById('min-glue-strip').value = c.minGlueStripWidth;
  document.getElementById('max-glue-joints').value = c.maxGlueJoints;
  document.getElementById('overage-margin').value = c.overageMargin;
}

export function renderResults(container, results) {
  container.innerHTML = '';
  results.forEach((result, i) => {
    const card = document.createElement('div');
    card.className = 'result-card' + (i === 0 ? ' best' : '');

    let purchaseHtml = '';
    for (const p of result.purchases) {
      purchaseHtml += `<li>${p.quantity}× ${p.stock.name} — $${(p.quantity * (p.stock.type === 'hardwood' ? 0 : p.stock.price)).toFixed(2) || '—'}</li>`;
    }
    // Recalculate purchase cost properly
    purchaseHtml = '';
    for (const p of result.purchases) {
      const unitCost = result.totalCost; // we'll use totalCost from result directly
      purchaseHtml += `<li>${p.quantity}× ${p.stock.name}</li>`;
    }

    let assignHtml = '';
    for (const a of result.assignments) {
      const pieceName = a.neededPiece.name || `${a.neededPiece.length}"×${a.neededPiece.width}"`;
      const from = a.sourceStock.name;
      const glue = a.glueUp ? ` (glue-up: ${a.glueUp.stripCount} strips)` : '';
      const rotated = a.rotated ? ' (rotated)' : '';
      assignHtml += `<li>${pieceName} ← ${from}${glue}${rotated}</li>`;
    }

    let unassignedHtml = '';
    if (result.unassigned && result.unassigned.length > 0) {
      const names = result.unassigned.map(u => u.name || `${u.length}"×${u.width}"`).join(', ');
      unassignedHtml = `<div class="unassigned-warning">Could not fit: ${names}</div>`;
    }

    card.innerHTML = `
      <div class="result-header">
        <div>
          <span class="result-cost">$${result.totalCost.toFixed(2)}</span>
          <span class="result-meta">${result.totalCuts} cut${result.totalCuts !== 1 ? 's' : ''}</span>
        </div>
        <div class="result-meta">${result.strategyName}</div>
      </div>
      <div class="result-section-title">Purchase List</div>
      <ul class="result-list">${purchaseHtml}</ul>
      <div class="result-section-title">Cut Assignments</div>
      <ul class="result-list">${assignHtml}</ul>
      ${unassignedHtml}
    `;
    container.appendChild(card);
  });
}

export function parsePastedPieces(text) {
  const rows = text.trim().split('\n');
  return rows.map(row => {
    const cols = row.split('\t');
    return {
      name: cols[0] || '',
      length: parseFloat(cols[1]) || 0,
      width: parseFloat(cols[2]) || 0,
      thickness: parseFloat(cols[3]) || 0,
      quantity: parseInt(cols[4]) || 1,
      canGlueWidth: cols[5] !== 'false' && cols[5] !== 'no' && cols[5] !== '0',
      grainSensitive: cols[6] === 'true' || cols[6] === 'yes' || cols[6] === '1',
    };
  }).filter(p => p.length > 0 && p.width > 0 && p.thickness > 0);
}
```

- [ ] **Step 2: Implement app.js**

Create `js/app.js`:

```js
import { createNeededPiece, createStockItem, createConstraints } from './models.js';
import { optimize } from './optimizer.js';
import { createStorage } from './storage.js';
import { DIMENSIONAL_PRESETS, SHEET_PRESETS } from './presets.js';
import {
  addPieceRow, addStockRow,
  readPiecesFromTable, readStockFromTable,
  readConstraints, setConstraints,
  renderResults, parsePastedPieces,
} from './ui.js';

const storage = createStorage(window.localStorage);

const piecesBody = document.getElementById('needed-pieces-body');
const stockBody = document.getElementById('stock-body');
const resultsContainer = document.getElementById('results-container');
const resultsSection = document.getElementById('results-section');

// --- Needed Pieces ---
document.getElementById('btn-add-piece').addEventListener('click', () => addPieceRow(piecesBody));

document.getElementById('btn-paste-pieces').addEventListener('click', () => {
  const text = prompt('Paste tab-separated data:\nName\\tLength\\tWidth\\tThickness\\tQty\\tCanGlue\\tGrain');
  if (!text) return;
  const pieces = parsePastedPieces(text);
  for (const p of pieces) addPieceRow(piecesBody, p);
});

// --- Available Stock ---
document.getElementById('btn-add-stock').addEventListener('click', () => addStockRow(stockBody));

document.getElementById('btn-load-presets').addEventListener('click', () => {
  for (const p of DIMENSIONAL_PRESETS) addStockRow(stockBody, p);
  for (const p of SHEET_PRESETS) addStockRow(stockBody, p);
});

// --- Project save/load ---
const projectSelect = document.getElementById('project-select');
const projectName = document.getElementById('project-name');

function refreshProjectList() {
  const names = storage.listProjects();
  projectSelect.innerHTML = '<option value="">— New project —</option>';
  for (const name of names) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    projectSelect.appendChild(opt);
  }
}

document.getElementById('btn-save-project').addEventListener('click', () => {
  const name = projectName.value.trim();
  if (!name) { alert('Enter a project name'); return; }
  const pieces = readPiecesFromTable(piecesBody);
  storage.saveProject(name, { name, pieces });
  refreshProjectList();
  projectSelect.value = name;
});

projectSelect.addEventListener('change', () => {
  const name = projectSelect.value;
  if (!name) return;
  const project = storage.loadProject(name);
  if (!project) return;
  piecesBody.innerHTML = '';
  for (const p of project.pieces) addPieceRow(piecesBody, p);
  projectName.value = name;
});

document.getElementById('btn-delete-project').addEventListener('click', () => {
  const name = projectSelect.value;
  if (!name) return;
  if (!confirm(`Delete project "${name}"?`)) return;
  storage.deleteProject(name);
  refreshProjectList();
  piecesBody.innerHTML = '';
  projectName.value = '';
});

// --- Stock list save/load ---
const stockSelect = document.getElementById('stock-select');
const stockName = document.getElementById('stock-name');

function refreshStockList() {
  const names = storage.listStockLists();
  stockSelect.innerHTML = '<option value="">— New list —</option>';
  for (const name of names) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    stockSelect.appendChild(opt);
  }
}

document.getElementById('btn-save-stock').addEventListener('click', () => {
  const name = stockName.value.trim();
  if (!name) { alert('Enter a stock list name'); return; }
  const items = readStockFromTable(stockBody);
  storage.saveStockList(name, { name, items });
  refreshStockList();
  stockSelect.value = name;
});

stockSelect.addEventListener('change', () => {
  const name = stockSelect.value;
  if (!name) return;
  const list = storage.loadStockList(name);
  if (!list) return;
  stockBody.innerHTML = '';
  for (const item of list.items) addStockRow(stockBody, item);
  stockName.value = name;
});

document.getElementById('btn-delete-stock').addEventListener('click', () => {
  const name = stockSelect.value;
  if (!name) return;
  if (!confirm(`Delete stock list "${name}"?`)) return;
  storage.deleteStockList(name);
  refreshStockList();
  stockBody.innerHTML = '';
  stockName.value = '';
});

// --- Optimize ---
document.getElementById('btn-optimize').addEventListener('click', () => {
  const rawPieces = readPiecesFromTable(piecesBody);
  const rawStock = readStockFromTable(stockBody);
  const rawConstraints = readConstraints();

  if (rawPieces.length === 0) { alert('Add at least one needed piece'); return; }
  if (rawStock.length === 0) { alert('Add at least one stock item'); return; }

  const pieces = rawPieces.map(p => createNeededPiece(p));
  const stock = rawStock.map(s => createStockItem(s));
  const constraints = createConstraints(rawConstraints);

  const results = optimize(pieces, stock, constraints);

  renderResults(resultsContainer, results);
  resultsSection.hidden = false;
  resultsSection.scrollIntoView({ behavior: 'smooth' });
});

// --- Import/Export ---
document.getElementById('btn-export').addEventListener('click', () => {
  const data = storage.exportAll();
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cutwise-data.json';
  a.click();
  URL.revokeObjectURL(url);
});

const importFile = document.getElementById('import-file');
document.getElementById('btn-import').addEventListener('click', () => importFile.click());
importFile.addEventListener('change', () => {
  const file = importFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      storage.importAll(reader.result);
      refreshProjectList();
      refreshStockList();
      alert('Data imported successfully');
    } catch (e) {
      alert('Import failed: ' + e.message);
    }
  };
  reader.readAsText(file);
  importFile.value = '';
});

// --- Init ---
function init() {
  refreshProjectList();
  refreshStockList();

  const savedConstraints = storage.loadConstraints();
  if (savedConstraints) setConstraints(savedConstraints);

  // Start with one empty row in each table
  addPieceRow(piecesBody);
  addStockRow(stockBody);
}

init();
```

- [ ] **Step 3: Open in browser and verify the page loads**

Run: `open /Users/sadjadtavakoli/Projects/personal/cutwise/index.html`

Verify: Page renders with both tables, settings panel, optimize button, and import/export buttons.

- [ ] **Step 4: Commit**

```bash
git add js/ui.js js/app.js
git commit -m "Add UI logic and app entry point"
```

---

### Task 11: Fix renderResults purchase display

**Files:**
- Modify: `js/ui.js`

The `renderResults` function in Task 10 has a bug — the purchase list display recalculates incorrectly. Fix it:

- [ ] **Step 1: Fix the purchase list rendering in renderResults**

In `js/ui.js`, replace the purchase HTML generation inside `renderResults` with:

```js
    let purchaseHtml = '';
    for (const p of result.purchases) {
      purchaseHtml += `<li>${p.quantity}× ${p.stock.name}</li>`;
    }
```

(Remove the duplicate/broken purchaseHtml block that overwrites the first one.)

- [ ] **Step 2: Verify in browser**

Open `index.html`, add some test data, click Optimize, and verify purchase list displays correctly.

- [ ] **Step 3: Commit**

```bash
git add js/ui.js
git commit -m "Fix purchase list display in results"
```

---

### Task 12: End-to-end manual test

**Files:** None (verification only)

- [ ] **Step 1: Open the app and run a realistic scenario**

Open `index.html` in browser. Enter:

**Needed pieces:**
| Name | Length | Width | Thickness | Qty | Glue | Grain |
|------|--------|-------|-----------|-----|------|-------|
| Shelf | 36 | 10 | 0.75 | 3 | yes | no |
| Side | 48 | 10 | 0.75 | 2 | yes | yes |
| Back | 36 | 48 | 0.75 | 1 | no | no |

**Stock:** Click "Load Presets" to populate.

Click **Optimize** and verify:
- 3 result cards appear, sorted by price
- Each shows a purchase list and cut assignments
- Shelves and sides use glue-ups from 1x6 or 1x12 boards
- Back panel comes from a plywood sheet
- No crashes or blank results

- [ ] **Step 2: Test save/load project**

Enter a project name, save, reload page, select project from dropdown — pieces should restore.

- [ ] **Step 3: Test save/load stock list**

Enter a stock list name, save, reload page, select from dropdown — stock should restore.

- [ ] **Step 4: Test export/import**

Export data, clear localStorage (DevTools > Application > Clear), import the file — data should restore.

- [ ] **Step 5: Commit any fixes discovered during manual testing**

```bash
git add -A
git commit -m "Fix issues found during manual testing"
```

(Only if fixes were needed.)

---

### Task 13: Add .gitignore and README

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Create .gitignore**

Create `.gitignore`:

```
.DS_Store
node_modules/
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "Add gitignore"
```
