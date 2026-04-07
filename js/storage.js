const PREFIX = 'cutwise_';
const PROJECT_PREFIX = PREFIX + 'project_';
const STOCK_PREFIX = PREFIX + 'stock_';
const CONSTRAINTS_KEY = PREFIX + 'constraints';

export function createStorage(localStorage) {
  return {
    saveProject(name, project) {
      localStorage.setItem(PROJECT_PREFIX + name, JSON.stringify(project));
    },

    loadProject(name) {
      const data = localStorage.getItem(PROJECT_PREFIX + name);
      return data ? JSON.parse(data) : null;
    },

    deleteProject(name) {
      localStorage.removeItem(PROJECT_PREFIX + name);
    },

    listProjects() {
      const names = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(PROJECT_PREFIX)) {
          names.push(key.slice(PROJECT_PREFIX.length));
        }
      }
      return names;
    },

    saveStockList(name, stockList) {
      localStorage.setItem(STOCK_PREFIX + name, JSON.stringify(stockList));
    },

    loadStockList(name) {
      const data = localStorage.getItem(STOCK_PREFIX + name);
      return data ? JSON.parse(data) : null;
    },

    deleteStockList(name) {
      localStorage.removeItem(STOCK_PREFIX + name);
    },

    listStockLists() {
      const names = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(STOCK_PREFIX)) {
          names.push(key.slice(STOCK_PREFIX.length));
        }
      }
      return names;
    },

    saveConstraints(constraints) {
      localStorage.setItem(CONSTRAINTS_KEY, JSON.stringify(constraints));
    },

    loadConstraints() {
      const data = localStorage.getItem(CONSTRAINTS_KEY);
      return data ? JSON.parse(data) : null;
    },

    exportAll() {
      const projects = {};
      const stockLists = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(PROJECT_PREFIX)) {
          projects[key.slice(PROJECT_PREFIX.length)] = JSON.parse(localStorage.getItem(key));
        } else if (key.startsWith(STOCK_PREFIX)) {
          stockLists[key.slice(STOCK_PREFIX.length)] = JSON.parse(localStorage.getItem(key));
        }
      }
      const constraints = this.loadConstraints();
      return JSON.stringify({ projects, stockLists, constraints }, null, 2);
    },

    importAll(jsonString) {
      const data = JSON.parse(jsonString);
      if (data.projects) {
        for (const [name, project] of Object.entries(data.projects)) {
          this.saveProject(name, project);
        }
      }
      if (data.stockLists) {
        for (const [name, stockList] of Object.entries(data.stockLists)) {
          this.saveStockList(name, stockList);
        }
      }
      if (data.constraints) {
        this.saveConstraints(data.constraints);
      }
    },
  };
}
