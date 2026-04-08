import { createNeededPiece, createStockItem, createConstraints } from './models.js';
import { optimize } from './optimizer.js';
import { DIMENSIONAL_PRESETS, SHEET_PRESETS } from './presets.js';
import {
  addPieceRow, addStockRow,
  readPiecesFromTable, readStockFromTable,
  readConstraints, setConstraints,
  renderResults, parsePastedPieces,
} from './ui.js';

// --- State ---
let currentStorage = null;
let pendingSaveAction = null;

const piecesBody = document.getElementById('needed-pieces-body');
const stockBody = document.getElementById('stock-body');
const resultsContainer = document.getElementById('results-container');
const resultsSection = document.getElementById('results-section');

// --- Auth UI elements ---
const signInModal = document.getElementById('sign-in-modal');
const userIndicator = document.getElementById('user-indicator');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');

// --- Modal ---
function showSignInModal(afterSignIn) {
  pendingSaveAction = afterSignIn || null;
  signInModal.hidden = false;
}

function hideSignInModal() {
  signInModal.hidden = true;
}

document.getElementById('btn-google-sign-in').addEventListener('click', async () => {
  try {
    const { signInWithGoogle } = await import('./auth.js');
    await signInWithGoogle();
    hideSignInModal();
  } catch (e) {
    alert(e.message || 'Sign-in failed');
  }
});

document.getElementById('btn-modal-cancel').addEventListener('click', (e) => {
  e.preventDefault();
  pendingSaveAction = null;
  hideSignInModal();
});

// --- Sign out ---
document.getElementById('btn-sign-out').addEventListener('click', async (e) => {
  e.preventDefault();
  const { signOut } = await import('./auth.js');
  await signOut();
});

// --- Auth state handler ---
async function handleAuthStateChanged(user) {
  if (user) {
    const { createFirestoreStorage } = await import('./firestore-storage.js');
    currentStorage = createFirestoreStorage(user.uid);

    userAvatar.src = user.photoURL || '';
    userName.textContent = user.displayName || user.email || 'User';
    userIndicator.hidden = false;

    await refreshProjectList();
    await refreshStockList();

    const savedConstraints = await currentStorage.loadConstraints();
    if (savedConstraints) setConstraints(savedConstraints);

    if (pendingSaveAction) {
      const action = pendingSaveAction;
      pendingSaveAction = null;
      await action();
    }
  } else {
    currentStorage = null;
    userIndicator.hidden = true;
    userAvatar.src = '';
    userName.textContent = '';

    document.getElementById('project-select').innerHTML = '<option value="">— New project —</option>';
    document.getElementById('stock-select').innerHTML = '<option value="">— New list —</option>';
  }
}

async function requireAuth(action) {
  if (currentStorage) {
    await action();
  } else {
    showSignInModal(action);
  }
}

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

async function refreshProjectList() {
  if (!currentStorage) {
    projectSelect.innerHTML = '<option value="">— New project —</option>';
    return;
  }
  const names = await currentStorage.listProjects();
  projectSelect.innerHTML = '<option value="">— New project —</option>';
  for (const name of names) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    projectSelect.appendChild(opt);
  }
}

document.getElementById('btn-save-project').addEventListener('click', () => {
  requireAuth(async () => {
    const name = projectName.value.trim();
    if (!name) { alert('Enter a project name'); return; }
    const pieces = readPiecesFromTable(piecesBody);
    await currentStorage.saveProject(name, { name, pieces });
    await refreshProjectList();
    projectSelect.value = name;
  });
});

projectSelect.addEventListener('change', async () => {
  const name = projectSelect.value;
  if (!name || !currentStorage) return;
  const project = await currentStorage.loadProject(name);
  if (!project) return;
  piecesBody.innerHTML = '';
  for (const p of project.pieces) addPieceRow(piecesBody, p);
  projectName.value = name;
});

document.getElementById('btn-delete-project').addEventListener('click', () => {
  requireAuth(async () => {
    const name = projectSelect.value;
    if (!name) return;
    if (!confirm(`Delete project "${name}"?`)) return;
    await currentStorage.deleteProject(name);
    await refreshProjectList();
    piecesBody.innerHTML = '';
    projectName.value = '';
  });
});

// --- Stock list save/load ---
const stockSelect = document.getElementById('stock-select');
const stockName = document.getElementById('stock-name');

async function refreshStockList() {
  if (!currentStorage) {
    stockSelect.innerHTML = '<option value="">— New list —</option>';
    return;
  }
  const names = await currentStorage.listStockLists();
  stockSelect.innerHTML = '<option value="">— New list —</option>';
  for (const name of names) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    stockSelect.appendChild(opt);
  }
}

document.getElementById('btn-save-stock').addEventListener('click', () => {
  requireAuth(async () => {
    const name = stockName.value.trim();
    if (!name) { alert('Enter a stock list name'); return; }
    const items = readStockFromTable(stockBody);
    await currentStorage.saveStockList(name, { name, items });
    await refreshStockList();
    stockSelect.value = name;
  });
});

stockSelect.addEventListener('change', async () => {
  const name = stockSelect.value;
  if (!name || !currentStorage) return;
  const list = await currentStorage.loadStockList(name);
  if (!list) return;
  stockBody.innerHTML = '';
  for (const item of list.items) addStockRow(stockBody, item);
  stockName.value = name;
});

document.getElementById('btn-delete-stock').addEventListener('click', () => {
  requireAuth(async () => {
    const name = stockSelect.value;
    if (!name) return;
    if (!confirm(`Delete stock list "${name}"?`)) return;
    await currentStorage.deleteStockList(name);
    await refreshStockList();
    stockBody.innerHTML = '';
    stockName.value = '';
  });
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
document.getElementById('btn-export').addEventListener('click', async () => {
  if (!currentStorage) {
    alert('Sign in to export your saved data');
    return;
  }
  const projects = {};
  const stockLists = {};
  const names = await currentStorage.listProjects();
  for (const name of names) {
    projects[name] = await currentStorage.loadProject(name);
  }
  const stockNames = await currentStorage.listStockLists();
  for (const name of stockNames) {
    stockLists[name] = await currentStorage.loadStockList(name);
  }
  const constraints = await currentStorage.loadConstraints();
  const data = JSON.stringify({ projects, stockLists, constraints }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cutwise-data.json';
  a.click();
  URL.revokeObjectURL(url);
});

const importFile = document.getElementById('import-file');
document.getElementById('btn-import').addEventListener('click', () => {
  requireAuth(() => importFile.click());
});
importFile.addEventListener('change', async () => {
  const file = importFile.files[0];
  if (!file || !currentStorage) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      if (data.projects) {
        for (const [name, project] of Object.entries(data.projects)) {
          await currentStorage.saveProject(name, project);
        }
      }
      if (data.stockLists) {
        for (const [name, stockList] of Object.entries(data.stockLists)) {
          await currentStorage.saveStockList(name, stockList);
        }
      }
      if (data.constraints) {
        await currentStorage.saveConstraints(data.constraints);
      }
      await refreshProjectList();
      await refreshStockList();
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
  addPieceRow(piecesBody);
  addStockRow(stockBody);

  import('./auth.js').then(async ({ initAuth, onAuthStateChanged }) => {
    onAuthStateChanged(handleAuthStateChanged);
    await initAuth();
  }).catch(() => {
    console.warn('Firebase unavailable — running without cloud save');
  });
}

init();
