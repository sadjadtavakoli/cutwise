const SVG_NS = 'http://www.w3.org/2000/svg';

const COLORS = [
  '#4dabf7', '#69db7c', '#ffd43b', '#ff8787',
  '#da77f2', '#ffa94d', '#63e6be', '#e599f7',
];

/**
 * Lay out pieces on a board by simulating the rip-then-crosscut process.
 * Groups pieces by section width into columns, packs each column along the length.
 * Returns array of { x, y, w, h, piece } for rendering.
 */
function layoutBoard(board) {
  const boardL = board.stock.length;
  const boardW = board.stock.width;
  const rects = [];

  // Collect all sections from all pieces on this board
  const sections = [];
  for (const bp of board.pieces) {
    for (const sec of bp.sections) {
      sections.push({ sec, bp });
    }
  }

  if (sections.length === 0) return rects;

  // Group by section width (= rip column width)
  const byWidth = new Map();
  for (const item of sections) {
    const key = Math.round(item.sec.width * 1000);
    if (!byWidth.has(key)) byWidth.set(key, []);
    byWidth.get(key).push(item);
  }

  // Sort columns widest first
  const sortedWidths = [...byWidth.keys()].sort((a, b) => b - a);

  let yOffset = 0;
  for (const widthKey of sortedWidths) {
    const colWidth = widthKey / 1000;
    const items = byWidth.get(widthKey);

    // Pack items along the length (x-axis)
    let xOffset = 0;
    for (const item of items) {
      if (xOffset + item.sec.length > boardL + 0.5) {
        // Wrap to next row of same column width
        yOffset += colWidth;
        xOffset = 0;
      }

      rects.push({
        x: xOffset, y: yOffset,
        w: item.sec.length, h: colWidth,
        piece: item.bp.piece,
        glueUp: item.bp.glueUp,
        rotated: item.bp.rotated,
      });

      xOffset += item.sec.length;
    }
    yOffset += colWidth;
  }

  return rects;
}

export function renderDiagrams(container, boards, assignList) {
  container.innerHTML = '';
  if (!boards || boards.length === 0) return;

  // Color map
  const colorMap = new Map();
  let colorIdx = 0;
  for (const board of boards) {
    for (const bp of board.pieces) {
      const name = bp.piece.name || 'unknown';
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

    // Layout pieces
    const rects = layoutBoard(board);

    for (const r of rects) {
      const x = PADDING + r.x * scale;
      const y = PADDING + r.y * scale;
      const w = r.w * scale;
      const h = r.h * scale;

      // Clip to board
      if (r.x + r.w > boardL + 0.5 || r.y + r.h > boardW + 0.5) continue;

      const name = r.piece.name || 'unknown';
      const color = colorMap.get(name) || '#ccc';
      const glueLabel = r.glueUp ? ' (strip)' : '';

      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('class', 'piece-rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', y);
      rect.setAttribute('width', w);
      rect.setAttribute('height', h);
      rect.setAttribute('fill', color);
      rect.setAttribute('data-assign-idx', globalAssignIdx);
      svg.appendChild(rect);

      if (w > 30 && h > 14) {
        const displayName = name + glueLabel;
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('class', 'piece-label');
        label.setAttribute('x', x + w / 2);
        label.setAttribute('y', y + h / 2 - 1);
        label.setAttribute('text-anchor', 'middle');
        label.textContent = displayName.length > w / 6 ? name : displayName;
        svg.appendChild(label);

        if (h > 22) {
          const dim = document.createElementNS(SVG_NS, 'text');
          dim.setAttribute('class', 'piece-dim');
          dim.setAttribute('x', x + w / 2);
          dim.setAttribute('y', y + h / 2 + 10);
          dim.setAttribute('text-anchor', 'middle');
          dim.textContent = `${r.piece.length}" × ${r.piece.width}"`;
          svg.appendChild(dim);
        }
      }

      // Tooltip
      const showTip = () => {
        let tip = `${name}: ${r.piece.length}" × ${r.piece.width}"`;
        if (r.glueUp) tip += ` (glue-up: ${r.glueUp.stripCount} strips)`;
        tooltip.textContent = tip;
        tooltip.style.display = 'block';
        const svgR = svg.getBoundingClientRect();
        const contR = container.getBoundingClientRect();
        tooltip.style.left = Math.max(0, svgR.left - contR.left + x + w / 2 - tooltip.offsetWidth / 2) + 'px';
        tooltip.style.top = (svgR.top - contR.top + y - tooltip.offsetHeight - 8) + 'px';
      };
      const hideTip = () => { tooltip.style.display = 'none'; };
      rect.addEventListener('mouseenter', showTip);
      rect.addEventListener('mouseleave', hideTip);
      rect.addEventListener('click', (e) => {
        e.stopPropagation();
        svg.querySelectorAll('.piece-rect.highlighted').forEach(el => el.classList.remove('highlighted'));
        rect.classList.toggle('highlighted');
        if (rect.classList.contains('highlighted')) showTip(); else hideTip();
      });
    }

    globalAssignIdx += board.pieces.length;

    svgWrapper.appendChild(svg);
    wrapper.appendChild(svgWrapper);
    container.appendChild(wrapper);
  }

  document.addEventListener('click', () => {
    tooltip.style.display = 'none';
    container.querySelectorAll('.piece-rect.highlighted').forEach(r => r.classList.remove('highlighted'));
  });
}

export function wireAssignListHover(assignList, diagramContainer) {
  if (!assignList || !diagramContainer) return;
  assignList.querySelectorAll('li').forEach((li, idx) => {
    li.addEventListener('mouseenter', () => {
      diagramContainer.querySelectorAll(`.piece-rect[data-assign-idx="${idx}"]`).forEach(r => r.classList.add('highlighted'));
    });
    li.addEventListener('mouseleave', () => {
      diagramContainer.querySelectorAll(`.piece-rect[data-assign-idx="${idx}"]`).forEach(r => r.classList.remove('highlighted'));
    });
  });
}
