const SVG_NS = 'http://www.w3.org/2000/svg';

const COLORS = [
  '#4dabf7', '#69db7c', '#ffd43b', '#ff8787',
  '#da77f2', '#ffa94d', '#63e6be', '#e599f7',
];

/**
 * Render cut diagrams using the ACTUAL column layout from the optimizer.
 *
 * Each board has a `layout` array of columns:
 *   [{ width, items: [{ name, width, length }] }]
 *
 * Visual model:
 * - Y-axis (vertical) = board width, columns stacked top-to-bottom
 * - X-axis (horizontal) = board length, items crosscut left-to-right within each column
 */
export function renderDiagrams(container, boards, assignList) {
  container.innerHTML = '';
  if (!boards || boards.length === 0) return;

  // Color map
  const colorMap = new Map();
  let colorIdx = 0;
  for (const board of boards) {
    for (const col of (board.layout || [])) {
      for (const item of col.items) {
        const name = item.name || 'unknown';
        if (!colorMap.has(name)) {
          colorMap.set(name, COLORS[colorIdx % COLORS.length]);
          colorIdx++;
        }
      }
    }
    // Fallback: also check pieces
    for (const bp of board.pieces) {
      const name = bp.piece.name || `${bp.piece.length}"×${bp.piece.width}"`;
      if (!colorMap.has(name)) {
        colorMap.set(name, COLORS[colorIdx % COLORS.length]);
        colorIdx++;
      }
    }
  }

  // Scale
  let maxBoardLen = 0;
  for (const board of boards) {
    if (board.stock.length > maxBoardLen) maxBoardLen = board.stock.length;
  }
  const MAX_SVG_WIDTH = 860;
  const PADDING = 10;
  const scale = maxBoardLen > 0 ? (MAX_SVG_WIDTH - 2 * PADDING) / maxBoardLen : 1;

  // Tooltip
  const tooltip = document.createElement('div');
  tooltip.className = 'diagram-tooltip';
  tooltip.style.display = 'none';
  container.style.position = 'relative';
  container.appendChild(tooltip);

  let globalAssignIdx = 0;

  for (let boardIdx = 0; boardIdx < boards.length; boardIdx++) {
    const board = boards[boardIdx];
    const boardL = board.stock.length;
    const boardW = board.stock.width;
    const layout = board.layout || [];

    const svgWidth = boardL * scale + 2 * PADDING;
    const svgHeight = boardW * scale + 2 * PADDING;

    const wrapper = document.createElement('div');
    wrapper.className = 'board-diagram';

    const title = document.createElement('div');
    title.className = 'board-diagram-title';
    title.textContent = `${board.stock.name} #${boardIdx + 1} (${boardL}" × ${boardW}")`;
    wrapper.appendChild(title);

    const svgWrapper = document.createElement('div');
    svgWrapper.className = 'board-svg-wrapper';

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'board-svg');
    svg.setAttribute('width', svgWidth);
    svg.setAttribute('height', svgHeight);
    svg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);

    // Waste hatch
    const defs = document.createElementNS(SVG_NS, 'defs');
    const pattern = document.createElementNS(SVG_NS, 'pattern');
    pattern.setAttribute('id', `waste-hatch-${boardIdx}`);
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    pattern.setAttribute('width', '8');
    pattern.setAttribute('height', '8');
    const hatchLine = document.createElementNS(SVG_NS, 'line');
    hatchLine.setAttribute('x1', '0'); hatchLine.setAttribute('y1', '8');
    hatchLine.setAttribute('x2', '8'); hatchLine.setAttribute('y2', '0');
    hatchLine.setAttribute('stroke', '#ced4da'); hatchLine.setAttribute('stroke-width', '1');
    pattern.appendChild(hatchLine);
    defs.appendChild(pattern);
    svg.appendChild(defs);

    // Board outline
    const boardRect = document.createElementNS(SVG_NS, 'rect');
    boardRect.setAttribute('x', PADDING);
    boardRect.setAttribute('y', PADDING);
    boardRect.setAttribute('width', boardL * scale);
    boardRect.setAttribute('height', boardW * scale);
    boardRect.setAttribute('fill', `url(#waste-hatch-${boardIdx})`);
    boardRect.setAttribute('stroke', '#adb5bd');
    boardRect.setAttribute('stroke-width', '1');
    svg.appendChild(boardRect);

    if (layout.length > 0) {
      // Use the actual column layout from the optimizer
      let yOffset = 0;
      for (const col of layout) {
        if (!col.items || col.items.length === 0) { yOffset += col.width; continue; }

        let xOffset = 0;
        for (const item of col.items) {
          const x = PADDING + xOffset * scale;
          const y = PADDING + yOffset * scale;
          const w = item.length * scale;
          const h = col.width * scale;

          if (xOffset + item.length > boardL + 0.5) break;

          const name = item.name || 'unknown';
          const color = colorMap.get(name) || '#ccc';

          const rect = document.createElementNS(SVG_NS, 'rect');
          rect.setAttribute('class', 'piece-rect');
          rect.setAttribute('x', x);
          rect.setAttribute('y', y);
          rect.setAttribute('width', w);
          rect.setAttribute('height', h);
          rect.setAttribute('fill', color);
          rect.setAttribute('data-assign-idx', globalAssignIdx);
          svg.appendChild(rect);

          // Labels
          if (w > 35 && h > 16) {
            const label = document.createElementNS(SVG_NS, 'text');
            label.setAttribute('class', 'piece-label');
            label.setAttribute('x', x + w / 2);
            label.setAttribute('y', y + h / 2 - 1);
            label.setAttribute('text-anchor', 'middle');
            label.textContent = name;
            svg.appendChild(label);

            const dim = document.createElementNS(SVG_NS, 'text');
            dim.setAttribute('class', 'piece-dim');
            dim.setAttribute('x', x + w / 2);
            dim.setAttribute('y', y + h / 2 + 10);
            dim.setAttribute('text-anchor', 'middle');
            dim.textContent = `${Math.round(item.length * 10) / 10}" × ${Math.round(item.width * 10) / 10}"`;
            svg.appendChild(dim);
          }

          // Tooltip
          const showTip = () => {
            tooltip.textContent = `${name}: ${item.length}" × ${item.width}"`;
            tooltip.style.display = 'block';
            const svgRect = svg.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            tooltip.style.left = (svgRect.left - containerRect.left + parseFloat(rect.getAttribute('x')) + w / 2 - tooltip.offsetWidth / 2) + 'px';
            tooltip.style.top = (svgRect.top - containerRect.top + parseFloat(rect.getAttribute('y')) - tooltip.offsetHeight - 8) + 'px';
          };
          const hideTip = () => { tooltip.style.display = 'none'; };
          rect.addEventListener('mouseenter', showTip);
          rect.addEventListener('mouseleave', hideTip);
          rect.addEventListener('click', (e) => {
            e.stopPropagation();
            svg.querySelectorAll('.piece-rect.highlighted').forEach(r => r.classList.remove('highlighted'));
            rect.classList.toggle('highlighted');
            if (rect.classList.contains('highlighted')) showTip(); else hideTip();
          });

          xOffset += item.length;
        }
        yOffset += col.width;
      }
    }

    // Advance global assign index
    globalAssignIdx += board.pieces.length;

    svgWrapper.appendChild(svg);
    wrapper.appendChild(svgWrapper);
    container.appendChild(wrapper);
  }

  // Dismiss
  document.addEventListener('click', () => {
    tooltip.style.display = 'none';
    container.querySelectorAll('.piece-rect.highlighted').forEach(r => r.classList.remove('highlighted'));
  });
}

function highlightAssignRow(assignList, index, highlight) {
  if (!assignList) return;
  const li = assignList.children[index];
  if (!li) return;
  li.classList.toggle('assign-highlighted', highlight);
}

export function wireAssignListHover(assignList, diagramContainer) {
  if (!assignList || !diagramContainer) return;
  const items = assignList.querySelectorAll('li');
  items.forEach((li, idx) => {
    li.addEventListener('mouseenter', () => {
      diagramContainer.querySelectorAll(`.piece-rect[data-assign-idx="${idx}"]`).forEach(r => r.classList.add('highlighted'));
    });
    li.addEventListener('mouseleave', () => {
      diagramContainer.querySelectorAll(`.piece-rect[data-assign-idx="${idx}"]`).forEach(r => r.classList.remove('highlighted'));
    });
  });
}
