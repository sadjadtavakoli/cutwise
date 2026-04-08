# Visual Cut Diagrams — Design Spec

## Overview

Add interactive SVG cut diagrams to the optimization results. Each purchased board is drawn with colored rectangles showing where each piece is cut from it. Appears between the purchase list and the text cut assignments.

## Diagram Layout

For each board in the solution:

- **Board outline** — light gray rectangle, proportionally scaled (width × length)
- **Piece rectangles** — colored blocks positioned within the board:
  - Piece name label inside
  - Dimensions annotated (e.g. "16" × 3"")
  - Each unique piece name gets a consistent color from a palette
- **Waste areas** — remaining space shaded with a hatched/striped pattern
- **Glue-up strips** — labeled "base (strip 1 of 2)" etc.
- **Board header** — stock name + board number (e.g. "bozorg #1")

**Scaling:** All boards drawn to fit within page width (max ~900px). All boards in a solution use the same scale so sizes are visually comparable.

**Colors:** Consistent color per piece name across all boards in a solution. Use a palette of 8-10 distinct, accessible colors.

## Interactivity

### Desktop
- **Hover** a piece rectangle: highlight (brighter border), show tooltip with piece name, dimensions, rotated/glue-up info
- **Click** a piece rectangle: scroll to and highlight the matching row in text cut assignments below
- **Click again** or click elsewhere: remove highlight
- **Hover** a row in cut assignments text: highlight the corresponding rectangle in the diagram above

### Mobile
- **Tap** replaces hover: shows tooltip and highlights matching text row
- **Tap again** or tap elsewhere: dismiss
- Tooltip positioned above the piece (not cursor-following), so it doesn't get cut off
- Diagrams scroll horizontally if board is wider than screen (subtle scroll indicator)
- Piece labels use smaller font on narrow screens

## Technical Integration

### New Files

- `js/diagram.js` — SVG diagram rendering and interaction:
  - `renderDiagrams(container, results)` — creates SVG diagrams for a solution's boards
  - Groups assignments by source board
  - Lays out pieces using row-based 2D packing (matching optimizer's cutting model)
  - Handles hover/click/tap interactions
  - Manages tooltip display

### Modified Files

- `js/ui.js` — `renderResults` updated to call `renderDiagrams` between purchase list and cut assignments for each result card
- `css/style.css` — styles for diagram container, tooltips, highlights, mobile scroll, hatched waste pattern

### Unchanged Files

- All other JS modules, index.html, auth, storage, scanner, optimizer

### SVG Approach

Built with DOM API (`document.createElementNS`), no external library. SVGs are inline in the results container so events work natively.

### Data Flow

The optimizer returns `assignments` (each with `neededPiece`, `sourceStock`, `rotated`, `glueUp`) and `purchases` (each with `stock`, `quantity`). The diagram module:

1. Groups assignments by source stock (which board they come from)
2. For each board, lays out pieces in rows (crosscuts) and columns (rips) — same model as the optimizer
3. Renders each board as an SVG with positioned piece rectangles
4. Wires interaction events

### Piece Layout Algorithm

For each board:
1. Group assigned pieces by the row height they need (piece length + overage + kerf for crosscuts)
2. Within each row, place pieces left-to-right by width
3. Stack rows top-to-bottom along the board length
4. Remaining space = waste (hatched)

This mirrors the optimizer's row-based packing, so the diagram accurately represents the cutting plan.

## Color Palette

8 distinct colors for piece names, cycling if more than 8 unique names:
```
#4dabf7 (blue), #69db7c (green), #ffd43b (yellow), #ff8787 (red),
#da77f2 (purple), #ffa94d (orange), #63e6be (teal), #e599f7 (pink)
```

## Responsive Behavior

- Boards scale to fit container width
- Below 640px: smaller fonts, horizontal scroll for very wide boards
- Touch events for mobile interaction
- Tooltip avoids screen edges
