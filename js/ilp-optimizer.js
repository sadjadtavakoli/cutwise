import solver from 'javascript-lp-solver';
import { stockCost } from './cost.js';

/**
 * ILP-based cut optimizer with full 2D guillotine cutting.
 *
 * MODEL: A board is ripped into columns (strips running the full board length).
 * Each column is then independently crosscut into pieces. Glue-up pieces consume
 * multiple crosscuts from columns of the appropriate width.
 *
 * A "pattern" describes one board: which columns it's ripped into, and which
 * pieces are crosscut from each column.
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
 * Given a column (strip) of dimensions colLength × colWidth, and a list of pieces,
 * greedily pack as many pieces as possible by crosscutting along the column length.
 * Returns array of { piece, lengthUsed }.
 */
function packColumn(colLength, colWidth, pieces, constraints, usedIds) {
  const { kerfWidth, overageMargin } = constraints;
  let remaining = colLength;
  const packed = [];

  for (const p of pieces) {
    if (usedIds.has(p._id)) continue;
    const pw = p.width + overageMargin;
    const pl = p.length + overageMargin + kerfWidth;
    // Check piece fits in this column width
    if (pw > colWidth + 0.001) continue;
    // Check piece fits in remaining length
    if (pl > remaining + 0.001) continue;
    packed.push({ piece: p, lengthUsed: pl });
    remaining -= pl;
    usedIds.add(p._id);
  }
  return packed;
}

/**
 * Generate all feasible cutting patterns for one board type.
 *
 * Strategy: enumerate "rip plans" — ways to divide the board width into columns.
 * For each rip plan, greedily fill each column with pieces (direct or glue-up strips).
 *
 * A glue-up is modeled as: N crosscuts from a column of width W, where N*W ≥ pieceWidth.
 * The crosscuts are just regular uses of column length.
 */
function generatePatterns(stockItem, pieces, constraints) {
  const { kerfWidth, overageMargin, minGlueStripWidth, maxGlueJoints } = constraints;
  const boardLen = stockItem.length;
  const boardW = stockItem.width;
  const patterns = [];
  const MAX_PATTERNS = 5000;
  const seenKeys = new Set();

  // Filter compatible pieces
  const compatible = pieces.filter(p =>
    Math.abs(p.thickness - stockItem.thickness) <= 0.01
  );
  if (compatible.length === 0) return patterns;

  // Determine all useful column widths:
  // 1. Each piece width + overage (for direct cuts)
  // 2. Partial widths for glue-ups: minStripWidth for each glue-up piece
  // 3. Full board width
  const colWidthSet = new Set();
  colWidthSet.add(boardW); // full width

  for (const p of compatible) {
    const pw = p.width + overageMargin;
    if (pw <= boardW + 0.001) colWidthSet.add(pw);
    // For non-grain-sensitive, rotated width
    if (!p.grainSensitive) {
      const pl = p.length + overageMargin;
      if (pl <= boardW + 0.001) colWidthSet.add(pl);
    }
    // Glue-up strip widths: for N strips, minWidth = neededWidth/N
    if (p.canGlueWidth && pw > boardW) {
      for (let n = 2; n <= maxGlueJoints + 1; n++) {
        const minW = pw / n;
        if (minW >= minGlueStripWidth && minW <= boardW) {
          colWidthSet.add(Math.ceil(minW * 100) / 100); // round up slightly
        }
      }
    }
  }

  const colWidths = [...colWidthSet].filter(w => w <= boardW + 0.001).sort((a, b) => a - b);

  // For each piece, precompute which column widths it can use and how
  // Returns: { piece, colWidth, lengthPerCut, cutsNeeded, isGlueUp, stripCount }
  function getPiecePlacements(piece) {
    const placements = [];
    const pw = piece.width + overageMargin;
    const pl = piece.length + overageMargin + kerfWidth;

    for (const cw of colWidths) {
      // Direct fit: piece width fits in column
      if (pw <= cw + 0.001 && pl <= boardLen + 0.001) {
        placements.push({
          piece, colWidth: cw, lengthPerCut: pl,
          cutsNeeded: 1, isGlueUp: false, stripCount: 0,
        });
      }
      // Glue-up: piece too wide, but N strips of this column width cover it
      if (piece.canGlueWidth && pw > boardW && cw >= minGlueStripWidth) {
        const n = Math.ceil(pw / cw);
        if (n > 1 && n - 1 <= maxGlueJoints) {
          const cutLen = piece.length + overageMargin + kerfWidth;
          if (cutLen <= boardLen + 0.001) {
            placements.push({
              piece, colWidth: cw, lengthPerCut: cutLen,
              cutsNeeded: n, isGlueUp: true, stripCount: n,
            });
          }
        }
      }
    }
    return placements;
  }

  // Generate rip plans and pack pieces
  // Strategy: for each pair of column widths (w1, w2), try packing

  // Helper: given a rip plan (array of {colWidth, colLength}), pack pieces greedily
  function packRipPlan(columns, sortedPieces) {
    const usedIds = new Set();
    const placements = []; // { piece, colIdx, isGlueUp, stripCount, colWidth }

    // First pass: place glue-up pieces (they need multiple cuts from same column width)
    for (const p of sortedPieces) {
      if (usedIds.has(p._id)) continue;
      if (!p.canGlueWidth) continue;
      const pw = p.width + overageMargin;
      if (pw <= boardW + 0.001) continue; // fits directly, handle later

      const cutLen = p.length + overageMargin + kerfWidth;

      // Find columns that can provide glue-up strips
      for (const cw of colWidths) {
        if (cw < minGlueStripWidth) continue;
        const nStrips = Math.ceil(pw / cw);
        if (nStrips <= 1 || nStrips - 1 > maxGlueJoints) continue;

        // Find columns of this width with enough remaining length
        // Use original column references so remaining updates propagate
        const matchingCols = columns
          .filter(c => Math.abs(c.width - cw) < 0.01 && c.remaining >= cutLen);

        // Need nStrips cuts, can come from different columns of same width
        if (matchingCols.length === 0) continue;

        let cutsPlaced = 0;
        const undoList = []; // { col, amount } for rollback
        for (const col of matchingCols) {
          while (cutsPlaced < nStrips && col.remaining >= cutLen) {
            col.remaining -= cutLen;
            cutsPlaced++;
            undoList.push({ col, amount: cutLen });
          }
          if (cutsPlaced >= nStrips) break;
        }

        if (cutsPlaced >= nStrips) {
          placements.push({
            piece: p, isGlueUp: true, stripCount: nStrips, colWidth: cw,
          });
          usedIds.add(p._id);
          break;
        } else {
          // Undo: restore remaining for partially used columns
          for (const entry of undoList) {
            entry.col.remaining += entry.amount;
          }
        }
      }
    }

    // Second pass: place direct-fit pieces
    for (const p of sortedPieces) {
      if (usedIds.has(p._id)) continue;
      const pw = p.width + overageMargin;
      const pl = p.length + overageMargin + kerfWidth;

      // Find smallest column that fits this piece's width
      for (const col of columns) {
        if (col.width >= pw - 0.001 && col.remaining >= pl - 0.001) {
          col.remaining -= pl;
          placements.push({
            piece: p, isGlueUp: false, stripCount: 0, colWidth: col.width,
          });
          usedIds.add(p._id);
          break;
        }
      }
    }

    return { placements, usedIds };
  }

  function addPattern(placements, usedIds) {
    if (placements.length === 0) return;
    const key = [...usedIds].sort().join(',');
    if (seenKeys.has(key)) return;
    seenKeys.add(key);

    // Build demands/sections for compatibility with formatSolution
    const demands = placements.map(pl => {
      const sections = [];
      const nCuts = pl.isGlueUp ? pl.stripCount : 1;
      const cutLen = pl.piece.length + overageMargin + kerfWidth;
      for (let i = 0; i < nCuts; i++) {
        sections.push({ width: pl.colWidth, length: cutLen });
      }
      return {
        piece: pl.piece,
        type: pl.isGlueUp ? 'glueup' : 'direct',
        rotated: false,
        stripCount: pl.stripCount,
        sections,
      };
    });

    patterns.push({
      stock: stockItem,
      demands,
      pieceIds: new Set(usedIds),
      cost: stockCost(stockItem),
    });
  }

  // Sort pieces: largest area first for better greedy packing
  const sortedByArea = [...compatible].sort((a, b) =>
    (b.length * b.width) - (a.length * a.width)
  );

  // Strategy 1: Single column width (full-width or ripped into equal strips)
  for (const cw of colWidths) {
    if (patterns.length >= MAX_PATTERNS) break;
    const numCols = Math.floor((boardW + kerfWidth) / (cw + kerfWidth));
    if (numCols <= 0) continue;

    const columns = [];
    for (let i = 0; i < numCols; i++) columns.push({ width: cw, remaining: boardLen });

    const { placements, usedIds } = packRipPlan(columns, sortedByArea);
    addPattern(placements, usedIds);

    // Also try smallest-first
    const sortedSmall = [...compatible].sort((a, b) =>
      (a.length * a.width) - (b.length * b.width)
    );
    const columns2 = [];
    for (let i = 0; i < numCols; i++) columns2.push({ width: cw, remaining: boardLen });
    const { placements: p2, usedIds: u2 } = packRipPlan(columns2, sortedSmall);
    addPattern(p2, u2);
  }

  // Strategy 2: Two different column widths
  for (let i = 0; i < colWidths.length && patterns.length < MAX_PATTERNS; i++) {
    for (let j = i; j < colWidths.length && patterns.length < MAX_PATTERNS; j++) {
      const w1 = colWidths[i];
      const w2 = colWidths[j];

      // Try various counts of each
      for (let n1 = 1; patterns.length < MAX_PATTERNS; n1++) {
        const usedW1 = n1 * w1 + (n1 - 1) * kerfWidth;
        if (usedW1 > boardW + 0.001) break;

        const remainW = boardW - usedW1 - kerfWidth;
        if (remainW < w2 - 0.001) continue;

        const maxN2 = Math.floor((remainW + kerfWidth) / (w2 + kerfWidth));
        for (let n2 = (i === j ? 0 : 1); n2 <= maxN2 && patterns.length < MAX_PATTERNS; n2++) {
          if (n1 + n2 < 1) continue;

          const columns = [];
          for (let c = 0; c < n1; c++) columns.push({ width: w1, remaining: boardLen });
          for (let c = 0; c < n2; c++) columns.push({ width: w2, remaining: boardLen });

          const { placements, usedIds } = packRipPlan(columns, sortedByArea);
          addPattern(placements, usedIds);
        }
      }
    }
  }

  // Strategy 3: Same-type patterns (only one piece type per board)
  const byName = new Map();
  for (const p of compatible) {
    const key = p.name || `${p.length}x${p.width}`;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(p);
  }
  for (const [, samePieces] of byName) {
    if (patterns.length >= MAX_PATTERNS) break;
    for (const cw of colWidths) {
      const numCols = Math.floor((boardW + kerfWidth) / (cw + kerfWidth));
      if (numCols <= 0) continue;
      const columns = [];
      for (let i = 0; i < numCols; i++) columns.push({ width: cw, remaining: boardLen });
      const { placements, usedIds } = packRipPlan(columns, samePieces);
      addPattern(placements, usedIds);
    }
  }

  // Single-piece patterns (always needed for ILP flexibility)
  for (const p of compatible) {
    const pw = p.width + overageMargin;
    if (pw <= boardW + 0.001) {
      addPattern(
        [{ piece: p, isGlueUp: false, stripCount: 0, colWidth: pw }],
        new Set([p._id])
      );
    }
    // Single glue-up
    if (p.canGlueWidth && pw > boardW) {
      for (let n = 2; n <= maxGlueJoints + 1; n++) {
        const minW = pw / n;
        if (minW < minGlueStripWidth || minW > boardW) continue;
        const cw = Math.ceil(minW * 100) / 100;
        if (cw > boardW) continue;
        addPattern(
          [{ piece: p, isGlueUp: true, stripCount: n, colWidth: cw }],
          new Set([p._id])
        );
        break; // only need the fewest-strips option
      }
    }
  }

  return patterns;
}

// --- ILP solver ---

function solvePatternILP(expandedPieces, allPatterns) {
  if (expandedPieces.length === 0) return { totalCost: 0, patterns: [] };

  const model = {
    optimize: 'cost',
    opType: 'min',
    constraints: {},
    variables: {},
    ints: {},
  };

  for (const piece of expandedPieces) {
    model.constraints[`piece_${piece._id}`] = { equal: 1 };
  }

  for (let i = 0; i < allPatterns.length; i++) {
    const pattern = allPatterns[i];
    const boardArea = pattern.stock.length * pattern.stock.width;
    const usedArea = pattern.demands.reduce((sum, d) =>
      sum + d.sections.reduce((s, sec) => s + sec.width * sec.length, 0), 0);
    const wastePenalty = boardArea > 0 ? ((boardArea - usedArea) / boardArea) * 0.001 : 0;
    const jointPenalty = pattern.demands.reduce((sum, d) =>
      sum + (d.type === 'glueup' ? (d.stripCount - 2) * 0.0001 : 0), 0);

    const varName = `pat_${i}`;
    const variable = { cost: pattern.cost + wastePenalty + jointPenalty };
    for (const pieceId of pattern.pieceIds) {
      variable[`piece_${pieceId}`] = 1;
    }
    model.variables[varName] = variable;
    model.ints[varName] = 1;
  }

  // Stock quantity constraints
  const stockQuantities = new Map();
  for (let i = 0; i < allPatterns.length; i++) {
    const pattern = allPatterns[i];
    const stockKey = `${pattern.stock.name}::${pattern.stock.price}`;
    if (pattern.stock.quantity !== null) {
      if (!stockQuantities.has(stockKey)) {
        stockQuantities.set(stockKey, { quantity: pattern.stock.quantity, indices: [] });
      }
      stockQuantities.get(stockKey).indices.push(i);
    }
  }
  for (const [stockKey, entry] of stockQuantities) {
    const cName = `stock_${stockKey}`;
    model.constraints[cName] = { max: entry.quantity };
    for (const idx of entry.indices) {
      model.variables[`pat_${idx}`][cName] = 1;
    }
  }

  const result = solver.Solve(model);
  if (!result.feasible) return null;

  const selectedPatterns = [];
  for (let i = 0; i < allPatterns.length; i++) {
    const count = result[`pat_${i}`] || 0;
    for (let j = 0; j < count; j++) selectedPatterns.push(allPatterns[i]);
  }
  return { totalCost: result.result, patterns: selectedPatterns };
}

// --- Format output ---

function formatSolution(solution, expandedPieces, strategyName) {
  if (!solution || solution.patterns.length === 0) {
    return {
      totalCost: 0, totalCuts: 0, purchases: [], assignments: [],
      unassigned: [...expandedPieces], strategyName, boards: [],
    };
  }

  const assignments = [];
  const assignedIds = new Set();
  const purchaseMap = new Map();
  const boards = [];

  for (const pattern of solution.patterns) {
    const stockKey = `${pattern.stock.name}::${pattern.stock.price}`;
    if (purchaseMap.has(stockKey)) {
      purchaseMap.get(stockKey).quantity += 1;
    } else {
      purchaseMap.set(stockKey, { stock: pattern.stock, quantity: 1 });
    }

    const boardEntry = { stock: pattern.stock, pieces: [] };

    for (const demand of pattern.demands) {
      const isGlue = demand.type === 'glueup';
      assignments.push({
        neededPiece: demand.piece,
        sourceStock: pattern.stock,
        rotated: demand.rotated || false,
        glueUp: isGlue ? { stripCount: demand.stripCount, stockUsed: pattern.stock } : null,
      });
      assignedIds.add(demand.piece._id);

      boardEntry.pieces.push({
        piece: demand.piece,
        rotated: demand.rotated || false,
        glueUp: isGlue ? { stripCount: demand.stripCount } : null,
        sections: demand.sections,
      });
    }

    boards.push(boardEntry);
  }

  return {
    totalCost: Math.round(solution.totalCost * 100) / 100,
    totalCuts: assignments.length,
    purchases: Array.from(purchaseMap.values()),
    assignments,
    unassigned: expandedPieces.filter(p => !assignedIds.has(p._id)),
    strategyName,
    boards,
  };
}

// --- Main entry point ---

export function ilpOptimize(neededPieces, availableStock, constraints) {
  const expanded = expandPieces(neededPieces);
  if (expanded.length === 0) {
    return [{ totalCost: 0, totalCuts: 0, purchases: [], assignments: [], unassigned: [], strategyName: 'Optimal', boards: [] }];
  }

  let allPatterns = [];
  for (const stock of availableStock) {
    allPatterns.push(...generatePatterns(stock, expanded, constraints));
  }

  if (allPatterns.length === 0) {
    return [formatSolution(null, expanded, 'No feasible solution')];
  }

  const solution = solvePatternILP(expanded, allPatterns);
  const result = formatSolution(solution, expanded, 'Optimal (ILP)');

  // Alternative: no glue-ups
  const noGluePatterns = allPatterns.filter(p => !p.demands.some(d => d.type === 'glueup'));
  const noGlueSolution = solvePatternILP(expanded, noGluePatterns);
  const noGlueResult = formatSolution(noGlueSolution, expanded, 'No glue-ups');

  // Alternative: fewer boards
  const fewerPatterns = allPatterns.map(p => ({
    ...p, originalCost: p.cost,
    cost: p.cost - (p.pieceIds.size * 0.001),
  }));
  const fewerSolution = solvePatternILP(expanded, fewerPatterns);
  if (fewerSolution) {
    fewerSolution.totalCost = fewerSolution.patterns.reduce((s, p) => s + (p.originalCost || p.cost), 0);
  }
  const fewerResult = formatSolution(fewerSolution, expanded, 'Fewer boards');

  const results = [result, noGlueResult, fewerResult]
    .filter(r => r.unassigned.length === 0 || r === result)
    .sort((a, b) => a.totalCost - b.totalCost);

  while (results.length < 3) results.push(results[results.length - 1]);
  return results.slice(0, 3);
}
