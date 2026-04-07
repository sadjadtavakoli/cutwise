import { createNeededPiece, createStockItem, createConstraints } from './models.js';
import { optimize } from './optimizer.js';
import { createStorage } from './storage.js';
import { DIMENSIONAL_PRESETS, SHEET_PRESETS } from './presets.js';
import {
  addPieceRow, addStockRow,
  readPiecesFromTable, readStockFromTable,
  readConstraints, setConstraints,
  renderResults, parsePastedPieces,
} from './ui.js';

const storage = createStorage(window.localStorage);

const piecesBody = document.getElementById('needed-pieces-body');
const stockBody = document.getElementById('stock-body');
const resultsContainer = document.getElementById('results-container');
const resultsSection = document.getElementById('results-section');

// --- Needed Pieces ---
document.getElementById('btn-add-piece').addEventListener('click', () => addPieceRow(piecesBody));

document.getElementById('btn-paste-pieces').addEventListener('click', () => {
  const text = prompt('Paste tab-separated data:\nName\\tLength\\tWidth\\tThickness\\tQty\\tCanGlue\\tGrain');
  if (!text) return;
  const pieces = parsePastedPieces(text);
  for (const p of pieces) addPieceRow(piecesBody, p);
});

// --- Available Stock ---
document.getElementById('btn-add-stock').addEventListener('click', () => addStockRow(stockBody));

document.getElementById('btn-load-presets').addEventListener('click', () => {
  for (const p of DIMENSIONAL_PRESETS) addStockRow(stockBody, p);
  for (const p of SHEET_PRESETS) addStockRow(stockBody, p);
});

// --- Scan Label ---
const scanFile = document.getElementById('scan-file');
const scanPreview = document.getElementById('scan-preview');
const scanImageEl = document.getElementById('scan-image');
const scanStatus = document.getElementById('scan-status');

document.getElementById('btn-scan-label').addEventListener('click', () => {
  scanFile.click();
});

scanFile.addEventListener('change', async () => {
  const file = scanFile.files[0];
  if (!file) return;

  // Show preview
  scanPreview.hidden = false;
  scanImageEl.src = URL.createObjectURL(file);
  scanStatus.textContent = 'Scanning...';
  scanStatus.className = 'scanning';

  try {
    const { scanImage } = await import('./scanner.js');
    const result = await scanImage(file);

    if (!result.thickness && !result.width && !result.length && !result.price) {
      scanStatus.textContent = "Couldn't read label — try a clearer photo";
      scanStatus.className = 'error';
    } else {
      scanStatus.textContent = 'Done! Review the row below.';
      scanStatus.className = 'success';
      addStockRow(stockBody, {
        name: result.name || '',
        type: result.type || 'dimensional',
        length: result.length || '',
        width: result.width || '',
        thickness: result.thickness || '',
        price: result.price || '',
        quantity: null,
      });
    }
  } catch (e) {
    scanStatus.textContent = 'Scanner unavailable';
    scanStatus.className = 'error';
    console.error('Scan error:', e);
  }

  scanFile.value = '';
});

// --- Project save/load ---
const projectSelect = document.getElementById('project-select');
const projectName = document.getElementById('project-name');

function refreshProjectList() {
  const names = storage.listProjects();
  projectSelect.innerHTML = '<option value="">— New project —</option>';
  for (const name of names) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    projectSelect.appendChild(opt);
  }
}

document.getElementById('btn-save-project').addEventListener('click', () => {
  const name = projectName.value.trim();
  if (!name) { alert('Enter a project name'); return; }
  const pieces = readPiecesFromTable(piecesBody);
  storage.saveProject(name, { name, pieces });
  refreshProjectList();
  projectSelect.value = name;
});

projectSelect.addEventListener('change', () => {
  const name = projectSelect.value;
  if (!name) return;
  const project = storage.loadProject(name);
  if (!project) return;
  piecesBody.innerHTML = '';
  for (const p of project.pieces) addPieceRow(piecesBody, p);
  projectName.value = name;
});

document.getElementById('btn-delete-project').addEventListener('click', () => {
  const name = projectSelect.value;
  if (!name) return;
  if (!confirm(`Delete project "${name}"?`)) return;
  storage.deleteProject(name);
  refreshProjectList();
  piecesBody.innerHTML = '';
  projectName.value = '';
});

// --- Stock list save/load ---
const stockSelect = document.getElementById('stock-select');
const stockName = document.getElementById('stock-name');

function refreshStockList() {
  const names = storage.listStockLists();
  stockSelect.innerHTML = '<option value="">— New list —</option>';
  for (const name of names) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    stockSelect.appendChild(opt);
  }
}

document.getElementById('btn-save-stock').addEventListener('click', () => {
  const name = stockName.value.trim();
  if (!name) { alert('Enter a stock list name'); return; }
  const items = readStockFromTable(stockBody);
  storage.saveStockList(name, { name, items });
  refreshStockList();
  stockSelect.value = name;
});

stockSelect.addEventListener('change', () => {
  const name = stockSelect.value;
  if (!name) return;
  const list = storage.loadStockList(name);
  if (!list) return;
  stockBody.innerHTML = '';
  for (const item of list.items) addStockRow(stockBody, item);
  stockName.value = name;
});

document.getElementById('btn-delete-stock').addEventListener('click', () => {
  const name = stockSelect.value;
  if (!name) return;
  if (!confirm(`Delete stock list "${name}"?`)) return;
  storage.deleteStockList(name);
  refreshStockList();
  stockBody.innerHTML = '';
  stockName.value = '';
});

// --- Optimize ---
document.getElementById('btn-optimize').addEventListener('click', () => {
  const rawPieces = readPiecesFromTable(piecesBody);
  const rawStock = readStockFromTable(stockBody);
  const rawConstraints = readConstraints();

  if (rawPieces.length === 0) { alert('Add at least one needed piece'); return; }
  if (rawStock.length === 0) { alert('Add at least one stock item'); return; }

  const pieces = rawPieces.map(p => createNeededPiece(p));
  const stock = rawStock.map(s => createStockItem(s));
  const constraints = createConstraints(rawConstraints);

  const results = optimize(pieces, stock, constraints);

  renderResults(resultsContainer, results);
  resultsSection.hidden = false;
  resultsSection.scrollIntoView({ behavior: 'smooth' });
});

// --- Import/Export ---
document.getElementById('btn-export').addEventListener('click', () => {
  const data = storage.exportAll();
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cutwise-data.json';
  a.click();
  URL.revokeObjectURL(url);
});

const importFile = document.getElementById('import-file');
document.getElementById('btn-import').addEventListener('click', () => importFile.click());
importFile.addEventListener('change', () => {
  const file = importFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      storage.importAll(reader.result);
      refreshProjectList();
      refreshStockList();
      alert('Data imported successfully');
    } catch (e) {
      alert('Import failed: ' + e.message);
    }
  };
  reader.readAsText(file);
  importFile.value = '';
});

// --- Init ---
function init() {
  refreshProjectList();
  refreshStockList();

  const savedConstraints = storage.loadConstraints();
  if (savedConstraints) setConstraints(savedConstraints);

  // Start with one empty row in each table
  addPieceRow(piecesBody);
  addStockRow(stockBody);
}

init();
