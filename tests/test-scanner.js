import assert from 'node:assert/strict';
import { parseLabelText } from '../js/scanner.js';

// Test 1: Standard shelf label "2 x 4 x 8" with price
{
  const result = parseLabelText('Whitewood 2 x 4 x 8 $3.98');
  assert.equal(result.thickness, 1.5);
  assert.equal(result.width, 3.5);
  assert.equal(result.length, 96);
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

// Test 3: Label with unicode multiply and inch/foot marks
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
