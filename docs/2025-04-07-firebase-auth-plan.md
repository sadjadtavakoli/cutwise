# Firebase Auth & Firestore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google sign-in and Firestore cloud storage so users can save projects and stock lists across devices.

**Architecture:** Firebase Auth for Google sign-in, Cloud Firestore for per-user data storage. Auth and Firestore SDK lazy-loaded from CDN via importmap. `app.js` uses a `currentStorage` variable that switches between null (not signed in, no save) and Firestore storage (signed in). Save buttons gate on auth state — if not signed in, show sign-in modal.

**Tech Stack:** Firebase JS SDK v10 (modular, CDN), Cloud Firestore, Firebase Auth with Google provider.

---

## File Structure

```
cutwise/
├── index.html                  — Add importmap entries for Firebase, sign-in modal HTML, user indicator
├── css/style.css               — Modal overlay, user indicator styles
├── js/
│   ├── firebase-config.js      — NEW: Firebase project credentials (user fills in)
│   ├── auth.js                 — NEW: Firebase Auth init, Google sign-in, auth state, modal control
│   ├── firestore-storage.js    — NEW: Firestore-backed storage with same API shape as storage.js
│   └── app.js                  — Rewrite: auth-aware, async storage, save gates on sign-in
└── firestore.rules             — NEW: Security rules file (for reference / deployment)
```

---

### Task 1: Firebase config and auth module

**Files:**
- Create: `js/firebase-config.js`
- Create: `js/auth.js`

- [ ] **Step 1: Create firebase-config.js with placeholder credentials**

Create `js/firebase-config.js`:

```js
// Replace these values with your Firebase project config.
// Get them from: Firebase Console → Project Settings → Your apps → Config
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};
```

- [ ] **Step 2: Create auth.js**

Create `js/auth.js`:

```js
import { firebaseConfig } from './firebase-config.js';

let app = null;
let auth = null;
let _currentUser = null;
let _authReadyResolve = null;
const _authReadyPromise = new Promise(r => { _authReadyResolve = r; });
const _listeners = [];

/**
 * Initialize Firebase app and auth. Call once on first auth interaction.
 * Lazy-loads Firebase SDK from CDN (already in importmap).
 */
export async function initAuth() {
  if (app) return; // already initialized

  const { initializeApp } = await import('firebase/app');
  const { getAuth, onAuthStateChanged: onAuthChanged, GoogleAuthProvider, signInWithPopup, signOut: fbSignOut } = await import('firebase/auth');

  app = initializeApp(firebaseConfig);
  auth = getAuth(app);

  // Store the imported functions for later use
  auth._GoogleAuthProvider = GoogleAuthProvider;
  auth._signInWithPopup = signInWithPopup;
  auth._fbSignOut = fbSignOut;

  onAuthChanged(auth, (user) => {
    _currentUser = user;
    _authReadyResolve();
    for (const cb of _listeners) cb(user);
  });
}

/**
 * Sign in with Google popup.
 * Initializes Firebase if not already done.
 */
export async function signInWithGoogle() {
  await initAuth();
  const provider = new auth._GoogleAuthProvider();
  try {
    await auth._signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked') {
      throw new Error('Please allow popups for sign-in');
    }
    throw e;
  }
}

/**
 * Sign out the current user.
 */
export async function signOut() {
  if (!auth) return;
  await auth._fbSignOut(auth);
}

/**
 * Register a callback for auth state changes.
 * Callback receives the user object (or null if signed out).
 */
export function onAuthStateChanged(callback) {
  _listeners.push(callback);
  // If auth is already initialized and we have a state, fire immediately
  if (_currentUser !== undefined) {
    callback(_currentUser);
  }
}

/**
 * Wait until auth state is known (resolved on first onAuthStateChanged fire).
 */
export async function waitForAuth() {
  await initAuth();
  return _authReadyPromise;
}

/**
 * Get the current user, or null.
 */
export function getCurrentUser() {
  return _currentUser;
}

/**
 * Check if a user is currently signed in.
 */
export function isSignedIn() {
  return _currentUser != null;
}
```

- [ ] **Step 3: Commit**

```bash
git add js/firebase-config.js js/auth.js
git commit -m "Add Firebase config and auth module"
```

---

### Task 2: Firestore storage module

**Files:**
- Create: `js/firestore-storage.js`

- [ ] **Step 1: Create firestore-storage.js**

Create `js/firestore-storage.js`:

```js
/**
 * Firestore-backed storage with the same API shape as localStorage storage.
 * All methods return Promises.
 */

let db = null;

async function getDb() {
  if (db) return db;
  const { getFirestore } = await import('firebase/firestore');
  // Firebase app is already initialized by auth.js
  const { getApp } = await import('firebase/app');
  db = getFirestore(getApp());
  return db;
}

async function docRef(path) {
  const firestore = await getDb();
  const { doc } = await import('firebase/firestore');
  return doc(firestore, path);
}

async function collectionRef(path) {
  const firestore = await getDb();
  const { collection } = await import('firebase/firestore');
  return collection(firestore, path);
}

export function createFirestoreStorage(userId) {
  const basePath = `users/${userId}`;

  return {
    async saveProject(name, project) {
      const { setDoc } = await import('firebase/firestore');
      const ref = await docRef(`${basePath}/projects/${name}`);
      await setDoc(ref, project);
    },

    async loadProject(name) {
      const { getDoc } = await import('firebase/firestore');
      const ref = await docRef(`${basePath}/projects/${name}`);
      const snap = await getDoc(ref);
      return snap.exists() ? snap.data() : null;
    },

    async deleteProject(name) {
      const { deleteDoc } = await import('firebase/firestore');
      const ref = await docRef(`${basePath}/projects/${name}`);
      await deleteDoc(ref);
    },

    async listProjects() {
      const { getDocs } = await import('firebase/firestore');
      const col = await collectionRef(`${basePath}/projects`);
      const snap = await getDocs(col);
      return snap.docs.map(d => d.id);
    },

    async saveStockList(name, stockList) {
      const { setDoc } = await import('firebase/firestore');
      const ref = await docRef(`${basePath}/stockLists/${name}`);
      await setDoc(ref, stockList);
    },

    async loadStockList(name) {
      const { getDoc } = await import('firebase/firestore');
      const ref = await docRef(`${basePath}/stockLists/${name}`);
      const snap = await getDoc(ref);
      return snap.exists() ? snap.data() : null;
    },

    async deleteStockList(name) {
      const { deleteDoc } = await import('firebase/firestore');
      const ref = await docRef(`${basePath}/stockLists/${name}`);
      await deleteDoc(ref);
    },

    async listStockLists() {
      const { getDocs } = await import('firebase/firestore');
      const col = await collectionRef(`${basePath}/stockLists`);
      const snap = await getDocs(col);
      return snap.docs.map(d => d.id);
    },

    async saveConstraints(constraints) {
      const { setDoc } = await import('firebase/firestore');
      const ref = await docRef(`${basePath}/constraints/settings`);
      await setDoc(ref, constraints);
    },

    async loadConstraints() {
      const { getDoc } = await import('firebase/firestore');
      const ref = await docRef(`${basePath}/constraints/settings`);
      const snap = await getDoc(ref);
      return snap.exists() ? snap.data() : null;
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add js/firestore-storage.js
git commit -m "Add Firestore storage module"
```

---

### Task 3: HTML — modal, user indicator, Firebase CDN

**Files:**
- Modify: `index.html`
- Modify: `css/style.css`

- [ ] **Step 1: Add Firebase CDN entries to the importmap in index.html**

The existing importmap (lines 121-127) needs Firebase entries. Replace the importmap block:

```html
  <script type="importmap">
    {
      "imports": {
        "javascript-lp-solver": "https://cdn.jsdelivr.net/npm/javascript-lp-solver@1.0.3/dist/index.browser.mjs",
        "firebase/app": "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js",
        "firebase/auth": "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js",
        "firebase/firestore": "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
      }
    }
  </script>
```

- [ ] **Step 2: Add user indicator to the header**

Replace the existing `<header>` block (lines 10-13):

```html
  <header>
    <h1>CutWise</h1>
    <p class="subtitle">Optimize lumber purchases by price</p>
    <div id="user-indicator" hidden>
      <img id="user-avatar" alt="" width="24" height="24">
      <span id="user-name"></span>
      <a href="#" id="btn-sign-out">Sign out</a>
    </div>
  </header>
```

- [ ] **Step 3: Add sign-in modal before closing body tag**

Add before the `<script type="importmap">` line:

```html
  <!-- Sign-in Modal -->
  <div id="sign-in-modal" class="modal-overlay" hidden>
    <div class="modal-card">
      <h3>Sign in to CutWise</h3>
      <p>Save your projects and access them from any device.</p>
      <button id="btn-google-sign-in" class="btn-google">
        Sign in with Google
      </button>
      <a href="#" id="btn-modal-cancel" class="modal-cancel">Cancel</a>
    </div>
  </div>
```

- [ ] **Step 4: Add modal and user indicator styles to css/style.css**

Append before the `@media` query:

```css
/* User indicator */
#user-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  font-size: 0.875rem;
}

#user-avatar {
  border-radius: 50%;
}

#btn-sign-out {
  color: #6c757d;
  font-size: 0.8rem;
}

/* Sign-in modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-card {
  background: white;
  border-radius: 8px;
  padding: 2rem;
  max-width: 360px;
  width: 90%;
  text-align: center;
}

.modal-card h3 {
  margin-bottom: 0.5rem;
  font-size: 1.25rem;
}

.modal-card p {
  color: #6c757d;
  margin-bottom: 1.5rem;
  font-size: 0.9rem;
}

.btn-google {
  display: inline-block;
  padding: 0.6rem 1.5rem;
  background: #4285f4;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  margin-bottom: 1rem;
}

.btn-google:hover {
  background: #3367d6;
}

.modal-cancel {
  display: block;
  color: #6c757d;
  font-size: 0.875rem;
}
```

- [ ] **Step 5: Commit**

```bash
git add index.html css/style.css
git commit -m "Add sign-in modal, user indicator, Firebase CDN imports"
```

---

### Task 4: Rewrite app.js for auth-aware storage

**Files:**
- Modify: `js/app.js`

This is the biggest task — `app.js` needs to:
1. Import auth module
2. Switch `currentStorage` based on auth state
3. Gate save/delete buttons on sign-in
4. Make all storage calls async
5. Wire modal and user indicator

- [ ] **Step 1: Rewrite app.js**

Replace the entire contents of `js/app.js`:

```js
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
let currentStorage = null; // null when not signed in, FirestoreStorage when signed in
let pendingSaveAction = null; // function to call after sign-in completes

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
    // pendingSaveAction is executed in onAuthStateChanged handler
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
    // Signed in — set up Firestore storage
    const { createFirestoreStorage } = await import('./firestore-storage.js');
    currentStorage = createFirestoreStorage(user.uid);

    // Show user indicator
    userAvatar.src = user.photoURL || '';
    userName.textContent = user.displayName || user.email || 'User';
    userIndicator.hidden = false;

    // Refresh dropdowns from Firestore
    await refreshProjectList();
    await refreshStockList();

    // Load saved constraints
    const savedConstraints = await currentStorage.loadConstraints();
    if (savedConstraints) setConstraints(savedConstraints);

    // Execute pending save action if sign-in was triggered by a save button
    if (pendingSaveAction) {
      const action = pendingSaveAction;
      pendingSaveAction = null;
      await action();
    }
  } else {
    // Signed out
    currentStorage = null;
    userIndicator.hidden = true;
    userAvatar.src = '';
    userName.textContent = '';

    // Clear dropdowns
    document.getElementById('project-select').innerHTML = '<option value="">— New project —</option>';
    document.getElementById('stock-select').innerHTML = '<option value="">— New list —</option>';
  }
}

/**
 * Gate a save action on auth. If signed in, execute immediately.
 * If not, show sign-in modal and execute after sign-in.
 */
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

// --- Import/Export (no auth needed — local file operations) ---
document.getElementById('btn-export').addEventListener('click', async () => {
  // Export from Firestore if signed in, otherwise nothing to export
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
  // Start with one empty row in each table
  addPieceRow(piecesBody);
  addStockRow(stockBody);

  // Try to initialize auth in the background (checks if user was previously signed in)
  import('./auth.js').then(async ({ initAuth, onAuthStateChanged }) => {
    onAuthStateChanged(handleAuthStateChanged);
    await initAuth();
  }).catch(() => {
    // Firebase unavailable — app works without auth
    console.warn('Firebase unavailable — running without cloud save');
  });
}

init();
```

- [ ] **Step 2: Verify the app loads in browser**

Open http://localhost:8070 and confirm:
- Page loads without errors
- Pieces and stock tables render with empty rows
- Optimize button works
- Save button shows sign-in modal (since not signed in)

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "Rewrite app.js for auth-aware async storage"
```

---

### Task 5: Firestore security rules

**Files:**
- Create: `firestore.rules`

- [ ] **Step 1: Create firestore.rules**

Create `firestore.rules`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add firestore.rules
git commit -m "Add Firestore security rules"
```

---

### Task 6: Firebase project setup and end-to-end test

**Files:**
- Modify: `js/firebase-config.js` (fill in real credentials)

This task requires manual Firebase console setup.

- [ ] **Step 1: Create Firebase project**

1. Go to https://console.firebase.google.com
2. Click "Add project", name it "cutwise" (or similar)
3. Disable Google Analytics (not needed)
4. Click "Create project"

- [ ] **Step 2: Enable Google sign-in**

1. In Firebase Console → Authentication → Sign-in method
2. Click "Google" → Enable → set project support email → Save

- [ ] **Step 3: Create Firestore database**

1. In Firebase Console → Firestore Database → Create database
2. Select "Start in production mode"
3. Choose a region (us-central1 is fine)
4. After creation, go to Rules tab
5. Replace the default rules with the content from `firestore.rules`
6. Click "Publish"

- [ ] **Step 4: Add web app and get config**

1. In Firebase Console → Project Settings → Your apps
2. Click the web icon (`</>`) to add a web app
3. Name it "CutWise", don't enable Firebase Hosting
4. Copy the `firebaseConfig` object
5. Paste it into `js/firebase-config.js`, replacing the placeholders

- [ ] **Step 5: Add GitHub Pages domain to authorized domains**

1. In Firebase Console → Authentication → Settings → Authorized domains
2. Add `sadjadtavakoli.github.io`

- [ ] **Step 6: Test end-to-end**

1. Open http://localhost:8070
2. Click "Save" on a project → sign-in modal should appear
3. Click "Sign in with Google" → Google popup → sign in
4. Modal closes, user indicator appears in header
5. Enter a project name and click Save → should succeed
6. Refresh the page → project should appear in dropdown
7. Open on a different device/browser, sign in → same projects should appear
8. Click "Sign out" → user indicator disappears, dropdowns empty

- [ ] **Step 7: Commit real config and push**

```bash
git add js/firebase-config.js
git commit -m "Add Firebase project credentials"
git push
```
