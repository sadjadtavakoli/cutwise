import assert from 'node:assert/strict';
import { createStorage } from '../js/storage.js';

function mockLocalStorage() {
  const store = {};
  return {
    getItem(key) { return store[key] ?? null; },
    setItem(key, value) { store[key] = String(value); },
    removeItem(key) { delete store[key]; },
    get length() { return Object.keys(store).length; },
    key(i) { return Object.keys(store)[i] ?? null; },
    clear() { for (const k in store) delete store[k]; },
  };
}

// Save and load a project
{
  const ls = mockLocalStorage();
  const storage = createStorage(ls);
  const project = { name: 'Bookshelf', pieces: [{ name: 'Shelf', length: 36, width: 8, thickness: 0.75, quantity: 3, canGlueWidth: true, grainSensitive: false }] };
  storage.saveProject('Bookshelf', project);
  const loaded = storage.loadProject('Bookshelf');
  assert.deepEqual(loaded, project);
}

// List projects
{
  const ls = mockLocalStorage();
  const storage = createStorage(ls);
  storage.saveProject('A', { name: 'A', pieces: [] });
  storage.saveProject('B', { name: 'B', pieces: [] });
  const names = storage.listProjects();
  assert.ok(names.includes('A'));
  assert.ok(names.includes('B'));
}

// Delete project
{
  const ls = mockLocalStorage();
  const storage = createStorage(ls);
  storage.saveProject('A', { name: 'A', pieces: [] });
  storage.deleteProject('A');
  assert.equal(storage.loadProject('A'), null);
}

// Save and load stock list
{
  const ls = mockLocalStorage();
  const storage = createStorage(ls);
  const stockList = { name: 'Home Depot', items: [{ name: '2x4 8ft', type: 'dimensional', length: 96, width: 3.5, thickness: 1.5, price: 4.50, quantity: null }] };
  storage.saveStockList('Home Depot', stockList);
  const loaded = storage.loadStockList('Home Depot');
  assert.deepEqual(loaded, stockList);
}

// List stock lists
{
  const ls = mockLocalStorage();
  const storage = createStorage(ls);
  storage.saveStockList('HD', { name: 'HD', items: [] });
  storage.saveStockList('Lowes', { name: 'Lowes', items: [] });
  const names = storage.listStockLists();
  assert.ok(names.includes('HD'));
  assert.ok(names.includes('Lowes'));
}

// Export all data
{
  const ls = mockLocalStorage();
  const storage = createStorage(ls);
  storage.saveProject('A', { name: 'A', pieces: [] });
  storage.saveStockList('HD', { name: 'HD', items: [] });
  const exported = storage.exportAll();
  assert.ok(typeof exported === 'string');
  const parsed = JSON.parse(exported);
  assert.ok(parsed.projects);
  assert.ok(parsed.stockLists);
}

// Import data
{
  const ls = mockLocalStorage();
  const storage = createStorage(ls);
  const data = JSON.stringify({ projects: { A: { name: 'A', pieces: [] } }, stockLists: { HD: { name: 'HD', items: [] } } });
  storage.importAll(data);
  assert.deepEqual(storage.loadProject('A'), { name: 'A', pieces: [] });
  assert.deepEqual(storage.loadStockList('HD'), { name: 'HD', items: [] });
}

// Save and load constraints
{
  const ls = mockLocalStorage();
  const storage = createStorage(ls);
  const c = { kerfWidth: 0.1, minGlueStripWidth: 3, maxGlueJoints: 2, overageMargin: 0.25 };
  storage.saveConstraints(c);
  const loaded = storage.loadConstraints();
  assert.deepEqual(loaded, c);
}

console.log('test-storage: all passed');
