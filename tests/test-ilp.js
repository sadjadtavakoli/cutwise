import assert from 'node:assert/strict';
import { ilpOptimize } from '../js/ilp-optimizer.js';
import { createNeededPiece, createStockItem, createConstraints } from '../js/models.js';

const constraints = createConstraints();

// Test 1: Single piece, picks cheapest stock
{
  const pieces = [createNeededPiece({ name: 'A', length: 24, width: 5, thickness: 0.75 })];
  const stock = [
    createStockItem({ name: 'Expensive', type: 'dimensional', length: 96, width: 5.5, thickness: 0.75, price: 15.00 }),
    createStockItem({ name: 'Cheap', type: 'dimensional', length: 48, width: 5.5, thickness: 0.75, price: 5.00 }),
  ];

  const results = ilpOptimize(pieces, stock, constraints);
  assert.equal(results[0].totalCost, 5.00);
  assert.equal(results[0].assignments.length, 1);
  console.log('Test 1 passed: picks cheapest stock');
}

// Test 2: Multiple pieces packed into one board (the key advantage over greedy)
{
  const pieces = [
    createNeededPiece({ name: 'A', length: 36, width: 5, thickness: 0.75 }),
    createNeededPiece({ name: 'B', length: 36, width: 5, thickness: 0.75 }),
  ];
  const stock = [createStockItem({ name: '1x6 8ft', type: 'dimensional', length: 96, width: 5.5, thickness: 0.75, price: 8.50 })];

  const results = ilpOptimize(pieces, stock, constraints);
  assert.equal(results[0].totalCost, 8.50);
  assert.equal(results[0].purchases[0].quantity, 1);
  console.log('Test 2 passed: packs 2 pieces in 1 board');
}

// Test 3: Glue-up + leftover reuse (the bug scenario)
// Base needs glue-up from 3 boards, legs should come from leftover — total 3 boards not 7
{
  const pieces = [
    createNeededPiece({ name: 'Base', length: 30, width: 12, thickness: 0.75, canGlueWidth: true }),
    createNeededPiece({ name: 'Leg', length: 24, width: 3, thickness: 0.75, quantity: 4 }),
  ];
  const stock = [createStockItem({ name: '1x6 8ft', type: 'dimensional', length: 96, width: 5.5, thickness: 0.75, price: 8.00 })];

  const results = ilpOptimize(pieces, stock, constraints);
  console.log(`Test 3: cost=$${results[0].totalCost}, boards=${results[0].purchases[0]?.quantity}`);
  assert.equal(results[0].totalCost, 24.00); // 3 boards × $8
  assert.equal(results[0].purchases[0].quantity, 3);
  console.log('Test 3 passed: glue-up boards reuse leftover for legs');
}

// Test 4: Quantity expansion works
{
  const pieces = [createNeededPiece({ name: 'Slat', length: 18, width: 3, thickness: 0.75, quantity: 5 })];
  const stock = [createStockItem({ name: '1x4 8ft', type: 'dimensional', length: 96, width: 3.5, thickness: 0.75, price: 6.00 })];

  const results = ilpOptimize(pieces, stock, constraints);
  // 5 slats × (18 + 0.5 + 0.125) = 93.125, fits in one 96" board
  assert.equal(results[0].totalCost, 6.00);
  assert.equal(results[0].purchases[0].quantity, 1);
  console.log('Test 4 passed: 5 slats fit in 1 board');
}

// Test 5: Returns 3 results
{
  const pieces = [createNeededPiece({ name: 'A', length: 24, width: 5, thickness: 0.75 })];
  const stock = [createStockItem({ name: '1x6', type: 'dimensional', length: 48, width: 5.5, thickness: 0.75, price: 5.00 })];

  const results = ilpOptimize(pieces, stock, constraints);
  assert.equal(results.length, 3);
  for (const r of results) {
    assert.ok(typeof r.totalCost === 'number');
    assert.ok(typeof r.strategyName === 'string');
  }
  console.log('Test 5 passed: returns 3 results');
}

// Test 6: Thickness mismatch — piece unassigned
{
  const pieces = [createNeededPiece({ name: 'A', length: 24, width: 3, thickness: 0.75 })];
  const stock = [createStockItem({ name: '2x4', type: 'dimensional', length: 96, width: 3.5, thickness: 1.5, price: 4.00 })];

  const results = ilpOptimize(pieces, stock, constraints);
  assert.equal(results[0].unassigned.length, 1);
  console.log('Test 6 passed: thickness mismatch');
}

// Test 7: Real-world scenario — the user's "bozorg" case
// Bases need glue-up, legs should share boards with base glue-up strips
{
  const pieces = [
    createNeededPiece({ name: 'base', length: 40, width: 20, thickness: 1, canGlueWidth: true, quantity: 2 }),
    createNeededPiece({ name: 'smaller base', length: 30, width: 15, thickness: 1, canGlueWidth: true, quantity: 2 }),
    createNeededPiece({ name: 'paye', length: 20, width: 5, thickness: 1, quantity: 16 }),
  ];
  const stock = [createStockItem({ name: 'bozorg', type: 'dimensional', length: 200, width: 10, thickness: 1, price: 15.00 })];

  const results = ilpOptimize(pieces, stock, constraints);
  console.log(`Test 7 (bozorg): cost=$${results[0].totalCost}, boards=${results[0].purchases[0]?.quantity}`);
  console.log(`  Assignments: ${results[0].assignments.length}, Unassigned: ${results[0].unassigned.length}`);
  // Should be way fewer than 12 boards
  assert.ok(results[0].totalCost < 180, `Expected < $180 but got $${results[0].totalCost}`);
  console.log('Test 7 passed: bozorg scenario optimal');
}

console.log('\ntest-ilp: all passed');
