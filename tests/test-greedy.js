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

// Test 7: Grain-sensitive piece is not rotated
{
  const pieces = [createNeededPiece({ name: 'Top', length: 36, width: 10, thickness: 0.75, grainSensitive: true })];
  const stock = [createStockItem({ name: 'Wide board', type: 'dimensional', length: 48, width: 11, thickness: 0.75, price: 20.00 })];

  const result = greedySolve(pieces, stock, constraints, 'cheapest');
  assert.equal(result.assignments.length, 1);
}

// Test 8: Non-grain-sensitive piece — doesn't fit either way
{
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

// === Glue-up tests ===

// Test 11: Piece wider than any stock, glue-up from narrower boards
{
  const pieces = [createNeededPiece({ name: 'Tabletop', length: 36, width: 12, thickness: 0.75, canGlueWidth: true })];
  const stock = [createStockItem({ name: '1x6', type: 'dimensional', length: 48, width: 5.5, thickness: 0.75, price: 7.00 })];

  const result = greedySolve(pieces, stock, constraints, 'cheapest');
  // Need 12" + 0.5" overage = 12.5" width. Each strip is 5.5".
  // 2 strips: 5.5 + 5.5 - 0.125 (one kerf) = 10.875 — not enough
  // 3 strips: 5.5*3 - 0.125*2 = 16.25 — enough
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
  // 2 strips: 5.5 + 5.5 - 0.125 = 10.875 usable. Enough, and narrowest strip is still full width.
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
  // Direct fit in 1x12: $14. Glue-up from 2× 1x6: $14.
  // Same cost — prefer direct fit (fewer cuts)
  assert.equal(result.purchases[0].stock.name, '1x12');
  assert.equal(result.totalCost, 14.00);
}

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
