let db = null;

async function getDb() {
  if (db) return db;
  const { getFirestore } = await import('firebase/firestore');
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
