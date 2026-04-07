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
