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

console.log('test-greedy: all passed');
