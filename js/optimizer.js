import { ilpOptimize } from './ilp-optimizer.js';

export function optimize(neededPieces, availableStock, constraints) {
  return ilpOptimize(neededPieces, availableStock, constraints);
}
