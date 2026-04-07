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
