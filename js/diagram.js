const SVG_NS = 'http://www.w3.org/2000/svg';

const COLORS = [
  '#4dabf7', '#69db7c', '#ffd43b', '#ff8787',
  '#da77f2', '#ffa94d', '#63e6be', '#e599f7',
];

/**
 * Render cut diagrams for a solution's boards.
 *
 * Layout model matches the optimizer: boards are ripped into columns,
 * each column is independently crosscut for pieces.
 * - Y-axis (vertical) = board width, divided into columns by rip cuts
 * - X-axis (horizontal) = board length, pieces crosscut within each column
 */
export function renderDiagrams(container, boards, assignList) {
  container.innerHTML = '';
  if (!boards || boards.length === 0) return;

  // Color map: unique piece name → color
  const colorMap = new Map();
  let colorIdx = 0;
  for (const board of boards) {
    for (const bp of board.pieces) {
      const name = bp.piece.name || `${bp.piece.length}"×${bp.piece.width}"`;
      if (!colorMap.has(name)) {
        colorMap.set(name, COLORS[colorIdx % COLORS.length]);
        colorIdx++;
      }
    }
  }

  // Uniform scale based on largest board length
  let maxBoardLen = 0;
  for (const board of boards) {
    if (board.stock.length > maxBoardLen) maxBoardLen = board.stock.length;
  }
  const MAX_SVG_WIDTH = 860;
  const PADDING = 10;
  const scale = maxBoardLen > 0 ? (MAX_SVG_WIDTH - 2 * PADDING) / maxBoardLen : 1;

  // Tooltip (shared)
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

    // Waste hatch pattern
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

    // Board outline (waste-hatched background)
    const boardRect = document.createElementNS(SVG_NS, 'rect');
    boardRect.setAttribute('x', PADDING);
    boardRect.setAttribute('y', PADDING);
    boardRect.setAttribute('width', boardL * scale);
    boardRect.setAttribute('height', boardW * scale);
    boardRect.setAttribute('fill', `url(#waste-hatch-${boardIdx})`);
    boardRect.setAttribute('stroke', '#adb5bd');
    boardRect.setAttribute('stroke-width', '1');
    svg.appendChild(boardRect);

    // Collect all sections with their parent info
    const allSections = [];
    for (const bp of board.pieces) {
      const assignIdx = globalAssignIdx;
      if (bp.glueUp && bp.sections.length > 1) {
        for (let i = 0; i < bp.sections.length; i++) {
          allSections.push({ sec: bp.sections[i], bp, stripNum: i + 1, assignIdx });
        }
      } else {
        for (const sec of bp.sections) {
          allSections.push({ sec, bp, stripNum: bp.glueUp ? 1 : 0, assignIdx });
        }
      }
      globalAssignIdx++;
    }

    // Layout: group sections into columns by width, then pack along length (x-axis).
    // Columns stack along width (y-axis).
    const byWidth = new Map();
    for (const item of allSections) {
      const key = Math.round(item.sec.width * 1000);
      if (!byWidth.has(key)) byWidth.set(key, []);
      byWidth.get(key).push(item);
    }

    // Sort columns: widest first (they visually anchor the diagram)
    const sortedWidths = [...byWidth.keys()].sort((a, b) => b - a);

    let yOffset = 0; // tracks vertical position (board width axis)
    for (const widthKey of sortedWidths) {
      const colWidth = widthKey / 1000;
      const items = byWidth.get(widthKey);

      // Pack items into this column along the x-axis (board length)
      let xOffset = 0;
      for (const item of items) {
        const x = PADDING + xOffset * scale;
        const y = PADDING + yOffset * scale;
        const w = item.sec.length * scale;
        const h = colWidth * scale;

        // Clip to board bounds
        if (xOffset + item.sec.length > boardL + 0.01) break;

        const name = item.bp.piece.name || `${item.bp.piece.length}"×${item.bp.piece.width}"`;
        const color = colorMap.get(name) || '#ccc';

        // Piece rectangle
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('class', 'piece-rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', w);
        rect.setAttribute('height', h);
        rect.setAttribute('fill', color);
        rect.setAttribute('data-assign-idx', item.assignIdx);
        svg.appendChild(rect);

        // Labels
        if (w > 35 && h > 18) {
          const glueLabel = item.stripNum > 0 ? ` (strip ${item.stripNum} of ${item.bp.glueUp.stripCount})` : '';
          const labelStr = name + glueLabel;

          const label = document.createElementNS(SVG_NS, 'text');
          label.setAttribute('class', 'piece-label');
          label.setAttribute('x', x + w / 2);
          label.setAttribute('y', y + h / 2 - 2);
          label.setAttribute('text-anchor', 'middle');
          label.setAttribute('dominant-baseline', 'auto');
          label.textContent = labelStr.length > w / 6.5 ? name : labelStr;
          svg.appendChild(label);

          const dimW = item.bp.rotated ? item.bp.piece.length : item.bp.piece.width;
          const dimL = item.bp.rotated ? item.bp.piece.width : item.bp.piece.length;
          const dim = document.createElementNS(SVG_NS, 'text');
          dim.setAttribute('class', 'piece-dim');
          dim.setAttribute('x', x + w / 2);
          dim.setAttribute('y', y + h / 2 + 10);
          dim.setAttribute('text-anchor', 'middle');
          dim.textContent = `${dimL}" × ${dimW}"`;
          svg.appendChild(dim);
        }

        // Tooltip + interaction
        const makeTooltipText = () => {
          const dimW = item.bp.rotated ? item.bp.piece.length : item.bp.piece.width;
          const dimL = item.bp.rotated ? item.bp.piece.width : item.bp.piece.length;
          let info = `${name}: ${dimL}" × ${dimW}"`;
          if (item.bp.rotated) info += ' (rotated)';
          if (item.stripNum > 0) info += ` — glue-up strip ${item.stripNum} of ${item.bp.glueUp.stripCount}`;
          return info;
        };

        const showTip = () => {
          tooltip.textContent = makeTooltipText();
          tooltip.style.display = 'block';
          const svgRect = svg.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const tipW = tooltip.offsetWidth;
          let left = svgRect.left - containerRect.left + parseFloat(rect.getAttribute('x')) + w / 2 - tipW / 2;
          left = Math.max(0, Math.min(left, containerRect.width - tipW));
          tooltip.style.left = left + 'px';
          tooltip.style.top = (svgRect.top - containerRect.top + parseFloat(rect.getAttribute('y')) - tooltip.offsetHeight - 8) + 'px';
          highlightAssignRow(assignList, item.assignIdx, true);
        };

        const hideTip = () => {
          tooltip.style.display = 'none';
          highlightAssignRow(assignList, item.assignIdx, false);
        };

        rect.addEventListener('mouseenter', showTip);
        rect.addEventListener('mouseleave', hideTip);
        rect.addEventListener('click', (e) => {
          e.stopPropagation();
          if (rect.classList.contains('highlighted')) {
            rect.classList.remove('highlighted');
            hideTip();
          } else {
            svg.querySelectorAll('.piece-rect.highlighted').forEach(r => r.classList.remove('highlighted'));
            rect.classList.add('highlighted');
            showTip();
            const li = assignList?.children[item.assignIdx];
            if (li) li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        });

        xOffset += item.sec.length;
      }

      yOffset += colWidth;
    }

    svgWrapper.appendChild(svg);
    wrapper.appendChild(svgWrapper);
    container.appendChild(wrapper);
  }

  // Dismiss on outside click
  document.addEventListener('click', () => {
    tooltip.style.display = 'none';
    container.querySelectorAll('.piece-rect.highlighted').forEach(r => r.classList.remove('highlighted'));
    if (assignList) assignList.querySelectorAll('.assign-highlighted').forEach(li => li.classList.remove('assign-highlighted'));
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
