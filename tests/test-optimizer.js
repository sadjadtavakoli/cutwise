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

  for (const r of results) {
    assert.ok(typeof r.totalCost === 'number');
    assert.ok(typeof r.totalCuts === 'number');
    assert.ok(Array.isArray(r.purchases));
    assert.ok(Array.isArray(r.assignments));
    assert.ok(Array.isArray(r.unassigned));
    assert.ok(r.strategyName && typeof r.strategyName === 'string');
  }

  assert.ok(results[0].totalCost <= results[1].totalCost);
  assert.ok(results[1].totalCost <= results[2].totalCost);
}

// All strategies produce results even with simple input
{
  const pieces = [createNeededPiece({ name: 'A', length: 24, width: 5, thickness: 0.75 })];
  const stock = [createStockItem({ name: '1x6', type: 'dimensional', length: 48, width: 5.5, thickness: 0.75, price: 5.00 })];

  const results = optimize(pieces, stock, constraints);
  assert.equal(results.length, 3);
}

console.log('test-optimizer: all passed');
