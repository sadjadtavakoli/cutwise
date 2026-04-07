# CutWise

Lumber purchase optimizer. Takes your project's bill of materials and available stock, then tells you what to buy and how to cut it to minimize total cost.

## How It Works

1. Enter the pieces you need (dimensions, quantity, whether they can be glued)
2. Enter available stock (or load presets for common lumber sizes)
3. Click **Optimize**
4. Get 3 solutions ranked by price, each showing a purchase list and cut assignments

## Features

- **2D guillotine cutting** — boards can be ripped and crosscut in both directions
- **Edge glue-up support** — automatically combines narrower boards to make wider panels
- **Multiple stock types** — dimensional lumber, hardwood (board-foot pricing), sheet goods
- **ILP solver** — uses integer linear programming for provably optimal results
- **Save/load** — projects and stock lists persist in localStorage
- **Export/import** — JSON backup for moving between devices
- **No server** — runs entirely in your browser, no data leaves your machine

## Usage

Serve with any HTTP server (ES modules require it):

```bash
cd cutwise
python3 -m http.server 8070
# Open http://localhost:8070
```

## Settings

- **Kerf width** — blade waste per cut (default 0.125")
- **Min glue strip width** — narrowest strip allowed in a glue-up (default 2")
- **Max glue joints** — maximum joints per glued panel (default 4)
- **Overage margin** — extra material per piece for squaring/sanding (default 0.5")

Set overage to 0 if you cut precisely and don't need trimming allowance.

## Running Tests

```bash
node tests/test-models.js
node tests/test-cost.js
node tests/test-greedy.js
node tests/test-optimizer.js
node tests/test-storage.js
node tests/test-ilp.js
```

## Tech Stack

Vanilla HTML + CSS + JS. No framework, no build step. Uses [javascript-lp-solver](https://github.com/nickmccurdy/javascript-lp-solver) for the ILP engine.
