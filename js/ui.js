export function addPieceRow(tbody, piece = {}) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="piece-name" value="${piece.name || ''}"></td>
    <td><input type="number" class="piece-length" value="${piece.length || ''}" step="0.125" min="0"></td>
    <td><input type="number" class="piece-width" value="${piece.width || ''}" step="0.125" min="0"></td>
    <td><input type="number" class="piece-thickness" value="${piece.thickness || ''}" step="0.125" min="0"></td>
    <td><input type="number" class="piece-qty" value="${piece.quantity ?? 1}" step="1" min="1"></td>
    <td><input type="checkbox" class="piece-glue" ${(piece.canGlueWidth ?? true) ? 'checked' : ''}></td>
    <td><input type="checkbox" class="piece-grain" ${piece.grainSensitive ? 'checked' : ''}></td>
    <td><button class="btn-remove" title="Remove">&times;</button></td>
  `;
  tr.querySelector('.btn-remove').addEventListener('click', () => tr.remove());
  tbody.appendChild(tr);
}

export function addStockRow(tbody, stock = {}) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="stock-name" value="${stock.name || ''}"></td>
    <td>
      <select class="stock-type">
        <option value="dimensional" ${stock.type === 'dimensional' ? 'selected' : ''}>Dimensional</option>
        <option value="hardwood" ${stock.type === 'hardwood' ? 'selected' : ''}>Hardwood</option>
        <option value="sheet" ${stock.type === 'sheet' ? 'selected' : ''}>Sheet</option>
      </select>
    </td>
    <td><input type="number" class="stock-length" value="${stock.length || ''}" step="0.125" min="0"></td>
    <td><input type="number" class="stock-width" value="${stock.width || ''}" step="0.125" min="0"></td>
    <td><input type="number" class="stock-thickness" value="${stock.thickness || ''}" step="0.125" min="0"></td>
    <td><input type="number" class="stock-price" value="${stock.price || ''}" step="0.01" min="0"></td>
    <td><input type="number" class="stock-qty" value="${stock.quantity ?? ''}" step="1" min="1" placeholder="∞"></td>
    <td><button class="btn-remove" title="Remove">&times;</button></td>
  `;
  tr.querySelector('.btn-remove').addEventListener('click', () => tr.remove());
  tbody.appendChild(tr);
}

export function readPiecesFromTable(tbody) {
  const pieces = [];
  for (const tr of tbody.querySelectorAll('tr')) {
    const length = parseFloat(tr.querySelector('.piece-length').value);
    const width = parseFloat(tr.querySelector('.piece-width').value);
    const thickness = parseFloat(tr.querySelector('.piece-thickness').value);
    if (isNaN(length) || isNaN(width) || isNaN(thickness)) continue;
    pieces.push({
      name: tr.querySelector('.piece-name').value.trim(),
      length,
      width,
      thickness,
      quantity: parseInt(tr.querySelector('.piece-qty').value) || 1,
      canGlueWidth: tr.querySelector('.piece-glue').checked,
      grainSensitive: tr.querySelector('.piece-grain').checked,
    });
  }
  return pieces;
}

export function readStockFromTable(tbody) {
  const items = [];
  for (const tr of tbody.querySelectorAll('tr')) {
    const length = parseFloat(tr.querySelector('.stock-length').value);
    const width = parseFloat(tr.querySelector('.stock-width').value);
    const thickness = parseFloat(tr.querySelector('.stock-thickness').value);
    const price = parseFloat(tr.querySelector('.stock-price').value);
    if (isNaN(length) || isNaN(width) || isNaN(thickness) || isNaN(price)) continue;
    const qtyVal = tr.querySelector('.stock-qty').value;
    items.push({
      name: tr.querySelector('.stock-name').value.trim(),
      type: tr.querySelector('.stock-type').value,
      length,
      width,
      thickness,
      price,
      quantity: qtyVal ? parseInt(qtyVal) : null,
    });
  }
  return items;
}

export function readConstraints() {
  const kerf = parseFloat(document.getElementById('kerf-width').value);
  const minGlue = parseFloat(document.getElementById('min-glue-strip').value);
  const maxJoints = parseInt(document.getElementById('max-glue-joints').value);
  const overage = parseFloat(document.getElementById('overage-margin').value);
  return {
    kerfWidth: isNaN(kerf) ? 0.125 : kerf,
    minGlueStripWidth: isNaN(minGlue) ? 2 : minGlue,
    maxGlueJoints: isNaN(maxJoints) ? 4 : maxJoints,
    overageMargin: isNaN(overage) ? 0.5 : overage,
  };
}

export function setConstraints(c) {
  document.getElementById('kerf-width').value = c.kerfWidth;
  document.getElementById('min-glue-strip').value = c.minGlueStripWidth;
  document.getElementById('max-glue-joints').value = c.maxGlueJoints;
  document.getElementById('overage-margin').value = c.overageMargin;
}

export function renderResults(container, results) {
  container.innerHTML = '';
  results.forEach((result, i) => {
    const card = document.createElement('div');
    card.className = 'result-card' + (i === 0 ? ' best' : '');

    let purchaseHtml = '';
    for (const p of result.purchases) {
      purchaseHtml += `<li>${p.quantity}× ${p.stock.name}</li>`;
    }

    let assignHtml = '';
    for (const a of result.assignments) {
      const pieceName = a.neededPiece.name || `${a.neededPiece.length}"×${a.neededPiece.width}"`;
      const from = a.sourceStock.name;
      const glue = a.glueUp ? ` (glue-up: ${a.glueUp.stripCount} strips)` : '';
      const rotated = a.rotated ? ' (rotated)' : '';
      assignHtml += `<li>${pieceName} ← ${from}${glue}${rotated}</li>`;
    }

    let unassignedHtml = '';
    if (result.unassigned && result.unassigned.length > 0) {
      const names = result.unassigned.map(u => u.name || `${u.length}"×${u.width}"`).join(', ');
      unassignedHtml = `<div class="unassigned-warning">Could not fit: ${names}</div>`;
    }

    card.innerHTML = `
      <div class="result-header">
        <div>
          <span class="result-cost">$${result.totalCost.toFixed(2)}</span>
          <span class="result-meta">${result.totalCuts} cut${result.totalCuts !== 1 ? 's' : ''}</span>
        </div>
        <div class="result-meta">${result.strategyName}</div>
      </div>
      <div class="result-section-title">Purchase List</div>
      <ul class="result-list">${purchaseHtml}</ul>
      <div class="result-section-title">Cut Assignments</div>
      <ul class="result-list">${assignHtml}</ul>
      ${unassignedHtml}
    `;
    container.appendChild(card);
  });
}

export function parsePastedPieces(text) {
  const rows = text.trim().split('\n');
  return rows.map(row => {
    const cols = row.split('\t');
    return {
      name: cols[0] || '',
      length: parseFloat(cols[1]) || 0,
      width: parseFloat(cols[2]) || 0,
      thickness: parseFloat(cols[3]) || 0,
      quantity: parseInt(cols[4]) || 1,
      canGlueWidth: cols[5] !== 'false' && cols[5] !== 'no' && cols[5] !== '0',
      grainSensitive: cols[6] === 'true' || cols[6] === 'yes' || cols[6] === '1',
    };
  }).filter(p => p.length > 0 && p.width > 0 && p.thickness > 0);
}
