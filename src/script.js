import { createStore } from "./core/store.js";
import { reducer, initialState, ACTIONS } from "./core/reducer.js";
import { loadState, saveState } from "./persistence/storage.js";
import { mountApp } from "./ui/appView.js";
import { DEFAULT_ACCOUNTS, DEFAULT_TXN_TYPES, DEFAULT_CATEGORIES } from "./domain/catalogs.js";
import { isoToday } from "./domain/expenseModel.js";

function buildCatalogs() {
  return {
    accounts: DEFAULT_ACCOUNTS,
    txnTypes: DEFAULT_TXN_TYPES,
    categories: DEFAULT_CATEGORIES,
  };
}

const root = document.getElementById("app");
const nowISO = isoToday();

const store = createStore({
  reducer,
  initialState: initialState(nowISO),
});

// attach catalogs
store.dispatch({
  type: ACTIONS.HYDRATE,
  payload: {
    schemaVersion: 1,
    catalogs: buildCatalogs(),
    settings: { activeMonth: nowISO.slice(0, 7) },
    txns: { byId: {}, allIds: [] },
  },
});

// load persisted state (if any)
const persisted = loadState();
if (persisted) {
  store.dispatch({ type: ACTIONS.HYDRATE, payload: persisted });
  // ensure catalogs exist even if older state
  const s = store.getState();
  if (!s.catalogs) {
    store.dispatch({ type: ACTIONS.HYDRATE, payload: { catalogs: buildCatalogs() } });
  }
}

let saveTimer = null;
store.subscribe((state, prev, action) => {
  // Persist only when txns/settings/catalogs change; skip noisy draft typing.
  if (action.type.startsWith("DRAFT_") || action.type === ACTIONS.SET_ERRORS) return;

  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveState(state), 150);
});

mountApp({ root, store });

// debug helpers
window.__store = store;
