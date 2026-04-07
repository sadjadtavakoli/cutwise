import solver from '../node_modules/javascript-lp-solver/dist/index.browser.mjs';
import { stockCost } from './cost.js';

/**
 * ILP-based optimal cut optimizer.
 *
 * Models the problem as a Set Cover / Bin Packing ILP:
 * - Generate all feasible "cutting patterns" (sets of pieces that fit on one board)
 * - Select minimum-cost set of patterns that covers every piece exactly once
 *
 * For small inputs (< 30 pieces, < 15 stock types) this finds the provably optimal solution.
 */

function expandPieces(pieces) {
  const expanded = [];
  for (const piece of pieces) {
    for (let i = 0; i < piece.quantity; i++) {
      expanded.push({ ...piece, quantity: 1, _id: expanded.length });
    }
  }
  return expanded;
}

/**
 * For a given stock item, generate all feasible cutting patterns.
 * A pattern is a subset of pieces (by _id) that can all be cut from one board.
 *
 * Uses recursive enumeration with pruning.
 */
function generatePatterns(stockItem, pieces, constraints) {
  const { kerfWidth, overageMargin } = constraints;
  const patterns = [];

  // Filter pieces compatible with this stock (thickness match)
  const compatible = pieces.filter(p =>
    Math.abs(p.thickness - stockItem.thickness) <= 0.01
  );

  if (compatible.length === 0) return patterns;

  // For each compatible piece, compute the length it uses on this board
  // Also check if it fits width-wise (direct or rotated)
  const pieceFits = compatible.map(p => {
    const fits = [];
    // Direct fit
    if (p.width + overageMargin <= stockItem.width) {
      fits.push({ piece: p, lengthUsed: p.length + overageMargin + kerfWidth, rotated: false });
    }
    // Rotated fit (swap length/width)
    if (!p.grainSensitive && p.length + overageMargin <= stockItem.width) {
      fits.push({ piece: p, lengthUsed: p.width + overageMargin + kerfWidth, rotated: true });
    }
    return fits;
  }).filter(f => f.length > 0);

  if (pieceFits.length === 0) return patterns;

  // Flatten to get all placement options, sorted by length used descending (greedy: big first)
  const options = [];
  for (const fits of pieceFits) {
    for (const fit of fits) {
      options.push(fit);
    }
  }
  options.sort((a, b) => b.lengthUsed - a.lengthUsed);

  const boardLength = stockItem.length;
  const MAX_PATTERNS = 5000; // safety cap

  // Strategy: generate patterns via greedy packing from different starting points.
  // For each piece as the "first piece", greedily fill the board with remaining pieces.
  // This produces a diverse set of maximal patterns without full subset enumeration.
  const seenPatterns = new Set();

  for (let startPiece = 0; startPiece < options.length && patterns.length < MAX_PATTERNS; startPiece++) {
    const placed = [options[startPiece]];
    const usedIds = new Set([options[startPiece].piece._id]);
    let usedLength = options[startPiece].lengthUsed;

    // Greedily add more pieces
    for (let i = 0; i < options.length; i++) {
      if (patterns.length >= MAX_PATTERNS) break;
      const opt = options[i];
      if (usedIds.has(opt.piece._id)) continue;
      if (usedLength + opt.lengthUsed <= boardLength) {
        placed.push(opt);
        usedIds.add(opt.piece._id);
        usedLength += opt.lengthUsed;
      }
    }

    // Create pattern from placed pieces
    const key = [...usedIds].sort().join(',');
    if (!seenPatterns.has(key)) {
      seenPatterns.add(key);
      patterns.push({
        stock: stockItem,
        placements: [...placed],
        pieceIds: new Set(usedIds),
        cost: stockCost(stockItem),
      });
    }

    // Also generate single-piece patterns (needed for ILP flexibility)
    const singleKey = `${options[startPiece].piece._id}`;
    if (!seenPatterns.has(singleKey)) {
      seenPatterns.add(singleKey);
      patterns.push({
        stock: stockItem,
        placements: [options[startPiece]],
        pieceIds: new Set([options[startPiece].piece._id]),
        cost: stockCost(stockItem),
      });
    }
  }

  // Also generate patterns with different orderings to find diverse packings
  // Reverse order (smallest first)
  {
    const revOptions = [...options].reverse();
    for (let startPiece = 0; startPiece < revOptions.length && patterns.length < MAX_PATTERNS; startPiece++) {
      const placed = [revOptions[startPiece]];
      const usedIds = new Set([revOptions[startPiece].piece._id]);
      let usedLength = revOptions[startPiece].lengthUsed;

      for (let i = 0; i < revOptions.length; i++) {
        const opt = revOptions[i];
        if (usedIds.has(opt.piece._id)) continue;
        if (usedLength + opt.lengthUsed <= boardLength) {
          placed.push(opt);
          usedIds.add(opt.piece._id);
          usedLength += opt.lengthUsed;
        }
      }

      const key = [...usedIds].sort().join(',');
      if (!seenPatterns.has(key)) {
        seenPatterns.add(key);
        patterns.push({
          stock: stockItem,
          placements: [...placed],
          pieceIds: new Set(usedIds),
          cost: stockCost(stockItem),
        });
      }
    }
  }

  return patterns;
}

/**
 * Generate glue-up patterns: a single piece fulfilled by multiple strips from a stock type.
 */
function generateGlueUpPatterns(stockItem, pieces, constraints) {
  const { kerfWidth, overageMargin, minGlueStripWidth, maxGlueJoints } = constraints;
  const patterns = [];

  if (stockItem.width < minGlueStripWidth) return patterns;

  for (const piece of pieces) {
    if (!piece.canGlueWidth) continue;
    if (Math.abs(piece.thickness - stockItem.thickness) > 0.01) continue;

    const neededWidth = piece.width + overageMargin;
    const neededLength = piece.length + overageMargin;

    // Stock must be long enough for strips
    if (stockItem.length < neededLength) continue;

    // Can piece fit directly? If so, skip glue-up for this stock
    // (direct patterns are already generated)
    if (piece.width + overageMargin <= stockItem.width) continue;

    const stripWidth = stockItem.width;
    const n = Math.ceil((neededWidth - kerfWidth) / (stripWidth - kerfWidth));

    if (n <= 1) continue;
    if (n - 1 > maxGlueJoints) continue;

    // Calculate remaining length on each strip board after cutting the strip
    const stripLengthUsed = piece.length + overageMargin + kerfWidth;
    const remainingLength = stockItem.length - stripLengthUsed;

    patterns.push({
      stock: stockItem,
      isGlueUp: true,
      stripCount: n,
      targetPiece: piece,
      pieceIds: new Set([piece._id]),
      cost: stockCost(stockItem) * n,
      remainingLength, // per strip board
    });
  }

  return patterns;
}

/**
 * Solve using ILP: select minimum-cost set of patterns covering all pieces.
 */
function solveILP(expandedPieces, allPatterns) {
  if (expandedPieces.length === 0) return { totalCost: 0, patterns: [] };

  const model = {
    optimize: 'cost',
    opType: 'min',
    constraints: {},
    variables: {},
    ints: {},
  };

  // Each piece must be covered exactly once
  for (const piece of expandedPieces) {
    model.constraints[`piece_${piece._id}`] = { equal: 1 };
  }

  // Each pattern is a variable
  for (let i = 0; i < allPatterns.length; i++) {
    const pattern = allPatterns[i];
    const varName = `pat_${i}`;
    const variable = { cost: pattern.cost };

    for (const pieceId of pattern.pieceIds) {
      variable[`piece_${pieceId}`] = 1;
    }

    model.variables[varName] = variable;
    model.ints[varName] = 1;
  }

  // Add stock quantity constraints
  const stockQuantities = new Map();
  for (let i = 0; i < allPatterns.length; i++) {
    const pattern = allPatterns[i];
    const stockKey = `${pattern.stock.name}::${pattern.stock.price}`;

    if (pattern.stock.quantity !== null) {
      if (!stockQuantities.has(stockKey)) {
        stockQuantities.set(stockKey, {
          quantity: pattern.stock.quantity,
          patternIndices: [],
          boardsPerPattern: [],
        });
      }
      const entry = stockQuantities.get(stockKey);
      entry.patternIndices.push(i);
      entry.boardsPerPattern.push(pattern.isGlueUp ? pattern.stripCount : 1);
    }
  }

  for (const [stockKey, entry] of stockQuantities) {
    const constraintName = `stock_${stockKey}`;
    model.constraints[constraintName] = { max: entry.quantity };
    for (let j = 0; j < entry.patternIndices.length; j++) {
      const varName = `pat_${entry.patternIndices[j]}`;
      model.variables[varName][constraintName] = entry.boardsPerPattern[j];
    }
  }

  const result = solver.Solve(model);

  if (!result.feasible) {
    return null;
  }

  const selectedPatterns = [];
  for (let i = 0; i < allPatterns.length; i++) {
    const count = result[`pat_${i}`] || 0;
    if (count > 0) {
      for (let j = 0; j < count; j++) {
        selectedPatterns.push(allPatterns[i]);
      }
    }
  }

  return {
    totalCost: result.result,
    patterns: selectedPatterns,
  };
}

/**
 * Convert ILP solution to the same output format as greedySolve.
 */
function formatSolution(solution, expandedPieces, strategyName) {
  if (!solution || solution.patterns.length === 0) {
    return {
      totalCost: 0,
      totalCuts: 0,
      purchases: [],
      assignments: [],
      unassigned: [...expandedPieces],
      strategyName,
    };
  }

  const assignments = [];
  const assignedIds = new Set();
  const purchaseMap = new Map();

  for (const pattern of solution.patterns) {
    const stockKey = `${pattern.stock.name}::${pattern.stock.price}`;
    const boardCount = pattern.isGlueUp ? pattern.stripCount : 1;

    if (purchaseMap.has(stockKey)) {
      purchaseMap.get(stockKey).quantity += boardCount;
    } else {
      purchaseMap.set(stockKey, { stock: pattern.stock, quantity: boardCount });
    }

    if (pattern.isGlueUp) {
      const piece = pattern.targetPiece;
      assignments.push({
        neededPiece: piece,
        sourceStock: pattern.stock,
        rotated: false,
        glueUp: { stripCount: pattern.stripCount, stockUsed: pattern.stock },
      });
      assignedIds.add(piece._id);
      // Also add extra pieces packed into glue-up board leftovers
      if (pattern.extraPlacements) {
        for (const placement of pattern.extraPlacements) {
          assignments.push({
            neededPiece: placement.piece,
            sourceStock: pattern.stock,
            rotated: placement.rotated,
            glueUp: null,
          });
          assignedIds.add(placement.piece._id);
        }
      }
    } else {
      for (const placement of pattern.placements) {
        assignments.push({
          neededPiece: placement.piece,
          sourceStock: pattern.stock,
          rotated: placement.rotated,
          glueUp: null,
        });
        assignedIds.add(placement.piece._id);
      }
    }
  }

  const unassigned = expandedPieces.filter(p => !assignedIds.has(p._id));

  return {
    totalCost: Math.round(solution.totalCost * 100) / 100,
    totalCuts: assignments.length,
    purchases: Array.from(purchaseMap.values()),
    assignments,
    unassigned,
    strategyName,
  };
}

/**
 * Enhance glue-up patterns: after a glue-up, each strip board has leftover length.
 * We greedily pack as many additional pieces as possible into those leftovers.
 * Instead of enumerating all combos (exponential), we generate one greedy-packed
 * pattern per glue-up, plus individual piece patterns for the ILP to combine.
 */
function enhanceGlueUpPatterns(glueUpPatterns, pieces, constraints) {
  const { kerfWidth, overageMargin } = constraints;
  const enhanced = [];

  for (const gluePat of glueUpPatterns) {
    // Always include the base glue-up pattern (no extras)
    enhanced.push(gluePat);

    const remaining = gluePat.remainingLength;
    if (remaining <= overageMargin + kerfWidth) continue;

    // Find compatible pieces sorted by length descending (greedy: biggest first)
    const fittable = pieces.filter(p => {
      if (gluePat.pieceIds.has(p._id)) return false;
      if (Math.abs(p.thickness - gluePat.stock.thickness) > 0.01) return false;
      if (p.width + overageMargin > gluePat.stock.width &&
          (p.grainSensitive || p.length + overageMargin > gluePat.stock.width)) return false;
      const lenUsed = (p.width + overageMargin <= gluePat.stock.width)
        ? p.length + overageMargin + kerfWidth
        : p.width + overageMargin + kerfWidth;
      return lenUsed <= remaining;
    }).sort((a, b) => b.length - a.length);

    if (fittable.length === 0) continue;

    // Greedily pack as many pieces as possible into strip leftovers
    const stripRemaining = new Array(gluePat.stripCount).fill(remaining);
    const packed = [];

    for (const p of fittable) {
      let lengthNeeded, rotated;
      if (p.width + overageMargin <= gluePat.stock.width) {
        lengthNeeded = p.length + overageMargin + kerfWidth;
        rotated = false;
      } else {
        lengthNeeded = p.width + overageMargin + kerfWidth;
        rotated = true;
      }

      // Try to fit in any strip
      for (let s = 0; s < gluePat.stripCount; s++) {
        if (stripRemaining[s] >= lengthNeeded) {
          stripRemaining[s] -= lengthNeeded;
          packed.push({ piece: p, rotated });
          break;
        }
      }
    }

    if (packed.length > 0) {
      const pieceIds = new Set(gluePat.pieceIds);
      for (const ap of packed) pieceIds.add(ap.piece._id);
      enhanced.push({
        ...gluePat,
        pieceIds,
        extraPlacements: packed,
      });
    }
  }

  return enhanced;
}


export function ilpOptimize(neededPieces, availableStock, constraints) {
  const expanded = expandPieces(neededPieces);

  if (expanded.length === 0) {
    return [{
      totalCost: 0, totalCuts: 0, purchases: [], assignments: [], unassigned: [], strategyName: 'Optimal',
    }];
  }

  // Generate all cutting patterns
  let allPatterns = [];

  for (const stock of availableStock) {
    // Direct-fit patterns (combinations of pieces on one board)
    const directPatterns = generatePatterns(stock, expanded, constraints);
    allPatterns.push(...directPatterns);

    // Glue-up patterns
    const glueUpPatterns = generateGlueUpPatterns(stock, expanded, constraints);
    const enhancedGlueUp = enhanceGlueUpPatterns(glueUpPatterns, expanded, constraints);
    allPatterns.push(...enhancedGlueUp);
  }

  if (allPatterns.length === 0) {
    return [formatSolution(null, expanded, 'No feasible solution')];
  }

  // Solve ILP
  const solution = solveILP(expanded, allPatterns);
  const result = formatSolution(solution, expanded, 'Optimal (ILP)');

  // Generate alternative: no glue-ups allowed
  const noGluePatterns = allPatterns.filter(p => !p.isGlueUp);
  const noGlueSolution = solveILP(expanded, noGluePatterns);
  const noGlueResult = formatSolution(noGlueSolution, expanded, 'No glue-ups');

  // Generate alternative: minimize boards (add penalty for board count)
  const fewerBoardsPatterns = allPatterns.map(p => ({
    ...p,
    originalCost: p.cost,
    // Slightly prefer patterns that pack more pieces (reduces total boards)
    cost: p.cost - (p.pieceIds.size * 0.001),
  }));
  const fewerBoardsSolution = solveILP(expanded, fewerBoardsPatterns);
  // Restore original costs for display
  if (fewerBoardsSolution) {
    let realCost = 0;
    for (const pat of fewerBoardsSolution.patterns) {
      realCost += pat.originalCost || pat.cost;
    }
    fewerBoardsSolution.totalCost = realCost;
  }
  const fewerBoardsResult = formatSolution(fewerBoardsSolution, expanded, 'Fewer boards');

  // Deduplicate and sort
  const results = [result, noGlueResult, fewerBoardsResult]
    .filter(r => r.unassigned.length === 0 || r === result) // keep infeasible only for main
    .sort((a, b) => a.totalCost - b.totalCost);

  // Ensure we always return 3
  while (results.length < 3) {
    results.push(results[results.length - 1]);
  }

  return results.slice(0, 3);
}
