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
