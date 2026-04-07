import { stockCost } from './cost.js';

function expandPieces(pieces) {
  const expanded = [];
  for (const piece of pieces) {
    for (let i = 0; i < piece.quantity; i++) {
      expanded.push(piece);
    }
  }
  return expanded;
}

function sortStockByStrategy(stock, strategy) {
  const sorted = [...stock];
  if (strategy === 'cheapest') {
    sorted.sort((a, b) => stockCost(a) - stockCost(b));
  } else if (strategy === 'prefer_wide') {
    sorted.sort((a, b) => b.width - a.width || stockCost(a) - stockCost(b));
  } else if (strategy === 'prefer_large') {
    sorted.sort((a, b) => (b.length * b.width) - (a.length * a.width) || stockCost(a) - stockCost(b));
  }
  return sorted;
}

function pieceFitsInStock(pieceLength, pieceWidth, stockWidth, remainingLength, overageMargin, kerfWidth) {
  const widthOk = pieceWidth + overageMargin <= stockWidth;
  const lengthOk = pieceLength + overageMargin + kerfWidth <= remainingLength;
  return widthOk && lengthOk;
}

function tryFitOrientations(piece, stockWidth, remainingLength, overageMargin, kerfWidth) {
  // Try normal orientation
  if (pieceFitsInStock(piece.length, piece.width, stockWidth, remainingLength, overageMargin, kerfWidth)) {
    return { fits: true, rotated: false };
  }
  // Try rotated orientation (swap length and width) for non-grain-sensitive pieces
  if (!piece.grainSensitive) {
    if (pieceFitsInStock(piece.width, piece.length, stockWidth, remainingLength, overageMargin, kerfWidth)) {
      return { fits: true, rotated: true };
    }
  }
  return { fits: false, rotated: false };
}

function findGlueUp(piece, sortedStock, constraints, stockUsageCount) {
  if (!piece.canGlueWidth) return null;

  const { kerfWidth, overageMargin, minGlueStripWidth, maxGlueJoints } = constraints;
  const neededWidth = piece.width + overageMargin;
  const neededLength = piece.length + overageMargin;

  let best = null;

  for (let i = 0; i < sortedStock.length; i++) {
    const stockItem = sortedStock[i];

    // Must match thickness
    if (Math.abs(piece.thickness - stockItem.thickness) > 0.01) continue;

    // Strip must be long enough
    if (stockItem.length < neededLength) continue;

    // Strip must meet minimum width
    if (stockItem.width < minGlueStripWidth) continue;

    // Calculate strips needed: n strips joined with (n-1) kerfs must cover neededWidth
    // n * stripWidth - (n-1) * kerfWidth >= neededWidth
    // n * (stripWidth - kerfWidth) >= neededWidth - kerfWidth
    // n >= (neededWidth - kerfWidth) / (stripWidth - kerfWidth)
    const stripWidth = stockItem.width;
    const n = Math.ceil((neededWidth - kerfWidth) / (stripWidth - kerfWidth));

    // Must need more than 1 strip (otherwise it's a direct fit)
    if (n <= 1) continue;

    // Check joint limit
    if (n - 1 > maxGlueJoints) continue;

    // Check available quantity
    const usedCount = stockUsageCount.get(i) || 0;
    const available = stockItem.quantity === null ? Infinity : stockItem.quantity - usedCount;
    if (available < n) continue;

    const cost = stockCost(stockItem) * n;
    if (best === null || cost < best.cost) {
      best = { candidate: stockItem, candidateIndex: i, stripCount: n, cost, neededLength };
    }
  }

  return best;
}

export function greedySolve(neededPieces, availableStock, constraints, strategy) {
  const { kerfWidth, overageMargin } = constraints;

  // Step 1: Expand pieces by quantity
  const expandedPieces = expandPieces(neededPieces);

  // Step 2: Sort expanded pieces by area (largest first)
  const sortedPieces = [...expandedPieces].sort((a, b) => (b.length * b.width) - (a.length * a.width));

  // Step 3: Sort stock by strategy
  const sortedStock = sortStockByStrategy(availableStock, strategy);

  // Track purchased boards: { stock, remainingLength, boardId }
  const purchasedBoards = [];
  // Track how many of each stock item have been purchased (by index in sortedStock)
  const stockUsageCount = new Map();

  const assignments = [];
  const unassigned = [];

  for (const piece of sortedPieces) {
    let assigned = false;

    // Step 4: Try to fit in already-purchased boards' remaining length
    for (const board of purchasedBoards) {
      const { fits, rotated } = tryFitOrientations(piece, board.stock.width, board.remainingLength, overageMargin, kerfWidth);
      if (fits) {
        const usedLength = (rotated ? piece.width : piece.length) + overageMargin + kerfWidth;
        board.remainingLength -= usedLength;
        assignments.push({ neededPiece: piece, sourceStock: board.stock, rotated, glueUp: null });
        assigned = true;
        break;
      }
    }

    if (assigned) continue;

    // Step 5: Buy a new board from stock
    for (let i = 0; i < sortedStock.length; i++) {
      const stockItem = sortedStock[i];

      // Check thickness match
      if (Math.abs(piece.thickness - stockItem.thickness) > 0.01) continue;

      // Check stock quantity limit
      const usedCount = stockUsageCount.get(i) || 0;
      if (stockItem.quantity !== null && usedCount >= stockItem.quantity) continue;

      // Try fitting in a fresh board (full length available)
      const { fits, rotated } = tryFitOrientations(piece, stockItem.width, stockItem.length, overageMargin, kerfWidth);
      if (fits) {
        const usedLength = (rotated ? piece.width : piece.length) + overageMargin + kerfWidth;
        const remainingLength = stockItem.length - usedLength;
        purchasedBoards.push({ stock: stockItem, remainingLength, stockIndex: i });
        stockUsageCount.set(i, usedCount + 1);
        assignments.push({ neededPiece: piece, sourceStock: stockItem, rotated, glueUp: null });
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      // Try glue-up as fallback
      const glueUp = findGlueUp(piece, sortedStock, constraints, stockUsageCount);
      if (glueUp !== null) {
        // Check if direct fit already found a cost to compare against
        // (In this path, direct fit already failed, so glue-up is the only option)
        const { candidate, candidateIndex, stripCount } = glueUp;
        const usedCount = stockUsageCount.get(candidateIndex) || 0;
        stockUsageCount.set(candidateIndex, usedCount + stripCount);
        // Each glue-up strip uses piece.length + overage + kerf from the board.
        // The rest of the board's length is still available for other pieces.
        const stripUsedLength = piece.length + overageMargin + kerfWidth;
        for (let k = 0; k < stripCount; k++) {
          purchasedBoards.push({ stock: candidate, remainingLength: candidate.length - stripUsedLength, stockIndex: candidateIndex });
        }
        assignments.push({ neededPiece: piece, sourceStock: candidate, rotated: false, glueUp: { stripCount, stockUsed: candidate } });
        assigned = true;
      }
    }

    if (!assigned) {
      unassigned.push(piece);
    }
  }

  // Build purchase summary (deduplicate by stock name+price)
  const purchaseMap = new Map();
  for (const board of purchasedBoards) {
    const key = `${board.stock.name}::${board.stock.price}`;
    if (purchaseMap.has(key)) {
      purchaseMap.get(key).quantity += 1;
    } else {
      purchaseMap.set(key, { stock: board.stock, quantity: 1 });
    }
  }
  const purchases = Array.from(purchaseMap.values());

  // Compute total cost
  let totalCost = 0;
  for (const p of purchases) {
    totalCost += stockCost(p.stock) * p.quantity;
  }

  // Round to avoid floating point noise
  totalCost = Math.round(totalCost * 10000) / 10000;

  const totalCuts = assignments.length;

  return { totalCost, totalCuts, purchases, assignments, unassigned };
}
