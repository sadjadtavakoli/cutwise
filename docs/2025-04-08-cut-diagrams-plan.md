# Visual Cut Diagrams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add interactive SVG cut diagrams showing where each piece is cut from each board, displayed between purchase list and cut assignments.

**Architecture:** New `js/diagram.js` module renders inline SVG diagrams from optimizer results. The optimizer is updated to pass board-level pattern data through to results. `renderResults` in `ui.js` inserts diagram container between purchase list and assignments, then calls the diagram renderer. Interactions (hover/tap/click) use native SVG DOM events.

**Tech Stack:** Vanilla JS, inline SVG via DOM API, CSS for tooltips/highlights.

---

## File Structure

```
cutwise/
├── js/
│   ├── diagram.js          — NEW: SVG rendering, piece layout, interactions
│   ├── ilp-optimizer.js    — MODIFY: include patterns in result for diagram
│   └── ui.js               — MODIFY: renderResults adds diagram between purchase list and assignments
└── css/
    └── style.css           — MODIFY: diagram, tooltip, highlight, waste-hatch styles
```

---

### Task 1: Pass board patterns through optimizer results

**Files:**
- Modify: `js/ilp-optimizer.js`

The diagram needs to know which pieces are on which board. Currently `formatSolution` drops the pattern data. We need to include it.

- [ ] **Step 1: Update formatSolution to include boards data**

In `js/ilp-optimizer.js`, find the `formatSolution` function (around line 782). It currently returns `{ totalCost, totalCuts, purchases, assignments, unassigned, strategyName }`.

Add a `boards` array to the return value. Each board entry has the stock info and its demands (pieces + their sections).

Change the function to build a `boards` array from the patterns:

```js
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
  const boards = []; // NEW: per-board data for diagrams

  for (const pattern of solution.patterns) {
    const stockKey = `${pattern.stock.name}::${pattern.stock.price}`;
    if (purchaseMap.has(stockKey)) {
      purchaseMap.get(stockKey).quantity += 1;
    } else {
      purchaseMap.set(stockKey, { stock: pattern.stock, quantity: 1 });
    }

    // Build board entry for diagram
    const boardEntry = {
      stock: pattern.stock,
      pieces: [], // { piece, rotated, glueUp, sections }
    };

    for (const demand of pattern.demands) {
      const isGlue = demand.type === 'glueup';
      const assignment = {
        neededPiece: demand.piece,
        sourceStock: pattern.stock,
        rotated: demand.rotated || false,
        glueUp: isGlue ? { stripCount: demand.stripCount, stockUsed: pattern.stock } : null,
      };
      assignments.push(assignment);
      assignedIds.add(demand.piece._id);

      boardEntry.pieces.push({
        piece: demand.piece,
        rotated: demand.rotated || false,
        glueUp: isGlue ? { stripCount: demand.stripCount } : null,
        sections: demand.sections, // width × length rectangles on the board
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
    boards, // NEW
  };
}
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `node tests/test-ilp.js && node tests/test-optimizer.js`
Expected: All pass (boards is additive, doesn't break existing fields).

- [ ] **Step 3: Commit**

```bash
git add js/ilp-optimizer.js
git commit -m "Include board patterns in optimizer results for diagrams"
```

---

### Task 2: Diagram CSS styles

**Files:**
- Modify: `css/style.css`

- [ ] **Step 1: Add diagram styles before the @media query**

Append these styles to `css/style.css` before the `@media (max-width: 640px)` rule:

```css
/* Cut diagrams */
.diagram-container {
  margin: 0.75rem 0;
}

.board-diagram {
  margin-bottom: 1rem;
}

.board-diagram-title {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
  color: #495057;
}

.board-svg-wrapper {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.board-svg {
  display: block;
}

.board-svg .board-outline {
  fill: #f1f3f5;
  stroke: #adb5bd;
  stroke-width: 1;
}

.board-svg .piece-rect {
  stroke: #fff;
  stroke-width: 1.5;
  cursor: pointer;
  transition: opacity 0.15s;
}

.board-svg .piece-rect:hover,
.board-svg .piece-rect.highlighted {
  stroke: #212529;
  stroke-width: 2.5;
  opacity: 0.85;
}

.board-svg .piece-label {
  font-size: 11px;
  fill: #212529;
  pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.board-svg .piece-dim {
  font-size: 9px;
  fill: #495057;
  pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.board-svg .waste-area {
  fill: url(#waste-hatch);
}

/* Diagram tooltip */
.diagram-tooltip {
  position: absolute;
  background: #212529;
  color: white;
  padding: 0.4rem 0.6rem;
  border-radius: 4px;
  font-size: 0.8rem;
  pointer-events: none;
  z-index: 100;
  white-space: nowrap;
  max-width: 250px;
}

.diagram-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: #212529;
}

/* Assignment row highlight */
.result-list li.assign-highlighted {
  background: #fff3bf;
  border-radius: 3px;
}
```

Also add to the existing `@media (max-width: 640px)` block:

```css
  .board-svg .piece-label { font-size: 9px; }
  .board-svg .piece-dim { font-size: 7px; }
```

- [ ] **Step 2: Commit**

```bash
git add css/style.css
git commit -m "Add cut diagram CSS styles"
```

---

### Task 3: Diagram renderer module

**Files:**
- Create: `js/diagram.js`

This is the main module. It takes a result's `boards` array and renders SVG diagrams.

- [ ] **Step 1: Create js/diagram.js**

```js
const SVG_NS = 'http://www.w3.org/2000/svg';

const COLORS = [
  '#4dabf7', '#69db7c', '#ffd43b', '#ff8787',
  '#da77f2', '#ffa94d', '#63e6be', '#e599f7',
];

/**
 * Render cut diagrams for a solution's boards into a container element.
 * @param {HTMLElement} container - DOM element to render into
 * @param {Array} boards - from result.boards
 * @param {HTMLElement} assignList - the <ul> of cut assignments for interaction linking
 */
export function renderDiagrams(container, boards, assignList) {
  container.innerHTML = '';
  if (!boards || boards.length === 0) return;

  // Build color map: unique piece name → color
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

  // Find max board dimension for uniform scaling
  let maxBoardLen = 0;
  for (const board of boards) {
    if (board.stock.length > maxBoardLen) maxBoardLen = board.stock.length;
  }

  const MAX_SVG_WIDTH = 860;
  const PADDING = 10;
  const scale = maxBoardLen > 0 ? (MAX_SVG_WIDTH - 2 * PADDING) / maxBoardLen : 1;

  // Create shared SVG defs for waste hatch pattern
  const defsId = 'diagram-defs-' + Date.now();

  // Track assignment index for linking to text list
  let globalAssignIdx = 0;

  // Create tooltip element (shared across all boards)
  let tooltip = container.querySelector('.diagram-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'diagram-tooltip';
    tooltip.style.display = 'none';
    container.style.position = 'relative';
    container.appendChild(tooltip);
  }

  for (let boardIdx = 0; boardIdx < boards.length; boardIdx++) {
    const board = boards[boardIdx];
    const boardW = board.stock.width;
    const boardL = board.stock.length;

    const svgWidth = boardL * scale + 2 * PADDING;
    const svgHeight = boardW * scale + 2 * PADDING;

    const wrapper = document.createElement('div');
    wrapper.className = 'board-diagram';

    // Board title
    const title = document.createElement('div');
    title.className = 'board-diagram-title';
    title.textContent = `${board.stock.name} #${boardIdx + 1} (${boardL}" × ${boardW}")`;
    wrapper.appendChild(title);

    // SVG wrapper for horizontal scroll on mobile
    const svgWrapper = document.createElement('div');
    svgWrapper.className = 'board-svg-wrapper';

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'board-svg');
    svg.setAttribute('width', svgWidth);
    svg.setAttribute('height', svgHeight);
    svg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);

    // Defs for waste hatch (add once per SVG)
    const defs = document.createElementNS(SVG_NS, 'defs');
    const pattern = document.createElementNS(SVG_NS, 'pattern');
    pattern.setAttribute('id', `waste-hatch-${boardIdx}`);
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    pattern.setAttribute('width', '8');
    pattern.setAttribute('height', '8');
    const line1 = document.createElementNS(SVG_NS, 'line');
    line1.setAttribute('x1', '0'); line1.setAttribute('y1', '8');
    line1.setAttribute('x2', '8'); line1.setAttribute('y2', '0');
    line1.setAttribute('stroke', '#ced4da'); line1.setAttribute('stroke-width', '1');
    pattern.appendChild(line1);
    defs.appendChild(pattern);
    svg.appendChild(defs);

    // Board outline
    const boardRect = document.createElementNS(SVG_NS, 'rect');
    boardRect.setAttribute('class', 'board-outline');
    boardRect.setAttribute('x', PADDING);
    boardRect.setAttribute('y', PADDING);
    boardRect.setAttribute('width', boardL * scale);
    boardRect.setAttribute('height', boardW * scale);
    svg.appendChild(boardRect);

    // Layout pieces into rows (same approach as optimizer: group sections by height)
    const rows = layoutPieces(board, scale, PADDING);

    // Track which areas are used (for waste calculation)
    const usedRects = [];

    for (const row of rows) {
      for (const item of row.items) {
        const { x, y, w, h, bp, assignIndex } = item;

        usedRects.push({ x, y, w, h });

        const color = colorMap.get(bp.piece.name || `${bp.piece.length}"×${bp.piece.width}"`) || '#ccc';

        // Piece rectangle
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('class', 'piece-rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', w);
        rect.setAttribute('height', h);
        rect.setAttribute('fill', color);
        rect.setAttribute('data-assign-idx', assignIndex);
        svg.appendChild(rect);

        // Piece name label
        const pieceName = bp.piece.name || `${bp.piece.length}"×${bp.piece.width}"`;
        const glueLabel = bp.glueUp ? ` (strip ${item.stripNum} of ${bp.glueUp.stripCount})` : '';
        const labelText = pieceName + glueLabel;

        if (w > 30 && h > 14) {
          const label = document.createElementNS(SVG_NS, 'text');
          label.setAttribute('class', 'piece-label');
          label.setAttribute('x', x + w / 2);
          label.setAttribute('y', y + h / 2 - 2);
          label.setAttribute('text-anchor', 'middle');
          label.setAttribute('dominant-baseline', 'auto');
          label.textContent = labelText.length > w / 7 ? pieceName : labelText;
          svg.appendChild(label);

          // Dimension annotation
          const dimW = bp.rotated ? bp.piece.length : bp.piece.width;
          const dimL = bp.rotated ? bp.piece.width : bp.piece.length;
          const dim = document.createElementNS(SVG_NS, 'text');
          dim.setAttribute('class', 'piece-dim');
          dim.setAttribute('x', x + w / 2);
          dim.setAttribute('y', y + h / 2 + 10);
          dim.setAttribute('text-anchor', 'middle');
          dim.textContent = `${dimL}" × ${dimW}"`;
          svg.appendChild(dim);
        }

        // Interaction: hover/tap → tooltip + highlight assignment row
        const showTooltip = (e) => {
          const dimW = bp.rotated ? bp.piece.length : bp.piece.width;
          const dimL = bp.rotated ? bp.piece.width : bp.piece.length;
          let info = `${pieceName}: ${dimL}" × ${dimW}"`;
          if (bp.rotated) info += ' (rotated)';
          if (bp.glueUp) info += ` — glue-up strip ${item.stripNum} of ${bp.glueUp.stripCount}`;
          tooltip.textContent = info;
          tooltip.style.display = 'block';

          // Position tooltip above the piece
          const svgRect = svg.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          tooltip.style.left = (svgRect.left - containerRect.left + parseFloat(x) + w / 2 - tooltip.offsetWidth / 2) + 'px';
          tooltip.style.top = (svgRect.top - containerRect.top + parseFloat(y) - tooltip.offsetHeight - 8) + 'px';

          // Highlight corresponding assignment row
          highlightAssignRow(assignList, assignIndex, true);
        };

        const hideTooltip = () => {
          tooltip.style.display = 'none';
          highlightAssignRow(assignList, assignIndex, false);
        };

        // Desktop: hover
        rect.addEventListener('mouseenter', showTooltip);
        rect.addEventListener('mouseleave', hideTooltip);

        // Mobile: tap toggle
        rect.addEventListener('click', (e) => {
          e.stopPropagation();
          if (rect.classList.contains('highlighted')) {
            rect.classList.remove('highlighted');
            hideTooltip();
          } else {
            // Remove other highlights
            svg.querySelectorAll('.piece-rect.highlighted').forEach(r => r.classList.remove('highlighted'));
            rect.classList.add('highlighted');
            showTooltip(e);

            // Scroll assignment row into view
            const li = assignList?.children[assignIndex];
            if (li) li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        });
      }
    }

    // Draw waste areas (board area minus used rects)
    // Simple approach: draw board-sized waste rect behind everything, pieces draw on top
    // Re-insert board rect as waste-filled, then pieces overlay
    boardRect.setAttribute('fill', `url(#waste-hatch-${boardIdx})`);

    svgWrapper.appendChild(svg);
    wrapper.appendChild(svgWrapper);
    container.appendChild(wrapper);
  }

  // Dismiss tooltip when clicking outside
  document.addEventListener('click', () => {
    tooltip.style.display = 'none';
    container.querySelectorAll('.piece-rect.highlighted').forEach(r => r.classList.remove('highlighted'));
    if (assignList) {
      assignList.querySelectorAll('.assign-highlighted').forEach(li => li.classList.remove('assign-highlighted'));
    }
  });
}

/**
 * Layout pieces on a board into rows, returning positioned items.
 * Groups sections by height (row height), packs within each row by width.
 */
function layoutPieces(board, scale, padding) {
  const rows = [];
  let currentY = 0;

  // Flatten all sections with their parent piece info
  const allSections = [];
  let assignIdx = 0;
  for (const bp of board.pieces) {
    if (bp.glueUp) {
      // Glue-up: multiple sections (strips)
      for (let i = 0; i < bp.sections.length; i++) {
        allSections.push({
          section: bp.sections[i],
          bp,
          stripNum: i + 1,
          assignIndex: assignIdx,
        });
      }
    } else {
      allSections.push({
        section: bp.sections[0],
        bp,
        stripNum: 0,
        assignIndex: assignIdx,
      });
    }
    assignIdx++;
  }

  // Group by section height (length), rounded to avoid float issues
  const byHeight = new Map();
  for (const item of allSections) {
    const key = Math.round(item.section.length * 1000);
    if (!byHeight.has(key)) byHeight.set(key, []);
    byHeight.get(key).push(item);
  }

  for (const [heightKey, items] of byHeight) {
    const rowHeight = heightKey / 1000;
    // Pack items left-to-right within the row
    let currentX = 0;
    const rowItems = [];

    // May need multiple sub-rows if items don't fit in one row width
    const boardWidth = board.stock.width;
    let subRowX = 0;
    let subRowY = currentY;

    for (const item of items) {
      const itemWidth = item.section.width;

      if (subRowX + itemWidth > boardWidth + 0.001) {
        // Start a new sub-row
        subRowY += rowHeight * scale;
        subRowX = 0;
      }

      rowItems.push({
        x: padding + subRowY, // Note: SVG x = board length axis, y = board width axis
        // Actually: let's use x = length axis (horizontal), y = width axis (vertical)
        // Board is drawn as: width = SVG height, length = SVG width
        // So piece section.length goes along SVG x-axis, section.width along SVG y-axis
        x: padding + currentY * scale,
        y: padding + subRowX * scale,
        w: rowHeight * scale,
        h: itemWidth * scale,
        bp: item.bp,
        assignIndex: item.assignIndex,
        stripNum: item.stripNum,
      });

      subRowX += itemWidth;
    }

    currentY += rowHeight;
    rows.push({ height: rowHeight, items: rowItems });
  }

  return rows;
}

/**
 * Highlight/unhighlight an assignment list row.
 */
function highlightAssignRow(assignList, index, highlight) {
  if (!assignList) return;
  const li = assignList.children[index];
  if (!li) return;
  if (highlight) {
    li.classList.add('assign-highlighted');
  } else {
    li.classList.remove('assign-highlighted');
  }
}

/**
 * Wire reverse interaction: hovering assignment text highlights diagram piece.
 */
export function wireAssignListHover(assignList, diagramContainer) {
  if (!assignList || !diagramContainer) return;
  const items = assignList.querySelectorAll('li');
  items.forEach((li, idx) => {
    li.addEventListener('mouseenter', () => {
      const rects = diagramContainer.querySelectorAll(`.piece-rect[data-assign-idx="${idx}"]`);
      rects.forEach(r => r.classList.add('highlighted'));
    });
    li.addEventListener('mouseleave', () => {
      const rects = diagramContainer.querySelectorAll(`.piece-rect[data-assign-idx="${idx}"]`);
      rects.forEach(r => r.classList.remove('highlighted'));
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add js/diagram.js
git commit -m "Add SVG cut diagram renderer with interactions"
```

---

### Task 4: Integrate diagrams into renderResults

**Files:**
- Modify: `js/ui.js`

- [ ] **Step 1: Update renderResults to include diagram container**

In `js/ui.js`, update the `renderResults` function. The card HTML currently has purchase list then cut assignments. Insert a diagram container between them.

Replace the `card.innerHTML = ...` block in `renderResults` (around line 127-140) with:

```js
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
      <div class="result-section-title">Cut Diagrams</div>
      <div class="diagram-container"></div>
      <div class="result-section-title">Cut Assignments</div>
      <ul class="result-list assign-list">${assignHtml}</ul>
      ${unassignedHtml}
    `;
    container.appendChild(card);

    // Render diagrams
    if (result.boards && result.boards.length > 0) {
      const diagramContainer = card.querySelector('.diagram-container');
      const assignList = card.querySelector('.assign-list');
      import('./diagram.js').then(({ renderDiagrams, wireAssignListHover }) => {
        renderDiagrams(diagramContainer, result.boards, assignList);
        wireAssignListHover(assignList, diagramContainer);
      });
    }
```

Note: The `assign-list` class is added to the assignments `<ul>` so the diagram can find it for interaction linking.

- [ ] **Step 2: Verify in browser**

1. Open http://localhost:8070
2. Enter some test data (pieces + stock)
3. Click Optimize
4. Verify: purchase list → colored SVG diagrams → text cut assignments
5. Hover a piece in the diagram → tooltip shows, assignment row highlights
6. Click a piece → scrolls to assignment row
7. Hover an assignment row → piece in diagram highlights

- [ ] **Step 3: Commit**

```bash
git add js/ui.js
git commit -m "Integrate cut diagrams into results display"
```

---

### Task 5: Layout fixes and polish

**Files:**
- Possibly modify: `js/diagram.js`, `css/style.css`

The layout algorithm in Task 3 has a coordinate mapping issue (board length = SVG x-axis, board width = SVG y-axis). This task verifies and fixes the layout with real data.

- [ ] **Step 1: Test with the user's "asali" scenario**

Enter in the app:
- Pieces: base 16×16 (qty 2), smaller base 12×12 (qty 2), stand 16×2.5 (qty 16)
- Stock: bozorg 80×11.5 ($15), vasat 80×9.5 ($13)
- Settings: kerf 0, overage 0, max glue joints 2

Click Optimize and verify:
- bozorg board shows 16 stands arranged in rip strips
- vasat boards show glue-up strips labeled "base (strip 1 of 2)" etc.
- Waste areas show hatched pattern
- Pieces are proportionally sized

- [ ] **Step 2: Fix any layout or rendering issues**

Common issues to check:
- Pieces overlapping (coordinate math wrong)
- Pieces extending outside board outline
- Labels cut off or overlapping
- Tooltip positioning off-screen on mobile
- Missing waste hatch pattern

Fix inline in diagram.js.

- [ ] **Step 3: Test on mobile viewport**

Open browser DevTools → toggle device mode → select iPhone or similar.
Verify:
- Diagrams scroll horizontally if wider than screen
- Tap works (shows tooltip, highlights row)
- Tap elsewhere dismisses
- Labels readable at small size

- [ ] **Step 4: Run all tests**

```bash
node tests/test-models.js && node tests/test-cost.js && node tests/test-greedy.js && node tests/test-optimizer.js && node tests/test-ilp.js && node tests/test-scanner.js && node tests/test-storage.js
```

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "Polish cut diagram layout and mobile behavior"
```
