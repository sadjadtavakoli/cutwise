import solver from 'javascript-lp-solver';
import { stockCost } from './cost.js';

/**
 * CutWise ILP Optimizer — Clean rewrite
 *
 * Phase 1: Decompose pieces into rectangular ITEMS (direct pieces or glue-up strips)
 * Phase 2: Pack items onto boards (2D bin packing with guillotine cuts)
 * Phase 3: ILP selects minimum-cost board patterns covering all items
 *
 * Board cutting model:
 * - Mode A "rip-only": board ripped into columns, items crosscut within columns
 * - Mode B "crosscut-then-rip": wide items crosscut first (full board width),
 *   then remaining area ripped into columns for narrower items
 */

// ──────────────────────────────────────────────
// PHASE 1: Expand pieces → rectangular items
// ──────────────────────────────────────────────

function createItems(pieces, availableStock, constraints) {
  const { overageMargin, kerfWidth, minGlueStripWidth, maxGlueJoints } = constraints;
  const items = [];
  let nextId = 0;

  // Max stock width per thickness (for determining glue-up feasibility)
  const maxWidthByThickness = new Map();
  for (const s of availableStock) {
    const cur = maxWidthByThickness.get(s.thickness) || 0;
    if (s.width > cur) maxWidthByThickness.set(s.thickness, s.width);
  }

  for (const piece of pieces) {
    const pw = piece.width + overageMargin;
    const pl = piece.length + overageMargin + kerfWidth;
    const maxW = maxWidthByThickness.get(piece.thickness) || 0;

    if (pw <= maxW + 0.001) {
      // Direct fit: single rectangular item
      items.push({
        _id: nextId++, width: pw, length: pl,
        piece, isDirect: true, isStrip: false,
        stripNum: 0, totalStrips: 0,
      });
    } else if (piece.canGlueWidth && maxW >= minGlueStripWidth) {
      // Glue-up: decompose into N strip items
      const n = Math.ceil(pw / maxW);
      if (n - 1 <= maxGlueJoints) {
        const stripW = Math.ceil((pw / n) * 100) / 100; // minimum strip width
        for (let i = 0; i < n; i++) {
          items.push({
            _id: nextId++, width: stripW, length: pl,
            piece, isDirect: false, isStrip: true,
            stripNum: i + 1, totalStrips: n,
          });
        }
      }
    }
    // else: piece can't be made — will show as unassigned
  }

  return items;
}

// ──────────────────────────────────────────────
// PHASE 2: Generate board patterns
// ──────────────────────────────────────────────

/**
 * Pack items into columns on a board. Columns run the full available length.
 * Items are assigned to columns where item.width ≤ column width.
 * `sortFn` controls the packing order (different orders give different patterns).
 */
function packIntoColumns(columns, items, usedIds, sortFn) {
  const placements = [];
  const sorted = [...items].sort(sortFn);

  for (const item of sorted) {
    if (usedIds.has(item._id)) continue;
    // Find the BEST column: prefer the one with least width waste (closest match).
    // This ensures 8" items go to 8" columns, not 11.5" columns,
    // and 2.5" items don't steal space in 8" columns.
    let bestCol = null;
    let bestWaste = Infinity;
    for (const col of columns) {
      if (col.width >= item.width - 0.001 && col.remaining >= item.length - 0.001) {
        const waste = col.width - item.width;
        if (waste < bestWaste) {
          bestWaste = waste;
          bestCol = col;
        }
      }
    }
    if (bestCol) {
      bestCol.remaining -= item.length;
      placements.push(item);
      usedIds.add(item._id);
    }
  }
  return placements;
}

// Sorting strategies for diverse pattern generation
const SORT_STRATEGIES = [
  (a, b) => b.width - a.width || b.length - a.length,   // widest first
  (a, b) => a.width - b.width || b.length - a.length,   // narrowest first
  (a, b) => (b.length * b.width) - (a.length * a.width), // largest area first
  (a, b) => b.length - a.length || b.width - a.width,    // longest first
];

/**
 * Try packing with all sort strategies, calling addPattern for each result.
 */
function packAllStrategies(makeColumns, items, usedIdsSeed, addPattern, preItems) {
  for (const sortFn of SORT_STRATEGIES) {
    const columns = makeColumns();
    const usedIds = new Set(usedIdsSeed);
    const placed = packIntoColumns(columns, items, usedIds, sortFn);
    if (placed.length > 0) {
      addPattern(preItems ? [...preItems, ...placed] : placed);
    }
  }
}

function generatePatterns(stockItem, items, constraints) {
  const { kerfWidth, overageMargin } = constraints;
  const boardW = stockItem.width;
  const boardL = stockItem.length;
  const patterns = [];
  const MAX_PATTERNS = 3000;
  const seenKeys = new Set();

  // Filter items compatible with this stock (thickness match)
  const compatible = items.filter(i =>
    Math.abs(i.piece.thickness - stockItem.thickness) <= 0.01 &&
    i.width <= boardW + 0.001 &&
    i.length <= boardL + 0.001
  );
  if (compatible.length === 0) return patterns;

  // Collect useful column widths from item widths
  const widthSet = new Set();
  widthSet.add(boardW); // full width
  for (const item of compatible) {
    widthSet.add(item.width);
  }
  const colWidths = [...widthSet].sort((a, b) => a - b);

  function addPattern(placements) {
    if (placements.length === 0) return;
    const ids = placements.map(p => p._id);
    const key = ids.sort().join(',');
    if (seenKeys.has(key)) return;
    seenKeys.add(key);

    // Build sections for diagram
    const demands = placements.map(item => ({
      piece: item.piece,
      type: item.isStrip ? 'glueup' : 'direct',
      rotated: false,
      stripCount: item.totalStrips,
      sections: [{ width: item.width, length: item.length }],
    }));

    patterns.push({
      stock: stockItem,
      demands,
      pieceIds: new Set(ids),
      cost: stockCost(stockItem),
    });
  }

  // ── MODE A: Rip-only ──
  for (const cw of colWidths) {
    if (patterns.length >= MAX_PATTERNS) break;
    const numCols = Math.floor((boardW + kerfWidth) / (cw + kerfWidth));
    if (numCols <= 0) continue;
    packAllStrategies(
      () => Array.from({ length: numCols }, () => ({ width: cw, remaining: boardL })),
      compatible, new Set(), addPattern
    );
  }

  // Try pairs of column widths
  for (let i = 0; i < colWidths.length && patterns.length < MAX_PATTERNS; i++) {
    for (let j = i; j < colWidths.length && patterns.length < MAX_PATTERNS; j++) {
      const w1 = colWidths[i], w2 = colWidths[j];
      for (let n1 = 1; patterns.length < MAX_PATTERNS; n1++) {
        const used1 = n1 * w1 + (n1 - 1) * kerfWidth;
        if (used1 > boardW + 0.001) break;
        const remain = boardW - used1 - kerfWidth;
        if (remain < w2 - 0.001) continue;
        const maxN2 = Math.floor((remain + kerfWidth) / (w2 + kerfWidth));
        for (let n2 = (i === j ? 0 : 1); n2 <= maxN2 && patterns.length < MAX_PATTERNS; n2++) {
          if (n1 + n2 < 2) continue;
          packAllStrategies(
            () => [
              ...Array.from({ length: n1 }, () => ({ width: w1, remaining: boardL })),
              ...Array.from({ length: n2 }, () => ({ width: w2, remaining: boardL })),
            ],
            compatible, new Set(), addPattern
          );
        }
      }
    }
  }

  // ── MODE B: Crosscut-then-rip ──
  // Place "wide" items first (items needing >60% of board width), then rip remainder
  const wideItems = compatible.filter(i => i.width > boardW * 0.6);
  for (let count = 1; count <= Math.min(6, wideItems.length) && patterns.length < MAX_PATTERNS; count++) {
    // Try combinations of `count` wide items
    const combos = combinations(wideItems, count);
    for (const combo of combos) {
      if (patterns.length >= MAX_PATTERNS) break;
      // Check unique IDs
      const comboIds = new Set(combo.map(i => i._id));
      if (comboIds.size < count) continue;

      // Total length consumed by crosscuts
      const crosscutLen = combo.reduce((sum, i) => sum + i.length, 0);
      if (crosscutLen > boardL + 0.001) continue;

      const remainLen = boardL - crosscutLen;
      if (remainLen < 0.5) {
        addPattern(combo);
        continue;
      }

      // Rip remaining area for narrower items
      const narrowItems = compatible.filter(i => !comboIds.has(i._id));
      for (const cw of colWidths) {
        if (patterns.length >= MAX_PATTERNS) break;
        const numCols = Math.floor((boardW + kerfWidth) / (cw + kerfWidth));
        if (numCols <= 0) continue;
        packAllStrategies(
          () => Array.from({ length: numCols }, () => ({ width: cw, remaining: remainLen })),
          narrowItems, comboIds, addPattern, combo
        );
      }

      // Also try mixed-width rip on remaining area
      for (let i = 0; i < colWidths.length && patterns.length < MAX_PATTERNS; i++) {
        for (let j = i + 1; j < colWidths.length && patterns.length < MAX_PATTERNS; j++) {
          const w1 = colWidths[i], w2 = colWidths[j];
          const remain = boardW - w1 - kerfWidth;
          if (remain < w2 - 0.001) continue;
          const n2 = Math.floor((remain + kerfWidth) / (w2 + kerfWidth));
          if (n2 < 1) continue;
          packAllStrategies(
            () => [
              { width: w1, remaining: remainLen },
              ...Array.from({ length: n2 }, () => ({ width: w2, remaining: remainLen })),
            ],
            narrowItems, comboIds, addPattern, combo
          );
        }
      }
    }
  }

  // ── MODE C: Same-type patterns ──
  const byPieceName = new Map();
  for (const item of compatible) {
    const key = item.piece.name || `${item.piece.length}x${item.piece.width}`;
    if (!byPieceName.has(key)) byPieceName.set(key, []);
    byPieceName.get(key).push(item);
  }
  for (const [, sameItems] of byPieceName) {
    if (patterns.length >= MAX_PATTERNS) break;
    for (const cw of colWidths) {
      const numCols = Math.floor((boardW + kerfWidth) / (cw + kerfWidth));
      if (numCols <= 0) continue;
      packAllStrategies(
        () => Array.from({ length: numCols }, () => ({ width: cw, remaining: boardL })),
        sameItems, new Set(), addPattern
      );
    }
  }

  // ── MODE D: Item-centered patterns ──
  // For each item, create a pattern where that item goes first, then fill greedily.
  // This generates diverse patterns like "1 strip + many stands" that greedy misses.
  for (const primaryItem of compatible) {
    if (patterns.length >= MAX_PATTERNS) break;
    for (const cw of colWidths) {
      if (cw < primaryItem.width - 0.001) continue;
      const numCols = Math.floor((boardW + kerfWidth) / (cw + kerfWidth));
      if (numCols <= 0) continue;

      const columns = Array.from({ length: numCols }, () => ({ width: cw, remaining: boardL }));
      const usedIds = new Set();

      // Place primary item first
      let placed = false;
      for (const col of columns) {
        if (col.width >= primaryItem.width - 0.001 && col.remaining >= primaryItem.length - 0.001) {
          col.remaining -= primaryItem.length;
          usedIds.add(primaryItem._id);
          placed = true;
          break;
        }
      }
      if (!placed) continue;

      // Fill rest with smallest-width-first (to pack stands after a strip)
      const rest = packIntoColumns(columns, compatible, usedIds,
        (a, b) => a.width - b.width || b.length - a.length
      );

      addPattern([primaryItem, ...rest]);
      break; // only need one column width per primary item
    }
  }

  // ── Single-item patterns ──
  for (const item of compatible) {
    addPattern([item]);
  }

  return patterns;
}

function combinations(arr, k) {
  if (k === 1) return arr.map(x => [x]);
  const result = [];
  for (let i = 0; i <= arr.length - k; i++) {
    for (const rest of combinations(arr.slice(i + 1), k - 1)) {
      result.push([arr[i], ...rest]);
      if (result.length > 200) return result; // safety cap
    }
  }
  return result;
}

// ──────────────────────────────────────────────
// PHASE 3: ILP solver
// ──────────────────────────────────────────────

function solveILP(items, allPatterns) {
  if (items.length === 0) return { totalCost: 0, patterns: [] };

  const model = {
    optimize: 'cost', opType: 'min',
    constraints: {}, variables: {}, ints: {},
  };

  for (const item of items) {
    model.constraints[`item_${item._id}`] = { equal: 1 };
  }

  for (let i = 0; i < allPatterns.length; i++) {
    const pat = allPatterns[i];
    // Tiny waste penalty to prefer fuller boards on cost ties
    const boardArea = pat.stock.length * pat.stock.width;
    const usedArea = pat.demands.reduce((s, d) =>
      s + d.sections.reduce((s2, sec) => s2 + sec.width * sec.length, 0), 0);
    const wastePenalty = boardArea > 0 ? ((boardArea - usedArea) / boardArea) * 0.0001 : 0;

    const variable = { cost: pat.cost + wastePenalty };
    for (const id of pat.pieceIds) {
      variable[`item_${id}`] = 1;
    }
    model.variables[`p${i}`] = variable;
    model.ints[`p${i}`] = 1;
  }

  // Stock quantity constraints
  const stockQty = new Map();
  for (let i = 0; i < allPatterns.length; i++) {
    const pat = allPatterns[i];
    if (pat.stock.quantity !== null) {
      const key = `${pat.stock.name}::${pat.stock.price}`;
      if (!stockQty.has(key)) stockQty.set(key, { max: pat.stock.quantity, indices: [] });
      stockQty.get(key).indices.push(i);
    }
  }
  for (const [key, entry] of stockQty) {
    model.constraints[`sq_${key}`] = { max: entry.max };
    for (const i of entry.indices) model.variables[`p${i}`][`sq_${key}`] = 1;
  }

  const result = solver.Solve(model);
  if (!result.feasible) return null;

  const selected = [];
  for (let i = 0; i < allPatterns.length; i++) {
    const count = result[`p${i}`] || 0;
    for (let j = 0; j < count; j++) selected.push(allPatterns[i]);
  }
  return { totalCost: result.result, patterns: selected };
}

// ──────────────────────────────────────────────
// Output formatting
// ──────────────────────────────────────────────

function formatSolution(solution, items, pieces, strategyName) {
  if (!solution || solution.patterns.length === 0) {
    return {
      totalCost: 0, totalCuts: 0, purchases: [], assignments: [],
      unassigned: [...pieces], strategyName, boards: [],
    };
  }

  const assignments = [];
  const assignedPieceIds = new Set();
  const purchaseMap = new Map();
  const boards = [];

  for (const pat of solution.patterns) {
    const key = `${pat.stock.name}::${pat.stock.price}`;
    if (purchaseMap.has(key)) purchaseMap.get(key).quantity += 1;
    else purchaseMap.set(key, { stock: pat.stock, quantity: 1 });

    const boardEntry = { stock: pat.stock, pieces: [] };

    for (const demand of pat.demands) {
      const piece = demand.piece;
      if (!assignedPieceIds.has(piece._id)) {
        // Check if all strips for this piece's glue-up are in some pattern
        // (for display purposes, show the piece once, not each strip)
        const isGlue = demand.type === 'glueup';
        assignments.push({
          neededPiece: piece,
          sourceStock: pat.stock,
          rotated: false,
          glueUp: isGlue ? { stripCount: demand.stripCount, stockUsed: pat.stock } : null,
        });
        assignedPieceIds.add(piece._id);
      }

      boardEntry.pieces.push({
        piece: demand.piece,
        rotated: false,
        glueUp: demand.type === 'glueup' ? { stripCount: demand.stripCount } : null,
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
    unassigned: pieces.filter(p => !assignedPieceIds.has(p._id)),
    strategyName,
    boards,
  };
}

// ──────────────────────────────────────────────
// Main entry point
// ──────────────────────────────────────────────

export function ilpOptimize(neededPieces, availableStock, constraints) {
  // Expand quantities
  const pieces = [];
  for (const p of neededPieces) {
    for (let i = 0; i < p.quantity; i++) {
      pieces.push({ ...p, quantity: 1, _id: pieces.length });
    }
  }

  if (pieces.length === 0) {
    return [{ totalCost: 0, totalCuts: 0, purchases: [], assignments: [], unassigned: [], strategyName: 'Optimal', boards: [] }];
  }

  // Phase 1: Create items
  const items = createItems(pieces, availableStock, constraints);

  // Phase 2: Generate patterns
  let allPatterns = [];
  for (const stock of availableStock) {
    allPatterns.push(...generatePatterns(stock, items, constraints));
  }

  if (allPatterns.length === 0) {
    return [formatSolution(null, items, pieces, 'No feasible solution')];
  }

  // Phase 3: Solve
  const solution = solveILP(items, allPatterns);
  const result = formatSolution(solution, items, pieces, 'Optimal (ILP)');

  // Alt: no glue-ups
  const noGlue = allPatterns.filter(p => !p.demands.some(d => d.type === 'glueup'));
  const noGlueSol = solveILP(items.filter(i => i.isDirect), noGlue);
  const noGlueResult = formatSolution(noGlueSol, items, pieces, 'No glue-ups');

  // Alt: fewer boards
  const fewerPats = allPatterns.map(p => ({ ...p, origCost: p.cost, cost: p.cost - p.pieceIds.size * 0.001 }));
  const fewerSol = solveILP(items, fewerPats);
  if (fewerSol) fewerSol.totalCost = fewerSol.patterns.reduce((s, p) => s + (p.origCost || p.cost), 0);
  const fewerResult = formatSolution(fewerSol, items, pieces, 'Fewer boards');

  const results = [result, noGlueResult, fewerResult]
    .filter(r => r.unassigned.length === 0 || r === result)
    .sort((a, b) => a.totalCost - b.totalCost);

  while (results.length < 3) results.push(results[results.length - 1]);
  return results.slice(0, 3);
}
