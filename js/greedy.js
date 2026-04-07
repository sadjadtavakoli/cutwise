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
