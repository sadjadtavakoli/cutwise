import solver from 'javascript-lp-solver';
import { stockCost } from './cost.js';

/**
 * CutWise Optimizer — Cutting Stock ILP formulation
 *
 * Uses ITEM TYPES (not individual items) to keep the ILP small.
 * A "stand" type has demand=16, not 16 separate variables.
 * This makes the ILP solvable with simple solvers.
 *
 * Phase 1: Decompose pieces into item types (direct or glue-up strips)
 * Phase 2: Generate patterns (how many of each type a board provides)
 * Phase 3: Small ILP selects minimum-cost patterns
 */

function expandPieces(pieces) {
  const expanded = [];
  for (const p of pieces) {
    for (let i = 0; i < p.quantity; i++) {
      expanded.push({ ...p, quantity: 1, _id: expanded.length });
    }
  }
  return expanded;
}

// ──────────────────────────────────────────────
// PHASE 1: Create item types
// ──────────────────────────────────────────────

function createItemTypes(pieces, availableStock, constraints) {
  const { overageMargin, kerfWidth, minGlueStripWidth, maxGlueJoints } = constraints;
  const types = []; // { name, width, length, demand, isDirect, piece (template) }

  const maxWidthByThickness = new Map();
  for (const s of availableStock) {
    const cur = maxWidthByThickness.get(s.thickness) || 0;
    if (s.width > cur) maxWidthByThickness.set(s.thickness, s.width);
  }

  // Group expanded pieces by (name, width, length, thickness) → same type
  const typeMap = new Map();
  for (const piece of pieces) {
    const pw = piece.width + overageMargin;
    const pl = piece.length + overageMargin + kerfWidth;
    const maxW = maxWidthByThickness.get(piece.thickness) || 0;

    if (pw <= maxW + 0.001) {
      // Direct fit
      const key = `direct:${piece.name}:${pw}:${pl}:${piece.thickness}`;
      if (typeMap.has(key)) {
        typeMap.get(key).demand += piece.quantity;
      } else {
        typeMap.set(key, {
          name: piece.name, width: pw, length: pl,
          demand: piece.quantity, isDirect: true, isStrip: false,
          piece, thickness: piece.thickness, stripCount: 0,
        });
      }
    }

    if (piece.canGlueWidth && pw > maxW && maxW >= minGlueStripWidth) {
      // Glue-up strips
      const n = Math.ceil(pw / maxW);
      if (n > 1 && n - 1 <= maxGlueJoints) {
        const stripW = Math.ceil((pw / n) * 100) / 100;
        const key = `strip:${piece.name}:${stripW}:${pl}:${piece.thickness}`;
        if (typeMap.has(key)) {
          typeMap.get(key).demand += piece.quantity * n;
        } else {
          typeMap.set(key, {
            name: piece.name + '_strip', width: stripW, length: pl,
            demand: piece.quantity * n, isDirect: false, isStrip: true,
            piece, thickness: piece.thickness, stripCount: n,
          });
        }
      }
    }
  }

  return [...typeMap.values()];
}

// ──────────────────────────────────────────────
// PHASE 2: Generate patterns
// ──────────────────────────────────────────────

/**
 * A pattern describes what one board produces: { typeIndex → count }
 * Pattern generation tries to maximize items per board.
 */
function generatePatterns(stockItem, itemTypes, constraints) {
  const { kerfWidth } = constraints;
  const boardW = stockItem.width;
  const boardL = stockItem.length;
  const patterns = [];
  const seenKeys = new Set();
  const MAX_PATTERNS = 200;

  // Filter compatible types
  const compatible = itemTypes
    .map((t, idx) => ({ ...t, typeIdx: idx }))
    .filter(t => t.thickness === stockItem.thickness &&
                 t.width <= boardW + 0.001 &&
                 t.length <= boardL + 0.001);

  if (compatible.length === 0) return patterns;

  // Column widths to try
  const widthSet = new Set([boardW]);
  for (const t of compatible) widthSet.add(t.width);
  const colWidths = [...widthSet].sort((a, b) => a - b);

  function addPattern(typeCounts, columns) {
    const entries = [...typeCounts.entries()].filter(([, c]) => c > 0);
    if (entries.length === 0) return;
    const key = entries.map(([ti, c]) => `${ti}:${c}`).sort().join('|');
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    // Save column layout for diagram rendering
    const layout = columns ? columns
      .filter(c => c.items && c.items.length > 0)
      .map(c => ({ width: c.width, items: [...c.items] })) : [];
    patterns.push({ stock: stockItem, typeCounts: new Map(entries), cost: stockCost(stockItem), layout });
  }

  /**
   * Pack items into columns, respecting type demands as upper bound.
   * Returns Map<typeIdx, count> of items packed.
   */
  function packColumns(columns, types, sortFn) {
    const sorted = [...types].sort(sortFn);
    const counts = new Map();

    // Track layout: which items go in which column
    for (const col of columns) {
      if (!col.items) col.items = [];
    }

    for (const t of sorted) {
      const currentCount = counts.get(t.typeIdx) || 0;
      if (currentCount >= t.demand) continue;

      for (const col of columns) {
        if (col.width < t.width - 0.001) continue;
        while (col.remaining >= t.length - 0.001 && (counts.get(t.typeIdx) || 0) < t.demand) {
          col.remaining -= t.length;
          counts.set(t.typeIdx, (counts.get(t.typeIdx) || 0) + 1);
          col.items.push({ typeIdx: t.typeIdx, width: t.width, length: t.length, name: t.name });
        }
      }
    }
    return counts;
  }

  const SORTS = [
    (a, b) => b.width - a.width || b.length - a.length,
    (a, b) => a.width - b.width || b.length - a.length,
    (a, b) => (b.length * b.width) - (a.length * a.width),
    (a, b) => b.length - a.length,
  ];

  // Mode A: Rip-only (single and mixed column widths)
  for (const cw of colWidths) {
    if (patterns.length >= MAX_PATTERNS) break;
    const numCols = Math.floor((boardW + kerfWidth) / (cw + kerfWidth));
    if (numCols <= 0) continue;

    for (const sortFn of SORTS) {
      const cols = Array.from({ length: numCols }, () => ({ width: cw, remaining: boardL }));
      { const tc = packColumns(cols, compatible, sortFn); addPattern(tc, cols); }
    }
  }

  // Mixed-width columns
  for (let i = 0; i < colWidths.length && patterns.length < MAX_PATTERNS; i++) {
    for (let j = i + 1; j < colWidths.length && patterns.length < MAX_PATTERNS; j++) {
      const w1 = colWidths[i], w2 = colWidths[j];
      const used1 = w1;
      const remain = boardW - w1 - kerfWidth;
      if (remain < w2 - 0.001) continue;
      const n2 = Math.floor((remain + kerfWidth) / (w2 + kerfWidth));
      if (n2 < 1) continue;

      for (const sortFn of SORTS) {
        const cols = [
          { width: w1, remaining: boardL },
          ...Array.from({ length: n2 }, () => ({ width: w2, remaining: boardL })),
        ];
        { const tc = packColumns(cols, compatible, sortFn); addPattern(tc, cols); }
      }

      // Also try n1=n2's width, n2=w1 (reversed counts)
      const remain2 = boardW - w2 - kerfWidth;
      if (remain2 >= w1 - 0.001) {
        const n1r = Math.floor((remain2 + kerfWidth) / (w1 + kerfWidth));
        if (n1r >= 1) {
          for (const sortFn of SORTS) {
            const cols = [
              { width: w2, remaining: boardL },
              ...Array.from({ length: n1r }, () => ({ width: w1, remaining: boardL })),
            ];
            { const tc = packColumns(cols, compatible, sortFn); addPattern(tc, cols); }
          }
        }
      }
    }
  }

  // Mode B: Crosscut-first (wide items first, then rip remainder)
  const wideTypes = compatible.filter(t => t.width > boardW * 0.6);
  for (const wideType of wideTypes) {
    if (patterns.length >= MAX_PATTERNS) break;
    // Try placing 1, 2, ... of this wide type via crosscut
    for (let count = 1; count <= Math.min(wideType.demand, Math.floor(boardL / wideType.length)); count++) {
      const remainLen = boardL - count * wideType.length;
      if (remainLen < 1) {
        const tc = new Map([[wideType.typeIdx, count]]);
        const wideCol = { width: boardW, items: [] };
        for (let c = 0; c < count; c++) wideCol.items.push({ typeIdx: wideType.typeIdx, width: wideType.width, length: wideType.length, name: wideType.name });
        addPattern(tc, [wideCol]);
        continue;
      }

      // Build a "crosscut column" for the wide items (full board width)
      function makeWideCol() {
        const col = { width: boardW, items: [] };
        for (let c = 0; c < count; c++) col.items.push({ typeIdx: wideType.typeIdx, width: wideType.width, length: wideType.length, name: wideType.name });
        return col;
      }

      // Rip remaining area for narrower items
      const narrowTypes = compatible.filter(t => t.typeIdx !== wideType.typeIdx);
      for (const cw of colWidths) {
        if (patterns.length >= MAX_PATTERNS) break;
        const numCols = Math.floor((boardW + kerfWidth) / (cw + kerfWidth));
        if (numCols <= 0) continue;

        for (const sortFn of SORTS) {
          const cols = Array.from({ length: numCols }, () => ({ width: cw, remaining: remainLen }));
          const tc = packColumns(cols, narrowTypes, sortFn);
          tc.set(wideType.typeIdx, (tc.get(wideType.typeIdx) || 0) + count);
          addPattern(tc, [makeWideCol(), ...cols]);
        }
      }

      // Mixed-width rip on remaining
      for (let ii = 0; ii < colWidths.length && patterns.length < MAX_PATTERNS; ii++) {
        for (let jj = ii + 1; jj < colWidths.length && patterns.length < MAX_PATTERNS; jj++) {
          const w1 = colWidths[ii], w2 = colWidths[jj];
          const remain = boardW - w1 - kerfWidth;
          if (remain < w2 - 0.001) continue;
          const n2 = Math.floor((remain + kerfWidth) / (w2 + kerfWidth));
          if (n2 < 1) continue;

          for (const sortFn of SORTS) {
            const cols = [
              { width: w1, remaining: remainLen },
              ...Array.from({ length: n2 }, () => ({ width: w2, remaining: remainLen })),
            ];
            const tc = packColumns(cols, narrowTypes, sortFn);
            tc.set(wideType.typeIdx, (tc.get(wideType.typeIdx) || 0) + count);
            addPattern(tc, [makeWideCol(), ...cols]);
          }
        }
      }
    }
  }

  // Mode C: Single-type patterns
  for (const t of compatible) {
    for (const cw of colWidths) {
      if (cw < t.width - 0.001) continue;
      const numCols = Math.floor((boardW + kerfWidth) / (cw + kerfWidth));
      if (numCols <= 0) continue;
      const cols = Array.from({ length: numCols }, () => ({ width: cw, remaining: boardL, items: [] }));
      const tc = new Map();
      for (const col of cols) {
        while (col.remaining >= t.length - 0.001 && (tc.get(t.typeIdx) || 0) < t.demand) {
          col.remaining -= t.length;
          tc.set(t.typeIdx, (tc.get(t.typeIdx) || 0) + 1);
          col.items.push({ typeIdx: t.typeIdx, width: t.width, length: t.length, name: t.name });
        }
      }
      addPattern(tc, cols);
    }
  }

  return patterns;
}

// ──────────────────────────────────────────────
// PHASE 3: ILP solver (small model!)
// ──────────────────────────────────────────────

function solveILP(itemTypes, allPatterns) {
  if (itemTypes.length === 0) return { totalCost: 0, patterns: [] };

  const model = {
    optimize: 'cost', opType: 'min',
    constraints: {}, variables: {}, ints: {},
  };

  // One constraint per item TYPE (not per individual item!)
  for (let t = 0; t < itemTypes.length; t++) {
    model.constraints[`type_${t}`] = { min: itemTypes[t].demand };
  }

  for (let i = 0; i < allPatterns.length; i++) {
    const pat = allPatterns[i];
    const boardArea = pat.stock.length * pat.stock.width;
    let usedArea = 0;
    for (const [ti, count] of pat.typeCounts) {
      usedArea += itemTypes[ti].width * itemTypes[ti].length * count;
    }
    const wastePenalty = boardArea > 0 ? ((boardArea - usedArea) / boardArea) * 0.0001 : 0;

    const variable = { cost: pat.cost + wastePenalty };
    for (const [ti, count] of pat.typeCounts) {
      variable[`type_${ti}`] = count;
    }
    model.variables[`p${i}`] = variable;
    model.ints[`p${i}`] = 1;
  }

  // Stock quantity constraints
  const stockQty = new Map();
  for (let i = 0; i < allPatterns.length; i++) {
    const pat = allPatterns[i];
    if (pat.stock.quantity !== null) {
      const key = pat.stock.name;
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

function formatSolution(solution, itemTypes, expandedPieces, strategyName) {
  if (!solution || solution.patterns.length === 0) {
    return {
      totalCost: 0, totalCuts: 0, purchases: [], assignments: [],
      unassigned: [...expandedPieces], strategyName, boards: [],
    };
  }

  const assignments = [];
  const purchaseMap = new Map();
  const boards = [];

  // Track how many of each type have been assigned to actual pieces
  const typeAssigned = new Map();

  for (const pat of solution.patterns) {
    const key = `${pat.stock.name}::${pat.stock.price}`;
    if (purchaseMap.has(key)) purchaseMap.get(key).quantity += 1;
    else purchaseMap.set(key, { stock: pat.stock, quantity: 1 });

    const boardEntry = { stock: pat.stock, pieces: [], layout: pat.layout || [] };

    for (const [ti, count] of pat.typeCounts) {
      const type = itemTypes[ti];
      for (let c = 0; c < count; c++) {
        const assigned = typeAssigned.get(ti) || 0;
        if (assigned >= type.demand) continue; // excess (over-supply)
        typeAssigned.set(ti, assigned + 1);

        // Find the matching expanded piece
        const pieceIdx = assigned; // which instance of this type

        boardEntry.pieces.push({
          piece: type.piece,
          rotated: false,
          glueUp: type.isStrip ? { stripCount: type.stripCount } : null,
          sections: [{ width: type.width, length: type.length }],
        });

        assignments.push({
          neededPiece: type.piece,
          sourceStock: pat.stock,
          rotated: false,
          glueUp: type.isStrip ? { stripCount: type.stripCount, stockUsed: pat.stock } : null,
        });
      }
    }
    boards.push(boardEntry);
  }

  // Find unassigned pieces
  const assignedByName = new Map();
  for (const a of assignments) {
    const key = a.neededPiece.name;
    assignedByName.set(key, (assignedByName.get(key) || 0) + 1);
  }

  const unassigned = [];
  for (const piece of expandedPieces) {
    const count = assignedByName.get(piece.name) || 0;
    if (count <= 0) unassigned.push(piece);
    else assignedByName.set(piece.name, count - 1);
  }

  return {
    totalCost: Math.round(solution.totalCost * 100) / 100,
    totalCuts: assignments.length,
    purchases: Array.from(purchaseMap.values()),
    assignments,
    unassigned,
    strategyName,
    boards,
  };
}

// ──────────────────────────────────────────────
// Main entry point
// ──────────────────────────────────────────────

export function ilpOptimize(neededPieces, availableStock, constraints) {
  const expanded = expandPieces(neededPieces);
  if (expanded.length === 0) {
    return [{ totalCost: 0, totalCuts: 0, purchases: [], assignments: [], unassigned: [], strategyName: 'Optimal', boards: [] }];
  }

  // Phase 1: item types
  const itemTypes = createItemTypes(neededPieces, availableStock, constraints);

  // Phase 2: patterns
  let allPatterns = [];
  for (const stock of availableStock) {
    allPatterns.push(...generatePatterns(stock, itemTypes, constraints));
  }

  if (allPatterns.length === 0) {
    return [formatSolution(null, itemTypes, expanded, 'No feasible solution')];
  }

  // Phase 3: solve
  const solution = solveILP(itemTypes, allPatterns);
  const result = formatSolution(solution, itemTypes, expanded, 'Optimal (ILP)');

  // Alt: fewer boards
  const fewerPats = allPatterns.map(p => {
    let totalItems = 0;
    for (const [, c] of p.typeCounts) totalItems += c;
    return { ...p, origCost: p.cost, cost: p.cost - totalItems * 0.001 };
  });
  const fewerSol = solveILP(itemTypes, fewerPats);
  if (fewerSol) fewerSol.totalCost = fewerSol.patterns.reduce((s, p) => s + (p.origCost || p.cost), 0);
  const fewerResult = formatSolution(fewerSol, itemTypes, expanded, 'Fewer boards');

  const results = [result, fewerResult]
    .filter(r => r.unassigned.length === 0 || r === result)
    .sort((a, b) => a.totalCost - b.totalCost);

  while (results.length < 3) results.push(results[results.length - 1]);
  return results.slice(0, 3);
}
