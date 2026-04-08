import solver from 'javascript-lp-solver';
import { stockCost } from './cost.js';

/**
 * ILP-based optimal cut optimizer with full 2D guillotine cutting.
 *
 * Key idea: decompose glue-up pieces into strip-pieces, then treat everything
 * as rectangular pieces to be packed onto 2D boards. Multiple strips from the
 * same glue-up (or different glue-ups) can share one board.
 *
 * Board cutting model:
 * 1. Crosscut the board into rows (sections along the length)
 * 2. Each row can be ripped into columns (strips along the width)
 * 3. Each resulting rectangle is assigned to a piece
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
 * Decompose pieces into directly-placeable rectangles.
 *
 * Direct pieces: placed as-is on a board.
 * Glue-up pieces: split into N strip-pieces. Each strip is a rectangle
 * (stockWidth × pieceLength) that goes on a board. When all strips for
 * a glue-up are placed, the piece is fulfilled.
 *
 * Returns { directPieces, stripPieces, glueUpInfo }
 */
function decomposePieces(expandedPieces, availableStock, constraints) {
  const { kerfWidth, overageMargin, minGlueStripWidth, maxGlueJoints } = constraints;

  const directPieces = []; // pieces that fit directly on some stock
  const stripPieces = [];  // virtual strip pieces for glue-ups
  const glueUpInfo = [];   // { originalPiece, strips: [stripPieceIds], stockUsed, stripCount }

  let nextId = expandedPieces.length; // IDs for strip pieces start after real pieces

  for (const piece of expandedPieces) {
    // Check if piece fits directly on any stock
    let fitsDirect = false;
    for (const stock of availableStock) {
      if (Math.abs(piece.thickness - stock.thickness) > 0.01) continue;
      const fitsNormal = (piece.width + overageMargin <= stock.width) &&
                         (piece.length + overageMargin <= stock.length);
      const fitsRotated = !piece.grainSensitive &&
                          (piece.length + overageMargin <= stock.width) &&
                          (piece.width + overageMargin <= stock.length);
      if (fitsNormal || fitsRotated) { fitsDirect = true; break; }
    }

    if (fitsDirect) {
      directPieces.push(piece);
    }

    // Also check glue-up options (even if direct fit exists — ILP picks cheapest)
    if (piece.canGlueWidth) {
      for (const stock of availableStock) {
        if (Math.abs(piece.thickness - stock.thickness) > 0.01) continue;
        if (stock.width < minGlueStripWidth) continue;
        if (stock.length < piece.length + overageMargin) continue;

        // Skip if piece already fits directly on this stock
        if (piece.width + overageMargin <= stock.width) continue;

        const neededWidth = piece.width + overageMargin;
        const n = Math.ceil((neededWidth - kerfWidth) / (stock.width - kerfWidth));
        if (n <= 1) continue;
        if (n - 1 > maxGlueJoints) continue;

        // Create N strip pieces for this glue-up option
        const stripIds = [];
        for (let i = 0; i < n; i++) {
          const stripPiece = {
            _id: nextId++,
            name: `${piece.name}:strip${i}`,
            // The strip occupies: stockWidth × (pieceLength + overage) on the board
            // It's a crosscut section from the board
            length: piece.length + overageMargin,
            width: stock.width,
            thickness: piece.thickness,
            grainSensitive: true, // strips can't be rotated
            isStrip: true,
            parentPieceId: piece._id,
            parentStockName: stock.name,
          };
          stripPieces.push(stripPiece);
          stripIds.push(stripPiece._id);
        }

        glueUpInfo.push({
          originalPiece: piece,
          strips: stripIds,
          stock: stock,
          stripCount: n,
        });
      }
    }
  }

  return { directPieces, stripPieces, glueUpInfo };
}

/**
 * Generate 2D cutting patterns for a board.
 * A pattern is a set of rectangular pieces that fit on the board via guillotine cuts.
 *
 * Strategy: enumerate "row plans" (crosscuts dividing the board into rows),
 * then within each row, "column plans" (rips dividing the row into columns).
 */
function generatePatterns(stockItem, allPieces, constraints) {
  const { kerfWidth, overageMargin } = constraints;
  const patterns = [];
  const boardWidth = stockItem.width;
  const boardLength = stockItem.length;
  const MAX_PATTERNS = 5000;
  const seenPatterns = new Set();

  // Filter pieces that match this stock's thickness and can fit
  const compatible = allPieces.filter(p => {
    if (Math.abs(p.thickness - stockItem.thickness) > 0.01) return false;
    // For strip pieces, they must match the stock they were designed for
    if (p.isStrip && p.width !== stockItem.width) return false;
    return true;
  });
  if (compatible.length === 0) return patterns;

  // For each piece, determine placement options on this board
  const placementOptions = [];
  for (const p of compatible) {
    // Normal: piece.width along board width, piece.length along board length
    if (p.width + (p.isStrip ? 0 : overageMargin) <= boardWidth + 0.001 &&
        p.length + (p.isStrip ? kerfWidth : overageMargin + kerfWidth) <= boardLength + 0.001) {
      placementOptions.push({
        piece: p,
        // Width consumed on the board (for rip planning)
        widthNeeded: p.isStrip ? p.width : p.width + overageMargin,
        // Length consumed on the board (for crosscut planning)
        lengthNeeded: p.isStrip ? p.length + kerfWidth : p.length + overageMargin + kerfWidth,
        rotated: false,
      });
    }
    // Rotated: piece.length along board width, piece.width along board length
    if (!p.grainSensitive && !p.isStrip) {
      if (p.length + overageMargin <= boardWidth + 0.001 &&
          p.width + overageMargin + kerfWidth <= boardLength + 0.001) {
        placementOptions.push({
          piece: p,
          widthNeeded: p.length + overageMargin,
          lengthNeeded: p.width + overageMargin + kerfWidth,
          rotated: true,
        });
      }
    }
  }
  if (placementOptions.length === 0) return patterns;

  // Group options by width needed (for same-width rip strips)
  const widthGroups = new Map();
  for (const opt of placementOptions) {
    // Round to avoid floating point issues
    const key = Math.round(opt.widthNeeded * 1000);
    if (!widthGroups.has(key)) widthGroups.set(key, []);
    widthGroups.get(key).push(opt);
  }

  const distinctWidths = [...widthGroups.keys()].map(k => k / 1000).sort((a, b) => a - b);

  // Strategy 1: Single-width rip plans
  for (const stripW of distinctWidths) {
    if (patterns.length >= MAX_PATTERNS) break;
    const maxStrips = Math.floor((boardWidth + kerfWidth) / (stripW + kerfWidth));
    if (maxStrips <= 0) continue;

    const key = Math.round(stripW * 1000);
    const options = widthGroups.get(key) || [];

    for (let numStrips = 1; numStrips <= maxStrips && patterns.length < MAX_PATTERNS; numStrips++) {
      // Each strip has full board length for crosscuts
      const stripLengths = new Array(numStrips).fill(boardLength);
      const placed = [];
      const usedIds = new Set();

      // Sort by length descending for better packing
      const sorted = [...options].sort((a, b) => b.lengthNeeded - a.lengthNeeded);
      for (const opt of sorted) {
        if (usedIds.has(opt.piece._id)) continue;
        for (let s = 0; s < numStrips; s++) {
          if (stripLengths[s] >= opt.lengthNeeded) {
            stripLengths[s] -= opt.lengthNeeded;
            placed.push(opt);
            usedIds.add(opt.piece._id);
            break;
          }
        }
      }
      if (placed.length === 0) continue;
      addPattern(placed, usedIds);

      // Also try smallest-first
      const sorted2 = [...options].sort((a, b) => a.lengthNeeded - b.lengthNeeded);
      const stripLengths2 = new Array(numStrips).fill(boardLength);
      const placed2 = [];
      const usedIds2 = new Set();
      for (const opt of sorted2) {
        if (usedIds2.has(opt.piece._id)) continue;
        for (let s = 0; s < numStrips; s++) {
          if (stripLengths2[s] >= opt.lengthNeeded) {
            stripLengths2[s] -= opt.lengthNeeded;
            placed2.push(opt);
            usedIds2.add(opt.piece._id);
            break;
          }
        }
      }
      if (placed2.length > 0) addPattern(placed2, usedIds2);
    }
  }

  // Strategy 2: Mixed-width rip plans (pairs of widths)
  for (let i = 0; i < distinctWidths.length && patterns.length < MAX_PATTERNS; i++) {
    for (let j = i + 1; j < distinctWidths.length && patterns.length < MAX_PATTERNS; j++) {
      const w1 = distinctWidths[i];
      const w2 = distinctWidths[j];

      for (let n1 = 1; n1 * (w1 + kerfWidth) <= boardWidth + kerfWidth && patterns.length < MAX_PATTERNS; n1++) {
        const usedW = n1 * w1 + (n1 > 0 ? (n1 - 1) * kerfWidth : 0);
        const remainW = boardWidth - usedW - kerfWidth;
        if (remainW < w2) continue;

        const maxN2 = Math.floor((remainW + kerfWidth) / (w2 + kerfWidth));
        for (let n2 = 1; n2 <= maxN2 && patterns.length < MAX_PATTERNS; n2++) {
          const key1 = Math.round(w1 * 1000);
          const key2 = Math.round(w2 * 1000);
          const opts1 = widthGroups.get(key1) || [];
          const opts2 = widthGroups.get(key2) || [];

          const stripLengths = [];
          const stripOpts = [];
          for (let s = 0; s < n1; s++) { stripLengths.push(boardLength); stripOpts.push(opts1); }
          for (let s = 0; s < n2; s++) { stripLengths.push(boardLength); stripOpts.push(opts2); }

          const placed = [];
          const usedIds = new Set();

          // Merge all options, sort by area desc
          const allOpts = [];
          for (let s = 0; s < stripLengths.length; s++) {
            for (const opt of stripOpts[s]) {
              allOpts.push({ ...opt, stripIdx: s });
            }
          }
          allOpts.sort((a, b) => (b.piece.length * b.piece.width) - (a.piece.length * a.piece.width));

          for (const opt of allOpts) {
            if (usedIds.has(opt.piece._id)) continue;
            const s = opt.stripIdx;
            if (stripLengths[s] >= opt.lengthNeeded) {
              stripLengths[s] -= opt.lengthNeeded;
              placed.push(opt);
              usedIds.add(opt.piece._id);
            }
          }
          if (placed.length >= 2) addPattern(placed, usedIds);
        }
      }
    }
  }

  // Strategy 3: "Crosscut first" — full-width rows, then rip each row differently
  // Place wide pieces using full board width, then rip remaining area
  const widePieces = placementOptions.filter(o => o.widthNeeded > boardWidth * 0.5);
  if (widePieces.length > 0) {
    for (let count = 1; count <= Math.min(4, widePieces.length) && patterns.length < MAX_PATTERNS; count++) {
      const combos = getCombinations(widePieces, count);
      for (const combo of combos) {
        if (patterns.length >= MAX_PATTERNS) break;
        const ids = combo.map(o => o.piece._id);
        if (new Set(ids).size < ids.length) continue;

        const totalLen = combo.reduce((sum, o) => sum + o.lengthNeeded, 0);
        if (totalLen > boardLength) continue;

        const remainLen = boardLength - totalLen;
        const comboIds = new Set(ids);
        const comboPlaced = combo.map(o => o);

        if (remainLen > kerfWidth + overageMargin) {
          // Rip the remaining section for smaller pieces
          const remainderPieces = compatible.filter(p => !comboIds.has(p._id));
          const packed = packArea(remainLen, boardWidth, remainderPieces, constraints);
          for (const p of packed) {
            comboPlaced.push(p);
            comboIds.add(p.piece._id);
          }
        }

        if (comboPlaced.length > 0) addPattern(comboPlaced, comboIds);
      }
    }
  }

  // Single-piece patterns
  for (const opt of placementOptions) {
    const key = `${opt.piece._id}`;
    if (!seenPatterns.has(key)) {
      seenPatterns.add(key);
      patterns.push({
        stock: stockItem,
        placements: [{ piece: opt.piece, rotated: opt.rotated }],
        pieceIds: new Set([opt.piece._id]),
        cost: stockCost(stockItem),
      });
    }
  }

  function addPattern(placed, usedIds) {
    const key = [...usedIds].sort().join(',');
    if (seenPatterns.has(key)) return;
    seenPatterns.add(key);
    patterns.push({
      stock: stockItem,
      placements: placed.map(o => ({ piece: o.piece, rotated: o.rotated })),
      pieceIds: new Set(usedIds),
      cost: stockCost(stockItem),
    });
  }

  return patterns;
}

/**
 * Pack pieces into a rectangular area using rip strips.
 */
function packArea(areaLength, areaWidth, pieces, constraints) {
  const { kerfWidth, overageMargin } = constraints;
  const packed = [];

  // Find all strip widths that fit
  const widths = new Set();
  for (const p of pieces) {
    const w = p.isStrip ? p.width : p.width + overageMargin;
    if (w <= areaWidth) widths.add(w);
    if (!p.grainSensitive && !p.isStrip) {
      const w2 = p.length + overageMargin;
      if (w2 <= areaWidth) widths.add(w2);
    }
  }

  let bestPacked = [];

  for (const stripW of widths) {
    const maxStrips = Math.floor((areaWidth + kerfWidth) / (stripW + kerfWidth));
    if (maxStrips <= 0) continue;

    const stripLengths = new Array(maxStrips).fill(areaLength);
    const placed = [];
    const usedIds = new Set();

    const opts = pieces.filter(p => {
      const w = p.isStrip ? p.width : p.width + overageMargin;
      return w <= stripW + 0.001;
    }).sort((a, b) => (b.length * b.width) - (a.length * a.width));

    for (const p of opts) {
      if (usedIds.has(p._id)) continue;
      const lenNeeded = p.isStrip ? p.length + kerfWidth : p.length + overageMargin + kerfWidth;
      for (let s = 0; s < maxStrips; s++) {
        if (stripLengths[s] >= lenNeeded) {
          stripLengths[s] -= lenNeeded;
          packed.push({ piece: p, rotated: false });
          usedIds.add(p._id);
          break;
        }
      }
    }

    if (placed.length > bestPacked.length) bestPacked = placed;
    // Oops, used wrong array name
    if (packed.length > bestPacked.length) bestPacked = [...packed];
    packed.length = 0;
  }

  return bestPacked;
}

function getCombinations(arr, k) {
  if (k === 1) return arr.map(x => [x]);
  const result = [];
  for (let i = 0; i <= arr.length - k; i++) {
    const rest = getCombinations(arr.slice(i + 1), k - 1);
    for (const combo of rest) result.push([arr[i], ...combo]);
    if (result.length > 500) break;
  }
  return result;
}

/**
 * Build and solve the ILP.
 *
 * Variables: one per pattern (integer, how many times to use it)
 * Constraints:
 * - Each direct piece: covered exactly once
 * - Each glue-up: for each option, either all its strips are placed or none
 *   (modeled as: each original piece must be fulfilled exactly once,
 *    either via direct placement or via one of its glue-up options)
 */
function solveILP(directPieces, stripPieces, glueUpInfo, allPatterns) {
  const allPieceIds = new Set([
    ...directPieces.map(p => p._id),
    ...stripPieces.map(p => p._id),
  ]);

  if (allPieceIds.size === 0) return { totalCost: 0, patterns: [] };

  const model = {
    optimize: 'cost',
    opType: 'min',
    constraints: {},
    variables: {},
    ints: {},
  };

  // Each direct piece must be covered exactly once (directly OR via a glue-up option)
  for (const piece of directPieces) {
    // Check if this piece also has glue-up options
    const hasGlueUp = glueUpInfo.some(g => g.originalPiece._id === piece._id);
    if (hasGlueUp) {
      // This piece can be fulfilled directly OR via glue-up
      // Use >= 1 and let the optimizer choose
      model.constraints[`piece_${piece._id}`] = { min: 1 };
    } else {
      model.constraints[`piece_${piece._id}`] = { equal: 1 };
    }
  }

  // Each strip piece must be covered if its glue-up is chosen
  // We model this by requiring each strip piece to be covered exactly once
  // and adding a constraint that either all strips of a glue-up are used or none
  for (const strip of stripPieces) {
    model.constraints[`piece_${strip._id}`] = { equal: 1 };
  }

  // For pieces that can go either direct or glue-up, we need exactly one path.
  // Add mutual exclusion: for each such piece, direct_coverage + glue_up_completed = 1
  for (const gInfo of glueUpInfo) {
    const pieceId = gInfo.originalPiece._id;
    // Add a "glue-up completion" variable
    const gVar = `glue_${pieceId}_${gInfo.stock.name}`;
    model.variables[gVar] = { cost: 0 };
    model.variables[gVar][`piece_${pieceId}`] = 1; // contributes to covering the original piece
    model.ints[gVar] = 1;

    // This variable is 1 only if all its strip pieces are placed
    // Constraint: gVar <= strip_i coverage for each strip
    // Since strip coverage = 1 (from equal constraint), gVar is free to be 0 or 1
    // But we need: if gVar = 1, all strips must be present
    // And if gVar = 0, strips should NOT be present (to avoid waste)

    // Link: for each strip, it should be placed iff the glue-up is active
    // strip_coverage = gVar for each strip
    for (const stripId of gInfo.strips) {
      // Replace the strip constraint: instead of equal:1, make it equal to gVar
      model.constraints[`piece_${stripId}`] = { equal: 0 }; // will be overridden below
      // Actually this is tricky with LP solver syntax. Let me use a different approach.
    }
  }

  // SIMPLER APPROACH: Don't decompose glue-ups into strips.
  // Instead, generate patterns that include the ORIGINAL piece directly,
  // and the pattern uses N sections of the board for the glue-up strips.
  // The pattern cost is 1 board (not N boards!), because the strips come from one board.
  //
  // But a glue-up might need strips from MULTIPLE boards if they don't all fit on one...
  // For most cases, all strips fit on one board (board is long enough).

  // Actually, let me restart with an even simpler approach.
  // Reset the model.
  return null; // Signal to use simple approach
}

/**
 * SIMPLE APPROACH: Generate patterns that directly cover original pieces.
 *
 * For glue-up pieces, a "glue-up pattern" describes which board provides
 * how many strips. Multiple strips from the same board share one board cost.
 * The pattern generator figures out how many strips of each glue-up fit
 * on a single board alongside other pieces.
 */
function generateAllPatterns(expandedPieces, availableStock, constraints) {
  const { kerfWidth, overageMargin, minGlueStripWidth, maxGlueJoints } = constraints;
  const patterns = [];
  const MAX_PATTERNS = 8000;

  for (const stock of availableStock) {
    const boardLen = stock.length;
    const boardW = stock.width;
    const compatible = expandedPieces.filter(p =>
      Math.abs(p.thickness - stock.thickness) <= 0.01
    );
    if (compatible.length === 0) continue;

    // For each piece, determine what it needs from this board:
    // - Direct: occupies a rectangle (widthNeeded × lengthNeeded)
    // - Glue-up: needs N crosscut sections of (boardWidth × pieceLength), each uses pieceLength of board length
    const demands = [];
    for (const p of compatible) {
      // Direct fit (normal orientation)
      if (p.width + overageMargin <= boardW) {
        demands.push({
          piece: p, type: 'direct', rotated: false,
          sections: [{ width: p.width + overageMargin, length: p.length + overageMargin + kerfWidth }],
        });
      }
      // Direct fit (rotated)
      if (!p.grainSensitive && p.length + overageMargin <= boardW && p.width + overageMargin + kerfWidth <= boardLen) {
        demands.push({
          piece: p, type: 'direct', rotated: true,
          sections: [{ width: p.length + overageMargin, length: p.width + overageMargin + kerfWidth }],
        });
      }
      // Glue-up: N strips from this board
      if (p.canGlueWidth && p.width + overageMargin > boardW && boardW >= minGlueStripWidth) {
        const neededWidth = p.width + overageMargin;
        const n = Math.ceil((neededWidth - kerfWidth) / (boardW - kerfWidth));
        if (n > 1 && n - 1 <= maxGlueJoints && p.length + overageMargin <= boardLen) {
          // Each strip is a crosscut section using the full board width
          const stripLen = p.length + overageMargin + kerfWidth;
          const sections = [];
          for (let i = 0; i < n; i++) sections.push({ width: boardW, length: stripLen });
          demands.push({
            piece: p, type: 'glueup', rotated: false, stripCount: n,
            sections,
          });
        }
      }
    }

    if (demands.length === 0) continue;

    // Now generate patterns by packing demands onto the 2D board.
    // Each demand has sections that occupy space on the board.
    //
    // Board model: the board has rows of varying heights (lengths).
    // A "row" is a crosscut section. Within a row, pieces are arranged
    // by width (rip cuts). Multiple pieces can share a row if their
    // combined width fits.
    //
    // For simplicity, we model the board as a sequence of crosscut rows.
    // Each demand's sections are placed in rows. Same-height sections
    // can share a row.

    // Group demands by section length (crosscut height)
    const heightGroups = new Map();
    for (const d of demands) {
      for (const sec of d.sections) {
        const key = Math.round(sec.length * 1000);
        if (!heightGroups.has(key)) heightGroups.set(key, []);
        heightGroups.get(key).push({ demand: d, section: sec });
      }
    }

    const seenPatterns = new Set();

    // For each combination of demands that fit on the board:
    // - Sum of section lengths ≤ boardLen (if sections are in separate rows)
    // - Or sections with same height share a row (sum of widths ≤ boardW)

    // GREEDY pattern generation: pick demands, pack their sections
    // Try each demand as the starting point
    for (let startIdx = 0; startIdx < demands.length && patterns.length < MAX_PATTERNS; startIdx++) {
      const selectedDemands = [demands[startIdx]];
      const usedPieceIds = new Set([demands[startIdx].piece._id]);

      // Pack sections into rows
      let rows = packSectionsIntoRows(
        selectedDemands.flatMap(d => d.sections.map(s => ({ ...s, demandPieceId: d.piece._id }))),
        boardLen, boardW
      );
      if (!rows) continue;

      // Greedily add more demands
      for (let i = 0; i < demands.length; i++) {
        if (usedPieceIds.has(demands[i].piece._id)) continue;
        const candidate = demands[i];
        const candidateSections = candidate.sections.map(s => ({ ...s, demandPieceId: candidate.piece._id }));
        const allSections = [
          ...selectedDemands.flatMap(d => d.sections.map(s => ({ ...s, demandPieceId: d.piece._id }))),
          ...candidateSections,
        ];
        const newRows = packSectionsIntoRows(allSections, boardLen, boardW);
        if (newRows) {
          selectedDemands.push(candidate);
          usedPieceIds.add(candidate.piece._id);
          rows = newRows;
        }
      }

      const key = [...usedPieceIds].sort().join(',');
      if (!seenPatterns.has(key) && selectedDemands.length > 0) {
        seenPatterns.add(key);
        patterns.push({
          stock: stock,
          demands: selectedDemands,
          pieceIds: new Set(usedPieceIds),
          cost: stockCost(stock),
        });
      }
    }

    // Also try reverse order
    for (let startIdx = demands.length - 1; startIdx >= 0 && patterns.length < MAX_PATTERNS; startIdx--) {
      const selectedDemands = [demands[startIdx]];
      const usedPieceIds = new Set([demands[startIdx].piece._id]);

      for (let i = demands.length - 1; i >= 0; i--) {
        if (usedPieceIds.has(demands[i].piece._id)) continue;
        const candidate = demands[i];
        const allSections = [
          ...selectedDemands.flatMap(d => d.sections.map(s => ({ ...s, demandPieceId: d.piece._id }))),
          ...candidate.sections.map(s => ({ ...s, demandPieceId: candidate.piece._id })),
        ];
        const newRows = packSectionsIntoRows(allSections, boardLen, boardW);
        if (newRows) {
          selectedDemands.push(candidate);
          usedPieceIds.add(candidate.piece._id);
        }
      }

      const key = [...usedPieceIds].sort().join(',');
      if (!seenPatterns.has(key) && selectedDemands.length > 0) {
        seenPatterns.add(key);
        patterns.push({
          stock: stock,
          demands: selectedDemands,
          pieceIds: new Set(usedPieceIds),
          cost: stockCost(stock),
        });
      }
    }

    // Single-piece patterns
    for (const d of demands) {
      const key = `${d.piece._id}`;
      if (!seenPatterns.has(key)) {
        seenPatterns.add(key);
        patterns.push({
          stock: stock,
          demands: [d],
          pieceIds: new Set([d.piece._id]),
          cost: stockCost(stock),
        });
      }
    }
  }

  return patterns;
}

/**
 * Pack rectangular sections into rows on a board.
 * Sections with the same height can share a row (widths sum ≤ boardWidth).
 * Different-height rows stack along the board length.
 * Returns rows array if feasible, null if not.
 */
function packSectionsIntoRows(sections, boardLength, boardWidth) {
  // Group by height (length of section = row height)
  const byHeight = new Map();
  for (const sec of sections) {
    const key = Math.round(sec.length * 1000);
    if (!byHeight.has(key)) byHeight.set(key, []);
    byHeight.get(key).push(sec);
  }

  const rows = [];
  for (const [heightKey, secs] of byHeight) {
    const height = heightKey / 1000;
    // Pack sections into rows of this height
    // Each row has boardWidth available
    let currentRowWidth = 0;
    let currentRowCount = 0;

    // Sort by width descending for better packing
    const sorted = [...secs].sort((a, b) => b.width - a.width);

    const rowWidths = [0]; // width used in each row of this height
    for (const sec of sorted) {
      let placed = false;
      for (let r = 0; r < rowWidths.length; r++) {
        if (rowWidths[r] + sec.width + (rowWidths[r] > 0 ? 0.125 : 0) <= boardWidth + 0.001) {
          rowWidths[r] += sec.width + (rowWidths[r] > 0 ? 0.125 : 0);
          placed = true;
          break;
        }
      }
      if (!placed) {
        // Need a new row of this height
        rowWidths.push(sec.width);
      }
    }

    for (let r = 0; r < rowWidths.length; r++) {
      rows.push(height);
    }
  }

  // Check if all rows fit in board length
  const totalHeight = rows.reduce((sum, h) => sum + h, 0);
  return totalHeight <= boardLength + 0.001 ? rows : null;
}

/**
 * Solve the ILP with the generated patterns.
 */
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
    const varName = `pat_${i}`;
    const variable = { cost: pattern.cost };
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

/**
 * Format solution for display.
 */
function formatSolution(solution, expandedPieces, strategyName) {
  if (!solution || solution.patterns.length === 0) {
    return {
      totalCost: 0, totalCuts: 0, purchases: [], assignments: [],
      unassigned: [...expandedPieces], strategyName,
    };
  }

  const assignments = [];
  const assignedIds = new Set();
  const purchaseMap = new Map();

  for (const pattern of solution.patterns) {
    const stockKey = `${pattern.stock.name}::${pattern.stock.price}`;
    if (purchaseMap.has(stockKey)) {
      purchaseMap.get(stockKey).quantity += 1;
    } else {
      purchaseMap.set(stockKey, { stock: pattern.stock, quantity: 1 });
    }

    for (const demand of pattern.demands) {
      const isGlue = demand.type === 'glueup';
      assignments.push({
        neededPiece: demand.piece,
        sourceStock: pattern.stock,
        rotated: demand.rotated || false,
        glueUp: isGlue ? { stripCount: demand.stripCount, stockUsed: pattern.stock } : null,
      });
      assignedIds.add(demand.piece._id);
    }
  }

  return {
    totalCost: Math.round(solution.totalCost * 100) / 100,
    totalCuts: assignments.length,
    purchases: Array.from(purchaseMap.values()),
    assignments,
    unassigned: expandedPieces.filter(p => !assignedIds.has(p._id)),
    strategyName,
  };
}

export function ilpOptimize(neededPieces, availableStock, constraints) {
  const expanded = expandPieces(neededPieces);
  if (expanded.length === 0) {
    return [{ totalCost: 0, totalCuts: 0, purchases: [], assignments: [], unassigned: [], strategyName: 'Optimal' }];
  }

  const allPatterns = generateAllPatterns(expanded, availableStock, constraints);

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
  const fewerBoardsPatterns = allPatterns.map(p => ({
    ...p, originalCost: p.cost,
    cost: p.cost - (p.pieceIds.size * 0.001),
  }));
  const fewerSolution = solvePatternILP(expanded, fewerBoardsPatterns);
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
