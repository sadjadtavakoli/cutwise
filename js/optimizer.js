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
